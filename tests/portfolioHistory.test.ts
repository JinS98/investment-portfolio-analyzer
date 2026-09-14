import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcPortfolioHistory } from '../src/utils/portfolioHistory.ts';
import type { StockItem, TossCandleItem } from '../src/types/index.ts';

const candle = (date: string, closePrice: number, currency: 'KRW' | 'USD'): TossCandleItem => ({
  date, timestamp: `${date}T00:00:00Z`, openPrice: closePrice, highPrice: closePrice,
  lowPrice: closePrice, closePrice, volume: 0, currency,
});

test('portfolio history carries the latest close and converts US values to KRW', () => {
  const portfolio: StockItem[] = [
    { id: 'kr', ticker: '005930', name: '삼성전자', market: 'KR', buyPrice: 10, quantity: 2, addedAt: '' },
    { id: 'us', ticker: 'AAPL', name: '애플', market: 'US', buyPrice: 10, quantity: 1, addedAt: '' },
  ];
  const history = calcPortfolioHistory(portfolio, {
    '005930': [candle('2026-01-01', 10, 'KRW'), candle('2026-01-02', 12, 'KRW')],
    AAPL: [candle('2026-01-01', 10, 'USD'), candle('2026-01-03', 11, 'USD')],
  }, { baseCurrency: 'USD', quoteCurrency: 'KRW', rate: 1000, midRate: 1000, validFrom: '', validUntil: '' });

  assert.deepEqual(history.map((point) => point.value), [10020, 10024, 11024]);
  assert.equal(history[0].returnRate, 0);
  assert.ok(history[2].returnRate > 10);
});
