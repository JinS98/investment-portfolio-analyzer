import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortfolioPrices } from '@features/portfolio-management';
import type { Holding } from '../src/types';

const api = vi.hoisted(() => ({ fetchCurrentPrices: vi.fn() }));
vi.mock('../src/services/tossApi', () => ({ fetchCurrentPrices: api.fetchCurrentPrices }));

const holding: Holding = {
  portfolioId: 'portfolio-1',
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  quantity: 1,
  averagePrice: 70_000,
  investedAmount: 70_000,
};

beforeEach(() => vi.clearAllMocks());

describe('portfolio price refresh', () => {
  it('requests each held ticker once and merges new quotes', async () => {
    api.fetchCurrentPrices.mockResolvedValue({ '005930': 80_000 });
    const setPrices = vi.fn();
    const onNotice = vi.fn();
    const { result } = renderHook(() =>
      usePortfolioPrices({
        holdings: [holding, holding],
        prices: { AAPL: 200 },
        setPrices,
        onNotice,
      }),
    );
    await act(async () => result.current.refreshPrices());
    expect(api.fetchCurrentPrices).toHaveBeenCalledWith(['005930']);
    expect(setPrices).toHaveBeenCalledWith({ AAPL: 200, '005930': 80_000 });
    expect(result.current.isRefreshing).toBe(false);
  });

  it('shows a request error without replacing stored quotes', async () => {
    api.fetchCurrentPrices.mockRejectedValue(new Error('시세 조회 실패'));
    const setPrices = vi.fn();
    const onNotice = vi.fn();
    const { result } = renderHook(() =>
      usePortfolioPrices({ holdings: [holding], prices: {}, setPrices, onNotice }),
    );
    await act(async () => result.current.refreshPrices());
    expect(onNotice).toHaveBeenLastCalledWith('시세 조회 실패');
    expect(setPrices).not.toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);
  });
});
