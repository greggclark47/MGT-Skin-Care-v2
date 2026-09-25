import { Router } from 'express';
import {
  buildCartFromRoutine, swapItem, applyBundle, priceCart,
  type Routine, type Bundle,
} from '@mgt/domain';
import type { CatalogStore } from '../catalog/store';
import { ApiError } from '../../middleware/error';
import { saveCart, getCart } from './store';

// Server-side cart per Section C.7/F: cart is always derived from the routine plus explicit
// diffs, never a second source of truth.
const BUNDLES: Bundle[] = [
  { id: 'starter-4-step', required_product_ids: ['cleanser-gentle', 'treatment-niacinamide', 'moisturizer-gel', 'spf-lightweight'], discount_cents: 500 },
];

export function cartRouter(catalog: CatalogStore) {
  const router = Router();

  router.post('/from-routine', (req, res, next) => {
    try {
      const { session_id, routine } = req.body as { session_id: string; routine: Routine };
      if (!session_id || !routine) throw new ApiError(400, 'invalid_input', 'session_id and routine are required.');
      let cart = buildCartFromRoutine(routine, catalog);
      cart = applyBundle(cart, BUNDLES);
      saveCart(session_id, cart);
      res.json({ cart });
    } catch (err) { next(err); }
  });

  router.post('/:sessionId/swap', (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { from_product_id, to_product_id, reason } = req.body as { from_product_id: string; to_product_id: string; reason: 'cheaper' | 'premium' | 'cleaner' | 'gentler' };
      const cart = getCart(sessionId);
      if (!cart) throw new ApiError(404, 'cart_not_found', `No cart for session ${sessionId}.`);
      if (!catalog.isAvailable(to_product_id)) throw new ApiError(409, 'product_unavailable', `${to_product_id} is not currently available.`);
      let next_cart = swapItem(cart, from_product_id, to_product_id, reason, catalog);
      next_cart = applyBundle(next_cart, BUNDLES);
      saveCart(sessionId, next_cart);
      res.json({ cart: next_cart });
    } catch (err) { next(err); }
  });

  router.get('/:sessionId/price', (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const isPremium = req.query.premium === 'true';
      const cart = getCart(sessionId);
      if (!cart) throw new ApiError(404, 'cart_not_found', `No cart for session ${sessionId}.`);
      // Flat-rate placeholder shipping + a placeholder tax rate — SC-P3 task per Section H
      // wires Stripe Tax and the real shipping calculator here.
      const pricing = priceCart(cart, isPremium, 599, 0.0);
      res.json({ pricing });
    } catch (err) { next(err); }
  });

  return router;
}
