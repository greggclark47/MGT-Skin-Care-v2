# Skincare AI Platform Blueprint

**Version:** 2.1.13-planning
**Revision date:** 2026-09-24
**Status:** Current implementation and production-readiness blueprint  
**Product:** MGT Skin Care v2

This blueprint describes the product that exists in the verified repository and the work required to operate it safely. It preserves the current MGT logo, dark retail UX, routes, APIs, tests, and external-referral boundary. It replaces unsupported claims in the historical Drive blueprint with evidence-backed status labels.

## 1. Product definition

MGT Skin Care v2 is a skincare discovery and routine-guidance portal. It helps a visitor explore skin concerns, receive a bounded skin-match result, build a routine, ask a care coach for product-owned guidance, save a shortlist, and follow independent external storefront links. The portal is educational and product-guidance software. It is not a diagnostic, telehealth, medical-record, or direct-commerce system.

The shop currently provides six independent external retailer links with filters and saved lists. The portal does not process checkout, carts, fulfillment, refunds, payouts, affiliate attribution, or consumer membership billing. Vendor-of-record responsibilities remain with each external storefront.

## 2. Product objectives and non-goals

Objectives:

- Make the path from concern to understandable skincare routine short and trustworthy.
- Keep recommendations explainable, bounded, and grounded in approved product and ingredient data.
- Use local inference for routine traffic and reserve hosted reasoning for entitled, higher-value tasks.
- Give operators safe readiness, catalog-health, privacy, webhook, and AI-economics views.
- Measure useful product behavior without collecting unnecessary sensitive content.
- Keep the application testable in local sample mode while making production blockers explicit.

Non-goals for the current release:

- Diagnosing skin conditions or prescribing treatment.
- Operating a marketplace, payment system, fulfillment service, or vendor payout system.
- Claiming live provider, database, deployment, browser, or device validation from local tests.
- Shipping the historical broad health/wellness, wearable, telehealth, or direct-commerce roadmap as implemented functionality.

## 3. Core user journeys

| Journey | Current behavior | Evidence/status |
|---|---|---|
| Skin Match | Guided questionnaire and result route produce a bounded match explanation and next-step routine guidance | Local route and reviewed-output coverage; approved matching data still required |
| Routine Builder | User assembles routine slots and receives product/ingredient explanations | Local deterministic and gateway tests; catalog completeness pending |
| Care Coach | Account-aware, scoped questions can use local-first AI; hosted escalation is entitlement-gated | Local gateway/API coverage; live providers and identity pending |
| Shop and referral | User filters six independent storefront destinations, saves retailers, and leaves the portal to purchase | Referral integration suite and proxy journey pass; external destination agreements pending |
| Saved and replenishment | User saves shortlist items; worker can create a review alert without placing an order | Local lifecycle and worker checks; production worker/database pending |
| Account and privacy | User can view profile state, export data, schedule/cancel deletion, and resolve guest merge choices | Local API/web regression coverage; live Supabase behavior pending |
| Operations | Restricted roles inspect catalog health, AI economics, deletion queue, webhook receipts, and operator analysis | Local authorization and redaction coverage; first-superadmin provisioning and live services pending |

The production web journey verifies 28 portal routes, the shared MGT mark (`mgt-mark.svg`), and the `main` landmark. Route names and layout are part of the current product contract.

## 4. Platform architecture

```text
Browser / Expo contract
        |
   Caddy edge (headers, compression, health/readiness, JSON logs)
        |
   Web app ---------------- API ---------------- Operations worker
        |                    |                         |
   route UI           domain + AI gateway       retention, alerts,
   shared mark        auth/CSRF/origin          deletion, receipts,
   accessible shell   referral boundary         backups/readiness
                             |
          SQLite/sample mode | Supabase/Postgres target
                             |
              Ollama -> DeepSeek/OpenClaw -> OpenAI escalation
```

The web app, API, worker, Caddy edge, and Compose/Dockerfile contracts are represented in `apps/` and `infra/portal/`. Node, Ollama, and Caddy images require immutable inputs in the target deployment. The local preview is a development environment with sample data.

## 5. AI intelligence and API strategy

The active registry is `packages/ai-gateway/src/task-registry.ts`. It is the authority for task-to-model routing.

