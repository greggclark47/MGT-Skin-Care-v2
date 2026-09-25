import type { SkinProfileInput, ProfileVector, AvoidFlags } from '../types/skin-profile';
import type { SkinType, SkinConcern } from '../types/enums';

export const RULES_ENGINE_VERSION = '2.0.0'; // SC-P2: age band, current routine, desired outcome added; `sensitive` removed from skin_type per C8

// Base vector by skin type (Phase 9, retained). Each is a starting point the concern/sensitivity
// pass then adjusts. Loader indirection (see loadSensitivityMatrix below) is what lets this move
// to a versioned `ingredient_rules` table without changing callers (Section 0.4 REFACTOR note).
const BASE_VECTOR_BY_SKIN_TYPE: Record<SkinType, ProfileVector> = {
  normal:      { hydration_need: 0.4, oil_control_need: 0.3, sensitivity_ceiling: 0.3, acne_focus: 0.2, aging_focus: 0.3, brightening_focus: 0.3, texture_focus: 0.3, redness_focus: 0.2, eye_area_focus: 0.3, firmness_focus: 0.3 },
  dry:         { hydration_need: 0.9, oil_control_need: 0.1, sensitivity_ceiling: 0.5, acne_focus: 0.1, aging_focus: 0.4, brightening_focus: 0.3, texture_focus: 0.4, redness_focus: 0.4, eye_area_focus: 0.4, firmness_focus: 0.4 },
  oily:        { hydration_need: 0.3, oil_control_need: 0.9, sensitivity_ceiling: 0.3, acne_focus: 0.6, aging_focus: 0.2, brightening_focus: 0.3, texture_focus: 0.4, redness_focus: 0.2, eye_area_focus: 0.2, firmness_focus: 0.2 },
  combination: { hydration_need: 0.5, oil_control_need: 0.6, sensitivity_ceiling: 0.4, acne_focus: 0.4, aging_focus: 0.3, brightening_focus: 0.3, texture_focus: 0.4, redness_focus: 0.3, eye_area_focus: 0.3, firmness_focus: 0.3 },
};

// Concern → profile-vector focus dimension. One concern can nudge multiple dimensions.
const CONCERN_ADJUSTMENTS: Record<SkinConcern, Partial<ProfileVector>> = {
  acne: { acne_focus: 0.4, oil_control_need: 0.15 },
  anti_aging: { aging_focus: 0.4, firmness_focus: 0.2 },
  brightening: { brightening_focus: 0.4 },
  hydration: { hydration_need: 0.3 },
  hyperpigmentation: { brightening_focus: 0.35, texture_focus: 0.1 },
  pore_minimizing: { texture_focus: 0.3, oil_control_need: 0.15 },
  redness_relief: { redness_focus: 0.4, sensitivity_ceiling: 0.15 },
  texture_smoothing: { texture_focus: 0.4 },
  dark_circles: { eye_area_focus: 0.5 },
  firmness: { firmness_focus: 0.4 },
};

// Ingredient sensitivity-ceiling matrix (Phase 9's 34-entry matrix). This is a representative
// seed, not the SME-approved production set — Section 0.4 moves the real data into
// `ingredient_rules` with an SME sign-off column; this loader function is the seam.
export interface IngredientRule {
  ingredient_key: string;
  sensitivity_ceiling_required: number; // profile.sensitivity_ceiling must be <= this to allow
  triggers_avoid_flag?: keyof AvoidFlags;
}
const SEED_INGREDIENT_RULES: IngredientRule[] = [
  { ingredient_key: 'retinol', sensitivity_ceiling_required: 0.6, triggers_avoid_flag: 'high_strength_actives' },
  { ingredient_key: 'glycolic_acid', sensitivity_ceiling_required: 0.6, triggers_avoid_flag: 'high_strength_actives' },
  { ingredient_key: 'salicylic_acid', sensitivity_ceiling_required: 0.7 },
  { ingredient_key: 'benzoyl_peroxide', sensitivity_ceiling_required: 0.5, triggers_avoid_flag: 'high_strength_actives' },
  { ingredient_key: 'fragrance', sensitivity_ceiling_required: 0.4, triggers_avoid_flag: 'fragrance' },
  { ingredient_key: 'essential_oil', sensitivity_ceiling_required: 0.4, triggers_avoid_flag: 'essential_oils' },
  { ingredient_key: 'denatured_alcohol', sensitivity_ceiling_required: 0.5, triggers_avoid_flag: 'alcohol_denat' },
  { ingredient_key: 'physical_scrub', sensitivity_ceiling_required: 0.5, triggers_avoid_flag: 'physical_exfoliants' },
  { ingredient_key: 'niacinamide', sensitivity_ceiling_required: 0.9 },
  { ingredient_key: 'vitamin_c_l_ascorbic', sensitivity_ceiling_required: 0.6 },
  { ingredient_key: 'hyaluronic_acid', sensitivity_ceiling_required: 1.0 },
  { ingredient_key: 'ceramides', sensitivity_ceiling_required: 1.0 },
  // TODO(SC-P2 data track): load the remaining ~22 entries from the SME-reviewed source; keep
  // this array as the CI-tested fallback so the engine never runs with zero safety data.
];

