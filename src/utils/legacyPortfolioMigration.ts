import type { HoldingHistory, StockItem } from '../types';

const legacyCreatedAt = (addedAt: string): number => {
  const parsed = Date.parse(addedAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

const legacyDate = (addedAt: string): string => addedAt.slice(0, 10);

/** 기존 직접 입력형 보유 데이터를 재실행 가능한 초기 매수 이력으로 변환한다. */
export const createLegacyImportHistory = (
  stock: StockItem,
  portfolioId: string,
  importedAt: number,
): HoldingHistory => ({
  id: `legacy-${stock.id}`,
  portfolioId,
  portfolioType: 'REAL',
  ticker: stock.ticker,
  name: stock.name,
  market: stock.market,
  type: 'BUY',
  price: stock.buyPrice,
  quantity: stock.quantity,
  grossAmount: stock.buyPrice * stock.quantity,
  fee: 0,
  tax: 0,
  realizedPnL: 0,
  date: legacyDate(stock.addedAt),
  createdAt: legacyCreatedAt(stock.addedAt),
  source: 'LEGACY_IMPORT',
  legacyStockId: stock.id,
  importedAt,
  legacyAddedAt: stock.addedAt,
});
