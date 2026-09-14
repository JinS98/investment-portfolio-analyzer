import type { ExchangeRate, StockItem, TossCandleItem } from '../types';

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  returnRate: number;
}

interface Position {
  ticker: string;
  quantity: number;
  market: StockItem['market'];
}

export const calcPortfolioHistory = (
  portfolio: StockItem[],
  historicalData: Record<string, TossCandleItem[]>,
  exchangeRate: ExchangeRate | null,
): PortfolioHistoryPoint[] => {
  const positions = Object.values(portfolio.reduce<Record<string, Position>>((result, stock) => {
    const current = result[stock.ticker];
    result[stock.ticker] = {
      ticker: stock.ticker,
      market: stock.market,
      quantity: (current?.quantity ?? 0) + stock.quantity,
    };
    return result;
  }, {})).filter((position) => historicalData[position.ticker]?.length);

  if (!positions.length) return [];

  const pricesByTicker = Object.fromEntries(positions.map((position) => [
    position.ticker,
    new Map(historicalData[position.ticker].map((candle) => [candle.date, candle.closePrice])),
  ]));
  const dates = [...new Set(positions.flatMap((position) => historicalData[position.ticker].map((candle) => candle.date)))].sort();
  const lastPrices: Record<string, number | null> = Object.fromEntries(positions.map((position) => [position.ticker, null]));
  const multiplier = (market: StockItem['market']) => market === 'US' ? exchangeRate?.rate ?? 0 : 1;
  const values: Array<{ date: string; value: number }> = [];

  for (const date of dates) {
    for (const position of positions) {
      const price = pricesByTicker[position.ticker].get(date);
      if (price !== undefined) lastPrices[position.ticker] = price;
    }
    if (positions.some((position) => lastPrices[position.ticker] === null)) continue;
    const value = positions.reduce((sum, position) => sum + lastPrices[position.ticker]! * position.quantity * multiplier(position.market), 0);
    values.push({ date, value });
  }

  const baseValue = values[0]?.value ?? 0;
  return values.map((point) => ({
    ...point,
    returnRate: baseValue > 0 ? (point.value - baseValue) / baseValue * 100 : 0,
  }));
};
