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
      setPrices(newPrices);

      const computed = calcPortfolio(portfolio, newPrices);
      setComputedData(computed);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error('[usePortfolio] refreshPrices error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [portfolio, setPrices, setComputedData, setLoading, setError, setLastUpdated]);

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
    addStock,
    updateStock,
    removeStock,
    refreshPrices,
    loadHistoricalData,
  };
};
