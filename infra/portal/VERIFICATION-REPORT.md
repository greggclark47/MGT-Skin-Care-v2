# Build and verification checkpoint — v1.5

## Scope and evidence rules

[VERIFIED] Source edits preserve the Next.js portal, existing authentication and AI gateway, dark UI, and USD placeholder prices. No production services, live customer records, external payments, or repository remotes were changed. A local build is not deployment.

[VERIFIED] `node infra/portal/verify.cjs` creates a timestamped `work/verification/<timestamp>/report.md`, raw command logs, and `results.json`. The report includes individual assertions, not just totals. It also inventories exported units and route declarations; units without a complete valid/boundary/malformed input matrix are explicitly UNTESTED. This inventory includes legacy and inactive code; it is not proof of the mounted production surface.

[ASSUMED — evaluation threshold] Expected-output agreement must be 100% for the ten hand-authored deterministic policy cases in `packages/shared/test/accuracy-cases.cjs`. This is a small regression oracle, not independent clinical validation or an assessment of generated answers. Live AI accuracy, the proposed larger golden set, and current external pricing remain unverified. Pricing smoke tests check internal fixture consistency only.

## Latest executed result

[VERIFIED] Final source run: `work/verification/2026-09-20T16-58-50-872Z/report.md`; the neighboring `results.json` and logs hold individual results. This run is the current evidence, not the superseded capture runs. The command exits **0**.

| Component | Test type | Status | Evidence |
| --- | --- | --- | --- |
| Domain, gateway, shared client, API | Compilation | PASSED | Four package build logs |
| Web | Production build | PASSED | `web-production-build.log` |
| Web → API → local data | End-to-end HTTP | PASSED | `production-web-proxy-journey.log`: seven rendered routes plus authenticated profile CRUD, export, stale rejection, subscriptions and saved retailers |
| API, profiles, invitations, billing, worker, transport | Regression | PASSED | `HTTP-and-persistence-regressions.log`: 50 tests, 50 pass, zero skipped; public export and operator boundary assertions included |
| Known-input policy cases | Expected-output agreement | PASSED | 10/10 cases, 100% required; included in the regression log |
| Public bundle | Vendor-name scan | PASSED | Fresh Next artifact and static demo have zero configured vendor/model-name matches |
| Exported units / route declarations | Exhaustive valid/boundary/malformed matrix | UNTESTED | 411 unit entries and 108 route declarations are inventoried without falsely certifying complete coverage |
| Live databases, services and browser interaction | Production validation | UNTESTED | No live execution evidence supplied |

## Fixes and specific regression evidence

| Severity | Failure before change | Root cause / scoped correction | Executed follow-up |
| --- | --- | --- | --- |
| WARNING | Web client smoke failed `MODULE_NOT_FOUND` for `.smoke-build/lib/hub` | Compile smoke dependencies before executing; keep the client recovery checks in the package script. | `web client recovery` passes in the combined evidence. |
| WARNING | Two smoke runners failed before assertions with `uv_os_get_passwd ... ENOMEM` | Use the already installed compiler and execute emitted JavaScript; avoid the failing runner initialization. | Gateway and web assertion logs pass. |
| WARNING | Malformed JSON returned 500, expected 400 | Parser errors were treated as internal failures. Object-shaped writes and safe parser-error mapping now reject malformed input. | `profile: malformed JSON ...` passes. |
| WARNING | Create-profile response differed from subsequent read | Save returned the pre-persistence object, omitting consent metadata. Return the exact saved record and revision. | `profile: create/read are identical ...` passes. |
| CRITICAL | Concurrent stale profile edits both returned 200 | No expected revision or shared record lock. Atomic compare-and-write adds a revision, audit, and removal tombstone. | Concurrent/stale-client and injected rollback tests pass in local storage. PostgreSQL concurrency remains UNTESTED. |
| CRITICAL | Signing in silently discarded an existing guest profile | Guest-to-account migration deleted the source despite conflicting target data. Conflict guard preserves both and returns 409. | The no-silent-discard and style preservation checks pass. Conflict-resolution UI remains open and this path is not fully operational. |
| WARNING | Domain test script could swallow a missing test runner failure | Remove the success-producing fallback and run the deterministic pipeline directly. | Domain pipeline executes and exits successfully. |
| WARNING | First combined capture run reported socket resets | Concurrent nested execution produced `ECONNRESET`; the exact environmental cause is unproven. Use asynchronous capture and serial suite orchestration, keeping concurrency inside relevant tests. | Later combined run passes. The failed capture is retained rather than rewritten. |
| WARNING | Repeat web build failed with `EINVAL ... readlink` in generated `.next` files | Preserve the failed generated folder, then rebuild from source. The OneDrive/reparse-point cause is suspected, not proven. | Final production build and web-proxy journey pass. No source or customer data was deleted. |
| WARNING | Failed build could yield a zero-hit artifact-scan pass | The harness now requires a successful build and existing outputs before a zero-hit result is accepted. | The v1.4 run completes the production build and records a zero-hit public artifact scan with exit 0. |

