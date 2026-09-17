import { useMemo, useState } from 'react';
import type { HoldingHistory, MarketType } from '../../types';
import styles from './TransactionHistory.module.scss';

type TransactionFilter = 'ALL' | 'BUY' | 'SELL';
type SortOrder = 'DESC' | 'ASC';

interface TransactionHistoryProps {
  histories: HoldingHistory[];
  isSaving?: boolean;
  onDelete?: (history: HoldingHistory) => Promise<void>;
}

const money = (value: number, market: MarketType) => {
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: market === 'US' ? 2 : 0,
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  });
  return market === 'KR' ? `${formatted}원` : `$${formatted}`;
};

export function TransactionHistory({
  histories,
  isSaving = false,
  onDelete,
}: TransactionHistoryProps) {
  const [type, setType] = useState<TransactionFilter>('ALL');
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const filteredHistories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return histories
      .filter((history) => type === 'ALL' || history.type === type)
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
  }, [fromDate, histories, query, sortOrder, toDate, type]);

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
                <th>종목</th>
                <th>가격</th>
                <th>수량</th>
                <th>거래금액</th>
                <th>수수료/세금</th>
                <th>실현손익</th>
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
                      {history.source === 'RECURRING' ? <small className={styles.recurringSource}>적립식 자동</small> : null}
                    </td>
                    <td>
                      <strong>{history.name ?? history.ticker}</strong>
                    </td>
                    <td>{money(history.price, history.market)}</td>
                    <td>{history.quantity.toLocaleString('ko-KR')}주</td>
                    <td>{money(history.grossAmount, history.market)}</td>
                    <td>{cost ? money(cost, history.market) : '-'}</td>
                    <td
                      className={
                        history.type === 'SELL'
                          ? history.realizedPnL >= 0
                            ? styles.positive
                            : styles.negative
                          : undefined
                      }
                    >
                      {history.type === 'SELL' ? money(history.realizedPnL, history.market) : '-'}
                    </td>
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
    </section>
  );
}
