# Backend and subscription infrastructure — September 7, 2026

The phased build, test and production-readiness program is maintained in [`BUILD-READINESS-GUIDE.md`](../../BUILD-READINESS-GUIDE.md).

## Implemented
- Existing customer tabs use /api/hub: profile/matching, routine simplification, saved retailer destinations, reminders, knowledge, coach, session/account, and support.
- Administration pages now call the same verified-session API. A typed user ID no longer supplies identity. Roles must be provisioned in the accounts record by an operator. No public role-grant endpoint exists.
- Consumer and vendor subscription placements share /membership but have separate Stripe Price IDs, customer records, checkout attempts, and status records.
- Product checkout, payouts, refunds and vendor transfers remain blocked. Buying a vendor subscription does not establish a commercial partnership or publish a listing.
- Subscription pricing and paid feature entitlements remain TBD. No existing tab is paywalled, and no paid benefits are promised yet.

## Stripe setup
1. Use a Stripe sandbox/test account first. Create separate recurring consumer and vendor Prices after prices and benefits are approved.
2. Set STRIPE_CONSUMER_PRICE_ID and STRIPE_VENDOR_PRICE_ID. Set STRIPE_SECRET_KEY server-side only.
3. Configure the Stripe customer portal for payment methods, invoices and cancellation. Set business identity and terms URL in Stripe.
4. Register /webhooks/subscriptions on the API (the included edge configuration forwards it). Subscribe to checkout.session.completed and customer.subscription.created, updated and deleted. Store its signing secret in STRIPE_SUBSCRIPTION_WEBHOOK_SECRET.
5. Finalize company legal_name, support_email and policies_published in settings/company, then set SUBSCRIPTION_TERMS_APPROVED=true and SUBSCRIPTIONS_ENABLED=true.
6. Test checkout, decline, renewal failure, cancellation, portal access and replayed events in the sandbox before configuring live credentials. Browser return URLs never activate access.

Current local tests use a mocked Stripe client with real signature verification. No Stripe account has been provisioned, prices created, payments collected, or live webhooks validated.

## Deployment scaffold
Copy infra/portal/env.example to infra/portal/.env and fill service values outside source control. DATABASE_URL must identify the reviewed Supabase database, use verified TLS, and URI-encode reserved characters in credentials. API and worker use the same external database. Compose no longer provisions an independent database; existing local database volumes have not been deleted. Only the TLS edge publishes host ports. API refuses demo mode or HTTP public origins in production. Web-to-API forwarding is set at build time. Do not deploy before schema/identity reconciliation and role-based RLS checks.

Before building containers, run `pnpm infra:preflight`. It rejects placeholder origins, missing backend settings, unverified database TLS, automatic production migration, invalid worker/backup windows, incomplete notification-webhook configuration, partially enabled subscriptions, and floating container image tags. Configuration validation does not establish live readiness. Run `pnpm test:infra` after changing this contract.

The application, edge, and Ollama images are required to use approved immutable `@sha256:` digests. Set `NODE_IMAGE`, `OLLAMA_IMAGE`, and `CADDY_IMAGE` in the deployment environment after reviewing the exact image digests; floating tags such as `latest` and `2` are rejected by preflight.

The edge now sends compression and baseline security headers, exposes liveness and readiness separately, routes same-origin API and signed subscription webhook traffic directly to the API, and emits structured access logs. Compose rotates local JSON logs, waits for both API and web health before starting the edge, and gives Node services explicit shutdown windows.

Dockerfiles and Compose remain unvalidated in containers. Pin image digests and review network/secret management before deployment. `PORTAL_AUTO_MIGRATE=false` is required in production. The portal only checks its required storage columns at startup; migration application is a separately reviewed operation after inspecting both migration lineages. Local development may explicitly opt into the existing migration helper. No migration history has been reconciled against a live project here.

## Continuous verification
The repository runs the same secret-free local release gate on pull requests and pushes to `main`. It installs only the locked dependency graph, validates deployment and migration contracts, and creates fresh local verification evidence. It does not run production preflight, contact any external service, build containers, deploy, or receive production credentials.

## Local-first AI setup
The portal uses one shared gateway. Ollama is the default runtime for high-frequency tasks, DeepSeek runs as the local reasoning fallback through Ollama, OpenClaw can be enabled in native Ollama mode, and GPT-5.6 Sol is the opt-in escalation for explicitly entitled premium work. LangChain Core bounds and serializes the retrieved context; it does not create an additional model call. Routing telemetry and daily AI spend caps are persisted through the same Supabase/Postgres store as the portal, rather than resetting on an API restart.

