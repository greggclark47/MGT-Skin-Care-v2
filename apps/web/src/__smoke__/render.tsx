import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkinMatchStep } from '../components/SkinMatchStep';
import { ProductExplanationCard, humanizeReason } from '../components/ProductExplanation';
import { MedicalDisclosure } from '../components/MedicalDisclosure';
import { Brand } from '../components/Brand';
import { CORE_STEPS, toggleChoice, progress, toProfileInput, isStepAnswered, type AnswerState } from '@mgt/shared';
import { color } from '../components/theme-tokens';
import type { ProductExplanation } from '@mgt/domain';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}

function renderStep(stepIndex: number, answers: AnswerState) {
  return renderToStaticMarkup(
    <SkinMatchStep
      step={CORE_STEPS[stepIndex]} stepIndex={stepIndex} totalSteps={CORE_STEPS.length}
      answers={answers} onAnswer={() => {}} onNext={() => {}} onBack={() => {}}
    />,
  );
}

console.log('\n== 0. Shared MGT brand shell ==');
{
  const html = renderToStaticMarkup(<Brand />);
  check('shared brand uses the MGT mark asset', html.includes('src="/mgt-mark.svg"') && html.includes('class="brand-mark-image"'));
  check('brand remains an accessible home link', html.includes('aria-label="MGT Skin Care home"') && html.includes('href="/"'));
}

console.log('\n== 1. Questionnaire covers the C9 inputs Phase 9 dropped ==');
{
  const ids = CORE_STEPS.map((s) => s.id);
  check('age_band present', ids.includes('age_band'));
  check('current_routine present', ids.includes('current_routine'));
  check('desired_outcome present', ids.includes('desired_outcome'));
  check('core flow is 7 steps (10 taps incl. multi-select)', CORE_STEPS.length === 7, CORE_STEPS.length);
  const skinType = CORE_STEPS.find((s) => s.id === 'skin_type')!;
  // C8: `sensitive` must not be a skin TYPE — it is a separate sensitivity gate.
  check('no "sensitive" skin type offered (C8)', !skinType.choices.some((c) => c.value === 'sensitive'), skinType.choices.map((c) => c.value));
  check('sensitivity is its own step', ids.includes('sensitivity'));
}

console.log('\n== 2. Multi-select respects the 3-concern cap ==');
{
  const concerns = CORE_STEPS.find((s) => s.id === 'concerns')!;
  let v = toggleChoice(concerns, undefined, 'acne') as string[];
  v = toggleChoice(concerns, v, 'hydration') as string[];
  v = toggleChoice(concerns, v, 'firmness') as string[];
  check('three selections accepted', v.length === 3, v);
  const capped = toggleChoice(concerns, v, 'brightening') as string[];
  check('fourth selection ignored at cap', capped.length === 3, capped);
  const deselected = toggleChoice(concerns, v, 'acne') as string[];
  check('deselect still works at cap', deselected.length === 2 && !deselected.includes('acne'), deselected);

  const html = renderStep(1, { concerns: v });
  check('over-cap choices render disabled, not hidden', html.includes('disabled=""') && html.includes('choice-brightening'), html.includes('choice-brightening'));
}

console.log('\n== 3. Advance is gated on answering ==');
{
  const empty = renderStep(0, {});
  check('next disabled with no answer', /data-testid="next"[^>]*disabled/.test(empty) || empty.includes('disabled=""'), empty.slice(0, 200));
  const answered = renderStep(0, { skin_type: 'oily' });
  check('next enabled once answered', answered.includes(color.accent));
  check('isStepAnswered false when unanswered', isStepAnswered(CORE_STEPS[0], {}) === false);
  check('isStepAnswered true when answered', isStepAnswered(CORE_STEPS[0], { skin_type: 'oily' }) === true);
  check('optional steps never block', isStepAnswered({ ...CORE_STEPS[0], optional: true }, {}) === true);
}

console.log('\n== 4. Accessibility basics on the step ==');
{
  const single = renderStep(0, {});
  check('single-select uses radiogroup', single.includes('role="radiogroup"'));
  check('choices are radios with aria-checked', single.includes('role="radio"') && single.includes('aria-checked'));
  const multi = renderStep(1, {});
  check('multi-select uses group + checkbox roles', multi.includes('role="group"') && multi.includes('role="checkbox"'));
  check('44px minimum tap target applied', single.includes('min-height:44px'));
  check('step position announced', single.includes('Step 1 of 7'));
  const last = renderStep(CORE_STEPS.length - 1, {});
  check('final step CTA changes copy', last.includes('See my routine'));
}

