import { marketFromCurrency } from '@entities/stock';
import { formatCompactMoney } from '@shared/lib';
import { formatCurrentMoney } from '../../utils/displayCurrency';
import type { DisplayCurrency } from '../../store/displayCurrencyStore';

export const money = (
  price: number | null,
  currency: 'KRW' | 'USD',
  displayCurrency: DisplayCurrency,
  exchangeRate?: number | null,
) => {
  if (price === null) return '시세 미조회';
  return formatCurrentMoney(price, marketFromCurrency(currency), displayCurrency, exchangeRate);
};

export const compactMoney = (
  value: number | null,
  currency: 'KRW' | 'USD',
  displayCurrency: DisplayCurrency,
  exchangeRate?: number | null,
) => formatCompactMoney(value, currency, displayCurrency, exchangeRate);
