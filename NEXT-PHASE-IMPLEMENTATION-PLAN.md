# MGT Skin Care v2 — Next-Phase Implementation Plan

**Version:** 4.2
**Revision date:** 2026-09-25
**Planning baseline:** `codex/reconcile-main-2026-09-20`; latest portal, accessibility, and provisional subscription phases verified locally
**Status:** Assistant and Support foundations, privacy-safe measurement, customer/operator accessibility phases, and a provisional three-plan subscription/Stripe integration are locally implemented; production remains **NOT READY**.

## 1. Purpose and decision boundary

This plan defines the next work around the verified MGT Skin Care v2 referral portal. It uses [`mgt-skincare-ai-infra-migration-v2.md`](mgt-skincare-ai-infra-migration-v2.md), [`SkincareAIPlatformBlueprint.md`](SkincareAIPlatformBlueprint.md), `CURRENT-SCOPE.md`, `BUILD-READINESS-GUIDE.md`, `business/OPERATING-MODEL-AND-GTM.md`, the AI task registry, and the latest local release checkpoint.

The current product boundary remains external referral. MGT does not collect a shopper's retailer purchase amount, create a retailer receipt, fulfill products, or handle retailer refunds. Existing checkout and commerce modules are retained behind server-side blocks. Subscription billing scaffolding is separate, disabled by default, and does not make product checkout active. The Phase A build adds a bounded server-side assistant route, integration coverage, and a guidance panel within the existing Support page. It does not enable a payment provider, create a live campaign, turn on OpenClaw, or change the logo or shared page layout.

Use these status labels in implementation and reporting:

- **Implemented / locally verified:** present in this branch and supported by local tests or checkpoint evidence.
- **Repository-ready:** can be developed and verified locally without external credentials, live users, or production data.
- **Environment-dependent:** requires a selected service, configuration, credentials, staging data, or operator provisioning.
- **Blocked / decision required:** conflicts with the current product boundary or lacks required business, legal, vendor, or product approval.
- **Planned:** a proposal only; do not describe as shipped.

## 2. Reconciled baseline

| Area | Verified state | Boundary for next phase |
|---|---|---|
| Product | Skin-match, routine, coach, learning, saved retailers, support and operations journeys are present in the local portal. The shop links to six independent external storefronts. | Keep the referral journey and established brand/layout stable. Retail purchase support remains with each retailer. |
| AI | The gateway has typed tasks, local-first routing, hosted entitlement checks, budget reservations, response validation and telemetry. The new assistant route sends only signed-in, consented routine/product questions to the existing reviewed Coach path. | Do not add a public model selector or promise model availability. OpenClaw remains disabled until the target runtime is verified. |
| Customer support | Portal support requests and operator replies exist. The new Support-page panel uses deterministic onboarding, support, account, retailer and payment handoffs without sending a message or creating a ticket. | AI may explain reviewed skincare content; it must not impersonate staff, confirm charges, resolve refunds, or take irreversible account/payment actions. Live support delivery remains planned. |
| Payments | Local tests cover billing/subscription behavior with a mocked Stripe client. Subscriptions are gated by `SUBSCRIPTIONS_ENABLED`, approved terms, prices, Stripe settings and signed webhooks. Product checkout is blocked under the current external-referral decision. | Distinguish subscription status/activity from a payment receipt. Retailer receipts and confirmations belong to the retailer. No payment collection until a separate business decision changes scope. |
| GTM | An external-retailer operating model and GTM plan exists. Audience and positioning are hypotheses; no active partner contract, fee schedule, attribution or performance baseline is documented. | Start with low-cost learning and trust measures. Paid budgets, affiliate claims and profit forecasts require real margin and attribution evidence. |
| Release | The 2026-09-23 checkpoint reports all seven local gates passed. Production is **NOT READY** because `infra/portal/.env` is absent and live service checks remain open. | Local pass status does not establish production readiness. |

## 3. Phased implementation sequence

### Phase A — lock task boundaries and agent behavior (Critical; repository-ready)

**Goal:** translate current `coach`, `support`, `shopping_assistant` and intent-routing capabilities into explicit assistant roles without changing the existing interface.

