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

export const normalizePortfolioHistory = (history: PortfolioHistory[]): PortfolioHistory[] => {
  const latestByDate = new Map<string, PortfolioHistory>();

  history.forEach((item) => {
    const current = latestByDate.get(item.date);
    if (!current || item.savedAt.localeCompare(current.savedAt) > 0) {
      latestByDate.set(item.date, item);
    }
  });

  return [...latestByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
};

export const selectHistoryRange = (
  history: PortfolioHistory[],
  range: HistoryRange,
): PortfolioHistory[] => {
  const sorted = normalizePortfolioHistory(history);
  if (range === 'ALL' || !sorted.length) return sorted;
  const latest = new Date(`${sorted.at(-1)!.date}T00:00:00`);
  latest.setMonth(latest.getMonth() - (range === '1M' ? 1 : 3));
  const cutoff = latest.toISOString().slice(0, 10);
  return sorted.filter((item) => item.date >= cutoff);
};

export const calcHistoryChartDomain = (
  history: PortfolioHistory[],
): [number, number] | undefined => {
  if (!history.length) return undefined;

  const values = history.map((item) => item.totalValue);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const padding =
    range > 0 ? Math.max(range * 0.25, maximum * 0.0005) : Math.max(maximum * 0.005, 1);

  return [Math.max(0, minimum - padding), maximum + padding];
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
