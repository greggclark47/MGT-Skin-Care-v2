import express, { type Express, type Request } from 'express';
import { Pool } from 'pg';
import { requestId, errorHandler } from './middleware/error';
import { skinMatchRouter } from './modules/skin-match/router';
import { getSession } from './modules/skin-match/session-store';
import { InMemoryCatalogStore, SEED_CATALOG } from './modules/catalog/store';
import { cartRouter } from './modules/cart/router';
import { getCart } from './modules/cart/store';
import { checkoutRouter, StubPaymentProvider, StripePaymentProvider, type PaymentProvider } from './modules/checkout/router';
import { coachRouter } from './modules/coach/router';
import { processWebhookOnce } from './modules/webhooks/idempotency';
import { verifyStripeWebhook, WebhookSignatureError } from './modules/webhooks/stripe-signature';
import { requireAdmin, type AdminRequest } from './modules/admin/rbac-middleware';
import { permissionsFor } from '@mgt/domain';
import { knowledgeRouter } from './modules/admin/knowledge-router';
import { ingredientRulesRouter } from './modules/admin/ingredient-rules-router';
import { InMemoryOrderRepository, InMemoryWebhookEventRepository } from './persistence/in-memory';
import { PgOrderRepository, PgWebhookEventRepository } from './persistence/postgres';
import type {
  OrderRepository, WebhookEventRepository,
  KnowledgeRepository, AdminUserRepository, AdminAuditRepository, IngredientRuleRepository,
} from './persistence/repositories';
import type { RoutineSlot, ScoreResult } from '@mgt/domain';

// SC-P1-P3 wiring per the Section C.2 module table.
//
// createApp() takes its storage and payment dependencies as an explicit AppDeps argument
// rather than reaching for module-level singletons, so the SAME route wiring can be run
// against in-memory stores (unit/smoke tests) or a live Postgres pool + real Stripe key
// (dual-backend verification, and production) without any code here changing. That's what
// __smoke__/dual-backend.ts, admin.ts and ingredient-rules.ts all exercise: identical HTTP
// behaviour, whichever backends are injected.

export interface AppDeps {
  orders: OrderRepository;
  webhookEvents: WebhookEventRepository;
  payments?: PaymentProvider;
  // Admin track (SC-P3/P4). All three optional together: the admin/knowledge and
  // ingredient-rules routes are only mounted when adminUsers is provided, since every admin
  // route sits behind requireAdmin().
  knowledge?: KnowledgeRepository;
  adminUsers?: AdminUserRepository;
  adminAudit?: AdminAuditRepository;
  ingredientRules?: IngredientRuleRepository;
}

