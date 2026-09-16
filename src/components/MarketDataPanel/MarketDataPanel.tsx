import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchStocks, fetchQuotes, fetchCandlePage, searchStocks } from '../../services/tossApi';
import type { StockInfo, Quote, CandlePage, StockSearchItem } from '../../types/market';
import type { Holding, MarketType } from '../../types';
import { loadRecentStockSearches, saveRecentStockSearch } from '../../utils/recentStockSearches';
import styles from './MarketDataPanel.module.scss';

const KOREAN_MARKETS = new Set(['KOSPI', 'KOSDAQ', 'KR_ETC']);

export interface MarketDataPanelBuyPreset {
  ticker: string;
  name: string;
  market: MarketType;
  price: number;
}

interface MarketDataPanelProps {
  holdings?: Holding[];
  onAddBuyRecord?: (preset: MarketDataPanelBuyPreset) => void;
}

const toPortfolioMarket = (market: string): MarketType =>
  KOREAN_MARKETS.has(market) ? 'KR' : 'US';

function formatMoney(value: number, currency: string) {
  const formatted = value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return currency === 'KRW' ? `${formatted}원` : `$${formatted}`;
}

function formatTurnover(value: number, currency: string) {
  if (currency !== 'KRW') return formatMoney(value, currency);
  const units = [
    { value: 1_000_000_000_000, suffix: '조원' },
    { value: 100_000_000, suffix: '억원' },
    { value: 10_000_000, suffix: '천만원' },
  ];
  const unit = units.find((candidate) => value >= candidate.value);
  if (!unit) return formatMoney(value, currency);
  return `${Number((value / unit.value).toFixed(2)).toLocaleString('ko-KR')}${unit.suffix}`;
}

