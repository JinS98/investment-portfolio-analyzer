import { useState } from 'react';
import type { StockSearchItem } from '../../../types/market';
import { useStockSearch } from '../model/useStockSearch';
import { StockSearchResults } from './StockSearchResults';
import styles from './StockSearchField.module.scss';

interface StockSearchFieldProps {
  disabled?: boolean;
  onSelect: (item: StockSearchItem) => void;
  onClearSelection?: () => void;
}

export function StockSearchField({
  disabled = false,
  onSelect,
  onClearSelection,
}: StockSearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const search = useStockSearch({ enabled: focused && !disabled });
  const visibleItems = search.query.trim() ? search.results : search.recentSearches;

  const select = (item: StockSearchItem) => {
    search.select(item);
    onSelect(item);
  };

  return (
    <label className={styles.field}>
      종목 검색
      <input
        value={search.query}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          search.setQuery(event.target.value);
          onClearSelection?.();
        }}
        placeholder="종목명 또는 티커를 입력하세요"
        autoCapitalize="characters"
        disabled={disabled}
        required
      />
      {search.status === 'loading' && <small className={styles.hint}>종목 검색 중…</small>}
      {search.status === 'error' && <small className={styles.hint}>검색에 실패했습니다.</small>}
      {search.status === 'success' && search.results.length === 0 && (
        <small className={styles.hint}>일치하는 종목이 없습니다.</small>
      )}
      {focused && (
        <StockSearchResults items={visibleItems} recent={!search.query.trim()} onSelect={select} />
      )}
    </label>
  );
}
