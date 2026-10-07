import type { Holding, HoldingHistoryInput, MarketType, Portfolio } from '../../../types/index.ts';
import type { StockSearchItem } from '../../../types/market.ts';
import { validateBuyInput, validateSellInput } from '../../../utils/calculator.ts';
import { formatNumericInput, parseNumericInput } from '../../../utils/numericInput.ts';

export type TransactionType = 'BUY' | 'SELL';

export interface TransactionPreset {
  ticker?: string;
  name?: string;
  market?: MarketType;
  price?: number;
}

export interface TransactionDraft {
  ticker: string;
  name: string;
  market: MarketType;
  price: string;
  quantity: string;
  date: string;
  fee: string;
  tax: string;
}

export const DEFAULT_FEE_RATE = 0.00015;
export const DEFAULT_KR_SELL_TAX_RATE = 0.002;

export function koreaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function createTransactionDraft(preset?: TransactionPreset): TransactionDraft {
  return {
    ticker: preset?.ticker ?? '',
    name: preset?.name ?? '',
    market: preset?.market ?? 'KR',
    price: preset?.price === undefined ? '' : formatNumericInput(String(preset.price)),
    quantity: '',
    date: koreaDate(),
    fee: '0',
    tax: '0',
  };
}

export function estimateTransactionCosts(
  grossAmount: number | null,
  market: MarketType,
  type: TransactionType,
) {
  if (grossAmount === null) return { fee: 0, tax: 0 };
  return {
    fee: grossAmount * DEFAULT_FEE_RATE,
    tax: type === 'SELL' && market === 'KR' ? grossAmount * DEFAULT_KR_SELL_TAX_RATE : 0,
  };
}

export const marketFromSearchItem = (item: StockSearchItem): MarketType =>
  ['KOSPI', 'KOSDAQ', 'KR_ETC'].includes(item.market) ? 'KR' : 'US';

export function calculateDraftValues(
  draft: TransactionDraft,
  type: TransactionType,
  holding?: Holding,
) {
  const price = parseNumericInput(draft.price);
  const quantity = parseNumericInput(draft.quantity);
  const fee = draft.fee.trim() ? parseNumericInput(draft.fee) : 0;
  const tax = draft.tax.trim() ? parseNumericInput(draft.tax) : 0;
  const grossAmount = Number.isFinite(price) && Number.isFinite(quantity) ? price * quantity : null;
  const expectedPnL =
    type === 'SELL' &&
    holding &&
    grossAmount !== null &&
    Number.isFinite(fee) &&
    Number.isFinite(tax)
      ? (price - holding.averagePrice) * quantity - fee - tax
      : null;
  const expectedSettlement =
    grossAmount !== null && Number.isFinite(fee) && Number.isFinite(tax)
      ? type === 'BUY'
        ? grossAmount + fee + tax
        : grossAmount - fee - tax
      : null;
  const expectedAveragePrice =
    type === 'BUY' && grossAmount !== null && quantity > 0
      ? ((holding?.investedAmount ?? 0) + grossAmount) / ((holding?.quantity ?? 0) + quantity)
      : null;
  return {
    price,
    quantity,
    fee,
    tax,
    grossAmount,
    expectedSettlement,
    expectedAveragePrice,
    expectedPnL,
  };
}

export function createTransactionInput(
  draft: TransactionDraft,
  type: TransactionType,
  portfolio: Portfolio,
): HoldingHistoryInput {
  const values = calculateDraftValues(draft, type);
  return {
    portfolioId: portfolio.id,
    portfolioType: portfolio.type,
    ticker: draft.ticker.trim().toUpperCase(),
    ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
    market: draft.market,
    type,
    price: values.price,
    quantity: values.quantity,
    fee: values.fee,
    tax: values.tax,
    date: draft.date,
  };
}

export function validateTransactionForm(input: HoldingHistoryInput, holding?: Holding) {
  if (input.type === 'BUY') return validateBuyInput(input);
  const validated = validateSellInput(input);
  if (!holding) throw new Error('매도할 보유 종목을 선택해주세요.');
  if (input.quantity > holding.quantity) {
    throw new Error(`매도 수량은 현재 보유 수량 ${holding.quantity} 이하로 입력해주세요.`);
  }
  return validated;
}
