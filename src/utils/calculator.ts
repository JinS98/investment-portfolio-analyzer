import type { StockItem, PriceMap, ComputedData, ComputedStock } from '../types';

export const calcPortfolio = (
  portfolio: StockItem[],
  prices: PriceMap,
): ComputedData => {
  let totalBuyValue = 0;
  let totalEvaluatedValue = 0;

  const stocks: Omit<ComputedStock, 'weight'>[] = portfolio.map((stock) => {
    const currentPrice = prices[stock.ticker] ?? stock.buyPrice;
    const evaluatedValue = currentPrice * stock.quantity;
    const buyValue = stock.buyPrice * stock.quantity;
    const profitAmount = evaluatedValue - buyValue;
    const profitRate = buyValue > 0 ? (profitAmount / buyValue) * 100 : 0;

    totalBuyValue += buyValue;
    totalEvaluatedValue += evaluatedValue;

    return { ...stock, currentPrice, evaluatedValue, profitAmount, profitRate, weight: 0 };
  });

  const totalProfitAmount = totalEvaluatedValue - totalBuyValue;
  const totalProfitRate =
    totalBuyValue > 0 ? (totalProfitAmount / totalBuyValue) * 100 : 0;

  const stocksWithWeight: ComputedStock[] = stocks.map((s) => ({
    ...s,
    weight:
      totalEvaluatedValue > 0 ? (s.evaluatedValue / totalEvaluatedValue) * 100 : 0,
  }));

  return {
    stocks: stocksWithWeight,
    totalBuyValue,
    totalEvaluatedValue,
    totalProfitAmount,
    totalProfitRate,
  };
};

export const round = (n: number, digits = 2): number =>
  Math.round(n * 10 ** digits) / 10 ** digits;

export const formatRate = (n: number): string =>
  `${n >= 0 ? '+' : ''}${round(n)}%`;