console.log('\n== 5. Progress reflects answered core steps ==');
{
  check('0% empty', progress({}).percent === 0);
  const partial = progress({ skin_type: 'dry', concerns: ['hydration'] });
  check('2 of 7 answered', partial.answered === 2 && partial.total === 7, partial);
  const full: AnswerState = { skin_type: 'dry', concerns: ['hydration'], sensitivity: 'mild', age_band: '26_35', current_routine: 'basic', desired_outcome: 'glow', budget_range: 'under_25' };
  check('100% when all core answered', progress(full).percent === 100, progress(full));
  const input = toProfileInput(full);
  check('maps to a valid SkinProfileInput', input.skin_type === 'dry' && input.concerns.length === 1 && Array.isArray(input.ingredient_avoidances), input);
}

console.log('\n== 6. Explanation contract renders deterministically, AI copy is optional ==');
{
  const base: ProductExplanation = {
    product_id: 'p1', match_score: 87,
    why_matched: ['targets:primary_concern', 'fits:budget'],
    ingredients: [{ name: 'Niacinamide', role: 'oil balance' }],
    sensitivity_compatibility: 'caution',
    routine_placement: { slot: 'treatment', time: 'pm', frequency: 'every_other_day' },
    cautions: ['Introduce every other night at first.'],
    alternatives: [], blurb: null,
  };
  const withoutAi = renderToStaticMarkup(<ProductExplanationCard explanation={base} productName="Balance Serum" />);
  check('renders fully with blurb=null', withoutAi.includes('87% match') && withoutAi.includes('Targets the concern you picked first'), withoutAi.slice(0, 200));
  check('no AI block when blurb absent', !withoutAi.includes('ai-blurb'));
  check('caution styling used, not danger red', withoutAi.includes(color.caution) && !withoutAi.includes(color.danger));
  check('placement shown', withoutAi.includes('treatment') && withoutAi.includes('every other day'));

  const withAi = renderToStaticMarkup(<ProductExplanationCard explanation={{ ...base, blurb: 'Gentle enough for most evenings.' }} productName="Balance Serum" />);
  check('AI copy rendered when present', withAi.includes('Gentle enough for most evenings.'));
  check('AI copy explicitly labelled', withAi.includes('AI-written summary'));

  const excluded = renderToStaticMarkup(<ProductExplanationCard explanation={{ ...base, sensitivity_compatibility: 'excluded' }} productName="X" />);
  check('excluded state uses danger styling', excluded.includes('Not recommended for you'));

  check('unknown reason codes degrade gracefully', humanizeReason('some:new_code') === 'some new code', humanizeReason('some:new_code'));
}

console.log('\n== 7. Medical disclosure states the boundary ==');
{
  const html = renderToStaticMarkup(<MedicalDisclosure />);
  check('states cosmetic-not-medical', html.includes('not medical care') || html.includes('Cosmetic guidance'));
  check('offers escalation path', /dermatologist/i.test(html));
  check('makes no diagnosis or cure claim', !/cure|diagnos(e|is)|treat your/i.test(html.replace('not a diagnosis', '')));
}

console.log(failures === 0 ? '\nWEB UI: ALL CHECKS PASSED' : `\nWEB UI: ${failures} CHECK(S) FAILED`);
if (failures > 0) process.exitCode = 1;

// ============ Destination screens ============
import { SkinProfileView } from '../components/SkinProfileView';
import { RoutineView, stepsForTab } from '../components/RoutineView';
import { ShopView, money } from '../components/ShopView';
import { CoachView, diffRoutines } from '../components/CoachView';
import type { Routine, Cart, PricingResult, ProfileVector, AvoidFlags } from '@mgt/domain';

const vector: ProfileVector = {
  hydration_need: 0.9, oil_control_need: 0.1, sensitivity_ceiling: 0.35, acne_focus: 0.1,
  aging_focus: 0.6, brightening_focus: 0.3, texture_focus: 0.4, redness_focus: 0.5,
  eye_area_focus: 0.4, firmness_focus: 0.5,
};

