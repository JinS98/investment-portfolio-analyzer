export interface FinancialStatement {
  source?: 'DART' | 'SEC';
  periodStart?: string;
  periodEnd?: string;
  filedAt?: string;
  reportUrl?: string;
  year: number;
  basis: 'CFS' | 'OFS';
  currency: string;
  receiptNo: string | null;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
}

export interface StockFundamentals {
  per: number | null;
  pbr: number | null;
  roe: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

export interface MarketNewsArticle {
  title: string;
  url: string;
  publishedAt: string | null;
  source: string;
  summary: string | null;
}

export interface DomesticMetricInputs {
  year: number;
  basis: 'CFS' | 'OFS';
  eps: number | null;
  bps: number | null;
  roe: number | null;
  dividendPerShare: number | null;
}

export interface StockInsights {
  domesticMetricInputs?: DomesticMetricInputs | null;
  domesticMetricsMessage?: string | null;
  financialStatement?: FinancialStatement | null;
  financialStatementMessage?: string | null;
  fundamentals: StockFundamentals | null;
  fundamentalsMessage: string | null;
  news: MarketNewsArticle[];
  newsMessage: string | null;
}

type Market = 'KR' | 'US';

export async function fetchStockInsights(
  symbol: string,
  name: string,
  market: Market,
  signal?: AbortSignal,
): Promise<StockInsights> {
  const response = await fetch(
    '/api/toss/stock-insights?' + new URLSearchParams({ symbol, name, market }),
    { signal: signal ?? AbortSignal.timeout(20_000) },
  );
  const body = (await response.json()) as { result?: StockInsights; message?: unknown };
  if (!response.ok || !body.result) {
    throw new Error(
      typeof body.message === 'string' ? body.message : '상세 정보를 불러오지 못했습니다.',
    );
  }
  return body.result;
}
