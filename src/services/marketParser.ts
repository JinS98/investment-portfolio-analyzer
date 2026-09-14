import type { Currency, StockInfo, Quote, CandlePage } from '../types/market.ts';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('잘못된 API 응답입니다.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('API 문자열 필드가 누락되었습니다.');
  return value;
}
function decimal(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))
    throw new Error('잘못된 API 숫자입니다.');
  return Number(value);
}
function currency(value: unknown): Currency {
  if (value !== 'KRW' && value !== 'USD') throw new Error('지원하지 않는 통화입니다.');
  return value;
}
function timestamp(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('잘못된 API 시각입니다.');
  return result;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('API 목록이 누락되었습니다.');
  return value;
}
export function parseStocks(value: unknown): StockInfo[] {
  return list(value).map((entry) => {
    const row = object(entry);
    return {
      symbol: string(row.symbol),
      name: string(row.name),
      englishName: string(row.englishName),
      market: string(row.market),
      currency: currency(row.currency),
    };
  });
}
export function parseQuotes(value: unknown): Quote[] {
  return list(value).map((entry) => {
    const row = object(entry);
    return {
      symbol: string(row.symbol),
      price: decimal(row.lastPrice),
      currency: currency(row.currency),
      timestamp: row.timestamp == null ? null : timestamp(row.timestamp),
    };
  });
}
export function parseCandles(value: unknown): CandlePage {
  const page = object(value);
  const candles = list(page.candles)
    .map((entry) => {
      const row = object(entry);
      const time = timestamp(row.timestamp);
      return {
        date: time.slice(0, 10),
        timestamp: time,
        openPrice: decimal(row.openPrice),
        highPrice: decimal(row.highPrice),
        lowPrice: decimal(row.lowPrice),
        closePrice: decimal(row.closePrice),
        volume: decimal(row.volume),
        currency: currency(row.currency),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { candles, nextBefore: page.nextBefore == null ? null : timestamp(page.nextBefore) };
}