console.log('\n== 8. My Skin: profile, exclusions, timeline ==');
{
  const noAvoid: AvoidFlags = { fragrance: false, essential_oils: false, alcohol_denat: false, physical_exfoliants: false, high_strength_actives: false };
  const clean = renderToStaticMarkup(<SkinProfileView vector={vector} avoidFlags={noAvoid} rulesVersion="2.0.0" versions={[{ version: 1, created_at: '2026-09-01T00:00:00Z', reason: 'initial' }]} />);
  check('renders all ten dimensions as meters', (clean.match(/role="meter"/g) ?? []).length === 10, (clean.match(/role="meter"/g) ?? []).length);
  check('meters carry accessible values', clean.includes('aria-valuenow="90"'), clean.includes('aria-valuenow="90"'));
  check('empty exclusions handled', clean.includes('no-exclusions'));
  check('rules version surfaced for auditability', clean.includes('2.0.0'));

  const withAvoid = renderToStaticMarkup(<SkinProfileView vector={vector} avoidFlags={{ ...noAvoid, fragrance: true, high_strength_actives: true }} rulesVersion="2.0.0" versions={[
    { version: 1, created_at: '2026-09-01T00:00:00Z', reason: 'initial' },
    { version: 2, created_at: '2026-09-04T00:00:00Z', reason: 'feedback' },
  ]} />);
  check('active exclusions listed', withAvoid.includes('Fragrance') && withAvoid.includes('High-strength actives'));
  check('timeline shows feedback-driven update', withAvoid.includes('Updated from your feedback'));
  check('timeline is an ordered list', withAvoid.includes('<ol'));
}

console.log('\n== 9. My Routine: tabs, ordering, conflict notes, modes ==');
{
  const routine: Routine = {
    rules_version: '1.0.0',
    steps: [
      { slot: 'sunscreen', time: 'am', product_id: 'spf-1', order: 9, is_optional: false, frequency: 'daily', conflict_notes: [] },
      { slot: 'cleanser', time: 'am_pm', product_id: 'cl-1', order: 0, is_optional: false, frequency: 'daily', conflict_notes: [] },
      { slot: 'treatment', time: 'am_pm', product_id: 'tr-1', order: 4, is_optional: false, frequency: 'daily',
        conflict_notes: ['Avoid using retinoid and AHA/BHA in the same session — alternate nights.'] },
      { slot: 'exfoliant', time: 'weekly', product_id: 'ex-1', order: 1, is_optional: true, frequency: '2_3_weekly', conflict_notes: [] },
      { slot: 'toner', time: 'am_pm', product_id: 'to-1', order: 2, is_optional: true, frequency: 'daily', conflict_notes: [] },
    ],
  };
  const am = stepsForTab(routine, 'am');
  check('AM includes am and am_pm steps', am.length === 4, am.map((s) => s.slot));
  check('AM excludes weekly steps', !am.some((s) => s.slot === 'exfoliant'));
  check('steps sorted by canonical order', am[0].slot === 'cleanser' && am[am.length - 1].slot === 'sunscreen', am.map((s) => s.slot));
  const pm = stepsForTab(routine, 'pm');
  check('PM excludes sunscreen', !pm.some((s) => s.slot === 'sunscreen'), pm.map((s) => s.slot));
  check('weekly tab has the exfoliant', stepsForTab(routine, 'weekly').map((s) => s.slot).includes('exfoliant'));

  const html = renderToStaticMarkup(<RoutineView routine={routine} productName={(id) => `Product ${id}`} onMode={() => {}} onSwap={() => {}} />);
  check('conflict note surfaced on the step', html.includes('conflict-note') && html.includes('alternate nights'));
  check('optional step labelled', html.includes('optional'));
  check('all three modes offered', html.includes('mode-simplify') && html.includes('mode-cheapen') && html.includes('mode-travel'));
  check('tabs use tablist/tab roles', html.includes('role="tablist"') && html.includes('role="tab"'));
  check('swap available per step', html.includes('swap-cleanser'));

  const emptyRoutine: Routine = { rules_version: '1.0.0', steps: [] };
  check('empty tab handled', renderToStaticMarkup(<RoutineView routine={emptyRoutine} productName={(i) => i} />).includes('empty-tab'));
}

