import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchAlphaVantage, normalizeAlphaVantage } from '../lib/alphaVantage.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const income = {
  annualReports: [
    {
      fiscalDateEnding: '2025-12-31',
      reportedCurrency: 'USD',
      totalRevenue: '500',
      operatingIncome: '50',
      netIncome: '20',
    },
  ],
};
const balance = {
  annualReports: [
    {
      fiscalDateEnding: '2025-12-31',
      reportedCurrency: 'USD',
      totalAssets: '300',
      totalLiabilities: '180',
      totalShareholderEquity: '120',
      commonStockSharesOutstanding: '10',
    },
    {
      fiscalDateEnding: '2024-12-31',
      reportedCurrency: 'USD',
      totalShareholderEquity: '80',
    },
  ],
};
const earnings = {
  annualEarnings: [{ fiscalDateEnding: '2025-12-31', reportedEPS: '5' }],
};
const dividends = {
  data: [
    { ex_dividend_date: '2026-02-01', amount: '1' },
    { ex_dividend_date: '2026-08-01', amount: '1.5' },
    { ex_dividend_date: '2025-02-01', amount: '1' },
  ],
};

test('matches annual reports and derives only compatible metric inputs', () => {
  const result = normalizeAlphaVantage(
    income,
    balance,
    earnings,
    dividends,
    new Date('2026-11-03T00:00:00Z'),
  );
  assert.equal(result.financialStatement.source, 'ALPHA_VANTAGE');
  assert.equal(result.financialStatement.periodEnd, '2025-12-31');
  assert.equal(result.financialStatement.netIncome, 20);
  assert.equal(result.financialStatement.equity, 120);
  assert.deepEqual(result.usMetricInputs, {
    year: 2025,
    currency: 'USD',
    eps: 5,
    bps: 12,
    roe: 20,
    dividendPerShare: 2.5,
  });
  const mismatch = normalizeAlphaVantage(
    income,
    {
      annualReports: [{ ...balance.annualReports[0], reportedCurrency: 'EUR' }],
    },
    earnings,
    dividends,
  );
  assert.equal(mismatch.financialStatement, null);
  assert.match(mismatch.financialStatementMessage, /통화/);
});

test('accepts normalized or omitted currency while rejecting conflicting reported currencies', () => {
  const normalized = normalizeAlphaVantage(
    { annualReports: [{ ...income.annualReports[0], reportedCurrency: ' usd ' }] },
    { annualReports: [{ ...balance.annualReports[0], reportedCurrency: 'USD' }] },
    earnings,
    dividends,
  );
  assert.equal(normalized.financialStatement.currency, 'USD');

  const omitted = normalizeAlphaVantage(
    income,
    { annualReports: [{ ...balance.annualReports[0], reportedCurrency: undefined }] },
    earnings,
    dividends,
  );
  assert.equal(omitted.financialStatement.currency, 'USD');

  const unknown = normalizeAlphaVantage(
    { annualReports: [{ ...income.annualReports[0], reportedCurrency: undefined }] },
    { annualReports: [{ ...balance.annualReports[0], reportedCurrency: undefined }] },
    earnings,
    dividends,
  );
  assert.equal(unknown.financialStatement, null);
});

test('missing key makes no external request', async () => {
  globalThis.fetch = () => {
    throw new Error('unexpected request');
  };
  const result = await fetchAlphaVantage('AAPL');
  assert.match(result.financialStatementMessage, /ALPHA_VANTAGE_API_KEY/);
});

test('requests four free endpoints once per ticker and caches the normalized result', async () => {
  const requested = [];
  const payloads = {
    INCOME_STATEMENT: income,
    BALANCE_SHEET: balance,
    EARNINGS: earnings,
    DIVIDENDS: dividends,
  };
  globalThis.fetch = async (input) => {
    const request = new URL(input);
    assert.equal(request.origin, 'https://www.alphavantage.co');
    assert.equal(request.searchParams.get('symbol'), 'MOCKA');
    assert.equal(request.searchParams.get('apikey'), 'private-key');
    const functionName = request.searchParams.get('function');
    requested.push({ functionName, at: Date.now() });
    return Response.json(payloads[functionName]);
  };
  const [first, second] = await Promise.all([
    fetchAlphaVantage('MOCKA', 'private-key'),
    fetchAlphaVantage('MOCKA', 'private-key'),
  ]);
  assert.equal(first.financialStatement.source, 'ALPHA_VANTAGE');
  assert.deepEqual(second, first);
  assert.equal(requested.length, 4);
  assert.deepEqual(
    requested.map(({ functionName }) => functionName),
    ['INCOME_STATEMENT', 'BALANCE_SHEET', 'EARNINGS', 'DIVIDENDS'],
  );
  for (let index = 1; index < requested.length; index += 1) {
    assert.ok(requested[index].at - requested[index - 1].at >= 1_000);
  }
  await fetchAlphaVantage('MOCKA', 'private-key');
  assert.equal(requested.length, 4);
  assert.equal(JSON.stringify(first).includes('private-key'), false);
});

test('keeps the annual statement when optional EPS and dividend requests fail', async () => {
  globalThis.fetch = async (input) => {
    const functionName = new URL(input).searchParams.get('function');
    if (functionName === 'INCOME_STATEMENT') return Response.json(income);
    if (functionName === 'BALANCE_SHEET') return Response.json(balance);
    return Response.json({ Information: 'API rate limit exceeded' });
  };
  const result = await fetchAlphaVantage('PARTIAL', 'private-key');
  assert.equal(result.financialStatement.revenue, 500);
  assert.equal(result.usMetricInputs.bps, 12);
  assert.equal(result.usMetricInputs.roe, 20);
  assert.equal(result.usMetricInputs.eps, null);
  assert.equal(result.usMetricInputs.dividendPerShare, null);
  assert.match(result.fundamentalsMessage, /일부 지표 자료/);
});

test('handles Alpha Vantage HTTP 200 quota response without echoing upstream content', async () => {
  globalThis.fetch = async () =>
    Response.json({
      Information:
        'Please consider spreading out your free API requests more sparingly (1 request per second). Subscribe to premium to lift the burst limit for private-key.',
    });
  const result = await fetchAlphaVantage('QUOTA', 'private-key');
  assert.match(result.financialStatementMessage, /호출 간격/);
  assert.equal(JSON.stringify(result).includes('private-key'), false);
});
