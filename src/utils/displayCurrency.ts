import type { MarketType } from '../types';
import type { DisplayCurrency } from '../store/displayCurrencyStore';

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const dollar = (value: number) =>
  `$${value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function formatCurrentMoney(
  value: number,
  market: MarketType,
  displayCurrency: DisplayCurrency,
  currentExchangeRate?: number | null,
): string {
  if (market === 'KR') return won(value);
  if (displayCurrency === 'USD') return dollar(value);
  return currentExchangeRate && currentExchangeRate > 0
    ? won(value * currentExchangeRate)
    : '환율 없음';
}

export function formatHistoricalMoney(
  value: number,
  market: MarketType,
  displayCurrency: DisplayCurrency,
  recordedExchangeRate?: number | null,
): string {
  if (market === 'KR') return won(value);
  if (displayCurrency === 'USD') return dollar(value);
  return recordedExchangeRate && recordedExchangeRate > 0
    ? won(value * recordedExchangeRate)
    : '환율 없음';
}
