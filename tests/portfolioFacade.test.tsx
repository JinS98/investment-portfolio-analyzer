import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortfolioHistoricalRisk } from '../src/hooks/usePortfolioHistoricalRisk';
import { usePortfolioPriceRefresh } from '../src/hooks/usePortfolioPriceRefresh';
import { usePortfolioStore } from '../src/store/portfolioStore';
import type { ExchangeRate, Holding } from '../src/types';

const api = vi.hoisted(() => ({
  fetchCurrentPrices: vi.fn(),
  fetchUsdKrwExchangeRate: vi.fn(),
  fetchCandles: vi.fn(),
  saveDailyPortfolioHistory: vi.fn(),
}));
vi.mock('../src/services/tossApi', () => ({
  fetchCurrentPrices: api.fetchCurrentPrices,
  fetchUsdKrwExchangeRate: api.fetchUsdKrwExchangeRate,
  fetchCandles: api.fetchCandles,
}));
vi.mock('../src/services/portfolioHistoryService', () => ({
  saveDailyPortfolioHistory: api.saveDailyPortfolioHistory,
}));

const krHolding: Holding = {
  portfolioId: 'portfolio-1',
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  quantity: 2,
  averagePrice: 70_000,
  investedAmount: 140_000,
};
const usHolding: Holding = {
  ...krHolding,
  ticker: 'AAPL',
  name: '애플',
  market: 'US',
  averagePrice: 200,
  investedAmount: 400,
};
const exchangeRate: ExchangeRate = {
  baseCurrency: 'USD',
  quoteCurrency: 'KRW',
  rate: 1400,
  midRate: 1400,
  validFrom: '2026-10-06T00:00:00.000Z',
  validUntil: '2026-10-07T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  usePortfolioStore.setState({
    prices: {},
    exchangeRate: null,
    historicalData: {},
    portfolioHistory: [],
    riskData: null,
    isLoading: false,
    isError: false,
    lastUpdated: null,
  });
  api.fetchUsdKrwExchangeRate.mockResolvedValue(exchangeRate);
});

describe('portfolio facade operations', () => {
  it('keeps successful quotes when another ticker fails', async () => {
    api.fetchCurrentPrices.mockImplementation(async ([ticker]: string[]) => {
      if (ticker === 'AAPL') throw new Error('미국 시세 오류');
      return { '005930': 80_000 };
    });
    const { result } = renderHook(() =>
      usePortfolioPriceRefresh({
        portfolio: [],
        snapshotPositions: [krHolding, usHolding],
        prices: { AAPL: 210 },
      }),
    );

    await act(async () => result.current.refreshPrices());
    expect(usePortfolioStore.getState().prices).toEqual({ AAPL: 210, '005930': 80_000 });
    expect(result.current.priceRefreshFailures).toEqual(['AAPL']);
    expect(usePortfolioStore.getState().isError).toBe(false);
    expect(usePortfolioStore.getState().isLoading).toBe(false);
  });

  it('reports a snapshot save failure without discarding refreshed quotes', async () => {
    api.fetchCurrentPrices.mockResolvedValue({ '005930': 80_000 });
    api.saveDailyPortfolioHistory.mockRejectedValue(new Error('이력 저장 거부'));
    const { result } = renderHook(() =>
      usePortfolioPriceRefresh({
        userId: 'user-1',
        portfolio: [],
        snapshotPositions: [krHolding],
        prices: {},
      }),
    );

    await act(async () => result.current.refreshPrices());
    expect(api.saveDailyPortfolioHistory).toHaveBeenCalledOnce();
    expect(result.current.historySaveError).toBe('이력 저장 거부');
    expect(usePortfolioStore.getState().prices['005930']).toBe(80_000);
    expect(usePortfolioStore.getState().isError).toBe(false);
  });

  it('retains available candles and marks a failed ticker as insufficient', async () => {
    api.fetchCandles.mockImplementation(async (ticker: string) => {
      if (ticker === 'AAPL') throw new Error('미국 일봉 오류');
      return [{ date: '2026-10-06', closePrice: 80_000 }];
    });
    const { result } = renderHook(() =>
      usePortfolioHistoricalRisk({
        snapshotPositions: [krHolding, usHolding],
        prices: { '005930': 80_000, AAPL: 210 },
        exchangeRate,
      }),
    );

    await act(async () => result.current.loadHistoricalData());
    expect(usePortfolioStore.getState().historicalData['005930']).toHaveLength(1);
    expect(usePortfolioStore.getState().historicalData.AAPL).toEqual([]);
    expect(usePortfolioStore.getState().riskData?.insufficientTickers).toContain('AAPL');
  });
});
