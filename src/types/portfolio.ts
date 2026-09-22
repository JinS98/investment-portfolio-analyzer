/** 실제 보유와 가상 보유를 구분하는 포트폴리오 종류. */
export type PortfolioType = 'REAL' | 'VIRTUAL';

/** 거래 대상 시장. 가격과 비용은 해당 시장의 통화(KR=KRW, US=USD)로 기록한다. */
export type MarketType = 'KR' | 'US';

/** 보유 수량을 변경하는 이력의 종류. */
export type HoldingHistoryType = 'BUY' | 'SELL';

/** 거래 이력이 생성된 경로. 기존 직접 입력형 보유 데이터 이관도 구분해 보관한다. */
export type HoldingHistorySource = 'MANUAL' | 'LEGACY_IMPORT' | 'RECURRING';

/** 적립식 투자 규칙의 실행 주기. */
export type RecurringInvestmentFrequency = 'WEEKLY' | 'MONTHLY';

/** 규칙 실행 여부. */
export type RecurringInvestmentStatus = 'ACTIVE' | 'PAUSED';
export type RecurringExecutionStatus = 'PENDING' | 'CONFIRMED';
export type RecurringExecutionResult = 'SUCCEEDED' | 'FAILED';

/** 자동 매수 반영 시도 결과. 실패 이력과 재시도 결과를 함께 보관한다. */
export interface RecurringInvestmentExecution {
  id: string;
  portfolioId: string;
  ruleId: string;
  ruleName: string;
  ticker: string;
  result: RecurringExecutionResult;
  attemptedAt: number;
  executedCount: number;
  executedDates: string[];
  errorMessage?: string;
  triggeredByRetry: boolean;
}

/** 포트폴리오에 연결된 적립식 매수 규칙. */
export interface RecurringInvestmentRule {
  id: string;
  portfolioId: string;
  portfolioType: PortfolioType;
  ticker: string;
  name?: string;
  market: MarketType;
  quantity: number;
  frequency: RecurringInvestmentFrequency;
  /** WEEKLY일 때 1(월)~5(금). */
  weeklyDay?: number;
  /** MONTHLY일 때 1~31. 해당 일이 없는 달은 마지막 날, 주말·휴장일은 다음 거래일에 실행한다. */
  monthlyDay?: number;
  startDate: string;
  /** 적립식 매수가 마지막으로 거래 이력에 반영된 날짜. */
  lastExecutedDate?: string;
  status: RecurringInvestmentStatus;
  createdAt: number;
  updatedAt: number;
}

/** 적립식 규칙을 생성할 때 받는 값. */
export interface RecurringInvestmentRuleInput {
  portfolioId: string;
  portfolioType: PortfolioType;
  ticker: string;
  name?: string;
  market: MarketType;
  quantity: number;
  frequency: RecurringInvestmentFrequency;
  weeklyDay?: number;
  monthlyDay?: number;
  startDate: string;
  status?: RecurringInvestmentStatus;
}

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
  /** USD 거래에 적용한 거래일 기준 USD/KRW 환율. 기존 거래에는 없을 수 있다. */
  exchangeRate?: number;
  /** 휴장일 보정 후 실제 환율을 적용한 영업일. */
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  createdAt: number;
  updatedAt?: number;
  source?: HoldingHistorySource;
  /** 적립식 투자 규칙에서 생성된 거래 이력의 원본 규칙 ID. */
  recurringRuleId?: string;
  /** 적립식 규칙명. 규칙이 삭제돼도 과거 거래 이력에서 출처를 확인한다. */
  recurringRuleName?: string;
  /** 휴장일 보정 전 규칙이 지정한 원래 매수 예정일. */
  scheduledDate?: string;
  recurringExecutionStatus?: RecurringExecutionStatus;
  legacyStockId?: string;
  importedAt?: number;
  legacyAddedAt?: string;
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
  source?: HoldingHistorySource;
  recurringRuleId?: string;
  recurringRuleName?: string;
  scheduledDate?: string;
  recurringExecutionStatus?: RecurringExecutionStatus;
}

/** 거래 모달을 열 때 채워 넣을 선택 항목이다. 시장 탐색 화면에서도 같은 형태로 사용한다. */
export interface OpenTransactionModalParams {
  type?: HoldingHistoryType;
  portfolioId?: string;
  ticker?: string;
  name?: string;
  market?: MarketType;
  price?: number;
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

/** 포트폴리오 하나의 원장·보유 상태·요약을 함께 전달하는 읽기 모델. */
export interface PortfolioLedger {
  portfolio: Portfolio;
  holdings: Holding[];
  histories: HoldingHistory[];
  summary: PortfolioSummary;
}
