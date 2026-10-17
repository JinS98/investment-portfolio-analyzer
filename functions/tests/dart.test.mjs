import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import {
  corporateXml,
  fetchDartStatement,
  normalizeMetricInputs,
  normalizeStatement,
} from '../lib/dart.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function zip(xml) {
  const name = Buffer.from('CORPCODE.xml');
  const data = deflateRawSync(Buffer.from(xml));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(name.length, 26);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(8, 10);
  directory.writeUInt32LE(data.length, 20);
  directory.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(30 + name.length + data.length, 16);
  return Buffer.concat([local, name, data, directory, name, end]);
}

test('corporate-code ZIP extracts XML using central-directory sizes', () => {
  assert.equal(corporateXml(zip('<result>기업</result>')), '<result>기업</result>');
  assert.throws(() => corporateXml(Buffer.alloc(30)));
});

test('annual values use statement sections, total profit, and preserve missing amounts', () => {
  const result = normalizeStatement(
    [
      { sj_div: 'SCE', account_id: 'ifrs-full_Equity', thstrm_amount: '999' },
      { sj_div: 'BS', account_id: 'ifrs-full_Equity', thstrm_amount: '1,000', currency: 'KRW' },
      {
        sj_div: 'IS',
        account_id: 'ifrs-full_ProfitLossAttributableToOwnersOfParent',
        thstrm_amount: '200',
      },
      { sj_div: 'IS', account_id: 'ifrs-full_ProfitLoss', thstrm_amount: '(250)' },
      { sj_div: 'IS', account_nm: '영업이익(손실)', thstrm_amount: '0' },
      { sj_div: 'BS', account_id: 'ifrs-full_Assets', thstrm_amount: '-' },
    ],
    2025,
    'CFS',
  );
  assert.equal(result.equity, 1000);
  assert.equal(result.netIncome, -250);
  assert.equal(result.operatingProfit, 0);
  assert.equal(result.assets, null);
  assert.equal(result.revenue, null);
});

test('missing key never makes a request', async () => {
  globalThis.fetch = () => {
    throw new Error('must not fetch');
  };
  assert.match((await fetchDartStatement('005930')).financialStatementMessage, /DART_API_KEY/);
});

test('DART authorization errors are actionable and never echo upstream secrets', async () => {
  globalThis.fetch = async () =>
    new Response('<result><status>010</status><message>private-key</message></result>');
  const result = await fetchDartStatement('005930', 'private-key');
  assert.match(result.financialStatementMessage, /인증키/);
  assert.equal(JSON.stringify(result).includes('private-key'), false);
});

test('corporate mapping, separate fallback, previous annual report, and cache', async () => {
  const requested = [];
  const year =
    Number(
      new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()),
    ) - 1;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requested.push(url);
    if (url.pathname.endsWith('corpCode.xml'))
      return new Response(
        zip(
          '<result><list><corp_code>00126380</corp_code><stock_code>005930</stock_code></list><list><corp_code>00266961</corp_code><stock_code>035420</stock_code></list></result>',
        ),
      );
    assert.equal(url.searchParams.get('corp_code'), '00126380');
    assert.equal(url.searchParams.get('reprt_code'), '11011');
    if (
      url.searchParams.get('bsns_year') === String(year - 1) &&
      url.searchParams.get('fs_div') === 'OFS'
    ) {
      return Response.json({
        status: '000',
        list: [
          {
            sj_div: 'IS',
            account_id: 'ifrs-full_Revenue',
            thstrm_amount: '123,456',
            rcept_no: '20260310002820',
          },
        ],
      });
    }
    return Response.json({ status: '013' });
  };
  const result = await fetchDartStatement('005930', 'private-key');
  assert.equal(result.financialStatement.year, year - 1);
  assert.equal(result.financialStatement.basis, 'OFS');
  assert.equal(result.financialStatement.revenue, 123456);
  assert.equal(requested.length, 7);
  assert.deepEqual(await fetchDartStatement('005930', 'private-key'), result);
  assert.equal(requested.length, 7);
  assert.match(
    (await fetchDartStatement('999999', 'private-key')).financialStatementMessage,
    /공시 대상/,
  );
});

