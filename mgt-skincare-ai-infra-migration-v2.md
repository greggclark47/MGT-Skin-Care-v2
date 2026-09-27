# MGT Skin Care — AI/LLM Infrastructure Migration v2

**Version:** 2.1.30-planning
**Revision date:** 2026-09-25
**Status:** Canonical documentation for the verified repository branch  
**Repository branch:** `codex/reconcile-main-2026-09-20`  
**Repository baseline:** `cea19fd`; current support-operations accessibility build is documented with its matching release checkpoint

This document reconciles the existing Drive migration document with the current MGT Skin Care v2 repository, local release checkpoints, and the current product boundary. It is the implementation-oriented source of truth for migration planning. It does not change application code, credentials, infrastructure state, branding, routes, or user experience.

## 1. Authority and source precedence

When sources disagree, use the following order:

1. Verified code and configuration on the current repository branch.
2. Timestamped local checkpoint and verification reports.
3. Current-scope and release-readiness documents in the repository.
4. GitHub branch history and pull-request evidence.
5. Google Drive planning documents, retained as historical context unless confirmed by the sources above.

Primary references:

- [GitHub repository](https://github.com/greggclark47/MGT-Skin-Care-ChatGPT-Web-Portal-Build-V2.5/tree/codex/reconcile-main-2026-09-20)
- [Drive migration document](https://docs.google.com/document/d/1Oz7oNwUdV38KmD7fxoTZo-G_GQr1EUHjSNNS6uza2J4/edit)
- [Current scope](CURRENT-SCOPE.md)
- [Portal infrastructure README](infra/portal/README.md)
- [Readiness guide](BUILD-READINESS-GUIDE.md)
- [Release checkpoints](infra/portal/RELEASE-CHECKPOINT.md)

The original Drive document is retained as an audit reference. Its provider roster and broad commerce assumptions are not current implementation facts.

## 2. Migration objective and scope

The migration objective is a controlled, observable AI platform for the skincare referral portal. The platform should provide useful product explanations, routines, skin-match guidance, care-coach responses, support drafts, and restricted operator analysis while keeping high-frequency traffic local and requiring explicit entitlement and budget controls for hosted inference.

In scope:

- A server-side AI gateway with task-specific routing, validation, retries, circuit breaking, cost admission, and telemetry.
- Ollama local inference for routine traffic, embeddings, and vision attributes.
- DeepSeek local fallback and optional OpenClaw/Ollama compatibility.
- Entitlement-gated OpenAI escalation using the active registry models.
- Bounded LangChain Core prompt/context composition.
- Supabase/Postgres target persistence for usage, reservations, telemetry, and portal data.
- Local SQLite/sample mode for development and deterministic verification.

Out of scope for this migration:

- Enabling direct product checkout, cart, fulfillment, refunds, payouts, Connect onboarding, or affiliate tracking. Legacy paths remain gated. Subscription billing scaffolding is separate, disabled by default, and does not establish an approved or live consumer billing offer.
- Diagnostic or medical decision making.
- A production claim for hosted model access, live databases, Docker startup, deployment, or browser/WCAG certification.
- Silent migration of stale Gemini, Anthropic, or legacy OpenAI model claims into the active build.

## 3. Current product and infrastructure boundary

MGT Skin Care v2 is an external-referral portal. The shop exposes six independent storefront links, regional and beauty-focus filters, and saved retailer lists. Vendor-of-record billing, shipping, returns, partnership status, and quality certification remain outside the application. The API blocks prior commerce entry points and does not send customer profile data through referral links.

The web portal, API, worker, and edge configuration are represented in the repository under `apps/`, `infra/portal/`, and `packages/`. The local preview is sample-only. Live identity, production database/RLS, provider runtime, backup restoration, container startup, hosting, approved catalog data, and browser evidence remain release gates.

## 4. Active AI model registry and routing

The authoritative task and model registry is `packages/ai-gateway/src/task-registry.ts`. The following entries are active in the current codebase:

| Tier | Registry key | Provider and model | Intended work | Hosted entitlement |
|---|---|---|---|---|
| Tier 1 | `OLLAMA_FAST` | Ollama `llama3.2:3b` | Routine narrative, product why, ingredient tips, coach answers, shopping/support drafts, summaries, intent classification | No |
| Tier 1 | `DEEPSEEK_LOCAL` | Ollama `deepseek-r1:8b` | Local reasoning fallback for routine work | No |
| Tier 1 | `OPENCLAW` | OpenClaw using Ollama `llama3.2:3b` | Optional local agent-compatible fallback | No; disabled until tested |
| Tier 1 | `OLLAMA_VISION` | Ollama `llava:latest` | Vision attribute extraction | No |
| Tier 1 | `OLLAMA_EMBED` | Ollama `nomic-embed-text` | Embeddings | No |
| Tier 3 | `OPENAI_SOL` | OpenAI `gpt-5.6-sol` | Premium consultation and supported hosted fallback | Yes |
| Tier 3 | `OPENAI_SOL_FALLBACK` | OpenAI `gpt-5.6-sol`, low reasoning | Fallback after deep local/hosted failures where allowed | Yes |
| Tier 3 | `OPENAI_ASTRA` | OpenAI `gpt-6-astra`, high reasoning | Deep routine optimization and operator analysis | Yes |

The current route chains are:

- Tier 1: Ollama fast → DeepSeek local → optional OpenClaw → GPT-5.6 Sol low reasoning only where the task permits hosted escalation.
- Premium consultation: GPT-5.6 Sol at medium reasoning, entitlement required.
- Deep routine optimization and operator analysis: GPT-6 Astra at high reasoning → GPT-5.6 Sol fallback, entitlement required.
- Vision: Ollama `llava:latest`; no hosted fallback is enabled.

The registry, rather than historical planning text, controls task-to-model selection. Anthropic is not an active provider in the current registry. Gemini is not an active provider and must not be reintroduced by documentation-only migration.

## 5. Gateway control path

Every request enters `AiGateway` through a typed task contract. The gateway:

1. Validates the caller, task, schema, and request limits.
2. Resolves the route chain from the task registry.
3. Checks entitlement before any hosted candidate is considered.
4. Reserves budget before a hosted attempt and rechecks admission before each retry.
5. Applies circuit-breaker and retry rules.
6. Calls the provider through the adapter boundary.
7. Validates provider usage, model identity, and response schema.
8. Settles or retains the cost reservation according to billing certainty.
9. Records privacy-classified telemetry without storing customer prompt content in operator summaries.
10. Returns a typed result or a safe failure; it does not silently replay uncertain hosted charges.

Provider adapters and price metadata live under `packages/ai-gateway/src/adapters/`. Local model costs are represented as zero provider charge in local fixtures. Hosted price entries are configuration metadata, not a live invoice, and must be reconciled against provider billing before production economics are reported.

## 6. Data, privacy, security, and governance

- API keys are server-side only; a ChatGPT subscription is not an API credential.
- Hosted inference requires an identified account and the server-side premium entitlement.
- User-facing answers are bounded by product-owned schemas and deterministic policy checks. They must avoid diagnosis, unsafe treatment claims, unsupported citations, and direct medical advice.
- Prompt context is minimized by task. Operator analysis is restricted to superadmin/compliance roles, requires consent, origin/CSRF checks, bounded questions, and daily limits.
- Analytics events use the registry in `packages/analytics-sdk`. The runtime rejects unknown events, malformed property shapes, and missing required values, then stamps privacy and retention classes.
- Account deletion has a cancellation window and refuses unsafe erasure while billing, open orders, operator access, vendor ownership, or unresolved hosted charges remain. Retained records are anonymized where required.
- Referral URLs contain no affiliate tracking or customer-profile data.
- Production persistence targets Supabase/Postgres with row-level security, transactionally recorded reservations, audit records, and backup verification. Local SQLite/sample mode is not production evidence.
- OpenClaw remains disabled until its native Ollama path, model synchronization, tool behavior, and failure handling are validated in the target environment.

## 7. Infrastructure topology

The target deployment has a Next web application, an Express-style API, an operations worker, an internal Ollama service, and a Caddy edge. Compose and Dockerfile contracts require immutable image inputs for Node, Ollama, and Caddy. The edge provides compression, baseline security headers, direct health/readiness/API routing, and JSON access logs.

The API health endpoint is separate from production readiness. `/healthz` indicates process liveness. `/readyz` fails closed when the worker heartbeat or backup verification is stale or unhealthy. The worker is scheduled for retention, deletion, budget, webhook receipt, and operational checks. A production deployment must supply the environment values validated by `infra/portal/preflight` and must pass database migrations, RLS, backup restoration, provider connectivity, and container-startup checks.

## 8. Migration phases and current status

| Phase | Scope | Current evidence | Status |
|---|---|---|---|
| 0 | Repository and boundary reconciliation | Git history reconciliation and current-scope decision | Locally verified |
| 1 | Application and data contracts | Profile lifecycle, route contracts, API builds, catalog-health report | Locally verified; live DB pending |
| 2 | Privacy and operations | Deletion queue, webhook receipts, worker retention, role controls | Locally verified; live identity/DB pending |
| 3 | AI/output controls | Reviewed five-case output set, gateway budgets, policy/schema checks | Locally verified; live providers pending |
| 4 | Commercial/referral boundary | External storefront links, blocked commerce routes, vendor-safe payloads | Locally verified; agreements/catalog pending |
| 5 | Deployment and edge | Caddy, Compose, immutable image contracts, readiness checks | Contract-verified; Docker/hosting pending |
| 6 | Browser/mobile/accessibility | 29-route proxy journey, MGT mark/main landmark, Expo contract and tap targets | Locally verified; real-device/browser audit pending |
| 7 | Release controls | Secret-free CI and full local release gate | Locally verified; GitHub-hosted run after merge pending |
| 8 | Analytics SDK | Package `0.2.0`, runtime validation, release checkpoint integration | Locally verified |

The latest local checkpoint passed all seven local gates. The release decision remains **NOT READY** because `infra/portal/.env` is absent and live environment validation has not occurred.

## 9. Verification evidence

The current evidence set includes:

- `work/checkpoints/2026-09-23T00-08-34-590Z/report.md`
- `work/verification/2026-09-23T00-08-39-783Z/report.md`
- `infra/portal/RELEASE-CHECKPOINT.md`
- `BUILD-READINESS-GUIDE.md`
- `packages/analytics-sdk/src/index.ts` and its package tests
- `packages/ai-gateway/src/task-registry.ts`, gateway controls, and adapter tests

Evidence proves local compilation, deterministic tests, production web build, proxy journey, mobile contract, public-artifact scan, analytics contract, and release-gate behavior. It does not prove live provider inference, model availability, hosted cost accuracy, PostgreSQL concurrency, RLS, backup restore, real browser/WCAG compliance, Docker image startup, or production deployment.

## 10. Production cutover requirements

Before a production decision:

- Supply and validate production environment values, immutable image digests, origins, database, Supabase identity, worker timing, webhook, and backup settings.
- Apply and verify migrations, RLS policies, deletion behavior, transaction concurrency, and backup restoration against the target Postgres instance.
- Confirm approved catalog/matching data, routine-slot coverage, ingredient data, and SME rules.
- Validate Ollama model availability, DeepSeek fallback, OpenClaw behavior if enabled, OpenAI Responses API access, entitlements, provider usage accounting, and provider-side spend limits.
- Run container startup and readiness checks with the target images.
- Run browser and accessibility checks against the deployed routes, including the shared MGT mark, landmark, keyboard behavior, error states, and mobile tap targets.
- Complete company, legal, privacy, vendor-agreement, shipping, and referral copy review.
- Re-run the full release checkpoint and archive the new evidence with the release commit.

## 11. Reconciled conflicts and decisions required

The historical Drive migration document references Gemini removal, GPT-4o variants, Anthropic Claude, and a broader provider roster. The current registry instead uses Ollama, DeepSeek-local, optional OpenClaw, GPT-5.6 Sol, and GPT-6 Astra. This document follows the repository and flags the old roster as historical.

The historical Drive blueprint also describes direct commerce, broad health/wellness capabilities, telehealth, wearables, and a six-month commercialization plan. The current scope is a skincare referral portal with blocked direct commerce and no diagnostic or telehealth claim. Those capabilities remain deferred product ideas and must not be represented as implemented.

Unresolved decisions are whether to enable OpenClaw after target-environment testing, which approved catalog and matching dataset will be used, which hosted model entitlements and provider spending limits will be purchased, and which deployment/backup/identity providers will be approved. No credentials or external validation are implied by this document.

## 12. Next implementation phase

The detailed execution sequence is [`NEXT-PHASE-IMPLEMENTATION-PLAN.md`](NEXT-PHASE-IMPLEMENTATION-PLAN.md). It scopes customer-care, onboarding, routine-guidance, and product/referral education roles around existing journeys and the gateway. OpenClaw remains disabled until runtime, safety, privacy, latency, and failure behavior pass staging qualification. Agents may explain or draft; routine mutations remain deterministic and customer-confirmed. Agents cannot claim a retailer payment succeeded or take payment, refund, account, or medical actions.

Payment status is separated by merchant: retailer confirmations and receipts belong to the retailer, and MGT product checkout remains blocked. The repository now includes three provisional subscription options—Essential, Personalized, and Professional—with draft comparison content, a deterministic saved-preference recommendation, six named monthly/annual Price inputs, plan-aware Checkout/portal routing, and signed-event plan reconciliation. Subscription enrollment remains disabled until each offer, price, entitlement, terms, support owner, account, and staging result is approved. A signed provider event, not a browser return page, remains the basis for subscription status. The recommendation makes no paid model call and cannot enroll or charge a user. All local gates passed at `work/verification/2026-09-25T16-05-56-744Z/report.md`; live sandbox behavior remains unverified. The GTM plan starts with consented, measurable owned/organic experiments and gates paid campaigns, affiliate claims, and profit reporting on measured baselines, written terms, and approved spend.

The repository now includes a privacy-safe referral engagement baseline. It records only daily aggregate counts for allowlisted retailer destination opens and saved-list changes, presents a 30-day retailer/segment view to superadmin and compliance roles, and applies a configurable 180-day retention period. It excludes identity, profile, search, free text, retailer-site activity, order, amount, revenue and profit data. The results describe portal actions only and cannot support conversion, revenue or profit claims; partner terms and commercial attribution remain pending.

Assistant journey measurement is implemented with the same aggregate retention control. The server groups outcomes by the four approved assistant roles and records next-step selections only for allowlisted internal destinations. Superadmin and compliance reporting shows guidance volume and the aggregate Support handoff funnel without question text, customer identifiers, account data, email addresses or ticket content. These counts do not establish unique users, support delivery or resolution quality.

The support lifecycle includes operator self-assignment and a controlled internal escalation reason selected from a short fixed list. Customer views and account exports exclude that reason and operator identity. Superadmin and compliance reporting exposes aggregate reason selections only. This improves local triage records but does not configure a helpdesk, name a support owner, deliver a message, or establish a service-level commitment.

The shared navigation shell now places focus on the main landmark after an in-portal route change. Its mobile menu places focus on the first primary destination when opened, and Escape closes it and restores focus to Menu. This is a locally verified keyboard-navigation improvement; complete screen-reader, mobile-device, contrast and WCAG evidence remains outstanding.

The production proxy journey additionally asserts the shared Skip to content link, primary-navigation identity and label, main landmark, labeled policy navigation, and alternative-text attributes on rendered images for all 29 portal routes. This local production-build contract prevents baseline markup regressions but does not substitute for assistive-technology, contrast, zoom/reflow, mobile-device, or WCAG validation.

The local release gate now calculates contrast for 20 normal-text pairs from the declared dark and light theme tokens and requires at least 4.5:1. All pairs pass, with a minimum of 5.82:1, and the same contract protects reduced-motion, forced-color, and visible-focus declarations. Rendered component states, images, zoom/reflow, browsers, devices, and assistive technology remain outside this automated evidence.

The next three repository-ready accessibility phases are also locally implemented. The shared shell now maintains route-specific document titles and a polite route-change announcement while focusing the new main content. Support, Skin Coach, and account sign-in expose busy and associated server-error states, and the error boundary focuses its recovery heading. Web type checks, focused interface checks, and the full local release gate passed at `work/verification/2026-09-25T00-32-24-686Z/report.md`; deployed browser, screen-reader, keyboard, zoom/reflow, device and full WCAG validation remain open.

Five subsequent repository-ready interaction phases are locally implemented: shared modal labeling and focus restoration, announced retailer-shortlist state, linked Shop filter/results feedback, linked reviewed-library search/results feedback, and Replenishment busy/error/total status. Focused web checks and the full local release gate passed at `work/verification/2026-09-25T00-54-25-023Z/report.md`. They do not change retailer ranking, knowledge content, purchasing, payments, reminders, branding or layout, and deployed assistive-technology evidence remains open.

Five further repository-ready account and subscription phases are locally implemented: programmatically grouped membership choices, renewal-confirmation focus restoration, invited-access form and one-time-link feedback, shared Beauty & Style save/download feedback, and confirmed billing-activity status. Focused web checks and the full local release gate passed at `work/verification/2026-09-25T01-01-25-696Z/report.md`. Trial, entitlement, privacy, signed-event, retailer and payment-receipt boundaries are unchanged; live services and deployed accessibility evidence remain open.

Five operator-facing repository phases are locally implemented: associated gated-action reasons, native keyboard selection for knowledge objects and ingredient rules, operator-role form state, and advisory-analysis/spending-reconciliation form state. Focused admin/web checks and the full local release gate passed at `work/verification/2026-09-25T15-39-47-034Z/report.md`. Authorization, SME approval, provenance, audit, cost and rate-limit boundaries are unchanged; live operator/provider and deployed accessibility evidence remain open.

Five support-operations phases are also locally implemented. Each ticket has independent busy/error/success state; the customer-reply requirement is visible and enforced before the API call; request/reply history has named structure and machine-readable dates; operator metrics and tables expose semantic labels, captions, scoped headers and keyboard access; and audit/draft evidence carries clearer busy, error and time semantics. Focused render checks and every full local release gate passed at `work/verification/2026-09-25T16-34-14-942Z/report.md`; all seven local checkpoint gates passed at `work/checkpoints/2026-09-25T16-34-13-262Z/report.md`. Evidence includes 70 HTTP/persistence/release-contract tests, the production build, 29-route proxy journey and zero-hit public artifact vendor scan. This does not name a support owner, send an external message, validate a deployed identity provider or establish complete WCAG conformance.

The first role-routing contract is locally implemented at commit `8444aa7`: `POST /api/hub/assistant` gives deterministic onboarding, support, account and payment handoffs, and sends signed-in, consented routine/product questions through the existing reviewed Coach path. Full local verification passed with evidence at `work/verification/2026-09-23T01-18-44-476Z/report.md`. Commit `518274b` adds a small Support-page guidance panel using the existing logo and layout; general onboarding and retailer directions were checked in the browser without an AI provider. API compilation, portal checks, web production build and 28-page proxy journey passed. Support delivery, OpenClaw runtime qualification, payment confirmation workflows and GTM execution remain planned. Production remains **NOT READY** because `infra/portal/.env` is absent and live data, provider, backup, container, catalog, and full accessibility gates remain open.

Commit `08c9ca4` adds 18 engineering candidate policy cases across the four assistant roles, verifies deterministic requests do not call AI or payment providers, strengthens reaction/privacy/payment routing, and returns a Support handoff when reviewed knowledge or a verified answer is unavailable. The cases await SME and privacy-owner approval. Full local verification passed at `work/verification/2026-09-23T01-51-10-062Z/report.md`; this does not establish production readiness.

Commit `f075a43` improves the existing Support guidance focus flow: new answers and errors receive focus, and a Support handoff focuses the labeled request form without submitting it. Web production build, 28-page proxy journey, and focused browser accessibility-tree checks passed. Full keyboard, screen-reader, mobile, contrast, and WCAG review remains open; the MGT logo and shared layout are unchanged.

## 13. Source map

- AI registry and gateway: `packages/ai-gateway/src/task-registry.ts`, `packages/ai-gateway/src/gateway.ts`, `packages/ai-gateway/src/adapters/`
- Analytics contract: `packages/analytics-sdk/src/index.ts`, `packages/analytics-sdk/package.json`
- Portal scope: `CURRENT-SCOPE.md`, `infra/portal/README.md`
- Provisional plan catalog and billing mapping: `apps/api/src/portal/plans.ts`, `apps/api/src/portal/billing.ts`, `apps/web/src/app/membership/page.tsx`
- Support operations interface and render contracts: `apps/web/src/components/ConnectedAdmin.tsx`, `apps/web/src/__smoke__/admin-render.tsx`
- Release evidence: `infra/portal/RELEASE-CHECKPOINT.md`, `work/checkpoints/`, `work/verification/`
- Readiness plan: `BUILD-READINESS-GUIDE.md`
- Next implementation phase: `NEXT-PHASE-IMPLEMENTATION-PLAN.md`
- Product blueprint: `SkincareAIPlatformBlueprint.md`
- Drive migration document: [mgt-skincare-ai-infra-migration-v2.md](https://docs.google.com/document/d/1Oz7oNwUdV38KmD7fxoTZo-G_GQr1EUHjSNNS6uza2J4/edit)
