-- Versioned, SME-approved ingredient safety rules (Section 0.4 REFACTOR row).
-- Phase 9 held these as code constants; a safety threshold change was a deploy with no
-- record of who decided it. Rows are versioned and never overwritten, so the exact matrix
-- behind any past recommendation can be reconstructed.

create table if not exists ingredient_rules (
  ingredient_key               text    not null,
  version                      integer not null,
  display_name                 text    not null,
  sensitivity_ceiling_required numeric(3,2) not null
                                 check (sensitivity_ceiling_required >= 0 and sensitivity_ceiling_required <= 1),
  triggers_avoid_flag          text
                                 check (triggers_avoid_flag is null or triggers_avoid_flag in
                                   ('fragrance','essential_oils','alcohol_denat','physical_exfoliants','high_strength_actives')),
  rationale                    text    not null check (length(trim(rationale)) > 0),
  status                       text    not null default 'draft'
                                 check (status in ('draft','in_review','approved','retired')),
  sme_approved_by              uuid,
  sme_approved_at              timestamptz,
  created_at                   timestamptz not null default now(),
  primary key (ingredient_key, version),
  constraint approved_rule_requires_reviewer
    check (status <> 'approved' or (sme_approved_by is not null and sme_approved_at is not null))
);

-- At most ONE approved version per ingredient at a time. Without this, a botched approval
-- could leave two live thresholds for the same ingredient and the compiled matrix would
-- depend on row order.
create unique index if not exists ingredient_rules_one_approved
  on ingredient_rules (ingredient_key) where status = 'approved';

create index if not exists ingredient_rules_status_idx on ingredient_rules (status);

-- Seed rows generated from @mgt/domain's SEED_INGREDIENT_RULES (the Phase 9 constants), so
-- the migration and the code cannot drift. Pre-approved by a system SME id so the platform
-- has a working matrix on day one; every change after this goes through the SME workflow and
-- is attributed to a real person.
insert into admin_users (id, email, roles)
values ('00000000-0000-0000-0000-000000000001', 'system-seed@mgtskincare.internal', array['sme'])
on conflict (id) do nothing;

insert into ingredient_rules
  (ingredient_key, version, display_name, sensitivity_ceiling_required, triggers_avoid_flag, rationale, status, sme_approved_by, sme_approved_at)
values
  ('retinol', 1, 'Retinol', 0.6, 'high_strength_actives', 'Retinoids commonly cause irritation during introduction.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('glycolic_acid', 1, 'Glycolic acid', 0.6, 'high_strength_actives', 'AHA with high irritation potential on reactive skin.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('salicylic_acid', 1, 'Salicylic acid', 0.7, null, 'BHA; generally tolerated but drying at higher tolerance thresholds.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('benzoyl_peroxide', 1, 'Benzoyl peroxide', 0.5, 'high_strength_actives', 'Frequent irritant and fabric bleaching agent.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('fragrance', 1, 'Fragrance', 0.4, 'fragrance', 'Leading cause of cosmetic contact sensitivity.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('essential_oil', 1, 'Essential oils', 0.4, 'essential_oils', 'Volatile compounds associated with sensitisation.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('denatured_alcohol', 1, 'Denatured alcohol', 0.5, 'alcohol_denat', 'Can compromise barrier function on dry or reactive skin.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('physical_scrub', 1, 'Physical scrub particles', 0.5, 'physical_exfoliants', 'Mechanical abrasion risk.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('niacinamide', 1, 'Niacinamide', 0.15, null, 'Well tolerated across sensitivity levels at cosmetic concentrations.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('vitamin_c_l_ascorbic', 1, 'L-ascorbic acid', 0.6, null, 'Low pH formulations can sting reactive skin.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('hyaluronic_acid', 1, 'Hyaluronic acid', 0.1, null, 'Humectant, broadly tolerated.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('ceramides', 1, 'Ceramides', 0.1, null, 'Barrier lipid, broadly tolerated.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('glycerin', 1, 'Glycerin', 0.1, null, 'Humectant, broadly tolerated.', 'approved', '00000000-0000-0000-0000-000000000001', now()),
  ('zinc_pca', 1, 'Zinc PCA', 0.2, null, 'Sebum-regulating, generally well tolerated.', 'approved', '00000000-0000-0000-0000-000000000001', now())
on conflict (ingredient_key, version) do nothing;

