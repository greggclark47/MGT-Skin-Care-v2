// @mgt/domain — deterministic Tier-0 engines.
// Non-negotiable: pure functions, versioned, auditable, NO LLM calls in this package.
// See claude/skincare-master-blueprint-v2.md Section E.1 (principles) and Section C.4.

export * from './types/enums';
export * from './types/skin-profile';

export * from './engines/rules-engine';
export * from './engines/scoring-engine';
export * from './engines/routine-engine';
export * from './engines/cart-engine';
export * from './engines/replenishment-engine';
export * from './engines/entitlement-resolver';
export * from './engines/pricing-engine';
export * from './engines/feedback-engine';
export * from './engines/eval-harness';
export * from './engines/knowledge-approval';
export * from './engines/ingredient-rules';
export * from './engines/rbac';
export * from './engines/referral-engine';
export * from './engines/style-engine';
export * from './engines/analytics-aggregates';
