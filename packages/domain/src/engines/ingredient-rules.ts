import type { AvoidFlags } from '../types/skin-profile';
import type { KnowledgeStatus } from './knowledge-approval';

export const INGREDIENT_RULES_VERSION = '2.0.0';

// The ingredient safety matrix as VERSIONED, SME-APPROVED DATA (Section 0.4: "move from code
// constants to a versioned ingredient_rules table with SME sign-off; keep code as loader").
// Phase 9 held these as code constants, which meant changing a safety threshold was a deploy
// and left no record of who decided it. Same approval lifecycle as knowledge objects.

export interface VersionedIngredientRule {
  ingredient_key: string;
  display_name: string;
  // Minimum profile sensitivity_ceiling required to tolerate this ingredient.
  sensitivity_ceiling_required: number;
  triggers_avoid_flag: keyof AvoidFlags | null;
  rationale: string;
  version: number;
  status: KnowledgeStatus;
  sme_approved_by: string | null;
  sme_approved_at: string | null;
}

// Only approved rules may gate recommendations. An unapproved rule is a proposal, and a
// proposal must not silently change what a user is shown.
export function isActiveRule(rule: Pick<VersionedIngredientRule, 'status'>): boolean {
  return rule.status === 'approved';
}

export class EmptySafetyMatrixError extends Error {
  constructor() {
    super('refusing_to_score_with_empty_safety_matrix');
    this.name = 'EmptySafetyMatrixError';
  }
}

// FAIL CLOSED. If no approved rules load — a bad migration, an empty table, a failed query
// that returned [] — scoring must STOP, not proceed with zero exclusions. An empty matrix
// silently turns every hard safety filter into a no-op and would recommend retinoids to the
// most reactive profile in the system while looking perfectly healthy.
export function assertUsableMatrix(rules: VersionedIngredientRule[]): VersionedIngredientRule[] {
  const active = rules.filter(isActiveRule);
  if (active.length === 0) throw new EmptySafetyMatrixError();
  return active;
}

// Compile approved rules into the lookup the RulesEngine and ScoringEngine use.
export interface CompiledMatrix {
  rules: Map<string, VersionedIngredientRule>;
  matrix_version: string; // deterministic digest, written onto every recommendation row
}

export function compileMatrix(rules: VersionedIngredientRule[]): CompiledMatrix {
  const active = assertUsableMatrix(rules);
  const map = new Map<string, VersionedIngredientRule>();
  for (const r of active) map.set(r.ingredient_key, r);

  // A stable digest of (key, threshold, flag, version) across the sorted rule set. Written
  // onto recommendations so any past result can be reproduced against the exact safety data
  // that produced it — the audit question is "what did we know when we recommended this".
  const digestSource = active
    .map((r) => `${r.ingredient_key}:${r.sensitivity_ceiling_required}:${r.triggers_avoid_flag ?? '-'}:${r.version}`)
    .sort()
    .join('|');
  let hash = 0;
  for (let i = 0; i < digestSource.length; i++) hash = (hash * 31 + digestSource.charCodeAt(i)) >>> 0;
  return { rules: map, matrix_version: `im-${active.length}-${hash.toString(36)}` };
}

export function ingredientAllowedByMatrix(
  ingredientKey: string,
  matrix: CompiledMatrix,
  sensitivityCeiling: number,
  avoidFlags: AvoidFlags,
  declaredAvoidances: string[],
): boolean {
  if (declaredAvoidances.includes(ingredientKey)) return false;
  const rule = matrix.rules.get(ingredientKey);
  // An ingredient with no approved rule is not blocked — it is unreviewed, not known-unsafe.
  // Blocking everything unknown would empty the catalog; the SME backlog is the mitigation,
  // and unmatched ingredients are reported by unreviewedIngredients() below.
  if (!rule) return true;
  if (rule.triggers_avoid_flag && avoidFlags[rule.triggers_avoid_flag]) return false;
  return sensitivityCeiling >= rule.sensitivity_ceiling_required;
}

// Surfaces catalog ingredients with no approved rule, so the SME review backlog is a
// measurable number on the admin dashboard rather than an unknown.
export function unreviewedIngredients(catalogIngredientKeys: string[], matrix: CompiledMatrix): string[] {
  return [...new Set(catalogIngredientKeys)].filter((k) => !matrix.rules.has(k)).sort();
}

