import type { StockSearchItem } from '../src/types/market.ts';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export function createStockSearch(load: () => Promise<StockSearchItem[]>, now = Date.now) {
  let index: { item: StockSearchItem; symbol: string; name: string }[] | undefined;
  let expires = 0;
  let retryAfter = 0;
  let pending: Promise<void> | undefined;
  const results = new Map<string, StockSearchItem[]>();
  function refresh() {
    if (pending) return pending;
    pending = load().then((items) => {
      if (!items.length) throw new Error('종목 목록이 비어 있습니다.');
      index = items.map((item) => ({ item, symbol: normalize(item.symbol), name: normalize(item.name) }));
      results.clear(); expires = now() + 24 * 60 * 60 * 1000;
    }).catch((error: unknown) => { retryAfter = now() + 60_000; throw error; })
      .finally(() => { pending = undefined; });
    return pending;
  }
  return async (query: string): Promise<StockSearchItem[]> => {
    const key = normalize(query);
    if (!key || key.length > 80) return [];
    if (!index) {
      if (now() < retryAfter) throw new Error('종목 목록을 불러오지 못했습니다. 잠시 후 다시 검색해주세요.');
      await refresh();
    } else if (now() >= expires && now() >= retryAfter) {
      // Serve the previous complete index while refreshing; never expose partial markets.
      void refresh().catch(() => {});
    }
    const cached = results.get(key);
    if (cached) return cached;
    const buckets: StockSearchItem[][] = [[], [], []];
    for (const row of index!) {
      const rank = row.symbol === key || row.name === key ? 0
        : row.symbol.startsWith(key) || row.name.startsWith(key) ? 1
        : row.symbol.includes(key) || row.name.includes(key) ? 2 : -1;
      if (rank >= 0 && buckets[rank].length < 20) buckets[rank].push(row.item);
    }
    const matches = buckets.flat().slice(0, 20);
    if (results.size >= 200) results.delete(results.keys().next().value!);
    results.set(key, matches);
    return matches;
  };
}
