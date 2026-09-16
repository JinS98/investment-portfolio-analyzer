import type { PriceMap } from '../types';
import { object, parseStocks, parseQuotes, parseCandles } from './marketParser';
import type {
  ExchangeRate,
  MarketIndicatorCandle,
  MarketIndicatorQuote,
  MarketIndicatorSymbol,
  MarketIndexData,
  RankingMarketCountry,
  StockRankingItem,
  StockRankingResponse,
  StockSearchItem,
} from '../types/market';
import type { HistoricalExchangeRate } from '../types/market';
import { createExpiringRequestCache } from '../utils/expiringRequestCache';
import { isCalendarDate, parseHistoricalExchangeRate } from '../utils/historicalExchangeRate';

const SEARCH_CACHE_TTL = 5 * 60 * 1000;
const SEARCH_CACHE_LIMIT = 100;
const stockSearchCache = new Map<string, { expiresAt: number; items: StockSearchItem[] }>();
const pendingStockSearches = new Map<string, Promise<StockSearchItem[]>>();
const quoteRequestCache = createExpiringRequestCache<PriceMap>(50);
const exchangeRateRequestCache = createExpiringRequestCache<ExchangeRate>(1);
const QUOTE_CACHE_TTL = 15_000;
const EXCHANGE_RATE_CACHE_TTL = 30_000;

const normalizeSearchQuery = (query: string) => query.normalize('NFKC').trim().toLowerCase();

function cacheSearchResult(query: string, items: StockSearchItem[]) {
  if (stockSearchCache.size >= SEARCH_CACHE_LIMIT) {
    stockSearchCache.delete(stockSearchCache.keys().next().value!);
  }
  stockSearchCache.set(query, { expiresAt: Date.now() + SEARCH_CACHE_TTL, items });
}

function waitForSearchResult<T>(request: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function searchStocks(query: string, signal: AbortSignal): Promise<StockSearchItem[]> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery || normalizedQuery.length > 80) return [];
  const cached = stockSearchCache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) {
    return waitForSearchResult(Promise.resolve(cached.items), signal);
  }
  if (cached) stockSearchCache.delete(normalizedQuery);

  let pending = pendingStockSearches.get(normalizedQuery);
  if (!pending) {
    pending = fetch('/api/toss/search?' + new URLSearchParams({ q: query.trim() }), {
      signal: AbortSignal.timeout(40_000),
    })
      .then(async (response) => {
        if (!response.headers.get('content-type')?.includes('application/json')) {
          throw new Error('종목 검색 서버에 연결할 수 없습니다.');
        }
        const data = object(await response.json());
        if (!response.ok) {
          throw new Error(
            typeof data.message === 'string' ? data.message : '종목 검색에 실패했습니다.',
          );
        }
        if (!Array.isArray(data.result))
          throw new Error('종목 검색 결과 형식이 올바르지 않습니다.');
        const items = data.result.map((value: unknown) => {
          const row = object(value);
          if (
            typeof row.symbol !== 'string' ||
            typeof row.name !== 'string' ||
            typeof row.market !== 'string'
          ) {
            throw new Error('종목 검색 정보가 올바르지 않습니다.');
          }
          return { symbol: row.symbol, name: row.name, market: row.market };
        });
        cacheSearchResult(normalizedQuery, items);
        return items;
      })
      .finally(() => pendingStockSearches.delete(normalizedQuery));
    pendingStockSearches.set(normalizedQuery, pending);
  }
  return waitForSearchResult(pending, signal);
}

async function request(endpoint: string, params: URLSearchParams): Promise<unknown> {
  const response = await fetch('/api/toss/' + endpoint + '?' + params, {
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('API ??? ????. npm run dev? ??????.');
  const data = object(await response.json());
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'API ?? ??');
  if (!('result' in data)) throw new Error('API ??? ???????.');
  return data.result;
}
function symbols(tickers: string[]): URLSearchParams {
  const values = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()))];
  if (values.length > 200 || values.some((value) => !/^[A-Z0-9.-]+$/.test(value)))
    throw new Error('??? ?? ??? ?? 200? ??????.');
  return new URLSearchParams({ symbols: values.join(',') });
}
export async function fetchStocks(tickers: string[]) {
  return tickers.length ? parseStocks(await request('stocks', symbols(tickers))) : [];
}
export async function fetchQuotes(tickers: string[]) {
  return tickers.length ? parseQuotes(await request('prices', symbols(tickers))) : [];
}

