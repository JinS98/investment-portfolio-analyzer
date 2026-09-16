import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recalculatePortfolio } from '../src/utils/calculator.ts';
import type { HoldingHistory, Portfolio } from '../src/types/index.ts';

const portfolio: Portfolio = {
  id: 'virtual',
  userId: 'user-1',
  name: 'Virtual portfolio',
  type: 'VIRTUAL',
  createdAt: 1,
  updatedAt: 1,
};

test('ledger calculations retain transaction-date exchange-rate metadata', () => {
  const history: HoldingHistory = {
    id: 'us-buy-1',
    portfolioId: portfolio.id,
    portfolioType: portfolio.type,
    ticker: 'AAPL',
    name: 'Apple',
    market: 'US',
    type: 'BUY',
    price: 200,
    quantity: 10,
    grossAmount: 2000,
    fee: 1,
    tax: 0,
    realizedPnL: 0,
    date: '2026-09-13',
    exchangeRate: 1372.4,
    exchangeRateDate: '2026-09-11',
    exchangeRateSource: 'Frankfurter daily reference rate',
    createdAt: 1,
  };
  const result = recalculatePortfolio(portfolio, [history]);
  assert.equal(result.histories[0].exchangeRate, 1372.4);
  assert.equal(result.histories[0].exchangeRateDate, '2026-09-11');
  assert.equal(result.holdings[0].ticker, 'AAPL');
});
