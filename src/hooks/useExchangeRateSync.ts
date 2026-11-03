import { useEffect } from 'react';
import { fetchUsdKrwExchangeRate } from '../services/tossApi';
import { usePortfolioStore } from '../store/portfolioStore';

export function useExchangeRateSync(enabled: boolean, sessionKey: string | null) {
  const setExchangeRate = usePortfolioStore((state) => state.setExchangeRate);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const load = async () => {
      try {
        const rate = await fetchUsdKrwExchangeRate();
        if (active) setExchangeRate(rate);
      } catch {
        if (!active) return;
        const delay = Math.min(60_000, 1_000 * 3 ** Math.min(failures, 4));
        failures += 1;
        retryTimer = setTimeout(() => void load(), delay);
      }
    };

    void load();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, sessionKey, setExchangeRate]);
}
