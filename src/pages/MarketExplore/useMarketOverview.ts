import { useEffect, useRef, useState } from 'react';
import {
  fetchMarketIndicatorCandles,
  fetchMarketIndicatorPrices,
  fetchUsMarketIndices,
  fetchUsdKrwExchangeRate,
} from '../../services/tossApi';
import {
  fetchMarketExploreOverview,
  type MarketExploreStock,
} from '../../services/marketExploreService';
import type { MarketIndexData, MarketIndexSymbol, MarketIndicatorCandle } from '../../types/market';
import type { IndicatorCardChart } from './MarketIndicatorSection';

interface UseMarketOverviewOptions {
  setExchangeRate: (rate: Awaited<ReturnType<typeof fetchUsdKrwExchangeRate>>) => void;
}

export function useMarketOverview({ setExchangeRate }: UseMarketOverviewOptions) {
  const [overview, setOverview] = useState<MarketExploreStock[]>([]);
  const [indicators, setIndicators] = useState<MarketIndexData[]>([]);
  const [intradayIndicators, setIntradayIndicators] = useState<
    Partial<Record<MarketIndexSymbol, IndicatorCardChart>>
  >({});
  const [selectedIndicator, setSelectedIndicator] = useState<MarketIndexSymbol>('KOSPI');
  const [indicatorCandles, setIndicatorCandles] = useState<MarketIndicatorCandle[]>([]);
  const [isIndicatorDialogOpen, setIsIndicatorDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const candleCache = useRef(new Map<MarketIndexSymbol, MarketIndicatorCandle[]>());

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      fetchMarketExploreOverview('KR'),
      fetchMarketExploreOverview('US'),
      fetchUsdKrwExchangeRate(),
      fetchMarketIndicatorPrices(['KOSPI', 'KOSDAQ']),
      fetchUsMarketIndices(),
    ])
      .then(([krStocks, usStocks, freshExchangeRate, krIndicators, usIndicators]) => {
        if (mounted) {
          setOverview([...krStocks, ...usStocks]);
          setExchangeRate(freshExchangeRate);
          setIndicators([
            ...krIndicators.map((indicator) => ({ ...indicator, changeRate: null, candles: [] })),
            ...usIndicators,
          ]);
          usIndicators.forEach((indicator) =>
            candleCache.current.set(indicator.symbol, indicator.candles),
          );
        }
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(
            cause instanceof Error
              ? cause.message
              : '시장 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [setExchangeRate]);

  useEffect(() => {
    let mounted = true;
    const loadKoreanSparkline = async (symbol: 'KOSPI' | 'KOSDAQ') => {
      const dailyCandles = await fetchMarketIndicatorCandles(symbol, 30, '1d');
      try {
        const intradayCandles = await fetchMarketIndicatorCandles(symbol, 200, '1m');
        if (intradayCandles.length >= 2) {
          return {
            candles: intradayCandles,
            previousClose: dailyCandles.at(-2)?.closePrice ?? null,
          };
        }
      } catch {
        // Fall through to daily candles when intraday data is unavailable.
      }
      return { candles: dailyCandles, previousClose: dailyCandles.at(-2)?.closePrice ?? null };
    };
    void Promise.allSettled([
      loadKoreanSparkline('KOSPI'),
      loadKoreanSparkline('KOSDAQ'),
      fetchUsMarketIndices('1d').catch(() => fetchUsMarketIndices()),
    ]).then((results) => {
      if (!mounted) return;
      const [kospi, kosdaq, us] = results;
      const usIndicators = us.status === 'fulfilled' ? us.value : [];
      const usChart = (symbol: 'NASDAQ' | 'SP500'): IndicatorCardChart => {
        const indicator = usIndicators.find((item) => item.symbol === symbol);
        const changeRate = indicator?.changeRate;
        return {
          candles: indicator?.candles ?? [],
          previousClose:
            indicator && changeRate !== null && changeRate !== undefined && changeRate > -1
              ? indicator.price / (1 + changeRate)
              : null,
        };
      };
      setIntradayIndicators({
        KOSPI: kospi.status === 'fulfilled' ? kospi.value : { candles: [], previousClose: null },
        KOSDAQ: kosdaq.status === 'fulfilled' ? kosdaq.value : { candles: [], previousClose: null },
        NASDAQ: usChart('NASDAQ'),
        SP500: usChart('SP500'),
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isIndicatorDialogOpen) return;
    const cached = candleCache.current.get(selectedIndicator);
    let mounted = true;
    const request = cached
      ? Promise.resolve(cached)
      : selectedIndicator === 'KOSPI' || selectedIndicator === 'KOSDAQ'
        ? fetchMarketIndicatorCandles(selectedIndicator, 30)
        : fetchUsMarketIndices().then((indices) => {
            indices.forEach((indicator) =>
              candleCache.current.set(indicator.symbol, indicator.candles),
            );
            return (
              indices.find((indicator) => indicator.symbol === selectedIndicator)?.candles ?? []
            );
          });
    void request
      .then((candles) => {
        candleCache.current.set(selectedIndicator, candles);
        if (mounted) setIndicatorCandles(candles);
      })
      .catch(() => {
        if (mounted) setIndicatorCandles([]);
      });
    return () => {
      mounted = false;
    };
  }, [isIndicatorDialogOpen, selectedIndicator]);

  return {
    overview,
    indicators,
    intradayIndicators,
    selectedIndicator,
    setSelectedIndicator,
    indicatorCandles,
    isIndicatorDialogOpen,
    setIsIndicatorDialogOpen,
    isLoading,
    error,
    setError,
  };
}
