import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  annualReports,
  classifySecDenial,
  fetchSecStatement,
  normalizeSecStatement,
} from '../lib/sec.mjs';
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const accession = '0000320193-25-000001';
const report = {
  accession,
  end: '2025-09-27',
  filed: '2025-10-31',
  form: '10-K',
  document: 'aapl-20250927.htm',
};
const fact = (value, extra = {}) => ({
  start: '2024-09-29',
  end: '2025-09-27',
  val: value,
  accn: accession,
  form: '10-K',
  filed: '2025-10-31',
  ...extra,
});
const concept = (value, instant = false) => ({
  units: { USD: [fact(value, instant ? { start: undefined } : {})] },
});
function facts() {
  return {
    facts: {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: concept(1000000000),
        OperatingIncomeLoss: concept(200000000),
        NetIncomeLoss: concept(150000000),
        Assets: concept(2000000000, true),
        Liabilities: concept(800000000, true),
        StockholdersEquity: concept(1200000000, true),
      },
    },
  };
}
const recent = (reports = [report]) => ({
  form: reports.map((r) => r.form),
  accessionNumber: reports.map((r) => r.accession),
  reportDate: reports.map((r) => r.end),
  filingDate: reports.map((r) => r.filed),
  primaryDocument: reports.map((r) => r.document),
});

test('fiscal annual statements preserve period, units and filing link', () => {
  const result = normalizeSecStatement(facts(), [report], '0000320193');
  assert.equal(result.source, 'SEC');
  assert.equal(result.periodStart, '2024-09-29');
  assert.equal(result.periodEnd, '2025-09-27');
  assert.equal(result.currency, 'USD');
  assert.equal(result.revenue, 1000000000);
  assert.equal(result.assets, 2000000000);
  assert.equal(
    result.reportUrl,
    'https://www.sec.gov/Archives/edgar/data/320193/000032019325000001/aapl-20250927.htm',
  );
  assert.equal(result.receiptNo, null);
});

test('comparative years, quarterly durations and different accessions never fill annual values', () => {
  const body = facts();
  const tags = body.facts['us-gaap'];
  tags.OperatingIncomeLoss.units.USD = [fact(999, { start: '2025-06-29' })];
  tags.NetIncomeLoss.units.USD = [fact(888, { accn: '0000320193-24-000001' })];
  tags.Assets.units.USD = [fact(777, { start: undefined, end: '2024-09-28' })];
  const result = normalizeSecStatement(body, [report], '0000320193');
  assert.equal(result.revenue, 1000000000);
  assert.equal(result.operatingProfit, null);
  assert.equal(result.netIncome, null);
  assert.equal(result.assets, null);
});

test('latest amendment with no financial facts falls back only to same-year original', () => {
  const amendment = {
    ...report,
    accession: '0000320193-25-000002',
    form: '10-K/A',
    filed: '2025-11-01',
  };
  const reports = annualReports(
    recent([report, amendment, { ...report, form: '10-Q', end: '2026-03-28' }]),
  );
  assert.equal(reports.length, 2);
  assert.equal(reports[0].form, '10-K/A');
  assert.equal(normalizeSecStatement(facts(), reports, '0000320193').filedAt, '2025-10-31');
  assert.equal(
    normalizeSecStatement(facts(), [{ ...report, end: '2026-09-26' }, report], '0000320193'),
    null,
  );
});

test('currencies are not mixed and missing values are not zero', () => {
  const body = facts();
  body.facts['us-gaap'].Assets = { units: { EUR: [fact(123, { start: undefined })] } };
  delete body.facts['us-gaap'].Liabilities;
  const result = normalizeSecStatement(body, [report], '0000320193');
  assert.equal(result.currency, 'USD');
  assert.equal(result.assets, null);
  assert.equal(result.liabilities, null);
});

test('IFRS annual reports use native currency and combined equity for derived liabilities', () => {
  const body = {
    facts: {
      'ifrs-full': {
        Revenue: { units: { CNY: [fact(100)] } },
        ProfitLoss: { units: { CNY: [fact(-10)] } },
        Assets: { units: { CNY: [fact(200, { start: undefined })] } },
        Equity: { units: { CNY: [fact(80, { start: undefined })] } },
      },
    },
  };
  const result = normalizeSecStatement(body, [{ ...report, form: '20-F' }], '0000320193');
  assert.equal(result.currency, 'CNY');
  assert.equal(result.netIncome, -10);
  assert.equal(result.liabilities, 120);
  assert.equal(result.operatingProfit, null);
});

test('invalid contact configuration prevents network requests', async () => {
  globalThis.fetch = () => {
    throw new Error('must not request');
  };
  for (const ua of [undefined, 'PortfolioApp', 'PortfolioApp a@example.com\r\nBad: header']) {
    assert.match((await fetchSecStatement('AAPL', ua)).financialStatementMessage, /SEC_USER_AGENT/);
  }
});

test('SEC 403 produces a safe message and suspends further requests', async (context) => {
  let calls = 0;
  const warning = context.mock.method(console, 'warn', () => {});
  globalThis.fetch = async () => {
    calls++;
    return new Response('private upstream details', { status: 403 });
  };
  const result = await fetchSecStatement('AAPL', 'PortfolioApp private@example.com');
  assert.equal(result.financialStatement, null);
  assert.match(result.financialStatementMessage, /접근이 제한/);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(warning.mock.callCount(), 1);
  assert.equal(JSON.stringify(warning.mock.calls[0].arguments).includes('private'), false);
  const blocked = await fetchSecStatement('MSFT', 'PortfolioApp private@example.com');
  assert.equal(blocked.financialStatementMessage, result.financialStatementMessage);
  assert.equal(calls, 1);
});

test('cold requests share ticker and statement loads, then use daily cache', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() + 11 * 60_000 });
  const urls = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    urls.push(url);
    assert.equal(options.headers['User-Agent'], 'PortfolioApp private@example.com');
    if (url.endsWith('company_tickers.json'))
      return Response.json({
        0: { ticker: 'AAPL', cik_str: 320193 },
        1: { ticker: 'MSFT', cik_str: 789019 },
      });
    if (url.includes('/submissions/')) return Response.json({ filings: { recent: recent() } });
    return Response.json(facts());
  };
  const [first, second] = await Promise.all([
    fetchSecStatement('AAPL', 'PortfolioApp private@example.com'),
    fetchSecStatement('aapl', 'PortfolioApp private@example.com'),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.financialStatement.netIncome, 150000000);
  assert.equal(urls.length, 3);
  await fetchSecStatement('AAPL', 'PortfolioApp private@example.com');
  assert.equal(urls.length, 3);
  assert.match(
    (await fetchSecStatement('UNKNOWN', 'PortfolioApp private@example.com'))
      .financialStatementMessage,
    /공시 기업/,
  );
  assert.equal(urls.length, 3);
});

test('SEC denial classification extracts only constrained reference IDs', () => {
  assert.deepEqual(
    classifySecDenial(
      '<title>SEC.gov | Request Rate Threshold Exceeded</title> Reference ID: 0.abc.123',
      403,
    ),
    { category: 'rate-limit', reference: '0.abc.123' },
  );
  assert.equal(
    classifySecDenial(
      '<title>Your Request Originates from an Undeclared Automated Tool</title>',
      403,
    ).category,
    'undeclared-tool',
  );
  assert.equal(classifySecDenial('private@example.com secret body', 403).category, 'access-denied');
  assert.equal(classifySecDenial('', 429).category, 'rate-limit');
});