## Guest access — approved policy and implementation boundary

[GIVEN — user choice] Both basic and matching-owner invitations are offered. One pending invitation or active invitee per owner; independent private profiles; no delegation of owner billing/admin rights; revocation; 30-day access after acceptance. Matching access follows the owner's current confirmed entitlement and uses the owner's existing coach budget/rate keys. Basic access does not inherit paid entitlement. Existing individual subscriptions remain independent.

[VERIFIED] The invitation route accepts only the intended, signed-in email. Tokens are hashed in storage, returned once as link fragments, and not embedded in request URLs. Pending invitations expire after 30 days. Replay does not extend accepted access. Expired/revoked invited users cannot access protected personal features without independent paid entitlement; account export and upgrade-related routes remain available. No email is sent automatically: the owner shares the generated invitation link.

[VERIFIED] `apps/api/test/guest-access.cjs` executes intended-email denial, personal-profile isolation, 30-day bounds, no inherited admin/billing access, no invitation chains, owner-budget charging, shared rate exhaustion, owner downgrade, basic-mode restrictions, revocation, expiry, malformed inputs, CSRF, and simultaneous one-guest-limit checks. External identity and coach generation are test doubles; these results do not prove live authentication, generated answer quality, or database isolation.

## Consolidated open items / release gates

| Severity | Item | Status / required evidence or decision |
| --- | --- | --- |
| CRITICAL | Live database merge and profile synchronization | UNTESTED. Supply the target project, both migration histories, explicit identity mapping, read-only schema/RLS evidence, and a staging connection. Require reconciliation counts, rollback/restore rehearsal, cross-account RLS tests, and PostgreSQL race/failure tests. No migration or live record merge has run. |
| CRITICAL | Conflicting guest/account data | Safe refusal is implemented, but sign-in needs an approved merge-choice flow that preserves both drafts without reusing a consumed sign-in code. Do not treat the 409 safety guard as completion of synchronization. |
| WARNING | Vendor-neutral public boundary | The generated client artifact, static demo, client-facing responses, and admin views are now neutral and the fresh scan has zero matches. Live checkout destination policy remains unverified and requires an explicit decision if a strict no-provider URL rule is applied to billing. |
| WARNING | Exhaustive function/endpoint input coverage | UNTESTED for units not fully covered by named assertions. The generated inventory deliberately does not convert aggregate test success into per-unit certification. |
| WARNING | Live auth, billing, model runtime, notifications, identity deletion, container startup | UNTESTED. Loopback HTTP failure/timeout checks and signed fixture webhooks are not live service validation. No Docker or database client was found on the command path during this pass. |
| WARNING | Browser-driven interactions, 375px layout and keyboard audit | UNTESTED this pass. Production page rendering and real web-proxy HTTP journeys pass, but do not exercise browser clicks or establish WCAG conformance. |
| WARNING | Generated output accuracy | UNTESTED. Deterministic agreement is not evidence of AI answer correctness. Require reviewed known-answer cases for every enabled generation task. |
| WARNING | Monthly subscription economics and guest allowance | Pricing stays as USD placeholders. Existing daily AI cost/rate caps are shared for matching guests; monthly plan quotas and final billing configuration still need approval and implementation. |
| INFO | Repository delivery and mobile source reconciliation | No Git remote is configured. No push, Drive upload, mobile release, container deployment, or app-store build is claimed. |

[VERIFIED] Exit criteria are **not met**. The infrastructure must not be labeled complete or production-ready on the strength of these local tests.
