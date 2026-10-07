import { useState } from 'react';
import { Collapse } from '@shared/ui';
import { formatHistoricalMoney } from '../../../../utils/displayCurrency';
import type { TransactionTableProps } from './TransactionTable';
import styles from './TransactionHistory.module.scss';

export function TransactionMobileList({
  histories,
  displayCurrency,
  isSaving,
  deletingId,
  showConfirm,
  showDelete,
  onConfirm,
  onDeleteHistory,
}: TransactionTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  return (
    <ul className={styles.mobileList} aria-label="거래 내역">
      {histories.map((history) => {
        const amount = (value: number) =>
          formatHistoricalMoney(value, history.market, displayCurrency, history.exchangeRate);
        const needsConfirmation =
          history.source === 'RECURRING' &&
          history.portfolioType === 'REAL' &&
          history.recurringExecutionStatus !== 'CONFIRMED';
        const expanded = expandedIds.has(history.id);
        const detailsId = `transaction-details-${history.id}`;
        return (
          <li key={history.id} className={styles.mobileCard}>
            <button
              type="button"
              className={styles.mobileCardToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={`${history.name ?? history.ticker} ${expanded ? '거래 상세 접기' : '거래 상세 보기'}`}
              onClick={() =>
                setExpandedIds((current) => {
                  const next = new Set(current);
                  if (expanded) next.delete(history.id);
                  else next.add(history.id);
                  return next;
                })
              }
            >
              <span className={styles.mobileCardHeader}>
                <strong>{history.name ?? history.ticker}</strong>
                <span>{history.date}</span>
              </span>
              <span className={styles.mobileCardMeta}>
                <span className={history.type === 'BUY' ? styles.buyBadge : styles.sellBadge}>
                  {history.type === 'BUY' ? '매수' : '매도'}
                </span>
                <span>
                  {history.source === 'RECURRING'
                    ? (history.recurringRuleName ?? '적립식 자동매수')
                    : '수동 기록'}
                </span>
                {showConfirm && needsConfirmation ? (
                  <span className={styles.mobilePending}>체결 확인 필요</span>
                ) : null}
              </span>
              <span className={styles.mobileCardPreview}>
                <span>거래금액</span>
                <strong>{amount(history.grossAmount)}</strong>
                <span className={styles.mobileCardMore} aria-hidden="true">
                  {expanded ? '접기' : '거래 상세'}
                </span>
              </span>
            </button>
            <Collapse open={expanded} id={detailsId}>
              <div className={styles.mobileCardBody}>
                {history.source === 'RECURRING' && (
                  <small>
                    예정 {history.scheduledDate ?? history.date} · 반영 {history.date}
                  </small>
                )}
                <dl className={styles.mobileCardValues}>
                  <div>
                    <dt>가격</dt>
                    <dd>{amount(history.price)}</dd>
                  </div>
                  <div>
                    <dt>수량</dt>
                    <dd>{history.quantity.toLocaleString('ko-KR')}주</dd>
                  </div>
                  <div>
                    <dt>수수료/세금</dt>
                    <dd>{history.fee + history.tax ? amount(history.fee + history.tax) : '-'}</dd>
                  </div>
                  {history.type === 'SELL' && (
                    <div>
                      <dt>실현손익</dt>
                      <dd className={history.realizedPnL >= 0 ? styles.positive : styles.negative}>
                        {amount(history.realizedPnL)}
                      </dd>
                    </div>
                  )}
                </dl>
                {(showConfirm || showDelete) && (
                  <div className={styles.mobileCardActions}>
                    {showConfirm && needsConfirmation && (
                      <button
                        type="button"
                        className={styles.confirmButton}
                        onClick={() => onConfirm(history)}
                      >
                        체결 확인
                      </button>
                    )}
                    {showDelete && (
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => onDeleteHistory(history)}
                        disabled={isSaving || deletingId !== null}
                      >
                        {deletingId === history.id ? '삭제 중' : '삭제'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Collapse>
          </li>
        );
      })}
    </ul>
  );
}
