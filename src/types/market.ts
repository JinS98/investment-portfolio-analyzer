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
