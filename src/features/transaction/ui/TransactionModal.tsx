import type { Holding, HoldingHistoryInput, MarketType, Portfolio } from '../../../types';
import { useTransactionForm } from '../model/useTransactionForm';
import { TransactionForm } from './TransactionForm';
import { TransactionDialog } from './TransactionDialog';
import styles from './TransactionModal.module.scss';

export type TransactionModalType = 'BUY' | 'SELL';

export interface TransactionModalPreset {
  ticker?: string;
  name?: string;
  market?: MarketType;
  price?: number;
}

interface TransactionModalProps {
  isOpen: boolean;
  type: TransactionModalType;
  portfolio: Portfolio | null;
  holdings: Holding[];
  preset?: TransactionModalPreset;
  isSaving?: boolean;
  onTypeChange: (type: TransactionModalType) => void;
  onClose: () => void;
  onSubmit: (input: HoldingHistoryInput) => Promise<void>;
}

export function TransactionModal({ isOpen, type, preset, ...props }: TransactionModalProps) {
  if (!isOpen) return null;
  const resetKey = `${type}:${preset?.market ?? 'KR'}:${preset?.ticker ?? ''}:${preset?.price ?? ''}`;
  return (
    <TransactionModalDialog key={resetKey} isOpen={isOpen} type={type} preset={preset} {...props} />
  );
}

function TransactionModalDialog({
  isOpen,
  type,
  portfolio,
  holdings,
  preset,
  isSaving = false,
  onTypeChange,
  onClose,
  onSubmit,
}: TransactionModalProps) {
  const form = useTransactionForm({ type, portfolio, holdings, preset, onSubmit, onClose });

  const changeType = (nextType: TransactionModalType) => {
    if (nextType === type) return;
    form.setError('');
    onTypeChange(nextType);
  };

  if (!isOpen) return null;

  const isPresetStock = Boolean(preset?.ticker && preset?.market);

  return (
    <TransactionDialog open={isOpen} onClose={onClose} saving={isSaving} className={styles.dialog}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            {portfolio?.type === 'VIRTUAL' ? '가상 포트폴리오' : '실제 포트폴리오'}
          </p>
          <h2 id="transaction-modal-title">거래 기록 추가</h2>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          disabled={isSaving}
          aria-label="거래 기록 모달 닫기"
        >
          ×
        </button>
      </header>

      <div className={styles.typeTabs} role="tablist" aria-label="거래 구분">
        <button
          type="button"
          role="tab"
          aria-selected={type === 'BUY'}
          className={type === 'BUY' ? styles.activeBuy : undefined}
          onClick={() => changeType('BUY')}
          disabled={isSaving}
        >
          매수 기록
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={type === 'SELL'}
          className={type === 'SELL' ? styles.activeSell : undefined}
          onClick={() => changeType('SELL')}
          disabled={isSaving || !holdings.length}
        >
          매도 기록
        </button>
      </div>

      <TransactionForm
        type={type}
        holdings={holdings}
        isPresetStock={isPresetStock}
        isSaving={isSaving}
        onClose={onClose}
        form={form}
      />
    </TransactionDialog>
  );
}
