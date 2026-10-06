import { useCallback } from 'react';
import {
  createPortfolioStock,
  deletePortfolioStock,
  updatePortfolioStock as updateStoredPortfolioStock,
} from '../services/portfolioService';
import { usePortfolioStore } from '../store/portfolioStore';
import type { PriceMap, StockItem } from '../types';
import { calcPortfolio } from '../utils/calculator';

interface StockCrudParams {
  userId?: string;
  portfolio: StockItem[];
  prices: PriceMap;
}

export function usePortfolioStockCrud({ userId, portfolio, prices }: StockCrudParams) {
  const addStock = usePortfolioStore((state) => state.addStock);
  const updateStock = usePortfolioStore((state) => state.updateStock);
  const removeStock = usePortfolioStore((state) => state.removeStock);
  const setComputedData = usePortfolioStore((state) => state.setComputedData);

  const addPortfolioStock = useCallback(
    async (stock: Parameters<typeof createPortfolioStock>[1]) => {
      if (!userId) throw new Error('로그인 후 종목을 추가해주세요.');
      const savedStock = await createPortfolioStock(userId, stock);
      addStock(savedStock);
      setComputedData(calcPortfolio([...portfolio, savedStock], prices));
    },
    [userId, addStock, portfolio, prices, setComputedData],
  );

  const updatePortfolioStock = useCallback(
    async (id: string, updates: Parameters<typeof updateStock>[1]) => {
      if (!userId) throw new Error('로그인 후 종목을 수정해주세요.');
      await updateStoredPortfolioStock(userId, id, updates);
      updateStock(id, updates);
      setComputedData(
        calcPortfolio(
          portfolio.map((stock) => (stock.id === id ? { ...stock, ...updates } : stock)),
          prices,
        ),
      );
    },
    [userId, updateStock, portfolio, prices, setComputedData],
  );

  const removePortfolioStock = useCallback(
    async (id: string) => {
      if (!userId) throw new Error('로그인 후 종목을 삭제해주세요.');
      await deletePortfolioStock(userId, id);
      removeStock(id);
      setComputedData(
        calcPortfolio(
          portfolio.filter((stock) => stock.id !== id),
          prices,
        ),
      );
    },
    [userId, removeStock, portfolio, prices, setComputedData],
  );

  return {
    addStock: addPortfolioStock,
    updateStock: updatePortfolioStock,
    removeStock: removePortfolioStock,
  };
}
