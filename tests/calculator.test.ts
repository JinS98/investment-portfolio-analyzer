import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBuy,
  calculateSell,
  calcPortfolio,
  recalculatePortfolio,
  roundMoney,
  validateBuyInput,
  validateSellInput,
} from '../src/utils/calculator.ts';
import type {
  Holding,
  HoldingHistory,
  HoldingHistoryInput,
  Portfolio,
} from '../src/types/index.ts';
const stock = {
  id: 'a',
  ticker: 'AAPL',
  market: 'US',
  name: '??',
  buyPrice: 100,
  quantity: 2,
  addedAt: '2026-01-01',
};
test('portfolio calculates value, profit and weight from a current price', () => {
  const r = calcPortfolio([stock], { AAPL: 125 });
  assert.equal(r.stocks[0].evaluatedValue, 250);
  assert.equal(r.stocks[0].profitAmount, 50);
  assert.equal(r.stocks[0].profitRate, 25);
  assert.equal(r.stocks[0].weight, 100);
});
test('a missing quote retains purchase price only for calculation continuity', () => {
  const r = calcPortfolio([stock], {});
  assert.equal(r.stocks[0].currentPrice, 100);
  assert.equal(r.totalProfitAmount, 0);
});

const buyInput: HoldingHistoryInput = {
  portfolioId: 'real-portfolio',
  portfolioType: 'REAL',
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  type: 'BUY',
  price: 80_000,
  quantity: 5,
  date: '2026-09-15',
};

test('a first buy creates a holding and defaults omitted costs to zero', () => {
  const result = calculateBuy(undefined, buyInput);

  assert.equal(result.grossAmount, 400_000);
  assert.equal(result.fee, 0);
  assert.equal(result.tax, 0);
  assert.deepEqual(result.holding, {
    portfolioId: 'real-portfolio',
    ticker: '005930',
    name: '삼성전자',
    market: 'KR',
    quantity: 5,
    averagePrice: 80_000,
    investedAmount: 400_000,
    lastTransactionAt: undefined,
  });
});

test('an additional buy calculates the moving average without adding costs to investment', () => {
  const current: Holding = {
    portfolioId: 'real-portfolio',
    ticker: '005930',
    name: '삼성전자',
    market: 'KR',
    quantity: 10,
    averagePrice: 70_000,
    investedAmount: 700_000,
    lastTransactionAt: 1,
  };
  const original = structuredClone(current);

  const result = calculateBuy(current, { ...buyInput, fee: 150, tax: 50 });

  assert.equal(result.holding.quantity, 15);
  assert.equal(result.holding.investedAmount, 1_100_000);
  assert.equal(result.holding.averagePrice, 1_100_000 / 15);
  assert.equal(result.fee, 150);
  assert.equal(result.tax, 50);
  assert.deepEqual(current, original);
});

test('a fractional quantity is retained without rounding the calculation result', () => {
  const result = calculateBuy(undefined, {
    ...buyInput,
    market: 'US',
    ticker: 'AAPL',
    price: 100.25,
    quantity: 1.5,
  });

  assert.equal(result.holding.quantity, 1.5);
  assert.equal(result.holding.investedAmount, 150.375);
  assert.equal(result.holding.averagePrice, 100.25);
});

test('buy validation rejects malformed data and mismatched holdings', () => {
  assert.throws(() => validateBuyInput({ ...buyInput, price: 0 }), /거래 가격/);
  assert.throws(
    () => validateBuyInput({ ...buyInput, quantity: Number.POSITIVE_INFINITY }),
    /거래 수량/,
  );
  assert.throws(() => validateBuyInput({ ...buyInput, fee: -1 }), /수수료/);
  assert.throws(() => validateBuyInput({ ...buyInput, date: '2026-02-29' }), /거래일/);
  assert.throws(() => calculateBuy(undefined, { ...buyInput, type: 'SELL' }), /BUY/);
  assert.throws(
    () =>
      calculateBuy(
        {
          portfolioId: 'virtual-portfolio',
          ticker: '005930',
          market: 'KR',
          quantity: 1,
          averagePrice: 1,
          investedAmount: 1,
        },
        buyInput,
      ),
    /다른 포트폴리오/,
  );
});

const holdingForSale: Holding = {
  portfolioId: 'real-portfolio',
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  quantity: 10,
  averagePrice: 70_000,
  investedAmount: 700_000,
  lastTransactionAt: 1,
};

const sellInput: HoldingHistoryInput = {
  ...buyInput,
  type: 'SELL',
  price: 90_000,
  quantity: 3,
};

