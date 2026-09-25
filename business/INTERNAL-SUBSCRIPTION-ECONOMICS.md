# INTERNAL ONLY — Subscription economics assumptions

Do not publish, serve, import into the client bundle, or use as customer-facing copy.

## Assumptions

All figures below are planning assumptions, not observed production costs. They exclude payment processing, support, infrastructure, taxes, customer acquisition, and overhead. Refresh them with measured data before launch.

| Plan | Monthly price | Annual price | Included requests | Assumed variable cost / request | Assumed variable cost at included use | Assumed gross margin before shared operating costs | Break-even requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Essential | $49 | $529 | 250 | $0.018 | $4.50 | $44.50 / 90.8% | 2,722 |
| Guided | $129 | $1,390 | 900 | $0.035 | $31.50 | $97.50 / 75.6% | 3,686 |
| Studio | $349 | $3,690 | 2,500 | $0.050 | $125.00 | $224.00 / 64.2% | 6,980 |

Annual plans assume the same monthly usage allocation and an approximately 10–12% discount: Essential $529/year, Guided $1,390/year, Studio $3,690/year.

## Full-cost launch stress test

All figures below are assumptions. The stress test assumes 50 paying subscribers, $2,300 per month in shared hosting and operating costs, a $30 / $50 / $70 plan-weighted allocation of that shared cost, a support reserve, and domestic card processing of 2.9% + $0.30 per successful payment.

| Plan | Assumed variable cost at cap | Assumed payment cost | Assumed support reserve | Assumed shared operations allocation | Assumed total cost | Assumed monthly contribution | Assumed contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Essential | $4.50 | $1.72 | $3.00 | $30.00 | $39.22 | $9.78 | 20.0% |
| Guided | $31.50 | $4.04 | $6.00 | $50.00 | $91.04 | $37.96 | 29.4% |
| Studio | $125.00 | $10.42 | $10.00 | $70.00 | $215.42 | $133.58 | 38.3% |

The annual prices remain contribution-positive under the same assumptions, but carry lower margins because of the annual discount. Recalculate this table whenever subscriber count, actual request complexity, support load, payment mix, or operating costs change.

## Formulae

- Assumed included-use cost = included requests × assumed variable cost per request.
- Assumed gross margin = plan price − assumed included-use cost.
- Break-even requests = plan price ÷ assumed variable cost per request.
- A plan becomes unprofitable on contribution margin once usage exceeds its break-even request count, before excluded operating costs.

## Overage package guardrails

All figures are assumptions. Price each pack above its estimated variable cost with room for the excluded operating costs.

| Plan | Package | Customer price | Assumed variable cost | Assumed contribution before excluded costs |
| --- | --- | ---: | ---: | ---: |
| Essential | 100 requests | $19 | $1.80 | $17.20 |
| Guided | 250 requests | $59 | $8.75 | $50.25 |
| Studio | 750 requests | $159 | $37.50 | $121.50 |

## Launch controls

- Validate actual per-request cost, retry rate, and demand distribution weekly during the first launch cohort.
- Keep customer messaging outcome-led; no cost figures, internal routing names, or vendor names belong in the client experience.
- Revisit plan prices or included usage if observed contribution margin falls below the launch target after excluded costs are included.
