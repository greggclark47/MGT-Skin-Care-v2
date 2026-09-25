import type { ProfileVector } from '../types/skin-profile';

export const FEEDBACK_ENGINE_VERSION = '1.0.0';

// Feedback capture -> re-personalization (Section H SC-P4): product feedback, routine
// feedback, and "not right for me" / thumbs signals nudge the profile vector and trigger a
// new `skin_profile_versions` row with reason='feedback'. This is deterministic — the nudge
// magnitude and direction are fixed rules, never an LLM decision, so re-scoring stays
// reproducible and auditable exactly like the original classify() pass.

export type FeedbackSignal =
  | { type: 'product_thumbs'; product_id: string; sentiment: 'up' | 'down'; dimension?: keyof ProfileVector }
  | { type: 'not_right_for_me'; product_id: string; dimension: keyof ProfileVector }
  | { type: 'routine_adherence_low'; slot: string } // used by shouldSimplifyFromAdherence, not a vector nudge
  | { type: 'irritation_reported'; ingredient_key?: string };

export interface FeedbackResult {
  profile_vector: ProfileVector;
  version_reason: 'feedback';
  applied_signals: FeedbackSignal[];
  triggers_avoid_flag_review: boolean;
}

const NUDGE_MAGNITUDE = 0.15;

export function applyFeedback(current: ProfileVector, signals: FeedbackSignal[]): FeedbackResult {
  const next = { ...current };
  let triggersAvoidFlagReview = false;

  for (const signal of signals) {
    switch (signal.type) {
      case 'product_thumbs': {
        if (!signal.dimension) break;
        const delta = signal.sentiment === 'up' ? NUDGE_MAGNITUDE : -NUDGE_MAGNITUDE;
        next[signal.dimension] = Math.min(1, Math.max(0, next[signal.dimension] + delta));
        break;
      }
      case 'not_right_for_me': {
        // A stronger negative signal than a plain thumbs-down — the product actively missed
        // the mark on this dimension, so pull harder and flag for a sensitivity/ingredient
        // review rather than silently drifting the vector.
        next[signal.dimension] = Math.max(0, next[signal.dimension] - NUDGE_MAGNITUDE * 1.5);
        triggersAvoidFlagReview = true;
        break;
      }
      case 'irritation_reported': {
        // Irritation always tightens tolerance — never loosens it, regardless of which
        // ingredient is implicated. Ingredient-specific matrix updates are a human (SME)
        // review action, not something this function does automatically.
        next.sensitivity_ceiling = Math.max(0, next.sensitivity_ceiling - NUDGE_MAGNITUDE);
        triggersAvoidFlagReview = true;
        break;
      }
      case 'routine_adherence_low':
        break; // handled by shouldSimplifyFromAdherence, not a vector nudge
    }
  }

  return { profile_vector: next, version_reason: 'feedback', applied_signals: signals, triggers_avoid_flag_review: triggersAvoidFlagReview };
}

// Day-7/day-21 adherence check (Section H SC-P4 UX: "feedback prompts timed to routine
// adherence"). If adherence is low, the deterministic suggestion is to offer simplify() —
// never to silently drop steps.
export function shouldSimplifyFromAdherence(daysSinceStart: number, completedStepRatio: number): boolean {
  return (daysSinceStart === 7 || daysSinceStart === 21) && completedStepRatio < 0.5;
}