export function MarketDataPanel({ holdings = [], onAddBuyRecord }: MarketDataPanelProps) {
  const [symbol, setSymbol] = useState('005930');
  const [selected, setSelected] = useState<StockSearchItem | null>(null);
  const [suggestions, setSuggestions] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<StockSearchItem[]>(() =>
    loadRecentStockSearches(),
  );
  const [isCandleDialogOpen, setIsCandleDialogOpen] = useState(false);
  const [visibleCandleCount, setVisibleCandleCount] = useState(10);
  const [newRowsStartIndex, setNewRowsStartIndex] = useState<number | null>(null);
  const candleScrollRef = useRef<HTMLDivElement>(null);
  const newRowsStartRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!open || selected || composing || !symbol.trim()) return;
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchStocks(
        symbol.trim(),
        AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
      )
        .then((items) => {
          if (current) setSuggestions(items);
        })
        .catch((err: unknown) => {
          if (current) setSearchError(err instanceof Error ? err.message : '검색에 실패했습니다.');
        })
        .finally(() => {
          if (current) setSearching(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [symbol, open, selected, composing]);
  function choose(item: StockSearchItem) {
    setSelected(item);
    setSymbol(item.name);
    setOpen(false);
    setSuggestions([]);
    setSearching(false);
    setActive(-1);
    setSearchError('');
    setRecentSearches(saveRecentStockSearch(item));
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ stock: StockInfo; quote: Quote; page: CandlePage } | null>(
    null,
  );

  useEffect(() => {
    if (!isCandleDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCandleDialogOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isCandleDialogOpen]);

  useEffect(() => {
    if (newRowsStartIndex === null || !candleScrollRef.current || !newRowsStartRef.current) return;
    const container = candleScrollRef.current;
    const row = newRowsStartRef.current;
    const offset = row.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + offset, behavior: 'smooth' });
    setNewRowsStartIndex(null);
  }, [newRowsStartIndex, visibleCandleCount]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (composing) return;
    if (!selected && !/^[A-Za-z0-9.-]+$/.test(symbol.trim())) {
      setError('검색 결과에서 조회할 종목을 선택해주세요.');
      return;
    }
    setOpen(false);
    setLoading(true);
    setError('');
    setResult(null);
    setIsCandleDialogOpen(false);
    setVisibleCandleCount(10);
    setNewRowsStartIndex(null);
    try {
      const ticker = selected?.symbol ?? symbol.trim().toUpperCase();
      const [stocks, quotes, page] = await Promise.all([
        fetchStocks([ticker]),
        fetchQuotes([ticker]),
        fetchCandlePage(ticker),
      ]);
      const stock = stocks.find((item) => item.symbol === ticker);
      const quote = quotes.find((item) => item.symbol === ticker);
      if (!stock || !quote)
        throw new Error('조회된 종목 또는 현재가가 없습니다. 종목 코드를 확인해주세요.');
      setResult({ stock, quote, page });
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className={styles.panel} aria-busy={loading}>
      <h2>종목 · 현재가 · 일봉 조회</h2>
      <form onSubmit={search} className={styles.form}>
        <label htmlFor="stock-symbol">종목명 또는 코드</label>
        <div
          className={styles.searchBox}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setOpen(false);
              setSearching(false);
            }
          }}
        >
          <input
            id="stock-symbol"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="stock-suggestions"
            aria-activedescendant={open && active >= 0 ? `stock-option-${active}` : undefined}
            value={symbol}
            maxLength={80}
            autoComplete="off"
            onFocus={() => {
              if (!selected) setOpen(true);
            }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(event) => {
              setSymbol(event.target.value);
              setSelected(null);
              setSuggestions([]);
              setSearchError('');
              setSearching(false);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') {
                setOpen(false);
                setSearching(false);
              }
              if (
                open &&
                suggestions.length &&
                (event.key === 'ArrowDown' || event.key === 'ArrowUp')
              ) {
                event.preventDefault();
                setActive((index) =>
                  event.key === 'ArrowDown'
                    ? (index + 1) % suggestions.length
                    : index <= 0
                      ? suggestions.length - 1
                      : index - 1,
                );
              }
              if (event.key === 'Enter' && open && active >= 0 && suggestions[active]) {
                event.preventDefault();
                choose(suggestions[active]);
              }
            }}
            placeholder="삼성전자, 애플, AAPL"
            required
            disabled={loading}
          />
          {open && (
            <div className={styles.suggestions}>
              {searching && (
                <p role="status">
                  종목 검색 중… 처음 검색할 때는 목록 준비에 잠시 시간이 걸립니다.
                </p>
              )}
              {searchError && <p role="alert">{searchError}</p>}
              {!searching && !searchError && !symbol.trim() && recentSearches.length > 0 && (
                <>
                  <p className={styles.suggestionTitle}>최근 조회</p>
                  <ul role="listbox" aria-label="최근 조회 종목">
                    {recentSearches.map((item) => (
                      <li
                        key={`recent-${item.market}-${item.symbol}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(item)}
                      >
                        <strong>{item.name}</strong>
                        <span>
                          {item.symbol} ·{' '}
                          {['KOSPI', 'KOSDAQ', 'KR_ETC'].includes(item.market) ? '국내' : '미국'} ·{' '}
                          {item.market}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <ul id="stock-suggestions" role="listbox" aria-label="종목 검색 결과">
                {suggestions.map((item, index) => (
                  <li
                    key={`${item.market}-${item.symbol}`}
                    id={`stock-option-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    <strong>{item.name}</strong>{' '}
                    <span>
                      {item.symbol} ·{' '}
                      {['KOSPI', 'KOSDAQ', 'KR_ETC'].includes(item.market) ? '국내' : '미국'} ·{' '}
                      {item.market}
                    </span>
                  </li>
                ))}
              </ul>
              {!searching && !searchError && symbol.trim() && !suggestions.length && (
                <p>검색 결과에서 종목을 선택하세요. 코드로 직접 조회할 수도 있습니다.</p>
              )}
            </div>
          )}
        </div>
        <button disabled={loading}>{loading ? '조회 중…' : '조회'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <h3>
            {result.stock.name} ({result.stock.symbol})
          </h3>
          <p>
            {result.stock.englishName} · {result.stock.market}
          </p>
          <p>현재가: {formatMoney(result.quote.price, result.quote.currency)}</p>
          <p>
            시세 기준:{' '}
            {result.quote.timestamp
              ? new Date(result.quote.timestamp).toLocaleString('ko-KR')
              : '제공되지 않음'}
          </p>
          {(() => {
            const market = toPortfolioMarket(result.stock.market);
            const isAlreadyHeld = holdings.some(
              (holding) => holding.ticker === result.stock.symbol && holding.market === market,
            );

            return (
              <div className={styles.resultActions}>
                {isAlreadyHeld && (
                  <p className={styles.holdingNotice} role="status">
                    이미 보유한 종목입니다. 추가 매수 기록을 남길 수 있어요.
                  </p>
                )}
                {onAddBuyRecord ? (
                  <button
                    type="button"
                    className={styles.addRecordButton}
                    onClick={() =>
                      onAddBuyRecord({
                        ticker: result.stock.symbol,
                        name: result.stock.name,
                        market,
                        price: result.quote.price,
                      })
                    }
                  >
                    매수 기록 추가
                  </button>
                ) : (
                  <p className={styles.loginNotice}>로그인 후 매수 기록을 추가할 수 있어요.</p>
                )}
              </div>
            );
          })()}
          <p>일봉 {result.page.candles.length}개 조회 · 최근 10개 표시</p>
          <button
            type="button"
            className={styles.candleButton}
            onClick={() => {
              setVisibleCandleCount(10);
              setIsCandleDialogOpen(true);
            }}
          >
            일봉 보기
          </button>
          {isCandleDialogOpen && (
            <div className={styles.dialogOverlay} onMouseDown={() => setIsCandleDialogOpen(false)}>
              <section
                className={styles.candleDialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="candle-dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className={styles.dialogHeader}>
                  <div>
                    <h3 id="candle-dialog-title">{result.stock.name} 일봉</h3>
                    <p>최근 10개 일봉을 확인할 수 있습니다.</p>
                  </div>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setIsCandleDialogOpen(false)}
                    aria-label="일봉 모달 닫기"
                  >
                    ×
                  </button>
                </div>
                {result.page.candles.length === 0 ? (
                  <p>일봉 데이터가 없습니다.</p>
                ) : (
                  <>
                    <div ref={candleScrollRef} className={styles.scroll}>
                      <table className={styles.candleTable}>
                        <thead>
                          <tr>
                            <th>날짜</th>
                            <th>종가</th>
                            <th>등락률</th>
                            <th>거래량(주)</th>
                            <th>거래대금</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.page.candles
                            .slice(-visibleCandleCount)
                            .reverse()
                            .map((candle, index) => {
                              const candleIndex = result.page.candles.findIndex(
                                (item) => item.timestamp === candle.timestamp,
                              );
                              const previousClose =
                                candleIndex > 0
                                  ? result.page.candles[candleIndex - 1]?.closePrice
                                  : null;
                              const changeRate =
                                previousClose && previousClose > 0
                                  ? ((candle.closePrice - previousClose) / previousClose) * 100
                                  : null;
                              const turnover = candle.closePrice * candle.volume;

                              return (
                                <tr
                                  key={candle.timestamp}
                                  ref={index === newRowsStartIndex ? newRowsStartRef : undefined}
                                >
                                  <td>{candle.date}</td>
                                  <td>{formatMoney(candle.closePrice, candle.currency)}</td>
                                  <td
                                    className={
                                      changeRate === null
                                        ? undefined
                                        : changeRate >= 0
                                          ? styles.positiveChange
                                          : styles.negativeChange
                                    }
                                  >
                                    {changeRate === null
                                      ? '—'
                                      : `${changeRate > 0 ? '+' : ''}${changeRate.toFixed(2)}%`}
                                  </td>
                                  <td>{candle.volume.toLocaleString('ko-KR')}</td>
                                  <td>{formatTurnover(turnover, candle.currency)}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                      <table className={styles.legacyCandleTable}>
                        <thead>
                          <tr>
                            <th>거래일</th>
                            <th>시가</th>
                            <th>고가</th>
                            <th>저가</th>
                            <th>종가</th>
                            <th>거래량</th>
                            <th>통화</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.page.candles
                            .slice(-visibleCandleCount)
                            .reverse()
                            .map((candle) => (
                              <tr key={candle.timestamp}>
                                <td>{candle.date}</td>
                                {[
                                  candle.openPrice,
                                  candle.highPrice,
                                  candle.lowPrice,
                                  candle.closePrice,
                                  candle.volume,
                                ].map((value, index) => (
                                  <td key={index}>
                                    {index === 4
                                      ? value.toLocaleString('ko-KR')
                                      : formatMoney(value, candle.currency)}
                                  </td>
                                ))}
                                <td>{candle.currency}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {visibleCandleCount < result.page.candles.length && (
                      <button
                        type="button"
                        className={styles.loadMoreButton}
                        onClick={() => {
                          setNewRowsStartIndex(visibleCandleCount);
                          setVisibleCandleCount((count) => count + 10);
                        }}
                      >
                        10개 더보기
                      </button>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
