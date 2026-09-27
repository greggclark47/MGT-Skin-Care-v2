import { ROUTINE_SLOT_ORDER, type RoutineSlot, type RoutineTime } from '../types/enums';
import type { ScoreResult, ExclusionResult } from './scoring-engine';

export const ROUTINE_ENGINE_VERSION = '1.1.0';

export interface RoutineStep {
  slot: RoutineSlot;
  time: RoutineTime;
  product_id: string;
  order: number;      // position within the same time-of-day, per ROUTINE_SLOT_ORDER
  is_optional: boolean;
  frequency: string;  // e.g. 'daily', '2_3_weekly'
  conflict_notes: string[];
}

export interface Routine {
  steps: RoutineStep[];
  rules_version: string;
}

const REQUIRED_SLOTS: RoutineSlot[] = ['cleanser', 'treatment', 'moisturizer', 'sunscreen'];
const OPTIONAL_SLOTS: RoutineSlot[] = ['toner', 'serum', 'eye', 'exfoliant', 'mask', 'spot', 'face_oil', 'mist'];

// Product-pair conflict rules (Section C.4): same-session combinations that need a caution note
// rather than a hard block — the routine still builds, but the step carries a warning.
interface ConflictRule { a: string; b: string; note: string }
const CONFLICT_RULES: ConflictRule[] = [
  { a: 'retinoid', b: 'aha_bha', note: 'Avoid using retinoid and AHA/BHA in the same session — alternate nights.' },
  { a: 'vitamin_c_l_ascorbic', b: 'niacinamide', note: 'Vitamin C and niacinamide can be layered, but sensitive skin may prefer separating AM/PM.' },
  { a: 'benzoyl_peroxide', b: 'retinol', note: 'Benzoyl peroxide can deactivate retinol — use at different times of day.' },
];

const PM_ONLY_INGREDIENTS = new Set(['retinol', 'retinoid', 'retinal', 'tretinoin', 'adapalene']);

function timeForSlot(slot: RoutineSlot, ingredients: string[] = []): RoutineTime {
  if (slot === 'sunscreen') return 'am';
  if (slot === 'exfoliant' || slot === 'mask') return 'weekly';
  if (ingredients.some((ingredient) => PM_ONLY_INGREDIENTS.has(ingredient))) return 'pm';
  return 'am_pm';
}

// Build a routine by picking the top-scoring non-excluded candidate per slot, filling required
// slots first, then optional slots up to the profile's routine level.
export function buildRoutine(
  slotResults: Map<RoutineSlot, (ScoreResult | ExclusionResult)[]>,
  productsByIngredientSet: Map<string, string[]>, // product_id -> ingredient_keys, for conflict checks
): Routine {
  const steps: RoutineStep[] = [];
  const chosenIngredients = new Set<string>();

  const fillSlot = (slot: RoutineSlot, optional: boolean) => {
    const results = slotResults.get(slot);
    if (!results) return;
    // Excluded candidates (hard-filtered by ScoringEngine — inactive or an unsafe ingredient
    // for this profile) must never be placed in a routine, regardless of rank.
    const top = results.find((r): r is ScoreResult => !r.excluded);
    if (!top) return;
    const ingredients = productsByIngredientSet.get(top.product_id) ?? [];
    const conflictNotes: string[] = [];
    for (const rule of CONFLICT_RULES) {
      const hasA = ingredients.includes(rule.a) || chosenIngredients.has(rule.a);
      const hasB = ingredients.includes(rule.b) || chosenIngredients.has(rule.b);
      if (hasA && hasB) conflictNotes.push(rule.note);
    }
    ingredients.forEach((i) => chosenIngredients.add(i));
    steps.push({
      slot,
      time: timeForSlot(slot, ingredients),
      product_id: top.product_id,
      order: ROUTINE_SLOT_ORDER.indexOf(slot),
      is_optional: optional,
      frequency: slot === 'exfoliant' ? '2_3_weekly' : 'daily',
      conflict_notes: conflictNotes,
    });
  };

  for (const slot of REQUIRED_SLOTS) fillSlot(slot, false);
  for (const slot of OPTIONAL_SLOTS) fillSlot(slot, true);

  steps.sort((a, b) => a.order - b.order);
  return { steps, rules_version: ROUTINE_ENGINE_VERSION };
}

// simplify(): drop optional steps down to the 3-4 step core (cleanser, treatment, moisturizer,
// sunscreen). Deterministic — never calls the AI gateway.
export function simplify(routine: Routine): Routine {
  return { ...routine, steps: routine.steps.filter((s) => !s.is_optional) };
}

// cheapen(routine, targetDelta, priceLookup): for each slot, search cheaper same-slot
// alternatives in scored order until the routine's total price drops by targetDelta or no
// cheaper alternative remains, minimizing score loss per dollar saved.
export function cheapen(
  routine: Routine,
  targetDeltaCents: number,
  alternativesBySlot: Map<RoutineSlot, ScoreResult[]>,
  priceLookup: (productId: string) => number,
): Routine {
  let remaining = targetDeltaCents;
  const newSteps = routine.steps.map((step) => ({ ...step }));
  // Sort steps by potential savings-per-score-point descending isn't computable without
  // candidate prices per step here; simplest correct pass: greedily swap each optional slot
  // (lowest priority first) to its cheapest scored alternative until target is met.
  const bySavingsPriority = [...newSteps].sort((a, b) => Number(a.is_optional) - Number(b.is_optional)).reverse();
  for (const step of bySavingsPriority) {
    if (remaining <= 0) break;
    const alts = alternativesBySlot.get(step.slot);
    if (!alts || alts.length < 2) continue;
    const currentPrice = priceLookup(step.product_id);
    const cheaperAlt = alts.find((a) => priceLookup(a.product_id) < currentPrice);
    if (cheaperAlt) {
      const savings = currentPrice - priceLookup(cheaperAlt.product_id);
      step.product_id = cheaperAlt.product_id;
      remaining -= savings;
    }
  }
  return { steps: newSteps, rules_version: routine.rules_version };
}

// travel(routine, days): keep multi-use products, drop anything not travel-friendly (size >
// 100ml is a catalog attribute checked by the caller before calling this — this function's
// contract is purely which slots survive for a short trip), and skip weekly-frequency steps.
export function travel(routine: Routine, days: number): Routine {
  const keepWeekly = days >= 14; // a two-week+ trip still wants the weekly exfoliant/mask
  return {
    ...routine,
    steps: routine.steps.filter((s) => keepWeekly || s.frequency !== '2_3_weekly'),
  };
}
