create extension if not exists vector;
create extension if not exists pg_cron;
create schema if not exists knowledge;
create schema if not exists analytics;

-- ── Enums (Phase 9 retained; `sensitive` removed from skin_type per C8; new enums added)
create type skin_type as enum ('normal','dry','oily','combination');
create type skin_concern as enum ('acne','anti_aging','brightening','hydration','hyperpigmentation',
  'pore_minimizing','redness_relief','texture_smoothing','dark_circles','firmness');
create type skin_sensitivity as enum ('none','mild','moderate','high');
create type age_band as enum ('18_25','26_35','36_45','46_55','56_plus');
create type routine_level as enum ('none','basic','advanced');
create type desired_outcome as enum ('clearer','calmer','glow','smoother','even_tone','firmer','maintain');
create type budget_range as enum ('under_25','between_25_50','between_50_100','over_100');
create type routine_slot as enum ('cleanser','toner','serum','treatment','moisturizer','sunscreen',
  'eye','exfoliant','mask','spot','face_oil','mist','body');
create type routine_time as enum ('am','pm','am_pm','weekly','cycle');
create type usage_frequency as enum ('daily','twice_daily','every_other_day','2_3_weekly','weekly');
create type product_status as enum ('draft','active','inactive','discontinued');
create type billing_provider as enum ('stripe','apple','google');
create type subscription_status as enum ('trialing','active','past_due','canceled','expired','paused');
create type order_status as enum ('pending','paid','payment_failed','forwarded','shipped','delivered',
  'delivery_exception','refunded','partially_refunded','disputed','canceled');
create type evidence_level as enum ('regulatory_label','peer_reviewed','industry_reference','brand_claim','editorial');
create type knowledge_status as enum ('draft','in_review','approved','retired');
create type profile_change_reason as enum ('questionnaire','photo','feedback','user_edit','repersonalization','admin');

-- ── Catalog
create table brands (id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique,
  website text, is_partner boolean default false, created_at timestamptz default now());

create table fulfillment_partners (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
  integration_type text not null check (integration_type in ('api','csv','email')), api_base_url text, contact_email text,
  sla_hours int, status text not null default 'active', created_at timestamptz default now());

create table partner_feeds (id uuid primary key default gen_random_uuid(), partner_id uuid not null references fulfillment_partners,
  format text not null check (format in ('api','csv','xml','json','sheet')), source_url text, schedule_cron text,
  last_ingested_at timestamptz, last_status text, mapping jsonb not null default '{}');

create table ingredients (id uuid primary key default gen_random_uuid(), slug text not null unique, inci_name text not null,
  common_name text, aliases text[] not null default '{}', function text[] not null default '{}',
  is_fragrance boolean default false, is_essential_oil boolean default false, is_alcohol_drying boolean default false,
  is_silicone boolean default false, is_sulfate boolean default false, is_paraben boolean default false,
  created_at timestamptz default now());
create index on ingredients using gin (aliases);

-- Pairwise conflict / caution / photosensitivity data, keyed by catalog ingredient id.
-- NOTE: this is NOT the sensitivity-ceiling safety matrix. That lives in
-- 0004_ingredient_rules.sql as `ingredient_rules` (keyed by ingredient_key, with the SME
-- approval lifecycle) and is what packages/domain's compileMatrix() and
-- PgIngredientRuleRepository actually read. These two tables previously shared the name
-- `ingredient_rules`, so on a fresh database 0001 won this race, 0004's
-- `create table if not exists` silently no-opped, and every safety-matrix query would have
-- failed against a table with none of its columns. Renamed here to keep both concerns.
create table ingredient_conflict_rules (             -- the Phase 9 conflict matrix, versioned, SME-signed
  id uuid primary key default gen_random_uuid(), ingredient_id uuid not null references ingredients,
  max_sensitivity skin_sensitivity not null default 'high',   -- ceiling: user above this ⇒ blocked
  conflicts_with uuid[] not null default '{}',                -- same-session conflicts (retinoid × AHA…)
  caution_with uuid[] not null default '{}',                  -- allowed with a caution note
  caution_note text, photosensitizing boolean default false,
  rules_version text not null, sme_approved_by uuid references auth.users, sme_approved_at timestamptz,
  effective_from timestamptz not null default now(), effective_to timestamptz,
  unique (ingredient_id, rules_version));

