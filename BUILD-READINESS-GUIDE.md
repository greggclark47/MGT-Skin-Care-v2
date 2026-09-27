# MGT Skin Care build and production-readiness guide

This guide turns the current gap analysis into an execution plan. It separates work that can be completed in the repository from work that requires an approved staging or production environment. The portal remains referral-only until a separate commerce decision changes that scope.

## Current baseline

The latest locally checked Support build is commit `f075a43`; web production build, proxy journey, and focused browser accessibility flow passed. The last full local verification passed for the assistant policy foundation at commit `08c9ca4`, with evidence at `work/verification/2026-09-23T01-51-10-062Z/report.md`. Live services, full accessibility, and SME content review remain open.

- Domain, gateway, shared client, API and web builds pass.
- The local release gate passes compilation, web smoke, API regressions, deterministic policy cases, the production proxy journey and the public artifact scan.
- The browser Skin Match path has been exercised through all nine questions, consented save, results and AM/PM routine tabs.
- `/api/hub/admin/catalog-health` reports catalog approval, required-slot coverage and ingredient-rule readiness without returning customer or vendor details.
- The operations worker expires pending guest-profile merge decisions, and the reviewed-output gate covers five approved task types with zero blocked-claim or invalid-citation failures.
- The referral boundary, immutable image/edge contracts, expanded browser route matrix, shared shell checks, and mobile Expo contract gate are included in the local release run.
- Local demo data is sample-only. It is not evidence of production catalog approval, provider connectivity, database isolation or deployment readiness.

## Phase 0 — change control and evidence

**Goal:** keep every release claim tied to reproducible evidence.

1. Work from a feature branch and keep the working tree clean before each checkpoint.
2. Do not place secrets, customer data, database dumps, generated dependency folders or provider payloads in source control.
3. Record each gate in `infra/portal/RELEASE-CHECKPOINT.md` with date, commit, command and evidence path.
4. Use `pnpm test:verification` for the secret-free local gate. It deliberately does not claim live readiness.
5. Merge the verification workflow to `main`, then confirm a GitHub-hosted run succeeds before calling CI continuous.

**Exit evidence:** clean branch, reproducible verification report, CI run on `main`, no unreviewed generated artifacts.

## Phase 1 — application and data contracts (Critical)

### 1A. Database and migrations

**Build:** keep the database and portal migration lineages separate and versioned. Use `pnpm reconcile:migrations` to create the local manifest.

**Environment:** identify the authoritative Supabase project, region, PostgreSQL host, TLS mode and service-role owner. Export the target migration history without applying anything automatically.

**Tests:**

- Compare target and local manifests; reject missing, changed, reordered or unknown migrations.
- Run profile create/update/delete, stale revision, rollback and concurrent-write tests against staging PostgreSQL using two connections.
- Verify `PORTAL_AUTO_MIGRATE=false` in production.

**Exit evidence:** signed reconciliation report, staging rollback rehearsal, cross-connection concurrency report and approved migration runbook.

### 1B. Identity, sessions and RLS

**Build:** map Supabase Auth users to portal accounts, define duplicate-email handling and preserve guest conflict safety. The local portal now records a short-lived pending merge decision after a verified conflict and requires the user to choose the browser or account profile before linking; no profile is silently discarded.

**Environment:** configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, secure cookie/CSRF secrets and the HTTPS public origin.

**Tests:**

- OTP request/verify and expired-code behavior through the real staging email channel.
- Owner, guest, operator and service-role isolation tests.
- Negative tests proving one account cannot read or mutate another account's profile, saved retailers, reminders, tickets or exports.
- Real identity deletion, retry and partial-failure tests.

**Exit evidence:** identity mapping counts, RLS policy report, staging lifecycle log and first-superadmin provisioning record.

### 1C. Catalog and ingredient safety

**Build:** import approved products and ingredient rules through the draft/review/approval workflow. Keep normalized ingredient keys, provenance, source dates, stock and retailer ownership.

**Environment:** provide the approved source feed or import package and a quarantine location for rejected rows.

**Tests:**

