'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BillingActivity } from '../../components/BillingActivity';
import { hub, useHub } from '../../lib/hub';
import { AppFrame, LoadState } from '../../components/HubFrames';
import styles from './membership.module.css';

type Plan = {
  id: 'essential' | 'personalized' | 'professional'; name: string; audience: 'consumer' | 'vendor';
  summary: string; best_for: string; features: string[]; comparison: Record<string, string>;
  provisional: true; pricing: null | { amount: number; currency: string; interval: string };
  pricing_status: 'pending' | 'needs_review' | 'configured'; enrollment_open: boolean;
};

const planIds = ['essential', 'personalized', 'professional'] as const;
const planNames: Record<string, string> = { essential: 'Essential', personalized: 'Personalized', professional: 'Professional' };
const isPlanId = (value: string | null): value is typeof planIds[number] => !!value && planIds.includes(value as typeof planIds[number]);
const formatPrice = (pricing: Plan['pricing']) => pricing ? new Intl.NumberFormat(undefined, { style: 'currency', currency: pricing.currency }).format(pricing.amount / 100) + (pricing.interval === 'year' ? ' / year' : ' / month') : 'Pricing pending';

export default function Membership() {
  const [planId, setPlanId] = useState<typeof planIds[number]>('essential');
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const catalog = useHub('/billing/plans?cycle=' + cycle);
  const state = useHub('/billing?plan=' + planId + '&cycle=' + cycle);
  const session = useHub('/session');
  const selected = useMemo<Plan | undefined>(() => catalog.data?.plans?.find((plan: Plan) => plan.id === planId), [catalog.data, planId]);
  const audience = selected?.audience || (planId === 'professional' ? 'vendor' : 'consumer');
  const data = state.data?.plan_id === planId && state.data?.cycle === cycle ? state.data : null;
  const recommendation = catalog.data?.recommendation;
  const currentPlanName = planNames[data?.subscription?.plan_id] || 'an earlier plan';
  const enrollmentOpen = selected?.enrollment_open === true && data?.configured === true;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isPlanId(params.get('plan'))) setPlanId(params.get('plan') as typeof planIds[number]);
    else if (params.get('audience') === 'vendor') setPlanId('professional');
    else if (params.get('audience') === 'consumer') setPlanId('personalized');
    if (params.get('cycle') === 'annual') setCycle('annual');
    if (!params.has('checkout') && !params.has('billing')) return;
    setNotice('Checking for confirmed billing updates. This may take a moment.');
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      state.reload();
      attempts++;
      if (attempts >= 6) {
        window.clearInterval(timer);
        setNotice('Automatic refresh finished. Review the status below or refresh again if the billing service is still confirming your update.');
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [state.reload]);

  function choosePlan(id: typeof planIds[number]) {
    setPlanId(id); setConsent(false); setNotice(''); setError('');
  }

  async function billing(action: string) {
    setBusy(true); setError('');
    try {
      const result = await hub('/billing/' + action, { plan: planId, cycle, recurring_consent: consent });
      if (action === 'discard-checkout') {
        setNotice('Unfinished checkout discarded. Choose your plan and billing cycle, then continue.');
        setConsent(false); state.reload(); setBusy(false); return;
      }
      if (action === 'trial-cycle') {
        setNotice('Plan and billing cycle update requested. Your original trial end date is unchanged until confirmation arrives.');
        state.reload(); setBusy(false); return;
      }
      const url = new URL(result.url);
      if (url.protocol !== 'https:') throw Error('Billing returned an invalid destination.');
      window.location.assign(url.href);
    } catch (caught) {
      setError((caught as Error).message); setBusy(false);
    }
  }

  return <AppFrame title="Plans & Billing">
    <p className="lead">Compare three draft membership options and review confirmed subscription activity.</p>
    <p>Plan names, benefits, limits, and pricing are placeholders while the final offer is reviewed. Retail purchases remain with external retailers.</p>

    <fieldset className="filters flow-fieldset" disabled={busy} aria-describedby={error ? 'membership-error' : undefined}><legend className="sr-only">Billing cycle</legend>
      {(['monthly', 'annual'] as const).map(item => <button type="button" key={item} aria-pressed={cycle === item} onClick={() => { setCycle(item); setConsent(false); setNotice(''); setError(''); }}>
        {item === 'monthly' ? 'Monthly view' : 'Annual view'}
      </button>)}
    </fieldset>

    <LoadState {...catalog} retry={catalog.reload} />
    {catalog.data && <>
      <section aria-labelledby="plan-options-heading">
        <div className="section-heading"><div><span className="eyebrow">PROVISIONAL OPTIONS</span><h2 id="plan-options-heading">Choose a plan to review</h2></div><p className="muted">Selection alone never starts a subscription.</p></div>
        <div className={styles.planGrid}>
          {catalog.data.plans.map((plan: Plan) => <article className={styles.planCard + (plan.id === planId ? ' ' + styles.selected : '')} key={plan.id} aria-labelledby={'plan-' + plan.id}>
            <div className="row"><span className="pill">Draft plan</span>{recommendation?.plan_id === plan.id && <span className={styles.planMatch}>Suggested</span>}</div>
            <h3 id={'plan-' + plan.id}>{plan.name}</h3>
            <p className={styles.planPrice}>{formatPrice(plan.pricing)}</p>
            <p>{plan.summary}</p>
            <p className="muted"><strong>Proposed for:</strong> {plan.best_for}</p>
            <ul>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
            <button className={plan.id === planId ? 'button primary' : 'button'} type="button" aria-pressed={plan.id === planId} onClick={() => choosePlan(plan.id)}>{plan.id === planId ? 'Selected for review' : 'Review this plan'}</button>
          </article>)}
        </div>
      </section>
      {recommendation && <p className="notice" role="status"><strong>Suggested starting point: {planNames[recommendation.plan_id]}.</strong> {recommendation.reason} This uses transparent portal rules and your saved routine and budget preferences when available; it does not call a paid model or enroll you automatically.</p>}
      <section className="panel" aria-labelledby="comparison-heading">
        <h2 id="comparison-heading">Draft plan comparison</h2>
        <p>These entries organize the proposed offer for review. They are not final entitlements or service commitments.</p>
        <div className="table-wrap"><table><caption className="sr-only">Comparison of the three provisional MGT membership plans</caption><thead><tr><th scope="col">Capability</th>{catalog.data.plans.map((plan: Plan) => <th scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>{catalog.data.comparison_rows.map((row: { id: string; label: string }) => <tr key={row.id}><th scope="row">{row.label}</th>{catalog.data.plans.map((plan: Plan) => <td key={plan.id}>{plan.comparison[row.id]}</td>)}</tr>)}</tbody></table></div>
      </section>
    </>}

    <p className="notice">If an approved plan opens, eligible new subscribers can begin with a 14-day trial. A payment method is collected during checkout and recurring billing starts after the trial unless renewal is turned off. Returning subscribers who already used a trial are not offered another one.</p>
    {notice && <p className="notice success" role="status">{notice}</p>}
    <LoadState {...state} retry={state.reload} />
    {error && <p id="membership-error" className="notice error" role="alert">{error}</p>}
    {data && <section className="panel" aria-labelledby="selected-plan-heading" aria-busy={busy} aria-describedby={error ? 'membership-error' : undefined}>
      <span className="eyebrow">SELECTED PLAN</span>
      <h2 id="selected-plan-heading">{selected?.name || data.offer?.name}: {data.plan ? formatPrice(data.plan) : 'Pricing pending'}</h2>
      {data.subscription?.plan_id && data.subscription.plan_id !== planId && <p className="notice">Your confirmed subscription is currently associated with {currentPlanName}. Use Manage billing to review approved changes.</p>}
      {data.subscription?.trial_end && <p>Trial ends: <time dateTime={new Date(data.subscription.trial_end * 1000).toISOString()}>{new Date(data.subscription.trial_end * 1000).toLocaleString()}</time></p>}
      {data.subscription?.current_period_end && <p>{data.subscription.cancel_at_period_end ? 'Service ends' : 'Current period ends'}: <time dateTime={new Date(data.subscription.current_period_end * 1000).toISOString()}>{new Date(data.subscription.current_period_end * 1000).toLocaleString()}</time></p>}
      <p>Cancellation takes effect at the end of the current billing period. Paid plan changes may incur prorated charges; review them in the billing service before confirming.</p>
      {data.subscription && <p role="status" aria-live="polite" aria-atomic="true">Status: <strong>{({ trialing: 'Trial active', active: 'Active', past_due: 'Payment overdue', unpaid: 'Payment required', canceled: 'Ended', incomplete: 'Payment incomplete', incomplete_expired: 'Signup expired', paused: 'Paused' } as Record<string, string>)[data.subscription.status] || data.subscription.status}</strong>{data.subscription.cancel_at_period_end ? ' · Renewal turned off' : ''}</p>}
      {['past_due', 'unpaid', 'incomplete'].includes(data.subscription?.status) && <p className="notice error">Your subscription needs payment attention. Use Manage billing to review your payment details.</p>}
      {data.subscription?.cancel_at_period_end && <p className="notice">Renewal is turned off. Service continues until the end date shown above.</p>}
      {!enrollmentOpen && <p className="notice">Enrollment for this draft plan is closed until pricing, benefits, terms, and payment configuration are approved. No charge can be started from this page.</p>}
      <p>Returning from the billing service does not activate access. Only a confirmed signed billing update can change subscription status.</p>
      <button className="text-button" disabled={state.loading || busy} onClick={state.reload}>Refresh billing status</button>
      {!session.data?.account ? <Link className="button" href="/account">Sign in to manage subscriptions</Link> : <>
        {data.pending_checkout && <div className="notice"><p>You have an unfinished checkout. Discard it before choosing a different plan or billing cycle. This does not cancel an active subscription.</p><button className="button" disabled={busy} onClick={() => void billing('discard-checkout')}>Discard unfinished checkout</button></div>}
        {data.can_manage && <button className="button" disabled={busy || !data.configured} onClick={() => void billing('portal')}>Manage billing, invoices, and payment methods</button>}
        {((!data.subscription?.status || ['canceled', 'incomplete_expired'].includes(data.subscription.status)) || (data.subscription?.status === 'trialing' && !data.subscription.cancel_at_period_end)) && <>
          <label className="check-label"><input type="checkbox" checked={consent} disabled={!enrollmentOpen || busy} onChange={event => setConsent(event.target.checked)} />I agree to the displayed recurring rate after any eligible trial ends, and to the subscription terms.</label>
          <div className="actions"><Link className="text-link" href="/terms">Read terms</Link><button className="button primary" disabled={busy || !consent || !enrollmentOpen} onClick={() => void billing(data.subscription?.status === 'trialing' ? 'trial-cycle' : 'checkout')}>{busy ? 'Please wait…' : data.subscription?.status === 'trialing' ? 'Request plan or cycle change' : data.trial_eligible ? 'Start 14-day trial' : 'Continue to billing'}</button></div>
        </>}
      </>}
    </section>}
    {session.data?.account && <BillingActivity key={audience} audience={audience} />}
  </AppFrame>;
}
