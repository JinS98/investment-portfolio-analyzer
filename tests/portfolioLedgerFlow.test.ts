import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recalculatePortfolio } from '../src/utils/calculator.ts';
import type { HoldingHistory, HoldingHistoryInput, Portfolio } from '../src/types/index.ts';

const portfolio: Portfolio = {
  id: 'real-portfolio',
  userId: 'user-1',
  name: 'Real portfolio',
  type: 'REAL',
  createdAt: 1,
  updatedAt: 1,
};

const transaction = (
  id: string,
  createdAt: number,
  input: HoldingHistoryInput,
): HoldingHistory => ({
  id,
  ...input,
  grossAmount: 0,
  fee: input.fee ?? 0,
  tax: input.tax ?? 0,
  realizedPnL: 0,
  createdAt,
});

const buy = (id: string, createdAt: number, input: Partial<HoldingHistoryInput> = {}) =>
  transaction(id, createdAt, {
    portfolioId: 'real-portfolio',
    portfolioType: 'REAL',
    ticker: '005930',
    name: 'Samsung Electronics',
    market: 'KR',
    type: 'BUY',
    price: 10_000,
    quantity: 10,
    date: '2026-09-01',
    ...input,
  });

const sell = (id: string, createdAt: number, input: Partial<HoldingHistoryInput> = {}) =>
  transaction(id, createdAt, {
    portfolioId: 'real-portfolio',
    portfolioType: 'REAL',
    ticker: '005930',
    name: 'Samsung Electronics',
    market: 'KR',
    type: 'SELL',
    price: 15_000,
    quantity: 8,
    date: '2026-09-03',
    ...input,
  });

test('a full real-portfolio ledger flow preserves moving average and nets sale costs', () => {
  const firstBuy = buy('buy-1', 1, { fee: 100 });
  const secondBuy = buy('buy-2', 2, {
    price: 12_000,
    fee: 200,
    date: '2026-09-02',
  });
  const partialSale = sell('sell-1', 3, { fee: 100, tax: 200 });
  const fullSale = sell('sell-2', 4, {
    price: 9_000,
    quantity: 12,
    fee: 200,
    tax: 300,
    date: '2026-09-04',
  });

  const afterPartialSale = recalculatePortfolio(portfolio, [firstBuy, secondBuy, partialSale]);
  assert.deepEqual(
    afterPartialSale.holdings.map((holding) => ({
      quantity: holding.quantity,
      averagePrice: holding.averagePrice,
      investedAmount: holding.investedAmount,
    })),
    [{ quantity: 12, averagePrice: 11_000, investedAmount: 132_000 }],
  );
  assert.equal(afterPartialSale.histories.at(-1)?.realizedPnL, 31_700);

  const afterFullSale = recalculatePortfolio(portfolio, [
    firstBuy,
    secondBuy,
    partialSale,
    fullSale,
  ]);
  assert.deepEqual(afterFullSale.holdings, []);
  assert.equal(afterFullSale.histories.at(-1)?.realizedPnL, -24_500);
  assert.equal(afterFullSale.summary.byMarket.KR?.realizedPnL, 7_200);
  assert.equal(afterFullSale.summary.byMarket.KR?.totalFees, 600);
  assert.equal(afterFullSale.summary.byMarket.KR?.totalTaxes, 500);
});
