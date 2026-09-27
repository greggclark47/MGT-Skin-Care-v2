import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { SkinMatchStep } from '../components/SkinMatchStep';
import { ProductExplanationCard, humanizeReason } from '../components/ProductExplanation';
import { SkinMatchScreen } from '../screens/SkinMatchScreen';
import { CORE_STEPS, color, TAP_TARGET_MIN, type AnswerState } from '@mgt/shared';
import type { ProductExplanation, SkinProfileInput } from '@mgt/domain';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 240) : ''); }
}

function findByTestId(root: TestRenderer.ReactTestInstance, id: string) {
  // Filter to host elements only. The forwardRef-based react-native shim renders a composite
  // wrapper AND a host node for each component, both carrying testID, so an unfiltered
  // findAll reports every element twice.
  return root.findAll((n) => n.props?.testID === id && typeof n.type === 'string');
}

// React splits interpolated children ({x}% match -> ["91", "% match"]), so a naive
// JSON.includes('91% match') never matches. Join the rendered text before asserting.
function renderedText(tree: TestRenderer.ReactTestRenderer): string {
  const walk = (node: any): string => {
    if (node === null || node === undefined || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(walk).join('');
    return walk(node.children);
  };
  return walk(tree.toJSON());
}
function flatStyle(style: any): Record<string, any> {
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatStyle));
  return style ?? {};
}

console.log('\n== 1. Mobile step renders from the SHARED questionnaire ==');
{
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SkinMatchStep step={CORE_STEPS[0]} stepIndex={0} totalSteps={CORE_STEPS.length}
        answers={{}} onAnswer={() => {}} onNext={() => {}} onBack={() => {}} />,
    );
  });
  const root = tree.root;
  const choices = CORE_STEPS[0].choices.map((c: { value: string }) => findByTestId(root, `choice-${c.value}`));
  check('one pressable per shared choice', choices.every((c: unknown[]) => c.length === 1), choices.map((c: unknown[]) => c.length));
  check('renders the same prompt text as web', renderedText(tree).includes(CORE_STEPS[0].prompt));
  const next = findByTestId(root, 'next')[0];
  check('next disabled with no answer', next.props.accessibilityState.disabled === true);
  check('back hidden on first step', findByTestId(root, 'back').length === 0);
}

console.log('\n== 2. Tap targets and accessibility roles ==');
{
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SkinMatchStep step={CORE_STEPS[0]} stepIndex={1} totalSteps={7}
        answers={{ skin_type: 'oily' }} onAnswer={() => {}} onNext={() => {}} onBack={() => {}} />,
    );
  });
  const choice = findByTestId(tree.root, 'choice-oily')[0];
  check('single-select uses radio role', choice.props.accessibilityRole === 'radio');
  check('selected state exposed to a11y', choice.props.accessibilityState.checked === true);
  check('hint folded into the a11y label', /Shiny by midday/.test(choice.props.accessibilityLabel), choice.props.accessibilityLabel);
  check('44px minimum tap target', flatStyle(choice.props.style).minHeight === TAP_TARGET_MIN, flatStyle(choice.props.style).minHeight);
  check('selected choice uses the locked violet accent', flatStyle(choice.props.style).borderColor === color.accent);
  check('back appears after step 1', findByTestId(tree.root, 'back').length === 1);

  let multi!: TestRenderer.ReactTestRenderer;
  const concerns = CORE_STEPS.find((s: { id: string }) => s.id === 'concerns')!;
  act(() => {
    multi = TestRenderer.create(
      <SkinMatchStep step={concerns} stepIndex={1} totalSteps={7}
        answers={{ concerns: ['acne', 'hydration', 'firmness'] }} onAnswer={() => {}} onNext={() => {}} onBack={() => {}} />,
    );
  });
  const capped = findByTestId(multi.root, 'choice-brightening')[0];
  check('multi-select uses checkbox role', capped.props.accessibilityRole === 'checkbox');
  check('over-cap choice disabled, not removed', capped.props.accessibilityState.disabled === true);
}

