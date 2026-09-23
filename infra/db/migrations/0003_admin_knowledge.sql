-- Admin RBAC, audit log, and the knowledge-object approval workflow (§9, Section 0.2 RAG row).
-- Verified against PostgreSQL 16.

create schema if not exists knowledge;

create table if not exists admin_users (
  id         uuid primary key,
  email      text not null unique,
  roles      text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists admin_audit_log (
  id          bigserial primary key,
  actor_id    uuid not null,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now(),
  -- Absorbed from the competing definition 0001 used to carry. Nullable, so
  -- PgAdminAuditRepository (which writes the columns above) is unaffected, but the richer
  -- forensic fields are available to callers that have them.
  actor_role  text,
  reason      text,
  request_id  text
);
create index if not exists admin_audit_target_idx on admin_audit_log (target_type, target_id);

-- The audit log is append-only. An admin who can rewrite the audit trail has no audit trail;
-- this trigger is what makes the log evidence rather than a convenience.
create or replace function admin_audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_log is append-only';
end;
$$;
drop trigger if exists admin_audit_no_update on admin_audit_log;
create trigger admin_audit_no_update
  before update or delete on admin_audit_log
  for each row execute function admin_audit_immutable();

create table if not exists knowledge.objects (
  id              text primary key,
  title           text not null,
  body            text not null default '',
  evidence_level  text not null default 'expert_consensus'
                    check (evidence_level in ('peer_reviewed','regulatory_guidance','manufacturer_data','expert_consensus','anecdotal')),
  source_url      text,
  source_date     date,
  version         integer not null default 1,
  status          text not null default 'draft'
                    check (status in ('draft','in_review','approved','retired')),
  sme_approved_by uuid,
  sme_approved_at timestamptz,
  retired_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- RAG classification columns, absorbed from the competing knowledge.objects that 0001 used
  -- to define. knowledge.match() (0006) filters on type and concerns; nothing in
  -- PgKnowledgeRepository writes them, so they are nullable/defaulted and the approval
  -- workflow is unchanged. Keeping them on THIS table is what makes "approved" and
  -- "retrievable" the same row rather than two tables that can disagree.
  type            text check (type is null or type in
                    ('ingredient','product','concern','routine_step','compatibility','caution','usage','article')),
  tags            text[] not null default '{}',
  ingredient_ids  uuid[] not null default '{}',
  concerns        skin_concern[] not null default '{}',
  -- Belt and braces with the application state machine: the database itself refuses an
  -- approved row that has no reviewer recorded, so no code path can mint one.
  constraint approved_requires_reviewer
    check (status <> 'approved' or (sme_approved_by is not null and sme_approved_at is not null and source_date is not null))
);
create index if not exists knowledge_objects_status_idx on knowledge.objects (status);
