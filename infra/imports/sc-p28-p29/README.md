# Backend import and merge review — v1.3

## Approved integration and current source scope

[GIVEN — user approval] Preserve Next.js and the authenticated portal boundary, target the designated Supabase backend, and keep USD prices as placeholders. The later regression request authorizes builds and tests, superseding the earlier no-execution delivery restriction. No live migration or deployment is authorized by this evidence alone.

[GIVEN — source edits] The retained portal now mounts the adapted `/api/v1` subscription and entitlement routes behind the existing session, CSRF, and rate controls. The new shared client and `/subscription` page use neutral, allowlisted records. Cancellation/resumption store pending commands; verified webhooks confirm them. Legacy memberships remain read-only in the new controls, and new v1 enrollment stays disabled pending pricing approval. The existing billing flow is not globally replaced.

[GIVEN — source edits] API and worker configuration target an external reviewed database instead of provisioning another database. Startup migrations default off and are prohibited automatically in production. No database, existing container, or volume has been removed. Schema mapping, migration selection, role-based RLS tests, and live record reconciliation remain open.

[GIVEN — regression scope] Profile mutations include atomic revisions, consistent save/read responses, stale-write rejection, removal with a revision tombstone, and safe JSON errors. Conflicting guest/account records now stop account linking with `profile_merge_conflict` instead of silently discarding either record. A conflict-resolution UI remains a separate open decision.

[GIVEN — user-approved invitation policy] One active or pending invite per owner; two modes (`basic`, `match_owner`); intended-email sign-in; separate profiles; 30 days after acceptance; owner revocation; no delegated billing/admin permissions. Matching access checks the owner's current entitlement and shares the existing coach AI daily budget/rate controls. Invitation tokens are stored only as hashes and returned as URL fragments. Pending invitations expire after 30 days. Monthly plan quotas are not implemented by this invitation change; placeholder prices remain unchanged.

[GIVEN — evidence] `infra/portal/verify.cjs` creates timestamped reports under `work/verification`, with raw outputs, per-assertion rows, and conservative exported-unit/endpoint inventories. Passed suites do not establish complete input-class coverage or production readiness. Live generated-output quality and current external pricing are not verified by fixture-based tests. The earlier proposal tables below are retained as historical findings; this section supersedes their activation status.

[GIVEN] Requested source: the attached Sections B–I handoff and its SC-P28/SC-P29 additions. This file records source evidence, scoped edits, deferred work, and proposed verification. It makes no production, build, test, database, or GitHub merge completion claim.

## Evidence labels and source boundaries

[GIVEN] In this review, GIVEN means either explicitly supplied in the handoff or directly present in a cited local/Drive file; each finding identifies which. INFERRED means an integration conclusion from that evidence. ASSUMED means a proposed choice requiring confirmation or missing evidence.

[GIVEN — handoff] Sections B/D describe an environment without file, Drive, or GitHub access. The actual receiving workspace is readable and the connected Drive source is available. The no-build/no-test/no-deploy return contract remains applicable to this delivery; source headers claiming earlier test success are historical claims only.

[GIVEN — source inventory] The named Drive root is https://drive.google.com/drive/folders/1UMNEQyQdOatBCy0nnnQcvKCAmEZNOSdg. Its inspected server and shared-client files are dated September 8. The ten September 19 additions are separate files in Drive root, rather than edits of those canonical files. `source-manifest.json` records their IDs, modification times, destinations, and local reference paths.

[GIVEN — local configuration] This checkout has no configured Git remote. No repository URL, branch, or commit SHA was supplied. The source references therefore establish a Drive file import, not a Git history merge or a complete repository snapshot.

## Scoped source edits

| Item | Evidence / deliverable | Activation |
| --- | --- | --- |
| Versioned router | [GIVEN] `apps/api/src/routes/v1.ts` derives from SC-P28 `routes-v1.ts`. Its `ApiError` constructor use matches the local `middleware/error.ts`. Unexpected-error logging is reduced to a generic message. | [GIVEN] Module only; neither API entrypoint mounts it. |
| Shared request transport | [GIVEN] `packages/shared/src/api.ts` preserves base URL + injected fetch, encodes cart/order IDs, rejects non-2xx responses even with unreadable JSON, and normalizes malformed error envelopes. | [GIVEN] Source edits only; existing route paths are retained until server/client migration is coordinated. |
| Regression checks | [GIVEN] `packages/shared/test/api-contract.cjs` and `apps/api/test/v1-router.cjs` specify transport and isolated router checks. | [GIVEN] Proposed checks, not executed in this pass. |
| Import references | [GIVEN] Ten source files are under `source/` with `.source.txt` extensions and origin metadata. | [GIVEN] Reference material only, outside app source roots and the static `dist` bundle. Do not serve this review directory. |
| Schema inventory | [GIVEN] `schema-inspection.sql` contains a read-only metadata transaction; no record writes or migrations. | [GIVEN] Not executed against a database. |

