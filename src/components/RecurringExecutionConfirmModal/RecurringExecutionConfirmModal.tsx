import { useState } from 'react';
import { FiX } from 'react-icons/fi';
import type { HoldingHistory } from '../../types';
import styles from './RecurringExecutionConfirmModal.module.scss';

interface Props {
  history: HoldingHistory | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (values: { price: number; quantity: number; fee: number; tax: number }) => Promise<void>;
}

export function RecurringExecutionConfirmModal({ history, isSaving, onClose, onConfirm }: Props) {
  const [price, setPrice] = useState(() => String(history?.price ?? ''));
  const [quantity, setQuantity] = useState(() => String(history?.quantity ?? ''));
  const [fee, setFee] = useState(() => String(history?.fee ?? ''));
  const [tax, setTax] = useState(() => String(history?.tax ?? ''));
  const [error, setError] = useState('');
  if (!history) return null;

  const submit = async () => {
    const values = { price: Number(price), quantity: Number(quantity), fee: Number(fee), tax: Number(tax) };
    if (!Object.values(values).every((value) => Number.isFinite(value) && value >= 0) || !values.price || !values.quantity) {
      setError('체결 단가와 수량은 0보다 큰 숫자로 입력하세요.');
      return;
    }
    setError('');
    await onConfirm(values);
  };

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && !isSaving && onClose()}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="recurring-confirm-title">
        <header><div><p>실제 포트폴리오</p><h2 id="recurring-confirm-title">자동매수 체결 확인</h2></div><button type="button" onClick={onClose} disabled={isSaving} aria-label="닫기"><FiX /></button></header>
        <p className={styles.description}>{history.name ?? history.ticker} · {history.date} 자동 반영값입니다. 토스 체결 내역과 맞게 수정한 뒤 확정하세요.</p>
        <div className={styles.fields}>
          <label>체결 단가<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} disabled={isSaving} /></label>
          <label>체결 수량<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={isSaving} /></label>
          <label>수수료<input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} disabled={isSaving} /></label>
          <label>세금<input inputMode="decimal" value={tax} onChange={(event) => setTax(event.target.value)} disabled={isSaving} /></label>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        <footer><button type="button" onClick={onClose} disabled={isSaving}>취소</button><button type="button" onClick={() => void submit()} disabled={isSaving}>{isSaving ? '저장 중...' : '확정 저장'}</button></footer>
      </section>
    </div>
  );
}
