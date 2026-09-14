import { collection, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { PortfolioHistory } from '../types';
import type { DailyPortfolioSnapshot } from '../utils/portfolioSnapshot';

function historyCollection(userId: string) {
  if (!db) throw new Error('Firebase 설정을 확인해 주세요.');
  return collection(db, 'portfolios', userId, 'history');
}

export async function saveDailyPortfolioHistory(
  userId: string,
  snapshot: DailyPortfolioSnapshot,
): Promise<PortfolioHistory> {
  const savedAt = new Date().toISOString();
  const history: PortfolioHistory = { id: snapshot.date, userId, ...snapshot, savedAt };
  await setDoc(doc(historyCollection(userId), snapshot.date), {
    date: history.date,
    totalBuyValue: history.totalBuyValue,
    totalValue: history.totalValue,
    totalProfitAmount: history.totalProfitAmount,
    totalProfitRate: history.totalProfitRate,
    exchangeRate: history.exchangeRate,
    savedAt: history.savedAt,
  });
  return history;
}

function ensureHistory(value: unknown, id: string, userId: string): PortfolioHistory {
  if (!value || typeof value !== 'object')
    throw new Error('저장된 이력 데이터 형식이 올바르지 않습니다.');
  const data = value as Record<string, unknown>;
  const numberFields = ['totalBuyValue', 'totalValue', 'totalProfitAmount', 'totalProfitRate'];
  if (
    typeof data.date !== 'string' ||
    typeof data.savedAt !== 'string' ||
    numberFields.some((field) => typeof data[field] !== 'number' || !Number.isFinite(data[field]))
  ) {
    throw new Error('저장된 이력 데이터에 필수 값이 없습니다.');
  }
  if (
    data.exchangeRate !== null &&
    (typeof data.exchangeRate !== 'number' || !Number.isFinite(data.exchangeRate))
  ) {
    throw new Error('저장된 환율 데이터 형식이 올바르지 않습니다.');
  }
  return {
    id,
    userId,
    date: data.date,
    totalBuyValue: data.totalBuyValue as number,
    totalValue: data.totalValue as number,
    totalProfitAmount: data.totalProfitAmount as number,
    totalProfitRate: data.totalProfitRate as number,
    exchangeRate: data.exchangeRate as number | null,
    savedAt: data.savedAt,
  };
}

export async function loadPortfolioHistory(userId: string): Promise<PortfolioHistory[]> {
  const snapshot = await getDocs(query(historyCollection(userId), orderBy('date', 'desc')));
  return snapshot.docs.map((item) => ensureHistory(item.data(), item.id, userId));
}
