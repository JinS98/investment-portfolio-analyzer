export type Currency = 'KRW' | 'USD';
export interface StockSearchItem {
  symbol: string;
  name: string;
  market: string;
}
export interface StockInfo {
  symbol: string;
  name: string;
  englishName: string;
  market: string;
  currency: Currency;
}
export interface Quote {
  symbol: string;
  price: number;
  currency: Currency;
  timestamp: string | null;
}
export interface DailyCandle {
  date: string;
  timestamp: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  currency: Currency;
}
export interface CandlePage {
  candles: DailyCandle[];
  nextBefore: string | null;
}
export interface ExchangeRate {
  baseCurrency: 'USD';
  quoteCurrency: 'KRW';
  rate: number;
  midRate: number;
  validFrom: string;
  validUntil: string;
}

/** A USD/KRW daily reference rate resolved for a portfolio transaction date. */
export interface HistoricalExchangeRate {
  baseCurrency: 'USD';
  quoteCurrency: 'KRW';
  /** The calendar date requested by the user. */
  requestedDate: string;
  /** The business date that supplied the rate. Can precede requestedDate on holidays. */
  resolvedDate: string;
  rate: number;
  source: string;
}
