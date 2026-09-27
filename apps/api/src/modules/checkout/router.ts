import { Router } from 'express';
import Stripe from 'stripe';
import type { Cart } from '@mgt/domain';
import { ApiError } from '../../middleware/error';
import type { OrderRepository } from '../../persistence/repositories';

// Server-authoritative Stripe per Section C.7/F: an order exists as `pending` BEFORE a
// PaymentIntent/Checkout session is created, and becomes `paid` only via the verified
// webhook path. The client success page polls order status — it never reports its own success.

export interface PaymentProvider {
  createPaymentIntent(amountCents: number, metadata: Record<string, string>): Promise<{ id: string; client_secret: string }>;
}

export class StubPaymentProvider implements PaymentProvider {
  async createPaymentIntent(_amountCents: number, _metadata: Record<string, string>) {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { id: `pi_stub_${stamp}`, client_secret: `pi_stub_secret_${stamp}` };
  }
}

// Real implementation (SC-P1 closed out). Requires STRIPE_SECRET_KEY at construction time —
// callers should choose StubPaymentProvider vs StripePaymentProvider at wiring time (server.ts),
// never inside checkout logic, so the module under test never learns which is in play.
export class StripePaymentProvider implements PaymentProvider {
  private stripe: Stripe;

  constructor(secretKey: string = process.env.STRIPE_SECRET_KEY ?? '') {
    if (!secretKey) {
      throw new Error(
        'StripePaymentProvider requires STRIPE_SECRET_KEY. Use StubPaymentProvider for local/dev/test.',
      );
    }
    // No pinned apiVersion: let the SDK use the account's default API version rather than
    // hardcoding a literal that has to be bumped in lockstep with every `stripe` upgrade.
    this.stripe = new Stripe(secretKey);
  }

  async createPaymentIntent(amountCents: number, metadata: Record<string, string>) {
    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata,
      automatic_payment_methods: { enabled: true },
    });
    if (!intent.client_secret) {
      // Stripe always returns client_secret for a freshly created intent; guarded so the
      // return type stays non-nullable for callers.
      throw new Error(`Stripe returned no client_secret for intent ${intent.id}`);
    }
    return { id: intent.id, client_secret: intent.client_secret };
  }
}

let orderSeq = 1;

export function checkoutRouter(
  getCart: (sessionId: string) => Cart | undefined,
  getPriceTotal: (cart: Cart) => number,
  payments: PaymentProvider,
  orders: OrderRepository,
) {
  const router = Router();

  router.post('/session', async (req, res, next) => {
    try {
      const { session_id } = req.body as { session_id: string };
      const cart = getCart(session_id);
      if (!cart) throw new ApiError(404, 'cart_not_found', `No cart for session ${session_id}.`);
      if (cart.items.length === 0) throw new ApiError(400, 'empty_cart', 'Cannot check out an empty cart.');

      const total_cents = getPriceTotal(cart);
      const orderId = `order_${orderSeq++}_${Date.now()}`;

      // Order is persisted as pending BEFORE the PaymentIntent exists. That ordering is the
      // point: if intent creation fails, we hold a pending order to reconcile, never a
      // payment with no order behind it.
      await orders.create({
        id: orderId, session_id, total_cents,
        status: 'pending', payment_intent_id: null, created_at: new Date().toISOString(),
      }, cart);

      const intent = await payments.createPaymentIntent(total_cents, { order_id: orderId });
      await orders.setPaymentIntent(orderId, intent.id);

      res.json({ order_id: orderId, client_secret: intent.client_secret, total_cents });
    } catch (err) { next(err); }
  });

  // Polled by the client success page — never flips status itself.
  router.get('/orders/:orderId/status', async (req, res, next) => {
    try {
      const order = await orders.get(req.params.orderId);
      if (!order) throw new ApiError(404, 'order_not_found', `No order ${req.params.orderId}.`);
      res.json({ status: order.status });
    } catch (err) { next(err); }
  });

  return router;
}
