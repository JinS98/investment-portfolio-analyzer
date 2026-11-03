import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useExchangeRateSync } from '../src/hooks/useExchangeRateSync';
import { useMarketOverview } from '../src/pages/MarketExplore/useMarketOverview';
import { usePortfolioStore } from '../src/store/portfolioStore';
import type { ExchangeRate } from '../src/types/market';

const api = vi.hoisted(() => ({
  fetchUsdKrwExchangeRate: vi.fn(),
  fetchMarketIndicatorPrices: vi.fn(),
  fetchMarketIndicatorCandles: vi.fn(),
  fetchUsMarketIndices: vi.fn(),
  fetchMarketExploreOverview: vi.fn(),
}));

vi.mock('../src/services/tossApi', () => ({
  fetchUsdKrwExchangeRate: api.fetchUsdKrwExchangeRate,
  fetchMarketIndicatorPrices: api.fetchMarketIndicatorPrices,
  fetchMarketIndicatorCandles: api.fetchMarketIndicatorCandles,
  fetchUsMarketIndices: api.fetchUsMarketIndices,
}));
vi.mock('../src/services/marketExploreService', () => ({
  fetchMarketExploreOverview: api.fetchMarketExploreOverview,
}));

const rate: ExchangeRate = {
  baseCurrency: 'USD',
  quoteCurrency: 'KRW',
  rate: 1_400,
  midRate: 1_400,
  validFrom: '2026-11-03T00:00:00Z',
  validUntil: '2026-11-03T01:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  usePortfolioStore.setState({ exchangeRate: null });
  api.fetchUsdKrwExchangeRate.mockResolvedValue(rate);
  api.fetchMarketIndicatorPrices.mockResolvedValue([]);
  api.fetchMarketIndicatorCandles.mockResolvedValue([]);
  api.fetchUsMarketIndices.mockResolvedValue([]);
  api.fetchMarketExploreOverview.mockImplementation(async (market: string) => [
    {
      symbol: market,
      name: market,
      market,
      rank: 1,
      currency: market === 'US' ? 'USD' : 'KRW',
      price: 10,
      changeRate: 0,
      tradingAmount: 10,
    },
  ]);
});

afterEach(() => vi.useRealTimers());

it('retries a temporary rate failure and restores the rate without a page reload', async () => {
  vi.useFakeTimers();
  api.fetchUsdKrwExchangeRate
    .mockRejectedValueOnce(new Error('temporary failure'))
    .mockResolvedValueOnce(rate);
  const { unmount } = renderHook(() => useExchangeRateSync(true, null));

  await act(async () => Promise.resolve());
  expect(usePortfolioStore.getState().exchangeRate).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(usePortfolioStore.getState().exchangeRate).toEqual(rate);
  expect(api.fetchUsdKrwExchangeRate).toHaveBeenCalledTimes(2);
  unmount();
});

it('preserves the last good exchange rate during portfolio synchronization', () => {
  usePortfolioStore.setState({ exchangeRate: rate });
  usePortfolioStore.getState().replacePortfolio([]);
  expect(usePortfolioStore.getState().exchangeRate).toEqual(rate);
});

it('loads market rankings when the independent rate request fails', async () => {
  api.fetchUsdKrwExchangeRate.mockRejectedValue(new Error('temporary failure'));
  const setExchangeRate = vi.fn();
  const { result } = renderHook(() => useMarketOverview({ setExchangeRate }));

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.overview.map((item) => item.symbol)).toEqual(['KR', 'US']);
  expect(result.current.error).toBe('');
  expect(setExchangeRate).not.toHaveBeenCalled();
});

it('shows Korean index candles from the last 30 calendar days', async () => {
  const candles = ['2026-09-17', '2026-10-04', '2026-10-05', '2026-10-31', '2026-11-03'].map(
    (date) => ({ timestamp: `${date}T15:00:00+09:00`, closePrice: 100 }),
  );
  api.fetchMarketIndicatorCandles.mockImplementation(async (_symbol, _count, interval) =>
    interval === '1m' ? [] : candles,
  );
  const { result } = renderHook(() => useMarketOverview({ setExchangeRate: vi.fn() }));

  act(() => result.current.setIsIndicatorDialogOpen(true));
  await waitFor(() => expect(result.current.indicatorCandles).toHaveLength(3));
  expect(result.current.indicatorCandles[0].timestamp.slice(0, 10)).toBe('2026-10-05');
  expect(result.current.indicatorCandles.at(-1)?.timestamp.slice(0, 10)).toBe('2026-11-03');
});

it('filters the cached US index chart to the same calendar-day window', async () => {
  const candles = ['2026-09-17', '2026-10-04', '2026-10-05', '2026-10-31', '2026-11-03'].map(
    (date) => ({ timestamp: `${date}T14:30:00Z`, closePrice: 100 }),
  );
  api.fetchUsMarketIndices.mockResolvedValue([
    { symbol: 'NASDAQ', price: 100, changeRate: 0, candles },
  ]);
  const { result } = renderHook(() => useMarketOverview({ setExchangeRate: vi.fn() }));

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => {
    result.current.setSelectedIndicator('NASDAQ');
    result.current.setIsIndicatorDialogOpen(true);
  });
  await waitFor(() => expect(result.current.indicatorCandles).toHaveLength(3));
  expect(result.current.indicatorCandles[0].timestamp.slice(0, 10)).toBe('2026-10-05');
});