test('a partial sale preserves average price and calculates realized profit after costs', () => {
  const original = structuredClone(holdingForSale);
  const result = calculateSell(holdingForSale, { ...sellInput, fee: 700, tax: 300 });

  assert.equal(result.holding?.quantity, 7);
  assert.equal(result.holding?.averagePrice, 70_000);
  assert.equal(result.holding?.investedAmount, 490_000);
  assert.equal(result.grossAmount, 270_000);
  assert.equal(result.realizedPnL, 59_000);
  assert.deepEqual(holdingForSale, original);
});

test('a full sale removes the holding and supports both profits and losses', () => {
  const profit = calculateSell(holdingForSale, { ...sellInput, quantity: 10 });
  const loss = calculateSell(holdingForSale, {
    ...sellInput,
    price: 60_000,
    quantity: 10,
    fee: 500,
    tax: 500,
  });

  assert.equal(profit.holding, null);
  assert.equal(profit.realizedPnL, 200_000);
  assert.equal(loss.holding, null);
  assert.equal(loss.realizedPnL, -101_000);
});

test('a near-equal floating-point quantity is treated as a full sale', () => {
  const result = calculateSell(
    { ...holdingForSale, quantity: 0.3, investedAmount: 21_000 },
    { ...sellInput, quantity: 0.1 + 0.2 },
  );

  assert.equal(result.holding, null);
});

test('sell validation rejects invalid and excessive sales', () => {
  assert.throws(() => validateSellInput({ ...sellInput, tax: -1 }), /세금/);
  assert.throws(() => validateSellInput({ ...sellInput, type: 'BUY' }), /SELL/);
  assert.throws(() => calculateSell(undefined, sellInput), /보유하지 않은/);
  assert.throws(() => calculateSell(holdingForSale, { ...sellInput, quantity: 11 }), /초과/);
  assert.throws(
    () => calculateSell(holdingForSale, { ...sellInput, market: 'US' }),
    /티커 또는 시장/,
  );
});

const realPortfolio: Portfolio = {
  id: 'real-portfolio',
  userId: 'user-1',
  name: '내 포트폴리오',
  type: 'REAL',
  createdAt: 1,
  updatedAt: 1,
};

const history = (id: string, input: HoldingHistoryInput, createdAt: number): HoldingHistory => ({
  id,
  ...input,
  grossAmount: -1,
  fee: input.fee ?? 0,
  tax: input.tax ?? 0,
  realizedPnL: 999_999,
  createdAt,
});

test('portfolio recalculation sorts the ledger and replaces stale calculation fields', () => {
  const laterBuy = history(
    'later-buy',
    { ...buyInput, price: 70_000, quantity: 10, date: '2026-09-02' },
    10,
  );
  const firstBuy = history(
    'first-buy',
    { ...buyInput, price: 80_000, quantity: 5, date: '2026-09-01' },
    20,
  );
  const sale = history('sale', { ...sellInput, date: '2026-09-03', fee: 700, tax: 300 }, 30);
  const source = [sale, laterBuy, firstBuy];
  const original = structuredClone(source);

  const result = recalculatePortfolio(realPortfolio, source);

  assert.deepEqual(
    result.histories.map((item) => item.id),
    ['first-buy', 'later-buy', 'sale'],
  );
  assert.equal(result.histories[0].grossAmount, 400_000);
  assert.equal(result.histories[0].realizedPnL, 0);
  assert.equal(result.histories[2].grossAmount, 270_000);
  assert.ok(Math.abs(result.histories[2].realizedPnL - 49_000) < 1e-9);
  assert.equal(result.holdings[0].quantity, 12);
  assert.equal(result.holdings[0].averagePrice, 1_100_000 / 15);
  assert.equal(result.holdings[0].investedAmount, 880_000);
  assert.equal(result.holdings[0].lastTransactionAt, 30);
  assert.equal(result.summary.byMarket.KR?.totalInvestment, 880_000);
  assert.ok(Math.abs((result.summary.byMarket.KR?.realizedPnL ?? 0) - 49_000) < 1e-9);
  assert.equal(result.summary.byMarket.KR?.totalFees, 700);
  assert.equal(result.summary.byMarket.KR?.totalTaxes, 300);
  assert.deepEqual(source, original);
});

