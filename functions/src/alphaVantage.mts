import type { FinancialStatement } from './dart.mjs';

const BASE = 'https://www.alphavantage.co/query';
const DAY = 86_400_000;
const ERROR_TTL = 5 * 60_000;
const REQUEST_INTERVAL = 1_100;
const cache = new Map<string, { expires: number; value: AlphaResult }>();
const pending = new Map<string, Promise<AlphaResult>>();
let requestQueue: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;

type Row = Record<string, unknown>;
type Payload = Record<string, unknown>;

export interface UsMetricInputs {
  year: number;
  currency: string;
  eps: number | null;
  bps: number | null;
  roe: number | null;
  dividendPerShare: number | null;
}

export type AlphaFinancialStatement = Omit<FinancialStatement, 'basis'> & {
  source: 'ALPHA_VANTAGE';
  basis: 'N/A';
  periodEnd: string;
};

export interface AlphaResult {
  financialStatement: AlphaFinancialStatement | null;
  financialStatementMessage: string | null;
  usMetricInputs: UsMetricInputs | null;
  fundamentalsMessage: string | null;
}

class AlphaError extends Error {}

const number = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (value === '' || value === 'None') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const positive = (value: number | null): value is number => value !== null && value > 0;

const rows = (payload: Payload, key: string): Row[] =>
  Array.isArray(payload[key])
    ? (payload[key] as unknown[]).filter(
        (row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row),
      )
    : [];

const date = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const reportedCurrency = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
};

function annualDividends(payload: Payload, today: Date): number | null {
  const data = rows(payload, 'data');
  const dividends = data.length ? data : rows(payload, 'dividends');
  if (!Array.isArray(payload.data) && !Array.isArray(payload.dividends)) return null;
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const beginning = start.toISOString().slice(0, 10);
  let total = 0;
  for (const item of dividends) {
    const exDate = item.ex_dividend_date ?? item.exDividendDate;
    const amount = number(item.amount);
    if (!date(exDate) || exDate <= beginning || exDate > end) continue;
    if (amount === null || amount < 0) return null;
    total += amount;
  }
  return total;
}

export function normalizeAlphaVantage(
  income: Payload,
  balance: Payload,
  earnings: Payload,
  dividends: Payload,
  today = new Date(),
): AlphaResult {
  const incomes = rows(income, 'annualReports').filter((row) => date(row.fiscalDateEnding));
  const balances = rows(balance, 'annualReports').filter((row) => date(row.fiscalDateEnding));
  const latest = incomes.sort((a, b) =>
    String(b.fiscalDateEnding).localeCompare(String(a.fiscalDateEnding)),
  )[0];
  const periodEnd = latest?.fiscalDateEnding;
  const current = balances.find((row) => row.fiscalDateEnding === periodEnd);
  if (!date(periodEnd) || !current) {
    return {
      financialStatement: null,
      financialStatementMessage: 'Alpha Vantage의 연간 재무제표가 없습니다.',
      usMetricInputs: null,
      fundamentalsMessage: '연간 재무제표가 없어 지표를 계산할 수 없습니다.',
    };
  }
  const incomeCurrency = reportedCurrency(latest.reportedCurrency);
  const balanceCurrency = reportedCurrency(current.reportedCurrency);
  const currency = incomeCurrency ?? balanceCurrency;
  if (!currency || (incomeCurrency && balanceCurrency && incomeCurrency !== balanceCurrency)) {
    return {
      financialStatement: null,
      financialStatementMessage: 'Alpha Vantage 재무제표의 통화 기준이 일치하지 않습니다.',
      usMetricInputs: null,
      fundamentalsMessage: '재무제표 통화 기준을 확인할 수 없습니다.',
    };
  }
  const netIncome = number(latest.netIncome);
  const equity = number(current.totalShareholderEquity);
  const prior = balances
    .filter(
      (row) =>
        date(row.fiscalDateEnding) &&
        row.fiscalDateEnding < periodEnd &&
        (Date.parse(periodEnd) - Date.parse(row.fiscalDateEnding)) / DAY <= 400 &&
        (!reportedCurrency(row.reportedCurrency) ||
          reportedCurrency(row.reportedCurrency) === currency),
    )
    .sort((a, b) => String(b.fiscalDateEnding).localeCompare(String(a.fiscalDateEnding)))[0];
  const priorEquity = number(prior?.totalShareholderEquity);
  const shares = number(current.commonStockSharesOutstanding);
  const epsRow = rows(earnings, 'annualEarnings').find((row) => row.fiscalDateEnding === periodEnd);
  const eps = number(epsRow?.reportedEPS);
  const dividendPerShare = annualDividends(dividends, today);
  const statement: AlphaFinancialStatement = {
    source: 'ALPHA_VANTAGE',
    year: Number(periodEnd.slice(0, 4)),
    basis: 'N/A',
    currency,
    receiptNo: null,
    periodEnd,
    revenue: number(latest.totalRevenue),
    operatingProfit: number(latest.operatingIncome),
    netIncome,
    assets: number(current.totalAssets),
    liabilities: number(current.totalLiabilities),
    equity,
  };
  return {
    financialStatement: statement,
    financialStatementMessage: null,
    usMetricInputs: {
      year: statement.year,
      currency,
      eps: currency === 'USD' ? eps : null,
      bps: currency === 'USD' && positive(equity) && positive(shares) ? equity / shares : null,
      roe:
        netIncome !== null && positive(equity) && positive(priorEquity)
          ? (netIncome / ((equity + priorEquity) / 2)) * 100
          : null,
      dividendPerShare: currency === 'USD' ? dividendPerShare : null,
    },
    fundamentalsMessage: null,
  };
}

