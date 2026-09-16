import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadRecentStockSearches,
  saveRecentStockSearch,
} from '../src/utils/recentStockSearches.ts';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

test('recent stock searches place the latest unique item first and keep five items', () => {
  const memory = storage();
  for (let index = 0; index < 6; index += 1) {
    saveRecentStockSearch(
      { symbol: `T${index}`, name: `Stock ${index}`, market: 'NASDAQ' },
      memory,
    );
  }
  saveRecentStockSearch({ symbol: 'T2', name: 'Stock 2', market: 'NASDAQ' }, memory);
  const items = loadRecentStockSearches(memory);
  assert.equal(items.length, 5);
  assert.equal(items[0].symbol, 'T2');
  assert.equal(items.at(-1)?.symbol, 'T1');
});

test('invalid recent search storage is ignored safely', () => {
  const memory = storage();
  memory.setItem('recent-stock-searches-v1', '{invalid json');
  assert.deepEqual(loadRecentStockSearches(memory), []);
});