- Run `/api/hub/admin/catalog-health` and require every required slot to have active approved coverage.
- Require every active product ingredient to have an approved SME rule.
- Verify sample records cannot appear in production matching or purchase surfaces.
- Test an import rollback and a stale product/ingredient update.

**Exit evidence:** before/after counts, rejected-row quarantine, slot coverage report, ingredient-rule approval report and rollback proof.

## Phase 2 — operations, recovery and privacy (Critical)

### 2A. Worker and readiness

**Build:** keep API liveness separate from worker/backup readiness. The worker must run as a separate process with a heartbeat and durable operation records.

**Environment:** configure `WORKER_INTERVAL_SECONDS`, `WORKER_READINESS_MAX_AGE_SECONDS`, retention windows and the worker health-file path.

**Tests:**

- Run the worker twice and prove leases prevent duplicate notification delivery.
- Force a stale heartbeat and verify production `/readyz` returns 503.
- Verify future timestamps are rejected for worker runs and backup proofs.
- Test session, rate-limit, notification, billing-receipt, deletion-proof and operation-run retention.

**Exit evidence:** staging worker log, readiness transition log and retention report.

### 2B. Backup and restore

**Environment:** select encrypted off-host PostgreSQL backups; configure a restore destination separate from the application host.

**Tests:** perform a restore rehearsal, compare checksums, run migrations against the restored copy and execute the profile/RLS smoke suite.

**Exit evidence:** restore timestamp, checksum, owner, duration, failed-restore procedure and recorded `/api/hub/admin/backup/verified` proof.

### 2C. Account deletion and legal retention

**Build:** preserve the 30-day cancellation window, blocker checks, identity-first deletion and anonymized transaction/audit records.

**Environment:** configure the Supabase service role and obtain legal approval for retention periods.

**Tests:** eligible deletion, blocked deletion, retry after provider timeout, already-deleted identity, cancellation and audit redaction.

**Exit evidence:** staging deletion transcript, retention approval and privacy review sign-off.

## Phase 3 — AI and output quality (Critical / High)

### 3A. Local AI runtime

**Environment:** run Ollama with approved immutable image and pull only the required models: fast routine model, reasoning fallback, embeddings and optional vision.

**Tests:** health, model inventory, timeout, malformed output, structured validation, fallback, breaker recovery and no-provider-call budget rejection.

**Exit evidence:** model manifest, adapter contract report and latency/error budget report.

### 3B. OpenClaw and hosted escalation

**Environment:** keep `OPENCLAW_ENABLED=false` until native `/api/chat` is tested. Configure `OPENAI_API_KEY` only for an approved server-side escalation path.

**Tests:** live staging calls for premium consultation, deep routine review and operator analysis; verify entitlement, reservation, settlement, timeout holds, provider-model mismatch and reconciliation.

**Exit evidence:** sanitized request/response evidence, provider billing reconciliation, spend-limit configuration and incident procedure. Never expose provider or model names in the public bundle.

### 3C. Reviewed output set

**Build:** create human-reviewed golden cases for Skin Match, Routine Builder, Care Coach, product explanations and operator analysis. Include safety exclusions, citation grounding, uncertainty and prohibited medical claims.

**Tests:** score exact policy cases plus reviewed semantic cases by task. Record the threshold and adjudication process; the current 10 deterministic cases are only a regression floor.

**Exit evidence:** versioned golden set, reviewer sign-off, score report and regression job.

## Phase 4 — commercial, referral and support configuration (High)

### 4A. Referral catalog

Confirm retailer agreements, destination ownership, regional availability, prices, stock freshness and permitted attribution. Keep customer profile data out of outbound retailer links.

### 4B. Plans and billing

Approve consumer/vendor audiences, monthly/annual prices, trial policy, usage allowances, overages, grace periods and terms before enabling billing.

Configure Stripe sandbox products, portal settings and signed webhook secrets. Exercise trial, renewal, decline, cancellation, replay, duplicate and entitlement transitions with test clocks.

### 4C. Notifications and support

Choose in-app-only, transactional email or an HTTPS webhook. Configure retries, duplicate suppression, unsubscribe behavior and an operational recipient. Connect support requests to the approved helpdesk or staff queue.