1. Define role contracts for customer care, new-user onboarding, routine guidance and product/referral education. Reuse existing API and task contracts where possible; present role choice only as internal routing policy unless a UX change is separately requested.
2. Keep all routine edits deterministic. An agent can explain or propose a routine change, but the existing domain engine and user confirmation own any mutation. Agents cannot submit orders, claim a retailer purchase succeeded, change billing, issue refunds, alter account roles, or make medical diagnoses.
3. Ground product and ingredient answers in approved knowledge/catalog records. Return citations or source identifiers where the task schema supports them; if approved data is absent or stale, state the limitation and route to human support.
4. Establish escalation rules: deterministic checks first; local Ollama for bounded narrative/classification; DeepSeek for local reasoning fallback; OpenClaw only after runtime qualification; hosted OpenAI only for tasks already configured for it, with consent/entitlement, budget reservation and validated response. Do not add hosted fallback to vision.
5. Add sanitized escalation/handoff states to support operations; do not send a message to staff or a customer without an explicit product delivery path and consent.
6. Add reviewed cases for onboarding, account help, product/referral questions, missing sources, uncertain answers, sensitive skin concerns, adverse reactions, privacy requests, and payment questions. Extend the existing golden set only after human review criteria are recorded.

**OpenClaw qualification gate:** keep `OPENCLAW_ENABLED=false`; validate the approved immutable runtime, native Ollama `/api/chat` compatibility, model synchronization, tool allowlist, network isolation, timeouts, prompt-injection handling, content boundaries, data retention, redaction, fallback behavior and cost/latency. Begin with a no-tools, read-only assistant. Agent tools, external actions and customer-facing rollout require separate scoped approval and a staging review.

**Exit evidence:** role/task map, reviewed policy cases, local adapter and fallback report, privacy-safe telemetry review, and a decision record for enabling OpenClaw in a non-production staging environment.

**Phase A checkpoint:** Commit `8444aa7` adds `POST /api/hub/assistant` with explicit customer-care, onboarding, routine-guidance and product/referral roles. Safety, account, payment and retailer questions receive deterministic guidance or a handoff path without a provider or payment call. Routine/product education uses the existing reviewed Coach only after sign-in and explicit AI consent, with the existing rate, entitlement, budget and source controls. The API build, focused portal/Coach checks, and full local verification passed; evidence is `work/verification/2026-09-23T01-18-44-476Z/report.md`. This is an API foundation; it does not send support messages, expose an assistant in the current UI, enable OpenClaw, or validate live providers.

**Support-page checkpoint:** Commit `518274b` adds a small guidance panel to `/support` using existing MGT components and the unchanged logo. It shows the server's next step and reviewed citations, distinguishes guidance from a saved support request, and permits deterministic retailer directions without an AI account or consent. A general “How do I get started?” question now routes to onboarding guidance. API compilation, portal integration checks, web production build, 28-page proxy journey, and browser checks of onboarding and retailer flows passed. The build still does not create tickets from guidance, enable OpenClaw, send external support messages, or verify live providers.

