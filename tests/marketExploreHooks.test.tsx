import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarketSearch } from '../src/pages/MarketExplore/useMarketSearch';
import { useStockDetail } from '../src/pages/MarketExplore/useStockDetail';
import type { MarketExploreStock } from '../src/services/marketExploreService';
import type { Quote } from '../src/types/market';

const api = vi.hoisted(() => ({
  searchStocks: vi.fn(),
  fetchQuotes: vi.fn(),
  fetchCandlePage: vi.fn(),
  fetchStockInsights: vi.fn(),
}));

vi.mock('../src/services/tossApi', () => ({
  searchStocks: api.searchStocks,
  fetchQuotes: api.fetchQuotes,
  fetchCandlePage: api.fetchCandlePage,
}));
vi.mock('../src/services/marketInsightsApi', () => ({
  fetchStockInsights: api.fetchStockInsights,
}));

const stock = (symbol: string): MarketExploreStock => ({
  symbol,
  name: symbol,
  market: 'KOSPI',
  rank: 0,
  currency: 'KRW',
  price: null,
  changeRate: null,
  tradingAmount: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchQuotes.mockResolvedValue([]);
  api.fetchCandlePage.mockResolvedValue({ candles: [] });
  api.fetchStockInsights.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('market explore requests', () => {
  it('keeps the latest search when an older request resolves later', async () => {
    vi.useFakeTimers();
    const resolvers: Array<
      (value: Array<{ symbol: string; name: string; market: string }>) => void
    > = [];
    api.searchStocks.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const onError = vi.fn();
    const { result } = renderHook(() => useMarketSearch([], onError));

    act(() => result.current.setQuery('first'));
    await act(() => vi.advanceTimersByTimeAsync(250));
    act(() => result.current.setQuery('second'));
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => resolvers[1]([{ symbol: 'NEW', name: '새 종목', market: 'KOSPI' }]));
    await act(async () => resolvers[0]([{ symbol: 'OLD', name: '이전 종목', market: 'KOSPI' }]));

    expect(result.current.visibleStocks.map((item) => item.symbol)).toEqual(['NEW']);
  });

  it('ignores a stale stock detail after selecting another stock', async () => {
    let resolveOldQuote: ((quotes: Quote[]) => void) | undefined;
    api.fetchQuotes.mockImplementation((symbols: string[]) =>
      symbols[0] === 'OLD'
        ? new Promise((resolve) => {
            resolveOldQuote = resolve;
          })
        : Promise.resolve([{ symbol: 'NEW', price: 80_000 }]),
    );
    const { result } = renderHook(() => useStockDetail());
    act(() => result.current.openStockDrawer(stock('OLD')));
    act(() => result.current.openStockDrawer(stock('NEW')));
    await waitFor(() => expect(result.current.stockDetail?.quote?.symbol).toBe('NEW'));
    await act(async () => resolveOldQuote?.([{ symbol: 'OLD', price: 70_000 } as Quote]));
    expect(result.current.selectedStock?.symbol).toBe('NEW');
    expect(result.current.stockDetail?.quote?.symbol).toBe('NEW');
  });

  it.each(['KR', 'US'])('shows %s stock candles from the last 30 calendar days', async (market) => {
    const candles = ['2026-09-17', '2026-10-04', '2026-10-05', '2026-10-31', '2026-11-03'].map(
      (date) => ({ date, timestamp: `${date}T00:00:00+09:00`, closePrice: 100 }),
    );
    api.fetchCandlePage.mockResolvedValue({ candles });
    const selected = { ...stock('TEST'), market: market === 'KR' ? 'KOSPI' : 'NASDAQ' };
    const { result } = renderHook(() => useStockDetail());

    act(() => result.current.openStockDrawer(selected));
    await waitFor(() => expect(result.current.stockDetail?.candles).toHaveLength(3));
    expect(result.current.stockDetail?.candles[0].date).toBe('2026-10-05');
    expect(result.current.stockDetail?.candles.at(-1)?.date).toBe('2026-11-03');
    expect(api.fetchCandlePage).toHaveBeenCalledWith('TEST', 30);
  });
});