| Intelligence level | Model path | Use | Control |
|---|---|---|---|
| Level 0 — deterministic | Typed domain rules and schemas | Safety policy, entitlement, catalog filters, routine slots, referral destinations, data lifecycle | No model call; fail closed on invalid input |
| Level 1 — local fast | Ollama `llama3.2:3b` | Routine narratives, product why, ingredient tips, coach/support drafts, summaries, intent | Local-only default; bounded context and output schema |
| Level 1 — local reasoning | Ollama `deepseek-r1:8b` | Fallback reasoning for routine tasks | Local fallback; no hosted charge |
| Level 1 — local vision/embedding | Ollama `llava:latest`, `nomic-embed-text` | Vision attributes and embeddings | No hosted vision fallback in current build |
| Level 1 — optional agent compatibility | OpenClaw via native Ollama contract | Local fallback only after target testing | Disabled until model sync, tool behavior, and failure handling pass |
| Level 3 — hosted premium | GPT-5.6 Sol | Premium consultation and permitted hosted fallback | Identified account, premium entitlement, budget reservation, usage validation |
| Level 3 — hosted deep analysis | GPT-6 Astra | Deep routine optimization and restricted operator analysis | High reasoning, entitlement, consent/role checks where applicable, budget and audit |

The hosted path uses the server-side OpenAI Responses API. A ChatGPT subscription is not an API credential. Provider adapters validate returned usage and model identity; uncertain charges retain a hold for manual reconciliation rather than replaying the request.

LangChain Core is used only as a bounded prompt/context pipeline. It is not the source of routing policy, entitlement, billing, or safety decisions.

## 6. Data model, privacy, and governance

The data plane is designed around minimum necessary product data:

- Account/profile and questionnaire state support the user journeys and guest-to-account merge flow.
- Catalog, ingredient, routine-slot, retailer, and approved-rule records support explanations and matching.
- AI reservations, telemetry, webhook receipts, audit entries, deletion jobs, and worker heartbeats support operations.
- Prompt content is not surfaced in broad operator payloads. AI-economics views expose aggregate counts and cost metadata, not customer content.
- Referral URLs contain no customer profile data.
- Deletion has a cancellation period, blocker checks, anonymized retained records, and completion proof without account identifiers.
- Analytics events are registered with privacy and retention classes. The SDK rejects unknown events, malformed properties, and undefined required values.

Production requires Supabase/Postgres, RLS, a service-role boundary, migration verification, backup restoration, and concurrency testing. Local SQLite/sample mode demonstrates behavior but is not a production claim.

## 7. Analytics and data-point accuracy

The analytics SDK is package version `0.2.0`. It provides a typed event registry, property-shape validation, required-property checks, identity stitching controls, and privacy/retention metadata. The release checkpoint includes its contract smoke suite.

Operational metrics must be read with their measurement definition:

- Gateway telemetry records are attempt-level records; validation failures can create more than one record for a request.
- Token estimates are conservative admission values and are not provider invoices.
- Hosted charges require provider-side reconciliation; actual cost can exceed an estimate.
- Local inference cost is represented as zero provider charge in local fixtures and does not include hardware or hosting cost.
- Referral click and vendor conversion data are not currently collected or claimed.

These definitions keep dashboards economically useful without overstating accuracy.

## 8. Build phases and completion status

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Scope, branch, and history reconciliation | Complete locally |
| 1 | Application, profile, catalog-health, and API contracts | Complete locally; live data pending |
| 2 | Privacy, deletion, roles, receipts, worker/readiness | Complete locally; live identity/DB pending |
| 3 | AI gateway, reviewed outputs, policy and schema controls | Complete locally; live providers pending |
| 4 | Referral boundary, saved lists, replenishment alerts | Complete locally; catalog/agreements pending |
| 5 | Edge, Compose, Dockerfile, immutable image and preflight contracts | Contract complete; Docker/hosting pending |
| 6 | 28-route journey, shared branding, Expo/mobile/accessibility contracts | Contract complete; browser/device audit pending |
| 7 | CI and release checkpoint | Complete locally; hosted CI after merge pending |
| 8 | Analytics SDK and checkpoint integration | Complete locally |

Latest evidence: `work/checkpoints/2026-09-23T00-08-34-590Z/report.md` and `work/verification/2026-09-23T00-08-39-783Z/report.md`. All seven local checkpoint gates passed. Production readiness remains **NOT READY** because `infra/portal/.env` is absent and live gates are open.

## 9. Test and readiness matrix