console.log('\n== 10. Shop: routine-as-cart with explained swaps ==');
{
  const cart: Cart = {
    bundle_id: 'starter', bundle_discount_cents: 500,
    items: [
      { product_id: 'cl-1', slot: 'cleanser', unit_price_cents: 2200, quantity: 1, is_swap: false },
      { product_id: 'mo-2', slot: 'moisturizer', unit_price_cents: 1900, quantity: 1, is_swap: true, swap_reason: 'cheaper', swapped_from_product_id: 'mo-1' },
    ],
  };
  const pricing: PricingResult = { subtotal_cents: 4100, member_discount_cents: 0, bundle_discount_cents: 500, shipping_cents: 599, taxable_base_cents: 3600, tax_cents: 252, total_cents: 4451 };
  const html = renderToStaticMarkup(<ShopView cart={cart} pricing={pricing} productName={(id) => `Product ${id}`} isPremiumMember={false} onCheckout={() => {}} />);
  check('swap carries its reason', html.includes('swap-explanation') && html.includes('Swapped for a cheaper option'));
  check('swap names what it replaced', html.includes('was Product mo-1'));
  check('bundle saving shown', html.includes('bundle-saving') && html.includes('−$5.00'));
  check('total rendered', html.includes('$44.51'));
  check('premium upsell framed as a saving on this cart', html.includes('premium-upsell') && html.includes('5%'));
  check('disclosure present on a commerce screen', html.includes('medical-disclosure'));

  const member = renderToStaticMarkup(<ShopView cart={cart} pricing={{ ...pricing, member_discount_cents: 205 }} productName={(i) => i} isPremiumMember={true} />);
  check('no upsell for existing members', !member.includes('premium-upsell'));
  check('member saving shown when applied', member.includes('member-saving'));

  const empty = renderToStaticMarkup(<ShopView cart={{ items: [], bundle_id: null, bundle_discount_cents: 0 }} pricing={pricing} productName={(i) => i} isPremiumMember={false} />);
  check('empty cart blocks checkout', empty.includes('empty-cart') && !empty.includes('data-testid="checkout"'));
  check('money formats cents correctly', money(4451) === '$44.51' && money(0) === '$0.00', money(4451));
}

console.log('\n== 11. Coach: diff is proposed, never auto-applied ==');
{
  const before: Routine = { rules_version: '1', steps: [
    { slot: 'cleanser', time: 'am_pm', product_id: 'cl-1', order: 0, is_optional: false, frequency: 'daily', conflict_notes: [] },
    { slot: 'toner', time: 'am_pm', product_id: 'to-1', order: 2, is_optional: true, frequency: 'daily', conflict_notes: [] },
    { slot: 'moisturizer', time: 'am_pm', product_id: 'mo-1', order: 8, is_optional: false, frequency: 'daily', conflict_notes: [] },
  ]};
  const after: Routine = { rules_version: '1', steps: [
    before.steps[0],
    { slot: 'moisturizer', time: 'am_pm', product_id: 'mo-2', order: 8, is_optional: false, frequency: 'daily', conflict_notes: [] },
  ]};
  const diff = diffRoutines(before, after);
  check('detects removed step', diff.removed.some((s) => s.product_id === 'to-1'), diff.removed);
  check('detects swapped product as remove+add', diff.removed.some((s) => s.product_id === 'mo-1') && diff.added.some((s) => s.product_id === 'mo-2'), diff);
  check('counts unchanged steps', diff.unchanged === 1, diff.unchanged);
  check('identical routines produce an empty diff', (() => { const d = diffRoutines(before, before); return d.added.length === 0 && d.removed.length === 0 && d.unchanged === 3; })());

  const html = renderToStaticMarkup(<CoachView onSend={() => {}} messages={[{ role: 'user', text: 'make it simpler' }]}
    pendingDiff={{ diff, explanation: 'Cut to the essentials.' }} productName={(id) => `Product ${id}`} onAcceptDiff={() => {}} onRejectDiff={() => {}} />);
  check('diff card rendered', html.includes('diff-card'));
  check('removals and additions both shown', html.includes('diff-removed') && html.includes('diff-added'));
  check('user must accept explicitly', html.includes('accept-diff') && html.includes('reject-diff'));
  check('quick intents offered', (html.match(/quick-intent/g) ?? []).length === 4);
  check('input is labelled for screen readers', html.includes('for="coach-input"'));
  check('coach states its non-medical scope', /not medical advice/i.test(html));

  const noDiff = renderToStaticMarkup(<CoachView onSend={() => {}} messages={[]} productName={(i) => i} />);
  check('no diff card when nothing proposed', !noDiff.includes('diff-card'));
}