create table products (
  id uuid primary key default gen_random_uuid(), sku text not null unique, name text not null, slug text not null unique,
  brand_id uuid not null references brands, fulfillment_partner_id uuid references fulfillment_partners,
  partner_sku text, status product_status not null default 'draft',
  slot routine_slot not null, time_of_day routine_time not null default 'am_pm', frequency usage_frequency not null default 'daily',
  price_cents int not null check (price_cents >= 0), sale_price_cents int, currency char(3) not null default 'USD',
  cost_cents int, margin_bps int generated always as (case when price_cents > 0 and cost_cents is not null
    then ((price_cents - cost_cents) * 10000 / price_cents) else null end) stored,
  size_ml numeric(7,2), size_label text, replenishment_days int,           -- expected days per unit at stated frequency
  subscription_eligible boolean not null default true, availability text not null default 'in_stock'
    check (availability in ('in_stock','low','out_of_stock','discontinued')), shipping_class text default 'standard',
  short_description text, description text, image_url text, images jsonb not null default '[]',
  inci_raw text, search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name,'')),'A') || setweight(to_tsvector('english', coalesce(short_description,'')),'B')
    || setweight(to_tsvector('english', coalesce(inci_raw,'')),'D')) stored,
  created_at timestamptz default now(), updated_at timestamptz default now());
create index on products using gin (search_tsv);
create index on products (slot, status);

create table product_attributes (                    -- Phase 9 columns, relocated
  product_id uuid primary key references products on delete cascade,
  skin_types_suitable skin_type[] not null default '{}', concerns_targeted skin_concern[] not null default '{}',
  max_sensitivity skin_sensitivity not null default 'high',
  concern_score_map jsonb not null default '{}', skin_type_score_map jsonb not null default '{}',
  fragrance_free boolean, essential_oil_free boolean, vegan boolean, cruelty_free boolean, alcohol_free boolean,
  silicone_free boolean, sulfate_free boolean, paraben_free boolean,
  key_ingredient_ids uuid[] not null default '{}', avoid_tags text[] not null default '{}',
  compatibility_notes text[] not null default '{}', caution_flags text[] not null default '{}',
  attributes_version text not null default '1', updated_at timestamptz default now());
create index on product_attributes using gin (skin_types_suitable);
create index on product_attributes using gin (concerns_targeted);
create index on product_attributes using gin (key_ingredient_ids);

create table product_ingredients (product_id uuid references products on delete cascade, ingredient_id uuid references ingredients,
  position int not null, is_active boolean default false, primary key (product_id, ingredient_id));

create table bundles (id uuid primary key default gen_random_uuid(), name text not null, kind text not null check (kind in ('curated','generated')),
  for_skin_type skin_type, for_concern skin_concern, discount_bps int not null default 0, status product_status default 'active');
create table bundle_items (bundle_id uuid references bundles on delete cascade, product_id uuid references products, primary key (bundle_id, product_id));

-- ── Skin
create table skin_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users on delete cascade,
  skin_type skin_type not null, primary_concern skin_concern not null, secondary_concern skin_concern,
  sensitivity skin_sensitivity not null default 'none', age_band age_band, current_routine routine_level not null default 'basic',
  desired_outcome desired_outcome, budget_range budget_range not null default 'between_25_50',
  preferred_brands text[] not null default '{}', avoid_ingredient_ids uuid[] not null default '{}',
  avoid_fragrance boolean default false, avoid_alcohol boolean default false, avoid_silicones boolean default false,
  avoid_sulfates boolean default false, avoid_parabens boolean default false,
  prefers_vegan boolean default false, prefers_cruelty_free boolean default false, prefers_clean boolean default false,
  profile_vector jsonb not null default '{}', visual_attributes jsonb,      -- coarse, from photo; never an image
  version int not null default 1, rules_version text not null, created_at timestamptz default now(), updated_at timestamptz default now(),
  check (secondary_concern is distinct from primary_concern));

