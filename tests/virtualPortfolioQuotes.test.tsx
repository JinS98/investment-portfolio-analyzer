import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVirtualPortfolioQuotes } from '../src/pages/VirtualPortfolio/useVirtualPortfolioQuotes';
import { usePortfolioStore } from '../src/store/portfolioStore';
import type { Holding } from '../src/types';

const api = vi.hoisted(() => ({ fetchQuotes: vi.fn() }));
vi.mock('../src/services/tossApi', () => ({ fetchQuotes: api.fetchQuotes }));

const holdings: Holding[] = [
  {
    portfolioId: 'virtual',
    ticker: '005930',
    name: 'Samsung',
    market: 'KR',
    quantity: 1,
    averagePrice: 70_000,
    investedAmount: 70_000,
  },
  {
    portfolioId: 'virtual',
    ticker: 'AAPL',
    name: 'Apple',
    market: 'US',
    quantity: 1,
    averagePrice: 200,
    investedAmount: 200,
  },
];

const quote = (symbol: string, price: number) => ({
  symbol,
  price,
  currency: symbol === 'AAPL' ? 'USD' : 'KRW',
  timestamp: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  usePortfolioStore.setState({ prices: {} });
});
afterEach(() => vi.useRealTimers());

it('waits for portfolio loading, batches quotes, and reloads after prices are cleared', async () => {
  api.fetchQuotes.mockResolvedValue([quote('005930', 80_000), quote('AAPL', 220)]);
  const { rerender } = renderHook(({ loading }) => useVirtualPortfolioQuotes(holdings, loading), {
    initialProps: { loading: true },
  });

  expect(api.fetchQuotes).not.toHaveBeenCalled();
  rerender({ loading: false });
  await waitFor(() => expect(usePortfolioStore.getState().prices.AAPL).toBe(220));
  expect(api.fetchQuotes).toHaveBeenCalledWith(['005930', 'AAPL']);
  expect(api.fetchQuotes).toHaveBeenCalledTimes(1);

  act(() => usePortfolioStore.getState().setPrices({}));
  await waitFor(() => expect(api.fetchQuotes).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(usePortfolioStore.getState().prices.AAPL).toBe(220));
});

it('retries a failed quote request without a page reload', async () => {
  vi.useFakeTimers();
  api.fetchQuotes
    .mockRejectedValueOnce(new Error('temporary quote failure'))
    .mockResolvedValueOnce([quote('005930', 80_000), quote('AAPL', 220)]);
  renderHook(() => useVirtualPortfolioQuotes(holdings, false));

  await act(async () => Promise.resolve());
  expect(api.fetchQuotes).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(api.fetchQuotes).toHaveBeenCalledTimes(2);
  expect(usePortfolioStore.getState().prices).toEqual({ '005930': 80_000, AAPL: 220 });
});

it('keeps returned quotes and requests only missing symbols next', async () => {
  api.fetchQuotes.mockImplementation(async (symbols: string[]) =>
    symbols.length === 2 ? [quote('AAPL', 220)] : [quote('005930', 80_000)],
  );
  renderHook(() => useVirtualPortfolioQuotes(holdings, false));

  await waitFor(() => expect(usePortfolioStore.getState().prices['005930']).toBe(80_000));
  expect(api.fetchQuotes).toHaveBeenNthCalledWith(1, ['005930', 'AAPL']);
  expect(api.fetchQuotes).toHaveBeenNthCalledWith(2, ['005930']);
});
