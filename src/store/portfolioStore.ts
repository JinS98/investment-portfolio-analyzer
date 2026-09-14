import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  PortfolioState,
  StockItem,
  PriceMap,
  PortfolioHistory,
  TossCandleItem,
} from '../types';

const initialState = {
  portfolio: [] as StockItem[],
  prices: {} as PriceMap,
  exchangeRate: null,
  historicalData: {} as Record<string, TossCandleItem[]>,
  lastMonthSnapshot: null,
  computedData: null,
  riskData: null,
  signalData: null,
  portfolioHistory: [] as PortfolioHistory[],
  isLoading: false,
  isError: false,
  lastUpdated: null,
};

export const usePortfolioStore = create<PortfolioState>()(
  devtools(
    (set) => ({
      ...initialState,

      addStock: (stock) =>
        set((state) => ({
          portfolio: [...state.portfolio, stock],
        })),

      updateStock: (id, updates) =>
        set((state) => ({
          portfolio: state.portfolio.map((s) =>
            s.id === id ? { ...s, ...updates } : s,
          ),
        })),

      removeStock: (id) =>
        set((state) => ({
          portfolio: state.portfolio.filter((s) => s.id !== id),
        })),

      replacePortfolio: (portfolio) => set({
        portfolio,
        prices: {},
        exchangeRate: null,
        computedData: null,
        lastUpdated: null,
      }),

      setPrices: (prices) => set({ prices }),
      setExchangeRate: (exchangeRate) => set({ exchangeRate }),
      setHistoricalData: (historicalData) => set({ historicalData }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (isError) => set({ isError }),
      setLastUpdated: (lastUpdated) => set({ lastUpdated }),
      setPortfolioHistory: (portfolioHistory) => set({ portfolioHistory }),
      setLastMonthSnapshot: (lastMonthSnapshot) => set({ lastMonthSnapshot }),
      setComputedData: (computedData) => set({ computedData }),
      setRiskData: (riskData) => set({ riskData }),
      setSignalData: (signalData) => set({ signalData }),

      reset: () => set(initialState),
    }),
    { name: 'portfolio-store' },
  ),
);
