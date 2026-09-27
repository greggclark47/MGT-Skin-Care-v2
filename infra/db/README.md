# Database

## Applying

Before applying migrations to a target project, generate the local lineage manifest:

```
pnpm reconcile:migrations > work/local-migration-manifest.json
```

After the database owner supplies a sanitized target manifest containing the applied
`database` and `portal` migration names and hashes, compare it without connecting to or
mutating the target database:

```
node infra/db/migration-lineage.mjs --target-manifest work/reconciliation/target-migrations.json
```

The comparison fails closed on missing, unknown, reordered, or content-mismatched migrations.
It also rejects malformed target shapes, duplicate names, invalid IDs, and invalid hashes. The
target manifest must contain migration metadata only; never export secrets, customer rows, tokens,
or database dumps. This check is evidence for review, not permission to apply changes.

Apply every file in `migrations/` in **numeric order**. The full set has been verified to
apply cleanly to a fresh PostgreSQL 16 (see "History" below — it did not, before 2026-09-06).

```
infra/db/reset-and-test.sh --reset-only   # wipe + apply everything
infra/db/reset-and-test.sh                # wipe + apply + run the DB-backed smoke tests
```

| File | What it does |
|---|---|
| `0000_auth_users.sql` | `auth.users`, the `authenticated`/`anon`/`service_role` roles, and `auth.uid()`. **Only needed off Supabase**; every statement is idempotent, so it is a no-op on Supabase. |
| `0001_consolidated_schema.sql` | The main schema from blueprint Section J — ~40 tables, enums, RLS policies, pg_cron seeds. |
| `0002_orders_webhooks_entitlements.sql` | `orders` and `webhook_events`. Authoritative for both. |
| `0003_admin_knowledge.sql` | `admin_users`, `admin_audit_log` (append-only), `knowledge.objects`. Authoritative for all three. |
| `0004_ingredient_rules.sql` | `ingredient_rules` — the versioned sensitivity-ceiling safety matrix, plus its seed rows. Authoritative. |
| `0005_orders_extensions.sql` | Order columns and `fulfillment_jobs`. Must run after 0002 creates `orders`. |
| `0006_knowledge_rag.sql` | `knowledge.embeddings` + `knowledge.match()`. Must run after 0003 creates `knowledge.objects`. |

### Requirements

- PostgreSQL 16
- `vector` (pgvector) and `pg_cron` extensions, for 0001. On Debian/Ubuntu:
  `apt-get install postgresql-16-pgvector postgresql-16-cron`. pg_cron additionally needs
  `shared_preload_libraries = 'pg_cron'` and `cron.database_name` in `postgresql.conf`.
- Off Supabase, `0000_auth_users.sql` must run first — 0001 has many `references auth.users`
  foreign keys and RLS policies granted to Supabase's roles.

## Testing

`reset-and-test.sh` runs `persistence`, `dual-backend`, `admin-persistence`, and
`ingredient-rules-persistence` against a real database, each from a freshly-migrated state.

These tests are **not idempotent** — they use fixed fixture ids (`evt_live_1`, `order_live_1`,
`kb-*`) and assert on row counts. Running them twice against the same database fails on
duplicate keys, which looks like a regression and is not one. The reset is part of the test.

They connect on the socket `host=/tmp port=5499 user=postgres db=postgres`. Start a matching
instance with:

```
initdb -D <datadir> -U postgres --auth=trust
pg_ctl -D <datadir> -o '-p 5499 -k /tmp -c listen_addresses=' start
```

## History — why 0000, 0005 and 0006 exist

Until 2026-09-06 this migration set **could not be applied to a fresh database at all**. It had
only ever been applied piecemeal, so the failures were invisible. Fixing that surfaced five
defects, all of the same family: `0001` was written during blueprint authoring and `0002`–`0004`
during the build, and they defined overlapping objects that were never reconciled.

1. **Four `create table` collisions.** `0001` and the later migrations each defined
   `webhook_events`, `admin_audit_log`, `knowledge.objects`, and `ingredient_rules` — with
   incompatible shapes. Because `0002`–`0004` use `create table if not exists`, **0001 won on
   any fresh database and the authoritative definitions silently no-opped.** The application
   code matches `0002`–`0004` exclusively, so on a freshly-provisioned environment:
   - every webhook insert failed a `not null` constraint on 0001's `event_type` — the
     idempotency guard was inoperative;
   - `admin_audit_log` lacked `actor_id`/`target_type` and its append-only trigger;
   - the SME approval workflow and RAG retrieval would have used **two different**
     `knowledge.objects` tables, making "every AI claim is traceable to SME-approved content"
     structurally unenforceable;
   - every safety-matrix query ran against a table with none of its columns.

   Resolved by making the later migrations authoritative and folding 0001's extra columns into
   them as nullable. 0001's `ingredient_rules` was a genuinely different concern (pairwise
   conflicts, caution notes, photosensitivity) and survives as `ingredient_conflict_rules`.

2. **Forward dependencies.** `0001` altered `orders` (created by `0002`) and created
   `knowledge.embeddings` referencing `knowledge.objects` (created by `0003`). Both blocks
   moved to `0005` and `0006`, which run after their dependencies.

3. **Supabase assumptions.** `0001` requires the `auth` schema, `auth.users`, `auth.uid()` and
   the `authenticated`/`service_role` roles, none of which exist on plain Postgres and none of
   which any migration created. `0000` supplies them. The previous version of this README
   claimed a plain `psql -f` would work; it would not.

4. **`fulfillment_jobs.order_id` was `uuid`** while `orders.id` is `text`, so the foreign key
   could never have matched the orders table the application actually writes. Corrected in
   `0005`.

5. **Two smoke tests carried stale fixtures** — `persistence.ts` inserted `subscriptions` rows
   without the required `provider_subscription_id`/`plan_id` and assumed a pre-existing
   `auth.users` row; `dual-backend.ts` posted unsigned webhooks, which the signature
   verification added in the same session correctly rejects. Both now set up their own
   fixtures and `dual-backend.ts` signs its payloads, keeping the signature path under test.
