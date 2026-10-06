import type { useTransactionFilters, SortOrder } from '../../model/useTransactionFilters';
import styles from './TransactionHistory.module.scss';

interface TransactionFilterBarProps {
  filters: ReturnType<typeof useTransactionFilters>;
}

export function TransactionFilterBar({ filters }: TransactionFilterBarProps) {
  const {
    type,
    setType,
    source,
    query,
    setQuery,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    sortOrder,
    setSortOrder,
    recurringRuleId,
    selectedRecurringRuleName,
    clearRecurringRuleFilter,
    selectSourceFilter,
  } = filters;
  return (
    <>
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
          <span className={styles.dateLabel}>시작일</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <span className={styles.dateSeparator}>~</span>
        <label>
          <span className={styles.dateLabel}>종료일</span>
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
      ) : null}{' '}
    </>
  );
}
