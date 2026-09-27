import type { BillingProvider } from '../types/enums';

export const ENTITLEMENT_RESOLVER_VERSION = '1.0.0';

export interface SubscriptionRecord {
  provider: BillingProvider;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid';
  current_period_end: string; // ISO timestamp
}

export interface Entitlement {
  premium: boolean;
  source: BillingProvider | null;
  valid_until: string | null;
}

const ACTIVE_STATUSES = new Set<SubscriptionRecord['status']>(['trialing', 'active', 'past_due']);
const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3-day grace on past_due, mirrors recompute_entitlement() in Section J

// Stripe (web) ∪ RevenueCat (Apple/Google) → one boolean. Mirrors the Postgres
// `recompute_entitlement(user_id)` function exactly — this is the in-process version used by
// the API for synchronous checks; the DB function is the source of truth on write.
export function resolveEntitlement(subscriptions: SubscriptionRecord[], now: Date = new Date()): Entitlement {
  const eligible = subscriptions.filter((s) => {
    if (!ACTIVE_STATUSES.has(s.status)) return false;
    const periodEnd = new Date(s.current_period_end).getTime();
    return periodEnd > now.getTime() - GRACE_MS;
  });

  if (eligible.length === 0) {
    return { premium: false, source: null, valid_until: null };
  }

  // Most-future period end wins when a user somehow holds entitlements from two sources.
  eligible.sort((a, b) => new Date(b.current_period_end).getTime() - new Date(a.current_period_end).getTime());
  const winner = eligible[0];
  return { premium: true, source: winner.provider, valid_until: winner.current_period_end };
}
