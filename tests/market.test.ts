import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStocks, parseQuotes, parseCandles } from '../src/services/marketParser.ts';

test('prices preserve currency and nullable timestamp, decimal strings become numbers', () => {
  assert.deepEqual(
    parseQuotes([{ symbol: 'AAPL', lastPrice: '185.70', currency: 'USD', timestamp: null }]),
    [{ symbol: 'AAPL', price: 185.7, currency: 'USD', timestamp: null }],
  );
  assert.throws(() => parseQuotes([{ symbol: 'AAPL', lastPrice: '', currency: 'USD' }]));
  assert.throws(() => parseQuotes(undefined));
});
test('stock symbols preserve leading zeros', () => {
  assert.equal(
    parseStocks([
      {
        symbol: '005930',
        name: '삼성전자',
        englishName: 'Samsung',
        market: 'KOSPI',
        currency: 'KRW',
      },
    ])[0].symbol,
    '005930',
  );
});
test('candles sort oldest first while preserving exchange date and pagination', () => {
  const candle = (date: string) => ({
    timestamp: date + 'T00:00:00+09:00',
    openPrice: '10',
    highPrice: '12',
    lowPrice: '9',
    closePrice: '11',
    volume: '100',
    currency: 'KRW',
  });
  const page = parseCandles({
    candles: [candle('2026-03-25'), candle('2026-03-24')],
    nextBefore: '2026-03-24T00:00:00+09:00',
  });
  assert.deepEqual(
    page.candles.map((item) => item.date),
    ['2026-03-24', '2026-03-25'],
  );
  assert.equal(page.candles[0].closePrice, 11);
  assert.equal(page.nextBefore, '2026-03-24T00:00:00+09:00');
  assert.deepEqual(parseCandles({ candles: [], nextBefore: null }), {
    candles: [],
    nextBefore: null,
  });
});
