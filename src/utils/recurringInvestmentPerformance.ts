import type { HoldingHistory } from '../types';

export interface InvestmentPerformance {
  buyCount: number;
  purchasedQuantity: number;
  holdingQuantity: number;
  investedAmount: number;
  evaluatedAmount: number | null;
  profitAmount: number | null;
  profitRate: number | null;
}

export interface MonthlyPurchaseTrend {
  month: string;
  count: number;
  quantity: number;
  amount: number;
}

const buyCost = (history: HoldingHistory) => history.grossAmount + history.fee + history.tax;
const sellProceeds = (history: HoldingHistory) => history.grossAmount - history.fee - history.tax;

export function calculateInvestmentPerformance(
  histories: HoldingHistory[],
  currentPrice?: number,
): InvestmentPerformance {
  const buys = histories.filter((history) => history.type === 'BUY');
  const sells = histories.filter((history) => history.type === 'SELL');
  const investedAmount = buys.reduce((sum, history) => sum + buyCost(history), 0);
  const soldAmount = sells.reduce((sum, history) => sum + sellProceeds(history), 0);
  const purchasedQuantity = buys.reduce((sum, history) => sum + history.quantity, 0);
  const soldQuantity = sells.reduce((sum, history) => sum + history.quantity, 0);
  const holdingQuantity = Math.max(0, purchasedQuantity - soldQuantity);
  const hasCurrentPrice = typeof currentPrice === 'number' && currentPrice > 0;
  const evaluatedAmount = hasCurrentPrice ? holdingQuantity * currentPrice : null;
  const profitAmount = evaluatedAmount === null ? null : evaluatedAmount + soldAmount - investedAmount;
  const profitRate = profitAmount === null || investedAmount <= 0 ? null : (profitAmount / investedAmount) * 100;

  return {
    buyCount: buys.length,
    purchasedQuantity,
    holdingQuantity,
    investedAmount,
    evaluatedAmount,
    profitAmount,
    profitRate,
  };
}

export function buildMonthlyPurchaseTrend(histories: HoldingHistory[]): MonthlyPurchaseTrend[] {
  const grouped = new Map<string, MonthlyPurchaseTrend>();

  histories
    .filter((history) => history.type === 'BUY')
    .forEach((history) => {
      const month = history.date.slice(0, 7);
      const current = grouped.get(month) ?? { month, count: 0, quantity: 0, amount: 0 };
      current.count += 1;
      current.quantity += history.quantity;
      current.amount += buyCost(history);
      grouped.set(month, current);
    });

  return [...grouped.values()].sort((left, right) => left.month.localeCompare(right.month));
}
