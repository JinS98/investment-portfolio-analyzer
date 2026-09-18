import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HoldingHistory } from '../src/types/portfolio.ts';
import { buildMonthlyPurchaseTrend, calculateInvestmentPerformance } from '../src/utils/recurringInvestmentPerformance.ts';

const history = (overrides: Partial<HoldingHistory>): HoldingHistory => ({
  id: 'history', portfolioId: 'portfolio', portfolioType: 'REAL', ticker: 'QLD', market: 'US',
  type: 'BUY', price: 100, quantity: 1, grossAmount: 100, fee: 1, tax: 0,
  realizedPnL: 0, date: '2026-09-01', createdAt: 1, ...overrides,
});

test('calculates recurring investment performance including trading costs', () => {
  const result = calculateInvestmentPerformance([
    history({ id: 'one', price: 100, grossAmount: 100, fee: 1 }),
    history({ id: 'two', price: 120, grossAmount: 120, fee: 1 }),
  ], 130);
  assert.equal(result.investedAmount, 222);
  assert.equal(result.evaluatedAmount, 260);
  assert.equal(result.profitAmount, 38);
  assert.equal(result.profitRate, (38 / 222) * 100);
});

test('includes sale proceeds and remaining quantity in total performance', () => {
  const result = calculateInvestmentPerformance([
    history({ id: 'buy', quantity: 2, grossAmount: 200 }),
    history({ id: 'sell', type: 'SELL', quantity: 1, grossAmount: 130, fee: 1 }),
  ], 140);
  assert.equal(result.holdingQuantity, 1);
  assert.equal(result.profitAmount, 68);
});

test('groups automatic purchases by month in chronological order', () => {
  const result = buildMonthlyPurchaseTrend([
    history({ id: 'sep', date: '2026-09-07', quantity: 2, grossAmount: 200 }),
    history({ id: 'aug', date: '2026-08-03', quantity: 1, grossAmount: 90, fee: 0.5 }),
    history({ id: 'sep2', date: '2026-09-14', quantity: 1, grossAmount: 110 }),
  ]);
  assert.deepEqual(result.map((item) => item.month), ['2026-08', '2026-09']);
  assert.equal(result[1]?.quantity, 3);
  assert.equal(result[1]?.amount, 312);
});
