// Section K event taxonomy. Naming is `domain.action`. Every event carries a privacy class
// and a retention class — the master prompt's §11 requirement that every data use has a
// documented purpose, retention and privacy class is enforced HERE, at definition time,
// rather than in a policy document nobody reads at 2am.

export type PrivacyClass =
  | 'pub'  // non-identifying product telemetry
  | 'per'  // personal: tied to a user/anonymous id, no special category
  | 'sen'; // sensitive-adjacent: skin attributes, photo events — minimised and short-retention

export type RetentionClass =
  | 'd30'  // 30 days
  | 'd180' // 180 days
  | 'm24'  // 24 months
  | 'agg'; // aggregate-only; raw rows dropped on the retention job's next pass

export interface EventDefinition {
  name: string;
  privacy_class: PrivacyClass;
  retention_class: RetentionClass;
  required_properties: string[];
  purpose: string;
}

// The registry is the contract. An event not defined here is rejected by the client, so a
// typo or an ad-hoc event never silently creates an unclassified data stream.
export const EVENT_REGISTRY: Record<string, EventDefinition> = {
  // --- Skin Match funnel (Section H SC-P2 analytics track) ---
  'skin_match.started':   { name: 'skin_match.started',   privacy_class: 'per', retention_class: 'm24', required_properties: [], purpose: 'Funnel entry rate' },
  'skin_match.step_completed': { name: 'skin_match.step_completed', privacy_class: 'per', retention_class: 'd180', required_properties: ['step_index'], purpose: 'Step-level drop-off analysis' },
  'skin_match.completed': { name: 'skin_match.completed', privacy_class: 'sen', retention_class: 'd180', required_properties: ['duration_ms'], purpose: 'Completion rate and the <=90s core-duration KPI' },
  'skin_match.abandoned': { name: 'skin_match.abandoned', privacy_class: 'per', retention_class: 'd180', required_properties: ['last_step_index'], purpose: 'Drop-off diagnosis' },
  'results.viewed':       { name: 'results.viewed',       privacy_class: 'per', retention_class: 'm24', required_properties: [], purpose: 'Result-to-cart funnel step' },
  'results.product_expanded': { name: 'results.product_expanded', privacy_class: 'per', retention_class: 'd180', required_properties: ['product_id'], purpose: 'Explanation-contract engagement' },

  // --- Photo (Stage 3) — sensitive by definition, shortest retention ---
  'photo.consent_shown':  { name: 'photo.consent_shown',  privacy_class: 'per', retention_class: 'd180', required_properties: [], purpose: 'Consent funnel and compliance evidence' },
  'photo.analyzed':       { name: 'photo.analyzed',       privacy_class: 'sen', retention_class: 'd30',  required_properties: ['duration_ms'], purpose: 'Vision pipeline health; image itself is never persisted' },

  // --- Routine ---
  'routine.viewed':       { name: 'routine.viewed',       privacy_class: 'per', retention_class: 'm24', required_properties: [], purpose: 'Engagement' },
  'routine.step_checked': { name: 'routine.step_checked', privacy_class: 'per', retention_class: 'd180', required_properties: ['slot'], purpose: 'Adherence tracking, feeds the day-7/day-21 prompts' },
  'routine.command_used': { name: 'routine.command_used', privacy_class: 'per', retention_class: 'd180', required_properties: ['intent'], purpose: 'Routine-intelligence usage' },

  // --- Commerce ---
  'cart.created':         { name: 'cart.created',         privacy_class: 'per', retention_class: 'm24', required_properties: [], purpose: 'Result-to-cart conversion' },
  'cart.item_swapped':    { name: 'cart.item_swapped',    privacy_class: 'per', retention_class: 'd180', required_properties: ['from_product_id', 'to_product_id', 'reason'], purpose: 'Swap-reason analysis' },
  'checkout.started':     { name: 'checkout.started',     privacy_class: 'per', retention_class: 'm24', required_properties: [], purpose: 'Checkout funnel' },
  'purchase.completed':   { name: 'purchase.completed',   privacy_class: 'per', retention_class: 'm24', required_properties: ['order_id', 'total_cents'], purpose: 'Revenue, AOV, and the Section N unit-economics recompute' },

  // --- Subscription ---
  'premium.paywall_viewed': { name: 'premium.paywall_viewed', privacy_class: 'per', retention_class: 'm24', required_properties: ['placement'], purpose: 'Upsell placement experiments' },
  'premium.subscribed':   { name: 'premium.subscribed',   privacy_class: 'per', retention_class: 'm24', required_properties: ['provider'], purpose: 'Attach rate' },

  // --- Replenishment ---
  'replenishment.nudged': { name: 'replenishment.nudged', privacy_class: 'per', retention_class: 'd180', required_properties: ['step_id'], purpose: 'Nudge-timing experiments' },
  'replenishment.action': { name: 'replenishment.action', privacy_class: 'per', retention_class: 'd180', required_properties: ['action'], purpose: 'Reorder/delay/skip/cancel mix' },

  // --- Coach / AI ---
  'coach.message_sent':   { name: 'coach.message_sent',   privacy_class: 'sen', retention_class: 'd30',  required_properties: [], purpose: 'Coach usage volume; message CONTENT is never an event property' },
  'ai.response_served':   { name: 'ai.response_served',   privacy_class: 'pub', retention_class: 'd180', required_properties: ['task_type', 'used_fallback'], purpose: 'AI economics and fallback-rate alerting' },

  // --- Support operations — aggregate counters only; no question or ticket content ---
  'support.guidance_requested': { name: 'support.guidance_requested', privacy_class: 'pub', retention_class: 'agg', required_properties: ['role'], purpose: 'Measure which bounded guidance routes are used' },
  'support.guidance_result': { name: 'support.guidance_result', privacy_class: 'pub', retention_class: 'agg', required_properties: ['role', 'kind', 'category'], purpose: 'Measure aggregate bounded guidance outcomes' },
  'support.handoff_offered': { name: 'support.handoff_offered', privacy_class: 'pub', retention_class: 'agg', required_properties: ['reason'], purpose: 'Measure when guidance needs Portal Support' },
  'support.next_step_opened': { name: 'support.next_step_opened', privacy_class: 'pub', retention_class: 'agg', required_properties: ['role', 'path'], purpose: 'Measure selection of approved portal next steps' },
  'support.request_saved': { name: 'support.request_saved', privacy_class: 'pub', retention_class: 'agg', required_properties: ['request_type', 'source'], purpose: 'Measure completed support handoffs by approved category' },
  'support.operator_updated': { name: 'support.operator_updated', privacy_class: 'pub', retention_class: 'agg', required_properties: ['status'], purpose: 'Measure request workflow outcomes' },
  'support.escalation_marked': { name: 'support.escalation_marked', privacy_class: 'pub', retention_class: 'agg', required_properties: ['reason'], purpose: 'Measure aggregate support escalation categories' },

  // --- External referral discovery — aggregate portal actions, never retailer sales ---
  'retailer.outbound_opened': { name: 'retailer.outbound_opened', privacy_class: 'pub', retention_class: 'agg', required_properties: ['retailer_id', 'segment'], purpose: 'Measure aggregate outbound retailer exploration' },
  'retailer.saved_changed': { name: 'retailer.saved_changed', privacy_class: 'pub', retention_class: 'agg', required_properties: ['retailer_id', 'saved'], purpose: 'Measure aggregate save and unsave actions' },
};

export function getEventDefinition(name: string): EventDefinition | undefined {
  return EVENT_REGISTRY[name];
}
