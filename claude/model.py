"""Section N financial model — MGT Skin Care v2. All figures USD. Assumptions are explicit and printed."""
from dataclasses import dataclass, asdict
import json

@dataclass
class Scenario:
    name: str
    # unit economics
    aov: float = 45.0
    product_gm: float = 0.35              # after wholesale, processing, shipping (v1)
    premium_price: float = 14.99
    annual_share: float = 0.25            # share of subs on annual ($149.99)
    mobile_share: float = 0.60            # share of subs bought via IAP
    iap_take: float = 0.15                # Apple/Google small-business rate [assumption]
    stripe_pct: float = 0.029; stripe_fixed: float = 0.30
    ai_cost_per_sub_month: float = 0.25   # Tier-1 + expected Tier-3 usage
    ai_cost_per_free_user_month: float = 0.012
    monthly_retention: float = 0.80
    sm_to_purchase: float = 0.08          # Skin Match completions → first purchase
    attach: float = 0.08                  # purchasers → Premium
    repeat_orders_year: float = 1.0       # non-sub repeat orders / year
    sub_extra_orders_year: float = 2.0    # sub repeat orders / year (replenishment)
    cac: float = 18.0                     # per purchaser
    # volumes
    purchasers_by_m6: int = 3500          # cumulative paying customers at end of month 6
    monthly_new_purchasers_m7_12: int = 1750
    # six-month costs (one-time + monthly*6)
    dev: float = 166000
    infra_m: float = 900; infra_m6: float = 2500
    saas_m: float = 400; saas_once: float = 500
    payments_tools_m: float = 200; payments_once: float = 500
    security_m: float = 150; security_once: float = 1000
    legal_once: float = 18000; legal_m: float = 500
    design_once: float = 4000
    marketing_once: float = 3000; marketing_m: float = 3000
    support_m: float = 800
    fulfillment_ops_m: float = 200
    contingency: float = 0.10
    post_launch_dev_m: float = 12000      # maintenance run-rate months 7–12

def unit(s: Scenario):
    monthly_eff = s.premium_price * (1 - s.annual_share) + (149.99 / 12) * s.annual_share
    web_fee = s.stripe_pct + s.stripe_fixed / monthly_eff
    blended_take = s.mobile_share * s.iap_take + (1 - s.mobile_share) * web_fee
    sub_gp_m = monthly_eff * (1 - blended_take) - s.ai_cost_per_sub_month
    lifetime = 1 / (1 - s.monthly_retention)
    sub_ltv = sub_gp_m * lifetime
    order_gp = s.aov * s.product_gm
    nonsub_ltv = order_gp * (1 + s.repeat_orders_year)
    sub_customer_ltv = order_gp * (1 + s.sub_extra_orders_year) + sub_ltv
    blended_ltv = (1 - s.attach) * nonsub_ltv + s.attach * sub_customer_ltv
    return dict(monthly_eff=monthly_eff, blended_take=blended_take, sub_gp_m=sub_gp_m, lifetime=lifetime,
                sub_ltv=sub_ltv, order_gp=order_gp, nonsub_ltv=nonsub_ltv, sub_customer_ltv=sub_customer_ltv,
                blended_ltv=blended_ltv, ltv_cac=blended_ltv / s.cac, first_order_net=order_gp - s.cac)

def six_month_costs(s: Scenario):
    infra = sum(s.infra_m + (s.infra_m6 - s.infra_m) * i / 5 for i in range(6))
    lines = {
        'Development': s.dev,
        'AI API usage': 6 * 150 if s.name == 'LEAN' else (6 * 300 if s.name == 'BASE' else 6 * 500),
        'Hosting/DB/storage': infra,
        'Payments tooling': s.payments_once + 6 * s.payments_tools_m,
        'SaaS': s.saas_once + 6 * s.saas_m,
        'Security/compliance tooling': s.security_once + 6 * s.security_m,
        'Legal & compliance': s.legal_once + 6 * s.legal_m,
        'Design': s.design_once,
        'Marketing': s.marketing_once + 6 * s.marketing_m,
        'Support': 6 * s.support_m,
        'Fulfillment ops': 6 * s.fulfillment_ops_m,
    }
    sub = sum(lines.values()); lines['Contingency (10%)'] = sub * s.contingency
    lines['TOTAL'] = sub * (1 + s.contingency)
    return lines

