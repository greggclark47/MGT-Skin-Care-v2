import type { Cart } from '@mgt/domain';
import type { EntitlementRepository, OrderRecord, OrderRepository, WebhookEventRepository } from './repositories';

// In-memory implementations of the same interfaces the Postgres adapters implement, used for
// local dev and tests. Because both sides satisfy one interface, the modules never learn
// which is in play — and the same test suite runs against both.

export class InMemoryWebhookEventRepository implements WebhookEventRepository {
  private seen = new Set<string>();
  async tryRecord(provider: string, eventId: string): Promise<boolean> {
    const key = `${provider}:${eventId}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  private orders = new Map<string, OrderRecord>();
  private carts = new Map<string, Cart>();

  async create(order: OrderRecord, cart: Cart): Promise<void> {
    this.orders.set(order.id, { ...order });
    this.carts.set(order.id, cart);
  }
  async get(orderId: string): Promise<OrderRecord | null> {
    const o = this.orders.get(orderId);
    return o ? { ...o } : null;
  }
  async setPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
    const o = this.orders.get(orderId);
    if (o) o.payment_intent_id = paymentIntentId;
  }
  async markPaid(orderId: string): Promise<boolean> {
    const o = this.orders.get(orderId);
    if (!o || o.status !== 'pending') return false;
    o.status = 'paid';
    return true;
  }
}

export class StubEntitlementRepository implements EntitlementRepository {
  constructor(private premiumUsers = new Set<string>()) {}
  async recompute(userId: string) {
    const premium = this.premiumUsers.has(userId);
    return { premium, source: premium ? 'stripe' : null, valid_until: null };
  }
}

// ---- Admin / knowledge ----

import type { KnowledgeObject } from '@mgt/domain';
import { isRetrievable } from '@mgt/domain';
import type { AdminAuditEntry, AdminAuditRepository, AdminUser, AdminUserRepository, KnowledgeRepository } from './repositories';

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private objects = new Map<string, KnowledgeObject>();
  constructor(seed: KnowledgeObject[] = []) { seed.forEach((o) => this.objects.set(o.id, { ...o })); }

  async get(id: string) { const o = this.objects.get(id); return o ? { ...o } : null; }
  async save(o: KnowledgeObject) { this.objects.set(o.id, { ...o }); }
  async list(status?: KnowledgeObject['status']) {
    return [...this.objects.values()].filter((o) => !status || o.status === status).map((o) => ({ ...o }));
  }
  async searchRetrievable(query: string, limit: number) {
    // Same hard filter as the Postgres implementation — the two must not disagree about
    // what RAG is allowed to see.
    const q = query.toLowerCase();
    return [...this.objects.values()]
      .filter(isRetrievable)
      .filter((o) => o.title.toLowerCase().includes(q) || o.body.toLowerCase().includes(q))
      .slice(0, limit)
      .map((o) => ({ ...o }));
  }
}

export class InMemoryAdminUserRepository implements AdminUserRepository {
  constructor(private users: Map<string, AdminUser> = new Map()) {}
  async get(userId: string) { return this.users.get(userId) ?? null; }
  set(user: AdminUser) { this.users.set(user.id, user); }
}

export class InMemoryAdminAuditRepository implements AdminAuditRepository {
  entries: AdminAuditEntry[] = [];
  async record(e: AdminAuditEntry) { this.entries.push(e); }
  async listForTarget(targetType: string, targetId: string) {
    return this.entries.filter((e) => e.target_type === targetType && e.target_id === targetId);
  }
}

// ---- Ingredient rules ----

import type { VersionedIngredientRule, KnowledgeStatus } from '@mgt/domain';
import type { IngredientRuleRepository } from './repositories';

export class InMemoryIngredientRuleRepository implements IngredientRuleRepository {
  private rows: VersionedIngredientRule[] = [];
  constructor(seed: VersionedIngredientRule[] = []) { this.rows = seed.map((r) => ({ ...r })); }

  async get(ingredientKey: string): Promise<VersionedIngredientRule | null> {
    const approved = this.rows
      .filter((r) => r.ingredient_key === ingredientKey && r.status === 'approved')
      .sort((a, b) => b.version - a.version);
    return approved.length ? { ...approved[0] } : null;
  }
  async getDraft(ingredientKey: string): Promise<VersionedIngredientRule | null> {
    const drafts = this.rows
      .filter((r) => r.ingredient_key === ingredientKey && r.status === 'draft')
      .sort((a, b) => b.version - a.version);
    return drafts.length ? { ...drafts[0] } : null;
  }
  async list(status?: KnowledgeStatus): Promise<VersionedIngredientRule[]> {
    return this.rows.filter((r) => !status || r.status === status).map((r) => ({ ...r }));
  }
  async listActive(): Promise<VersionedIngredientRule[]> {
    return this.rows.filter((r) => r.status === 'approved').map((r) => ({ ...r }));
  }
  async saveDraft(rule: VersionedIngredientRule): Promise<void> {
    const idx = this.rows.findIndex((r) => r.ingredient_key === rule.ingredient_key && r.version === rule.version);
    const draft = { ...rule, status: 'draft' as const, sme_approved_by: null, sme_approved_at: null };
    if (idx >= 0) this.rows[idx] = draft; else this.rows.push(draft);
  }
  async approve(rule: VersionedIngredientRule): Promise<void> {
    // Retire whatever was previously approved for this ingredient before approving the new
    // version, mirroring the DB's "at most one approved row per ingredient" invariant.
    this.rows = this.rows.map((r) =>
      r.ingredient_key === rule.ingredient_key && r.status === 'approved' ? { ...r, status: 'retired' as const } : r,
    );
    const idx = this.rows.findIndex((r) => r.ingredient_key === rule.ingredient_key && r.version === rule.version);
    const approved = { ...rule, status: 'approved' as const };
    if (idx >= 0) this.rows[idx] = approved; else this.rows.push(approved);
  }
}
