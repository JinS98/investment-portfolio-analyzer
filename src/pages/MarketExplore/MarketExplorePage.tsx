import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';
import { TransactionModal } from '../../components/TransactionModal/TransactionModal';
import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import {
  fetchCandlePage,
  fetchMarketIndicatorCandles,
  fetchMarketIndicatorPrices,
  fetchUsMarketIndices,
  fetchQuotes,
  searchStocks,
} from '../../services/tossApi';
import {
  fetchMarketExploreOverview,
  type MarketExploreStock,
} from '../../services/marketExploreService';
import { fetchStockInsights, type StockInsights } from '../../services/marketInsightsApi';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { Holding, HoldingHistoryInput } from '../../types';
import type {
  Currency,
  DailyCandle,
  MarketIndexData,
  MarketIndexSymbol,
  MarketIndicatorCandle,
  Quote,
  StockSearchItem,
} from '../../types/market';
import styles from './MarketExplorePage.module.scss';

type MarketFilter = 'ALL' | 'KR' | 'US';
type StockDetail = { quote: Quote | null; candles: DailyCandle[]; insights: StockInsights | null };
type IndicatorCardChart = { candles: MarketIndicatorCandle[]; previousClose: number | null };
const EMPTY_HOLDINGS: Holding[] = [];

const isKoreanMarket = (market: string) => ['KOSPI', 'KOSDAQ', 'KR_ETC'].includes(market);

const money = (price: number | null, currency: 'KRW' | 'USD') => {
  if (price === null) return '시세 미조회';
  const formatted = price.toLocaleString('ko-KR', { maximumFractionDigits: currency === 'USD' ? 2 : 0 });
  return currency === 'KRW' ? `${formatted}원` : `$${formatted}`;
};

const compactMoney = (value: number | null, currency: 'KRW' | 'USD') => {
  if (value === null) return '-';
  if (currency === 'USD') return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}조원`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`;
  return `${(value / 10_000).toFixed(0)}만원`;
};

function MiniLineChart({
  candles,
  currency,
}: {
  candles: MarketIndicatorCandle[];
  currency?: Currency;
}) {
  const gradientId = useId();
  const chart = useMemo(() => {
    if (candles.length < 2) return null;
    const width = 640;
    const height = 260;
    const padding = { top: 18, right: 12, bottom: 30, left: 12 };
    const values = candles.map((candle) => candle.closePrice);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(max * 0.01, 1);
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = values.map((value, index) => ({
      x: padding.left + (index / (values.length - 1)) * innerWidth,
      y: padding.top + (1 - (value - min) / range) * innerHeight,
    }));
    const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
    const area = `M ${points[0].x} ${height - padding.bottom} L ${line.replaceAll(',', ' ')} L ${points.at(-1)!.x} ${height - padding.bottom} Z`;
    const changeRate = ((values.at(-1)! - values[0]) / values[0]) * 100;
    return {
      width,
      height,
      padding,
      line,
      area,
      points,
      min,
      max,
      changeRate,
      startDate: new Date(candles[0].timestamp).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
      endDate: new Date(candles.at(-1)!.timestamp).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
    };
  }, [candles]);
  if (!chart) return null;
  return (
    <div
      className={`${styles.chartWrap} ${chart.changeRate >= 0 ? styles.positiveChart : styles.negativeChart}`}
    >
      <svg className={styles.miniChart} viewBox={`0 0 ${chart.width} ${chart.height}`} aria-label="최근 30일 지수 흐름">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((position) => (
          <line
            key={position}
            x1={chart.padding.left}
            x2={chart.width - chart.padding.right}
            y1={chart.padding.top + chart.height * 0.72 * position}
            y2={chart.padding.top + chart.height * 0.72 * position}
          />
        ))}
        <path d={chart.area} fill={`url(#${gradientId})`} />
        <polyline points={chart.line} fill="none" />
        <circle cx={chart.points.at(-1)!.x} cy={chart.points.at(-1)!.y} r="4" />
        <text x={chart.padding.left} y={chart.height - 7}>{chart.startDate}</text>
        <text x={chart.width - chart.padding.right} y={chart.height - 7} textAnchor="end">{chart.endDate}</text>
      </svg>
      <div className={styles.chartStats}>
        <span>저점 <b>{currency ? money(chart.min, currency) : `${chart.min.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}pt`}</b></span>
        <span>고점 <b>{currency ? money(chart.max, currency) : `${chart.max.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}pt`}</b></span>
        <strong className={chart.changeRate >= 0 ? styles.positive : styles.negative}>
          {chart.changeRate > 0 ? '+' : ''}{chart.changeRate.toFixed(2)}%
        </strong>
      </div>
    </div>
  );
}

