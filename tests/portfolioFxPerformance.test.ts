import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Holding, HoldingHistory } from '../src/types/index.ts';
import {
  calculatePortfolioFxPerformance,
  calculateRealizedKrwPnL,
  calculateRealizedKrwPnLBreakdown,
} from '../src/utils/portfolioFxPerformance.ts';

const usBuy = (
  id: string,
  price: number,
  quantity: number,
  exchangeRate: number,
): HoldingHistory => ({
  id,
  portfolioId: 'virtual',
  portfolioType: 'VIRTUAL',
  ticker: 'AAPL',
  market: 'US',
  type: 'BUY',
  price,
  quantity,
  grossAmount: price * quantity,
  fee: 0,
  tax: 0,
  realizedPnL: 0,
  date: '2026-09-01',
  exchangeRate,
  exchangeRateDate: '2026-09-01',
  createdAt: Number(id.slice(-1)),
});

test('KRW performance separates stock gains from foreign-exchange gains', () => {
  const histories = [usBuy('buy-1', 100, 10, 1300)];
  const holdings: Holding[] = [
    {
      portfolioId: 'virtual',
      ticker: 'AAPL',
      market: 'US',
      quantity: 10,
      averagePrice: 100,
      investedAmount: 1000,
    },
  ];
  const result = calculatePortfolioFxPerformance(holdings, histories, { AAPL: 110 }, 1400);
  assert.equal(result.usd?.profitAmount, 100);
  assert.equal(result.usd?.profitRate, 10);
  assert.equal(result.krw?.stockProfitAmount, 140000);
  assert.equal(result.krw?.foreignExchangeProfitAmount, 100000);
  assert.equal(result.krw?.profitAmount, 240000);
  assert.equal(result.krw?.profitRate, 18.461538461538463);
});

test('realized KRW PnL uses the exchange rate on the sale date', () => {
  const buy = usBuy('buy-1', 100, 10, 1300);
  const sale: HoldingHistory = {
    ...buy,
    id: 'sell-2',
    type: 'SELL',
    price: 110,
    quantity: 10,
    grossAmount: 1100,
    exchangeRate: 1400,
    exchangeRateDate: '2026-09-02',
    date: '2026-09-02',
    createdAt: 2,
  };
  assert.equal(calculateRealizedKrwPnL([buy, sale]), 240000);
});

test('KRW performance waits for historical rates while USD performance remains available', () => {
  const history = { ...usBuy('buy-1', 100, 10, 1300), exchangeRate: undefined };
  const holdings: Holding[] = [
    {
      portfolioId: 'virtual',
      ticker: 'AAPL',
      market: 'US',
      quantity: 10,
      averagePrice: 100,
      investedAmount: 1000,
    },
  ];
  const result = calculatePortfolioFxPerformance(holdings, [history], { AAPL: 110 }, 1400);
  assert.equal(result.krw, null);
  assert.equal(result.usd?.profitRate, 10);
});

test('additional buys and a partial sale preserve separate stock and FX performance', () => {
  const firstBuy = usBuy('buy-1', 100, 10, 1300);
  const secondBuy = {
    ...usBuy('buy-2', 120, 10, 1400),
    date: '2026-09-02',
    exchangeRateDate: '2026-09-02',
    createdAt: 2,
  };
  const partialSale: HoldingHistory = {
    ...usBuy('sell-3', 130, 5, 1500),
    type: 'SELL',
    fee: 5,
    date: '2026-09-03',
    exchangeRateDate: '2026-09-03',
    createdAt: 3,
  };
  const holdings: Holding[] = [
    {
      portfolioId: 'virtual',
      ticker: 'AAPL',
      market: 'US',
      quantity: 15,
      averagePrice: 110,
      investedAmount: 1650,
    },
  ];
  const histories = [firstBuy, secondBuy, partialSale];
  const performance = calculatePortfolioFxPerformance(holdings, histories, { AAPL: 125 }, 1450);
  const realized = calculateRealizedKrwPnLBreakdown(histories);

  assert.equal(realized?.profitAmount, 222500);
  assert.equal(realized?.stockProfitAmount, 142500);
  assert.equal(realized?.foreignExchangeProfitAmount, 80000);
  assert.equal(performance.krw?.profitAmount, 483750);
  assert.equal(performance.krw?.stockProfitAmount, 326250);
  assert.equal(performance.krw?.foreignExchangeProfitAmount, 157500);
});