function alphaMessage(payload: Payload): string | null {
  const upstream = [payload.Information, payload.Note, payload['Error Message']].find(
    (value): value is string => typeof value === 'string',
  );
  if (!upstream) return null;
  if (
    /1 request per second|requests more sparingly|burst limit|rate limit|frequency|requests per day|calls per day/i.test(
      upstream,
    )
  )
    return 'Alpha Vantage 무료 호출 간격 또는 일일 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.';
  if (/premium|subscription|entitlement|access/i.test(upstream))
    return 'Alpha Vantage 계정의 해당 데이터 이용 권한을 확인해 주세요.';
  if (/limit|frequency|requests|calls/i.test(upstream))
    return 'Alpha Vantage 무료 호출 간격 또는 일일 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.';
  return 'Alpha Vantage 응답을 확인할 수 없습니다. API 키와 종목 코드를 확인해 주세요.';
}

function scheduleRequest<T>(task: () => Promise<T>): Promise<T> {
  const scheduled = requestQueue.then(async () => {
    const delay = nextRequestAt - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + REQUEST_INTERVAL;
    return task();
  });
  requestQueue = scheduled.catch(() => undefined);
  return scheduled;
}

async function request(functionName: string, symbol: string, key: string): Promise<Payload> {
  return scheduleRequest(async () => {
    const url = `${BASE}?${new URLSearchParams({ function: functionName, symbol, apikey: key })}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(17_000) });
    if (!response.ok) {
      throw new AlphaError(
        response.status === 401 || response.status === 403
          ? 'Alpha Vantage API 키와 이용 권한을 확인해 주세요.'
          : response.status === 429
            ? 'Alpha Vantage 호출 한도에 도달했습니다. 나중에 다시 확인해 주세요.'
            : 'Alpha Vantage 재무정보를 불러오지 못했습니다.',
      );
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new AlphaError('Alpha Vantage 응답 형식이 올바르지 않습니다.');
    const message = alphaMessage(payload as Payload);
    if (message) throw new AlphaError(message);
    return payload as Payload;
  });
}

export async function fetchAlphaVantage(symbol: string, key?: string): Promise<AlphaResult> {
  if (!key) {
    return {
      financialStatement: null,
      financialStatementMessage: 'ALPHA_VANTAGE_API_KEY를 설정하면 미국 재무제표를 볼 수 있습니다.',
      usMetricInputs: null,
      fundamentalsMessage: 'ALPHA_VANTAGE_API_KEY를 설정하면 미국 재무지표를 볼 수 있습니다.',
    };
  }
  const ticker = symbol.trim().toUpperCase();
  const cached = cache.get(ticker);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending.has(ticker)) return pending.get(ticker)!;
  const task = (async (): Promise<AlphaResult> => {
    try {
      const [income, balance] = await Promise.allSettled([
        request('INCOME_STATEMENT', ticker, key),
        request('BALANCE_SHEET', ticker, key),
      ]);
      if (income.status === 'rejected') throw income.reason;
      if (balance.status === 'rejected') throw balance.reason;
      const [earnings, dividends] = await Promise.allSettled([
        request('EARNINGS', ticker, key),
        request('DIVIDENDS', ticker, key),
      ]);
      const result = normalizeAlphaVantage(
        income.value,
        balance.value,
        earnings.status === 'fulfilled' ? earnings.value : {},
        dividends.status === 'fulfilled' ? dividends.value : {},
      );
      if (
        result.usMetricInputs &&
        (earnings.status === 'rejected' || dividends.status === 'rejected')
      )
        result.fundamentalsMessage =
          '일부 지표 자료를 불러오지 못했습니다. 표시되지 않은 값은 나중에 다시 확인해 주세요.';
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(ticker, {
        expires: Date.now() + (result.financialStatement ? DAY : 15 * 60_000),
        value: result,
      });
      return result;
    } catch (cause) {
      const message =
        cause instanceof AlphaError
          ? cause.message
          : 'Alpha Vantage 재무정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
      const result: AlphaResult = {
        financialStatement: null,
        financialStatementMessage: message,
        usMetricInputs: null,
        fundamentalsMessage: message,
      };
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(ticker, { expires: Date.now() + ERROR_TTL, value: result });
      return result;
    }
  })();
  pending.set(ticker, task);
  try {
    return await task;
  } finally {
    pending.delete(ticker);
  }
}
