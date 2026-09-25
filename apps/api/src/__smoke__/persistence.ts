import { Pool } from 'pg';
import { PgWebhookEventRepository, PgOrderRepository, PgEntitlementRepository } from '../persistence/postgres';
import type { Cart } from '@mgt/domain';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const emptyCart: Cart = { items: [{ product_id: 'p1', slot: 'cleanser', unit_price_cents: 2200, quantity: 1, is_swap: false }], bundle_id: null, bundle_discount_cents: 0 };

async function main() {
  const pool = new Pool({ host: '/tmp', port: 5499, user: 'postgres', database: 'postgres' });

  console.log('\n== 1. Webhook idempotency against a real UNIQUE constraint ==');
  {
    const repo = new PgWebhookEventRepository(pool);
    const first = await repo.tryRecord('stripe', 'evt_live_1');
    const second = await repo.tryRecord('stripe', 'evt_live_1');
    check('first delivery recorded', first === true);
    check('replay rejected', second === false);
    const otherProvider = await repo.tryRecord('revenuecat', 'evt_live_1');
    check('same event id from a different provider is independent', otherProvider === true);

    // The real test: concurrent delivery, which is how Stripe actually retries.
    const results = await Promise.all(Array.from({ length: 10 }, () => repo.tryRecord('stripe', 'evt_race')));
    const winners = results.filter(Boolean).length;
    check('exactly one winner under 10-way concurrency', winners === 1, winners);
  }

  console.log('\n== 2. Order pending -> paid transition is exactly-once ==');
  {
    const repo = new PgOrderRepository(pool);
    await repo.create({ id: 'order_live_1', session_id: 's1', total_cents: 7700, status: 'pending', payment_intent_id: null, created_at: new Date().toISOString() }, emptyCart);
    await repo.setPaymentIntent('order_live_1', 'pi_123');

    const before = await repo.get('order_live_1');
    check('order starts pending', before?.status === 'pending', before?.status);
    check('payment intent persisted', before?.payment_intent_id === 'pi_123');
    check('total round-trips as a number', before?.total_cents === 7700, before?.total_cents);

    const firstPaid = await repo.markPaid('order_live_1');
    const secondPaid = await repo.markPaid('order_live_1');
    check('first markPaid performs the transition', firstPaid === true);
    check('second markPaid is a no-op (no double fulfillment)', secondPaid === false);

    const after = await repo.get('order_live_1');
    check('order now paid', after?.status === 'paid', after?.status);

    // Concurrent webhook + manual retry hitting markPaid simultaneously.
    await repo.create({ id: 'order_race', session_id: 's2', total_cents: 1000, status: 'pending', payment_intent_id: null, created_at: new Date().toISOString() }, emptyCart);
    const raceResults = await Promise.all(Array.from({ length: 8 }, () => repo.markPaid('order_race')));
    check('exactly one markPaid wins under concurrency', raceResults.filter(Boolean).length === 1, raceResults.filter(Boolean).length);

    check('missing order returns null', (await repo.get('does_not_exist')) === null);
  }

  console.log('\n== 3. Entitlement recompute via the Section J function ==');
  {
    const repo = new PgEntitlementRepository(pool);
    const userId = '11111111-1111-1111-1111-111111111111';

    // Seed the user this section's fixtures hang off. entitlements.user_id and
    // subscriptions.user_id are both FKs to auth.users, so without this the very first
    // recompute() fails on a foreign-key violation rather than telling us anything about
    // entitlement logic. Previously this test only passed against a database where some
    // earlier run had left a matching user row behind.
    await pool.query(
      `insert into auth.users (id, email) values ($1, 'entitlement-fixture@mgt.test')
       on conflict (id) do nothing`,
      [userId],
    );

    const none = await repo.recompute(userId);
    check('no subscriptions -> not premium', none.premium === false, none);

    await pool.query(
      `insert into subscriptions (user_id, provider, provider_subscription_id, plan_id, status, current_period_end)
       values ($1,'stripe','sub_fixture_stripe','premium_monthly','active', now() + interval '20 days')`,
      [userId],
    );
    const active = await repo.recompute(userId);
    check('active stripe sub -> premium', active.premium === true, active);
    check('source reported as stripe', active.source === 'stripe', active.source);

    // Apple sub with a later period end should win the source race.
    await pool.query(
      `insert into subscriptions (user_id, provider, provider_subscription_id, plan_id, status, current_period_end)
       values ($1,'apple','sub_fixture_apple','premium_monthly','active', now() + interval '60 days')`,
      [userId],
    );
    const both = await repo.recompute(userId);
    check('latest period end wins the source', both.source === 'apple', both.source);

    // Expire everything: canceled + long past.
    await pool.query(`update subscriptions set status='canceled', current_period_end = now() - interval '30 days' where user_id = $1`, [userId]);
    const expired = await repo.recompute(userId);
    check('expired/canceled -> premium revoked', expired.premium === false, expired);
  }

  await pool.end();
  console.log(failures === 0 ? '\nPERSISTENCE: ALL CHECKS PASSED (real Postgres 16)' : `\nPERSISTENCE: ${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
