// webhook_events (provider, event_id) UNIQUE constraint pattern (Section 0.2 "Stripe
// subscriptions" row) — one table, one guard, for every provider (Stripe, RevenueCat, carriers).
//
// The actual store lives in persistence/repositories.ts (WebhookEventRepository) with
// in-memory and Postgres implementations in persistence/in-memory.ts and
// persistence/postgres.ts — this file only holds the shared "process at most once" wrapper so
// every webhook route (Stripe today, RevenueCat/carriers later) gets the same guarantee from
// one place.

export interface TryRecordable {
  tryRecord(provider: string, eventId: string): Promise<boolean>;
}

export async function processWebhookOnce<T>(
  store: TryRecordable,
  provider: string,
  eventId: string,
  handler: () => Promise<T>,
): Promise<{ processed: boolean; result?: T }> {
  const isNew = await store.tryRecord(provider, eventId);
  if (!isNew) return { processed: false };
  const result = await handler();
  return { processed: true, result };
}
