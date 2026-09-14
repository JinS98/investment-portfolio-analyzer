import type { DailyCandle } from './market';
export type { StockInfo, Quote, DailyCandle, CandlePage, Currency } from './market';
// ────────────────────────────────────────────
// 종목 정보
// ────────────────────────────────────────────
export interface StockItem {
  id: string;
  ticker: string;       // 국내: KRX 코드(005930), 미국: 티커(AAPL)
  market: 'KR' | 'US'; // 국내 / 미국
  name?: string;
  buyPrice: number;
  quantity: number;
  addedAt: string;
}

// 현재가 맵 { AAPL: 182.3, '005930': 72000 }
export type PriceMap = Record<string, number>;

// 종목별 계산 결과
export interface ComputedStock extends StockItem {
  currentPrice: number;
  evaluatedValue: number;
  profitAmount: number;
  profitRate: number;
  weight: number;
}

// 포트폴리오 계산 결과 요약
export interface ComputedData {
  stocks: ComputedStock[];
  totalBuyValue: number;
  totalEvaluatedValue: number;
  totalProfitAmount: number;
  totalProfitRate: number;
}

// 리스크 데이터
export interface RiskData {
  volatility: number;
  mdd: number;
  concentration: number;
}

// 월별 투자 시그널
export type SignalZone = 'bear' | 'flat' | 'bull' | 'hot';
export type MonthlyChangeMap = Record<string, number>;

export interface SignalData {
  zone: SignalZone;
  changes: MonthlyChangeMap;
  budgetRecommendation: number;
  strategyNote: string;
}

// 포트폴리오 히스토리 스냅샷
export interface PortfolioHistory {
  id?: string;
  userId: string;
  date: string;
  totalValue: number;
  totalProfitRate: number;
  savedAt: string;
}

// 월별 종가 스냅샷
export interface MonthlyPriceSnapshot {
  id?: string;
  userId: string;
  yearMonth: string;
  prices: PriceMap;
  savedAt: string;
}

// ────────────────────────────────────────────
// 토스증권 API 응답 타입
// ────────────────────────────────────────────
export interface TossTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type TossPriceItem = import('./market').Quote;

export type TossCandleItem = DailyCandle;

export interface TossHolding {
  code: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  market: 'KR' | 'US';
}

// ────────────────────────────────────────────
// Zustand 전체 상태
// ────────────────────────────────────────────
export interface PortfolioState {
  portfolio: StockItem[];
  prices: PriceMap;
  historicalData: Record<string, TossCandleItem[]>;
  lastMonthSnapshot: MonthlyPriceSnapshot | null;

  computedData: ComputedData | null;
  riskData: RiskData | null;
  signalData: SignalData | null;

  portfolioHistory: PortfolioHistory[];

  isLoading: boolean;
  isError: boolean;
  lastUpdated: string | null;

  addStock: (stock: Omit<StockItem, 'id' | 'addedAt'>) => void;
  updateStock: (id: string, updates: Partial<StockItem>) => void;
  removeStock: (id: string) => void;
  setPrices: (prices: PriceMap) => void;
  setHistoricalData: (data: Record<string, TossCandleItem[]>) => void;
  setLoading: (v: boolean) => void;
  setError: (v: boolean) => void;
  setLastUpdated: (date: string) => void;
  setPortfolioHistory: (history: PortfolioHistory[]) => void;
  setLastMonthSnapshot: (snap: MonthlyPriceSnapshot) => void;
  setComputedData: (data: ComputedData) => void;
  setRiskData: (data: RiskData) => void;
  setSignalData: (data: SignalData) => void;
  reset: () => void;
}

// Firebase 사용자
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
