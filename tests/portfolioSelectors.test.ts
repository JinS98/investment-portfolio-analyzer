import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPortfolioWorkspace } from '../src/entities/portfolio/model/selectors.ts';
import { createPortfolioManagerViewModel } from '../src/features/portfolio-management/model/portfolioViewModel.ts';
import type { Holding, Portfolio, PortfolioLedger } from '../src/types/index.ts';

const real: Portfolio = {
  id: 'real',
  userId: 'u',
  name: '실제',
  type: 'REAL',
  createdAt: 0,
  updatedAt: 0,
};
const virtual: Portfolio = {
  id: 'virtual',
  userId: 'u',
  name: '가상',
  type: 'VIRTUAL',
  createdAt: 0,
  updatedAt: 0,
};
const holding: Holding = {
  portfolioId: real.id,
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  quantity: 2,
  averagePrice: 70_000,
  investedAmount: 140_000,
};
const ledger = (portfolio: Portfolio, holdings: Holding[] = []): PortfolioLedger => ({
  portfolio,
  holdings,
  histories: [],
  summary: { portfolioId: portfolio.id, byMarket: {} },
});

test('portfolio selector resolves active, requested, and guest workspaces independently', () => {
  const ledgers = { real: ledger(real, [holding]), virtual: ledger(virtual) };
  assert.equal(
    selectPortfolioWorkspace({
      userId: 'u',
      portfolios: [real, virtual],
      activePortfolioId: 'virtual',
      portfolioLedgers: ledgers,
    }).activePortfolio?.id,
    'virtual',
  );
  assert.equal(
    selectPortfolioWorkspace({
      userId: 'u',
      requestedType: 'REAL',
      portfolios: [real, virtual],
      activePortfolioId: 'virtual',
      portfolioLedgers: ledgers,
    }).holdings.length,
    1,
  );
  assert.equal(
    selectPortfolioWorkspace({ portfolios: [], activePortfolioId: null, portfolioLedgers: {} })
      .activePortfolio?.id,
    'guest-real',
  );
  assert.equal(
    selectPortfolioWorkspace({
      requestedType: 'VIRTUAL',
      portfolios: [],
      activePortfolioId: null,
      portfolioLedgers: {},
    }).activePortfolio,
    null,
  );
});

test('portfolio view model groups markets and preserves summary calculations', () => {
  const model = createPortfolioManagerViewModel(
    [holding],
    [
      {
        id: 'history-1',
        portfolioId: real.id,
        portfolioType: 'REAL',
        ticker: holding.ticker,
        name: holding.name,
        market: 'KR',
        type: 'BUY',
        price: 70_000,
        quantity: 2,
        grossAmount: 140_000,
        fee: 0,
        tax: 0,
        realizedPnL: 0,
        date: '2026-10-01',
        createdAt: 1,
      },
    ],
    { '005930': 80_000 },
    null,
    'KRW',
  );
  assert.equal(model.groups[0].market, 'KR');
  assert.equal(model.combinedSummary?.currentValue, 160_000);
  assert.equal(model.combinedSummary?.profitAmount, 20_000);
});
