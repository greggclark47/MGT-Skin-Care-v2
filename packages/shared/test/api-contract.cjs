const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ApiClient, ApiError } = require('../dist/api.js');

function transport(body, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

test('identifiers cannot add route segments or query parameters', async () => {
  const { calls, fetchImpl } = transport({});
  const api = new ApiClient('https://portal.invalid', fetchImpl);
  const id = 'a/b?premium=true#fragment';
  await api.priceCart(id);
  await api.orderStatus(id);
  assert.equal(calls[0].url, `https://portal.invalid/api/cart/${encodeURIComponent(id)}/price?premium=false`);
  assert.equal(calls[1].url, `https://portal.invalid/api/checkout/orders/${encodeURIComponent(id)}/status`);
});

test('non-JSON service failure keeps its HTTP status and hides its body', async () => {
  const api = new ApiClient('', async () => ({
    ok: false, status: 502, json: async () => { throw new Error('private upstream content'); },
  }));
  await assert.rejects(api.orderStatus('order-1'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 502);
    assert.equal(error.code, 'unknown');
    assert.equal(error.message, 'Request failed');
    return true;
  });
});

test('object error envelope preserves request context and rejects', async () => {
  const { fetchImpl } = transport({ error: {
    code: 'not_found', message: 'No such order.', request_id: 'request-1',
  } }, 404);
  await assert.rejects(new ApiClient('', fetchImpl).orderStatus('order-1'), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.code, 'not_found');
    assert.equal(error.requestId, 'request-1');
    return true;
  });
});

test('legacy and malformed error envelopes also reject with the HTTP status', async () => {
  for (const body of [null, 'upstream text', { error: 'unauthenticated' }, { error: { message: {} } }]) {
    const { fetchImpl } = transport(body, 401);
    await assert.rejects(new ApiClient('', fetchImpl).startCheckout('session-1'), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 401);
      assert.equal(typeof error.message, 'string');
      return true;
    });
  }
});

test('unreadable successful response cannot be treated as checkout success', async () => {
  const api = new ApiClient('', async () => ({
    ok: true, status: 200, json: async () => { throw new Error('invalid body'); },
  }));
  await assert.rejects(api.startCheckout('session-1'), (error) => {
    assert.equal(error.code, 'invalid_response');
    assert.equal(error.status, 200);
    return true;
  });
});
