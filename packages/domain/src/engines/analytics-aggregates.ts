export const ANALYTICS_AGGREGATES_VERSION = '1.0.0';

// Launch dashboard aggregates (Section H SC-P5 Data track: "funnel, AOV, attach, AI cost,
// fulfillment SLA"). Pure functions over already-fetched rows — the query layer (Section K
// event taxonomy tables) is a DB/warehouse concern; this module is what turns rows into the
// numbers the v1 KPI dashboard and Section N financial model both reference, so it's the one
// place those two are guaranteed to agree.

export interface FunnelCounts {
  skin_match_started: number;
  skin_match_completed: number;
  result_viewed: number;
  cart_created: number;
  checkout_started: number;
  purchase_completed: number;
}

export interface FunnelRates {
  completion_rate: number;         // completed / started
  result_to_cart_rate: number;     // cart_created / result_viewed
  skin_match_to_purchase_rate: number; // purchase_completed / skin_match_completed
}

export function computeFunnelRates(counts: FunnelCounts): FunnelRates {
  const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);
  return {
    completion_rate: safeDiv(counts.skin_match_completed, counts.skin_match_started),
    result_to_cart_rate: safeDiv(counts.cart_created, counts.result_viewed),
    skin_match_to_purchase_rate: safeDiv(counts.purchase_completed, counts.skin_match_completed),
  };
}

export interface OrderRecord {
  total_cents: number;
  is_subscriber: boolean;
}

export function computeAOV(orders: OrderRecord[]): number {
  if (orders.length === 0) return 0;
  return orders.reduce((sum, o) => sum + o.total_cents, 0) / orders.length;
}

export function computePremiumAttach(purchaserCount: number, premiumSubscriberCount: number): number {
  return purchaserCount > 0 ? premiumSubscriberCount / purchaserCount : 0;
}

export interface AiCostRecord {
  cost_cents: number;
  is_subscriber: boolean;
}

export function computeAiCostPerUser(records: AiCostRecord[]): { per_user_cents: number; per_subscriber_cents: number } {
  const totalCost = records.reduce((sum, r) => sum + r.cost_cents, 0);
  const subCount = records.filter((r) => r.is_subscriber).length;
  return {
    per_user_cents: records.length ? totalCost / records.length : 0,
    per_subscriber_cents: subCount ? records.filter((r) => r.is_subscriber).reduce((s, r) => s + r.cost_cents, 0) / subCount : 0,
  };
}

export interface FulfillmentRecord {
  ordered_at: string;
  shipped_at: string | null;
  sla_hours: number; // partner's committed SLA
}

export interface FulfillmentSlaResult {
  on_time_rate: number;
  breaches: number;
  total: number;
}

export function computeFulfillmentSla(records: FulfillmentRecord[]): FulfillmentSlaResult {
  const shipped = records.filter((r) => r.shipped_at !== null);
  const onTime = shipped.filter((r) => {
    const hours = (new Date(r.shipped_at!).getTime() - new Date(r.ordered_at).getTime()) / (1000 * 60 * 60);
    return hours <= r.sla_hours;
  });
  return {
    on_time_rate: shipped.length ? onTime.length / shipped.length : 1,
    breaches: shipped.length - onTime.length,
    total: records.length,
  };
}
