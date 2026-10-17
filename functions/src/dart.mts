import { inflateRawSync } from 'node:zlib';

const BASE = 'https://opendart.fss.or.kr/api/';
const DAY = 86_400_000;
let companies: { expires: number; codes: Map<string, string> } | undefined;
let loadingCompanies: Promise<Map<string, string>> | undefined;
const statements = new Map<string, { expires: number; value: DartResult }>();

export interface FinancialStatement {
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
export interface DomesticMetricInputs {
  year: number;
  basis: 'CFS' | 'OFS';
  eps: number | null;
  bps: number | null;
  roe: number | null;
  dividendPerShare: number | null;
}

type DartResult = {
  domesticMetricInputs?: DomesticMetricInputs | null;
  domesticMetricsMessage?: string | null;
  financialStatement: FinancialStatement | null;
  financialStatementMessage: string | null;
};
type Row = Record<string, string | undefined>;

class DartError extends Error {}

function dartError(status: string | undefined): Error {
  const message =
    status === '020'
      ? 'DART 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.'
      : ['010', '011', '012', '901'].includes(status ?? '')
        ? 'DART 인증키의 승인 상태와 허용 IP를 확인해 주세요.'
        : 'DART 재무정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  return new DartError(message);
}

// DART supplies the corporate-code XML inside a ZIP. Read its central directory,
// including archives whose local headers use a trailing data descriptor.
export function corporateXml(bytes: Buffer): string {
  let end = bytes.length - 22;
  const minimum = Math.max(0, bytes.length - 65_557);
  while (end >= minimum && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < minimum) throw new DartError('DART 기업 목록 압축 형식을 확인할 수 없습니다.');
  let offset = bytes.readUInt32LE(end + 16);
  const entries = bytes.readUInt16LE(end + 10);
  for (let i = 0; i < entries; i++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name.toUpperCase() === 'CORPCODE.XML') {
      const local = bytes.readUInt32LE(offset + 42);
      if (bytes.readUInt32LE(local) !== 0x04034b50) break;
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      const compressed = bytes.subarray(start, start + size);
      if (method === 0) return compressed.toString('utf8');
      if (method === 8)
        return inflateRawSync(compressed, { maxOutputLength: 100_000_000 }).toString('utf8');
      break;
    }
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  throw new DartError('DART 기업 목록을 읽을 수 없습니다.');
}

async function companyCodes(key: string, signal: AbortSignal): Promise<Map<string, string>> {
  if (companies && companies.expires > Date.now()) return companies.codes;
  if (loadingCompanies) return loadingCompanies;
  loadingCompanies = (async () => {
    const response = await fetch(BASE + 'corpCode.xml?' + new URLSearchParams({ crtfc_key: key }), {
      signal,
    });
    if (!response.ok) throw dartError(undefined);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 2).toString() !== 'PK') {
      throw dartError(bytes.toString().match(/<status>(.*?)<\/status>/)?.[1]);
    }
    const xml = corporateXml(bytes);
    const codes = new Map<string, string>();
    for (const match of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
      const stock = match[1].match(/<stock_code>\s*(\d{6})\s*<\/stock_code>/)?.[1];
      const corp = match[1].match(/<corp_code>(\d{8})<\/corp_code>/)?.[1];
      if (stock && corp) codes.set(stock, corp);
    }
    if (!codes.size) throw new DartError('DART 기업 목록이 비어 있습니다.');
    companies = { codes, expires: Date.now() + DAY };
    return codes;
  })();
  try {
    return await loadingCompanies;
  } finally {
    loadingCompanies = undefined;
  }
}

