import type { Routine } from './routine-engine';
import { computeTotal, type PricingResult } from './pricing-engine';

export const CART_ENGINE_VERSION = '1.0.0';

export interface CartItem {
  product_id: string;
  slot: string;
  unit_price_cents: number;
  quantity: number;
  is_swap: boolean;
  swap_reason?: 'cheaper' | 'premium' | 'cleaner' | 'gentler';
  swapped_from_product_id?: string;
}

export interface Cart {
  items: CartItem[];
  bundle_id: string | null;
  bundle_discount_cents: number;
}

export interface ProductCatalogLookup {
  price_cents(productId: string): number;
  isAvailable(productId: string): boolean;
}

// "Shop My Routine" — the cart is always derived from the routine plus explicit diffs; it is
// never a second source of truth (SC-P3 risk mitigation, Section H).
export function buildCartFromRoutine(routine: Routine, catalog: ProductCatalogLookup): Cart {
  const items: CartItem[] = routine.steps
    .filter((step) => catalog.isAvailable(step.product_id))
    .map((step) => ({
      product_id: step.product_id,
      slot: step.slot,
      unit_price_cents: catalog.price_cents(step.product_id),
      quantity: 1,
      is_swap: false,
    }));
  return { items, bundle_id: null, bundle_discount_cents: 0 };
}

export function swapItem(
  cart: Cart,
  fromProductId: string,
  toProductId: string,
  reason: CartItem['swap_reason'],
  catalog: ProductCatalogLookup,
): Cart {
  const items = cart.items.map((item) =>
    item.product_id === fromProductId
      ? {
          ...item,
          product_id: toProductId,
          unit_price_cents: catalog.price_cents(toProductId),
          is_swap: true,
          swap_reason: reason,
          swapped_from_product_id: fromProductId,
        }
      : item,
  );
  return { ...cart, items };
}

export interface Bundle {
  id: string;
  required_product_ids: string[]; // bundle applies only when every one of these is in the cart
  discount_cents: number;
}

export function applyBundle(cart: Cart, bundles: Bundle[]): Cart {
  const cartIds = new Set(cart.items.map((i) => i.product_id));
  const match = bundles.find((b) => b.required_product_ids.every((id) => cartIds.has(id)));
  if (!match) return { ...cart, bundle_id: null, bundle_discount_cents: 0 };
  return { ...cart, bundle_id: match.id, bundle_discount_cents: match.discount_cents };
}

export function priceCart(cart: Cart, isPremiumMember: boolean, shippingCents: number, taxRate: number): PricingResult {
  return computeTotal({
    items: cart.items.map((i) => ({ product_id: i.product_id, unit_price_cents: i.unit_price_cents, quantity: i.quantity })),
    is_premium_member: isPremiumMember,
    shipping_cents: shippingCents,
    tax_rate: taxRate,
    bundle_discount_cents: cart.bundle_discount_cents,
  });
}
