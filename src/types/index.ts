import type { DailyCandle } from './market';
export type {
  StockInfo,
  Quote,
  DailyCandle,
  CandlePage,
  Currency,
  ExchangeRate,
  HistoricalExchangeRate,
} from './market';
export type {
  PortfolioType,
  MarketType,
  HoldingHistoryType,
  HoldingHistorySource,
  Portfolio,
  Holding,
  HoldingHistory,
  HoldingHistoryInput,
  OpenTransactionModalParams,
  CurrencyPortfolioSummary,
  PortfolioSummary,
  RecalculatedPortfolio,
  PortfolioLedger,
} from './portfolio';
// ────────────────────────────────────────────
// 종목 정보
// ────────────────────────────────────────────
/**
 * Week 6까지 Firestore와 화면에서 사용한 직접 입력형 보유 모델.
 * Week 8 이관 전까지 유지하며, 새 이력 기반 `Holding`과 섞어 쓰지 않는다.
 */
export interface LegacyStockItem {
  id: string;
  ticker: string; // 국내: KRX 코드(005930), 미국: 티커(AAPL)
  market: 'KR' | 'US'; // 국내 / 미국
  name?: string;
  buyPrice: number;
  quantity: number;
  addedAt: string;
}

/** @deprecated Week 8 이관 전 기존 UI·저장 계층과의 호환을 위한 별칭이다. */
export type StockItem = LegacyStockItem;

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
export interface StockRiskData {
  ticker: string;
  observations: number;
  volatility: number | null;
  mdd: number | null;
}

export interface RiskData {
  volatility: number | null;
  mdd: number | null;
  concentration: number;
  maxWeight: number;
  analyzedTickers: string[];
  insufficientTickers: string[];
  stocks: StockRiskData[];
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
  totalBuyValue: number;
  totalValue: number;
  totalProfitAmount: number;
  totalProfitRate: number;
  exchangeRate: number | null;
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
  exchangeRate: import('./market').ExchangeRate | null;
  historicalData: Record<string, TossCandleItem[]>;
  lastMonthSnapshot: MonthlyPriceSnapshot | null;

  computedData: ComputedData | null;
  riskData: RiskData | null;
  signalData: SignalData | null;

  portfolioHistory: PortfolioHistory[];

  portfolios: import('./portfolio').Portfolio[];
  activePortfolioId: string | null;
  holdings: import('./portfolio').Holding[];
  holdingHistories: import('./portfolio').HoldingHistory[];
  portfolioSummary: import('./portfolio').PortfolioSummary | null;
  portfolioLedgers: Record<string, import('./portfolio').PortfolioLedger>;
  isSaving: boolean;
  ledgerError: string | null;
  isTransactionModalOpen: boolean;
  transactionModalType: import('./portfolio').HoldingHistoryType;
  transactionModalPreset: import('./portfolio').OpenTransactionModalParams | null;

  isLoading: boolean;
  isError: boolean;
  lastUpdated: string | null;

  addStock: (stock: StockItem) => void;
  updateStock: (id: string, updates: Pick<StockItem, 'buyPrice' | 'quantity'>) => void;
  removeStock: (id: string) => void;
  replacePortfolio: (portfolio: StockItem[]) => void;
  setPrices: (prices: PriceMap) => void;
  setExchangeRate: (exchangeRate: import('./market').ExchangeRate | null) => void;
  setHistoricalData: (data: Record<string, TossCandleItem[]>) => void;
  setLoading: (v: boolean) => void;
  setError: (v: boolean) => void;
  setLastUpdated: (date: string) => void;
  setPortfolioHistory: (history: PortfolioHistory[]) => void;
  upsertPortfolioHistory: (history: PortfolioHistory) => void;
  setLastMonthSnapshot: (snap: MonthlyPriceSnapshot) => void;
  setComputedData: (data: ComputedData) => void;
  setRiskData: (data: RiskData | null) => void;
  setSignalData: (data: SignalData) => void;
  loadPortfolioLedgers: (userId: string, shouldApply?: () => boolean) => Promise<void>;
  addHoldingHistory: (
    userId: string,
    input: import('./portfolio').HoldingHistoryInput,
  ) => Promise<void>;
  deleteHoldingHistory: (userId: string, portfolioId: string, historyId: string) => Promise<void>;
  setActivePortfolioId: (portfolioId: string) => void;
  resetPortfolioLedgers: () => void;
  openTransactionModal: (params?: import('./portfolio').OpenTransactionModalParams) => void;
  closeTransactionModal: () => void;
  setTransactionModalType: (type: import('./portfolio').HoldingHistoryType) => void;
  reset: () => void;
}

// Firebase 사용자
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
