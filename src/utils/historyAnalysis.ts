import type { PortfolioHistory } from '../types';

export type HistoryRange = '1M' | '3M' | 'ALL';

export interface HistorySummary {
  startValue: number;
  endValue: number;
  changeAmount: number;
  changeRate: number;
  highestValue: number;
  lowestValue: number;
}

export const selectHistoryRange = (
  history: PortfolioHistory[],
  range: HistoryRange,
): PortfolioHistory[] => {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  if (range === 'ALL' || !sorted.length) return sorted;
  const latest = new Date(`${sorted.at(-1)!.date}T00:00:00`);
  latest.setMonth(latest.getMonth() - (range === '1M' ? 1 : 3));
  const cutoff = latest.toISOString().slice(0, 10);
  return sorted.filter((item) => item.date >= cutoff);
};

export const calcHistorySummary = (history: PortfolioHistory[]): HistorySummary | null => {
  if (!history.length) return null;
  const startValue = history[0].totalValue;
  const endValue = history.at(-1)!.totalValue;
  const values = history.map((item) => item.totalValue);
  const changeAmount = endValue - startValue;
  return {
    startValue,
    endValue,
    changeAmount,
    changeRate: startValue > 0 ? (changeAmount / startValue) * 100 : 0,
    highestValue: Math.max(...values),
    lowestValue: Math.min(...values),
  };
};