**Policy and fallback checkpoint:** Commit `08c9ca4` adds 18 engineering candidate cases covering all four roles, mixed retailer/payment questions, privacy and account requests, adverse and urgent reactions, and prompt injection. The tests exercise the API boundary and verify deterministic cases make no AI or payment-provider call. The assistant now returns a support handoff when approved knowledge, configuration, or a verified model answer is unavailable; it still requires sign-in and consent before a reviewed answer. The cases are **not SME-approved content**. Full local verification passed at `work/verification/2026-09-23T01-51-10-062Z/report.md`. Urgent symptom wording was checked against [NHS anaphylaxis guidance](https://www.nhs.uk/conditions/anaphylaxis/); clinical review remains a release gate.

**Support accessibility checkpoint:** Commit `f075a43` keeps the existing MGT Support layout and moves keyboard focus to a new guidance answer or error. The Support handoff moves focus to the labeled request form and does not submit it. The form exposes its busy state. Web production build and the 28-page proxy journey passed; a focused browser accessibility-tree and interaction check confirmed answer, handoff, and sign-in error focus. A full screen-reader, keyboard, mobile, contrast, and WCAG audit remains open.

### Phase B — onboarding, care and human support (High; repository-ready, delivery environment-dependent)

1. Use existing onboarding/account routes and approved learn content to explain how profiles, consent, skin-match and saved retailers work. Collect only the inputs needed for the selected journey.
2. Keep AI consent explicit before processing free-text coach input. Make it clear that answers are educational product guidance, not diagnosis or treatment.
3. Provide a clear handoff when the source is missing, the response fails validation, the customer reports a reaction, or the question concerns an order/payment handled by an external retailer.
4. Keep support tickets and admin replies as the system-of-record path until an approved helpdesk/email integration is configured. Do not imply an AI draft was sent or a human case was received until delivery is confirmed.
5. If email or webhook delivery is later selected, use explicit channel consent, verified sender/domain, unsubscribe and suppression controls for marketing, retries with deduplication for transactional events, and sanitized delivery status.

**Exit evidence:** onboarding/support acceptance cases, accessible handoff states, authenticated role checks, delivery receipts for any configured service, and a clear path to a human operator.

**Support handoff draft checkpoint:** The existing Support page now lets a user explicitly copy a submitted guidance question into the portal request form for review. Later edits to the question are not silently copied, an existing request draft is not overwritten, and no ticket is saved until the user selects Save request. Focus moves to Subject so the user can complete the request. The browser flow and local release gate passed; external delivery and named support ownership remain open.

**Request-reference checkpoint:** Saving a Portal Support request now returns its server-generated reference, save time and initial status. The confirmation and customer history display that reference, and authorized operators see the same reference in their request view. A local browser save confirmed the receipt matches the list; the portal integration test verifies server authority and customer isolation. The full local gate passed at `work/verification/2026-09-23T15-54-31-331Z/report.md`. This is a portal record, not proof of external delivery or a committed response time. Named ownership, triage states and live delivery remain open.

**Phase B1 — typed intake checkpoint:** Portal Support now accepts five server-validated request types and one of two approved sources: the direct form or an explicit guidance handoff. The selected type is visible in customer history and the operations view. Client-provided unknown categories and sources are rejected, and the customer response excludes actor, email, internal assignment and intake-source fields.

**Phase B2 — lifecycle and assignment checkpoint:** Authorized superadmin and compliance operators can move a request through open, in-review, waiting-for-customer and resolved states. Updating a request assigns it to that operator, records the update time and first response, and adds a timestamped customer reply when supplied. A customer-facing reply is required for waiting, resolved and reopened transitions. Customers see the new state and replies without receiving operator identity.

**Phase D1 — privacy-safe Support measurement checkpoint:** The analytics registry now classifies four Support events as aggregate-only. The server records daily counters for guidance requests, Support handoffs, saved request types/sources and operator updates; the operations panel shows 30-day totals and category counts. It does not retain question text, ticket messages, email addresses, account IDs or operator IDs in these metrics. Focused API, authorization, assistant-policy, analytics-contract, production web build and browser intake checks passed. Full-gate evidence is recorded with the matching release checkpoint.

### Phase C — payment confirmations and records (Critical before enabling any MGT billing; blocked for retailer purchases)

| Capability | Current status | Planned handling |
|---|---|---|
| Retailer product purchase confirmation | **Not implemented by MGT; intentionally outside current scope.** | The retailer is merchant of record and sends its own confirmation, invoice and receipt. MGT may link users to retailer support but must not fabricate purchase status. |
| MGT product checkout, order receipt, refund or fulfillment | **Blocked by current scope and API boundary.** Legacy paths remain gated. | Keep disabled unless the user separately approves a commerce model, vendor agreements, legal terms, tax/shipping operations, support ownership, database reconciliation and provider plan. |
| Essential, Personalized, and Professional subscription checkout | **Three-plan scaffold locally tested with a mocked Stripe client; disabled by default.** The plan comparison and recommendation are provisional. Prices/benefits/terms and a live account are unverified. | Before any launch, approve each offer, price, limit, entitlement, trial/cancellation/refund language and customer support owner; provision a sandbox; validate signed webhook reconciliation and entitlement behavior; then make a separate production enablement decision. |
| Subscription status and webhook records | **Local implementation exists.** Activity and sanitized webhook receipt operations are not a customer payment receipt. | Derive confirmed status only from verified provider events. Treat browser return URLs as navigation, not proof of payment. Show only minimal status to the signed-in owner; provide the payment provider's invoice/receipt portal where available. |
| Confirmation email or SMS | **No live delivery path verified.** | Choose a transactional provider, sender identity and recipient policy. Send only after authoritative signed-event confirmation, with idempotency, retry, suppression, redaction and auditable delivery outcome. |

Required implementation controls if subscription confirmations are approved: one confirmation per provider event/transaction, idempotent event handling, server-side ownership verification, currency/amount/plan identity from provider data, UTC timestamps, provider reference, privacy-minimized record, correction/refund status where applicable, customer-readable support route, operator view limited by role, retention schedule, and reconciliation for delayed/duplicate/failed events. Never expose full payment credentials or sensitive provider payloads to the customer portal or AI context.

**Five-phase provisional plans and Stripe checkpoint:**

1. A server-owned catalog now defines Essential, Personalized, and Professional as provisional offers with draft comparison content and independent monthly/annual Price configuration.
2. `transparent_rules_v1` suggests Essential or Personalized from saved routine level and budget range. The logic is deterministic, makes no paid model call, sends no profile data outside the portal, and cannot enroll a user.
3. Checkout, trial plan/cycle changes, and the customer billing portal carry and validate plan identity while retaining audience isolation, recurring-consent, published-terms, ownership, idempotency, and HTTPS-return controls.
4. Signed subscription events map confirmed Price IDs back to a plan and billing cycle. Customer status and activity include only the safe plan identifier; browser returns still do not activate access, and invoices remain in the provider portal.
5. Production preflight and operator readiness now enumerate all six named plan Price IDs. Enrollment remains closed until pricing and benefits are approved, terms/company details are published, subscription flags and signing secrets are configured, and sandbox/live evidence is completed.

This checkpoint does not create prices, connect an account, collect a payment, finalize benefits, or change the retailer merchant-of-record boundary. The legacy consumer/vendor variables remain migration fallbacks for Personalized and Professional; new production preflight requires explicit Price IDs for all three plans. Focused checks and every full local release gate passed at `work/verification/2026-09-25T16-05-56-744Z/report.md`, including 70 HTTP/persistence/release-contract tests, the production web build, 29-route proxy journey, and zero-hit public artifact vendor scan.

**External dependencies:** sandbox/live account, signed webhook secret, approved prices and terms, business identity/support contact, configured database and TLS origins, security/RLS review, transactional communications provider (if messaging is wanted), legal/privacy review and named reconciliation owner. Keep live charges and all retail-purchase confirmations blocked until the exact capability has approval and staging evidence.

### Phase D — economical go-to-market experiments (Medium; planning now, execution gated)

**Objective:** learn which trusted discovery journeys create retained, qualified referral activity and positive contribution after service, content, support and acquisition costs. No audience size, conversion rate, referral fee or lifetime value is verified today.

1. **Set measurement first:** define an event dictionary using the analytics SDK's privacy/retention registry. Track consented entry source, skin-match completion, routine save, learn-content engagement, outbound retailer click, return visit and support resolution. Avoid collecting free-text skin details or sending profile data to retailers/ad platforms.
2. **Start with low-cost owned/organic tests:** educational learn content, search-friendly routine/ingredient explainers, retailer-neutral product education, consented onboarding email only if a transactional/marketing provider and consent records are ready, and social posts that point to the portal. Avoid medical, guaranteed-result, dermatologist-approved, partnership or discount claims without evidence.
3. **Validate referral economics:** obtain written retailer/partner terms before naming a relationship, adding affiliate identifiers or reporting referral revenue. Keep commercial placement separate from organic suitability ranking; disclose sponsorship and measure recommendation quality and user trust alongside revenue.
4. **Test retention respectfully:** consented routine check-ins, saved-list reminders and educational re-engagement; honor user preferences and unsubscribe. Do not use sensitive skin profile attributes for ad targeting.
5. **Treat paid media as a later, capped experiment:** begin only after baseline funnel instrumentation and an approved ceiling exist. Use one hypothesis, one channel, one landing journey, a time-box and stop-loss. Compare qualified completion and retained use against total channel, creative, discount, support and service costs.
6. **Use contribution measures:** incremental referral/partner revenue minus campaign, discount, content, provider inference, support, payment, refund/chargeback and operational costs where applicable. Report CAC, activation, retained use, referral click-through and qualified conversion with sample size and attribution limits. Avoid claiming profit from clicks, gross merchandise value, or modeled lifetime value without observed cohorts and contracted rates.
7. **Protect quality while optimizing:** do not reduce source grounding, human review, accessibility, safety checks, or approved-model routing to improve short-term conversion or inference cost. Monitor golden-case quality, correction/handoff rates, complaints and privacy incidents alongside financial outcomes.

**Phase D2 — referral engagement baseline checkpoint:** The Shop records daily aggregate counts when a visitor opens an allowlisted retailer destination or changes a saved-retailer state. The operations panel shows a 30-day retailer and segment view to superadmin and compliance roles. These counters contain no customer identifier, profile, search, free text, retailer-site activity, order, amount, revenue or profit data, and expire after 180 days by default. They measure portal actions, not unique customers, retailer purchases, conversion, revenue or profit. Commercial agreements and affiliate attribution remain pending.

**Phase D3 — assistant journey measurement checkpoint:** The server records aggregate guidance outcomes by the four bounded assistant roles and accepts next-step selections only for the six approved portal destinations. The operations panel reports guidance volume and an offered → Support opened → request saved funnel. Arbitrary roles, action names and external URLs are rejected. The counters exclude question text, ticket content, customer identifiers, account details and email addresses, and use the same 180-day aggregate retention policy. Counts describe portal actions rather than unique people or guaranteed support outcomes.

**Phase B3 — owned escalation checkpoint:** An authorized superadmin or compliance operator can assign a fixed internal escalation reason while updating a request; the request is assigned to that operator and the customer receives only the updated status and any customer-facing reply. The supported reasons are content safety, account/privacy, billing scope, retailer purchase, technical issue, specialist review and other. Customer responses and account exports exclude internal assignment and escalation fields. The operations panel shows aggregate escalation selections by reason, not customer or ticket data. This is a local workflow record; it does not establish staffing, delivery or response-time commitments.

**Phase F1 — shared navigation focus checkpoint:** The portal shell moves focus to the main landmark after an in-portal route change, so keyboard and screen-reader users reach the new page context. Opening the mobile menu moves focus to its first primary destination; Escape closes the menu and returns focus to Menu. The existing Skip to content link, reduced-motion support, visual design, routes and menu structure remain unchanged. This does not replace a full device, screen-reader, contrast or WCAG audit.

**Phase F2 — rendered accessibility markup checkpoint:** The production proxy journey now checks all 29 portal routes for the shared Skip to content link, primary-navigation identity and label, main landmark, labeled policy navigation, and alternative-text attributes on rendered images. This protects the baseline markup from regressions without changing visible content, branding, or page structure. It does not measure keyboard traversal, screen-reader announcements, contrast, zoom/reflow, or real-device behavior; those remain required release evidence.

**Phase F3 — theme accessibility contract:** The local release gate now calculates WCAG contrast ratios for 20 normal-text token pairs across the dark and light themes and requires at least 4.5:1. It also verifies that reduced-motion, forced-color, and visible-focus rules remain declared. The current minimum measured pair is 5.82:1. This protects the declared design tokens and preference hooks; component states, imagery, browser rendering, zoom/reflow, and assistive-technology behavior still require human and device validation.

**Phase F4 — route identity checkpoint:** The shared shell assigns a concise page title to every current customer and operator route. After an in-portal navigation, it updates the browser title and a polite live region while the existing focus behavior moves to the main landmark. This improves page context without changing visible navigation, branding, routes, or layout.

**Phase F5 — customer-form state checkpoint:** Support guidance, saved Support requests, Skin Coach, and account sign-in now expose their busy state and associate server errors with the relevant form. The question and verification controls mark failed input states and clear the stale error when the customer edits the affected value. Existing submission, consent, authentication, and payment boundaries are unchanged.

**Phase F6 — recovery-focus checkpoint:** The application error boundary moves focus to its recovery heading when an unexpected route failure is shown. Customers can retry or return to Applications using the existing recovery actions. This is a local focus-management safeguard; real assistive-technology announcement quality and failure behavior under deployed network conditions remain open.

**Phase F7 — confirmation-dialog checkpoint:** Shared confirmation dialogs expose their title, description, modal and busy states, retain native keyboard containment, and explicitly restore focus to the control that opened them when they close. Account deletion and routine simplification keep their existing confirmation boundaries.

**Phase F8 — retailer-shortlist checkpoint:** The shortlist announces its selected count and connects its heading, instructions and count. The existing three-retailer cap, URL persistence, independent-listing disclosure, download, copy and removal behavior are unchanged.

**Phase F9 — Shop-filter checkpoint:** Shop search, region and specialty controls identify the results they update and the matching-destination status that describes them. The result count is atomic and polite, while retailer ordering, links, saved state and referral measurement remain unchanged.

**Phase F10 — reviewed-library search checkpoint:** The reviewed-library search identifies its result collection and live result count. Source links, review status, content and empty states are unchanged.

**Phase F11 — Replenishment feedback checkpoint:** The reminder form exposes busy and associated error states, clears stale errors when values change, and announces planned and due totals. Reminder actions remain planning records and cannot purchase a product.

**Phase F12 — membership selector checkpoint:** Subscription audience and billing-cycle choices are grouped with programmatic legends. Billing actions expose busy/error relationships, and confirmed subscription status is announced without treating a browser return as payment confirmation.

**Phase F13 — renewal confirmation focus checkpoint:** The subscription workspace remembers the renewal control that opened its inline confirmation. Back or a completed request returns focus to that control when it remains available, otherwise to Refresh status. Confirmation help, busy state and errors are programmatically associated.

**Phase F14 — invited-access feedback checkpoint:** Guest invitation creation and acceptance expose busy/error relationships. Invalid email state clears when edited, and a newly created one-time invitation link is announced. Profile, billing and administration isolation remain unchanged.

**Phase F15 — Beauty & Style feedback checkpoint:** The shared style-profile form exposes busy/error relationships, clears stale save errors when a preference changes, and confirms complete-plan downloads. The plan remains deterministic and preference-based; no photo analysis, live AI assessment or shade verification is introduced.

**Phase F16 — billing activity checkpoint:** The confirmed subscription-activity region exposes its heading and loading state, announces the number of confirmed updates, and prevents duplicate refresh actions while loading. It remains a status history rather than a receipt or invoice.

**Phase F17 — gated-action explanation checkpoint:** Shared operator action controls now programmatically associate each disabled reason with its button and expose their busy state. Separation-of-duties explanations remain visible and are available to assistive technology.

**Phase F18 — knowledge-selection checkpoint:** Knowledge objects are selected with native buttons that expose pressed state. Keyboard operators can reach and select every object without relying on a pointer; approval, provenance and retrieval rules are unchanged.

**Phase F19 — ingredient-rule selection checkpoint:** Each safety-rule row now provides a native selection button with pressed state. The live-versus-draft matrix, SME approval boundary and fail-closed scoring behavior remain unchanged.

**Phase F20 — operator-access form checkpoint:** Operator lookup and role assignment expose busy/error relationships. A stale lookup error clears when the email changes; existing superadmin authorization, confirmation, concurrency and audit controls remain in force.

**Phase F21 — operator AI and reconciliation checkpoint:** The advisory-analysis form and spending-hold reconciliation forms expose busy/error relationships. Analysis input clears stale errors when edited, and returned analysis is announced as status. Daily limits, consent, role checks, cost holds and manual provider-record verification remain unchanged.

**Phase F22 — per-request support state checkpoint:** Every operator support form now owns its own busy, error and success state. Updating one request no longer disables unrelated requests, and duplicate submission is blocked only for the request being saved.

**Phase F23 — support lifecycle guidance checkpoint:** The operator form explains the API lifecycle before submission and requires a customer-facing reply for Open, Waiting for customer and Resolved. In review remains the only state that can be saved without a reply; the API remains authoritative.

**Phase F24 — support history semantics checkpoint:** Each request is programmatically connected to its heading, customer-visible replies are identified as such, empty reply history is explicit, and saved/updated/reply dates use machine-readable timestamps.

**Phase F25 — operations data navigation checkpoint:** Readiness, support, referral, privacy, billing and AI sections expose loading state and named headings. Metric groups use description lists; horizontally scrollable tables are keyboard-focusable named regions with captions and scoped row/column headers.

**Phase F26 — operator evidence and draft-state checkpoint:** Audit evidence uses a named table, scoped action rows and machine-readable dates. Knowledge/rule draft controls expose busy state, disable affected fields during a save, clear stale errors when edited and use explicit button types.

**F22–F26 verification:** Focused render checks and every full local release gate passed at `work/verification/2026-09-25T16-34-14-942Z/report.md`; the seven-gate local checkpoint passed at `work/checkpoints/2026-09-25T16-34-13-262Z/report.md`. Evidence includes 70 HTTP/persistence/release-contract tests, the production web build, 29-route proxy journey and zero-hit public artifact vendor scan. These checks preserve authorization and API enforcement; deployed keyboard, screen-reader, browser/device and complete WCAG evidence remain required.

**Exit evidence:** approved positioning and claims, consent-compliant measurement plan, attribution rules, partner terms where relevant, campaign cap and stop rule, baseline report, and a post-test decision grounded in observed data.

### Phase E — data, AI economics and service qualification (Critical for production)

1. Validate the authoritative Supabase/Postgres project, migrations, TLS, RLS, identity lifecycle, two-connection concurrency, retention and backup restoration.
2. Verify Ollama model inventory and hardware capacity; record latency, failure, schema-validity and fallback rates by task. Confirm provider-reported hosted usage and actual charges against reservations; configure provider-side spend limits.
3. Audit each telemetry field and log destination for minimization, retention and access. Keep customer prompt/skin-profile text out of aggregate operator reporting. Record consent version and purpose for any new collection.
4. Run staging evaluation for the reviewed task set, including source-grounding accuracy, prohibited health claims, refusals/handoff, output schema, adverse-event handling, retry behavior, model mismatch, uncertain billing and duplicate events.
5. Keep every key server-side. `OPENAI_API_KEY`, OpenClaw credentials (if any), Stripe secrets, Supabase service-role key, webhook tokens and signing secrets must never enter browser bundles, screenshots, logs or Git history. A ChatGPT subscription is not an API credential.

### Phase F — release gate and documentation synchronization (Critical)

1. Keep local verification, staging verification and production readiness as separate claims. Attach timestamped evidence to the exact commit.
2. Complete environment preflight, database/RLS and restore evidence, OpenClaw and provider qualification, approved catalog health, support delivery, billing sandbox (only if approved), browser/accessibility checks, immutable-image startup, `/readyz`, rollback and incident procedures.
3. Record remaining blockers and the release decision in `infra/portal/RELEASE-CHECKPOINT.md`; production stays **NOT READY** until all critical blockers close or a named owner approves a documented launch exception.
4. Update both canonical Markdown documents and the corresponding Google Docs from the same accepted source text. Preserve the original historical blueprint as historical. Verify Drive readback and repository diff after each update.
5. Commit the documentation with the code/evidence revision it describes; push only to the approved project branch. A future code change should receive its own implementation review and checkpoint.

## 4. Priority and dependency summary

| Priority | Work | Can start locally | Blocking dependency |
|---|---|---|---|
| Critical | Lock assistant roles, safety boundaries, evaluation cases and OpenClaw qualification checklist | Yes | OpenClaw runtime testing before enabling; SME review for product/ingredient content |
| Critical | Preserve current external-referral and payment boundary; specify subscription confirmation behavior | Yes | Separate commercial approval, Stripe sandbox, legal terms, webhook and database validation before any charge |
| Critical | Production data/identity/RLS/backup readiness | Prepare runbooks locally | Approved Supabase target and authorized staging access |
| High | Onboarding and support handoff behavior | Yes | Human support owner and any chosen helpdesk/email delivery provider |
| High | Consent-aware measurement and GTM experiment definitions | Yes | Approved claims, event purpose/retention, partner agreements for attributable revenue |
| Medium | Paid acquisition tests | Planning only | Funnel baseline, campaign cap, attribution, margin/fee evidence and explicit budget approval |
| Medium | Affiliate attribution or sponsored ranking | Contract/template preparation only | Written partner terms, disclosures, privacy review and product-ranking safeguards |

## 5. Release evidence checklist

- Exact commit, clean source diff and successful repository release checkpoint.
- Human-reviewed golden cases and per-task quality report, including evidence for source grounding and escalation/handoff.
- OpenClaw staging qualification report; production stays disabled until explicit enablement and rollback are recorded.
- Staging database/RLS/concurrency and backup-restore report.
- Provider inventory, model/version evidence, latency/error/fallback report and provider-billing reconciliation.
- Approved catalog coverage and content review.
- If subscriptions are approved: sandbox checkout, verified event, duplicate/replay, cancellation, failed payment, receipt/portal, ownership and operator audit evidence.
- Support delivery/handoff evidence and accessibility/browser journey report.
- Campaign measurement dictionary, baseline, cap/stop rule and post-test economics; no unverified profitability claim.
- Updated local Markdown and Google Docs readback, with unresolved conflicts labeled.

## 6. Current unresolved decisions

1. Whether the product remains referral-only for the next release or later adds a separately approved MGT subscription offer.
2. Whether OpenClaw will run as a constrained assistant and which target runtime/network/tool policy will be approved.
3. Which approved product/catalog and educational sources will ground customer answers.
4. Which human support owner and, if needed, transactional or marketing delivery service will be used.
5. Which partner agreements, permitted attribution terms and campaign budget cap are approved.
6. Which Supabase, hosting, backup and provider accounts will be used for staging and production.

Until these decisions and dependencies are evidenced, the plan remains planning material and the production release remains **NOT READY**.

## 7. Improved next build order

1. **Critical — policy sign-off and answer quality:** have an SME and privacy owner review the 18 engineering candidate cases in `apps/api/test/assistant-policy-cases.json`, add approved product and ingredient cases from the real catalog, and record acceptance criteria for false positives and unsupported claims. Keep deterministic handoffs before model routing and expand the matrix only with approved evidence.
2. **High — experience and accessibility:** complete full keyboard, screen-reader, mobile, contrast, and WCAG checks across onboarding and Support. Focus movement for guidance, error, and handoff is locally verified. Add a direct onboarding entry only if user testing supports it; keep the logo and page hierarchy intact.
3. **High — support operations:** define ticket ownership, escalation reason, response state and safe operator visibility. Configure external delivery only after a provider and owner are chosen; record delivery outcome rather than implying a message was sent.
4. **Critical — approved knowledge and runtime:** complete catalog/SME source coverage; run the existing gateway and optional OpenClaw path in staging with model inventory, privacy, timeout, schema, tool isolation, latency and rollback evidence. Keep `OPENCLAW_ENABLED=false` until the qualification decision.
5. **High — measurement:** instrument consent-aware assistant entry, helpful next-step selection and handoff completion through the analytics registry without storing message content. Establish a baseline before paid marketing tests.
6. **Blocked until business decision — live payments and campaigns:** retain retailer payment/receipt boundaries. The three-plan Stripe scaffold is repository-ready, but enabling enrollment still requires approved offers and prices, a connected sandbox/live account, signed-event evidence, terms and a support owner. Cap paid or affiliate experiments only after agreements and contribution metrics are available.
