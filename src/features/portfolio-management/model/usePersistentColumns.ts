import { useState } from 'react';
import type { MarketType, PortfolioType } from '../../../types';
import { HOLDING_COLUMN_OPTIONS, type HoldingColumnId } from './holdingColumns';

const defaultColumns = HOLDING_COLUMN_OPTIONS.map((column) => column.id);
const legacyStorageKey = (portfolioType?: PortfolioType) =>
  `portfolio-table-columns-v1-${portfolioType ?? 'all'}`;
const storageKey = (market: MarketType, portfolioType?: PortfolioType) =>
  `portfolio-table-columns-v2-${portfolioType ?? 'all'}-${market}`;

function parseColumns(value: string | null): HoldingColumnId[] | null {
  if (value === null) return null;
  try {
    const saved: unknown = JSON.parse(value);
    if (
      Array.isArray(saved) &&
      saved.every((column): column is HoldingColumnId =>
        HOLDING_COLUMN_OPTIONS.some((option) => option.id === column),
      ) &&
      new Set(saved).size === saved.length
    ) {
      return saved;
    }
  } catch {
    // Invalid saved preferences fall back to the previous preference or defaults.
  }
  return null;
}

function readColumns(market: MarketType, portfolioType?: PortfolioType): HoldingColumnId[] {
  try {
    return (
      parseColumns(localStorage.getItem(storageKey(market, portfolioType))) ??
      parseColumns(localStorage.getItem(legacyStorageKey(portfolioType))) ??
      defaultColumns
    );
  } catch {
    return defaultColumns;
  }
}

export function usePersistentColumns(portfolioType?: PortfolioType) {
  const [visibleColumnsByMarket, setVisibleColumnsByMarket] = useState<
    Record<MarketType, HoldingColumnId[]>
  >(() => ({ KR: readColumns('KR', portfolioType), US: readColumns('US', portfolioType) }));
  const updateColumns = (market: MarketType, columns: HoldingColumnId[]) => {
    setVisibleColumnsByMarket((current) => ({ ...current, [market]: columns }));
    try {
      localStorage.setItem(storageKey(market, portfolioType), JSON.stringify(columns));
    } catch {
      // Keep the current choice when storage is unavailable.
    }
  };
  const toggleColumn = (market: MarketType, column: HoldingColumnId) =>
    updateColumns(
      market,
      visibleColumnsByMarket[market].includes(column)
        ? visibleColumnsByMarket[market].filter((item) => item !== column)
        : [...visibleColumnsByMarket[market], column],
    );
  const resetColumns = (market: MarketType) => updateColumns(market, defaultColumns);

  return { visibleColumnsByMarket, toggleColumn, resetColumns };
}
