import type { StockSearchItem } from '../../../types/market';
import styles from './StockSearchField.module.scss';

interface StockSearchResultsProps {
  items: StockSearchItem[];
  recent: boolean;
  onSelect: (item: StockSearchItem) => void;
}

export function StockSearchResults({ items, recent, onSelect }: StockSearchResultsProps) {
  if (items.length === 0) return null;

  return (
    <ul
      className={styles.results}
      role="listbox"
      aria-label={recent ? '최근 검색 종목' : '검색 결과'}
    >
      {recent && <li className={styles.title}>최근 검색</li>}
      {items.map((item) => (
        <li key={`${item.market}-${item.symbol}`} role="option" aria-selected="false">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
          >
            <strong>{item.name}</strong>
            <span className={styles.symbol}>{item.symbol}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
