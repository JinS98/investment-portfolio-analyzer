import { useMemo, useState } from 'react';
import type { HoldingHistory } from '../../../types';

export type TransactionFilter = 'ALL' | 'BUY' | 'SELL';
export type SourceFilter = 'ALL' | 'MANUAL' | 'RECURRING';
export type SortOrder = 'DESC' | 'ASC';

const recurringRuleFilterStorageKey = 'transaction-history-recurring-rule-id';

const loadRecurringRuleFilter = (): string => {
  try {
    return sessionStorage.getItem(recurringRuleFilterStorageKey) ?? '';
  } catch {
    return '';
  }
};

export function useTransactionFilters(histories: HoldingHistory[]) {
  const [type, setType] = useState<TransactionFilter>('ALL');
  const [source, setSource] = useState<SourceFilter>(() =>
    loadRecurringRuleFilter() ? 'RECURRING' : 'ALL',
  );
  const [recurringRuleId, setRecurringRuleId] = useState(loadRecurringRuleFilter);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');
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

  return {
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
    filteredHistories,
  };
}