test('recalculation changes the result when a historical transaction is removed', () => {
  const firstBuy = history('first-buy', { ...buyInput, price: 70_000, quantity: 10 }, 10);
  const secondBuy = history('second-buy', { ...buyInput, price: 80_000, quantity: 5 }, 20);

  const withBoth = recalculatePortfolio(realPortfolio, [firstBuy, secondBuy]);
  const afterDelete = recalculatePortfolio(realPortfolio, [firstBuy]);

  assert.equal(withBoth.holdings[0].quantity, 15);
  assert.equal(withBoth.holdings[0].averagePrice, 1_100_000 / 15);
  assert.equal(afterDelete.holdings[0].quantity, 10);
  assert.equal(afterDelete.holdings[0].averagePrice, 70_000);
});

test('recalculation rejects duplicate, foreign, and time-invalid ledger entries with their ID', () => {
  const valid = history('valid', buyInput, 10);
  assert.throws(() => recalculatePortfolio(realPortfolio, [valid, { ...valid }]), /중복된 이력 ID/);
  assert.throws(
    () => recalculatePortfolio(realPortfolio, [{ ...valid, id: 'foreign', portfolioId: 'other' }]),
    /foreign.*portfolioId/,
  );
  assert.throws(
    () =>
      recalculatePortfolio(realPortfolio, [{ ...valid, id: 'bad-time', createdAt: Number.NaN }]),
    /bad-time.*createdAt/,
  );
});

test('recalculation applies chronological order before detecting an excessive sale', () => {
  const futureBuy = history('future-buy', { ...buyInput, quantity: 10, date: '2026-09-02' }, 20);
  const earlierSale = history('early-sale', { ...sellInput, quantity: 1, date: '2026-09-01' }, 10);

  assert.throws(
    () => recalculatePortfolio(realPortfolio, [futureBuy, earlierSale]),
    /early-sale.*보유하지 않은/,
  );
});

test('real and virtual portfolios with the same ticker remain independent', () => {
  const virtualPortfolio: Portfolio = {
    ...realPortfolio,
    id: 'virtual-portfolio',
    name: '가상 포트폴리오',
    type: 'VIRTUAL',
  };
  const realHistory = history(
    'real-aapl',
    { ...buyInput, ticker: 'AAPL', market: 'US', price: 100, quantity: 1 },
    1,
  );
  const virtualHistory = history(
    'virtual-aapl',
    {
      ...buyInput,
      portfolioId: 'virtual-portfolio',
      portfolioType: 'VIRTUAL',
      ticker: 'AAPL',
      market: 'US',
      price: 200,
      quantity: 2,
    },
    1,
  );

  const real = recalculatePortfolio(realPortfolio, [realHistory]);
  const virtual = recalculatePortfolio(virtualPortfolio, [virtualHistory]);

  assert.deepEqual(
    real.holdings.map(({ quantity, averagePrice }) => ({ quantity, averagePrice })),
    [{ quantity: 1, averagePrice: 100 }],
  );
  assert.deepEqual(
    virtual.holdings.map(({ quantity, averagePrice }) => ({ quantity, averagePrice })),
    [{ quantity: 2, averagePrice: 200 }],
  );
  assert.throws(() => recalculatePortfolio(realPortfolio, [virtualHistory]), /portfolioId/);
});

test('portfolio summaries keep KR and US money separate', () => {
  const krHistory = history('kr-buy', { ...buyInput, price: 70_000, quantity: 2 }, 1);
  const usHistory = history(
    'us-buy',
    { ...buyInput, ticker: 'AAPL', market: 'US', price: 150.25, quantity: 3, fee: 1.25 },
    2,
  );

  const result = recalculatePortfolio(realPortfolio, [krHistory, usHistory]);

  assert.equal(result.summary.byMarket.KR?.totalInvestment, 140_000);
  assert.equal(result.summary.byMarket.KR?.totalFees, 0);
  assert.equal(result.summary.byMarket.US?.totalInvestment, 450.75);
  assert.equal(result.summary.byMarket.US?.totalFees, 1.25);
  assert.equal(result.summary.byMarket.KR?.totalEvaluated, null);
  assert.equal(result.summary.byMarket.US?.totalEvaluated, null);
});

test('roundMoney applies display rounding without changing calculation precision', () => {
  assert.equal(roundMoney(12_345.5, 'KR'), 12_346);
  assert.equal(roundMoney(-1.5, 'KR'), -2);
  assert.equal(roundMoney(12.345, 'US'), 12.35);
  assert.equal(roundMoney(-0.001, 'US'), 0);
  assert.throws(() => roundMoney(Number.NaN, 'KR'), /유한한 숫자/);
});