console.log('\n== 3. Selection behaviour uses the shared toggle logic ==');
{
  const concerns = CORE_STEPS.find((s: { id: string }) => s.id === 'concerns')!;
  let answers: AnswerState = { concerns: ['acne', 'hydration', 'firmness'] };
  let received: unknown = null;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SkinMatchStep step={concerns} stepIndex={1} totalSteps={7} answers={answers}
        onAnswer={(_id, v) => { received = v; }} onNext={() => {}} onBack={() => {}} />,
    );
  });
  // Deselect at cap must still work — the same rule the web suite verifies.
  act(() => { findByTestId(tree.root, 'choice-acne')[0].props.onPress(); });
  check('deselect at cap works on mobile too', Array.isArray(received) && (received as string[]).length === 2 && !(received as string[]).includes('acne'), received);
}

console.log('\n== 4. Full flow advances and reports duration ==');
{
  let completed: { input: SkinProfileInput; ms: number } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const stepsSeen: number[] = [];
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SkinMatchScreen onComplete={(input, ms) => { completed = { input, ms }; }} onStepCompleted={(i) => stepsSeen.push(i)} />,
    );
  });
  // Answer every core step with its first choice and advance.
  for (let i = 0; i < CORE_STEPS.length; i++) {
    const step = CORE_STEPS[i];
    const firstChoice = step.choices[0].value;
    act(() => { findByTestId(tree.root, `choice-${firstChoice}`)[0].props.onPress(); });
    act(() => { findByTestId(tree.root, 'next')[0].props.onPress(); });
  }
  check('onComplete fired after the last step', completed !== null);
  check('every step reported to analytics', stepsSeen.length === CORE_STEPS.length, stepsSeen);
  const done = completed as { input: SkinProfileInput; ms: number } | null;
  check('duration measured', done !== null && typeof done.ms === 'number' && done.ms >= 0, done?.ms);
  const input = done!.input;
  check('produces a valid SkinProfileInput', !!input.skin_type && input.concerns.length > 0 && !!input.age_band && !!input.desired_outcome, input);
  check('ingredient_avoidances defaults to an array', Array.isArray(input.ingredient_avoidances));
}

console.log('\n== 5. Explanation contract parity with web ==');
{
  const base: ProductExplanation = {
    product_id: 'p1', match_score: 91,
    why_matched: ['targets:primary_concern', 'fits:budget'],
    ingredients: [{ name: 'Ceramides', role: 'barrier support' }],
    sensitivity_compatibility: 'safe',
    routine_placement: { slot: 'moisturizer', time: 'am_pm', frequency: 'daily' },
    cautions: [], alternatives: [], blurb: null,
  };
  let noAi!: TestRenderer.ReactTestRenderer;
  act(() => { noAi = TestRenderer.create(<ProductExplanationCard explanation={base} productName="Barrier Cream" />); });
  const text = renderedText(noAi);
  check('renders fully without AI copy', text.includes('91% match') && text.includes('Targets the concern you picked first'), text.slice(0, 200));
  check('no AI block when blurb is null', findByTestId(noAi.root, 'ai-blurb').length === 0);

  let withAi!: TestRenderer.ReactTestRenderer;
  act(() => { withAi = TestRenderer.create(<ProductExplanationCard explanation={{ ...base, blurb: 'Light enough for daily use.' }} productName="Barrier Cream" />); });
  check('AI copy labelled on mobile too', renderedText(withAi).includes('AI-written summary'));

  // Reason humanisation must match the web copy exactly, or the platforms tell different stories.
  check('reason copy identical to web', humanizeReason('targets:primary_concern') === 'Targets the concern you picked first');
  check('unknown codes degrade the same way', humanizeReason('some:new_code') === 'some new code');
}

console.log(failures === 0 ? '\nMOBILE: ALL CHECKS PASSED' : `\nMOBILE: ${failures} CHECK(S) FAILED`);
if (failures > 0) process.exitCode = 1;
