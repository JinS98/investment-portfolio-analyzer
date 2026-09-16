import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCalendarDate,
  parseHistoricalExchangeRate,
} from '../src/utils/historicalExchangeRate.ts';

test('calendar date validation rejects impossible transaction dates', () => {
  assert.equal(isCalendarDate('2026-09-15'), true);
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(isCalendarDate('2026/09/15'), false);
});

test('historical rate preserves requested and resolved business dates', () => {
  assert.deepEqual(
    parseHistoricalExchangeRate({
      baseCurrency: 'USD',
      quoteCurrency: 'KRW',
      requestedDate: '2026-09-13',
      resolvedDate: '2026-09-11',
      rate: 1372.4,
      source: 'Frankfurter daily reference rate',
    }),
    {
      baseCurrency: 'USD',
      quoteCurrency: 'KRW',
      requestedDate: '2026-09-13',
      resolvedDate: '2026-09-11',
      rate: 1372.4,
      source: 'Frankfurter daily reference rate',
    },
  );
});

test('historical rate rejects missing or invalid values', () => {
  assert.throws(() => parseHistoricalExchangeRate({ rate: 0 }));
  assert.throws(() =>
    parseHistoricalExchangeRate({
      baseCurrency: 'USD',
      quoteCurrency: 'KRW',
      requestedDate: '2026-02-29',
      resolvedDate: '2026-02-28',
      rate: 1372.4,
      source: 'reference',
    }),
  );
});
