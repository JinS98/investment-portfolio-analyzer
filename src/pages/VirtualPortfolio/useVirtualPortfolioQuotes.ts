import { useEffect, useMemo } from 'react';
import { fetchQuotes } from '../../services/tossApi';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { Holding } from '../../types';

export function useVirtualPortfolioQuotes(holdings: Holding[], isPortfolioLoading: boolean) {
  const prices = usePortfolioStore((state) => state.prices);
  const setPrices = usePortfolioStore((state) => state.setPrices);
  const missingTickerKey = useMemo(
    () =>
      [...new Set(holdings.map((holding) => holding.ticker.trim().toUpperCase()))]
        .filter((ticker) => prices[ticker] === undefined)
        .sort()
        .join('|'),
    [holdings, prices],
  );

  useEffect(() => {
    if (isPortfolioLoading || !missingTickerKey) return;
    let active = true;
    let failures = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const tickers = missingTickerKey.split('|');

    const loadQuotes = async () => {
      const missing = tickers.filter(
        (ticker) => usePortfolioStore.getState().prices[ticker] === undefined,
      );
      if (!missing.length) return;
      try {
        const requested = new Set(missing);
        const quotes = await fetchQuotes(missing);
        if (!active) return;
        const nextPrices = Object.fromEntries(
          quotes
            .filter(
              (quote) =>
                requested.has(quote.symbol) && Number.isFinite(quote.price) && quote.price > 0,
            )
            .map((quote) => [quote.symbol, quote.price]),
        );
        if (Object.keys(nextPrices).length) {
          setPrices({ ...usePortfolioStore.getState().prices, ...nextPrices });
        }
      } catch {
        // Keep available prices and retry the missing tickers below.
      }
      if (!active) return;
      if (tickers.every((ticker) => usePortfolioStore.getState().prices[ticker] !== undefined))
        return;
      const delay = Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5));
      failures += 1;
      retryTimer = setTimeout(() => void loadQuotes(), delay);
    };

    void loadQuotes();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isPortfolioLoading, missingTickerKey, setPrices]);
}
