-- Order extensions and fulfillment jobs, moved out of 0001_consolidated_schema.sql.
--
-- These statements extend `orders`, which is created by 0002_orders_webhooks_entitlements.sql.
-- They lived in 0001 originally, which made the migration set unapplicable in numeric order:
-- 0001 altered a table that 0002 creates. Running them here, after 0002, is the fix. The
-- enum (order_status), fulfillment_partners and routines they depend on all come from 0001.
--
-- `orders.status` deserves a note. 0002 defines status as `text` with a CHECK constraint;
-- this migration does NOT redefine it as the `order_status` enum, because 0002's text column
-- is what apps/api/src/persistence/postgres.ts (PgOrderRepository) reads and writes, and its
-- CHECK list already matches the enum's values. Converting the column type here would be a
-- silent breaking change to the code path that actually runs. The `order_status` enum stays
-- defined for the reporting views in 0001 that use it.

alter table orders
  add column if not exists fulfillment_partner_id uuid references fulfillment_partners,
  add column if not exists subtotal_cents int,
  add column if not exists tax_cents int default 0,
  add column if not exists shipping_cents int default 0,
  add column if not exists discount_cents int default 0,
  add column if not exists stripe_charge_id text,
  add column if not exists routine_id uuid references routines,
  add column if not exists is_guest boolean default false;
-- paid_at is already created by 0002; PgOrderRepository.markPaid() writes it.

create table if not exists fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  -- orders.id is text (0002), so this FK is text as well. It was uuid when this block lived
  -- in 0001, which would not have matched the orders table the application actually writes.
  order_id text not null references orders,
  partner_id uuid not null references fulfillment_partners,
  attempt int not null default 1,
  status text not null default 'pending'
    check (status in ('pending','sent','accepted','failed','manual')),
  payload_hash text,
  partner_ref text,
  error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists fulfillment_jobs_order_idx on fulfillment_jobs (order_id);
