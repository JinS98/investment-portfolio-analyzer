/** 실제 보유와 가상 보유를 구분하는 포트폴리오 종류. */
export type PortfolioType = 'REAL' | 'VIRTUAL';

/** 거래 대상 시장. 가격과 비용은 해당 시장의 통화(KR=KRW, US=USD)로 기록한다. */
export type MarketType = 'KR' | 'US';

/** 보유 수량을 변경하는 이력의 종류. */
export type HoldingHistoryType = 'BUY' | 'SELL';

/**
 * 사용자별 포트폴리오 메타데이터.
 * MVP에서는 사용자당 REAL 1개와 VIRTUAL 1개를 사용한다.
 */
export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  type: PortfolioType;
  createdAt: number;
  updatedAt: number;
}

/**
 * 거래 이력으로부터 재생성한 현재 보유 상태.
 * `averagePrice`와 `investedAmount`는 이력 계산 결과이므로 직접 수정하지 않는다.
 */
export interface Holding {
  portfolioId: string;
  ticker: string;
  name?: string;
  market: MarketType;
  quantity: number;
  averagePrice: number;
  investedAmount: number;
  lastTransactionAt?: number;
}

/** 거래 원장의 한 행. 계산 시 이 타입이 원본 데이터(Source of Truth)다. */
export interface HoldingHistory {
  id: string;
  portfolioId: string;
  portfolioType: PortfolioType;
  ticker: string;
  name?: string;
  market: MarketType;
  type: HoldingHistoryType;
  price: number;
  quantity: number;
  grossAmount: number;
  fee: number;
  tax: number;
  realizedPnL: number;
  date: string;
  createdAt: number;
  updatedAt?: number;
}

/** UI와 저장 계층이 받는 거래 입력값. 계산 필드는 엔진이 생성한다. */
export interface HoldingHistoryInput {
  portfolioId: string;
  portfolioType: PortfolioType;
  ticker: string;
  name?: string;
  market: MarketType;
  type: HoldingHistoryType;
  price: number;
  quantity: number;
  fee?: number;
  tax?: number;
  date: string;
}

/** 시장 통화별 손익 요약. 서로 다른 통화는 이 단계에서 합산하지 않는다. */
export interface CurrencyPortfolioSummary {
  market: MarketType;
  totalInvestment: number;
  totalEvaluated: number | null;
  unrealizedPnL: number | null;
  realizedPnL: number;
  totalFees: number;
  totalTaxes: number;
  totalPnL: number | null;
  netPnL: number | null;
}

/** 포트폴리오의 계산 결과. 평가 가격이 없으면 해당 시장의 평가값은 null이다. */
export interface PortfolioSummary {
  portfolioId: string;
  byMarket: Partial<Record<MarketType, CurrencyPortfolioSummary>>;
}

/** 재계산 엔진의 반환 형태. */
export interface RecalculatedPortfolio {
  holdings: Holding[];
  histories: HoldingHistory[];
  summary: PortfolioSummary;
}
