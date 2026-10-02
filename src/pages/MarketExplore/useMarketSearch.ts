import { useEffect, useMemo, useState } from 'react';
import { isKoreanMarket } from '@entities/stock';
import { fetchCandlePage, fetchQuotes, searchStocks } from '../../services/tossApi';
import type { MarketExploreStock } from '../../services/marketExploreService';

type MarketFilter = 'KR' | 'US';

async function loadSearchChangeRates(stocks: MarketExploreStock[]): Promise<Map<string, number>> {
  const changeRates = new Map<string, number>();
  const concurrentRequests = 4;
  for (let index = 0; index < stocks.length; index += concurrentRequests) {
    await Promise.all(
      stocks.slice(index, index + concurrentRequests).map(async (stock) => {
        if (stock.price === null) return;
        try {
          const previousClose = (await fetchCandlePage(stock.symbol, 2)).candles.at(-2)?.closePrice;
          if (previousClose && previousClose > 0) {
            changeRates.set(stock.symbol, stock.price / previousClose - 1);
          }
        } catch {
          // A single unavailable candle must not hide the rest of the search results.
        }
      }),
    );
  }
  return changeRates;
}

export function useMarketSearch(
  overview: MarketExploreStock[],
  onError: (message: string) => void,
) {
  const [filter, setFilter] = useState<MarketFilter>('KR');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MarketExploreStock[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      searchStocks(normalizedQuery, controller.signal)
        .then(async (stocks) => {
          const quotes = await fetchQuotes(stocks.map((stock) => stock.symbol)).catch(() => []);
          const quotesBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
          const results = stocks.map<MarketExploreStock>((stock) => {
            const quote = quotesBySymbol.get(stock.symbol);
            return {
              ...stock,
              rank: 0,
              currency: quote?.currency ?? (isKoreanMarket(stock.market) ? 'KRW' : 'USD'),
              price: quote?.price ?? null,
              changeRate: null,
              tradingAmount: null,
            };
          });
          if (!controller.signal.aborted) setSearchResults(results);
          const changeRates = await loadSearchChangeRates(results);
          return results.map((stock) => ({
            ...stock,
            changeRate: changeRates.get(stock.symbol) ?? null,
          }));
        })
        .then((stocks) => {
          if (!controller.signal.aborted) setSearchResults(stocks);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            onError(
              cause instanceof Error
                ? cause.message
                : '종목 검색에 실패했습니다. 다시 시도해 주세요.',
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [onError, query]);

  const visibleStocks = useMemo(() => {
    const source = query.trim() ? searchResults : overview;
    return source.filter((stock) => {
      return filter === 'KR' ? isKoreanMarket(stock.market) : !isKoreanMarket(stock.market);
    });
  }, [filter, overview, query, searchResults]);

  return { filter, setFilter, query, setQuery, isSearching, visibleStocks };
}
