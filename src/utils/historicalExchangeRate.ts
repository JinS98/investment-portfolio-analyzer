import type { HistoricalExchangeRate } from '../types/market';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseHistoricalExchangeRate(value: unknown): HistoricalExchangeRate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('과거 환율 응답 형식이 올바르지 않습니다.');
  }
  const row = value as Record<string, unknown>;
  const rate = Number(row.rate);
  if (
    row.baseCurrency !== 'USD' ||
    row.quoteCurrency !== 'KRW' ||
    !isCalendarDate(String(row.requestedDate)) ||
    !isCalendarDate(String(row.resolvedDate)) ||
    typeof row.source !== 'string' ||
    !row.source ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    throw new Error('과거 환율 응답이 올바르지 않습니다.');
  }
  return {
    baseCurrency: 'USD',
    quoteCurrency: 'KRW',
    requestedDate: String(row.requestedDate),
    resolvedDate: String(row.resolvedDate),
    rate,
    source: row.source,
  };
}