| Area | Local evidence | Production gap |
|---|---|---|
| API and web compilation | Passing local builds and type checks | Run in target CI/deployment environment |
| AI routing | Registry, adapter simulation, entitlement/budget/schema tests | Live Ollama models, OpenAI access, usage and spend controls |
| Data lifecycle | Guest merge, deletion, retention, redaction tests | Supabase identity deletion, Postgres RLS/concurrency, legal retention |
| Commerce boundary | Referral integration and blocked-commerce assertions | Approved retailer catalog, agreements, external destination review |
| Operations | Readiness, webhook receipts, catalog health, AI economics | Backup restoration, worker scheduling, production alerting |
| Deployment | Compose/Dockerfile/preflight contracts | Immutable image resolution, Docker startup, hosting and secrets |
| UX/accessibility | 28-route proxy journey, logo/main landmark, mobile contract | Real browser, keyboard, WCAG, device, network/error-state audit |
| Security/privacy | Server-side key boundary, origin/CSRF, roles, redaction | Penetration review, production secret rotation, RLS audit |

## 10. UX and brand invariants

The current GPT build remains intact. The following are product contracts:

- Preserve the existing MGT logo and shared `mgt-mark.svg` treatment.
- Preserve the dark retail structure, navigation, route names, page hierarchy, and `main` landmark.
- Preserve external-referral behavior and the absence of direct checkout/cart/payment flows.
- Keep AI copy product-owned, bounded, and free of diagnostic or unsupported medical claims.
- Keep local sample data clearly separate from production data.
- Keep mobile and desktop controls keyboard-accessible and sized for the current tap-target contract.

## 11. Open gaps and next actions

Critical production gaps are environment configuration, database/RLS and identity validation, backup restoration, provider/model availability, and container/deployment startup. High-priority gaps are approved catalog/matching data, retailer agreements, browser/WCAG audit, provider cost reconciliation, hosted CI evidence, and first-superadmin provisioning. Medium-priority gaps are deferred commercial attribution, broader reporting, and any future health/wellness expansion.

Next actions should be executed in this order:

1. Create a production-like environment with approved secrets and immutable image references.
2. Apply migrations and validate RLS, identity, deletion, worker, and backup behavior.
3. Load and review approved catalog/matching data and SME rules.
4. Validate local model availability and entitled hosted routes with provider-side limits.
5. Run container, browser, accessibility, mobile, and incident-recovery checks.
6. Re-run the release checkpoint, archive evidence, and make a separate production deployment decision.

## 12. Reconciliation with the historical blueprint

The Drive document `SkincareAIPlatformBlueprint` is a useful historical planning source but includes unsupported or deferred claims about a broad MGT Health & Wellness platform, wearables, telehealth, direct commerce, subscription economics, and a mixed GPT/Gemini/Claude roster. Those ideas are retained only as future options. The current product is the focused skincare referral portal described here.

References:

- [GitHub branch](https://github.com/greggclark47/MGT-Skin-Care-ChatGPT-Web-Portal-Build-V2.5/tree/codex/reconcile-main-2026-09-20)
- [Historical Drive blueprint](https://docs.google.com/document/d/1Ya7XweYOuCEasfXsEo0Z34gBxsXyKKvaDCnJyQSTcfk/edit)
- [Migration blueprint](mgt-skincare-ai-infra-migration-v2.md)
- [Current scope](CURRENT-SCOPE.md)
- [Portal infrastructure](infra/portal/README.md)
- [Release checkpoints](infra/portal/RELEASE-CHECKPOINT.md)

## 13. Next implementation phase

The detailed execution sequence is in [`NEXT-PHASE-IMPLEMENTATION-PLAN.md`](NEXT-PHASE-IMPLEMENTATION-PLAN.md). It extends existing journeys with constrained customer-care, onboarding, routine-guidance, and product/referral education roles. The gateway remains the model-routing boundary. OpenClaw is optional and stays disabled until its runtime and tool boundaries pass qualification. Any new customer-facing flow must preserve explicit consent, approved-source grounding, deterministic routine changes, safe escalation, and human handoff.

Payment records remain separated by merchant. MGT does not issue confirmations or receipts for external retailer purchases. MGT product checkout remains blocked. Subscription code is separately gated and locally tested with a mocked provider; prices, benefits, terms, and live provider behavior are unverified. Future subscription confirmation must use signed provider events and provider-issued receipts or invoices, with owner-only status and sanitized operator visibility.

GTM work starts with consent-aware measurement and low-cost owned/organic learning. Affiliate attribution, partner claims, sponsored placement, and paid campaigns require written terms, approved disclosures, baseline economics, and a budget cap. Financial optimization must retain recommendation quality, safety, accessibility, and privacy controls. These items are planned and do not change the current release status.

The first referral measurement baseline is now repository-ready: the portal counts allowlisted outbound retailer opens and saved-list changes as daily aggregates and exposes a 30-day retailer/segment summary only to superadmin and compliance roles. It retains no customer identity, profile, search, free text, retailer order, amount, revenue or profit data in those counters. The default retention period is 180 days. These actions must not be reported as unique customers, purchases, conversion, revenue or profit; partner agreements and commercial attribution remain unresolved.

The assistant journey now has the same aggregate-only measurement boundary. Guidance results are grouped by the four bounded roles, and next-step selections are accepted only for approved internal portal paths. Authorized operators can compare handoffs offered, Support opened and guided requests saved without receiving questions, customer identity, account details or ticket content in the metrics. These are action counts rather than unique-user or guaranteed-resolution measures.

Support operations now include a controlled internal escalation reason and self-assignment on update. Only superadmin and compliance roles can select the fixed categories; the customer and data-export views exclude the reason and operator identity. The operator dashboard uses aggregate reason counts for queue awareness. It remains a local support record and does not imply a staffed service, external delivery or response-time promise.

The shared portal shell now manages keyboard focus on navigation. In-portal route changes focus the main landmark, while opening the mobile menu focuses its first destination and Escape returns focus to Menu. This keeps the existing brand and route structure intact while improving local keyboard navigation. A complete device, screen-reader, contrast and WCAG audit remains open.

The production proxy journey now also guards shared rendered accessibility markup across all 29 portal routes: a Skip to content link, primary-navigation identity and label, main landmark, labeled policy navigation, and alternative-text attributes for rendered images. The evidence is local and production-build based; it does not establish real keyboard traversal, announcement quality, contrast, zoom/reflow, device behavior, or WCAG conformance.

The release gate now calculates contrast for 20 declared normal-text token pairs across the dark and light themes, requiring at least 4.5:1; all pass, with a 5.82:1 minimum. It also protects reduced-motion, forced-color, and visible-focus declarations. These automated checks cover the token contract rather than every rendered component, image, state, browser, device, or assistive-technology experience.

Three additional local accessibility phases are implemented. Every current customer and operator route receives a concise browser title and a polite page-change announcement alongside main-landmark focus. Support, Skin Coach, and account sign-in forms expose busy state and associated server errors, with stale field errors cleared on edit. The application error boundary focuses its recovery heading. These changes preserve the existing visible shell and do not establish deployed screen-reader, keyboard, device, zoom/reflow, or complete WCAG evidence.

The first assistant role contract is locally implemented at commit `8444aa7`. `POST /api/hub/assistant` returns deterministic onboarding, customer-care, account and payment guidance or a next-step handoff. Signed-in, consented routine/product questions reuse the reviewed Coach path. The API build, focused portal/Coach checks and full local verification passed at `work/verification/2026-09-23T01-18-44-476Z/report.md`. Commit `518274b` places a guidance panel in the existing Support page, displays next-step links and reviewed citations, and keeps general onboarding and retailer directions available without an AI provider. API compilation, portal checks, web production build, 28-page proxy journey, and focused browser checks passed. External support delivery and OpenClaw activation remain open.

Commit `08c9ca4` hardens the assistant policy boundary with 18 engineering candidate API cases. It tests deterministic safety, payment, retailer, account and onboarding routing without AI or payment calls, plus missing-source, no-match, consent and rejected-excerpt behavior. Missing reviewed knowledge or a rejected model answer now produces a Support handoff. Full local verification passed at `work/verification/2026-09-23T01-51-10-062Z/report.md`. SME and privacy review of the candidate cases, approved catalog coverage and live service validation remain open.

Commit `f075a43` improves keyboard focus in the Support guidance panel without changing the MGT logo or shared layout. New answers and errors receive focus, and the Support handoff focuses the labeled request form without creating a ticket. Web production build, 28-page proxy journey, and focused browser accessibility-tree checks passed. Full screen-reader and WCAG review remains open.

## 14. Source map

- Implementation plan: [`NEXT-PHASE-IMPLEMENTATION-PLAN.md`](NEXT-PHASE-IMPLEMENTATION-PLAN.md)
- Current scope: `CURRENT-SCOPE.md`
- Business/GTM assumptions: `business/OPERATING-MODEL-AND-GTM.md`
- Billing and subscription setup: `infra/portal/README.md`
- OpenClaw and hosted model routing: `packages/ai-gateway/src/task-registry.ts`, `packages/ai-gateway/src/runtime.ts`
- Release gates and evidence: `infra/portal/RELEASE-CHECKPOINT.md`, `BUILD-READINESS-GUIDE.md`
