import { useEffect, useRef, useState } from 'react';
import { searchStocks } from '../../../services/tossApi';
import type { StockSearchItem } from '../../../types/market';
import { loadRecentStockSearches, saveRecentStockSearch } from '../../../utils/recentStockSearches';

interface UseStockSearchOptions {
  enabled?: boolean;
  debounceMs?: number;
  search?: typeof searchStocks;
}

export function useStockSearch({
  enabled = true,
  debounceMs = 250,
  search = searchStocks,
}: UseStockSearchOptions = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<StockSearchItem[]>(loadRecentStockSearches);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const requestSequence = useRef(0);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!enabled || !normalizedQuery) {
      requestSequence.current += 1;
      return;
    }

    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus('loading');
      search(normalizedQuery, controller.signal)
        .then((items) => {
          if (sequence !== requestSequence.current) return;
          setResults(items);
          setStatus('success');
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || sequence !== requestSequence.current) return;
          setResults([]);
          setStatus('error');
          if (error instanceof Error && error.name === 'AbortError') return;
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, enabled, query, search]);

  const select = (item: StockSearchItem) => {
    requestSequence.current += 1;
    setQuery(`${item.name} (${item.symbol})`);
    setResults([]);
    setStatus('idle');
    setRecentSearches(saveRecentStockSearch(item));
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      requestSequence.current += 1;
      setResults([]);
      setStatus('idle');
    }
  };

  const clear = () => {
    requestSequence.current += 1;
    setQuery('');
    setResults([]);
    setStatus('idle');
  };

  return { query, setQuery: updateQuery, results, recentSearches, status, select, clear };
}
