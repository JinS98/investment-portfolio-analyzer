import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcHistoryChartDomain,
  calcHistorySummary,
  normalizePortfolioHistory,
  selectHistoryRange,
} from '../src/utils/historyAnalysis.ts';
import type { PortfolioHistory } from '../src/types/index.ts';

const history = (date: string, totalValue: number): PortfolioHistory => ({
  id: date,
  userId: 'user',
  date,
  totalBuyValue: 1000,
  totalValue,
  totalProfitAmount: totalValue - 1000,
  totalProfitRate: (totalValue - 1000) / 10,
  exchangeRate: 1300,
  savedAt: '',
});

test('history summary calculates period change and high-low values', () => {
  const summary = calcHistorySummary([
    history('2026-09-01', 1000),
    history('2026-09-02', 1200),
    history('2026-09-03', 900),
  ]);

  assert.deepEqual(summary, {
    startValue: 1000,
    endValue: 900,
    changeAmount: -100,
    changeRate: -10,
    highestValue: 1200,
    lowestValue: 900,
  });
});

test('history range keeps only snapshots within the selected recent period', () => {
  const selected = selectHistoryRange(
    [history('2026-05-01', 1000), history('2026-08-20', 1100), history('2026-09-14', 1200)],
    '1M',
  );

  assert.deepEqual(
    selected.map((item) => item.date),
    ['2026-08-20', '2026-09-14'],
  );
});

test('history normalization keeps the latest saved snapshot for each date', () => {
  const normalized = normalizePortfolioHistory([
    { ...history('2026-09-14', 1000), savedAt: '2026-09-14T09:00:00.000Z' },
    { ...history('2026-09-14', 1200), savedAt: '2026-09-14T10:00:00.000Z' },
    { ...history('2026-09-13', 900), savedAt: '2026-09-13T10:00:00.000Z' },
  ]);

  assert.deepEqual(
    normalized.map((item) => [item.date, item.totalValue]),
    [
      ['2026-09-13', 900],
      ['2026-09-14', 1200],
    ],
  );
});

test('history chart domain pads a narrow value range so daily movement remains visible', () => {
  assert.deepEqual(
    calcHistoryChartDomain([
      history('2026-09-14', 160_435_017),
      history('2026-09-15', 160_235_308),
    ]),
    [160_155_090.4915, 160_515_234.5085],
  );
});
