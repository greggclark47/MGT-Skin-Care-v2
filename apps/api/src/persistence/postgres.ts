import type { Cart } from '@mgt/domain';
import type { EntitlementRepository, OrderRecord, OrderRepository, WebhookEventRepository } from './repositories';

// Minimal query interface so this file depends on a shape, not on a specific pg client
// version. `pg`'s Pool satisfies it as-is.
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export class PgWebhookEventRepository implements WebhookEventRepository {
  constructor(private db: Queryable) {}
  async tryRecord(provider: string, eventId: string): Promise<boolean> {
    // Atomic by construction: the UNIQUE(provider,event_id) constraint decides the winner,
    // and ON CONFLICT DO NOTHING means the loser gets rowCount 0 instead of an exception.
    const res = await this.db.query(
      `insert into webhook_events (provider, event_id, received_at)
       values ($1, $2, now())
       on conflict (provider, event_id) do nothing
       returning id`,
      [provider, eventId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export class PgOrderRepository implements OrderRepository {
  constructor(private db: Queryable) {}

  async create(order: OrderRecord, cart: Cart): Promise<void> {
    await this.db.query(
      `insert into orders (id, session_id, total_cents, status, payment_intent_id, cart, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [order.id, order.session_id, order.total_cents, order.status, order.payment_intent_id, JSON.stringify(cart), order.created_at],
    );
  }

  async get(orderId: string): Promise<OrderRecord | null> {
    const res = await this.db.query(
      `select id, session_id, total_cents, status, payment_intent_id, created_at from orders where id = $1`,
      [orderId],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id, session_id: r.session_id, total_cents: Number(r.total_cents),
      status: r.status, payment_intent_id: r.payment_intent_id,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    };
  }

  async setPaymentIntent(orderId: string, paymentIntentId: string): Promise<void> {
    await this.db.query(`update orders set payment_intent_id = $2 where id = $1`, [orderId, paymentIntentId]);
  }

  async markPaid(orderId: string): Promise<boolean> {
    // The `and status = 'pending'` predicate is what makes this idempotent at the DATABASE
    // level rather than relying on the webhook dedupe table alone — belt and braces, because
    // double-charging a customer is not a bug you get to fix afterwards.
    const res = await this.db.query(
      `update orders set status = 'paid', paid_at = now() where id = $1 and status = 'pending' returning id`,
      [orderId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export class PgEntitlementRepository implements EntitlementRepository {
  constructor(private db: Queryable) {}
  async recompute(userId: string) {
    // Delegates to the Section J Postgres function so the DB stays the single source of
    // truth; @mgt/domain's resolveEntitlement() is the in-process mirror used for
    // synchronous checks, and the two are tested against the same cases.
    await this.db.query(`select recompute_entitlement($1)`, [userId]);
    const res = await this.db.query(
      `select premium, source, valid_until from entitlements where user_id = $1`,
      [userId],
    );
    if (res.rows.length === 0) return { premium: false, source: null, valid_until: null };
    const r = res.rows[0];
    return {
      premium: Boolean(r.premium),
      source: r.source ?? null,
      valid_until: r.valid_until instanceof Date ? r.valid_until.toISOString() : (r.valid_until ?? null),
    };
  }
}

// ---- Admin / knowledge ----

import type { KnowledgeObject } from '@mgt/domain';
import type { AdminAuditEntry, AdminAuditRepository, AdminUser, AdminUserRepository, KnowledgeRepository } from './repositories';

function rowToKnowledge(r: any): KnowledgeObject {
  return {
    id: r.id, title: r.title, body: r.body,
    evidence_level: r.evidence_level, source_url: r.source_url,
    source_date: r.source_date instanceof Date ? r.source_date.toISOString().slice(0, 10) : r.source_date,
    version: Number(r.version), status: r.status,
    sme_approved_by: r.sme_approved_by,
    sme_approved_at: r.sme_approved_at instanceof Date ? r.sme_approved_at.toISOString() : r.sme_approved_at,
    retired_reason: r.retired_reason,
  };
}

export class PgKnowledgeRepository implements KnowledgeRepository {
  constructor(private db: Queryable) {}

  async get(id: string): Promise<KnowledgeObject | null> {
    const res = await this.db.query(`select * from knowledge.objects where id = $1`, [id]);
    return res.rows.length ? rowToKnowledge(res.rows[0]) : null;
  }

  async save(o: KnowledgeObject): Promise<void> {
    await this.db.query(
      `insert into knowledge.objects
         (id, title, body, evidence_level, source_url, source_date, version, status, sme_approved_by, sme_approved_at, retired_reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do update set
         title = excluded.title, body = excluded.body, evidence_level = excluded.evidence_level,
         source_url = excluded.source_url, source_date = excluded.source_date, version = excluded.version,
         status = excluded.status, sme_approved_by = excluded.sme_approved_by,
         sme_approved_at = excluded.sme_approved_at, retired_reason = excluded.retired_reason,
         updated_at = now()`,
      [o.id, o.title, o.body, o.evidence_level, o.source_url, o.source_date, o.version, o.status, o.sme_approved_by, o.sme_approved_at, o.retired_reason],
    );
  }

  async list(status?: KnowledgeObject['status']): Promise<KnowledgeObject[]> {
    const res = status
      ? await this.db.query(`select * from knowledge.objects where status = $1 order by title`, [status])
      : await this.db.query(`select * from knowledge.objects order by title`);
    return res.rows.map(rowToKnowledge);
  }

  async searchRetrievable(query: string, limit: number): Promise<KnowledgeObject[]> {
    // status = 'approved' is hard-coded here ON PURPOSE and is not a caller-supplied filter.
    // A retrieval path that can be talked into returning drafts makes every downstream
    // citation check meaningless.
    const res = await this.db.query(
      `select * from knowledge.objects
        where status = 'approved'
          and (title ilike '%' || $1 || '%' or body ilike '%' || $1 || '%')
        order by title
        limit $2`,
      [query, limit],
    );
    return res.rows.map(rowToKnowledge);
  }
}

export class PgAdminUserRepository implements AdminUserRepository {
  constructor(private db: Queryable) {}
  async get(userId: string): Promise<AdminUser | null> {
    const res = await this.db.query(`select id, email, roles from admin_users where id = $1`, [userId]);
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return { id: r.id, email: r.email, roles: r.roles ?? [] };
  }
}

export class PgAdminAuditRepository implements AdminAuditRepository {
  constructor(private db: Queryable) {}
  async record(e: AdminAuditEntry): Promise<void> {
    await this.db.query(
      `insert into admin_audit_log (actor_id, action, target_type, target_id, before, after, created_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [e.actor_id, e.action, e.target_type, e.target_id,
       e.before === null ? null : JSON.stringify(e.before),
       e.after === null ? null : JSON.stringify(e.after),
       e.created_at],
    );
  }
  async listForTarget(targetType: string, targetId: string): Promise<AdminAuditEntry[]> {
    const res = await this.db.query(
      `select actor_id, action, target_type, target_id, before, after, created_at
         from admin_audit_log where target_type = $1 and target_id = $2 order by id`,
      [targetType, targetId],
    );
    return res.rows.map((r: any) => ({
      actor_id: r.actor_id, action: r.action, target_type: r.target_type, target_id: r.target_id,
      before: r.before, after: r.after,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
  }
}

// ---- Ingredient rules ----

import type { VersionedIngredientRule, KnowledgeStatus } from '@mgt/domain';
import type { IngredientRuleRepository } from './repositories';

function rowToRule(r: any): VersionedIngredientRule {
  return {
    ingredient_key: r.ingredient_key,
    display_name: r.display_name,
    sensitivity_ceiling_required: Number(r.sensitivity_ceiling_required),
    triggers_avoid_flag: r.triggers_avoid_flag,
    rationale: r.rationale,
    version: Number(r.version),
    status: r.status,
    sme_approved_by: r.sme_approved_by,
    sme_approved_at: r.sme_approved_at instanceof Date ? r.sme_approved_at.toISOString() : r.sme_approved_at,
  };
}

export class PgIngredientRuleRepository implements IngredientRuleRepository {
  constructor(private db: Queryable) {}

  async get(ingredientKey: string): Promise<VersionedIngredientRule | null> {
    const res = await this.db.query(
      `select * from ingredient_rules where ingredient_key = $1 and status = 'approved'`,
      [ingredientKey],
    );
    return res.rows.length ? rowToRule(res.rows[0]) : null;
  }

  async getDraft(ingredientKey: string): Promise<VersionedIngredientRule | null> {
    const res = await this.db.query(
      `select * from ingredient_rules where ingredient_key = $1 and status = 'draft' order by version desc limit 1`,
      [ingredientKey],
    );
    return res.rows.length ? rowToRule(res.rows[0]) : null;
  }

  async list(status?: KnowledgeStatus): Promise<VersionedIngredientRule[]> {
    const res = status
      ? await this.db.query(`select * from ingredient_rules where status = $1 order by ingredient_key, version`, [status])
      : await this.db.query(`select * from ingredient_rules order by ingredient_key, version`);
    return res.rows.map(rowToRule);
  }

  async listActive(): Promise<VersionedIngredientRule[]> {
    const res = await this.db.query(`select * from ingredient_rules where status = 'approved' order by ingredient_key`);
    return res.rows.map(rowToRule);
  }

  async saveDraft(rule: VersionedIngredientRule): Promise<void> {
    await this.db.query(
      `insert into ingredient_rules
         (ingredient_key, version, display_name, sensitivity_ceiling_required, triggers_avoid_flag, rationale, status, sme_approved_by, sme_approved_at)
       values ($1,$2,$3,$4,$5,$6,'draft',null,null)
       on conflict (ingredient_key, version) do update set
         display_name = excluded.display_name, sensitivity_ceiling_required = excluded.sensitivity_ceiling_required,
         triggers_avoid_flag = excluded.triggers_avoid_flag, rationale = excluded.rationale,
         status = 'draft', sme_approved_by = null, sme_approved_at = null`,
      [rule.ingredient_key, rule.version, rule.display_name, rule.sensitivity_ceiling_required, rule.triggers_avoid_flag, rule.rationale],
    );
  }

  async approve(rule: VersionedIngredientRule): Promise<void> {
    // Retire whatever is currently approved for this ingredient BEFORE approving the new
    // version — the partial unique index (migration 0004) allows at most one approved row
    // per ingredient, so approving first would violate it.
    await this.db.query(
      `update ingredient_rules set status = 'retired' where ingredient_key = $1 and status = 'approved'`,
      [rule.ingredient_key],
    );
    await this.db.query(
      `update ingredient_rules set status = 'approved', sme_approved_by = $3, sme_approved_at = $4
        where ingredient_key = $1 and version = $2`,
      [rule.ingredient_key, rule.version, rule.sme_approved_by, rule.sme_approved_at],
    );
  }
}