test('metrics use parent equity and income, common dividends, total outstanding shares', () => {
  const rows = [
    {
      sj_div: 'IS',
      account_id: 'ifrs-full_BasicEarningsLossPerShare',
      thstrm_amount: '500',
      currency: 'KRW',
    },
    {
      sj_div: 'IS',
      account_id: 'ifrs-full_ProfitLossAttributableToOwnersOfParent',
      thstrm_amount: '150',
    },
    {
      sj_div: 'BS',
      account_id: 'ifrs-full_EquityAttributableToOwnersOfParent',
      thstrm_amount: '2,000',
      frmtrm_amount: '1,000',
    },
    {
      sj_div: 'BS',
      account_id: 'ifrs-full_Equity',
      thstrm_amount: '9,000',
      frmtrm_amount: '9,000',
    },
    {
      sj_div: 'SCE',
      account_id: 'ifrs-full_EquityAttributableToOwnersOfParent',
      thstrm_amount: '999',
    },
  ];
  const dividends = [
    { se: '주당 현금배당금(원)', stock_knd: '우선주', thstrm: '200' },
    { se: '주당 현금배당금(원)', stock_knd: '보통주', thstrm: '100' },
    { se: '현금배당수익률(%)', stock_knd: '보통주', thstrm: '99' },
  ];
  const shares = [
    { se: '보통주', distb_stock_co: '80' },
    { se: '우선주', distb_stock_co: '20' },
    { se: '합계', distb_stock_co: '100' },
  ];
  assert.deepEqual(normalizeMetricInputs(rows, dividends, shares, 2025, 'CFS'), {
    year: 2025,
    basis: 'CFS',
    eps: 500,
    bps: 20,
    roe: 10,
    dividendPerShare: 100,
  });
});

test('metrics do not mix separate EPS into consolidated data, or infer zero dividends', () => {
  const dividends = [
    { se: '(별도)주당순이익(원)', stock_knd: '-', thstrm: '500' },
    { se: '주당 현금배당금(원)', stock_knd: '보통주', thstrm: '-' },
  ];
  const empty = normalizeMetricInputs([], dividends, [], 2025, 'CFS');
  assert.equal(empty.eps, null);
  assert.equal(empty.dividendPerShare, null);
  assert.equal(empty.bps, null);
  assert.equal(empty.roe, null);
  assert.equal(normalizeMetricInputs([], dividends, [], 2025, 'OFS').eps, 500);
});

test('negative equity does not produce meaningful PBR or ROE; negative profit preserves ROE', () => {
  const rows = [
    { sj_div: 'BS', account_id: 'ifrs-full_Equity', thstrm_amount: '100', frmtrm_amount: '100' },
    { sj_div: 'IS', account_id: 'ifrs-full_ProfitLoss', thstrm_amount: '-10' },
  ];
  assert.equal(normalizeMetricInputs(rows, [], [], 2025, 'OFS').roe, -10);
  rows[0].frmtrm_amount = '-100';
  rows[0].thstrm_amount = '-100';
  const result = normalizeMetricInputs(
    rows,
    [],
    [{ se: '합계', distb_stock_co: '10' }],
    2025,
    'OFS',
  );
  assert.equal(result.roe, null);
  assert.equal(result.bps, null);
});

test('auxiliary API failure preserves the statement and calculable EPS', async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('fnlttSinglAcntAll.json')) {
      return Response.json({
        status: '000',
        list: [
          { sj_div: 'IS', account_id: 'ifrs-full_Revenue', thstrm_amount: '1000', currency: 'KRW' },
          {
            sj_div: 'IS',
            account_id: 'ifrs-full_BasicEarningsLossPerShare',
            thstrm_amount: '200',
            currency: 'KRW',
          },
        ],
      });
    }
    return new Response('', { status: 429 });
  };
  const result = await fetchDartStatement('035420', 'private-key');
  assert.equal(result.financialStatement.revenue, 1000);
  assert.equal(result.domesticMetricInputs.eps, 200);
  assert.equal(result.domesticMetricInputs.bps, null);
  assert.equal(result.domesticMetricInputs.dividendPerShare, null);
  assert.match(result.domesticMetricsMessage, /일부 배당·주식수/);
  assert.equal(result.financialStatementMessage, null);
});