create table skin_profile_versions (id uuid primary key default gen_random_uuid(), skin_profile_id uuid not null references skin_profiles on delete cascade,
  user_id uuid not null, version int not null, reason profile_change_reason not null, diff jsonb not null, snapshot jsonb not null,
  source_ref uuid, created_at timestamptz default now(), unique (skin_profile_id, version));

create table skin_match_sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade,
  anonymous_id text, session_token_hash text unique, status text not null default 'in_progress'
    check (status in ('in_progress','completed','abandoned')), questionnaire_version text not null, rules_version text,
  platform text, app_version text, started_at timestamptz default now(), completed_at timestamptz, duration_ms int,
  photo_used boolean default false, expires_at timestamptz default now() + interval '7 days');
create index on skin_match_sessions (user_id, completed_at desc);
create index on skin_match_sessions (anonymous_id) where user_id is null;

create table skin_match_answers (id uuid primary key default gen_random_uuid(), session_id uuid not null references skin_match_sessions on delete cascade,
  question_key text not null, answer_value jsonb not null, duration_ms int, answered_at timestamptz default now(),
  unique (session_id, question_key));            -- write-once: no UPDATE policy, immutability trigger

create table recommendations (id uuid primary key default gen_random_uuid(), session_id uuid not null references skin_match_sessions on delete cascade,
  user_id uuid, product_id uuid not null references products, rank int not null, slot routine_slot not null,
  score numeric(5,4) not null, dimension_scores jsonb not null, synergy_bonus numeric(5,4) default 0,
  explanation jsonb not null,                   -- E.6 contract minus blurb
  blurb text, blurb_prompt_version text, blurb_grounded_in text[], rules_version text not null,
  created_at timestamptz default now(), unique (session_id, product_id));
create index on recommendations (user_id, created_at desc);

-- ── Routine
create table routines (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  status text not null default 'active' check (status in ('active','superseded','archived')), mode text not null default 'standard'
    check (mode in ('standard','simple','travel')), version int not null default 1, source text not null
    check (source in ('skin_match','order','transform','coach','admin')), source_ref uuid, rules_version text not null,
  created_at timestamptz default now());
create unique index routines_one_active on routines (user_id) where status = 'active';

create table routine_steps (id uuid primary key default gen_random_uuid(), routine_id uuid not null references routines on delete cascade,
  time_of_day routine_time not null, slot routine_slot not null, position int not null, product_id uuid references products,
  frequency usage_frequency not null, instructions text, why jsonb, cautions text[] default '{}',
  alternatives jsonb not null default '[]', is_optional boolean default false, unique (routine_id, time_of_day, position));

create table routine_adherence (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  routine_id uuid not null references routines, step_id uuid references routine_steps, on_date date not null,
  status text not null check (status in ('done','skipped')), source text default 'app', created_at timestamptz default now(),
  unique (user_id, step_id, on_date));

create table routine_feedback (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  routine_id uuid references routines, satisfaction int check (satisfaction between 1 and 5), notes text, created_at timestamptz default now());
create table product_feedback (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  product_id uuid not null references products, rating int check (rating between 1 and 5), not_right_for_me boolean default false,
  reaction text check (reaction in ('none','mild','moderate')), would_repurchase boolean, notes text, created_at timestamptz default now());

-- ── Commerce
create table carts (id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users on delete cascade,
  routine_id uuid references routines, bundle_id uuid references bundles, promo_code text, updated_at timestamptz default now());
create table cart_items (id uuid primary key default gen_random_uuid(), cart_id uuid not null references carts on delete cascade,
  product_id uuid not null references products, quantity int not null default 1 check (quantity > 0),
  origin text not null check (origin in ('routine','swap','alternative','bundle','manual')), replaced_product_id uuid,
  explanation text, unit_price_cents int not null, unique (cart_id, product_id));

-- NOTE: the `alter table orders ...` extensions and `fulfillment_jobs` that used to sit here
-- have moved to 0005_orders_extensions.sql. `orders` is created by
-- 0002_orders_webhooks_entitlements.sql, so altering it from 0001 made this file impossible
-- to apply to a fresh database in numeric order — 0001 depended on a table a LATER migration
-- creates. Everything those statements need (the order_status enum, fulfillment_partners,
-- routines) is still defined above, so 0005 applies cleanly once 0002 has run.

