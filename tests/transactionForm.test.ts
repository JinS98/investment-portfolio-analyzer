import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDraftValues,
  createTransactionDraft,
  createTransactionInput,
  estimateTransactionCosts,
  marketFromSearchItem,
  validateTransactionForm,
} from '../src/features/transaction/model/transactionForm.ts';
import type { Holding, Portfolio } from '../src/types/index.ts';

const portfolio: Portfolio = {
  id: 'portfolio-1',
  userId: 'user-1',
  name: '실제 포트폴리오',
  type: 'REAL',
  createdAt: 0,
  updatedAt: 0,
};

test('transaction draft preserves a preset and maps search markets', () => {
  const draft = createTransactionDraft({ ticker: 'AAPL', name: 'Apple', market: 'US', price: 200 });
  assert.equal(draft.ticker, 'AAPL');
  assert.equal(draft.price, '200');
  assert.equal(marketFromSearchItem({ symbol: '005930', name: '삼성전자', market: 'KOSPI' }), 'KR');
});

test('transaction costs and sell profit retain the existing calculation policy', () => {
  assert.deepEqual(estimateTransactionCosts(1_000_000, 'KR', 'SELL'), {
    fee: 150,
    tax: 2000,
  });
  const holding: Holding = {
    portfolioId: portfolio.id,
    ticker: '005930',
    name: '삼성전자',
    market: 'KR',
    quantity: 10,
    averagePrice: 70_000,
    investedAmount: 700_000,
  };
  const values = calculateDraftValues(
    {
      ...createTransactionDraft({ ticker: holding.ticker, market: 'KR' }),
      price: '80,000',
      quantity: '3',
      fee: '100',
      tax: '200',
    },
    'SELL',
    holding,
  );
  assert.equal(values.grossAmount, 240_000);
  assert.equal(values.expectedSettlement, 239_700);
  assert.equal(values.expectedPnL, 29_700);
});

test('buy preview recalculates settlement and average price from price and quantity', () => {
  const holding: Holding = {
    portfolioId: portfolio.id,
    ticker: '005930',
    market: 'KR',
    quantity: 10,
    averagePrice: 70_000,
    investedAmount: 700_000,
  };
  const draft = {
    ...createTransactionDraft({ ticker: holding.ticker, market: 'KR', price: 80_000 }),
    quantity: '3',
    fee: '100',
    tax: '0',
  };
  const values = calculateDraftValues(draft, 'BUY', holding);
  assert.equal(values.grossAmount, 240_000);
  assert.equal(values.expectedSettlement, 240_100);
  assert.equal(values.expectedAveragePrice, 940_000 / 13);
  assert.equal(
    calculateDraftValues({ ...draft, quantity: '4' }, 'BUY', holding).expectedAveragePrice,
    1_020_000 / 14,
  );
  assert.equal(
    calculateDraftValues({ ...draft, quantity: '' }, 'BUY', holding).expectedAveragePrice,
    null,
  );
});

test('transaction payload validation rejects a sale above the held quantity', () => {
  const draft = {
    ...createTransactionDraft({ ticker: 'AAPL', name: 'Apple', market: 'US', price: 200 }),
    quantity: '3',
  };
  const input = createTransactionInput(draft, 'SELL', portfolio);
  const holding: Holding = {
    portfolioId: portfolio.id,
    ticker: 'AAPL',
    name: 'Apple',
    market: 'US',
    quantity: 2,
    averagePrice: 180,
    investedAmount: 360,
  };
  assert.throws(() => validateTransactionForm(input, holding), /현재 보유 수량 2 이하/);
});
