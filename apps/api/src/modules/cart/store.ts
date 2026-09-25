import type { Cart } from '@mgt/domain';

// Cart storage keyed by session_id, shared between the cart module (build/swap) and the
// checkout module (read-only at checkout time). SC-P3's real `carts` table (Section J)
// persists the same shape; this is the in-memory dev/test seam — one map, one owner.
const carts = new Map<string, Cart>();

export function saveCart(sessionId: string, cart: Cart): void {
  carts.set(sessionId, cart);
}

export function getCart(sessionId: string): Cart | undefined {
  return carts.get(sessionId);
}