-- ── Billing
create table subscription_plans (id text primary key, name text not null, amount_cents int not null, interval text not null
  check (interval in ('month','year')), stripe_price_id text, apple_product_id text, google_product_id text, is_active boolean default true);
insert into subscription_plans values ('premium_monthly','Premium Monthly',1499,'month',null,null,null,true),
                                      ('premium_annual','Premium Annual',14999,'year',null,null,null,true);

create table subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  provider billing_provider not null, provider_subscription_id text not null, plan_id text not null references subscription_plans,
  status subscription_status not null, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean default false, canceled_at timestamptz, trial_end timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(), unique (provider, provider_subscription_id));
create index on subscriptions (user_id, status);

create table subscription_events (id uuid primary key default gen_random_uuid(), subscription_id uuid references subscriptions,
  user_id uuid, provider billing_provider not null, event_type text not null, provider_event_id text not null,
  payload jsonb, occurred_at timestamptz not null, created_at timestamptz default now(), unique (provider, provider_event_id));

create table entitlements (user_id uuid primary key references auth.users on delete cascade, premium boolean not null default false,
  source billing_provider, valid_until timestamptz, computed_at timestamptz not null default now());

create table stripe_customers (user_id uuid primary key references auth.users on delete cascade, stripe_customer_id text not null unique);

-- NOTE: webhook_events is defined by 0002_orders_webhooks_entitlements.sql, not here. The
-- fourth and last of this file's create-table collisions: 0001's version required
-- `event_type not null`, which PgWebhookEventRepository.tryRecord() does not write, so on a
-- fresh database every webhook insert failed with a not-null violation -- meaning the
-- idempotency guard itself was inoperative. 0002 is authoritative; its definition now carries
-- this file's extra event_type/payload/processed_at/error columns, nullable.

create or replace function recompute_entitlement(p_user uuid) returns void language sql security definer as $$
  insert into entitlements (user_id, premium, source, valid_until, computed_at)
  select p_user, coalesce(bool_or(true), false), (array_agg(provider order by current_period_end desc))[1],
         max(current_period_end), now()
  from subscriptions where user_id = p_user and status in ('trialing','active','past_due')
    and current_period_end > now() - interval '3 days'
  on conflict (user_id) do update set premium = excluded.premium, source = excluded.source,
    valid_until = excluded.valid_until, computed_at = now();
$$;

-- ── Replenishment
create table replenishment_predictions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  product_id uuid not null references products, order_item_id uuid, started_at date not null, predicted_runout date not null,
  confidence numeric(3,2), basis jsonb not null, state text not null default 'active'
    check (state in ('active','delayed','skipped','canceled','reordered')), auto_replenish boolean default false,
  next_action_at date, updated_at timestamptz default now(), unique (user_id, product_id, started_at));

-- ── Identity / privacy / admin
create table consents (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  consent_type text not null check (consent_type in ('terms','privacy','ai_disclosure','photo','marketing','training_optin')),
  version text not null, granted boolean not null, granted_at timestamptz default now(), ip_hash text, unique (user_id, consent_type, version));

-- NOTE: admin_audit_log is defined by 0003_admin_knowledge.sql, not here. This file used to
-- create a competing version (admin_user_id/role/target_table/reason/request_id, no
-- immutability trigger). Because 0003 uses `create table if not exists`, on a fresh database
-- 0001's version won and 0003's silently no-opped -- taking its append-only trigger with it,
-- and leaving PgAdminAuditRepository writing to columns (actor_id, target_type) that did not
-- exist. 0003 is authoritative; its definition now carries this file's extra role/reason/
-- request_id columns so nothing from the original design is lost.

-- ── AI
create table model_configs (task text primary key, tier int not null, primary_provider text not null, primary_model text not null,
  fallbacks jsonb not null default '[]', max_tokens int not null, temperature numeric(3,2) not null, timeout_ms int not null default 8000,
  budget_class text not null, requires_entitlement boolean default false, json_schema jsonb, active_prompt_version text,
  ab_split jsonb, updated_by uuid, updated_at timestamptz default now());

