import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExpiringRequestCache } from '../src/utils/expiringRequestCache.ts';

test('expiring request cache shares pending work and returns a cached value', async () => {
  const cache = createExpiringRequestCache<number>();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return 42;
  };

  const [first, second] = await Promise.all([
    cache.getOrLoad('quote:AAPL', 10_000, load),
    cache.getOrLoad('quote:AAPL', 10_000, load),
  ]);
  const cached = await cache.getOrLoad('quote:AAPL', 10_000, load);

  assert.equal(first, 42);
  assert.equal(second, 42);
  assert.equal(cached, 42);
  assert.equal(calls, 1);
});

test('failed requests are not cached', async () => {
  const cache = createExpiringRequestCache<number>();
  let calls = 0;
  await assert.rejects(() =>
    cache.getOrLoad('rate:USD/KRW', 10_000, async () => {
      calls += 1;
      throw new Error('temporary failure');
    }),
  );
  const value = await cache.getOrLoad('rate:USD/KRW', 10_000, async () => {
    calls += 1;
    return 1370;
  });

  assert.equal(value, 1370);
  assert.equal(calls, 2);
});
