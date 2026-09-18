import { useMemo, useState } from 'react';
import type { HoldingHistory } from '../../types';
import { useDisplayCurrencyStore } from '../../store/displayCurrencyStore';
import { formatHistoricalMoney } from '../../utils/displayCurrency';
import { RecurringExecutionConfirmModal } from '../RecurringExecutionConfirmModal/RecurringExecutionConfirmModal';
import styles from './TransactionHistory.module.scss';

type TransactionFilter = 'ALL' | 'BUY' | 'SELL';
type SourceFilter = 'ALL' | 'MANUAL' | 'RECURRING';
type SortOrder = 'DESC' | 'ASC';

const recurringRuleFilterStorageKey = 'transaction-history-recurring-rule-id';

const loadRecurringRuleFilter = (): string => {
  try {
    return sessionStorage.getItem(recurringRuleFilterStorageKey) ?? '';
  } catch {
    return '';
  }
};

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
  const [type, setType] = useState<TransactionFilter>('ALL');
  const [source, setSource] = useState<SourceFilter>(() =>
    loadRecurringRuleFilter() ? 'RECURRING' : 'ALL',
  );
  const [recurringRuleId, setRecurringRuleId] = useState(loadRecurringRuleFilter);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [confirmingHistory, setConfirmingHistory] = useState<HoldingHistory | null>(null);

  const filteredHistories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return histories
      .filter((history) => type === 'ALL' || history.type === type)
      .filter(
        (history) =>
          source === 'ALL' ||
          (source === 'RECURRING'
            ? history.source === 'RECURRING'
            : history.source !== 'RECURRING'),
      )
      .filter((history) => !recurringRuleId || history.recurringRuleId === recurringRuleId)
      .filter(
        (history) =>
          !normalizedQuery ||
          history.ticker.toLowerCase().includes(normalizedQuery) ||
          history.name?.toLowerCase().includes(normalizedQuery),
      )
      .filter((history) => !fromDate || history.date >= fromDate)
      .filter((history) => !toDate || history.date <= toDate)
      .sort((left, right) => {
        const comparison =
          left.date.localeCompare(right.date) ||
          left.createdAt - right.createdAt ||
          left.id.localeCompare(right.id);
        return sortOrder === 'DESC' ? -comparison : comparison;
      });
  }, [fromDate, histories, query, recurringRuleId, sortOrder, source, toDate, type]);

  const selectedRecurringRuleName = recurringRuleId
    ? histories.find((history) => history.recurringRuleId === recurringRuleId)?.recurringRuleName
    : null;

  const clearRecurringRuleFilter = () => {
    setRecurringRuleId('');
    setSource('ALL');
    try {
      sessionStorage.removeItem(recurringRuleFilterStorageKey);
    } catch {
      // Session storage is optional for this navigation aid.
    }
  };

  const selectSourceFilter = (nextSource: SourceFilter) => {
    setSource(nextSource);
    setRecurringRuleId('');
    try {
      sessionStorage.removeItem(recurringRuleFilterStorageKey);
    } catch {
      // Session storage is optional for this navigation aid.
    }
  };

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

      <div className={styles.filters}>
        <div className={styles.typeFilters} role="group" aria-label="거래 구분 필터">
          {(
            [
              ['ALL', '전체'],
              ['BUY', '매수'],
              ['SELL', '매도'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={type === value ? styles.active : undefined}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.sourceFilters} role="group" aria-label="거래 출처 필터">
          {(
            [
              ['ALL', '전체 출처'],
              ['MANUAL', '수동'],
              ['RECURRING', '적립식 자동'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={source === value ? styles.active : undefined}
              onClick={() => selectSourceFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          <span className={styles.srOnly}>종목 검색</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="종목명 또는 티커 검색"
          />
        </label>
        <label>
          <span className={styles.srOnly}>시작일</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <span className={styles.dateSeparator}>~</span>
        <label>
          <span className={styles.srOnly}>종료일</span>
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <select
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          aria-label="정렬 순서"
        >
          <option value="DESC">최신순</option>
          <option value="ASC">오래된순</option>
        </select>
      </div>
      {recurringRuleId ? (
        <div className={styles.ruleFilterNotice}>
          <span>{selectedRecurringRuleName ?? '선택한 규칙'} 자동매수 이력만 표시 중</span>
          <button type="button" onClick={clearRecurringRuleFilter}>
            필터 해제
          </button>
        </div>
      ) : null}
      {deleteError && (
        <p className={styles.error} role="alert">
          {deleteError}
        </p>
      )}

      {!filteredHistories.length ? (
        <p className={styles.empty}>조건에 맞는 거래 기록이 없습니다.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>거래일</th>
                <th>구분</th>
                <th>출처</th>
                <th>종목</th>
                <th>가격</th>
                <th>수량</th>
                <th>거래금액</th>
                <th>수수료/세금</th>
                <th>실현손익</th>
                {onConfirmRecurring && <th>체결 확인</th>}
                {onDelete && <th>관리</th>}
              </tr>
            </thead>
            <tbody>
              {filteredHistories.map((history) => {
                const cost = history.fee + history.tax;
                return (
                  <tr key={history.id}>
                    <td>{history.date}</td>
                    <td>
                      <span className={history.type === 'BUY' ? styles.buyBadge : styles.sellBadge}>
                        {history.type === 'BUY' ? '매수' : '매도'}
                      </span>
                    </td>
                    <td>
                      {history.source === 'RECURRING' ? (
                        <span className={styles.recurringSource}>
                          <strong>{history.recurringRuleName ?? '적립식 자동매수'}</strong>
                          <small>
                            예정 {history.scheduledDate ?? history.date} · 반영 {history.date}
                          </small>
                        </span>
                      ) : (
                        <span className={styles.manualSource}>수동 기록</span>
                      )}
                    </td>
                    <td>
                      <strong>{history.name ?? history.ticker}</strong>
                    </td>
                    <td>
                      {formatHistoricalMoney(
                        history.price,
                        history.market,
                        displayCurrency,
                        history.exchangeRate,
                      )}
                    </td>
                    <td>{history.quantity.toLocaleString('ko-KR')}주</td>
                    <td>
                      {formatHistoricalMoney(
                        history.grossAmount,
                        history.market,
                        displayCurrency,
                        history.exchangeRate,
                      )}
                    </td>
                    <td>
                      {cost
                        ? formatHistoricalMoney(
                            cost,
                            history.market,
                            displayCurrency,
                            history.exchangeRate,
                          )
                        : '-'}
                    </td>
                    <td
                      className={
                        history.type === 'SELL'
                          ? history.realizedPnL >= 0
                            ? styles.positive
                            : styles.negative
                          : undefined
                      }
                    >
                      {history.type === 'SELL'
                        ? formatHistoricalMoney(
                            history.realizedPnL,
                            history.market,
                            displayCurrency,
                            history.exchangeRate,
                          )
                        : '-'}
                    </td>
                    {onConfirmRecurring && (
                      <td>
                        {history.source === 'RECURRING' &&
                        history.portfolioType === 'REAL' &&
                        history.recurringExecutionStatus !== 'CONFIRMED' ? (
                          <button
                            type="button"
                            className={styles.confirmButton}
                            onClick={() => setConfirmingHistory(history)}
                          >
                            확인 필요
                          </button>
                        ) : history.source === 'RECURRING' && history.portfolioType === 'REAL' ? (
                          <span className={styles.confirmed}>확정</span>
                        ) : (
                          '-'
                        )}
                      </td>
                    )}
                    {onDelete && (
                      <td>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => void deleteHistory(history)}
                          disabled={isSaving || deletingId !== null}
                        >
                          {deletingId === history.id ? '삭제 중' : '삭제'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
