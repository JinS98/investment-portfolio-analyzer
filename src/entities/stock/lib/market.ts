import type { Currency } from '../../../types/market';
import type { MarketType } from '../../../types';

export const KOREAN_MARKETS = ['KOSPI', 'KOSDAQ', 'KR_ETC'] as const;

export function isKoreanMarket(market: string): boolean {
  return KOREAN_MARKETS.includes(market as (typeof KOREAN_MARKETS)[number]);
}

export function marketFromCurrency(currency: Currency): MarketType {
  return currency === 'KRW' ? 'KR' : 'US';
}
