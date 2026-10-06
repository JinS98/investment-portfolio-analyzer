import { useCallback } from 'react';
import { fetchCandles } from '../services/tossApi';
import { usePortfolioStore } from '../store/portfolioStore';
import type { ExchangeRate, Holding, PriceMap, StockItem } from '../types';
import { calcRisk } from '../utils/riskCalc';

interface HistoricalRiskParams {
  snapshotPositions: Array<Holding | StockItem>;
  prices: PriceMap;
  exchangeRate: ExchangeRate | null;
}

export function usePortfolioHistoricalRisk({
  snapshotPositions,
  prices,
  exchangeRate,
}: HistoricalRiskParams) {
  const setHistoricalData = usePortfolioStore((state) => state.setHistoricalData);
  const setRiskData = usePortfolioStore((state) => state.setRiskData);

  const loadHistoricalData = useCallback(
    async (days = 90) => {
      if (!snapshotPositions.length) {
        setHistoricalData({});
        setRiskData(null);
        return null;
      }

      const result: Record<string, Awaited<ReturnType<typeof fetchCandles>>> = {};
      const tickers = [...new Set(snapshotPositions.map((stock) => stock.ticker))];
      const failures: string[] = [];
      for (let index = 0; index < tickers.length; index += 4) {
        const batch = tickers.slice(index, index + 4);
        const settled = await Promise.allSettled(
          batch.map(async (ticker) => ({ ticker, candles: await fetchCandles(ticker, days) })),
        );
        settled.forEach((item, batchIndex) => {
          if (item.status === 'fulfilled') result[item.value.ticker] = item.value.candles;
          else failures.push(batch[batchIndex]);
        });
      }
      if (!Object.keys(result).length) throw new Error('일봉 데이터를 불러오지 못했습니다.');
      if (failures.length) {
        failures.forEach((ticker) => {
          result[ticker] = [];
        });
        console.warn('[usePortfolio] candle requests failed:', failures);
      }

      const weightedValues = snapshotPositions.map((stock) => {
        const fallbackPrice = 'averagePrice' in stock ? stock.averagePrice : stock.buyPrice;
        const currentPrice = prices[stock.ticker] ?? fallbackPrice;
        const exchangeMultiplier = stock.market === 'US' ? (exchangeRate?.rate ?? 0) : 1;
        return { ticker: stock.ticker, value: currentPrice * stock.quantity * exchangeMultiplier };
      });
      const valuesByTicker = weightedValues.reduce<Record<string, number>>(
        (totals, item) => ({
          ...totals,
          [item.ticker]: (totals[item.ticker] ?? 0) + item.value,
        }),
        {},
      );
      const totalValue = Object.values(valuesByTicker).reduce((sum, value) => sum + value, 0);
      const weights = Object.fromEntries(
        Object.entries(valuesByTicker).map(([ticker, value]) => [
          ticker,
          totalValue > 0 ? (value / totalValue) * 100 : 0,
        ]),
      );
      const risk = calcRisk(result, weights);
      setHistoricalData(result);
      setRiskData(risk);
      return risk;
    },
    [snapshotPositions, prices, exchangeRate, setHistoricalData, setRiskData],
  );

  return { loadHistoricalData };
}
