# Current scope — external referral portal

Effective September 6, 2026, the user's external-vendor instruction supersedes earlier direct retail checkout, MGT fulfillment, refunds, supplier transfers and consumer membership billing plans.

The current shop provides six independent external storefront links, regional/beauty-focus filters, and saved retailer lists. Vendor-of-record billing, shipping and return responsibilities are explained in the shop, purchase-help and shipping pages. No partnership, fee or quality certification is claimed from a directory listing.

The API blocks all prior checkout, cart, fulfillment, refund, payout, Connect-onboarding, consumer membership billing and Stripe webhook entry points. Old code and records remain preserved behind these gates; they are not an active commerce system. Direct links contain no affiliate identifier or customer-profile data. The portal records only daily aggregate outbound-open and saved-list-change counts; these do not establish unique visitors, retailer purchases, conversion, revenue or profit.

Business strategy and fee-agreement preparation are in business/OPERATING-MODEL-AND-GTM.md and business/PARTNER-AGREEMENT-TEMPLATE.json. Rates and tiers remain TBD and no fee collection is enabled.

Validation: API compilation, the production web build, and the referral integration suite passed. The running preview returned HTTP 200 and exposes external_referral with consumer_checkout false. Tests cover allowed destinations, saved-list ownership, aggregate-measurement authorization and privacy, request protection, and blocked commerce without payment SDK calls.

Replenishment reminders now create durable in-portal alerts when the operations worker is running; the alert only prompts a review and never creates an order or sends retailer data. Remaining: live account and AI provider validation, production administration, approved matching data, company/legal details, negotiated agreements, authorized commercial attribution, browser testing and hosting integration. This remains a local development preview.

AI routing is local-first: Ollama serves routine traffic, DeepSeek and OpenClaw remain local fallbacks, and GPT-5.6 Sol is an optional, entitlement-gated escalation. LangChain Core provides the bounded prompt pipeline; routing telemetry and daily spend counters persist in the same Supabase/Postgres store as the portal.


September 7 update: consumer and vendor subscription infrastructure is now separately prepared under /api/hub/billing and /webhooks/subscriptions. Both prices and benefits remain TBD and billing defaults off. /membership is now Plans & Billing. Product commerce remains blocked. See infra/portal/README.md for setup and tab coverage. New administration pages use verified sessions.
