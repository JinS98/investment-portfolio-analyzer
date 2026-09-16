import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcDailyPortfolioSnapshot } from '../src/utils/portfolioSnapshot.ts';
import type { Holding, StockItem } from '../src/types/index.ts';

const portfolio: StockItem[] = [
  {
    id: 'kr',
    ticker: '005930',
    name: '삼성전자',
    market: 'KR',
    buyPrice: 100,
    quantity: 2,
    addedAt: '',
  },
  { id: 'us', ticker: 'AAPL', name: '애플', market: 'US', buyPrice: 10, quantity: 3, addedAt: '' },
];
const exchangeRate = {
  baseCurrency: 'USD' as const,
  quoteCurrency: 'KRW' as const,
  rate: 1000,
  midRate: 1000,
  validFrom: '',
  validUntil: '',
};

test('daily snapshot saves KRW-converted purchase value, current value, and return', () => {
  const snapshot = calcDailyPortfolioSnapshot(
    portfolio,
    { '005930': 120, AAPL: 12 },
    exchangeRate,
    new Date('2026-09-14T01:00:00Z'),
  );

  assert.deepEqual(snapshot, {
    date: '2026-09-14',
    totalBuyValue: 30200,
    totalValue: 36240,
    totalProfitAmount: 6040,
    totalProfitRate: 20,
    exchangeRate: 1000,
  });
});

test('a portfolio with US stocks waits for an exchange rate before saving', () => {
  assert.equal(calcDailyPortfolioSnapshot(portfolio, {}, null), null);
});

test('a snapshot waits until every held stock has a current price', () => {
  assert.equal(calcDailyPortfolioSnapshot(portfolio, { '005930': 120 }, exchangeRate), null);
});

test('a ledger holding uses its moving average as the purchase value', () => {
  const holdings: Holding[] = [
    {
      portfolioId: 'real-portfolio',
      ticker: '005930',
      name: 'Samsung Electronics',
      market: 'KR',
      quantity: 2,
      averagePrice: 100,
      investedAmount: 200,
    },
  ];

  assert.deepEqual(
    calcDailyPortfolioSnapshot(holdings, { '005930': 125 }, null, new Date('2026-09-14T01:00:00Z')),
    {
      date: '2026-09-14',
      totalBuyValue: 200,
      totalValue: 250,
      totalProfitAmount: 50,
      totalProfitRate: 25,
      exchangeRate: null,
    },
  );
});
