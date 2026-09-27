export const REPLENISHMENT_ENGINE_VERSION = '1.0.0';

export interface UsageEstimateInput {
  size_ml: number;
  frequency_per_week: number;    // derived from usage_frequency enum by the caller
  ml_per_use: number;            // catalog attribute or category default (e.g. 1ml serum, 2ml moisturizer)
  purchased_at: string;          // ISO timestamp of the order that fulfilled this step
  self_reported_last_used?: string; // optional user-provided correction from a feedback prompt
}

export interface RunOutEstimate {
  estimated_runout_at: string;   // ISO timestamp
  days_remaining: number;
  confidence: 'catalog_default' | 'user_confirmed';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function estimateRunOut(input: UsageEstimateInput, now: Date = new Date()): RunOutEstimate {
  const usesTotal = input.size_ml / input.ml_per_use;
  const daysSupply = usesTotal / (input.frequency_per_week / 7);
  const anchor = input.self_reported_last_used ? new Date(input.self_reported_last_used) : new Date(input.purchased_at);
  const runoutMs = anchor.getTime() + daysSupply * MS_PER_DAY;
  const daysRemaining = Math.round((runoutMs - now.getTime()) / MS_PER_DAY);

  return {
    estimated_runout_at: new Date(runoutMs).toISOString(),
    days_remaining: daysRemaining,
    confidence: input.self_reported_last_used ? 'user_confirmed' : 'catalog_default',
  };
}

// Reorder is nudged 5 days before predicted run-out (v1 pattern); Premium members get
// auto-replenish, everyone else gets a notification with one-tap reorder/delay/skip/cancel.
export function shouldNudge(estimate: RunOutEstimate): boolean {
  return estimate.days_remaining <= 5 && estimate.days_remaining >= 0;
}

// One-tap reorder/delay/skip/cancel (Section H SC-P4). Premium members get auto-replenish
// upstream of this call; this is the shared decision logic every path (auto or one-tap) runs
// through, so "what happens when a user taps delay" has exactly one implementation.
export type ReplenishmentAction = 'reorder' | 'delay' | 'skip' | 'cancel';

export interface ReplenishmentDecision {
  action: ReplenishmentAction;
  status: 'reorder_initiated' | 'delayed' | 'skipped' | 'canceled';
  // When to re-nudge the user, if this action calls for a future check. Null means "no
  // further automatic nudge for this step" (reorder handed off to checkout; skip/cancel end
  // the tracking cycle for this run-out event).
  next_check_at: string | null;
}

const DEFAULT_DELAY_DAYS = 7;

export function applyReplenishmentAction(
  action: ReplenishmentAction,
  estimate: RunOutEstimate,
  delayDays?: number,
): ReplenishmentDecision {
  switch (action) {
    case 'reorder':
      // The actual order is created by the checkout flow the client calls next; this just
      // records the decision so the nudge isn't re-sent for the same run-out event.
      return { action, status: 'reorder_initiated', next_check_at: null };
    case 'delay': {
      const days = delayDays && delayDays > 0 ? delayDays : DEFAULT_DELAY_DAYS;
      const next = new Date(new Date(estimate.estimated_runout_at).getTime() + days * MS_PER_DAY);
      return { action, status: 'delayed', next_check_at: next.toISOString() };
    }
    case 'skip':
      return { action, status: 'skipped', next_check_at: null };
    case 'cancel':
      return { action, status: 'canceled', next_check_at: null };
    default: {
      // Exhaustiveness guard: a new ReplenishmentAction variant must be handled here, not
      // silently fall through to an "unknown decision" the router would have to invent.
      const _exhaustive: never = action;
      throw new Error(`Unhandled replenishment action: ${_exhaustive}`);
    }
  }
}
