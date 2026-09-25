export const BILLING_CYCLES = ['monthly', 'annual'] as const;
export type BillingCycle = typeof BILLING_CYCLES[number];
export type PlanAudience = 'consumer' | 'vendor';

export type PlanDefinition = {
  id: 'essential' | 'personalized' | 'professional';
  name: string;
  audience: PlanAudience;
  summary: string;
  best_for: string;
  features: string[];
  comparison: Record<string, string>;
  env_prefix: 'ESSENTIAL' | 'PERSONALIZED' | 'PROFESSIONAL';
  legacy_prefix?: 'CONSUMER' | 'VENDOR';
};

export const PLAN_COMPARISON_ROWS = [
  { id: 'skin_match', label: 'Skin Match' },
  { id: 'routine_guidance', label: 'Routine guidance' },
  { id: 'coach', label: 'Skin Coach' },
  { id: 'shared_access', label: 'Shared access' },
  { id: 'business_tools', label: 'Business tools' },
] as const;

// This is a deliberately provisional offer catalog. Copy and entitlements must be
// approved before a configured Stripe Price can make a plan available for enrollment.
export const PLAN_DEFINITIONS: readonly PlanDefinition[] = [
  {
    id: 'essential', name: 'Essential', audience: 'consumer',
    summary: 'A simple starting point for building and maintaining a skincare routine.',
    best_for: 'People who want a clear starting point with a lighter level of guidance.',
    features: ['Skin Match foundation', 'Starter routine guidance', 'Reviewed education and retailer shortlist'],
    comparison: { skin_match: 'Included', routine_guidance: 'Starter guidance', coach: 'Standard guidance', shared_access: 'Not proposed', business_tools: 'Not included' },
    env_prefix: 'ESSENTIAL',
  },
  {
    id: 'personalized', name: 'Personalized', audience: 'consumer',
    summary: 'Expanded guidance for people who want to refine a more involved routine.',
    best_for: 'People with an established routine or broader personalization needs.',
    features: ['Everything proposed for Essential', 'Expanded routine guidance', 'Higher-capacity coaching and one invited profile proposed'],
    comparison: { skin_match: 'Included', routine_guidance: 'Expanded guidance', coach: 'Higher-capacity guidance', shared_access: 'One invited profile proposed', business_tools: 'Not included' },
    env_prefix: 'PERSONALIZED', legacy_prefix: 'CONSUMER',
  },
  {
    id: 'professional', name: 'Professional', audience: 'vendor',
    summary: 'A business-facing workspace concept for onboarding and portal participation.',
    best_for: 'Approved businesses preparing catalog, support, and partner operations.',
    features: ['Business onboarding workspace', 'Catalog and partner-readiness guidance', 'Business support and billing records'],
    comparison: { skin_match: 'Reference access', routine_guidance: 'Education only', coach: 'Business onboarding guidance', shared_access: 'Team scope pending', business_tools: 'Proposed' },
    env_prefix: 'PROFESSIONAL', legacy_prefix: 'VENDOR',
  },
] as const;

export function planById(value: unknown) {
  return PLAN_DEFINITIONS.find(plan => plan.id === value);
}

export function defaultPlanForAudience(value: unknown) {
  return value === 'vendor' ? planById('professional')! : planById('personalized')!;
}

export function priceIdFor(env: NodeJS.ProcessEnv, plan: PlanDefinition, cycle: BillingCycle) {
  const current = env[`STRIPE_${plan.env_prefix}_${cycle.toUpperCase()}_PRICE_ID`]
    || (cycle === 'monthly' ? env[`STRIPE_${plan.env_prefix}_PRICE_ID`] : undefined);
  if (current || !plan.legacy_prefix) return current;
  return env[`STRIPE_${plan.legacy_prefix}_${cycle.toUpperCase()}_PRICE_ID`]
    || (cycle === 'monthly' ? env[`STRIPE_${plan.legacy_prefix}_PRICE_ID`] : undefined);
}

export function planPriceMatch(env: NodeJS.ProcessEnv, audience: PlanAudience, priceId: unknown) {
  if (typeof priceId !== 'string') return undefined;
  for (const plan of PLAN_DEFINITIONS.filter(item => item.audience === audience)) {
    for (const cycle of BILLING_CYCLES) if (priceIdFor(env, plan, cycle) === priceId) return { plan, cycle };
  }
  return undefined;
}

type SavedProfile = { input?: { current_routine?: string; budget_range?: string } } | null | undefined;

export function recommendPlan(profile: SavedProfile) {
  if (!profile?.input) return {
    plan_id: 'essential' as const,
    basis: 'general_starting_point' as const,
    reason: 'Essential is the neutral starting point until you save routine and budget preferences.',
  };
  const essential = profile.input.current_routine === 'none'
    || profile.input.budget_range === 'under_25';
  return essential ? {
    plan_id: 'essential' as const,
    basis: 'saved_preferences' as const,
    reason: 'Your saved routine or budget preference favors a simpler starting point.',
  } : {
    plan_id: 'personalized' as const,
    basis: 'saved_preferences' as const,
    reason: 'Your saved routine and budget preferences indicate that expanded guidance may be useful.',
  };
}
