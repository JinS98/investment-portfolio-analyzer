import type { PriceMap } from '../types';
import { object, parseStocks, parseQuotes, parseCandles } from './marketParser';
import type { ExchangeRate, StockSearchItem } from '../types/market';

export async function searchStocks(query: string, signal: AbortSignal): Promise<StockSearchItem[]> {
  const response = await fetch('/api/toss/search?' + new URLSearchParams({ q: query }), { signal });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('검색 서버에 연결할 수 없습니다.');
  const data = object(await response.json());
  if (!response.ok)
    throw new Error(typeof data.message === 'string' ? data.message : '종목 검색에 실패했습니다.');
  if (!Array.isArray(data.result)) throw new Error('잘못된 검색 결과입니다.');
  return data.result.map((value: unknown) => {
    const row = object(value);
    if (
      typeof row.symbol !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.market !== 'string'
    )
      throw new Error('잘못된 종목 정보입니다.');
    return { symbol: row.symbol, name: row.name, market: row.market };
  });
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
export async function fetchCurrentPrices(tickers: string[]): Promise<PriceMap> {
  const quotes = await fetchQuotes(tickers);
  const result = Object.fromEntries(quotes.map((quote) => [quote.symbol, quote.price]));
  if (tickers.some((ticker) => result[ticker.trim().toUpperCase()] === undefined))
    throw new Error('?? ??? ???? ???????.');
  return result;
}
export async function fetchUsdKrwExchangeRate(): Promise<ExchangeRate> {
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
