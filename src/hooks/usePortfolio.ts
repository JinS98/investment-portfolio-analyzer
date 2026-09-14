import { useCallback, useState } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { fetchCurrentPrices, fetchCandles, fetchUsdKrwExchangeRate } from '../services/tossApi';
import { calcPortfolio } from '../utils/calculator';
import { calcRisk } from '../utils/riskCalc';
import { calcDailyPortfolioSnapshot } from '../utils/portfolioSnapshot';
import {
  createPortfolioStock,
  deletePortfolioStock,
  updatePortfolioStock as updateStoredPortfolioStock,
} from '../services/portfolioService';
import { saveDailyPortfolioHistory } from '../services/portfolioHistoryService';
import { useAuthStore } from '../store/authStore';

/**
 * 포트폴리오 데이터 로드 훅
 * 토스 API 현재가·캔들 → 수익률 계산 → Zustand 저장
 */
export const usePortfolio = () => {
  const userId = useAuthStore((state) => state.user?.uid);
  const [historySaveError, setHistorySaveError] = useState('');
  const {
    portfolio,
    prices,
    exchangeRate,
    historicalData,
    portfolioHistory,
    computedData,
    riskData,
    isLoading,
    isError,
    lastUpdated,
    addStock,
    updateStock,
    removeStock,
    setPrices,
    setExchangeRate,
    setHistoricalData,
    setRiskData,
    upsertPortfolioHistory,
    setLoading,
    setError,
    setLastUpdated,
    setComputedData,
  } = usePortfolioStore();

  /** 현재가 갱신 + 수익률 재계산 */
  const refreshPrices = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const tickers = portfolio.map((s) => s.ticker);
      const [newPrices, exchangeRate] = await Promise.all([
        tickers.length ? fetchCurrentPrices(tickers) : Promise.resolve({}),
        fetchUsdKrwExchangeRate(),
      ]);
      const mergedPrices = { ...prices, ...newPrices };
      setPrices(mergedPrices);
      setExchangeRate(exchangeRate);
      if (portfolio.length) setComputedData(calcPortfolio(portfolio, mergedPrices));
      setLastUpdated(new Date().toISOString());
      setHistorySaveError('');
      if (userId) {
        const snapshot = calcDailyPortfolioSnapshot(portfolio, mergedPrices, exchangeRate);
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
    } catch (err) {
      console.error('[usePortfolio] refreshPrices error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [
    userId,
    portfolio,
    prices,
    setPrices,
    setExchangeRate,
    setComputedData,
    setLoading,
    setError,
    setLastUpdated,
    upsertPortfolioHistory,
  ]);

  const addPortfolioStock = useCallback(
    async (stock: Parameters<typeof createPortfolioStock>[1]) => {
      if (!userId) throw new Error('로그인 후 종목을 추가해주세요.');
      const savedStock = await createPortfolioStock(userId, stock);
      addStock(savedStock);
      const nextPortfolio = [...portfolio, savedStock];
      setComputedData(calcPortfolio(nextPortfolio, prices));
    },
    [userId, addStock, portfolio, prices, setComputedData],
  );

  const updatePortfolioStock = useCallback(
    async (id: string, updates: Parameters<typeof updateStock>[1]) => {
      if (!userId) throw new Error('로그인 후 종목을 수정해주세요.');
      await updateStoredPortfolioStock(userId, id, updates);
      updateStock(id, updates);
      setComputedData(
        calcPortfolio(
          portfolio.map((stock) => (stock.id === id ? { ...stock, ...updates } : stock)),
          prices,
        ),
      );
    },
    [userId, updateStock, portfolio, prices, setComputedData],
  );

  const removePortfolioStock = useCallback(
    async (id: string) => {
      if (!userId) throw new Error('로그인 후 종목을 삭제해주세요.');
      await deletePortfolioStock(userId, id);
      removeStock(id);
      setComputedData(
        calcPortfolio(
          portfolio.filter((stock) => stock.id !== id),
          prices,
        ),
      );
    },
    [userId, removeStock, portfolio, prices, setComputedData],
  );

  /**
   * 캔들(일봉) 데이터 로드 — Week 5 리스크 계산용
   * @param days 조회 일수 (기본 90)
   */
  const loadHistoricalData = useCallback(
    async (days = 90) => {
      if (!portfolio.length) {
        setHistoricalData({});
        setRiskData(null);
        return null;
      }

      const result: Record<string, Awaited<ReturnType<typeof fetchCandles>>> = {};
      const tickers = [...new Set(portfolio.map((stock) => stock.ticker))];
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
      if (failures.length) console.warn('[usePortfolio] candle requests failed:', failures);

      const weightedValues = portfolio.map((stock) => {
        const currentPrice = prices[stock.ticker] ?? stock.buyPrice;
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
    [portfolio, prices, exchangeRate, setHistoricalData, setRiskData],
  );

  return {
    portfolio,
    prices,
    exchangeRate,
    historicalData,
    portfolioHistory,
    computedData,
    riskData,
    historySaveError,
    isLoading,
    isError,
    lastUpdated,
    addStock: addPortfolioStock,
    updateStock: updatePortfolioStock,
    removeStock: removePortfolioStock,
    refreshPrices,
    loadHistoricalData,
  };
};