function amount(value: string | undefined): number | null {
  if (!value || value.trim() === '-') return null;
  const normalized = value
    .trim()
    .replaceAll(',', '')
    .replace(/^\((.*)\)$/, '-$1');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function normalizeStatement(
  rows: Row[],
  year: number,
  basis: 'CFS' | 'OFS',
): FinancialStatement {
  const find = (sections: string[], ids: string[], names: string[]) => {
    const candidates = rows.filter((row) => sections.includes(row.sj_div ?? ''));
    const row =
      candidates.find((row) => ids.includes(row.account_id ?? '')) ??
      candidates.find((row) => names.includes((row.account_nm ?? '').replaceAll(/\s/g, '')));
    return amount(row?.thstrm_amount);
  };
  return {
    year,
    basis,
    currency: rows.find((row) => row.currency)?.currency ?? 'KRW',
    receiptNo: rows.find((row) => /^\d{14}$/.test(row.rcept_no ?? ''))?.rcept_no ?? null,
    revenue: find(['IS', 'CIS'], ['ifrs-full_Revenue'], ['매출액', '수익(매출액)', '영업수익']),
    operatingProfit: find(
      ['IS', 'CIS'],
      ['dart_OperatingIncomeLoss'],
      ['영업이익', '영업이익(손실)', '영업손익'],
    ),
    netIncome: find(
      ['IS', 'CIS'],
      ['ifrs-full_ProfitLoss'],
      ['당기순이익', '당기순이익(손실)', '당기순손익'],
    ),
    assets: find(['BS'], ['ifrs-full_Assets'], ['자산총계']),
    liabilities: find(['BS'], ['ifrs-full_Liabilities'], ['부채총계']),
    equity: find(['BS'], ['ifrs-full_Equity'], ['자본총계']),
  };
}

export function normalizeMetricInputs(
  rows: Row[],
  dividends: Row[],
  shares: Row[],
  year: number,
  basis: 'CFS' | 'OFS',
): DomesticMetricInputs {
  const account = (section: string[], id: string) =>
    rows.find((row) => section.includes(row.sj_div ?? '') && row.account_id === id);
  const profit = account(
    ['IS', 'CIS'],
    basis === 'CFS' ? 'ifrs-full_ProfitLossAttributableToOwnersOfParent' : 'ifrs-full_ProfitLoss',
  );
  const equity = account(
    ['BS'],
    basis === 'CFS' ? 'ifrs-full_EquityAttributableToOwnersOfParent' : 'ifrs-full_Equity',
  );
  const currentEquity = amount(equity?.thstrm_amount);
  const priorEquity = amount(equity?.frmtrm_amount);
  const income = amount(profit?.thstrm_amount);
  const averageEquity =
    currentEquity !== null && priorEquity !== null && currentEquity > 0 && priorEquity > 0
      ? (currentEquity + priorEquity) / 2
      : null;
  const basisName = basis === 'CFS' ? '연결' : '별도';
  const dividendEps = dividends.find(
    (row) =>
      (row.se ?? '').replaceAll(/\s/g, '') === `(${basisName})주당순이익(원)` &&
      ['-', '보통주', ''].includes(row.stock_knd?.trim() ?? ''),
  );
  const epsRow = account(['IS', 'CIS'], 'ifrs-full_BasicEarningsLossPerShare');
  const eps = amount(epsRow?.thstrm_amount) ?? amount(dividendEps?.thstrm);
  // Total includes ordinary and preferred shares, excludes treasury stock.
  // This produces a reference BPS shared across classes, not a class-specific valuation.
  const total = shares.find((row) => row.se?.replaceAll(/\s/g, '') === '합계');
  const count = amount(total?.distb_stock_co);
  const dividend = dividends.find(
    (row) =>
      (row.se ?? '').replaceAll(/\s/g, '') === '주당현금배당금(원)' &&
      row.stock_knd?.trim() === '보통주',
  );
  const isKrw = rows.filter((row) => row.currency).every((row) => row.currency === 'KRW');
  return {
    year,
    basis,
    eps: isKrw ? eps : null,
    bps:
      isKrw && currentEquity !== null && currentEquity > 0 && count !== null && count > 0
        ? currentEquity / count
        : null,
    roe: income !== null && averageEquity !== null ? (income / averageEquity) * 100 : null,
    dividendPerShare: isKrw ? amount(dividend?.thstrm) : null,
  };
}

async function metricRows(
  endpoint: string,
  corp: string,
  year: number,
  key: string,
  signal: AbortSignal,
): Promise<Row[]> {
  const response = await fetch(
    BASE +
      endpoint +
      '?' +
      new URLSearchParams({
        crtfc_key: key,
        corp_code: corp,
        bsns_year: String(year),
        reprt_code: '11011',
      }),
    { signal },
  );
  if (!response.ok) throw dartError(undefined);
  const body = (await response.json()) as { status?: string; list?: Row[] };
  if (body.status === '013' || body.status === '014') return [];
  if (body.status !== '000') throw dartError(body.status);
  return body.list ?? [];
}

export async function fetchDartStatement(symbol: string, key?: string): Promise<DartResult> {
  if (!key?.trim())
    return {
      financialStatement: null,
      financialStatementMessage: 'DART_API_KEY를 설정하면 국내 재무제표를 볼 수 있습니다.',
    };
  const cached = statements.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    // Keep the entire cold request within the stock-insights client timeout.
    const signal = AbortSignal.timeout(17_000);
    const corp = (await companyCodes(key.trim(), signal)).get(symbol);
    if (!corp)
      return {
        financialStatement: null,
        financialStatementMessage:
          'DART 공시 대상 기업을 찾을 수 없습니다. ETF·우선주 등은 재무제표가 제공되지 않을 수 있습니다.',
      };
    const latestYear =
      Number(
        new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(
          new Date(),
        ),
      ) - 1;
    for (let year = latestYear; year >= latestYear - 2; year--) {
      for (const basis of ['CFS', 'OFS'] as const) {
        const response = await fetch(
          BASE +
            'fnlttSinglAcntAll.json?' +
            new URLSearchParams({
              crtfc_key: key.trim(),
              corp_code: corp,
              bsns_year: String(year),
              reprt_code: '11011',
              fs_div: basis,
            }),
          { signal },
        );
        if (!response.ok) throw dartError(undefined);
        const body = (await response.json()) as { status?: string; list?: Row[] };
        if (body.status === '013' || body.status === '014') continue;
        if (body.status !== '000') throw dartError(body.status);
        if (!body.list?.length) continue;
        const extra = await Promise.allSettled([
          metricRows('alotMatter.json', corp, year, key.trim(), signal),
          metricRows('stockTotqySttus.json', corp, year, key.trim(), signal),
        ]);
        const incomplete = extra.some((result) => result.status === 'rejected');
        const value: DartResult = {
          domesticMetricInputs: normalizeMetricInputs(
            body.list,
            extra[0].status === 'fulfilled' ? extra[0].value : [],
            extra[1].status === 'fulfilled' ? extra[1].value : [],
            year,
            basis,
          ),
          domesticMetricsMessage: incomplete
            ? '일부 배당·주식수 자료를 불러오지 못했습니다. 확인할 수 없는 지표는 -로 표시합니다.'
            : null,
          financialStatement: normalizeStatement(body.list, year, basis),
          financialStatementMessage: null,
        };
        if (statements.size >= 1000) statements.delete(statements.keys().next().value!);
        statements.set(symbol, { value, expires: Date.now() + (incomplete ? 15 * 60_000 : DAY) });
        return value;
      }
    }
    return {
      financialStatement: null,
      financialStatementMessage: '최근 3개 사업연도의 연간 재무제표가 없습니다.',
    };
  } catch (cause) {
    return {
      financialStatement: null,
      financialStatementMessage:
        cause instanceof DartError
          ? cause.message
          : cause instanceof Error && cause.name === 'TimeoutError'
            ? 'DART 재무정보 조회 시간이 초과되었습니다. 다시 시도해 주세요.'
            : 'DART 재무정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}
