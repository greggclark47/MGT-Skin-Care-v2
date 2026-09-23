'use client';
import React from 'react';
import type { Cart, CartItem, PricingResult } from '@mgt/domain';
import { color, space, radius, font, TAP_TARGET_MIN } from './theme-tokens';
import { MedicalDisclosure } from './MedicalDisclosure';

// "Shop" (Section G / C.7): Shop My Routine — the routine IS the cart. Swaps carry their
// reason so the cart explains its own changes (Section A.3 differentiator #5); a cart that
// silently differs from the routine is the failure mode this screen exists to prevent.

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const SWAP_REASON_COPY: Record<NonNullable<CartItem['swap_reason']>, string> = {
  cheaper: 'Swapped for a cheaper option',
  premium: 'Upgraded to a premium option',
  cleaner: 'Swapped for a cleaner formula',
  gentler: 'Swapped for a gentler formula',
};

export interface ShopViewProps {
  cart: Cart;
  pricing: PricingResult;
  productName: (productId: string) => string;
  isPremiumMember: boolean;
  onCheckout?: () => void;
  checkoutBusy?: boolean;
}

export function ShopView({ cart, pricing, productName, isPremiumMember, onCheckout, checkoutBusy }: ShopViewProps) {
  const empty = cart.items.length === 0;

  return (
    <div data-testid="shop-view">
      <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, margin: 0 }}>Shop my routine</h1>

      {empty ? (
        <p data-testid="empty-cart" style={{ color: color.textMuted, fontSize: font.size.sm, marginTop: space.md }}>
          Your cart is empty. Complete a Skin Match to build your routine.
        </p>
      ) : (
        <>
          <ul data-testid="cart-items" style={{ listStyle: 'none', padding: 0, margin: `${space.lg}px 0 0` }}>
            {cart.items.map((item) => (
              <li key={item.product_id} style={{ display: 'flex', gap: space.md, padding: `${space.md}px 0`,
                                                 borderBottom: `1px solid ${color.border}` }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: font.size.md }}>{productName(item.product_id)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: font.size.sm, color: color.textMuted, textTransform: 'capitalize' }}>
                    {item.slot.replace(/_/g, ' ')}
                  </p>
                  {item.is_swap && item.swap_reason && (
                    <p data-testid="swap-explanation"
                       style={{ margin: `${space.xs}px 0 0`, fontSize: font.size.sm, color: color.accent }}>
                      {SWAP_REASON_COPY[item.swap_reason]}
                      {item.swapped_from_product_id && ` (was ${productName(item.swapped_from_product_id)})`}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: font.size.md, whiteSpace: 'nowrap' }}>{money(item.unit_price_cents * item.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl data-testid="pricing" style={{ margin: `${space.lg}px 0 0`, display: 'grid', gap: space.sm }}>
            <Row label="Subtotal" value={money(pricing.subtotal_cents)} />
            {pricing.bundle_discount_cents > 0 && (
              <Row label="Bundle saving" value={`−${money(pricing.bundle_discount_cents)}`} accent testId="bundle-saving" />
            )}
            {pricing.member_discount_cents > 0 && (
              <Row label="Member pricing" value={`−${money(pricing.member_discount_cents)}`} accent testId="member-saving" />
            )}
            <Row label="Shipping" value={money(pricing.shipping_cents)} />
            {pricing.tax_cents > 0 && <Row label="Tax" value={money(pricing.tax_cents)} />}
            <Row label="Total" value={money(pricing.total_cents)} bold testId="total" />
          </dl>

          {/* Premium is offered as a saving on THIS cart, not an abstract upsell. */}
          {!isPremiumMember && (
            <p data-testid="premium-upsell" style={{ marginTop: space.md, fontSize: font.size.sm, color: color.textMuted,
                   background: color.accentSubtle, border: `1px solid ${color.accentBorder}`,
                   borderRadius: radius.md, padding: space.md }}>
              Premium members save 5% on every order and get automatic replenishment.
            </p>
          )}

          <button onClick={onCheckout} disabled={checkoutBusy} data-testid="checkout"
            style={{ width: '100%', minHeight: TAP_TARGET_MIN, marginTop: space.lg, cursor: 'pointer',
                     borderRadius: radius.pill, border: 'none', background: color.accent, color: '#fff',
                     fontFamily: font.family, fontSize: font.size.md, fontWeight: font.weight.semibold,
                     opacity: checkoutBusy ? 0.6 : 1 }}>
            {checkoutBusy ? 'Starting checkout…' : `Checkout · ${money(pricing.total_cents)}`}
          </button>
        </>
      )}

      <MedicalDisclosure />
    </div>
  );
}

function Row({ label, value, bold, accent, testId }: { label: string; value: string; bold?: boolean; accent?: boolean; testId?: string }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', justifyContent: 'space-between',
                 fontSize: bold ? font.size.md : font.size.sm,
                 fontWeight: bold ? font.weight.semibold : font.weight.regular,
                 color: accent ? color.success : color.text }}>
      <dt style={{ margin: 0 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}
