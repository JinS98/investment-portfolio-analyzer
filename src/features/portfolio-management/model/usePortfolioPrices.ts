import { useState } from 'react';
import { fetchCurrentPrices } from '../../../services/tossApi';
import type { Holding, PriceMap } from '../../../types';

interface UsePortfolioPricesOptions {
  holdings: Holding[];
  prices: PriceMap;
  setPrices: (prices: PriceMap) => void;
  onNotice: (message: string) => void;
}

export function usePortfolioPrices({
  holdings,
  prices,
  setPrices,
  onNotice,
}: UsePortfolioPricesOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshPrices = async () => {
    if (holdings.length === 0) return;
    setIsRefreshing(true);
    onNotice('');
    try {
      const refreshed = await fetchCurrentPrices([
        ...new Set(holdings.map((holding) => holding.ticker)),
      ]);
      setPrices({ ...prices, ...refreshed });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '현재가를 불러오지 못했습니다.');
    } finally {
      setIsRefreshing(false);
    }
  };
  return { isRefreshing, refreshPrices };
}
