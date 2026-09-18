import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMaxDrawdown, calculatePerformanceMetrics, calculateTimeWeightedPerformance, commonStartDate, normalizePerformance, selectPerformanceRange } from '../src/utils/investmentPerformanceAnalysis.ts';

test('normalizes each performance series from zero percent', () => {
  assert.deepEqual(normalizePerformance([{ date: '2026-01-01', value: 100 }, { date: '2026-01-02', value: 110 }]).map((point) => point.returnRate), [0, 10]);
});

test('calculates high, low and maximum drawdown for a selected range', () => {
  assert.deepEqual(calculatePerformanceMetrics([{ date: '2026-01-01', value: 100 }, { date: '2026-01-02', value: 120 }, { date: '2026-01-03', value: 90 }, { date: '2026-01-04', value: 105 }]), { highestValue: 120, lowestValue: 90, maxDrawdown: -25 });
});

test('selects six months relative to the latest point', () => {
  const result = selectPerformanceRange([{ date: '2026-01-01', value: 1 }, { date: '2026-03-31', value: 2 }, { date: '2026-09-30', value: 3 }], '6M');
  assert.deepEqual(result.map((point) => point.date), ['2026-03-31', '2026-09-30']);
});

test('uses the latest series start as the fair comparison start', () => {
  assert.equal(commonStartDate([[{ date: '2026-01-01', value: 1 }], [{ date: '2026-02-01', value: 1 }], [{ date: '2026-01-15', value: 1 }]]), '2026-02-01');
});

test('time weighted return removes additional purchase cash flows', () => {
  const result = calculateTimeWeightedPerformance([
    { date: '2026-09-01', value: 100 },
    { date: '2026-09-02', value: 200 },
    { date: '2026-09-03', value: 220 },
  ], [{ date: '2026-09-02', amount: 100 }]);
  assert.deepEqual(result.map((point) => point.returnRate), [0, 0, 10.000000000000009]);
});

test('maximum drawdown uses the cash-flow-adjusted performance index', () => {
  assert.equal(calculateMaxDrawdown([
    { date: '2026-09-01', value: 100, returnRate: 0 },
    { date: '2026-09-02', value: 120, returnRate: 20 },
    { date: '2026-09-03', value: 90, returnRate: -10 },
  ]), -25);
});

test('handles long histories and multiple cash flows on the same day', () => {
  const points = Array.from({ length: 2000 }, (_, index) => ({
    date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
    value: 1000 + index * 10,
  }));
  const cashFlows = points.slice(1).flatMap((point) => [
    { date: point.date, amount: 6 },
    { date: point.date, amount: 4 },
  ]);
  const result = calculateTimeWeightedPerformance(points, cashFlows);
  assert.equal(result.length, 2000);
  assert.ok(Math.abs(result.at(-1)!.returnRate) < 0.000001);
});