export async function fetchStockRankings(
  marketCountry: RankingMarketCountry,
  count = 20,
): Promise<StockRankingResponse> {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('랭킹 조회 개수는 1~100개여야 합니다.');
  }
  const result = object(
    await request('rankings', new URLSearchParams({ marketCountry, count: String(count) })),
  );
  if (!Array.isArray(result.rankings)) throw new Error('랭킹 응답 형식이 올바르지 않습니다.');
  const rankings = result.rankings.map((value: unknown): StockRankingItem => {
    const item = object(value);
    const price = object(item.price);
    const currency = item.currency;
    const rank = Number(item.rank);
    const lastPrice = Number(price.lastPrice);
    const basePrice = Number(price.basePrice);
    const changeRate = Number(price.changeRate);
    const tradingVolume = Number(item.tradingVolume);
    const tradingAmount = Number(item.tradingAmount);
    if (
      typeof item.symbol !== 'string' ||
      (currency !== 'KRW' && currency !== 'USD') ||
      !Number.isInteger(rank) ||
      rank < 1 ||
      ![lastPrice, basePrice, changeRate, tradingVolume, tradingAmount].every(Number.isFinite)
    ) {
      throw new Error('랭킹 응답에 올바르지 않은 값이 있습니다.');
    }
    return {
      rank,
      symbol: item.symbol,
      currency,
      price: lastPrice,
      basePrice,
      changeRate,
      tradingVolume,
      tradingAmount,
    };
  });
  return {
    rankedAt: typeof result.rankedAt === 'string' ? result.rankedAt : null,
    rankings,
  };
}

export async function fetchMarketIndicatorPrices(
  symbols: MarketIndicatorSymbol[],
): Promise<MarketIndicatorQuote[]> {
  if (!symbols.length || symbols.some((symbol) => symbol !== 'KOSPI' && symbol !== 'KOSDAQ')) {
    throw new Error('지원하는 지수 심볼을 입력해 주세요.');
  }
  const result = await request('indicator-prices', new URLSearchParams({ symbols: symbols.join(',') }));
  if (!Array.isArray(result)) throw new Error('지수 시세 응답 형식이 올바르지 않습니다.');
  return result.map((value): MarketIndicatorQuote => {
    const item = object(value);
    const price = Number(item.lastPrice);
    if ((item.symbol !== 'KOSPI' && item.symbol !== 'KOSDAQ') || !Number.isFinite(price)) {
      throw new Error('지수 시세 응답에 올바르지 않은 값이 있습니다.');
    }
    return { symbol: item.symbol, timestamp: typeof item.timestamp === 'string' ? item.timestamp : null, price };
  });
}

