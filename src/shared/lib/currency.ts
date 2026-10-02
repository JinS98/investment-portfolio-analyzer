import type { MarketType } from '../../types';

export type DisplayCurrency = 'KRW' | 'USD';

export const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
export const formatDollar = (value: number) =>
  `$${value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function formatMarketMoney(value: number, market: MarketType): string {
  return market === 'KR' ? formatWon(value) : formatDollar(value);
}

export function formatCurrentMoney(
  value: number,
  market: MarketType,
  displayCurrency: DisplayCurrency,
  currentExchangeRate?: number | null,
): string {
  if (market === 'KR') return formatWon(value);
  if (displayCurrency === 'USD') return formatDollar(value);
  return currentExchangeRate && currentExchangeRate > 0
    ? formatWon(value * currentExchangeRate)
    : '환율 없음';
}

export function formatHistoricalMoney(
  value: number,
  market: MarketType,
  displayCurrency: DisplayCurrency,
  recordedExchangeRate?: number | null,
): string {
  return formatCurrentMoney(value, market, displayCurrency, recordedExchangeRate);
}

export function formatCompactMoney(
  value: number | null,
  currency: DisplayCurrency,
  displayCurrency: DisplayCurrency,
  exchangeRate?: number | null,
): string {
  if (value === null) return '-';
  if (currency === 'USD' && displayCurrency === 'USD') return `$${(value / 1_000_000).toFixed(1)}M`;
  let normalized = value;
  if (currency === 'USD') {
    if (!exchangeRate) return '환율 없음';
    normalized *= exchangeRate;
  }
  if (normalized >= 1_000_000_000_000) return `${(normalized / 1_000_000_000_000).toFixed(1)}조원`;
  if (normalized >= 100_000_000) return `${(normalized / 100_000_000).toFixed(1)}억원`;
  return `${(normalized / 10_000).toFixed(0)}만원`;
}
