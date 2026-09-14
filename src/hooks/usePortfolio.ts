import { useCallback } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { fetchCurrentPrices, fetchCandles, fetchUsdKrwExchangeRate } from '../services/tossApi';
import { calcPortfolio } from '../utils/calculator';
import { createPortfolioStock, deletePortfolioStock, updatePortfolioStock as updateStoredPortfolioStock } from '../services/portfolioService';
import { useAuthStore } from '../store/authStore';

/**
 * 포트폴리오 데이터 로드 훅
 * 토스 API 현재가·캔들 → 수익률 계산 → Zustand 저장
 */
export const usePortfolio = () => {
  const userId = useAuthStore((state) => state.user?.uid);
  const {
    portfolio,
    prices,
    exchangeRate,
    computedData,
    isLoading,
    isError,
    lastUpdated,
    addStock,
    updateStock,
    removeStock,
    setPrices,
    setExchangeRate,
    setHistoricalData,
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
    } catch (err) {
      console.error('[usePortfolio] refreshPrices error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [portfolio, prices, setPrices, setExchangeRate, setComputedData, setLoading, setError, setLastUpdated]);

  const addPortfolioStock = useCallback(async (stock: Parameters<typeof createPortfolioStock>[1]) => {
    if (!userId) throw new Error('로그인 후 종목을 추가해주세요.');
    const savedStock = await createPortfolioStock(userId, stock);
    addStock(savedStock);
    const nextPortfolio = [
      ...portfolio,
      savedStock,
    ];
    setComputedData(calcPortfolio(nextPortfolio, prices));
  }, [userId, addStock, portfolio, prices, setComputedData]);

  const updatePortfolioStock = useCallback(async (id: string, updates: Parameters<typeof updateStock>[1]) => {
    if (!userId) throw new Error('로그인 후 종목을 수정해주세요.');
    await updateStoredPortfolioStock(userId, id, updates);
    updateStock(id, updates);
    setComputedData(calcPortfolio(
      portfolio.map((stock) => stock.id === id ? { ...stock, ...updates } : stock),
      prices,
    ));
  }, [userId, updateStock, portfolio, prices, setComputedData]);

  const removePortfolioStock = useCallback(async (id: string) => {
    if (!userId) throw new Error('로그인 후 종목을 삭제해주세요.');
    await deletePortfolioStock(userId, id);
    removeStock(id);
    setComputedData(calcPortfolio(portfolio.filter((stock) => stock.id !== id), prices));
  }, [userId, removeStock, portfolio, prices, setComputedData]);

  /**
   * 캔들(일봉) 데이터 로드 — Week 5 리스크 계산용
   * @param days 조회 일수 (기본 90)
   */
  const loadHistoricalData = useCallback(
    async (days = 90) => {
      if (!portfolio.length) return;

      try {
        const result: Record<string, Awaited<ReturnType<typeof fetchCandles>>> = {};
        await Promise.all(
          portfolio.map(async (stock) => {
            result[stock.ticker] = await fetchCandles(stock.ticker, days);
          }),
        );
        setHistoricalData(result);
      } catch (err) {
        console.error('[usePortfolio] loadHistoricalData error:', err);
      }
    },
    [portfolio, setHistoricalData],
  );

  return {
    portfolio,
    prices,
    exchangeRate,
    computedData,
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