## Conflicts requiring resolution before runtime merge

| Area | Evidence | Smallest proposed resolution |
| --- | --- | --- |
| API entrypoint | [GIVEN] Local `apps/api/package.json` starts `dist/portal/server.js`; the handoff targets `src/server.ts`. The existing portal uses `createPortal`, session cookies and CSRF enforcement. | [INFERRED] Preserve `createPortal` as the portal boundary; integrate the imported module through it after repository/identity mapping. Editing only `src/server.ts` would leave the shipped portal disconnected. |
| Persistence | [GIVEN] Local `portal/store.ts` uses `hub_records(scope,id,body)`; the imported subscription repository queries typed `subscriptions` columns using a different DB client. Local Compose provisions an independent database, conflicting with the handoff's sole-backend decision. | [ASSUMED] Use the designated Supabase project as the target; preserve existing portal records during a staged, additive mapping. Confirm the project and live migration ledger before changing Compose or applying SQL. |
| Identity | [GIVEN] Local portal uses verified account sessions. Imported `SubscriptionApi.withUser()` sends an arbitrary `x-user-id`; the router accepts it only when its development switch is enabled. | [INFERRED] Integrate the existing authenticated session boundary and explicit account-to-auth-user mapping. Never enable the header switch in production or map anonymous IDs to authenticated users by string equality. |
| Pricing | [GIVEN] Current demo placeholders are three USD tiers at 49/129/349 monthly. Section E locks Free + Premium at USD 14.99/month. | [ASSUMED] Preserve the three-tier demo as a placeholder and reserve Free/Premium for the imported entitlement contract pending an explicit pricing decision. No automatic mapping of three tiers to paid entitlement. |
| Provider abstraction | [GIVEN] Imported public types and serializers include provider/source strings, provider price IDs and a hosted checkout URL. | [INFERRED] Design a product-owned response allowlist and opaque plan/checkout handles, with server-side resolution. Change client and server together. Do not export the imported client into the public shared package as written. |
| App-store management | [GIVEN] Section E requires platform-management links while earlier presentation requirements prohibit underlying provider exposure. | [INFERRED] Retain the required user management action; confirm the narrow presentation exception for store-owned subscriptions before designing links or redirects. |
| Resume behavior | [GIVEN] Imported DELETE with `cancel_at_period_end:false` skips the billing call and only clears the local flag. The billing port has no resume method. | [INFERRED] Add a real resume capability with an agreed port signature, or remove resume from the UI until supported. Do not report a resumed subscription from the local flag. |
| Webhook ownership | [GIVEN] The handoff locks webhook-authoritative subscription state; SC-P28 explicitly makes a local cancel-flag exception. | [INFERRED] Reconcile the exception before activation. A pending user command can be recorded separately; confirmed billing state must follow the verified webhook. |
| Entitlement divergence | [GIVEN] Local `entitlement-resolver.ts` applies the three-day grace calculation to all eligible statuses, including active/trialing. The handoff describes grace for past_due only. It also does not export `BillingProvider`, which the imported repository imports from that module. | [INFERRED] Correct the type import using the actual domain exports, then reconcile grace semantics against the live SQL function and approved policy in a separate reviewed change. |
| Mobile identity/version | [GIVEN] The inspected Drive `app.config.ts` uses `com.mgt.skincare` and derives native versions from a build-run value; Section C instead locks `com.mgtglobalsolutions.skincare` and remote version ownership. Local mobile is a minimal scaffold without the described config. | [INFERRED] Do not overwrite local mobile with this older configuration. Locate the later canonical `app.config.js` and `eas.json`; retain CNG and the locked application identifier. |
| Client migration coverage | [GIVEN] Local shared source exports neither EntitlementApi nor ReferralApi. The older Drive `api.ts` also lacks them. Imported v1 router mounts checkout, subscriptions and optional entitlement only. | [INFERRED] Obtain the later canonical client/router files before switching all clients to `/api/v1`. A prefix-only rewrite would create missing routes. |
| AI routing | [GIVEN] Current `portal/ai.ts` calls `AiGateway.execute`; the handoff describes a mandatory multi-tier routing policy. | [INFERRED] Preserve the current gateway boundary and deterministic safety logic. Read the canonical router signature and configuration before adding an adapter; do not invent a `routeInference()` call. |

## Web surface decision memo

| Option | Assessment |
| --- | --- |
| Keep Next.js for web and Expo for native | [INFERRED] Recommended. Reuses the portal and shared domain/client modules; avoids introducing a second web release. |
| Separate Expo web deployment | [ASSUMED] Would require an approved domain/path, distinct user journey, identity sharing and release ownership. Those inputs have not been supplied. |
| Replace the portal with Expo web | [INFERRED] Conflicts with preserving the existing portal build and would require a larger rewrite. |

