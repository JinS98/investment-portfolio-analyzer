import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createRequestLimiter } from '../lib/rateLimit.js';
import { createTossApiHandler } from '../lib/toss.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function call(handler, path, options = {}) {
  const headers = { host: 'localhost', ...options.headers };
  const responseHeaders = new Map();
  const response = {
    statusCode: 200,
    body: '',
    setHeader(name, value) {
      responseHeaders.set(name.toLowerCase(), value);
    },
    end(body = '') {
      this.body = body;
    },
  };
  await handler({ url: path, method: options.method ?? 'GET', headers }, response);
  return {
    status: response.statusCode,
    body: JSON.parse(response.body),
    cache: responseHeaders.get('cache-control'),
  };
}

test('health reports configuration state without returning credentials', async () => {
  const result = await call(
    createTossApiHandler({ TOSS_CLIENT_ID: 'private-id', TOSS_CLIENT_SECRET: 'private-secret' }),
    '/api/toss/health',
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: 'ok', tossConfigured: true });
  assert.equal(result.cache, 'no-store');
});

test('unknown routes, other methods and cross-origin requests are rejected', async () => {
  const handler = createTossApiHandler({});
  const unknown = await call(handler, '/api/toss/unknown');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.cache, 'no-store');
  assert.equal((await call(handler, '/api/toss/health', { method: 'POST' })).status, 404);
  assert.equal(
    (
      await call(handler, '/api/toss/exchange-rate', {
        headers: { origin: 'https://other.example' },
      })
    ).status,
    403,
  );
});

test('invalid parameters fail before any external request', async () => {
  globalThis.fetch = () => {
    throw new Error('Unexpected external request');
  };
  const handler = createTossApiHandler({});
  for (const path of [
    '/api/toss/candles?symbol=AAPL&count=201',
    '/api/toss/prices?symbols=bad%20symbol',
    '/api/toss/rankings?marketCountry=XX',
    '/api/toss/historical-exchange-rate?date=2026-02-30',
    '/api/toss/stock-insights?symbol=AAPL&market=US&name=' + 'a'.repeat(81),
  ]) {
    const result = await call(handler, path);
    assert.equal(result.status, 400, path);
    assert.equal(result.cache, 'no-store');
  }
});

test('missing Toss credentials return 503 without exposing configuration details', async () => {
  const result = await call(createTossApiHandler({}), '/api/toss/exchange-rate');
  assert.equal(result.status, 503);
  assert.equal(result.cache, 'no-store');
  assert.equal(result.body.message, '시장 데이터 설정을 확인해 주세요.');
});

test('token and quote responses are returned and successful responses are cacheable', async () => {
  const requested = [];
  globalThis.fetch = async (url, options) => {
    requested.push({ url, options });
    if (url.endsWith('/oauth2/token'))
      return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
        status: 200,
      });
    return new Response(JSON.stringify({ result: [{ symbol: 'AAPL', price: 100 }] }), {
      status: 200,
    });
  };
  const result = await call(
    createTossApiHandler({ TOSS_CLIENT_ID: 'id', TOSS_CLIENT_SECRET: 'secret' }),
    '/api/toss/prices?symbols=AAPL',
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { result: [{ symbol: 'AAPL', price: 100 }] });
  assert.equal(result.cache, 'public, max-age=0, s-maxage=10');
  assert.equal(requested.length, 2);
  assert.equal(requested[1].options.headers.Authorization, 'Bearer test-token');
});

test('upstream errors preserve status but are not cached', async () => {
  globalThis.fetch = async (url) =>
    url.endsWith('/oauth2/token')
      ? new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
          status: 200,
        })
      : new Response('{}', { status: 429 });
  const result = await call(
    createTossApiHandler({ TOSS_CLIENT_ID: 'id', TOSS_CLIENT_SECRET: 'secret' }),
    '/api/toss/prices?symbols=AAPL',
  );
  assert.equal(result.status, 429);
  assert.equal(result.cache, 'no-store');
  assert.match(result.body.message, /429/);
});

test('token failure and connection failure return 502 without caching', async () => {
  const env = { TOSS_CLIENT_ID: 'id', TOSS_CLIENT_SECRET: 'secret' };
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  const authFailure = await call(createTossApiHandler(env), '/api/toss/exchange-rate');
  assert.equal(authFailure.status, 502);
  assert.equal(authFailure.cache, 'no-store');

  globalThis.fetch = async () => {
    throw new Error('network unavailable');
  };
  const networkFailure = await call(createTossApiHandler(env), '/api/toss/exchange-rate');
  assert.equal(networkFailure.status, 502);
  assert.equal(networkFailure.cache, 'no-store');
});

test('request limiter allows 90 requests per minute per client and resets', () => {
  let now = 1_000;
  const limited = createRequestLimiter(() => now);
  for (let index = 0; index < 90; index += 1) assert.equal(limited('client-a'), false);
  assert.equal(limited('client-a'), true);
  assert.equal(limited('client-b'), false);
  now += 60_000;
  assert.equal(limited('client-a'), false);
});

test('request limiter bounds its client map and accepts new clients after expiry', () => {
  let now = 1_000;
  const limited = createRequestLimiter(() => now);
  for (let index = 0; index < 10_000; index += 1) {
    assert.equal(limited(`client-${index}`), false);
  }
  assert.equal(limited('new-client'), true);
  now += 60_000;
  assert.equal(limited('new-client'), false);
});
