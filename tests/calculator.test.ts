import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcPortfolio } from '../src/utils/calculator.ts';
const stock = {
  id: 'a',
  ticker: 'AAPL',
  market: 'US',
  name: '??',
  buyPrice: 100,
  quantity: 2,
  addedAt: '2026-01-01',
};
test('portfolio calculates value, profit and weight from a current price', () => {
  const r = calcPortfolio([stock], { AAPL: 125 });
  assert.equal(r.stocks[0].evaluatedValue, 250);
  assert.equal(r.stocks[0].profitAmount, 50);
  assert.equal(r.stocks[0].profitRate, 25);
  assert.equal(r.stocks[0].weight, 100);
});
test('a missing quote retains purchase price only for calculation continuity', () => {
  const r = calcPortfolio([stock], {});
  assert.equal(r.stocks[0].currentPrice, 100);
  assert.equal(r.totalProfitAmount, 0);
});
