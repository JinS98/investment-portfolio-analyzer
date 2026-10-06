import { useState } from 'react';
import type { HoldingHistory } from '../../../../types';
import { useTransactionFilters } from '../../model/useTransactionFilters';
import { useDisplayCurrencyStore } from '../../../../store/displayCurrencyStore';
import { RecurringExecutionConfirmModal } from '@features/recurring-investment';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionTable } from './TransactionTable';
import styles from './TransactionHistory.module.scss';

interface TransactionHistoryProps {
  histories: HoldingHistory[];
  isSaving?: boolean;
  onDelete?: (history: HoldingHistory) => Promise<void>;
  onConfirmRecurring?: (
    history: HoldingHistory,
    values: { price: number; quantity: number; fee: number; tax: number },
  ) => Promise<void>;
}

export function TransactionHistory({
  histories,
  isSaving = false,
  onDelete,
  onConfirmRecurring,
}: TransactionHistoryProps) {
  const displayCurrency = useDisplayCurrencyStore((state) => state.displayCurrency);
  const filters = useTransactionFilters(histories);
  const { filteredHistories } = filters;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [confirmingHistory, setConfirmingHistory] = useState<HoldingHistory | null>(null);

  const deleteHistory = async (history: HoldingHistory) => {
    if (!onDelete || isSaving || deletingId) return;
    if (
      !window.confirm(`${history.date} ${history.name ?? history.ticker} 거래 기록을 삭제할까요?`)
    ) {
      return;
    }

    try {
      setDeleteError('');
      setDeletingId(history.id);
      await onDelete(history);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : '거래 기록을 삭제하지 못했습니다. 다시 시도해주세요.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="transaction-history-title">
      <div className={styles.header}>
        <div>
          <h3 id="transaction-history-title">거래 이력</h3>
          <p>등록한 매수·매도 기록과 매도 실현손익을 확인합니다.</p>
        </div>
        <span>{histories.length}건</span>
      </div>

      <TransactionFilterBar filters={filters} />
      {deleteError && (
        <p className={styles.error} role="alert">
          {deleteError}
        </p>
      )}

      <TransactionTable
        histories={filteredHistories}
        displayCurrency={displayCurrency}
        isSaving={isSaving}
        deletingId={deletingId}
        showConfirm={Boolean(onConfirmRecurring)}
        showDelete={Boolean(onDelete)}
        onConfirm={setConfirmingHistory}
        onDeleteHistory={(history) => void deleteHistory(history)}
      />
      {onConfirmRecurring ? (
        <RecurringExecutionConfirmModal
          key={confirmingHistory?.id ?? 'closed'}
          history={confirmingHistory}
          isSaving={isSaving}
          onClose={() => setConfirmingHistory(null)}
          onConfirm={async (values) => {
            if (!confirmingHistory) return;
            await onConfirmRecurring(confirmingHistory, values);
            setConfirmingHistory(null);
          }}
        />
      ) : null}
    </section>
  );
}
