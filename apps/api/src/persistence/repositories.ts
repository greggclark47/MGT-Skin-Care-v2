// Repository interfaces (Section C.2's `routes -> controller -> service -> repository`
// layering). Every in-memory store built during SC-P1-P5 implements one of these, so
// swapping to Postgres is a constructor argument rather than a rewrite of the modules.

import type { Cart } from '@mgt/domain';

export interface WebhookEventRepository {
  // Must be atomic: INSERT ... ON CONFLICT DO NOTHING, returning whether a row was created.
  // A non-atomic check-then-insert races under Stripe's concurrent delivery retries and
  // would double-apply payments — the exact failure the UNIQUE(provider,event_id) guard exists to stop.
  tryRecord(provider: string, eventId: string): Promise<boolean>;
}

export type OrderStatus = 'pending' | 'paid' | 'forwarded' | 'shipped' | 'delivered' | 'canceled';

export interface OrderRecord {
  id: string;
  session_id: string;
  total_cents: number;
  status: OrderStatus;
  payment_intent_id: string | null;
  created_at: string;
}

export interface OrderRepository {
  create(order: OrderRecord, cart: Cart): Promise<void>;
  get(orderId: string): Promise<OrderRecord | null>;
  setPaymentIntent(orderId: string, paymentIntentId: string): Promise<void>;
  // Returns true only if this call performed the pending -> paid transition. A second
  // caller (webhook replay, manual retry) gets false, so downstream side effects such as
  // fulfillment forwarding and order-confirmation email fire exactly once.
  markPaid(orderId: string): Promise<boolean>;
}

export interface EntitlementRepository {
  // Mirrors the Section J recompute_entitlement(user_id) function.
  recompute(userId: string): Promise<{ premium: boolean; source: string | null; valid_until: string | null }>;
}

// ---- Admin / knowledge (SC-P3 admin track) ----

import type { KnowledgeObject, AdminRole } from '@mgt/domain';

export interface KnowledgeRepository {
  get(id: string): Promise<KnowledgeObject | null>;
  save(object: KnowledgeObject): Promise<void>;
  list(status?: KnowledgeObject['status']): Promise<KnowledgeObject[]>;
  // Retrieval for RAG. Implementations MUST filter to status='approved' internally rather
  // than trusting the caller to pass the right filter — the grounding guarantee cannot
  // depend on every call site remembering.
  searchRetrievable(query: string, limit: number): Promise<KnowledgeObject[]>;
}

export interface AdminUser {
  id: string;
  email: string;
  roles: AdminRole[];
}

export interface AdminUserRepository {
  get(userId: string): Promise<AdminUser | null>;
}

export interface AdminAuditEntry {
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  before: unknown | null;
  after: unknown | null;
  created_at: string;
}

export interface AdminAuditRepository {
  record(entry: AdminAuditEntry): Promise<void>;
  listForTarget(targetType: string, targetId: string): Promise<AdminAuditEntry[]>;
}

// ---- Ingredient rules (SC-P4 safety-matrix admin track) ----
//
// Backs migration 0004_ingredient_rules.sql: every write is a NEW versioned row (never an
// UPDATE in place), and at most one row per ingredient may be 'approved' at a time — the
// migration enforces that with a partial unique index, so implementations must retire the
// previous approved row before approving a new one rather than relying on their own discipline.

import type { VersionedIngredientRule, KnowledgeStatus } from '@mgt/domain';

export interface IngredientRuleRepository {
  // The currently APPROVED rule for this ingredient (not a pending draft). Null if the
  // ingredient has never had an approved rule.
  get(ingredientKey: string): Promise<VersionedIngredientRule | null>;
  // The currently pending draft for this ingredient, if any.
  getDraft(ingredientKey: string): Promise<VersionedIngredientRule | null>;
  list(status?: KnowledgeStatus): Promise<VersionedIngredientRule[]>;
  // Exactly the rows compileMatrix() should see: one approved row per ingredient.
  listActive(): Promise<VersionedIngredientRule[]>;
  // Inserts (or replaces, if called twice for the same not-yet-approved version) a draft row.
  // Never touches the currently approved row for this ingredient.
  saveDraft(rule: VersionedIngredientRule): Promise<void>;
  // Retires whatever was previously approved for this ingredient and approves the given
  // version, atomically with respect to the "one approved row" invariant.
  approve(rule: VersionedIngredientRule): Promise<void>;
}
