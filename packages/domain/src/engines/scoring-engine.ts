import type { ProfileVector, AvoidFlags } from '../types/skin-profile';
import type { BudgetRange, RoutineSlot } from '../types/enums';
import { ingredientAllowed } from './rules-engine';

export const SCORING_ENGINE_VERSION = '1.0.0';

// v1 weighting, retained (Section 0.2 "Product scoring" row): 40% concern-focus fit,
// 25% skin-type/hydration-oil fit, 15% price fit, 10% brand synergy, 10% ingredient depth.
export const WEIGHTS = {
  concernFit: 0.40,
  typeFit: 0.25,
  priceFit: 0.15,
  brandSynergy: 0.10,
  ingredientDepth: 0.10,
} as const;

export interface CandidateProduct {
  id: string;
  slot: RoutineSlot;
  ingredients: string[];              // normalized ingredient_key list
  price_cents: number;
  concern_tags: string[];             // which profile-vector focus dims this product addresses, weighted 0-1
  concern_weights: Partial<Record<keyof ProfileVector, number>>;
  type_fit: Partial<Record<keyof ProfileVector, number>>; // hydration_need / oil_control_need alignment
  brand_id: string;
  status: 'draft' | 'active' | 'inactive' | 'discontinued';
}

function priceFitScore(price_cents: number, budget: BudgetRange): number {
  const ranges: Record<BudgetRange, [number, number]> = {
    under_25: [0, 2500],
    between_25_50: [2500, 5000],
    between_50_100: [5000, 10000],
    over_100: [10000, Infinity],
  };
  const [lo, hi] = ranges[budget];
  if (price_cents >= lo && price_cents <= hi) return 1;
  // Linear falloff outside the band, floor at 0.
  const distance = price_cents < lo ? lo - price_cents : price_cents - hi;
  const span = Math.max(hi - lo, 2500);
  return Math.max(0, 1 - distance / span);
}

function dotFit(vector: ProfileVector, weights: Partial<Record<keyof ProfileVector, number>>): number {
  let sum = 0; let norm = 0;
  for (const [dim, weight] of Object.entries(weights) as [keyof ProfileVector, number][]) {
    sum += vector[dim] * weight;
    norm += weight;
  }
  return norm > 0 ? sum / norm : 0;
}

export interface ScoreResult {
  product_id: string;
  score: number; // 0-100
  reasons: string[]; // deterministic reason codes for the E.6 explanation contract's why_matched
  excluded: false;
}
export interface ExclusionResult {
  product_id: string;
  excluded: true;
  reason: string;
}

export function scoreProduct(
  product: CandidateProduct,
  profile: ProfileVector,
  avoidFlags: AvoidFlags,
  declaredAvoidances: string[],
  budget: BudgetRange,
  preferredBrands: string[] = [],
): ScoreResult | ExclusionResult {
  // Hard filters first — these are exclusions, never score penalties.
  if (product.status !== 'active') {
    return { product_id: product.id, excluded: true, reason: 'not_active' };
  }
  for (const ing of product.ingredients) {
    if (!ingredientAllowed(ing, profile, avoidFlags, declaredAvoidances)) {
      return { product_id: product.id, excluded: true, reason: `unsafe_ingredient:${ing}` };
    }
  }

  const concernFit = dotFit(profile, product.concern_weights);
  const typeFit = dotFit(profile, product.type_fit);
  const priceFit = priceFitScore(product.price_cents, budget);
  const brandSynergy = preferredBrands.includes(product.brand_id) ? 1 : 0.5;
  const ingredientDepth = Math.min(1, product.ingredients.length / 6);

  const score =
    concernFit * WEIGHTS.concernFit +
    typeFit * WEIGHTS.typeFit +
    priceFit * WEIGHTS.priceFit +
    brandSynergy * WEIGHTS.brandSynergy +
    ingredientDepth * WEIGHTS.ingredientDepth;

  const reasons: string[] = [];
  if (concernFit > 0.6) reasons.push('targets:primary_concern');
  if (typeFit > 0.6) reasons.push(`fits:skin_type`);
  if (priceFit === 1) reasons.push('fits:budget');
  if (brandSynergy === 1) reasons.push('brand:preferred');

  return { product_id: product.id, score: Math.round(score * 100), reasons, excluded: false };
}

export function scoreCandidates(
  candidates: CandidateProduct[],
  profile: ProfileVector,
  avoidFlags: AvoidFlags,
  declaredAvoidances: string[],
  budget: BudgetRange,
  preferredBrands: string[] = [],
): (ScoreResult | ExclusionResult)[] {
  return candidates
    .map((c) => scoreProduct(c, profile, avoidFlags, declaredAvoidances, budget, preferredBrands))
    .sort((a, b) => {
      if (a.excluded && b.excluded) return 0;
      if (a.excluded) return 1;
      if (b.excluded) return -1;
      return (b as ScoreResult).score - (a as ScoreResult).score;
    });
}
