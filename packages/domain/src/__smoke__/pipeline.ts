// End-to-end smoke test of the Tier-0 engine pipeline. Not a substitute for the SC-P2 jest
// suite (200-case eval golden set, Section H) — this proves the pipeline wires together and
// produces sane output before that harness exists.
import { classify } from '../engines/rules-engine';
import { scoreCandidates, type CandidateProduct } from '../engines/scoring-engine';
import { buildRoutine } from '../engines/routine-engine';
import { buildCartFromRoutine, applyBundle, type ProductCatalogLookup } from '../engines/cart-engine';
import { priceCart } from '../engines/cart-engine';
import { resolveEntitlement } from '../engines/entitlement-resolver';
import { estimateRunOut, shouldNudge } from '../engines/replenishment-engine';
import type { RoutineSlot } from '../types/enums';

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) { failures++; console.error('FAIL:', message); }
}

const profileInput = {
  skin_type: 'oily' as const,
  concerns: ['acne', 'pore_minimizing'] as const,
  sensitivity: 'moderate' as const,
  age_band: '26_35' as const,
  current_routine: 'basic' as const,
  desired_outcome: 'clearer' as const,
  budget_range: 'between_25_50' as const,
  ingredient_avoidances: [] as string[],
};

const classification = classify({ ...profileInput, concerns: [...profileInput.concerns] });
console.log('1. classify() ->', JSON.stringify(classification.profile_vector));
check(classification.profile_vector.acne_focus > 0.5, 'acne_focus should be elevated for acne concern');

const candidates: Record<RoutineSlot, CandidateProduct[]> = {
  cleanser: [{ id: 'p-cleanser-1', slot: 'cleanser', ingredients: ['salicylic_acid'], price_cents: 2200, concern_tags: [], concern_weights: { acne_focus: 1 }, type_fit: { oil_control_need: 1 }, brand_id: 'brand-a', status: 'active' }],
  treatment: [{ id: 'p-treatment-1', slot: 'treatment', ingredients: ['zinc_pca'], price_cents: 3000, concern_tags: [], concern_weights: { acne_focus: 1, texture_focus: 0.5 }, type_fit: { oil_control_need: 1 }, brand_id: 'brand-a', status: 'active' }],
  moisturizer: [{ id: 'p-moist-1', slot: 'moisturizer', ingredients: ['glycerin'], price_cents: 2800, concern_tags: [], concern_weights: {}, type_fit: { hydration_need: 1, oil_control_need: 0.5 }, brand_id: 'brand-b', status: 'active' }],
  sunscreen: [{ id: 'p-spf-1', slot: 'sunscreen', ingredients: [], price_cents: 1800, concern_tags: [], concern_weights: {}, type_fit: {}, brand_id: 'brand-b', status: 'active' }],
  toner: [], serum: [], eye: [], exfoliant: [], mask: [], spot: [], face_oil: [], mist: [], body: [],
};

const slotResults = new Map<RoutineSlot, ReturnType<typeof scoreCandidates>>();
const ingredientMap = new Map<string, string[]>();
for (const [slot, products] of Object.entries(candidates) as [RoutineSlot, CandidateProduct[]][]) {
  const scored = scoreCandidates(products, classification.profile_vector, classification.avoid_flags, [], profileInput.budget_range);
  slotResults.set(slot, scored as any);
  products.forEach((p) => ingredientMap.set(p.id, p.ingredients));
}
console.log('2. scoreCandidates(cleanser) ->', JSON.stringify(slotResults.get('cleanser')));

const routine = buildRoutine(slotResults, ingredientMap);
console.log('3. buildRoutine() -> steps:', routine.steps.map((s) => `${s.slot}:${s.product_id}`).join(', '));
check(
  routine.steps.every((s) => s.slot !== 'cleanser'),
  'FAIL: an excluded (unsafe) candidate must never appear in the built routine',
);
check(routine.steps.length === 3, 'expected 3 required-slot steps: cleanser excluded as unsafe for this profile, no optional candidates supplied');

const pmOnlyResults = new Map<RoutineSlot, ReturnType<typeof scoreCandidates>>();
pmOnlyResults.set('treatment', [{product_id: 'p-retinol-1', score: 100, reasons: [], excluded: false}]);
const pmOnlyRoutine = buildRoutine(pmOnlyResults, new Map([['p-retinol-1', ['retinol']]]));
check(pmOnlyRoutine.steps[0]?.time === 'pm', 'retinol-class treatments must be PM-only, not AM/PM');

const catalog: ProductCatalogLookup = {
  price_cents: (id) => ({ 'p-cleanser-1': 2200, 'p-treatment-1': 3000, 'p-moist-1': 2800, 'p-spf-1': 1800 } as Record<string, number>)[id] ?? 0,
  isAvailable: () => true,
};
let cart = buildCartFromRoutine(routine, catalog);
cart = applyBundle(cart, [{ id: 'starter-bundle', required_product_ids: ['p-cleanser-1', 'p-treatment-1', 'p-moist-1', 'p-spf-1'], discount_cents: 500 }]);
const pricing = priceCart(cart, false, 599, 0.07);
console.log('4. cart total ->', JSON.stringify(pricing));
check(pricing.total_cents > 0, 'cart total should be positive');

const entitlement = resolveEntitlement([{ provider: 'stripe', status: 'active', current_period_end: new Date(Date.now() + 20 * 86400000).toISOString() }]);
console.log('5. resolveEntitlement() ->', JSON.stringify(entitlement));
check(entitlement.premium === true, 'active stripe sub should resolve premium=true');

const runout = estimateRunOut({ size_ml: 150, frequency_per_week: 14, ml_per_use: 2, purchased_at: new Date(Date.now() - 30 * 86400000).toISOString() });
console.log('6. estimateRunOut() ->', JSON.stringify(runout), 'shouldNudge:', shouldNudge(runout));

if (failures) {
  throw new Error(`SMOKE TEST FAILED — ${failures} assertion${failures === 1 ? '' : 's'} failed.`);
} else {
  console.log('\nSMOKE TEST PASSED — all six engines wired end to end.');
}
