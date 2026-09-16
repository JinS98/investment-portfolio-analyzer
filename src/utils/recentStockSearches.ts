import type { StockSearchItem } from '../types/market';

const STORAGE_KEY = 'recent-stock-searches-v1';
const LIMIT = 5;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const itemKey = (item: StockSearchItem) => `${item.market}:${item.symbol}`;

export function loadRecentStockSearches(
  storage: StorageLike | null = getStorage(),
): StockSearchItem[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StockSearchItem =>
      Boolean(
        item &&
        typeof item === 'object' &&
        typeof item.symbol === 'string' &&
        typeof item.name === 'string' &&
        typeof item.market === 'string',
      ),
    );
  } catch {
    return [];
  }
}

export function saveRecentStockSearch(
  item: StockSearchItem,
  storage: StorageLike | null = getStorage(),
): StockSearchItem[] {
  const next = [
    item,
    ...loadRecentStockSearches(storage).filter((value) => itemKey(value) !== itemKey(item)),
  ].slice(0, LIMIT);
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function getStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}
