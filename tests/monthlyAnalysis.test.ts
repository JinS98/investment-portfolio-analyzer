import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcMonthlyComparison } from '../src/utils/monthlyAnalysis.ts';
import type { PortfolioHistory } from '../src/types/index.ts';

const history = (date: string, totalValue: number): PortfolioHistory => ({
  id: date,
  userId: 'user',
  date,
  totalBuyValue: 1000,
  totalValue,
  totalProfitAmount: totalValue - 1000,
  totalProfitRate: 0,
  exchangeRate: 1300,
  savedAt: '',
});

test('monthly comparison uses the final saved value from the preceding month', () => {
  const comparison = calcMonthlyComparison([
    history('2026-08-28', 900),
    history('2026-08-31', 1000),
    history('2026-09-14', 1200),
  ]);

  assert.equal(comparison?.previousMonthEnd.date, '2026-08-31');
  assert.equal(comparison?.changeAmount, 200);
  assert.equal(comparison?.changeRate, 20);
});

test('monthly comparison waits until a preceding month record exists', () => {
  assert.equal(calcMonthlyComparison([history('2026-09-14', 1200)]), null);
});
