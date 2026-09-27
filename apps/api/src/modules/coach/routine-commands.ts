import { simplify, cheapen, travel, type Routine, type RoutineSlot } from '@mgt/domain';
import type { ScoreResult } from '@mgt/domain';

// Deterministic routine-command intents (Section C.4/H "routine intelligence commands").
// This is Tier-0 logic: intent classification here is a fixed keyword/pattern match, NOT an
// LLM call. `coach_routine_command` in the AI Gateway's task registry only handles turning a
// free-text user message into ONE of these intents (a small, validated classification task);
// the actual routine mutation always runs through this module so it is 100% reproducible and
// auditable. §13's "0 model-authored routine changes" KPI depends on that separation holding.

export type RoutineCommandIntent =
  | { type: 'simplify' }
  | { type: 'cheapen'; target_delta_cents: number }
  | { type: 'travel'; days: number }
  | { type: 'which_first' }
  | { type: 'replace'; slot: RoutineSlot };

export interface RoutineCommandResult {
  intent: RoutineCommandIntent;
  routine: Routine;
  explanation: string;
}

// Deterministic pattern match for the common phrasings named in the master prompt. This is a
// fallback/dev path — production routes free text through the AI Gateway's `coach_routine_command`
// classifier first, which still must resolve to one of these same five intent shapes.
export function parseIntent(text: string): RoutineCommandIntent | null {
  const t = text.toLowerCase();
  if (/simpler|simplify|fewer steps|cut (it |this )?down/.test(t)) return { type: 'simplify' };
  if (/travel|trip|packing/.test(t)) {
    const daysMatch = t.match(/(\d+)\s*day/);
    return { type: 'travel', days: daysMatch ? Number(daysMatch[1]) : 7 };
  }
  if (/cheaper|save money|lower cost|budget/.test(t)) {
    const dollarMatch = t.match(/\$(\d+)/);
    return { type: 'cheapen', target_delta_cents: dollarMatch ? Number(dollarMatch[1]) * 100 : 1000 };
  }
  if (/which (one )?first|order|sequence/.test(t)) return { type: 'which_first' };
  const replaceMatch = t.match(/replace (my |the )?(\w+)/);
  if (replaceMatch) {
    const slot = replaceMatch[2] as RoutineSlot;
    return { type: 'replace', slot };
  }
  return null;
}

export function applyIntent(
  intent: RoutineCommandIntent,
  routine: Routine,
  alternativesBySlot: Map<RoutineSlot, ScoreResult[]>,
  priceLookup: (productId: string) => number,
): RoutineCommandResult {
  switch (intent.type) {
    case 'simplify':
      return { intent, routine: simplify(routine), explanation: 'Cut the routine down to the essential steps: cleanser, treatment, moisturizer, sunscreen.' };
    case 'cheapen':
      return { intent, routine: cheapen(routine, intent.target_delta_cents, alternativesBySlot, priceLookup), explanation: `Swapped in cheaper alternatives to save around $${(intent.target_delta_cents / 100).toFixed(2)}.` };
    case 'travel':
      return { intent, routine: travel(routine, intent.days), explanation: `Trimmed the routine for a ${intent.days}-day trip — weekly-frequency steps are dropped for shorter trips.` };
    case 'which_first':
      return { intent, routine, explanation: `Apply in this order: ${routine.steps.map((s) => s.slot).join(' → ')}.` };
    case 'replace': {
      const remaining = { ...routine, steps: routine.steps.filter((s) => s.slot !== intent.slot) };
      return { intent, routine: remaining, explanation: `Removed the ${intent.slot} step — use the swap endpoint to pick a specific replacement.` };
    }
  }
}