function IndicatorSparkline({
  candles,
  positive,
  previousClose,
}: {
  candles: MarketIndicatorCandle[];
  positive: boolean;
  previousClose: number | null;
}) {
  const chart = useMemo(() => {
    if (candles.length < 2) return '';
    const values = candles.map((candle) => candle.closePrice);
    const valuesWithBaseline = previousClose === null ? values : [...values, previousClose];
    const minimum = Math.min(...valuesWithBaseline);
    const range = Math.max(Math.max(...valuesWithBaseline) - minimum, 0.0001);
    const points = values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 100;
        const y = 46 - ((value - minimum) / range) * 42;
        return `${x},${y}`;
      })
      .join(' ');
    return {
      points,
      baselineY: previousClose === null ? null : 46 - ((previousClose - minimum) / range) * 42,
    };
  }, [candles, previousClose]);

  if (!chart) return <span className={styles.sparklinePlaceholder} aria-hidden="true" />;
  return (
    <svg
      className={positive ? styles.positiveSparkline : styles.negativeSparkline}
      viewBox="0 0 100 48"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {chart.baselineY !== null ? <line className={styles.previousCloseLine} x1="0" x2="100" y1={chart.baselineY} y2={chart.baselineY} /> : null}
      <polyline points={chart.points} />
    </svg>
  );
}

function StockAvatar({ name, symbol }: Pick<MarketExploreStock, 'name' | 'symbol'>) {
  const [hasImageError, setHasImageError] = useState(false);
  const label = name.trim().charAt(0) || symbol.charAt(0);
  const iconUrl = `https://static.toss.im/png-icons/securities/icn-sec-fill-${symbol.toUpperCase()}.png`;

  return (
    <span className={styles.stockAvatar} aria-hidden="true">
      {!hasImageError ? <img src={iconUrl} alt="" onError={() => setHasImageError(true)} /> : label}
    </span>
  );
}