The Compose file includes Ollama with a persistent model volume, bounded parallelism, model residency controls, and a one-shot `model-sync` profile. After setting approved model tags in the environment, synchronize only the models needed by the current feature set:

```text
docker compose up -d ollama
docker compose --profile model-sync run --rm model-sync
docker compose up -d api web edge
```

The Codex build lane is not an Ollama model or a public portal runtime. It remains the controlled engineering/escalation path behind the server boundary; Ollama handles routine portal traffic. Do not add a public `codex` endpoint or expose a model/provider label to the client.

Caddy now persists its configuration state separately from certificates and validates the mounted Caddyfile in its healthcheck. The edge still remains the only service publishing host ports.

Keep `OPENCLAW_ENABLED=false` until the OpenClaw runtime has been installed and tested against Ollama's native `/api/chat` endpoint. Set `OPENCLAW_API_MODE=openai-completions` only for a separately verified compatible proxy. Hosted OpenAI escalation is optional; keep its key unset to run the portal entirely on the local stack. Supabase remains the identity and production data system of record: provide its Auth URL/key and a production PostgreSQL connection in the server environment only. The worker also needs `SUPABASE_SERVICE_ROLE_KEY` to complete requested identity deletion; keep that privileged key server-side and never expose it to the web build.

## Tab coverage and remaining external setup
| Area | Backend | Remaining |
|---|---|---|
| Applications | Navigation | None for navigation |
| Skin Match / My Skin / Routine | Persistent profile and rules matching | Approved product and ingredient data |
| Shop / Saved | Allowlisted retailer links; saved destinations | Negotiated vendor agreements |
| Replenishment | Persistent reminders, durable in-app notifications and optional HTTPS webhook delivery | Configure a delivery channel and test it with real recipients |
| Coach | Reviewed-library local-first gateway with Ollama, DeepSeek fallback, LangChain context pipeline and Supabase-backed telemetry | Ollama models, reviewed content, optional hosted escalation validation |
| Learn | Approved knowledge records | Editorial publishing |
| Account | Supabase OTP, secure cookie session, data export, and delayed account deletion with cancellation and operational blockers | Auth provider, email delivery, service-role identity deletion, and live lifecycle validation |
| Support | Typed requests, shared references, customer-visible lifecycle, assigned operator updates and aggregate flow metrics | External helpdesk delivery and named staffing |
| Plans & Billing | Stripe checkout, portal and signed status webhooks | Both plan prices, benefits, terms and Stripe setup |
| Admin | Session roles, exact-email operator role management, privacy-safe deletion operations, knowledge/rule drafting and approval, support replies | Initial superadmin bootstrap; full product management UI remains incomplete |
| Company / policies / partners | Existing informational routes | Final legal content and agreements |

Operator access at `/admin/operators` lets an existing superadmin find an account that has completed sign-in and assign only the five supported portal roles. It never creates an account or grants a role from a client-provided identity. The server checks the operator's current role inside the update transaction, prevents self-edits, rejects stale revisions or out-of-band role changes, and records each change with its prior and new roles. A trusted administrator must still provision the first superadmin after verifying that account outside this portal; there is no public bootstrap endpoint.

Portal Support accepts only the five approved request types and records whether a request began in the form or an explicit guidance handoff. Customers see a server-generated reference and the states `open`, `in_review`, `waiting_customer` and `closed`; operator identity and internal source fields are excluded from customer responses. Superadmin and compliance operators can assign a request to themselves by updating it, move it through those states, and add timestamped customer replies. A reply is required when waiting for the customer, resolving, or reopening a request. The operations dashboard reports 30-day aggregate guidance, handoff, intake and update counts without customer questions, ticket text, identifiers or email addresses. These portal records do not establish external delivery or a response-time commitment.

## Operations worker and backup verification
Compose now runs a separate worker every 60 seconds. It expires sessions and stale rate limits, retains AI-routing logs, notifications, billing activity and run records according to the environment settings, creates one durable replenishment notification per due reminder, and delivers it in-app by default. Set `NOTIFICATION_DELIVERY=webhook` only after configuring an HTTPS endpoint and token; failed deliveries are leased and retried up to three times without duplicate delivery. The worker writes a health heartbeat after each successful run, and its container becomes unhealthy when that heartbeat is stale.