function adminUserIdFromHeader(req: Request): string | null {
  const raw = req.headers['x-admin-user-id'];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(requestId);

  const payments = deps.payments ?? new StubPaymentProvider();

  // Webhooks MUST be mounted with express.raw() before the global express.json() runs, or the
  // json parser consumes the body first and signature verification sees an already-parsed
  // object instead of the raw bytes Stripe actually signed. This exact ordering mistake is the
  // "Phase 59 path-mismatch bug" the blueprint's Section 0.2 Stripe-subscriptions row warns
  // about — get it wrong here and it recurs.
  app.post('/webhooks/stripe', express.raw({ type: '*/*' }), async (req, res, next) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
      let event: { id: string; type: string; data?: { order_id?: string } & Record<string, unknown> };
      try {
        event = verifyStripeWebhook(rawBody, req.headers['stripe-signature']) as typeof event;
      } catch (err) {
        if (err instanceof WebhookSignatureError) {
          // A signature failure is a 400, not a 401/403 — it's a malformed/unverifiable
          // request, not an authenticated-but-forbidden one, and Stripe treats 4xx as "don't
          // retry this exact payload," which is correct here.
          return res.status(400).json({ error: 'invalid_signature', message: err.message });
        }
        throw err;
      }

      const eventId = event.id ?? 'missing_event_id';
      const { processed } = await processWebhookOnce(deps.webhookEvents, 'stripe', eventId, async () => {
        if (event.type === 'payment_intent.succeeded' && event.data?.order_id) {
          await deps.orders.markPaid(event.data.order_id);
        }
      });
      res.json({ received: true, processed });
    } catch (err) { next(err); }
  });

  app.use(express.json());

  const catalog = new InMemoryCatalogStore(SEED_CATALOG);

  // --- Skin Match (SC-P2) ---
  app.use('/api/skin-match', skinMatchRouter(catalog));

  // --- Cart (SC-P3) — carts are keyed by the same session_id as the Skin Match session ---
  app.use('/api/cart', cartRouter(catalog));

  // --- Checkout (SC-P3) — pending-order-first pattern; payment provider and order storage
  // are both injected so the module under test never learns which backend is in play ---
  app.use('/api/checkout', checkoutRouter(
    getCart,
    (cart) => cart.items.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0),
    payments,
    deps.orders,
  ));

  // --- Coach routine commands (SC-P3) — deterministic, see routine-commands.ts ---
  app.use('/api/coach', coachRouter(
    (sessionId) => getSession(sessionId)?.routine,
    (sessionId) => getSession(sessionId)?.slotResults ?? new Map<RoutineSlot, ScoreResult[]>(),
    (productId) => catalog.price_cents(productId),
  ));

  // --- Admin (knowledge approval + ingredient-rules safety matrix) — only mounted when an
  // AdminUserRepository is supplied, since every route here sits behind requireAdmin(). Tests
  // and any deployment that doesn't need admin can omit these three deps entirely. ---
  if (deps.adminUsers) {
    const adminAudit = deps.adminAudit;
    if (!adminAudit) {
      throw new Error('AppDeps.adminAudit is required whenever adminUsers is provided.');
    }
    app.use('/admin', requireAdmin(deps.adminUsers, adminUserIdFromHeader));

    // Who am I, and what may I do. The admin console needs the caller's roles to decide which
    // actions to offer -- and, more usefully, which to show as unavailable-with-a-reason. It
    // gates on the SAME @mgt/domain RBAC engine the server enforces with, so the console can
    // never advertise an action the API would refuse, or hide one it would allow. This is a
    // convenience for the UI, never the enforcement point: every route below re-checks.
    app.get('/admin/me', (req, res) => {
      const r = req as AdminRequest;
      res.json({
        id: r.adminId,
        roles: r.adminRoles,
        is_sme: r.adminIsSme,
        permissions: [...permissionsFor(r.adminRoles)],
      });
    });

    if (deps.knowledge) {
      app.use('/admin/knowledge', knowledgeRouter(deps.knowledge, adminAudit));
    }
    if (deps.ingredientRules) {
      app.use('/admin/ingredient-rules', ingredientRulesRouter(deps.ingredientRules, adminAudit));
    }
  }

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  app.use(errorHandler);

  return app;
}

// --- Production/dev bootstrap ---------------------------------------------------------
// DATABASE_URL selects Postgres-backed repositories; unset falls back to in-memory (local
// dev, CI without a DB). STRIPE_SECRET_KEY selects the real Stripe provider; unset falls
// back to StubPaymentProvider so `pnpm dev` still works without live credentials. Admin
// deps are wired only when DATABASE_URL is set — the in-memory admin repositories have no
// seed data of their own, so an admin console with nothing behind it would be a false start.
function buildProductionDeps(): AppDeps {
  const databaseUrl = process.env.DATABASE_URL;
  let orders: OrderRepository;
  let webhookEvents: WebhookEventRepository;
  let adminDeps: Pick<AppDeps, 'knowledge' | 'adminUsers' | 'adminAudit' | 'ingredientRules'> = {};

  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    orders = new PgOrderRepository(pool);
    webhookEvents = new PgWebhookEventRepository(pool);
    // Lazily required so the api package doesn't need these Pg* classes imported twice —
    // see persistence/postgres.ts for PgKnowledgeRepository / PgAdminUserRepository /
    // PgAdminAuditRepository / PgIngredientRuleRepository.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pg = require('./persistence/postgres');
    adminDeps = {
      knowledge: new pg.PgKnowledgeRepository(pool),
      adminUsers: new pg.PgAdminUserRepository(pool),
      adminAudit: new pg.PgAdminAuditRepository(pool),
      ingredientRules: new pg.PgIngredientRuleRepository(pool),
    };
  } else {
    // eslint-disable-next-line no-console
    console.warn('[server] DATABASE_URL not set — using in-memory order/webhook storage. Orders will not survive a restart, and the admin routes are disabled.');
    orders = new InMemoryOrderRepository();
    webhookEvents = new InMemoryWebhookEventRepository();
  }

  let payments: PaymentProvider;
  if (process.env.STRIPE_SECRET_KEY) {
    payments = new StripePaymentProvider(process.env.STRIPE_SECRET_KEY);
  } else {
    // eslint-disable-next-line no-console
    console.warn('[server] STRIPE_SECRET_KEY not set — using StubPaymentProvider. No real charges will be created.');
    payments = new StubPaymentProvider();
  }

  return { orders, webhookEvents, payments, ...adminDeps };
}

if (require.main === module) {
  const deps = buildProductionDeps();
  const app = createApp(deps);
  const port = process.env.PORT ?? 3000;
  app.listen(port, () => console.log(`@mgt/api listening on :${port}`));
}
