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

test('Naver API HUB news works with only Naver keys and normalizes articles', async () => {
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    const request = new URL(url);
    assert.equal(request.origin, 'https://naverapihub.apigw.ntruss.com');
    assert.equal(request.pathname, '/search/v1/news');
    assert.equal(request.searchParams.get('query'), '삼성전자');
    assert.equal(request.searchParams.get('display'), '3');
    assert.equal(request.searchParams.get('sort'), 'date');
    assert.equal(request.searchParams.get('format'), 'json');
    assert.equal(options.headers['X-NCP-APIGW-API-KEY-ID'], 'hub-id');
    assert.equal(options.headers['X-NCP-APIGW-API-KEY'], 'hub-secret');
    return Response.json({
      items: [
        {
          title: '<b>삼성전자</b> &amp; 반도체',
          originallink: 'https://publisher.example/news',
          link: 'https://news.naver.com/article',
          description: '<b>실적</b> 발표',
          pubDate: 'Sat, 17 Oct 2026 09:00:00 +0900',
        },
      ],
    });
  };
  const handler = createTossApiHandler({
    NAVER_CLIENT_ID: 'hub-id',
    NAVER_CLIENT_SECRET: 'hub-secret',
  });
  const path =
    '/api/toss/stock-insights?' +
    new URLSearchParams({ symbol: '005930', market: 'KR', name: '삼성전자' });
  const result = await call(handler, path);
  assert.equal(result.status, 200);
  assert.equal(result.body.result.fundamentals, null);
  assert.deepEqual(result.body.result.news, [
    {
      title: '삼성전자 & 반도체',
      url: 'https://publisher.example/news',
      summary: '실적 발표',
      publishedAt: 'Sat, 17 Oct 2026 09:00:00 +0900',
      source: '네이버 뉴스',
    },
  ]);
  assert.equal(JSON.stringify(result.body).includes('hub-secret'), false);
  await call(handler, path);
  assert.equal(requests, 1);
});

for (const status of [401, 403, 429]) {
  test(`Naver API HUB ${status} returns an actionable news message`, async () => {
    globalThis.fetch = async () => new Response('', { status });
    const handler = createTossApiHandler({
      NAVER_CLIENT_ID: 'hub-id',
      NAVER_CLIENT_SECRET: 'hub-secret',
    });
    const result = await call(
      handler,
      '/api/toss/stock-insights?' +
        new URLSearchParams({ symbol: `KR${status}`, market: 'KR', name: `오류${status}` }),
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.result.news, []);
    assert.match(
      result.body.result.newsMessage,
      status === 429 ? /호출 한도/ : /인증키.*이용 신청/,
    );
  });
}

test('SEC denial does not hide overseas news', async () => {
  globalThis.fetch = async (input) => {
    if (String(input).startsWith('https://api.marketaux.com/'))
      return Response.json({
        data: [
          { title: 'Apple news', url: 'https://publisher.example/apple', source: 'Publisher' },
        ],
      });
    if (String(input).startsWith('https://www.sec.gov/')) return new Response('', { status: 403 });
    throw new Error('Unexpected provider');
  };
  const result = await call(
    createTossApiHandler({
      MARKETAUX_API_TOKEN: 'private-token',
      SEC_USER_AGENT: 'PortfolioApp private@example.com',
    }),
    '/api/toss/stock-insights?symbol=AAPL&name=Apple&market=US',
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.result.news[0].title, 'Apple news');
  assert.equal(result.body.result.financialStatement, null);
  assert.match(result.body.result.financialStatementMessage, /SEC 접근/);
  assert.equal(JSON.stringify(result.body).includes('private'), false);
});
