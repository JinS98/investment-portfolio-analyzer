import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStockSearch } from '@features/market-search';
import type { StockSearchItem } from '../src/types/market';

const apple: StockSearchItem = { symbol: 'AAPL', name: 'Apple', market: 'NASDAQ' };

afterEach(() => vi.useRealTimers());

describe('useStockSearch', () => {
  it('returns search results and an empty result', async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValueOnce([apple]).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useStockSearch({ debounceMs: 20, search }));

    act(() => result.current.setQuery('apple'));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(result.current.results).toEqual([apple]);
    expect(result.current.status).toBe('success');

    act(() => result.current.setQuery('missing'));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(result.current.results).toEqual([]);
    expect(result.current.status).toBe('success');
  });

  it('reports errors without retaining stale results', async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useStockSearch({ debounceMs: 20, search }));

    act(() => result.current.setQuery('apple'));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(result.current.status).toBe('error');
    expect(result.current.results).toEqual([]);
  });

  it('ignores an older response after a newer search', async () => {
    vi.useFakeTimers();
    const resolvers: Array<(items: StockSearchItem[]) => void> = [];
    const search = vi.fn(
      () => new Promise<StockSearchItem[]>((resolve) => resolvers.push(resolve)),
    );
    const { result } = renderHook(() => useStockSearch({ debounceMs: 20, search }));

    act(() => result.current.setQuery('first'));
    await act(() => vi.advanceTimersByTimeAsync(20));
    act(() => result.current.setQuery('second'));
    await act(() => vi.advanceTimersByTimeAsync(20));
    await act(async () => resolvers[1]([apple]));
    await act(async () => resolvers[0]([{ ...apple, symbol: 'OLD' }]));

    expect(result.current.results).toEqual([apple]);
  });
});
