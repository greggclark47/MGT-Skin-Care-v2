import type {
  SkinType, SkinConcern, SkinSensitivity, AgeBand, RoutineLevel, DesiredOutcome, BudgetRange,
} from './enums';

// Ten-dimension profile vector (Phase 9 base) — each dimension 0-1, used by ScoringEngine
// for weighted match. Order is fixed and versioned: changing it requires a rules_version bump.
export interface ProfileVector {
  hydration_need: number;
  oil_control_need: number;
  sensitivity_ceiling: number; // 0 = tolerates everything, 1 = react to almost anything
  acne_focus: number;
  aging_focus: number;
  brightening_focus: number;
  texture_focus: number;
  redness_focus: number;
  eye_area_focus: number;
  firmness_focus: number;
}

export interface AvoidFlags {
  fragrance: boolean;
  essential_oils: boolean;
  alcohol_denat: boolean;
  physical_exfoliants: boolean;
  high_strength_actives: boolean;
}

export interface SkinProfileInput {
  skin_type: SkinType;
  concerns: SkinConcern[];          // 1-3 primary concerns, questionnaire-ordered
  sensitivity: SkinSensitivity;
  age_band: AgeBand;
  current_routine: RoutineLevel;
  desired_outcome: DesiredOutcome;
  budget_range: BudgetRange;
  ingredient_avoidances: string[];  // free-text/normalized ingredient keys the user flagged
}

export interface SkinProfile {
  id: string;
  user_id: string | null;           // null for pre-account sessions
  session_token: string | null;
  input: SkinProfileInput;
  profile_vector: ProfileVector;
  avoid_flags: AvoidFlags;
  rules_version: string;
  created_at: string;
  version: number;                  // increments via skin_profile_versions on feedback-driven re-scoring
}

// The E.6 explanation contract — fixed shape for every recommended product.
// `blurb` is the only LLM-generated field; everything else is deterministic.
export interface ProductExplanation {
  product_id: string;
  match_score: number;              // 0-100
  why_matched: string[];            // deterministic reason codes, e.g. "targets:acne", "fits:oily"
  ingredients: { name: string; role: string }[];
  sensitivity_compatibility: 'safe' | 'caution' | 'excluded';
  routine_placement: { slot: string; time: string; frequency: string };
  cautions: string[];
  alternatives: { product_id: string; reason: 'cheaper' | 'premium' | 'cleaner' | 'gentler' }[];
  blurb: string | null;             // filled by AI Gateway task `product_why`; null until generated
}