create table prompt_versions (id uuid primary key default gen_random_uuid(), task text not null, version text not null,
  system_prompt text not null, user_template text not null, json_schema jsonb, status text not null default 'draft'
    check (status in ('draft','evaluating','active','retired')), eval_run_id uuid, created_by uuid, created_at timestamptz default now(),
  unique (task, version));

create table llm_routing_log (id bigserial primary key, user_id uuid, task text not null, tier int, provider text not null, model text not null,
  prompt_version text, latency_ms int, input_tokens int, output_tokens int, cached_tokens int, cost_usd numeric(10,6),
  fallback_depth int default 0, validation_passed boolean, validation_error text, blocked_terms text[], experiment_arm text,
  request_id text, created_at timestamptz default now());
create index on llm_routing_log (created_at); create index on llm_routing_log (task, created_at);

create table ai_budgets (user_id uuid primary key, tier1_daily_used int default 0, tier3_monthly_used int default 0, reset_daily_at date, reset_monthly_at date);

create table eval_cases (id uuid primary key default gen_random_uuid(), task text not null, input jsonb not null, constraints jsonb not null,
  origin text default 'manual', active boolean default true, created_at timestamptz default now());
create table eval_runs (id uuid primary key default gen_random_uuid(), task text not null, prompt_version text not null, provider text, model text,
  cases int, schema_pass_rate numeric(5,4), blocked_term_rate numeric(5,4), citation_validity numeric(5,4),
  unsupported_claim_rate numeric(5,4), human_reviewed int, p95_latency_ms int, avg_cost_usd numeric(10,6), passed boolean,
  ran_by uuid, ran_at timestamptz default now());

-- ── Knowledge
-- NOTE: knowledge.objects is defined by 0003_admin_knowledge.sql, and the RAG side of the
-- knowledge base (knowledge.embeddings + knowledge.match()) has moved to
-- 0006_knowledge_rag.sql, which runs after it.
--
-- This file used to define a SECOND, incompatible knowledge.objects (uuid primary key, with
-- type/tags/concerns/ingredient_ids). 0003's version -- text primary key, the one
-- PgKnowledgeRepository reads and the SME approval workflow writes -- then silently no-opped
-- behind `create table if not exists`. That is the most consequential of the three collisions
-- in this file, because approving an object and retrieving it for RAG would have been
-- operating on two different tables: the "every AI claim is traceable to SME-approved
-- content" guarantee would have been structurally unenforceable.
--
-- Reconciled as ONE table: 0003's shape and text id win (the application code is ground
-- truth), extended there with this file's RAG columns (type/tags/ingredient_ids/concerns) so
-- knowledge.match() keeps its filters. knowledge.embeddings.object_id is text accordingly.

-- ── Analytics (legacy partitioned table, re-homed)
create table analytics.events (event_id uuid not null default gen_random_uuid(), event_name text not null, user_id uuid, anonymous_id text,
  session_id text, platform text not null, app_version text, occurred_at timestamptz not null, received_at timestamptz not null default now(),
  properties jsonb not null default '{}', privacy_class text not null check (privacy_class in ('public','personal','sensitive')),
  retention_class text not null check (retention_class in ('d30','d180','m24','aggregate')),
  primary key (event_id, occurred_at)) partition by range (occurred_at);
create index on analytics.events (user_id, occurred_at); create index on analytics.events (event_name, occurred_at);
create index on analytics.events (anonymous_id) where user_id is null;

-- ── RLS pattern (applied to every user-scoped table)
alter table skin_profiles enable row level security;
create policy sp_owner on skin_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sp_service on skin_profiles for all to service_role using (true) with check (true);
-- immutability: create trigger trg_immutable before update or delete on skin_match_answers for each row execute function prevent_mutation();

-- ── Drops (SC-P1): products_skincare, product_scores, skincare_knowledge_base, product_embeddings, ingredient_embeddings,
-- research_embeddings, llm_narrative_cache (replaced by recommendations.blurb + routine narrative on session),
-- Phase 5 push_tokens/notification_preferences/notification_log duplicates, Phase 4 `subscriptions`, legacy user_subscriptions,
-- payment_methods, invoices, rc_entitlements (merged), firecrawl_ingest_jobs, ai_finetune_runs, vendor_* (kept in a
-- feature-flagged migration file, not applied), all legacy health tables (archived to Drive 20 then dropped per D.5).