export function MarketExplorePage() {
  usePortfolioSync();
  const [overview, setOverview] = useState<MarketExploreStock[]>([]);
  const [indicators, setIndicators] = useState<MarketIndexData[]>([]);
  const [intradayIndicators, setIntradayIndicators] = useState<
    Partial<Record<MarketIndexSymbol, IndicatorCardChart>>
  >({});
  const [selectedIndicator, setSelectedIndicator] = useState<MarketIndexSymbol>('KOSPI');
  const [indicatorCandles, setIndicatorCandles] = useState<MarketIndicatorCandle[]>([]);
  const [isIndicatorDialogOpen, setIsIndicatorDialogOpen] = useState(false);
  const [filter, setFilter] = useState<MarketFilter>('ALL');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedStock, setSelectedStock] = useState<MarketExploreStock | null>(null);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [portfolioActionNotice, setPortfolioActionNotice] = useState('');
  const candleCache = useRef(new Map<MarketIndexSymbol, MarketIndicatorCandle[]>());
  const detailRequestId = useRef(0);
  const userId = useAuthStore((state) => state.user?.uid);
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const portfolioLedgers = usePortfolioStore((state) => state.portfolioLedgers);
  const isTransactionModalOpen = usePortfolioStore((state) => state.isTransactionModalOpen);
  const transactionModalType = usePortfolioStore((state) => state.transactionModalType);
  const transactionModalPreset = usePortfolioStore((state) => state.transactionModalPreset);
  const isSaving = usePortfolioStore((state) => state.isSaving);
  const openTransactionModal = usePortfolioStore((state) => state.openTransactionModal);
  const closeTransactionModal = usePortfolioStore((state) => state.closeTransactionModal);
  const setTransactionModalType = usePortfolioStore((state) => state.setTransactionModalType);
  const addHoldingHistory = usePortfolioStore((state) => state.addHoldingHistory);
  const realPortfolio = useMemo(
    () => portfolios.find((portfolio) => portfolio.type === 'REAL') ?? null,
    [portfolios],
  );
  const realHoldings = realPortfolio
    ? (portfolioLedgers[realPortfolio.id]?.holdings ?? EMPTY_HOLDINGS)
    : EMPTY_HOLDINGS;

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      fetchMarketExploreOverview('KR'),
      fetchMarketExploreOverview('US'),
      fetchMarketIndicatorPrices(['KOSPI', 'KOSDAQ']),
      fetchUsMarketIndices(),
    ])
      .then(([krStocks, usStocks, krIndicators, usIndicators]) => {
        if (mounted) {
          setOverview([...krStocks, ...usStocks]);
          setIndicators([
            ...krIndicators.map((indicator) => ({ ...indicator, changeRate: null, candles: [] })),
            ...usIndicators,
          ]);
          usIndicators.forEach((indicator) => candleCache.current.set(indicator.symbol, indicator.candles));
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
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadKoreanSparkline = async (symbol: 'KOSPI' | 'KOSDAQ') => {
      const dailyCandles = await fetchMarketIndicatorCandles(symbol, 30, '1d');
      try {
        const intradayCandles = await fetchMarketIndicatorCandles(symbol, 200, '1m');
        if (intradayCandles.length >= 2) {
          return { candles: intradayCandles, previousClose: dailyCandles.at(-2)?.closePrice ?? null };
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
            indices.forEach((indicator) => candleCache.current.set(indicator.symbol, indicator.candles));
            return indices.find((indicator) => indicator.symbol === selectedIndicator)?.candles ?? [];
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

  useEffect(() => {
    if (!isIndicatorDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsIndicatorDialogOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isIndicatorDialogOpen]);

  useEffect(() => {
    if (!selectedStock) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      detailRequestId.current += 1;
      setSelectedStock(null);
      setStockDetail(null);
      setDetailError('');
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedStock]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      searchStocks(normalizedQuery, controller.signal)
        .then((stocks) => setSearchResults(stocks))
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setError(
              cause instanceof Error ? cause.message : '종목 검색에 실패했습니다. 다시 시도해 주세요.',
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const visibleStocks = useMemo(() => {
    const source = query.trim()
      ? searchResults.map<MarketExploreStock>((stock) => ({
          ...stock,
          rank: 0,
          currency: isKoreanMarket(stock.market) ? 'KRW' : 'USD',
          price: null,
          changeRate: null,
          tradingAmount: null,
        }))
      : overview;
    return source.filter((stock) => {
      if (filter === 'ALL') return true;
      return filter === 'KR' ? isKoreanMarket(stock.market) : !isKoreanMarket(stock.market);
    });
  }, [filter, overview, query, searchResults]);

  const loadStockDetail = async (stock: MarketExploreStock) => {
    const requestId = ++detailRequestId.current;
    setIsDetailLoading(true);
    setDetailError('');
    setStockDetail(null);
    try {
      const [quotes, candlePage, insights] = await Promise.all([
        fetchQuotes([stock.symbol]),
        fetchCandlePage(stock.symbol, 30),
        fetchStockInsights(stock.symbol, stock.name, isKoreanMarket(stock.market) ? 'KR' : 'US').catch(() => null),
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

  const addStockToPortfolio = () => {
    if (!selectedStock) return;
    if (!userId) {
      setPortfolioActionNotice('로그인 후 내 포트폴리오에 담을 수 있습니다.');
      return;
    }
    if (!realPortfolio) {
      setPortfolioActionNotice('실제 포트폴리오를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const price = stockDetail?.quote?.price ?? selectedStock.price;
    if (price === null || !Number.isFinite(price) || price <= 0) {
      setPortfolioActionNotice('현재가를 확인한 뒤 담을 수 있습니다.');
      return;
    }
    closeStockDrawer();
    openTransactionModal({
      type: 'BUY',
      portfolioId: realPortfolio.id,
      ticker: selectedStock.symbol,
      name: selectedStock.name,
      market: isKoreanMarket(selectedStock.market) ? 'KR' : 'US',
      price,
    });
  };

  const submitTransaction = async (input: HoldingHistoryInput) => {
    if (!userId) throw new Error('로그인 후 거래 기록을 추가할 수 있습니다.');
    await addHoldingHistory(userId, input);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p>시장 데이터</p>
        <h1>시장 탐색</h1>
        <span>국내와 미국 종목을 살펴보고, 관심 종목을 빠르게 찾아보세요.</span>
      </header>

      <section className={styles.indicatorSection} aria-label="주요 지수">
        <div className={styles.sectionTitle}>
          <h2>주요 지수</h2>
          <span>카드를 선택하면 최근 30일 흐름을 볼 수 있어요.</span>
        </div>
        <div className={styles.indicatorCards}>
            {(['KOSPI', 'KOSDAQ', 'NASDAQ', 'SP500'] as const).map((symbol) => {
              const indicator = indicators.find((item) => item.symbol === symbol);
              return (
                <button
                  key={symbol}
                  type="button"
                  className={selectedIndicator === symbol ? styles.selectedIndicator : undefined}
                  onClick={() => {
                    setSelectedIndicator(symbol);
                    setIsIndicatorDialogOpen(true);
                  }}
                  aria-pressed={selectedIndicator === symbol}
                >
                  <span>
                    {symbol === 'KOSPI'
                      ? '코스피'
                      : symbol === 'KOSDAQ'
                        ? '코스닥'
                        : symbol === 'NASDAQ'
                          ? '나스닥'
                          : 'S&P 500'}
                  </span>
                  <span className={styles.indicatorValue}>
                    <strong>
                      {indicator
                        ? `${indicator.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}pt`
                        : '-'}
                    </strong>
                    <IndicatorSparkline
                      candles={intradayIndicators[symbol]?.candles ?? []}
                      positive={(indicator?.changeRate ?? 0) >= 0}
                      previousClose={intradayIndicators[symbol]?.previousClose ?? null}
                    />
                  </span>
                </button>
              );
            })}
        </div>
      </section>

      {isIndicatorDialogOpen && (
        <div className={styles.dialogOverlay} onMouseDown={() => setIsIndicatorDialogOpen(false)}>
          <section
            className={styles.indicatorDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="indicator-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogHeader}>
              <div>
                <h2 id="indicator-dialog-title">
                  {selectedIndicator === 'KOSPI'
                    ? '코스피'
                    : selectedIndicator === 'KOSDAQ'
                      ? '코스닥'
                      : selectedIndicator === 'NASDAQ'
                        ? '나스닥'
                        : 'S&P 500'} 최근 30일
                </h2>
                <p>일별 종가 기준 흐름입니다.</p>
              </div>
              <button type="button" onClick={() => setIsIndicatorDialogOpen(false)} aria-label="지수 차트 닫기">
                ×
              </button>
            </div>
            {indicatorCandles.length ? <MiniLineChart candles={indicatorCandles} /> : <p className={styles.chartLoading}>차트를 불러오는 중입니다.</p>}
          </section>
        </div>
      )}

      <section className={styles.searchSection} aria-label="종목 검색">
        <label htmlFor="market-search">종목명 또는 티커 검색</label>
        <div className={styles.searchField}>
          <FiSearch aria-hidden="true" />
          <input
            id="market-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={80}
            placeholder="삼성전자, 테슬라, TSLA"
            autoComplete="off"
          />
          {query.trim() && isSearching ? <span role="status">검색 중</span> : null}
        </div>
      </section>

      <section className={styles.listSection} aria-busy={isLoading}>
        <div className={styles.listHeader}>
          <div>
            <h2>{query.trim() ? '검색 결과' : '거래대금 상위 종목'}</h2>
            <p>
              {query.trim()
                ? '검색 결과를 선택하면 다음 단계에서 종목 상세를 확인할 수 있습니다.'
                : '토스 Open API의 시장 전체 실시간 거래대금 기준입니다. 5분 동안은 저장된 데이터를 바로 보여줍니다.'}
            </p>
          </div>
          <div className={styles.filters} role="tablist" aria-label="시장 구분">
            {(['ALL', 'KR', 'US'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? styles.activeFilter : undefined}
                onClick={() => setFilter(value)}
              >
                {value === 'ALL' ? '전체' : value === 'KR' ? '국내' : '해외'}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            <strong>시장 데이터를 불러오지 못했습니다.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => window.location.reload()}>
              다시 시도
            </button>
          </div>
        ) : isLoading ? (
          <div className={styles.skeletonList} aria-label="시장 데이터 로딩 중">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className={styles.skeletonRow} />
            ))}
          </div>
        ) : visibleStocks.length ? (
          <ul className={styles.stockList}>
            {visibleStocks.map((stock) => (
              <li key={`${stock.market}-${stock.symbol}`}>
                <button
                  type="button"
                  onClick={() => openStockDrawer(stock)}
                  aria-label={`${stock.name} ${stock.symbol} 상세 보기`}
                >
                  <span className={styles.stockRank} aria-label={`${stock.rank || '검색'} 순위`}>
                    {stock.rank || '-'}
                  </span>
                  <StockAvatar name={stock.name} symbol={stock.symbol} />
                  <span className={styles.stockName}>
                    <strong>{stock.name}</strong>
                  </span>
                  <span className={styles.stockPrice}>{money(stock.price, stock.currency)}</span>
                  <span
                    className={
                      stock.changeRate === null
                        ? styles.stockMeta
                        : stock.changeRate >= 0
                          ? styles.positive
                          : styles.negative
                    }
                  >
                    {stock.changeRate === null
                      ? '시세 확인 필요'
                      : `${stock.changeRate > 0 ? '+' : ''}${(stock.changeRate * 100).toFixed(2)}%`}
                  </span>
                  <span className={styles.stockMeta}>
                    거래대금 {compactMoney(stock.tradingAmount, stock.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <strong>표시할 종목이 없습니다.</strong>
            <span>다른 검색어나 시장 필터를 선택해 보세요.</span>
          </div>
        )}
      </section>

      {selectedStock && (
        <div className={styles.drawerOverlay} onMouseDown={closeStockDrawer}>
          <aside
            className={styles.stockDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-drawer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>
                <StockAvatar name={selectedStock.name} symbol={selectedStock.symbol} />
                <div>
                  <h2 id="stock-drawer-title">{selectedStock.name}</h2>
                  <p>{selectedStock.symbol} · {selectedStock.market}</p>
                </div>
              </div>
              <div className={styles.drawerActions}>
                <button type="button" className={styles.addStockButton} onClick={addStockToPortfolio}>
                  + 담기
                </button>
                <button
                  type="button"
                  className={styles.drawerCloseButton}
                  onClick={closeStockDrawer}
                  aria-label="종목 상세 닫기"
                >
                  <FiX aria-hidden="true" />
                </button>
              </div>
            </header>

            {portfolioActionNotice ? (
              <p className={styles.portfolioActionNotice} role="status">{portfolioActionNotice}</p>
            ) : null}

            {isDetailLoading ? (
              <div className={styles.detailSkeleton} aria-label="종목 상세 정보 로딩 중">
                <div />
                <div />
                <div />
              </div>
            ) : detailError ? (
              <div className={styles.detailError} role="alert">
                <strong>상세 정보를 불러오지 못했습니다.</strong>
                <span>{detailError}</span>
                <button type="button" onClick={() => void loadStockDetail(selectedStock)}>다시 시도</button>
              </div>
            ) : stockDetail ? (
              <div className={styles.drawerContent}>
                <section className={styles.currentQuote} aria-label="현재가">
                  <span>현재가</span>
                  <strong>{money(stockDetail.quote?.price ?? selectedStock.price, selectedStock.currency)}</strong>
                  <small>
                    {stockDetail.quote?.timestamp
                      ? `기준 ${new Date(stockDetail.quote.timestamp).toLocaleString('ko-KR')}`
                      : '현재 시세 기준'}
                  </small>
                </section>
                <section className={styles.fundamentalsSection} aria-labelledby="fundamentals-title">
                  <div>
                    <h3 id="fundamentals-title">핵심 재무 지표</h3>
                    <p>최근 공시 기준으로 제공되는 참고 정보입니다.</p>
                  </div>
                  {stockDetail.insights?.fundamentals ? (
                    <dl className={styles.fundamentalsGrid}>
                      {[
                        ['PER', stockDetail.insights.fundamentals.per, '배'],
                        ['PBR', stockDetail.insights.fundamentals.pbr, '배'],
                        ['ROE', stockDetail.insights.fundamentals.roe, '%'],
                        ['배당수익률', stockDetail.insights.fundamentals.dividendYield, '%'],
                      ].map(([label, value, unit]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{typeof value === 'number' ? `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${unit}` : '-'}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className={styles.insightUnavailable}>{stockDetail.insights?.fundamentalsMessage ?? '재무 지표를 확인할 수 없습니다.'}</p>
                  )}
                </section>
                <section className={styles.dailyChartSection} aria-labelledby="daily-chart-title">
                  <div>
                    <h3 id="daily-chart-title">최근 30일 종가</h3>
                    <p>일별 종가 기준 흐름입니다.</p>
                  </div>
                  {stockDetail.candles.length >= 2 ? (
                    <MiniLineChart candles={stockDetail.candles} currency={selectedStock.currency} />
                  ) : (
                    <p className={styles.noChart}>표시할 일봉 데이터가 부족합니다.</p>
                  )}
                </section>
                <section className={styles.newsSection} aria-labelledby="stock-news-title">
                  <div>
                    <h3 id="stock-news-title">최근 관련 뉴스</h3>
                    <p>기사 제목을 누르면 원문으로 이동합니다.</p>
                  </div>
                  {stockDetail.insights?.news.length ? (
                    <ul className={styles.newsList}>
                      {stockDetail.insights.news.map((article) => (
                        <li key={article.url}>
                          <a href={article.url} target="_blank" rel="noreferrer">
                            <strong>{article.title}</strong>
                            <span>{article.source}{article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString('ko-KR')}` : ''}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.insightUnavailable}>{stockDetail.insights?.newsMessage ?? '최근 관련 뉴스를 확인할 수 없습니다.'}</p>
                  )}
                </section>
              </div>
            ) : null}
          </aside>
        </div>
      )}
      <TransactionModal
        isOpen={isTransactionModalOpen}
        type={transactionModalType}
        portfolio={realPortfolio}
        holdings={realHoldings}
        preset={transactionModalPreset ?? undefined}
        isSaving={isSaving}
        onTypeChange={setTransactionModalType}
        onClose={closeTransactionModal}
        onSubmit={submitTransaction}
      />
    </main>
  );
}
