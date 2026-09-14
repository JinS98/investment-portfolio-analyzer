import type { ExchangeRate, PortfolioHistory, PriceMap, StockItem } from '../types';

export type DailyPortfolioSnapshot = Omit<PortfolioHistory, 'id' | 'userId' | 'savedAt'>;

const koreaDate = (now: Date): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const calcDailyPortfolioSnapshot = (
  portfolio: StockItem[],
  prices: PriceMap,
  exchangeRate: ExchangeRate | null,
  now = new Date(),
): DailyPortfolioSnapshot | null => {
  if (!portfolio.length) return null;
  const hasUsStock = portfolio.some((stock) => stock.market === 'US');
  if (hasUsStock && !exchangeRate) return null;

  const totals = portfolio.reduce(
    (result, stock) => {
      const multiplier = stock.market === 'US' ? exchangeRate!.rate : 1;
      const currentPrice = prices[stock.ticker] ?? stock.buyPrice;
      result.buy += stock.buyPrice * stock.quantity * multiplier;
      result.value += currentPrice * stock.quantity * multiplier;
      return result;
    },
    { buy: 0, value: 0 },
  );
  const totalProfitAmount = totals.value - totals.buy;

  return {
    date: koreaDate(now),
    totalBuyValue: Math.round(totals.buy),
    totalValue: Math.round(totals.value),
    totalProfitAmount: Math.round(totalProfitAmount),
    totalProfitRate:
      totals.buy > 0 ? Math.round((totalProfitAmount / totals.buy) * 10000) / 100 : 0,
    exchangeRate: exchangeRate?.rate ?? null,
  };
};
