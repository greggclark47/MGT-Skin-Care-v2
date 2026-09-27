# MGT Skin Care v2 — next-build export

**Export version:** 1.1  
**Prepared:** 2026-09-20  
**Source baseline:** local commit `b248b18` (migration-lineage gate) on top of `bdb0f82` (profile conflict recovery), `e7f5e54` (demo presentation), and `7e0a867` (public data-boundary continuation)  
**Purpose:** hand off the remaining setup, implementation, verification, and release work without rebuilding completed portal behavior.

## 1. Current baseline

The local portal has a passing v1.5 verification run. The dark retail presentation, USD placeholder pricing, connected applications, owner-approved guest access, local-first AI gateway, account controls, privacy operations, subscription receipt reconciliation, and public response redaction are present.

This phase also adds `pnpm reconcile:migrations` and `pnpm test:lineage`. The tool produces SHA-256 manifests for the independent database and portal migration lineages and fails closed when a supplied target manifest has missing, unknown, reordered, or changed migrations. It does not connect to or mutate a target database.

Verified locally:

- API, shared packages, AI gateway, and web compilation
- Production web build and web-to-API journey
- Profile CRUD, stale-write rejection, export, guest access, billing fixtures, worker behavior, and boundary redaction
- 50 regression assertions and 10/10 deterministic policy cases
- Fresh public artifact scan with zero configured provider/model-name matches
- Static demo syntax and diff checks

The local result is not production readiness. Live services, live data reconciliation, browser accessibility, and deployment remain open.

## 2. Dependency order

Complete the phases in order. Do not enable production traffic before Phase 3 evidence is recorded.

### Phase 1 — environment and ownership setup

| Item | Type | Required setup | Owner / evidence |
| --- | --- | --- | --- |
| Target Supabase project | Setup | Confirm project ID, region, Auth URL, database host, TLS mode, and service-role ownership | Project record and read-only connection check |
| Migration lineage | Setup + review | Export target migration history and compare it with `infra/db/migrations` and `infra/portal/migrations` | Reconciliation map; no automatic production migration |
| Identity mapping | Setup + decision | Map existing Auth users to portal accounts and guest invitations; define duplicate-email handling | Approved mapping report with counts |
| Staging environment | Setup | Create a non-production database, Auth tenant, isolated storage, and test email channel | Staging URLs and credentials stored outside source |
| Secrets and origins | Setup | Populate `infra/portal/.env` outside source control; use HTTPS origins and server-only secrets | `pnpm infra:preflight` passes |
| Backup and restore | Setup | Select encrypted off-host backup provider and schedule a restore rehearsal | Successful restore log and checksum proof |
| Initial operator | Setup + manual control | Provision the first superadmin outside the public portal | Two-person confirmation or equivalent audit record |

Required server-side values include `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PORTAL_PUBLIC_ORIGIN`, session and CSRF secrets, and notification settings. Add hosted inference or billing secrets only when those capabilities are approved and tested.

### Phase 2 — critical data and account implementation

| Item | Type | Implementation outcome | Acceptance evidence |
| --- | --- | --- | --- |
| PostgreSQL profile compare-and-write | Implementation | Enforce revision checks and deterministic locking on the real database adapter | Concurrent-write, stale-client, rollback, and cross-session tests pass against staging PostgreSQL |
| Guest/account conflict flow | Implementation + decision | Turn the safe 409 guard into a user-facing choice that preserves both drafts and does not reuse a consumed sign-in code | Conflict fixture shows no data loss; selected resolution is audited |
| Import reconciliation | Implementation | Reconcile accounts, profiles, invitations, subscriptions, saved retailers, reminders, and audit records from the approved source | Before/after counts, quarantine list, and rollback rehearsal |
| RLS and cross-account isolation | Implementation | Apply and verify policies for owner, guest, operator, and service-role access | Negative tests from separate accounts pass in staging |
| Identity deletion | Integration | Connect the worker to Supabase identity deletion and retain only approved anonymized records | Real staging deletion, retry, and partial-failure test |

### Phase 3 — AI and external service activation

