import http from 'http';
import Stripe from 'stripe';
import { Pool } from 'pg';
import { createApp, type AppDeps } from '../server';

// The webhook route verifies Stripe signatures and fails closed without a secret, so this
// test signs its payloads the way Stripe does rather than setting the dev bypass. That keeps
// the signature path itself under test on both backends: a change that broke verification
// would fail here, where setting STRIPE_SKIP_SIGNATURE_VERIFICATION=1 would hide it.
const WEBHOOK_SECRET = 'whsec_dual_backend_test';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
import { InMemoryOrderRepository, InMemoryWebhookEventRepository } from '../persistence/in-memory';
import { PgOrderRepository, PgWebhookEventRepository } from '../persistence/postgres';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`    PASS  ${label}`);
  else { failures++; console.log(`    FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// Posts a Stripe-signed webhook: the raw body is signed with the same secret the server
// verifies against, so the bytes on the wire are what the signature covers.
function makeSignedWebhookCall(port: number) {
  return (event: unknown): Promise<{ status: number; body: any }> =>
    new Promise((resolve, reject) => {
      const payload = JSON.stringify(event);
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
      const req = http.request({
        host: 'localhost', port, path: '/webhooks/stripe', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'stripe-signature': signature,
        },
      }, (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(chunks || '{}') }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
}

function makeCall(port: number) {
  return (method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> =>
    new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : undefined;
      const req = http.request({ host: 'localhost', port, path, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(chunks || '{}') }));
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
}

// The identical scenario is run against both backends. If the repository abstraction is
// sound, the observable behaviour through HTTP must be indistinguishable.
async function runScenario(label: string, deps: AppDeps, port: number) {
  console.log(`\n  -- ${label} --`);
  const app = createApp(deps);
  const server = app.listen(port);
  const call = makeCall(port);
  const postWebhook = makeSignedWebhookCall(port);
  try {
    const sm = await call('POST', '/api/skin-match/complete', {
      skin_type: 'combination', concerns: ['hydration', 'texture_smoothing'], sensitivity: 'mild',
      age_band: '36_45', current_routine: 'basic', desired_outcome: 'glow',
      budget_range: 'between_25_50', ingredient_avoidances: [],
    });
    const sessionId = sm.body.session_id;
    check('skin match completes', sm.status === 200 && sm.body.routine.steps.length > 0, sm.body.routine?.steps?.length);

    await call('POST', '/api/cart/from-routine', { session_id: sessionId, routine: sm.body.routine });
    const checkout = await call('POST', '/api/checkout/session', { session_id: sessionId });
    const orderId = checkout.body.order_id;
    check('checkout creates an order', checkout.status === 200 && !!orderId);
    check('client_secret returned', typeof checkout.body.client_secret === 'string');

    const before = await call('GET', `/api/checkout/orders/${orderId}/status`);
    check('order starts pending', before.body.status === 'pending', before.body);

    const evtId = `evt_${label}_${Date.now()}`;
    const event = { id: evtId, type: 'payment_intent.succeeded', data: { order_id: orderId } };
    const wh1 = await postWebhook(event);
    check('signed webhook processed', wh1.body.processed === true, wh1.body);

    const after = await call('GET', `/api/checkout/orders/${orderId}/status`);
    check('order now paid', after.body.status === 'paid', after.body);

    const wh2 = await postWebhook(event);
    check('replayed webhook rejected as duplicate', wh2.body.processed === false, wh2.body);

    // An unsigned webhook must be refused outright — on both backends, since fail-closed is a
    // property of the route, not of the storage behind it.
    const unsigned = await call('POST', '/webhooks/stripe', { id: `${evtId}_forged`, type: 'payment_intent.succeeded', data: { order_id: orderId } });
    check('unsigned webhook rejected with 400', unsigned.status === 400 && unsigned.body.error === 'invalid_signature', unsigned.body);

    // Empty-cart guard
    const bad = await call('POST', '/api/checkout/session', { session_id: 'no-such-session' });
    check('unknown session 404s', bad.status === 404, bad.status);
  } finally {
    server.close();
  }
}

async function main() {
  console.log('\n== Same scenario, two storage backends ==');
  await runScenario('in-memory', {
    orders: new InMemoryOrderRepository(),
    webhookEvents: new InMemoryWebhookEventRepository(),
  }, 4401);

  const pool = new Pool({ host: '/tmp', port: 5499, user: 'postgres', database: 'postgres' });
  await runScenario('postgres-16', {
    orders: new PgOrderRepository(pool),
    webhookEvents: new PgWebhookEventRepository(pool),
  }, 4402);
  await pool.end();

  console.log(failures === 0
    ? '\nDUAL-BACKEND: ALL CHECKS PASSED — repository abstraction verified against real Postgres'
    : `\nDUAL-BACKEND: ${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
