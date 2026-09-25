import { PRICING_PER_MTOK, estimateCostCents, legacyPricedModels } from '../adapters';

// Guards the pricing table against the exact failure that shipped in it: a dollars-to-cents
// conversion off by a factor of 10, which is invisible in isolation (the numbers still look
// like plausible prices) and silently loosens every per-user budget cap by the same factor.
//
// The anchors below are the published figures as of 2026-09-06. If a provider changes a price,
// this test SHOULD fail -- that is the point. Update the anchor and `verified_on` together, and
// only after reading the provider's pricing page.

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// dollars-per-MTok, as published.
const ANCHORS: Record<string, { input_usd: number; output_usd: number }> = {
  'gpt-5.6-sol':   { input_usd: 4, output_usd: 20 },
  'gpt-5.6-terra': { input_usd: 2, output_usd: 12 },
  'gpt-5.6-luna':  { input_usd: .2, output_usd: 1.2 },
};

console.log('\n== 1. Every price matches its published dollar figure ==');
for (const [model, anchor] of Object.entries(ANCHORS)) {
  const p = PRICING_PER_MTOK[model];
  if (!p) { check(`${model} present in the table`, false); continue; }
  check(`${model} input = $${anchor.input_usd}/MTok`, p.input_cents === Math.round(anchor.input_usd * 100), p.input_cents);
  check(`${model} output = $${anchor.output_usd}/MTok`, p.output_cents === Math.round(anchor.output_usd * 100), p.output_cents);
}

console.log('\n== 2. Every entry carries provenance ==');
for (const [model, p] of Object.entries(PRICING_PER_MTOK)) {
  check(`${model} names a source`, typeof p.source === 'string' && p.source.length > 0);
  check(`${model} records when it was verified`, /^\d{4}-\d{2}-\d{2}$/.test(p.verified_on), p.verified_on);
}

console.log('\n== 3. Cost arithmetic is in cents per million tokens ==');
{
  // One million input tokens of GPT-5.6 Sol costs $4.00 = 400 cents. If the units ever drift
  // again, this is the assertion that catches it.
  check('1M Sol input tokens = 400 cents', estimateCostCents('gpt-5.6-sol', 1_000_000, 0) === 400,
        estimateCostCents('gpt-5.6-sol', 1_000_000, 0));
  check('1M Terra output tokens = 1200 cents', estimateCostCents('gpt-5.6-terra', 0, 1_000_000) === 1200,
        estimateCostCents('gpt-5.6-terra', 0, 1_000_000));

  // A realistic Tier-1 call against the tier1_copy cap of 25 cents/day.
  const oneCall = estimateCostCents('gpt-5.6-luna', 1_500, 700);
  check('a typical Luna copy call costs well under 1 cent', oneCall > 0 && oneCall < 1, oneCall);
  // ~25c/day of Luna is roughly 55 calls of this size. The cap should bite on abuse, not on
  // ordinary use -- if this ratio ever collapses, either the cap or the price is wrong.
  check('tier1 cap allows dozens of calls, not thousands', Math.floor(25 / oneCall) > 20 && Math.floor(25 / oneCall) < 500,
        Math.floor(25 / oneCall));
}

console.log('\n== 4. An unknown model is unpriced, never guessed ==');
{
  check('unknown model costs 0', estimateCostCents('not-a-real-model', 10_000, 10_000) === 0);
}

console.log('\n== 5. Models we could not re-verify are declared, not hidden ==');
{
  const legacy = legacyPricedModels();
  check('legacy models reported', legacy.length > 0, legacy);
  check('gpt-4o-mini flagged legacy', legacy.includes('gpt-4o-mini'), legacy);
  // Legacy hosted rows remain visible for auditability, but the active registry is local-first.
  console.log(`  NOTE  legacy hosted models: ${legacy.join(', ')}`);
}

console.log(failures === 0 ? '\nPRICING: ALL CHECKS PASSED' : `\nPRICING: ${failures} CHECK(S) FAILED`);
if (failures > 0) process.exitCode = 1;
