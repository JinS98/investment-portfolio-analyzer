import type { PortfolioHistory } from '../types';

export interface MonthlyComparison {
  current: PortfolioHistory;
  previousMonthEnd: PortfolioHistory;
  changeAmount: number;
  changeRate: number;
  previousMonth: string;
}

const previousYearMonth = (yearMonth: string): string => {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const calcMonthlyComparison = (history: PortfolioHistory[]): MonthlyComparison | null => {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted.at(-1)!;
  const previousMonth = previousYearMonth(current.date.slice(0, 7));
  const previousMonthRecords = sorted.filter((item) => item.date.startsWith(previousMonth));
  const previousMonthEnd = previousMonthRecords.at(-1);
  if (!previousMonthEnd) return null;
  const changeAmount = current.totalValue - previousMonthEnd.totalValue;
  return {
    current,
    previousMonthEnd,
    changeAmount,
    changeRate:
      previousMonthEnd.totalValue > 0 ? (changeAmount / previousMonthEnd.totalValue) * 100 : 0,
    previousMonth,
  };
};
