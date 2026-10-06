import { useCallback, useState } from 'react';
import { fetchCurrentPrices, fetchUsdKrwExchangeRate } from '../services/tossApi';
import { saveDailyPortfolioHistory } from '../services/portfolioHistoryService';
import { usePortfolioStore } from '../store/portfolioStore';
import type { Holding, PriceMap, StockItem } from '../types';
import { calcPortfolio } from '../utils/calculator';
import { calcDailyPortfolioSnapshot } from '../utils/portfolioSnapshot';

interface PriceRefreshParams {
  userId?: string;
  portfolio: StockItem[];
  snapshotPositions: Array<Holding | StockItem>;
  prices: PriceMap;
}

export function usePortfolioPriceRefresh({
  userId,
  portfolio,
  snapshotPositions,
  prices,
}: PriceRefreshParams) {
  const [historySaveError, setHistorySaveError] = useState('');
  const [priceRefreshFailures, setPriceRefreshFailures] = useState<string[]>([]);
  const setPrices = usePortfolioStore((state) => state.setPrices);
  const setExchangeRate = usePortfolioStore((state) => state.setExchangeRate);
  const setComputedData = usePortfolioStore((state) => state.setComputedData);
  const setLoading = usePortfolioStore((state) => state.setLoading);
  const setError = usePortfolioStore((state) => state.setError);
  const setLastUpdated = usePortfolioStore((state) => state.setLastUpdated);
  const upsertPortfolioHistory = usePortfolioStore((state) => state.upsertPortfolioHistory);

  const refreshPrices = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const tickers = snapshotPositions.map((position) => position.ticker);
      const [priceResults, exchangeRate] = await Promise.all([
        Promise.allSettled(
          tickers.map(async (ticker) => ({ ticker, prices: await fetchCurrentPrices([ticker]) })),
        ),
        fetchUsdKrwExchangeRate(),
      ]);
      const newPrices: PriceMap = {};
      const failures: string[] = [];
      priceResults.forEach((result, index) => {
        if (result.status === 'fulfilled') Object.assign(newPrices, result.value.prices);
        else failures.push(tickers[index]);
      });
      if (tickers.length && !Object.keys(newPrices).length) {
        throw new Error('현재가를 갱신하지 못했습니다.');
      }
      setPriceRefreshFailures(failures);
      const mergedPrices = { ...prices, ...newPrices };
      setPrices(mergedPrices);
      setExchangeRate(exchangeRate);
      if (portfolio.length) setComputedData(calcPortfolio(portfolio, mergedPrices));
      setLastUpdated(new Date().toISOString());
      setHistorySaveError('');
      if (userId) {
        const snapshot = calcDailyPortfolioSnapshot(snapshotPositions, mergedPrices, exchangeRate);
        if (snapshot) {
          try {
            const savedHistory = await saveDailyPortfolioHistory(userId, snapshot);
            upsertPortfolioHistory(savedHistory);
          } catch (historyError) {
            console.error('[usePortfolio] saveDailyPortfolioHistory error:', historyError);
            setHistorySaveError(
              historyError instanceof Error ? historyError.message : '이력 저장에 실패했습니다.',
            );
          }
        }
      }
    } catch (error) {
      console.error('[usePortfolio] refreshPrices error:', error);
      setPriceRefreshFailures(snapshotPositions.map((position) => position.ticker));
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [
    userId,
    portfolio,
    snapshotPositions,
    prices,
    setPrices,
    setExchangeRate,
    setComputedData,
    setLoading,
    setError,
    setLastUpdated,
    upsertPortfolioHistory,
  ]);

  return { historySaveError, priceRefreshFailures, refreshPrices };
}
