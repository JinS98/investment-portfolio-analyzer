import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Holding, HoldingHistory } from '../src/types/portfolio.ts';
import { holdingKrwCost } from '../src/features/portfolio-management/model/holdingKrwCost.ts';
import { calculateInvestmentPerformance } from '../src/utils/recurringInvestmentPerformance.ts';

const holding: Holding = {
  portfolioId: 'portfolio',
  ticker: 'QLD',
  market: 'US',
  quantity: 2,
  averagePrice: 110,
  investedAmount: 220,
};
const buy = (id: string, price: number, exchangeRate: number): HoldingHistory => ({
  id,
  portfolioId: 'portfolio',
  portfolioType: 'REAL',
  ticker: 'QLD',
  market: 'US',
  type: 'BUY',
  price,
  quantity: 1,
  grossAmount: price,
  fee: 1,
  tax: 0,
  realizedPnL: 0,
  date: `2026-09-0${id}`,
  createdAt: Number(id),
  exchangeRate,
  source: 'RECURRING',
  recurringRuleId: 'rule',
});

test('KRW holding return matches recurring return when the holding contains only that rule', () => {
  const histories = [buy('1', 100, 1400), buy('2', 120, 1300)];
  const cost = holdingKrwCost(holding, histories);
  const currentValue = 130 * 2 * 1350;
  const recurring = calculateInvestmentPerformance(
    histories.map((history) => ({
      ...history,
      grossAmount: history.grossAmount * history.exchangeRate!,
      fee: history.fee * history.exchangeRate!,
      tax: history.tax * history.exchangeRate!,
    })),
    130 * 1350,
  );
  assert.equal(cost, recurring.investedAmount);
  assert.equal(currentValue - cost!, recurring.profitAmount);
  assert.equal(((currentValue - cost!) / cost!) * 100, recurring.profitRate);
});
