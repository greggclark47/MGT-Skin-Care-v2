// Canonical enums — mirror infra/db/migrations/0001_consolidated_schema.sql exactly.
// Any drift between this file and the DB enums is a bug; both are generated from Section D/J.

export const SKIN_TYPES = ['normal', 'dry', 'oily', 'combination'] as const;
export type SkinType = typeof SKIN_TYPES[number];

export const SKIN_CONCERNS = [
  'acne', 'anti_aging', 'brightening', 'hydration', 'hyperpigmentation',
  'pore_minimizing', 'redness_relief', 'texture_smoothing', 'dark_circles', 'firmness',
] as const;
export type SkinConcern = typeof SKIN_CONCERNS[number];

export const SKIN_SENSITIVITY = ['none', 'mild', 'moderate', 'high'] as const;
export type SkinSensitivity = typeof SKIN_SENSITIVITY[number];

export const AGE_BANDS = ['18_25', '26_35', '36_45', '46_55', '56_plus'] as const;
export type AgeBand = typeof AGE_BANDS[number];

export const ROUTINE_LEVELS = ['none', 'basic', 'advanced'] as const;
export type RoutineLevel = typeof ROUTINE_LEVELS[number];

export const DESIRED_OUTCOMES = ['clearer', 'calmer', 'glow', 'smoother', 'even_tone', 'firmer', 'maintain'] as const;
export type DesiredOutcome = typeof DESIRED_OUTCOMES[number];

export const BUDGET_RANGES = ['under_25', 'between_25_50', 'between_50_100', 'over_100'] as const;
export type BudgetRange = typeof BUDGET_RANGES[number];

export const ROUTINE_SLOTS = [
  'cleanser', 'toner', 'serum', 'treatment', 'moisturizer', 'sunscreen',
  'eye', 'exfoliant', 'mask', 'spot', 'face_oil', 'mist', 'body',
] as const;
export type RoutineSlot = typeof ROUTINE_SLOTS[number];

// Canonical AM/PM ordering — RoutineEngine.sequence() depends on this array's order.
export const ROUTINE_SLOT_ORDER: RoutineSlot[] = [
  'cleanser', 'exfoliant', 'toner', 'serum', 'treatment', 'eye', 'spot', 'face_oil', 'moisturizer', 'sunscreen',
];

export const ROUTINE_TIMES = ['am', 'pm', 'am_pm', 'weekly', 'cycle'] as const;
export type RoutineTime = typeof ROUTINE_TIMES[number];

export const USAGE_FREQUENCIES = ['daily', 'twice_daily', 'every_other_day', '2_3_weekly', 'weekly'] as const;
export type UsageFrequency = typeof USAGE_FREQUENCIES[number];

export const PRODUCT_STATUSES = ['draft', 'active', 'inactive', 'discontinued'] as const;
export type ProductStatus = typeof PRODUCT_STATUSES[number];

// Billing source values are persisted on the server and must not become a
// client-bundle allowlist. The server owns the concrete source vocabulary.
export type BillingProvider = string;
