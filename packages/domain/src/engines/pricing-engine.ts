export const PRICING_ENGINE_VERSION = '1.0.0';

export interface LineItem {
  product_id: string;
  unit_price_cents: number;
  quantity: number;
}

export interface PricingInput {
  items: LineItem[];
  is_premium_member: boolean;
  member_discount_pct?: number;   // e.g. 0.05 for 5% member pricing, config-driven
  shipping_cents: number;         // computed upstream (flat-rate or partner-fed); this engine only applies it
  tax_rate: number;               // resolved via Stripe Tax by the checkout module; passed in here as a rate
  bundle_discount_cents?: number; // flat discount for a recognized bundle, computed by CartEngine
}

export interface PricingResult {
  subtotal_cents: number;
  member_discount_cents: number;
  bundle_discount_cents: number;
  shipping_cents: number;
  taxable_base_cents: number;
  tax_cents: number;
  total_cents: number;
}

export function computeTotal(input: PricingInput): PricingResult {
  const subtotal_cents = input.items.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);
  const member_discount_cents = input.is_premium_member
    ? Math.round(subtotal_cents * (input.member_discount_pct ?? 0.05))
    : 0;
  const bundle_discount_cents = input.bundle_discount_cents ?? 0;
  const taxable_base_cents = Math.max(0, subtotal_cents - member_discount_cents - bundle_discount_cents);
  const tax_cents = Math.round(taxable_base_cents * input.tax_rate);
  const total_cents = taxable_base_cents + tax_cents + input.shipping_cents;

  return {
    subtotal_cents, member_discount_cents, bundle_discount_cents,
    shipping_cents: input.shipping_cents, taxable_base_cents, tax_cents, total_cents,
  };
}
