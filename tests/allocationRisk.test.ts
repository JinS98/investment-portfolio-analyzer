import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Holding, RecurringInvestmentRule } from '../src/types/portfolio.ts';
import { calculateProjectedAllocation } from '../src/utils/allocationRisk.ts';

const holdings: Holding[] = [
  { portfolioId: 'p', ticker: 'A', name: 'A', market: 'KR', quantity: 8, averagePrice: 100, investedAmount: 800 },
  { portfolioId: 'p', ticker: 'B', name: 'B', market: 'KR', quantity: 2, averagePrice: 100, investedAmount: 200 },
];
const rule: RecurringInvestmentRule = {
  id: 'r', portfolioId: 'p', portfolioType: 'REAL', ticker: 'B', name: 'B', market: 'KR', quantity: 2,
  frequency: 'WEEKLY', weeklyDay: 1, startDate: '2026-09-01', status: 'ACTIVE', createdAt: 1, updatedAt: 1,
};

test('adds the next recurring purchase to projected weights', () => {
  const result = calculateProjectedAllocation(holdings, [rule], { A: 100, B: 100 }, null);
  assert.equal(result.positions.find((item) => item.ticker === 'B')?.currentWeight, 20);
  assert.ok(Math.abs((result.positions.find((item) => item.ticker === 'B')?.projectedWeight ?? 0) - 100 / 3) < 0.000001);
});

test('quantity override previews a changed recurring rule without saving it', () => {
  const result = calculateProjectedAllocation(holdings, [rule], { A: 100, B: 100 }, null, { r: 8 });
  assert.equal(result.positions.find((item) => item.ticker === 'B')?.projectedWeight, 1000 / 18);
});

test('reports stock, country and currency concentration warnings', () => {
  const result = calculateProjectedAllocation(holdings, [], { A: 100, B: 100 }, null);
  assert.ok(result.warnings.some((warning) => warning.type === 'STOCK'));
  assert.ok(result.warnings.some((warning) => warning.type === 'COUNTRY'));
  assert.ok(result.warnings.some((warning) => warning.type === 'CURRENCY'));
});

test('previews a recurring purchase for a holding without a saved rule', () => {
  const result = calculateProjectedAllocation(holdings, [], { A: 100, B: 100 }, null, {}, {
    ticker: 'A', name: 'A', market: 'KR', quantity: 2,
  });
  assert.equal(result.positions.find((item) => item.ticker === 'A')?.scheduledValue, 200);
});
