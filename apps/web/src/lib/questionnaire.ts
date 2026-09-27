import {
  SKIN_TYPES, SKIN_CONCERNS, SKIN_SENSITIVITY, AGE_BANDS, ROUTINE_LEVELS,
  DESIRED_OUTCOMES, BUDGET_RANGES, type SkinProfileInput,
} from '@mgt/domain';

// The Skin Match questionnaire (Section G.2). Conflict C9's resolution: the three inputs
// Phase 9 dropped — age_band, current_routine, desired_outcome — are back as single-tap
// steps, and the target is 10 core taps in <=90s with optional steps deferred until AFTER
// the first result. Steps are DATA, not JSX, so web and mobile render the same flow and the
// `skin_match.step_completed` analytics event indexes mean the same thing on both.

export interface Choice { value: string; label: string; hint?: string }

export interface QuestionStep {
  id: keyof SkinProfileInput | 'ingredient_avoidances';
  prompt: string;
  helper?: string;
  choices: Choice[];
  multi: boolean;
  maxSelections?: number;
  optional: boolean;
}

const label = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const CORE_STEPS: QuestionStep[] = [
  {
    id: 'skin_type', prompt: 'How does your skin usually feel?',
    helper: 'Pick the closest match — you can refine this later.',
    // C8: `sensitive` is deliberately NOT a skin type. Sensitivity is its own gate below,
    // because a sensitive-and-oily user needs both facts, not one merged label.
    choices: SKIN_TYPES.map((v) => ({
      value: v,
      label: label(v),
      hint: { normal: 'Comfortable most days', dry: 'Tight or flaky', oily: 'Shiny by midday', combination: 'Oily T-zone, drier cheeks' }[v],
    })),
    multi: false, optional: false,
  },
  {
    id: 'concerns', prompt: "What would you most like to work on?",
    helper: 'Choose up to 3.',
    choices: SKIN_CONCERNS.map((v) => ({ value: v, label: label(v) })),
    multi: true, maxSelections: 3, optional: false,
  },
  {
    id: 'sensitivity', prompt: 'How reactive is your skin?',
    helper: 'This sets safety limits on what we recommend.',
    choices: SKIN_SENSITIVITY.map((v) => ({
      value: v, label: label(v),
      hint: { none: 'Rarely reacts', mild: 'Occasional stinging', moderate: 'Reacts to strong actives', high: 'Reacts often' }[v],
    })),
    multi: false, optional: false,
  },
  {
    id: 'age_band', prompt: 'Which age range are you in?',
    helper: 'Used to weight ageing and firmness — never stored as your exact age.',
    choices: AGE_BANDS.map((v) => ({ value: v, label: v.replace('_', '–').replace('–plus', '+') })),
    multi: false, optional: false,
  },
  {
    id: 'current_routine', prompt: 'What does your routine look like today?',
    choices: ROUTINE_LEVELS.map((v) => ({
      value: v, label: label(v),
      hint: { none: 'Little or nothing yet', basic: 'Cleanse and moisturise', advanced: 'Multiple actives' }[v],
    })),
    multi: false, optional: false,
  },
  {
    id: 'desired_outcome', prompt: 'If one thing changed, what would it be?',
    choices: DESIRED_OUTCOMES.map((v) => ({ value: v, label: label(v) })),
    multi: false, optional: false,
  },
  {
    id: 'budget_range', prompt: "What's a comfortable spend per product?",
    choices: BUDGET_RANGES.map((v) => ({
      value: v,
      label: { under_25: 'Under $25', between_25_50: '$25–50', between_50_100: '$50–100', over_100: '$100+' }[v],
    })),
    multi: false, optional: false,
  },
];

// Shown only AFTER the first result (Section G.2 progressive disclosure) so the core stays
// under the 90-second target.
export const OPTIONAL_STEPS: QuestionStep[] = [
  {
    id: 'ingredient_avoidances', prompt: 'Anything you already know you avoid?',
    helper: 'Optional. We apply these as hard exclusions, not preferences.',
    choices: [
      { value: 'fragrance', label: 'Fragrance' },
      { value: 'essential_oil', label: 'Essential oils' },
      { value: 'denatured_alcohol', label: 'Drying alcohols' },
      { value: 'retinol', label: 'Retinoids' },
      { value: 'salicylic_acid', label: 'Salicylic acid' },
      { value: 'benzoyl_peroxide', label: 'Benzoyl peroxide' },
    ],
    multi: true, optional: true,
  },
];

export interface AnswerState { [stepId: string]: string | string[] }

export function isStepAnswered(step: QuestionStep, answers: AnswerState): boolean {
  const value = answers[step.id];
  if (step.optional) return true;
  if (step.multi) return Array.isArray(value) && value.length > 0;
  return typeof value === 'string' && value.length > 0;
}

export function progress(answers: AnswerState): { answered: number; total: number; percent: number } {
  const answered = CORE_STEPS.filter((s) => isStepAnswered(s, answers)).length;
  return { answered, total: CORE_STEPS.length, percent: Math.round((answered / CORE_STEPS.length) * 100) };
}

// Toggle a choice, enforcing maxSelections. Returns the new value for that step.
export function toggleChoice(step: QuestionStep, current: string | string[] | undefined, value: string): string | string[] {
  if (!step.multi) return value;
  const list = Array.isArray(current) ? current : [];
  if (list.includes(value)) return list.filter((v) => v !== value);
  if (step.maxSelections && list.length >= step.maxSelections) return list; // silently ignore past the cap
  return [...list, value];
}

export function toProfileInput(answers: AnswerState): SkinProfileInput {
  return {
    skin_type: answers.skin_type as SkinProfileInput['skin_type'],
    concerns: (answers.concerns as SkinProfileInput['concerns']) ?? [],
    sensitivity: answers.sensitivity as SkinProfileInput['sensitivity'],
    age_band: answers.age_band as SkinProfileInput['age_band'],
    current_routine: answers.current_routine as SkinProfileInput['current_routine'],
    desired_outcome: answers.desired_outcome as SkinProfileInput['desired_outcome'],
    budget_range: answers.budget_range as SkinProfileInput['budget_range'],
    ingredient_avoidances: (answers.ingredient_avoidances as string[]) ?? [],
  };
}
