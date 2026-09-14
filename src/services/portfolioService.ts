import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { StockItem } from '../types';

type NewStock = Omit<StockItem, 'id' | 'addedAt'>;
type EditableStock = Pick<StockItem, 'buyPrice' | 'quantity'>;

function stocksCollection(userId: string) {
  if (!db) throw new Error('Firebase 설정을 확인해주세요.');
  return collection(db, 'portfolios', userId, 'stocks');
}

function ensureStock(value: unknown, id: string): StockItem {
  if (!value || typeof value !== 'object')
    throw new Error('저장된 종목 데이터 형식이 올바르지 않습니다.');
  const data = value as Record<string, unknown>;
  if (
    typeof data.ticker !== 'string' ||
    (data.market !== 'KR' && data.market !== 'US') ||
    typeof data.buyPrice !== 'number' ||
    !Number.isFinite(data.buyPrice) ||
    data.buyPrice <= 0 ||
    typeof data.quantity !== 'number' ||
    !Number.isFinite(data.quantity) ||
    data.quantity <= 0 ||
    typeof data.addedAt !== 'string'
  )
    throw new Error('저장된 종목 데이터에 필수 값이 없습니다.');
  return {
    id,
    ticker: data.ticker,
    market: data.market,
    name: typeof data.name === 'string' ? data.name : undefined,
    buyPrice: data.buyPrice,
    quantity: data.quantity,
    addedAt: data.addedAt,
  };
}

export async function loadPortfolioStocks(userId: string): Promise<StockItem[]> {
  const snapshot = await getDocs(stocksCollection(userId));
  return snapshot.docs
    .map((item) => ensureStock(item.data(), item.id))
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export async function createPortfolioStock(userId: string, input: NewStock): Promise<StockItem> {
  const reference = doc(stocksCollection(userId));
  const stock: StockItem = { ...input, id: reference.id, addedAt: new Date().toISOString() };
  await setDoc(reference, {
    ticker: stock.ticker,
    name: stock.name ?? null,
    market: stock.market,
    buyPrice: stock.buyPrice,
    quantity: stock.quantity,
    addedAt: stock.addedAt,
  });
  return stock;
}

export async function updatePortfolioStock(
  userId: string,
  stockId: string,
  changes: EditableStock,
): Promise<void> {
  if (
    !Number.isFinite(changes.buyPrice) ||
    changes.buyPrice <= 0 ||
    !Number.isFinite(changes.quantity) ||
    changes.quantity <= 0
  )
    throw new Error('매수가와 수량은 0보다 큰 숫자여야 합니다.');
  await updateDoc(doc(stocksCollection(userId), stockId), changes);
}

export async function deletePortfolioStock(userId: string, stockId: string): Promise<void> {
  await deleteDoc(doc(stocksCollection(userId), stockId));
}