**Exit evidence:** signed commercial approval, Stripe sandbox report, notification delivery report and support ownership/test ticket.

## Phase 5 — deployment and edge (Critical)

1. Resolve approved immutable `NODE_IMAGE`, `OLLAMA_IMAGE` and `CADDY_IMAGE` digests.
2. Populate `infra/portal/.env` outside source control and run `pnpm infra:preflight`.
3. Build API, worker, web and edge images with Docker Compose.
4. Verify Caddy HTTPS, same-origin API routing, security headers, compression, access logs and signed webhook routing.
5. Verify API `/healthz`, production `/readyz`, web health, graceful shutdown and log rotation.
6. Run the staging proxy journey through the edge rather than directly against the API.

**Exit evidence:** image digest record, preflight output, container logs, health transition report and edge journey report.

## Phase 6 — browser, mobile and accessibility (High / Medium)

**Web:** test Skin Match, My Skin, Routine, Coach, Shop, Saved, Replenishment, Account, deletion, Plans, Support and operator pages at 375px and desktop widths.

Verify keyboard-only navigation, focus order, Escape behavior, tab semantics, validation messages, contrast, reduced motion, non-JSON service errors and responsive overflow.

**Mobile:** add a reproducible Expo build/test command, configure `EXPO_PUBLIC_API_URL`, test authentication/session behavior and run the Skin Match completion path on a supported device or simulator.

**Exit evidence:** browser matrix, accessibility defect log with zero release-blocking defects and mobile build artifact/test log.

## Phase 7 — release decision

Run the following in order:

```text
pnpm test:infra
pnpm test:compose-contract
pnpm test:lineage
pnpm test:verification
pnpm infra:preflight
```

Then attach staging evidence for database reconciliation, RLS, worker/readiness, backup restore, provider contracts, catalog health, browser accessibility, billing sandbox and support/notification delivery.

Release only when:

- No Critical item is open.
- Every High item has evidence or an explicitly approved launch exception.
- Medium items have owners and dates.
- Production data is approved and sample records are excluded.
- The rollback and restore procedures have been rehearsed.
- The release checkpoint names the exact commit and evidence paths.

## Current next build order

1. Run the catalog-health report against the approved staging import and close slot/rule gaps.
2. Reconcile staging migrations and RLS, then run the two-connection profile suite.
3. Stand up the worker and encrypted backup/restore rehearsal.
4. Activate and validate approved AI providers with spend controls.
5. Complete the reviewed output set and browser accessibility matrix.
6. Configure commercial, notification and support services.
7. Build the pinned container stack and execute the final staging release gate.

## Phase 1–3 local continuation checkpoint

Commit `13d0d2e` advances the repository-side portions of the next three phases:

- **Phase 1 — application/data contracts:** guest/account conflicts now require an explicit merge decision, and catalog health remains exposed as a read-only release gate.
- **Phase 2 — operations/recovery/privacy:** expired merge decisions are removed by the worker, and account deletion removes pending merge records tied to the account.
- **Phase 3 — AI/output quality:** `packages/shared/test/golden-cases.json` and its test cover Skin Match, Routine Builder, Care Coach, product explanations, and operator analysis with safety, grounding, and required-phrase checks.

The full local evidence run is `work/verification/2026-09-22T22-23-03-234Z/report.md`. Live database/RLS, identity provider, backup restore, model provider, and staging browser evidence remain open gates.

## Phase 4–6 local continuation checkpoint

Commit `8b3b84e` advances the repository-side portions of the next three phases:

- **Phase 4 — commercial/referral/support:** referral-only catalog contracts continue to reject internal checkout and preserve privacy-safe external destinations.
- **Phase 5 — deployment/edge:** the production journey keeps immutable image, same-origin edge, health/readiness, and public-surface checks in the release gate.
- **Phase 6 — browser/mobile/accessibility:** the proxy journey now renders 28 portal routes and checks the shared MGT mark plus main landmark on each; the mobile contract gate verifies Expo identity, `EXPO_PUBLIC_API_URL`, shared Skin Match data, accessibility roles, and tap targets.

