-- Tables backing apps/api/src/persistence/postgres.ts. Verified against PostgreSQL 16:
-- webhook idempotency under 10-way concurrency, order pending->paid exactly-once under
-- 8-way concurrency, and entitlement recompute across Stripe/Apple sources.

create table if not exists webhook_events (
  id          bigserial primary key,
  provider    text        not null,
  event_id    text        not null,
  received_at timestamptz not null default now(),
  -- Absorbed from the competing definition 0001 used to carry. All nullable: tryRecord()
  -- writes only (provider, event_id, received_at), and the whole point of this table is that
  -- recording an event must never fail for reasons unrelated to duplicate detection.
  event_type   text,
  payload      jsonb,
  processed_at timestamptz,
  error        text,
  -- The idempotency guard. Section 0.2's audit found legacy `payment_events` was an audit
  -- log with no unique constraint, which is not a guard at all under Stripe's retries.
  unique (provider, event_id)
);

create table if not exists orders (
  id                text        primary key,
  session_id        text        not null,
  user_id           uuid,
  total_cents       bigint      not null check (total_cents >= 0),
  status            text        not null default 'pending'
                      check (status in ('pending','paid','forwarded','shipped','delivered','canceled')),
  payment_intent_id text,
  cart              jsonb       not null,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz
);
create index if not exists orders_session_idx on orders (session_id);
create index if not exists orders_status_idx  on orders (status) where status = 'pending';
