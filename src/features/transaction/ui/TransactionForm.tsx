import { useState } from 'react';
import type { Holding, MarketType } from '../../../types';
import { StockSearchField } from '@features/market-search';
import type { useTransactionForm } from '../model/useTransactionForm';
import styles from './TransactionModal.module.scss';

interface TransactionFormProps {
  type: 'BUY' | 'SELL';
  holdings: Holding[];
  isPresetStock: boolean;
  isSaving: boolean;
  onClose: () => void;
  form: ReturnType<typeof useTransactionForm>;
}

const money = (value: number, market: MarketType) => {
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: market === 'US' ? 2 : 0,
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  });
  return market === 'KR' ? `${formatted}원` : `$${formatted}`;
};

export function TransactionForm({
  type,
  holdings,
  isPresetStock,
  isSaving,
  onClose,
  form,
}: TransactionFormProps) {
  const [isHoldingPickerOpen, setIsHoldingPickerOpen] = useState(false);
  const {
    draft,
    setDraft,
    error,
    selectedHolding,
    grossAmount,
    expectedPnL,
    setTradeNumeric,
    setCost,
    selectHolding,
    selectSearchResult,
    submit,
  } = form;

  return (
    <form onSubmit={(event) => void submit(event)}>
      {type === 'SELL' && !isPresetStock ? (
        <div className={styles.holdingPicker}>
          <span>보유 종목</span>
          <button
            type="button"
            className={styles.holdingPickerTrigger}
            onClick={() => setIsHoldingPickerOpen((current) => !current)}
            onBlur={() => window.setTimeout(() => setIsHoldingPickerOpen(false), 120)}
            disabled={isSaving}
            aria-expanded={isHoldingPickerOpen}
          >
            {selectedHolding
              ? `${selectedHolding.name ?? selectedHolding.ticker} · ${selectedHolding.quantity.toLocaleString('ko-KR')}주`
              : '종목을 선택하세요'}
          </button>
          {isHoldingPickerOpen ? (
            <ul className={styles.holdingPickerOptions} role="listbox" aria-label="보유 종목 선택">
              {holdings.map((holding) => {
                const value = `${holding.market}:${holding.ticker}`;
                return (
                  <li
                    key={value}
                    role="option"
                    aria-selected={
                      selectedHolding?.ticker === holding.ticker &&
                      selectedHolding.market === holding.market
                    }
                  >
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        selectHolding(value);
                        setIsHoldingPickerOpen(false);
                      }}
                    >
                      <strong>{holding.name ?? holding.ticker}</strong>
                      <span>{holding.quantity.toLocaleString('ko-KR')}주 보유</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : !isPresetStock ? (
        <div className={styles.stockFields}>
          <StockSearchField
            disabled={isSaving}
            onSelect={selectSearchResult}
            onClearSelection={() => setDraft((current) => ({ ...current, ticker: '', name: '' }))}
          />
        </div>
      ) : (
        <p className={styles.selectedStockInfo}>
          선택 종목: <strong>{draft.name || draft.ticker}</strong> ·{' '}
          {draft.market === 'KR' ? '국내 (KRW)' : '미국 (USD)'}
        </p>
      )}

      {type === 'SELL' && selectedHolding && (
        <p className={styles.holdingInfo}>
          현재 보유: <strong>{selectedHolding.quantity.toLocaleString('ko-KR')}주</strong> · 평단가{' '}
          <strong>{money(selectedHolding.averagePrice, selectedHolding.market)}</strong>
        </p>
      )}

      <div className={styles.numericFields}>
        <label>
          거래 단가
          <input
            inputMode="decimal"
            value={draft.price}
            onChange={(event) => setTradeNumeric('price', event.target.value)}
            placeholder={draft.market === 'KR' ? '예: 72,000' : '예: 185.50'}
            disabled={isSaving}
            required
          />
        </label>
        <label>
          수량
          <input
            inputMode="decimal"
            value={draft.quantity}
            onChange={(event) => setTradeNumeric('quantity', event.target.value)}
            placeholder="예: 10"
            disabled={isSaving}
            required
          />
        </label>
        <label>
          거래일
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            disabled={isSaving}
            required
          />
        </label>
      </div>

      <details className={styles.costDetails}>
        <summary>수수료·세금 입력 (기본 추정값 적용)</summary>
        <div className={styles.numericFields}>
          <label>
            수수료
            <input
              inputMode="decimal"
              value={draft.fee}
              onChange={(event) => setCost('fee', event.target.value)}
              placeholder="0"
              disabled={isSaving}
            />
          </label>
          <label>
            세금
            <input
              inputMode="decimal"
              value={draft.tax}
              onChange={(event) => setCost('tax', event.target.value)}
              placeholder="0"
              disabled={isSaving}
            />
          </label>
        </div>
      </details>

      <p className={styles.costGuide}>
        기본값: 수수료는 거래금액의 0.015%, 국내 매도 세금은 0.2%로 추정합니다. 실제 비용에 맞게
        수정하세요.
      </p>

      <div className={styles.preview}>
        <span>예상 거래금액</span>
        <strong>{grossAmount === null ? '입력 필요' : money(grossAmount, draft.market)}</strong>
        {type === 'SELL' && (
          <>
            <span>예상 실현손익</span>
            <strong
              className={
                expectedPnL === null || expectedPnL >= 0 ? styles.positive : styles.negative
              }
            >
              {expectedPnL === null ? '입력 필요' : money(expectedPnL, draft.market)}
            </strong>
          </>
        )}
      </div>

      <p className={styles.helpText}>
        이 기록은 포트폴리오에만 저장되며 실제 증권 주문을 실행하지 않습니다.
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <footer className={styles.footer}>
        <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSaving}>
          취소
        </button>
        <button
          type="submit"
          className={type === 'BUY' ? styles.submitBuy : styles.submitSell}
          disabled={isSaving}
        >
          {isSaving ? '저장 중…' : type === 'BUY' ? '매수 기록 저장' : '매도 기록 저장'}
        </button>
      </footer>
    </form>
  );
}
