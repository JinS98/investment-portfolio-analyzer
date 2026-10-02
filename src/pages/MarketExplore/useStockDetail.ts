import { useEffect, useRef, useState } from 'react';
import { isKoreanMarket } from '@entities/stock';
import type { MarketExploreStock } from '../../services/marketExploreService';
import { fetchStockInsights } from '../../services/marketInsightsApi';
import { fetchCandlePage, fetchQuotes } from '../../services/tossApi';
import type { StockDetail } from './StockDetailDrawer';

export function useStockDetail() {
  const [selectedStock, setSelectedStock] = useState<MarketExploreStock | null>(null);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [portfolioActionNotice, setPortfolioActionNotice] = useState('');
  const detailRequestId = useRef(0);

  useEffect(
    () => () => {
      detailRequestId.current += 1;
    },
    [],
  );

  const loadStockDetail = async (stock: MarketExploreStock) => {
    const requestId = ++detailRequestId.current;
    setIsDetailLoading(true);
    setDetailError('');
    setStockDetail(null);
    try {
      const [quotes, candlePage, insights] = await Promise.all([
        fetchQuotes([stock.symbol]),
        fetchCandlePage(stock.symbol, 30),
        fetchStockInsights(
          stock.symbol,
          stock.name,
          isKoreanMarket(stock.market) ? 'KR' : 'US',
        ).catch(() => null),
      ]);
      if (requestId === detailRequestId.current) {
        setStockDetail({ quote: quotes[0] ?? null, candles: candlePage.candles, insights });
      }
    } catch (cause) {
      if (requestId === detailRequestId.current) {
        setDetailError(
          cause instanceof Error
            ? cause.message
            : '종목 상세 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
    } finally {
      if (requestId === detailRequestId.current) setIsDetailLoading(false);
    }
  };

  const openStockDrawer = (stock: MarketExploreStock) => {
    setSelectedStock(stock);
    void loadStockDetail(stock);
  };
  const closeStockDrawer = () => {
    detailRequestId.current += 1;
    setSelectedStock(null);
    setStockDetail(null);
    setDetailError('');
    setPortfolioActionNotice('');
  };
  const retryStockDetail = () => {
    if (selectedStock) void loadStockDetail(selectedStock);
  };

  return {
    selectedStock,
    stockDetail,
    isDetailLoading,
    detailError,
    portfolioActionNotice,
    setPortfolioActionNotice,
    openStockDrawer,
    closeStockDrawer,
    retryStockDetail,
  };
}
