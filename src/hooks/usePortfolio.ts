import { useCallback } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { fetchCurrentPrices, fetchCandles } from '../services/tossApi';
import { calcPortfolio } from '../utils/calculator';

/**
 * 포트폴리오 데이터 로드 훅
 * 토스 API 현재가·캔들 → 수익률 계산 → Zustand 저장
 */
export const usePortfolio = () => {
  const {
    portfolio,
    prices,
    computedData,
    isLoading,
    isError,
    lastUpdated,
    addStock,
    updateStock,
    removeStock,
    setPrices,
    setHistoricalData,
    setLoading,
    setError,
    setLastUpdated,
    setComputedData,
  } = usePortfolioStore();

  /** 현재가 갱신 + 수익률 재계산 */
  const refreshPrices = useCallback(async () => {
    if (!portfolio.length) return;

    setLoading(true);
    setError(false);

    try {
      const tickers = portfolio.map((s) => s.ticker);
      const newPrices = await fetchCurrentPrices(tickers);
      setPrices({ ...prices, ...newPrices });

      const computed = calcPortfolio(portfolio, { ...prices, ...newPrices });
      setComputedData(computed);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error('[usePortfolio] refreshPrices error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [portfolio, prices, setPrices, setComputedData, setLoading, setError, setLastUpdated]);

  const addPortfolioStock = useCallback((stock: Parameters<typeof addStock>[0]) => {
    addStock(stock);
    const nextPortfolio = [
      ...portfolio,
      { ...stock, id: 'preview', addedAt: new Date().toISOString() },
    ];
    setComputedData(calcPortfolio(nextPortfolio, prices));
  }, [addStock, portfolio, prices, setComputedData]);

  const updatePortfolioStock = useCallback((id: string, updates: Parameters<typeof updateStock>[1]) => {
    updateStock(id, updates);
    setComputedData(calcPortfolio(
      portfolio.map((stock) => stock.id === id ? { ...stock, ...updates } : stock),
      prices,
    ));
  }, [updateStock, portfolio, prices, setComputedData]);

  const removePortfolioStock = useCallback((id: string) => {
    removeStock(id);
    setComputedData(calcPortfolio(portfolio.filter((stock) => stock.id !== id), prices));
  }, [removeStock, portfolio, prices, setComputedData]);

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