export async function fetchMarketIndicatorCandles(
  symbol: MarketIndicatorSymbol,
  count = 30,
): Promise<MarketIndicatorCandle[]> {
  if (!Number.isInteger(count) || count < 2 || count > 200) {
    throw new Error('지수 차트 조회 개수는 2~200개여야 합니다.');
  }
  const result = object(
    await request('indicator-candles', new URLSearchParams({ symbol, count: String(count) })),
  );
  if (!Array.isArray(result.candles)) throw new Error('지수 차트 응답 형식이 올바르지 않습니다.');
  return result.candles.map((value): MarketIndicatorCandle => {
    const item = object(value);
    const closePrice = Number(item.closePrice);
    if (typeof item.timestamp !== 'string' || !Number.isFinite(closePrice)) {
      throw new Error('지수 차트 응답에 올바르지 않은 값이 있습니다.');
    }
    return { timestamp: item.timestamp, closePrice };
  }).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export async function fetchUsMarketIndices(): Promise<MarketIndexData[]> {
  const result = await request('us-indices', new URLSearchParams());
  if (!Array.isArray(result)) throw new Error('미국 지수 응답 형식이 올바르지 않습니다.');
  return result.map((value): MarketIndexData => {
    const item = object(value);
    const price = Number(item.price);
    const changeRate = item.changeRate === null ? null : Number(item.changeRate);
    if (
      (item.symbol !== 'NASDAQ' && item.symbol !== 'SP500') ||
      !Number.isFinite(price) ||
      (changeRate !== null && !Number.isFinite(changeRate)) ||
      !Array.isArray(item.candles)
    ) {
      throw new Error('미국 지수 응답에 올바르지 않은 값이 있습니다.');
    }
    const candles = item.candles.map((value): MarketIndicatorCandle => {
      const candle = object(value);
      const closePrice = Number(candle.closePrice);
      if (typeof candle.timestamp !== 'string' || !Number.isFinite(closePrice)) {
        throw new Error('미국 지수 차트 응답에 올바르지 않은 값이 있습니다.');
      }
      return { timestamp: candle.timestamp, closePrice };
    });
    return { symbol: item.symbol, price, changeRate, candles };
  });
}
export async function fetchCurrentPrices(tickers: string[]): Promise<PriceMap> {
  const normalizedTickers = [
    ...new Set(tickers.map((ticker) => ticker.trim().toUpperCase())),
  ].sort();
  if (!normalizedTickers.length) return {};
  const cacheKey = normalizedTickers.join(',');
  const prices = await quoteRequestCache.getOrLoad(cacheKey, QUOTE_CACHE_TTL, async () => {
    const quotes = await fetchQuotes(normalizedTickers);
    const result = Object.fromEntries(quotes.map((quote) => [quote.symbol, quote.price]));
    if (normalizedTickers.some((ticker) => result[ticker] === undefined)) {
      throw new Error('현재가 응답에 요청 종목이 없습니다.');
    }
    return result;
  });
  return { ...prices };
}

export async function fetchUsdKrwExchangeRate(): Promise<ExchangeRate> {
  const exchangeRate = await exchangeRateRequestCache.getOrLoad(
    'USD/KRW',
    EXCHANGE_RATE_CACHE_TTL,
    async () => {
      const result = object(await request('exchange-rate', new URLSearchParams()));
      const rate = Number(result.rate);
      const midRate = Number(result.midRate);
      if (
        result.baseCurrency !== 'USD' ||
        result.quoteCurrency !== 'KRW' ||
        !Number.isFinite(rate) ||
        rate <= 0 ||
        !Number.isFinite(midRate) ||
        midRate <= 0 ||
        typeof result.validFrom !== 'string' ||
        typeof result.validUntil !== 'string'
      ) {
        throw new Error('환율 API 응답이 올바르지 않습니다.');
      }
      return {
        baseCurrency: 'USD',
        quoteCurrency: 'KRW',
        rate,
        midRate,
        validFrom: result.validFrom,
        validUntil: result.validUntil,
      };
    },
  );
  return { ...exchangeRate };
}

export async function fetchHistoricalUsdKrwExchangeRate(
  targetDate: string,
): Promise<HistoricalExchangeRate> {
  if (!isCalendarDate(targetDate)) throw new Error('거래일은 YYYY-MM-DD 형식으로 입력해 주세요.');
  const response = await fetch(
    '/api/toss/historical-exchange-rate?' + new URLSearchParams({ date: targetDate }),
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('과거 환율 서버에 연결할 수 없습니다.');
  }
  const data = object(await response.json());
  if (!response.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : '과거 환율을 불러오지 못했습니다.',
    );
  }
  if (!('result' in data)) throw new Error('과거 환율 응답이 올바르지 않습니다.');
  return parseHistoricalExchangeRate(data.result);
}
export async function fetchCandlePage(ticker: string, count = 90, before?: string) {
  symbols([ticker]);
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error('?? ??? 1~200?? ??????.');
  const params = new URLSearchParams({ symbol: ticker.trim().toUpperCase(), count: String(count) });
  if (before) params.set('before', before);
  return parseCandles(await request('candles', params));
}
export async function fetchCandles(ticker: string, count = 90) {
  return (await fetchCandlePage(ticker, count)).candles;
}
export async function fetchClosePriceAt(
  ticker: string,
  targetDate: string,
): Promise<number | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(Date.parse(targetDate)))
    throw new Error('??? YYYY-MM-DD? ??????.');
  const end = new Date(targetDate + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 2);
  const page = await fetchCandlePage(ticker, 10, end.toISOString());
  return page.candles.filter((candle) => candle.date <= targetDate).at(-1)?.closePrice ?? null;
}