// The Phase 9 constants, restated as seed DATA for migration 0004 rather than as runtime
// truth. These are pre-approved by the migration so the system has a working matrix on day
// one; every subsequent change goes through the SME workflow.
export const SEED_INGREDIENT_RULES: Omit<VersionedIngredientRule, 'status' | 'sme_approved_by' | 'sme_approved_at'>[] = [
  { ingredient_key: 'retinol', display_name: 'Retinol', sensitivity_ceiling_required: 0.6, triggers_avoid_flag: 'high_strength_actives', rationale: 'Retinoids commonly cause irritation during introduction.', version: 1 },
  { ingredient_key: 'glycolic_acid', display_name: 'Glycolic acid', sensitivity_ceiling_required: 0.6, triggers_avoid_flag: 'high_strength_actives', rationale: 'AHA with high irritation potential on reactive skin.', version: 1 },
  { ingredient_key: 'salicylic_acid', display_name: 'Salicylic acid', sensitivity_ceiling_required: 0.7, triggers_avoid_flag: null, rationale: 'BHA; generally tolerated but drying at higher tolerance thresholds.', version: 1 },
  { ingredient_key: 'benzoyl_peroxide', display_name: 'Benzoyl peroxide', sensitivity_ceiling_required: 0.5, triggers_avoid_flag: 'high_strength_actives', rationale: 'Frequent irritant and fabric bleaching agent.', version: 1 },
  { ingredient_key: 'fragrance', display_name: 'Fragrance', sensitivity_ceiling_required: 0.4, triggers_avoid_flag: 'fragrance', rationale: 'Leading cause of cosmetic contact sensitivity.', version: 1 },
  { ingredient_key: 'essential_oil', display_name: 'Essential oils', sensitivity_ceiling_required: 0.4, triggers_avoid_flag: 'essential_oils', rationale: 'Volatile compounds associated with sensitisation.', version: 1 },
  { ingredient_key: 'denatured_alcohol', display_name: 'Denatured alcohol', sensitivity_ceiling_required: 0.5, triggers_avoid_flag: 'alcohol_denat', rationale: 'Can compromise barrier function on dry or reactive skin.', version: 1 },
  { ingredient_key: 'physical_scrub', display_name: 'Physical scrub particles', sensitivity_ceiling_required: 0.5, triggers_avoid_flag: 'physical_exfoliants', rationale: 'Mechanical abrasion risk.', version: 1 },
  { ingredient_key: 'niacinamide', display_name: 'Niacinamide', sensitivity_ceiling_required: 0.15, triggers_avoid_flag: null, rationale: 'Well tolerated across sensitivity levels at cosmetic concentrations.', version: 1 },
  { ingredient_key: 'vitamin_c_l_ascorbic', display_name: 'L-ascorbic acid', sensitivity_ceiling_required: 0.6, triggers_avoid_flag: null, rationale: 'Low pH formulations can sting reactive skin.', version: 1 },
  { ingredient_key: 'hyaluronic_acid', display_name: 'Hyaluronic acid', sensitivity_ceiling_required: 0.1, triggers_avoid_flag: null, rationale: 'Humectant, broadly tolerated.', version: 1 },
  { ingredient_key: 'ceramides', display_name: 'Ceramides', sensitivity_ceiling_required: 0.1, triggers_avoid_flag: null, rationale: 'Barrier lipid, broadly tolerated.', version: 1 },
  { ingredient_key: 'glycerin', display_name: 'Glycerin', sensitivity_ceiling_required: 0.1, triggers_avoid_flag: null, rationale: 'Humectant, broadly tolerated.', version: 1 },
  { ingredient_key: 'zinc_pca', display_name: 'Zinc PCA', sensitivity_ceiling_required: 0.2, triggers_avoid_flag: null, rationale: 'Sebum-regulating, generally well tolerated.', version: 1 },
  { ingredient_key: 'zinc_oxide', display_name: 'Zinc oxide', sensitivity_ceiling_required: 0.1, triggers_avoid_flag: null, rationale: 'Mineral UV filter, generally well tolerated in leave-on sunscreen formulas.', version: 1 },
];
