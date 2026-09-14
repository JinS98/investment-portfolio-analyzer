import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcDailyReturns, calcMDD, calcRisk, calcVolatility } from '../src/utils/riskCalc.ts';
import type { TossCandleItem } from '../src/types/index.ts';

const candles = (prices: number[]): TossCandleItem[] => prices.map((closePrice, index) => ({
  date: `2026-01-${String(index + 1).padStart(2, '0')}`,
  timestamp: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  openPrice: closePrice,
  highPrice: closePrice,
  lowPrice: closePrice,
  closePrice,
  volume: 0,
  currency: 'USD',
}));

test('daily returns and MDD use consecutive closing prices', () => {
  const data = candles([100, 120, 96]);

  assert.deepEqual(calcDailyReturns(data), [0.2, -0.2]);
  assert.equal(calcMDD(data), -20);
  assert.notEqual(calcVolatility(data), null);
});

test('risk data combines analyzable stocks and reports insufficient data', () => {
  const risk = calcRisk({
    AAPL: candles([100, 120, 96]),
    MSFT: candles([100, 110, 105]),
    NEW: candles([100]),
  }, { AAPL: 70, MSFT: 20, NEW: 10 });

  assert.equal(risk.mdd, -20);
  assert.equal(risk.concentration, 90);
  assert.equal(risk.maxWeight, 70);
  assert.deepEqual(risk.analyzedTickers, ['AAPL', 'MSFT']);
  assert.deepEqual(risk.insufficientTickers, ['NEW']);
  assert.equal(risk.stocks.find((stock) => stock.ticker === 'NEW')?.volatility, null);
  assert.ok(risk.volatility !== null && risk.volatility > 0);
});
