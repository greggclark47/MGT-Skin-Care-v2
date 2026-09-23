-- Minimal `auth.users` for NON-Supabase environments (plain Postgres, CI, local dev).
--
-- 0001_consolidated_schema.sql has many `references auth.users` foreign keys. On Supabase
-- that schema and table are provided by the platform; on a plain PostgreSQL instance nothing
-- creates them, so 0001 failed with `schema "auth" does not exist` at the first FK — which is
-- why the consolidated schema had never actually been applied end to end outside Supabase,
-- despite infra/db/README.md claiming a plain `psql -f` would work.
--
-- Every statement here is idempotent and additive, so running this against Supabase (where
-- auth.users already exists, with far more columns) is a no-op rather than a conflict. Only
-- the columns 0001's foreign keys actually depend on are declared.

create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- Supabase's RLS roles. 0001's row-level-security policies are granted `to authenticated`
-- and `to service_role`; on plain Postgres those roles do not exist and every `create policy`
-- fails. `create role` has no IF NOT EXISTS, hence the DO blocks.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- Supabase exposes the current user id to RLS policies as auth.uid(). Defined here only if
-- absent, so the platform's own implementation always wins on Supabase.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
