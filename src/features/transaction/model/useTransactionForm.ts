import { useMemo, useState, type FormEvent } from 'react';
import type { Holding, HoldingHistoryInput, Portfolio } from '../../../types';
import type { StockSearchItem } from '../../../types/market';
import { formatNumericInput, parseNumericInput } from '../../../utils/numericInput';
import {
  calculateDraftValues,
  createTransactionDraft,
  createTransactionInput,
  estimateTransactionCosts,
  marketFromSearchItem,
  validateTransactionForm,
  type TransactionPreset,
  type TransactionType,
} from './transactionForm';

interface UseTransactionFormOptions {
  type: TransactionType;
  portfolio: Portfolio | null;
  holdings: Holding[];
  preset?: TransactionPreset;
  onSubmit: (input: HoldingHistoryInput) => Promise<void>;
  onClose: () => void;
}

const formatEstimatedCost = (value: number) =>
  formatNumericInput(String(Number(value.toPrecision(12))));

export function useTransactionForm({
  type,
  portfolio,
  holdings,
  preset,
  onSubmit,
  onClose,
}: UseTransactionFormOptions) {
  const [draft, setDraft] = useState(() => createTransactionDraft(preset));
  const [error, setError] = useState('');
  const [isFeeCustomized, setIsFeeCustomized] = useState(false);
  const [isTaxCustomized, setIsTaxCustomized] = useState(false);
  const selectedHolding = useMemo(
    () =>
      holdings.find(
        (holding) => holding.ticker === draft.ticker && holding.market === draft.market,
      ),
    [draft.market, draft.ticker, holdings],
  );
  const { grossAmount, expectedPnL } = calculateDraftValues(draft, type, selectedHolding);

  const setTradeNumeric = (field: 'price' | 'quantity', value: string) => {
    setDraft((current) => {
      const next = { ...current, [field]: formatNumericInput(value) };
      const nextPrice = parseNumericInput(next.price);
      const nextQuantity = parseNumericInput(next.quantity);
      const nextGross =
        Number.isFinite(nextPrice) && Number.isFinite(nextQuantity)
          ? nextPrice * nextQuantity
          : null;
      const nextCosts = estimateTransactionCosts(nextGross, next.market, type);
      return {
        ...next,
        ...(isFeeCustomized ? {} : { fee: formatEstimatedCost(nextCosts.fee) }),
        ...(isTaxCustomized ? {} : { tax: formatEstimatedCost(nextCosts.tax) }),
      };
    });
  };

  const setCost = (field: 'fee' | 'tax', value: string) => {
    if (field === 'fee') setIsFeeCustomized(true);
    else setIsTaxCustomized(true);
    setDraft((current) => ({ ...current, [field]: formatNumericInput(value) }));
  };

  const selectHolding = (value: string) => {
    const holding = holdings.find((item) => `${item.market}:${item.ticker}` === value);
    if (!holding) return;
    setDraft((current) => ({
      ...current,
      ticker: holding.ticker,
      name: holding.name ?? '',
      market: holding.market,
      ...(current.price ? {} : { price: formatNumericInput(String(holding.averagePrice)) }),
    }));
  };

  const selectSearchResult = (item: StockSearchItem) => {
    setDraft((current) => ({
      ...current,
      ticker: item.symbol,
      name: item.name,
      market: marketFromSearchItem(item),
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!portfolio) {
      setError('로그인 후 포트폴리오를 불러와주세요.');
      return;
    }
    try {
      const input = createTransactionInput(draft, type, portfolio);
      validateTransactionForm(input, selectedHolding);
      setError('');
      await onSubmit(input);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '거래 기록 저장에 실패했습니다.',
      );
    }
  };

  return {
    draft,
    setDraft,
    error,
    setError,
    selectedHolding,
    grossAmount,
    expectedPnL,
    setTradeNumeric,
    setCost,
    selectHolding,
    selectSearchResult,
    submit,
  };
}