export function loadSensitivityMatrix(): IngredientRule[] {
  // Seam for Section 0.4: swap this for a DB-backed loader (`select * from ingredient_rules
  // where status = 'approved'`) without touching classify() or ScoringEngine.
  return SEED_INGREDIENT_RULES;
}

function sensitivityFloor(level: SkinProfileInput['sensitivity']): number {
  return { none: 0.9, mild: 0.65, moderate: 0.4, high: 0.15 }[level];
}

export interface ClassificationResult {
  profile_vector: ProfileVector;
  avoid_flags: AvoidFlags;
  rules_version: string;
}

export function classify(input: SkinProfileInput): ClassificationResult {
  const base = { ...BASE_VECTOR_BY_SKIN_TYPE[input.skin_type] };

  for (const concern of input.concerns) {
    const adj = CONCERN_ADJUSTMENTS[concern];
    for (const [dim, delta] of Object.entries(adj) as [keyof ProfileVector, number][]) {
      base[dim] = Math.min(1, base[dim] + delta);
    }
  }

  // Sensitivity is a ceiling, not additive: the user's stated sensitivity level can only
  // lower how permissive the profile is, never raise it above what skin type + concerns implied.
  base.sensitivity_ceiling = Math.min(base.sensitivity_ceiling, sensitivityFloor(input.sensitivity));

  // Age band nudges aging/firmness focus independent of stated concerns (v1 core input).
  if (input.age_band === '46_55' || input.age_band === '56_plus') {
    base.aging_focus = Math.min(1, base.aging_focus + 0.2);
    base.firmness_focus = Math.min(1, base.firmness_focus + 0.15);
  }

  const matrix = loadSensitivityMatrix();
  const avoid_flags: AvoidFlags = {
    fragrance: false, essential_oils: false, alcohol_denat: false,
    physical_exfoliants: false, high_strength_actives: false,
  };
  for (const rule of matrix) {
    // A rule triggers its avoid-flag when the profile's tolerance is below what the
    // ingredient requires — i.e. this profile cannot safely be shown that ingredient.
    if (rule.triggers_avoid_flag && base.sensitivity_ceiling < rule.sensitivity_ceiling_required) {
      avoid_flags[rule.triggers_avoid_flag] = true;
    }
  }
  // Explicit user-declared avoidances always win regardless of computed sensitivity.
  for (const key of input.ingredient_avoidances) {
    const match = matrix.find((r) => r.ingredient_key === key);
    if (match?.triggers_avoid_flag) avoid_flags[match.triggers_avoid_flag] = true;
  }

  return { profile_vector: base, avoid_flags, rules_version: RULES_ENGINE_VERSION };
}

// Is a given ingredient permitted for this profile? Used by ScoringEngine's hard filter.
export function ingredientAllowed(ingredientKey: string, profile: ProfileVector, avoidFlags: AvoidFlags, declaredAvoidances: string[]): boolean {
  if (declaredAvoidances.includes(ingredientKey)) return false;
  const rule = loadSensitivityMatrix().find((r) => r.ingredient_key === ingredientKey);
  if (!rule) return true; // unknown ingredients are not blocked by the safety matrix (SME review backlog, not a false-safe)
  if (rule.triggers_avoid_flag && avoidFlags[rule.triggers_avoid_flag]) return false;
  return profile.sensitivity_ceiling >= rule.sensitivity_ceiling_required;
}
