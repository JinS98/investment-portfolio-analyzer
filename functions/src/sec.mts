import type { FinancialStatement } from './dart.mjs';

const DAY = 86_400_000;
const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A']);
type Fact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  form?: string;
  filed?: string;
};
type Concept = { units?: Record<string, Fact[]> };
export type CompanyFacts = { facts?: Record<string, Record<string, Concept>> };
export type AnnualReport = {
  accession: string;
  end: string;
  filed: string;
  form: string;
  document: string;
};
export interface SecFinancialStatement extends FinancialStatement {
  source: 'SEC';
  periodStart: string;
  periodEnd: string;
  filedAt: string;
  reportUrl: string;
}
type Result = {
  financialStatement: SecFinancialStatement | null;
  financialStatementMessage: string | null;
};
let tickers: { expires: number; codes: Map<string, string> } | undefined;
let tickerRequest: Promise<Map<string, string>> | undefined;
let requestQueue: Promise<void> = Promise.resolve();
let lastRequest = 0;
const cache = new Map<string, { expires: number; value: Result }>();
const pending = new Map<string, Promise<Result>>();
class SecError extends Error {}

const concepts = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'Revenue',
  ],
  operatingProfit: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  assets: ['Assets'],
  liabilities: ['Liabilities'],
  equity: [
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'StockholdersEquity',
    'Equity',
  ],
} as const;

function availableConcepts(body: CompanyFacts, names: readonly string[]): Concept[] {
  return names.flatMap((name) =>
    ['us-gaap', 'ifrs-full'].flatMap((namespace) => {
      const concept = body.facts?.[namespace]?.[name];
      return concept ? [concept] : [];
    }),
  );
}

function annualFact(fact: Fact, report: AnnualReport): boolean {
  if (
    fact.accn !== report.accession ||
    fact.end !== report.end ||
    !fact.start ||
    !Number.isFinite(fact.val)
  )
    return false;
  const days = (Date.parse(fact.end) - Date.parse(fact.start)) / DAY;
  return days >= 300 && days <= 400;
}

export function annualReports(recent: Record<string, unknown>): AnnualReport[] {
  const array = (key: string): unknown[] => (Array.isArray(recent[key]) ? recent[key] : []);
  return array('form')
    .flatMap((form, i) => {
      const accession = array('accessionNumber')[i];
      const end = array('reportDate')[i];
      const filed = array('filingDate')[i];
      const document = array('primaryDocument')[i];
      return typeof form === 'string' &&
        ANNUAL_FORMS.has(form) &&
        typeof accession === 'string' &&
        /^\d{10}-\d{2}-\d{6}$/.test(accession) &&
        typeof end === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(end) &&
        typeof filed === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(filed)
        ? [{ accession, end, filed, form, document: typeof document === 'string' ? document : '' }]
        : [];
    })
    .sort(
      (a, b) =>
        b.end.localeCompare(a.end) ||
        b.filed.localeCompare(a.filed) ||
        b.accession.localeCompare(a.accession),
    );
}

