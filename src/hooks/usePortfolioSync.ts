import { useEffect, useReducer } from 'react';
import { loadPortfolioStocks } from '../services/portfolioService';
import { loadPortfolioHistory } from '../services/portfolioHistoryService';
import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';

export function usePortfolioSync() {
  const userId = useAuthStore((state) => state.user?.uid);
  const replacePortfolio = usePortfolioStore((state) => state.replacePortfolio);
  const setPortfolioHistory = usePortfolioStore((state) => state.setPortfolioHistory);
  const loadPortfolioLedgers = usePortfolioStore((state) => state.loadPortfolioLedgers);
  const resetPortfolioLedgers = usePortfolioStore((state) => state.resetPortfolioLedgers);
  const [state, dispatch] = useReducer(
    (
      _current: { loading: boolean; error: string },
      action: { type: 'start' | 'complete' | 'error'; error?: string },
    ) => {
      if (action.type === 'start') return { loading: true, error: '' };
      if (action.type === 'error')
        return { loading: false, error: action.error ?? '포트폴리오를 불러오지 못했습니다.' };
      return { loading: false, error: '' };
    },
    { loading: false, error: '' },
  );

  useEffect(() => {
    let active = true;
    // 계정 전환 중 이전 계정의 종목이 노출되지 않도록 즉시 비운다.
    // Effect 종료 전 microtask에서 비워서 계정 전환 화면에 이전 데이터가 남지 않게 한다.
    queueMicrotask(() => {
      if (active) {
        replacePortfolio([]);
        setPortfolioHistory([]);
        resetPortfolioLedgers();
      }
    });
    if (!userId) {
      dispatch({ type: 'complete' });
      return () => {
        active = false;
      };
    }
    dispatch({ type: 'start' });
    Promise.all([
      loadPortfolioStocks(userId),
      loadPortfolioHistory(userId),
      loadPortfolioLedgers(userId, () => active),
    ])
      .then(([stocks, history]) => {
        if (active) {
          replacePortfolio(stocks);
          setPortfolioHistory(history);
          dispatch({ type: 'complete' });
        }
      })
      .catch((error: unknown) => {
        if (active)
          dispatch({ type: 'error', error: error instanceof Error ? error.message : undefined });
      });
    return () => {
      active = false;
    };
  }, [userId, replacePortfolio, setPortfolioHistory, loadPortfolioLedgers, resetPortfolioLedgers]);

  return { isPortfolioLoading: state.loading, portfolioError: state.error };
}
