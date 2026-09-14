import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStockSearch } from '../server/stockSearch.ts';

const items = [
  { symbol: '005935', name: '삼성전자우', market: 'KOSPI' },
  { symbol: '005930', name: '삼성전자', market: 'KOSPI' },
  { symbol: 'AAPL', name: '애플', market: 'NASDAQ' },
];
test('concurrent cold searches share one load; names, whitespace and lowercase codes match', async () => {
  let calls = 0;
  const search = createStockSearch(async () => {
    calls++;
    return items;
  });
  const [samsung, apple] = await Promise.all([search('삼성 전자'), search('aapl')]);
  assert.equal(calls, 1);
  assert.equal(samsung[0].symbol, '005930');
  assert.equal(apple[0].name, '애플');
  assert.equal((await search('애플'))[0].symbol, 'AAPL');
  await search('aapl');
  assert.equal(calls, 1);
  assert.deepEqual(await search('없는종목'), []);
});
test('empty queries do not load and large result sets are bounded', async () => {
  let calls = 0;
  const search = createStockSearch(async () => {
    calls++;
    return Array.from({ length: 10000 }, (_, i) => ({
      symbol: `S${i}`,
      name: `종목${i}`,
      market: 'NASDAQ',
    }));
  });
  assert.deepEqual(await search('  '), []);
  assert.equal(calls, 0);
  assert.equal((await search('종목')).length, 20);
});
test('expired cache serves stale data during refresh and recovers after failure backoff', async () => {
  let now = 0,
    calls = 0;
  const search = createStockSearch(
    async () => {
      calls++;
      if (calls === 2) throw new Error('offline');
      return items;
    },
    () => now,
  );
  await search('애플');
  now = 86400001;
  assert.equal((await search('애플'))[0].symbol, 'AAPL');
  await new Promise((resolve) => setImmediate(resolve));
  await search('삼성');
  assert.equal(calls, 2);
  now += 60001;
  await search('삼성');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 3);
});