[INFERRED] Defer web-export dependencies and output-mode changes unless a separate Expo web surface is approved. CNG native release preparation can proceed independently once the correct canonical mobile configuration is obtained.

## Proposed merge sequence after architecture approval

1. [INFERRED] Resolve the API/storage mapping, pricing conflict and public billing contract above. Record the selected source revision and preserve the existing dirty worktree in a private backup before broad edits.
2. [INFERRED] Gather the later canonical files listed below, including their dependency closure. Compare full text and hashes; do not select a source solely because its filename says "new".
3. [INFERRED] Inspect live schema metadata and migration history with a read-only account. Run role-based RLS authorization checks on a staging copy; metadata showing RLS enabled is not sufficient proof of correct access isolation.
4. [INFERRED] Prepare an additive migration and explicit old-ID/new-ID mapping for profiles, accounts, orders and subscriptions. Define per-field ownership and retain provenance; never overwrite financial or consent history using newest-timestamp wins.
5. [INFERRED] Connect the imported repository and billing port to the retained portal entrypoint. Keep raw webhooks before JSON parsing, authenticate ownership on every read/write, preserve CSRF controls, and keep mutation state webhook-authoritative.
6. [INFERRED] Mount the v1 surface and update its clients in the same integration change. Preserve the established legacy envelope per actual entrypoint, not the handoff's assumption. Add the shared subscription export only after its public DTO and authentication contract are resolved.
7. [INFERRED] Integrate subscription pages using the existing dark portal theme. Poll server-confirmed results; never add a client-confirmation endpoint. Existing premium alone must not prove that a particular new checkout succeeded.
8. [INFERRED] Run targeted checks, a full build and staging flows once execution is authorized. Keep migrations, public deployment and store builds gated by the handoff's database/authentication/release prerequisites.

## Files that must be read first for deferred work

- [GIVEN — outstanding source] Later canonical `apps/api/src/server.ts`, `persistence/repositories.ts`, `middleware/error.ts`, checkout/webhook/entitlement/referral routers, and the actual billing adapter implementing SC-P28's port. The September 8 server is not the Supabase-based server described in Section C.
- [GIVEN — outstanding source] Later canonical shared `api.ts`, `entitlement-api.ts`, `referral-api.ts` (exact filenames to be confirmed) and their smoke checks; do not guess methods or exports.
- [GIVEN — outstanding source] Later canonical mobile `app.config.js`, `eas.json`, `.env.example`, package manifest and shipping screens for camera-use analysis.
- [GIVEN — outstanding evidence] Both full migration lineages, live applied-migration ledger, deployed RLS policies/grants, `recompute_entitlement` definition, record ID relationships and current target-project configuration. No production secret values belong in this review.
- [GIVEN — outstanding source] Canonical AI router, environment configuration and safety/eligibility/pricing/routine engine files for all six verticals before combining their outputs.

## Proposed verification — not executed

[INFERRED] From the repository root, after reviewing source edits and using the existing dependency environment, these commands would compile the touched packages and exercise the new isolated checks. They do not establish a live route mount or production readiness.

```powershell
pnpm --filter @mgt/domain build
pnpm --filter @mgt/shared build
pnpm --filter @mgt/api build
node --test packages/shared/test/api-contract.cjs
node --test apps/api/test/v1-router.cjs
```

[INFERRED] The SQL inventory can be run with a configured read-only PostgreSQL service; `mgt-review` below is an assumed local service alias, not an existing connection.

```powershell
psql 'service=mgt-review' -X -v ON_ERROR_STOP=1 -f infra/imports/sc-p28-p29/schema-inspection.sql
```

[INFERRED] After the approved mount is implemented, its integration suite must instantiate the actual production `createPortal` entrypoint and verify unauthenticated rejection, cross-account denial, platform-managed refusals, retry/idempotency handling, preserved raw webhook verification, consistent entitlements, no client-confirm endpoint, and vendor-free public JSON. The isolated router test cannot prove these properties for the portal.

[INFERRED] Release evidence must also include reconciliation counts for each migrated table, targeted RLS queries as two distinct users plus anonymous access, a restore rehearsal, and a provider-name/secret scan of the actual generated web and mobile artifacts. No assertion of these results is made here.

## Remaining release decisions

[GIVEN] The portal-boundary architecture was approved. Still required: target project and migration lineage, explicit identity/data mapping, real service configuration, guest/account conflict-resolution behavior, and either a billing-only disclosure exception or a replacement for externally hosted checkout. No Git remote is configured in this checkout; no GitHub merge/push or Drive upload is claimed.