Signed-in users can schedule account deletion with a 30-day cancellation window. The worker pauses a request when it finds active subscriptions, a legacy paid membership, an unfinished order, operator access, a vendor account, or an unsettled hosted-AI charge. When eligible, it deletes the Supabase identity first, then removes portal-owned personal data and sessions in one database transaction. Completed transaction and audit records are retained only in anonymized form, and a non-identifying completion record is kept for operational proof. Retried jobs are leased and tolerate a previously deleted Supabase identity. Live Supabase deletion and organization-specific legal-retention policy still require production validation and counsel review.

Superadmin and compliance operators can inspect a read-only privacy operations panel. It reports queue totals, due and blocked requests, blocker categories, provider readiness and anonymous completion proof without returning account IDs, emails, provider error text, support messages or profile data. Raw deletion records are no longer included in the broad admin response. The general admin response also withholds support, order, partner and job records from non-operations roles and strips actor and target identifiers from audit rows. Anonymous completion proof is retained for 730 days by default through `OPERATIONS_DELETION_PROOF_RETENTION_DAYS`.

Every signature-verified subscription webhook now receives a durable, sanitized receipt before processing. Successful, ignored, duplicate and failed outcomes update that receipt without retaining customer, payment method or subscription payloads. Invalid signatures are never recorded. The operations dashboard shows 24-hour event, delivery, duplicate, failure and stalled-processing counts plus provider event IDs and safe error codes for reconciliation. Receipts are retained for 90 days by default through `OPERATIONS_WEBHOOK_RECEIPT_RETENTION_DAYS`.

The worker does not create database dumps itself: automatic unencrypted database dumps on the app host are not an acceptable production backup design. Use an encrypted, off-host PostgreSQL backup service with a tested restoration procedure. A superadmin or compliance operator records each verified backup through `POST /api/hub/admin/backup/verified` with its completion time, storage identifier and checksum. Future-dated completions are rejected. The worker exposes that proof on `/readyz` and marks it stale after `BACKUP_MAX_AGE_HOURS` (26 by default). Production `/readyz` returns HTTP 503 when the worker or backup is stale, while `/healthz` remains the container liveness probe so operators can still open the portal and correct readiness.

Run `pnpm --filter @mgt/api test:operations` and `pnpm --filter @mgt/api test:readiness` for worker and readiness regression checks. Checkout-request reconciliation, live webhook delivery validation, live identity-deletion validation, a live notification provider and a real restore drill still require environment-specific implementation and validation. No claim of complete production readiness is made.

Validation: API compilation, web build, existing referral suite and new billing suite. Remaining: real Stripe sandbox lifecycle, production PostgreSQL, container startup, browser interactions and deployment.

## Trial and billing-cycle update
New eligible consumer and vendor subscriptions use a 14-day free trial with payment_method_collection=always. The first paid billing period begins at trial end. No upfront subscription payment is collected. Trial eligibility is once per signed-in account and subscription audience, based on stored history and Stripe subscription history.

Configure monthly and annual recurring Price IDs using STRIPE_CONSUMER_MONTHLY_PRICE_ID, STRIPE_CONSUMER_ANNUAL_PRICE_ID, STRIPE_VENDOR_MONTHLY_PRICE_ID and STRIPE_VENDOR_ANNUAL_PRICE_ID. The older CONSUMER_PRICE_ID and VENDOR_PRICE_ID remain monthly fallbacks. Monthly Prices must recur every month and annual Prices every year, interval_count=1. Prices remain TBD; no prices were created.

The app creates a restricted Stripe billing-portal configuration: cancellations at period end, payment methods and invoices enabled, paid subscription price changes limited to that audience's configured Prices with Stripe confirmation and prorated invoicing. Trial-cycle changes use a separate authenticated endpoint, leaving trial_end untouched and creating no prorations. Trial subscriptions cannot change Prices through the billing portal because that could end a trial early. During a trial, cancellation ends access at trial end without starting the paid cycle. In a paid period, access remains until the end of that period. Payment failures can still suspend access according to subscription status.

Configure Stripe trial reminder emails and cancellation/renewal notices, publish matching terms, and use Stripe test clocks to validate trial-to-paid transitions, monthly and annual renewals, declines and end-of-period cancellation before launch. These transitions have mocked regression coverage here, not a live Stripe sandbox verification.
