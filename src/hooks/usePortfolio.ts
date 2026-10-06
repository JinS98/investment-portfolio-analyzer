import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { usePortfolioHistoricalRisk } from './usePortfolioHistoricalRisk';
import { usePortfolioPriceRefresh } from './usePortfolioPriceRefresh';
import { usePortfolioStockCrud } from './usePortfolioStockCrud';

/** Keeps the existing dashboard API while price, risk, and legacy stock actions live separately. */
export const usePortfolio = () => {
  const userId = useAuthStore((state) => state.user?.uid);
  const portfolio = usePortfolioStore((state) => state.portfolio);
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const portfolioLedgers = usePortfolioStore((state) => state.portfolioLedgers);
  const prices = usePortfolioStore((state) => state.prices);
  const exchangeRate = usePortfolioStore((state) => state.exchangeRate);
  const historicalData = usePortfolioStore((state) => state.historicalData);
  const portfolioHistory = usePortfolioStore((state) => state.portfolioHistory);
  const computedData = usePortfolioStore((state) => state.computedData);
  const riskData = usePortfolioStore((state) => state.riskData);
  const isLoading = usePortfolioStore((state) => state.isLoading);
  const isError = usePortfolioStore((state) => state.isError);
  const lastUpdated = usePortfolioStore((state) => state.lastUpdated);

  const realPortfolio = portfolios.find((item) => item.type === 'REAL');
  const realLedger = realPortfolio ? portfolioLedgers[realPortfolio.id] : undefined;
  const snapshotPositions = realLedger ? realLedger.holdings : portfolio;
  const { historySaveError, priceRefreshFailures, refreshPrices } = usePortfolioPriceRefresh({
    userId,
    portfolio,
    snapshotPositions,
    prices,
  });
  const { loadHistoricalData } = usePortfolioHistoricalRisk({
    snapshotPositions,
    prices,
    exchangeRate,
  });
  const { addStock, updateStock, removeStock } = usePortfolioStockCrud({
    userId,
    portfolio,
    prices,
  });

  return {
    portfolio,
    prices,
    exchangeRate,
    historicalData,
    portfolioHistory,
    computedData,
    riskData,
    historySaveError,
    priceRefreshFailures,
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