The full local evidence run is `work/verification/2026-09-22T22-32-48-419Z/report.md`. Device builds, simulator interaction, staging authentication, and live deployment remain environment-dependent.

## Phase 7 — local release checkpoint automation

The release checkpoint command packages the local evidence needed for a repeatable handoff:

```text
pnpm release:checkpoint
```

It runs the infrastructure, Compose, migration-lineage, reviewed-output, mobile-contract, and full-verification gates in sequence, then writes a timestamped report under `work/checkpoints/<timestamp>/`. Generated web build output is cleaned before the checks so OneDrive reparse-point artifacts cannot invalidate a clean local run. Use the strict form below when a release candidate must fail closed until production configuration is present:

```text
pnpm release:checkpoint -- --require-production
```

The latest checkpoint passed every local gate. Production preflight remains blocked because `infra/portal/.env` is not present, so the release decision is intentionally `NOT READY` until staging or production configuration is supplied and validated.

Latest evidence:

- `work/checkpoints/2026-09-23T00-08-34-590Z/report.md`
- `work/verification/2026-09-23T00-08-39-783Z/report.md`

## Phase 8 — analytics and data-point contract

The analytics SDK is now a usable workspace package rather than a stub. Its public entrypoint exports the event taxonomy and batching client, stamps privacy and retention classes from the registry, rejects unknown events and malformed required properties, preserves anonymous-to-user identity stitching, and requeues failed transports in order. The package has a reproducible TypeScript build and smoke suite, and the release checkpoint runs that suite before mobile and full verification.

The contract is intentionally product-safe: coach message content is never required as an event property, photo events retain the shortest class, and callers cannot override registry privacy or retention metadata.

Evidence: `pnpm test:analytics` and the `analytics SDK contract` row in `work/checkpoints/2026-09-23T00-08-34-590Z/report.md`.

## Phase 9 — bounded portal assistant foundation

Commit `8444aa7` adds a server-side assistant role contract without changing existing pages or the MGT mark. `POST /api/hub/assistant` supports deterministic onboarding/customer-care navigation and payment/account/medical handoffs. Routine and product education requests require a verified account and explicit AI consent, then reuse the reviewed Coach path. The assistant does not create support tickets, confirm payments, edit routines, or enable OpenClaw.

The API build, focused portal and Coach checks, and full local verification passed. Evidence: `work/verification/2026-09-23T01-18-44-476Z/report.md`. Commit `518274b` then added a customer-facing guidance panel within the existing Support layout, with next-step links and reviewed-source display. General onboarding and retailer discovery work without an AI provider; reviewed skincare responses still require sign-in, consent, and available approved knowledge. API compilation, portal integration checks, web production build, 28-page proxy journey, and focused browser checks passed. Next, complete the reviewed role/evaluation set and validate accessibility, catalog, human support ownership, and optional OpenClaw staging behavior. Production remains **NOT READY** while `infra/portal/.env` and live service gates are open.

## Phase 10 — assistant policy and fallback quality

Commit `08c9ca4` adds 18 engineering candidate API cases for deterministic onboarding, support, retailer, payment, privacy, medical-safety, and prompt-injection routing. They verify blocked cases do not call an AI or payment provider. Missing reviewed knowledge and rejected model excerpts now return a clear Support handoff, without creating a ticket. The cases require SME and privacy sign-off; they are not approved clinical or product content. Full local verification passed at `work/verification/2026-09-23T01-51-10-062Z/report.md`, including the production web build, proxy journey, and zero-hit public artifact scan. Production remains **NOT READY** pending approved catalog data, live services, accessibility review, and human support ownership.

## Phase 11 — Support guidance keyboard and focus flow

Commit `f075a43` moves focus to a new guidance result or error and makes the Support handoff focus the labeled request form. It adds a busy state to the guidance form without changing shared styling, branding, or page routes. The web production build, 28-page proxy journey, and focused browser checks of answer, handoff, and sign-in error focus passed. This is a targeted accessibility improvement, not a complete WCAG or screen-reader audit. Production remains **NOT READY**.