def twelve_month(s: Scenario):
    """Months 1-12. Launch at month 5 (week 17). Purchasers ramp: m5 = 30% of m6 target, m6 = 70%."""
    u = unit(s)
    rows = []; cum_gp = 0; cum_cost = 0; subs = 0.0; cum_purch = 0
    costs6 = six_month_costs(s)
    six_month_total = costs6['TOTAL']
    for m in range(1, 13):
        if m <= 4: new = 0
        elif m == 5: new = int(s.purchasers_by_m6 * 0.3)
        elif m == 6: new = s.purchasers_by_m6 - int(s.purchasers_by_m6 * 0.3)
        else: new = s.monthly_new_purchasers_m7_12
        cum_purch += new
        # revenue components this month
        first_gp = new * u['order_gp']
        repeat_gp = cum_purch * ((1 - s.attach) * s.repeat_orders_year + s.attach * s.sub_extra_orders_year) / 12 * u['order_gp']
        subs = subs * s.monthly_retention + new * s.attach
        sub_gp = subs * u['sub_gp_m']
        cac_cost = new * s.cac
        gp = first_gp + repeat_gp + sub_gp
        if m <= 6:
            cost = six_month_total / 6 + cac_cost - (costs6['Marketing'] / 6 if new else 0)  # CAC replaces marketing line once acquiring
        else:
            infra = s.infra_m6 * (1 + 0.05 * (m - 6))
            cost = s.post_launch_dev_m + infra + s.saas_m + s.payments_tools_m + s.security_m + s.legal_m + s.support_m * 1.5 + s.fulfillment_ops_m + cac_cost + s.ai_cost_per_free_user_month * cum_purch * 3
        cum_gp += gp; cum_cost += cost
        rows.append(dict(month=m, new_purchasers=new, cum_purchasers=cum_purch, active_subs=round(subs), gross_profit=round(gp), cost=round(cost), net=round(gp - cost), cum_net=round(cum_gp - cum_cost)))
    op_be = next((r['month'] for r in rows if r['month'] > 4 and r['net'] >= 0), None)
    return rows, op_be

scenarios = {
    'LEAN': Scenario('LEAN', dev=110000, infra_m=250, infra_m6=900, saas_m=150, saas_once=200, payments_tools_m=100, payments_once=0,
                     security_m=50, security_once=300, legal_once=8000, legal_m=0, design_once=2000, marketing_once=500, marketing_m=300,
                     support_m=100, fulfillment_ops_m=100, purchasers_by_m6=1500, monthly_new_purchasers_m7_12=750, cac=12.0,
                     sm_to_purchase=0.06, attach=0.06, post_launch_dev_m=7000),
    'BASE': Scenario('BASE'),
    'GROWTH': Scenario('GROWTH', dev=215000, infra_m=1500, infra_m6=4000, saas_m=600, saas_once=1000, payments_tools_m=300, payments_once=1000,
                       security_m=250, security_once=2000, legal_once=22000, legal_m=800, design_once=7000, marketing_once=8000, marketing_m=8000,
                       support_m=2000, fulfillment_ops_m=400, purchasers_by_m6=6000, monthly_new_purchasers_m7_12=3000, cac=22.0,
                       monthly_retention=0.85, attach=0.10, sm_to_purchase=0.10, post_launch_dev_m=18000),
}

if __name__ == '__main__':
    out = {}
    for k, s in scenarios.items():
        u = unit(s); c = six_month_costs(s); rows, be = twelve_month(s)
        out[k] = dict(assumptions=asdict(s), unit=u, costs=c, months=rows, operating_breakeven_month=be)
    # sensitivities on BASE
    base = scenarios['BASE']; sens = {}
    for cac in (9, 18, 27):
        s2 = Scenario('BASE', cac=cac); sens[f'cac_{cac}'] = unit(s2)['ltv_cac']
    for ret in (0.70, 0.80, 0.85):
        s2 = Scenario('BASE', monthly_retention=ret); sens[f'ret_{ret}'] = unit(s2)['blended_ltv']
    for att in (0.05, 0.08, 0.12):
        s2 = Scenario('BASE', attach=att); sens[f'attach_{att}'] = unit(s2)['blended_ltv']
    for price in (9.99, 14.99):
        s2 = Scenario('BASE', premium_price=price, annual_share=0 if price == 9.99 else 0.25); sens[f'price_{price}'] = unit(s2)
    out['sensitivity'] = sens
    json.dump(out, open('model_out.json', 'w'), indent=1, default=float)
    for k in scenarios:
        u = out[k]['unit']; c = out[k]['costs']
        print(f"\n== {k} ==  6-mo total ${c['TOTAL']:,.0f}  dev ${c['Development']:,.0f}")
        print(f" sub GP/mo ${u['sub_gp_m']:.2f}  lifetime {u['lifetime']:.1f}mo  sub LTV ${u['sub_ltv']:.2f}  order GP ${u['order_gp']:.2f}")
        print(f" blended LTV/purchaser ${u['blended_ltv']:.2f}  LTV/CAC {u['ltv_cac']:.2f}  op break-even month {out[k]['operating_breakeven_month']}")
        for r in out[k]['months']:
            print(f"  m{r['month']:>2} new {r['new_purchasers']:>5} cum {r['cum_purchasers']:>6} subs {r['active_subs']:>5} GP ${r['gross_profit']:>7,} cost ${r['cost']:>7,} net ${r['net']:>8,} cum ${r['cum_net']:>9,}")
    print('\nSENS', json.dumps({k: (round(v, 2) if isinstance(v, float) else {kk: round(vv, 2) for kk, vv in v.items()}) for k, v in sens.items()}, indent=1))
