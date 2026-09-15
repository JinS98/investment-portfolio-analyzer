import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  addPortfolioHoldingHistory,
  deletePortfolioHoldingHistory,
  loadPortfolioWorkspace,
} from '../services/portfolioLedgerService';
import type {
  PortfolioLedger,
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
  portfolios: [],
  activePortfolioId: null,
  holdings: [],
  holdingHistories: [],
  portfolioSummary: null,
  portfolioLedgers: {} as Record<string, PortfolioLedger>,
  isSaving: false,
  ledgerError: null,
  isLoading: false,
  isError: false,
  lastUpdated: null,
};

const ledgerPatch = (ledgers: PortfolioLedger[], activePortfolioId: string | null) => {
  const portfolioLedgers = Object.fromEntries(
    ledgers.map((ledger) => [ledger.portfolio.id, ledger]),
  ) as Record<string, PortfolioLedger>;
  const selectedId =
    activePortfolioId && portfolioLedgers[activePortfolioId]
      ? activePortfolioId
      : (ledgers.find((ledger) => ledger.portfolio.type === 'REAL')?.portfolio.id ?? null);
  const selected = selectedId ? portfolioLedgers[selectedId] : undefined;
  return {
    portfolios: ledgers.map((ledger) => ledger.portfolio),
    portfolioLedgers,
    activePortfolioId: selectedId,
    holdings: selected?.holdings ?? [],
    holdingHistories: selected?.histories ?? [],
    portfolioSummary: selected?.summary ?? null,
  };
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
          portfolio: state.portfolio.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      removeStock: (id) =>
        set((state) => ({
          portfolio: state.portfolio.filter((s) => s.id !== id),
        })),

      replacePortfolio: (portfolio) =>
        set({
          portfolio,
          prices: {},
          exchangeRate: null,
          historicalData: {},
          computedData: null,
          riskData: null,
          lastUpdated: null,
        }),

      setPrices: (prices) => set({ prices }),
      setExchangeRate: (exchangeRate) => set({ exchangeRate }),
      setHistoricalData: (historicalData) => set({ historicalData }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (isError) => set({ isError }),
      setLastUpdated: (lastUpdated) => set({ lastUpdated }),
      setPortfolioHistory: (portfolioHistory) => set({ portfolioHistory }),
      upsertPortfolioHistory: (history) =>
        set((state) => ({
          portfolioHistory: [
            history,
            ...state.portfolioHistory.filter((item) => item.date !== history.date),
          ],
        })),
      setLastMonthSnapshot: (lastMonthSnapshot) => set({ lastMonthSnapshot }),
      setComputedData: (computedData) => set({ computedData }),
      setRiskData: (riskData) => set({ riskData }),
      setSignalData: (signalData) => set({ signalData }),

      loadPortfolioLedgers: async (userId, shouldApply) => {
        set({ isLoading: true, ledgerError: null });
        try {
          const ledgers = await loadPortfolioWorkspace(userId);
          if (shouldApply && !shouldApply()) return;
          set((state) => ({
            ...ledgerPatch(ledgers, state.activePortfolioId),
            isLoading: false,
            ledgerError: null,
          }));
        } catch (error) {
          if (shouldApply && !shouldApply()) return;
          set({
            isLoading: false,
            ledgerError:
              error instanceof Error ? error.message : '거래 원장을 불러오지 못했습니다.',
          });
          throw error;
        }
      },

      addHoldingHistory: async (userId, input) => {
        set({ isSaving: true, ledgerError: null });
        try {
          const ledger = await addPortfolioHoldingHistory(userId, input);
          set((state) => {
            const ledgers = Object.values({
              ...state.portfolioLedgers,
              [ledger.portfolio.id]: ledger,
            });
            return {
              ...ledgerPatch(ledgers, state.activePortfolioId),
              isSaving: false,
              ledgerError: null,
            };
          });
        } catch (error) {
          set({
            isSaving: false,
            ledgerError: error instanceof Error ? error.message : '거래 기록 저장에 실패했습니다.',
          });
          throw error;
        }
      },

      deleteHoldingHistory: async (userId, portfolioId, historyId) => {
        set({ isSaving: true, ledgerError: null });
        try {
          const ledger = await deletePortfolioHoldingHistory(userId, portfolioId, historyId);
          set((state) => {
            const ledgers = Object.values({
              ...state.portfolioLedgers,
              [ledger.portfolio.id]: ledger,
            });
            return {
              ...ledgerPatch(ledgers, state.activePortfolioId),
              isSaving: false,
              ledgerError: null,
            };
          });
        } catch (error) {
          set({
            isSaving: false,
            ledgerError: error instanceof Error ? error.message : '거래 기록 삭제에 실패했습니다.',
          });
          throw error;
        }
      },

      setActivePortfolioId: (portfolioId) =>
        set((state) => {
          const selected = state.portfolioLedgers[portfolioId];
          if (!selected) return {};
          return {
            activePortfolioId: portfolioId,
            holdings: selected.holdings,
            holdingHistories: selected.histories,
            portfolioSummary: selected.summary,
          };
        }),

      resetPortfolioLedgers: () =>
        set({
          portfolios: [],
          activePortfolioId: null,
          holdings: [],
          holdingHistories: [],
          portfolioSummary: null,
          portfolioLedgers: {},
          isSaving: false,
          ledgerError: null,
        }),

      reset: () => set(initialState),
    }),
    { name: 'portfolio-store' },
  ),
);