export function normalizeSecStatement(
  body: CompanyFacts,
  reports: AnnualReport[],
  cik: string,
): SecFinancialStatement | null {
  const latestEnd = reports[0]?.end;
  // An amendment may only contain governance changes. Use the latest accession
  // with financial facts for the same year, never mix periods or filings.
  for (const report of reports.filter((report) => report.end === latestEnd)) {
    const anchors = availableConcepts(body, [
      ...concepts.netIncome,
      ...concepts.revenue,
      ...concepts.operatingProfit,
    ]);
    const candidates = anchors.flatMap((concept) =>
      Object.entries(concept.units ?? {}).flatMap(([unit, facts]) =>
        /^[A-Z]{3}$/.test(unit)
          ? facts.filter((fact) => annualFact(fact, report)).map((fact) => ({ unit, fact }))
          : [],
      ),
    );
    const anchor = candidates.find((candidate) => candidate.unit === 'USD') ?? candidates[0];
    if (!anchor) continue;
    const value = (names: readonly string[], duration: boolean): number | null => {
      for (const concept of availableConcepts(body, names)) {
        const fact = concept.units?.[anchor.unit]?.find(
          (fact) =>
            fact.accn === report.accession &&
            fact.end === report.end &&
            Number.isFinite(fact.val) &&
            (duration ? fact.start === anchor.fact.start : !fact.start),
        );
        if (fact) return fact.val;
      }
      return null;
    };
    const assets = value(concepts.assets, false);
    const equity = value(concepts.equity, false);
    const combinedEquity = value(
      ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'Equity'],
      false,
    );
    const directLiabilities = value(concepts.liabilities, false);
    const file = /^[\w.-]+$/.test(report.document)
      ? report.document
      : `${report.accession}-index.html`;
    return {
      source: 'SEC',
      year: Number(report.end.slice(0, 4)),
      basis: 'CFS',
      currency: anchor.unit,
      receiptNo: null,
      periodStart: anchor.fact.start!,
      periodEnd: report.end,
      filedAt: report.filed,
      reportUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${report.accession.replaceAll('-', '')}/${file}`,
      revenue: value(concepts.revenue, true),
      operatingProfit: value(concepts.operatingProfit, true),
      netIncome: value(concepts.netIncome, true),
      assets,
      liabilities:
        directLiabilities ??
        (assets !== null && combinedEquity !== null ? assets - combinedEquity : null),
      equity,
    };
  }
  return null;
}

type SecDenial = {
  category: 'rate-limit' | 'undeclared-tool' | 'access-denied';
  reference: string | null;
};
let blockedUntil = 0;
let blockedMessage = '';

export function classifySecDenial(html: string, status: number): SecDenial {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? html;
  return {
    category:
      /Request Rate Threshold Exceeded/i.test(title) || status === 429
        ? 'rate-limit'
        : /Undeclared Automated Tool/i.test(title)
          ? 'undeclared-tool'
          : 'access-denied',
    reference: html.match(/Reference ID:\s*([a-zA-Z0-9.-]{1,160})/i)?.[1] ?? null,
  };
}

async function secJson(url: string, userAgent: string, signal: AbortSignal): Promise<unknown> {
  // Space all SEC requests, including concurrent cold requests, within an instance.
  const previous = requestQueue;
  let release!: () => void;
  requestQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    signal.throwIfAborted();
    if (blockedUntil > Date.now()) throw new SecError(blockedMessage);
    const delay = Math.max(0, 250 - (Date.now() - lastRequest));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    signal.throwIfAborted();
    lastRequest = Date.now();
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        // Keep HTML, contact headers and arbitrary upstream text out of logs/API responses.
        const denial = classifySecDenial((await response.text()).slice(0, 32_768), response.status);
        blockedMessage =
          denial.category === 'rate-limit'
            ? 'SEC가 요청량 제한으로 접근을 차단했습니다. 10분 후 다시 확인해 주세요.'
            : denial.category === 'undeclared-tool'
              ? 'SEC가 자동 조회 요청을 차단했습니다. 서버 요청 식별 정보와 네트워크 허용 상태를 확인해 주세요.'
              : 'SEC 접근이 제한되었습니다. 서버 연락처 설정과 요청 허용 상태를 확인해 주세요.';
        blockedUntil = Date.now() + 10 * 60_000;
        console.warn('[SEC access denied]', {
          status: response.status,
          endpoint: new URL(url).pathname,
          category: denial.category,
          reference: denial.reference,
          retryAt: new Date(blockedUntil).toISOString(),
        });
        throw new SecError(blockedMessage);
      }
      throw new SecError(
        response.status === 404
          ? '해당 기업의 SEC 재무정보가 없습니다.'
          : 'SEC 재무정보를 불러오지 못했습니다.',
      );
    }
    return await response.json();
  } finally {
    release();
  }
}

async function tickerCodes(userAgent: string, signal: AbortSignal): Promise<Map<string, string>> {
  if (tickers && tickers.expires > Date.now()) return tickers.codes;
  if (tickerRequest) return tickerRequest;
  tickerRequest = (async () => {
    const body = (await secJson(
      'https://www.sec.gov/files/company_tickers.json',
      userAgent,
      signal,
    )) as Record<string, { ticker?: unknown; cik_str?: unknown }>;
    const codes = new Map<string, string>();
    for (const row of Object.values(body)) {
      if (typeof row.ticker === 'string' && /^\d{1,10}$/.test(String(row.cik_str)))
        codes.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, '0'));
    }
    if (!codes.size) throw new SecError('SEC 기업 목록을 불러오지 못했습니다.');
    tickers = { codes, expires: Date.now() + DAY };
    return codes;
  })();
  try {
    return await tickerRequest;
  } finally {
    tickerRequest = undefined;
  }
}

export async function fetchSecStatement(symbol: string, userAgent?: string): Promise<Result> {
  if (
    !userAgent ||
    /[\r\n]/.test(userAgent) ||
    userAgent.length > 200 ||
    !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(userAgent)
  ) {
    return {
      financialStatement: null,
      financialStatementMessage:
        'SEC 조회용 앱 이름과 연락 이메일을 SEC_USER_AGENT에 설정해 주세요.',
    };
  }
  const ticker = symbol.trim().toUpperCase().replaceAll('.', '-');
  const cached = cache.get(ticker);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending.has(ticker)) return pending.get(ticker)!;
  const request = (async (): Promise<Result> => {
    try {
      const signal = AbortSignal.timeout(17_000);
      const cik = (await tickerCodes(userAgent, signal)).get(ticker);
      if (!cik)
        return {
          financialStatement: null,
          financialStatementMessage:
            'SEC 공시 기업을 찾을 수 없습니다. ETF 등은 기업 재무제표가 제공되지 않을 수 있습니다.',
        };
      const [submission, facts] = await Promise.all([
        secJson(`https://data.sec.gov/submissions/CIK${cik}.json`, userAgent, signal),
        secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, userAgent, signal),
      ]);
      const recent =
        (submission as { filings?: { recent?: Record<string, unknown> } }).filings?.recent ?? {};
      const statement = normalizeSecStatement(facts as CompanyFacts, annualReports(recent), cik);
      const value: Result = {
        financialStatement: statement,
        financialStatementMessage: statement
          ? null
          : '최신 연간 보고서의 표준 재무정보를 확인할 수 없습니다.',
      };
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(ticker, { value, expires: Date.now() + (statement ? DAY : 15 * 60_000) });
      return value;
    } catch (cause) {
      return {
        financialStatement: null,
        financialStatementMessage:
          cause instanceof SecError
            ? cause.message
            : 'SEC 재무정보에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      };
    }
  })();
  pending.set(ticker, request);
  try {
    return await request;
  } finally {
    pending.delete(ticker);
  }
}
