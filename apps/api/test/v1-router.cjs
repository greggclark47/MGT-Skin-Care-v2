const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createV1Router, API_V1_PREFIX } = require('../dist/routes/v1.js');
const { ApiError } = require('../dist/middleware/error.js');

test('v1 router scopes errors and leaves legacy routes intact', async () => {
  const app = express();
  const checkout = express.Router();
  const subscriptions = express.Router();
  const entitlement = express.Router();
  checkout.get('/orders/:id/status', (_req, res) => res.json({ status: 'pending' }));
  subscriptions.use((_req, _res, next) => next(new ApiError(401, 'unauthenticated', 'Sign in.')));
  entitlement.get('/', (_req, res) => res.json({ premium: false }));
  app.use(API_V1_PREFIX, createV1Router({ checkout, subscriptions, entitlement }));
  app.get('/legacy', (_req, res) => res.json({ legacy: true }));
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const denied = await fetch(`${base}/api/v1/subscriptions`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: { code: 'unauthenticated', message: 'Sign in.' } });
    for (const path of ['/api/v1/missing', '/api/v1/checkout/confirm']) {
      const response = await fetch(base + path, { method: 'POST' });
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, 'not_found');
    }
    assert.equal((await (await fetch(`${base}/api/v1/checkout/orders/order-1/status`)).json()).status, 'pending');
    assert.deepEqual(await (await fetch(`${base}/api/v1/entitlement`)).json(), { premium: false });
    assert.deepEqual(await (await fetch(`${base}/legacy`)).json(), { legacy: true });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