| Item | Type | Implementation / setup | Gate |
| --- | --- | --- | --- |
| Ollama runtime | Setup | Start the local runtime and pull only approved task models and embeddings | Health check, timeout, and generation smoke test |
| DeepSeek through Ollama | Integration | Configure as the bounded reasoning fallback behind the server gateway | Adapter contract, timeout, validation, and cost telemetry tests |
| OpenClaw-compatible endpoint | Integration | Keep disabled until endpoint, authentication, and response contract are reviewed | `OPENCLAW_ENABLED` remains false until live staging evidence exists |
| LangChain context pipeline | Implementation | Bind retrieval, context limits, and prompt serialization to the existing gateway | Context truncation and prompt-injection regression checks |
| Hosted escalation | Optional integration | Configure only for explicitly entitled high-complexity tasks; keep key server-side | Live request, budget reservation, timeout, and reconciliation evidence |
| Output quality set | Implementation + editorial | Create reviewed known-input cases for Skin Match, Routine Builder, Care Coach, and operator analysis | Human-reviewed accuracy threshold recorded per task; plausible-but-unverified cases remain flagged |

### Phase 4 — plans, notifications, and commercial setup

| Item | Type | Implementation / setup | Gate |
| --- | --- | --- | --- |
| Plan prices and allowances | Decision + implementation | Approve monthly/annual USD prices, usage units, overage policy, guest allowance, and margin assumptions | Signed product/economics approval; no placeholder replacement before approval |
| Stripe sandbox | Setup + integration | Create audience-specific monthly and annual prices, portal configuration, webhook secret, and test clock scenarios | Trial, renewal, decline, cancellation, replay, and entitlement tests pass |
| Notifications | Setup | Configure an HTTPS delivery channel or approved transactional email provider | Delivery, retry, duplicate, unsubscribe, and failure tests |
| Support operations | Setup | Assign support ownership and escalation mailbox/helpdesk destination | End-to-end ticket response test |

### Phase 5 — deployment and release validation

1. Run migrations only after the lineage and restore rehearsal are approved.
2. Run `pnpm infra:preflight` against staging values.
3. Build and start API, worker, web, and edge containers with pinned image digests.
4. Verify `/healthz`, `/readyz`, same-origin API routing, signed webhook routing, log rotation, and graceful shutdown.
5. Run browser checks at 375px and desktop widths: keyboard navigation, focus order, dialog escape, tab semantics, contrast, forms, guest invite, plans, shop, account deletion, and operator views.
6. Run the full verification harness against staging and attach raw logs.
7. Perform a restore drill and record the backup checksum.
8. Promote only when zero CRITICAL items remain and all WARNING items have explicit acceptance or closure.

## 3. Decisions required before implementation

1. **Conflict resolution:** choose whether an invited/guest profile may be merged into an existing account, retained as a separate profile, or only exported and abandoned. The current safe behavior refuses ambiguous merges.
2. **Production data source:** identify the authoritative Supabase project and provide the migration history and identity mapping.
3. **AI enablement:** approve the exact Ollama model set, OpenClaw endpoint, DeepSeek fallback policy, and whether hosted escalation is enabled.
4. **Accuracy threshold:** approve the reviewed test set and threshold per generated task. The current 100% figure applies only to ten deterministic policy cases.
5. **Commercial configuration:** approve plan prices, usage units, annual discount, overages, guest usage charging, and final terms. Current USD values remain placeholders.
6. **Notification channel:** approve webhook versus transactional email and identify the operational recipient.

## 4. Export package contents

Include these items in the next approved source snapshot:

- Source tree at the verified commit
- `infra/portal/VERIFICATION-REPORT.md`
- `infra/portal/RELEASE-CHECKPOINT.md`
- This export outline
- Sanitized environment template only; never include `.env`, keys, tokens, customer data, database dumps, or generated dependency folders
- Raw verification logs and results from the staging run
- Migration reconciliation report, RLS evidence, and restore-drill proof

## 5. Exit criteria

The portal may be called production-ready only after every user path runs end to end without manual intervention, profile synchronization is bidirectional and lossless, reviewed output accuracy meets the approved thresholds, staging and production database behavior agree, browser accessibility is evidenced, backup restoration succeeds, and zero CRITICAL items remain open.

Until then, keep the release gate visibly open and label all generated demo records as samples.
