import { FiSearch } from 'react-icons/fi';
import { StockAvatar } from '@entities/stock';
import type { MarketExploreStock } from '../../services/marketExploreService';
import type { DisplayCurrency } from '../../store/displayCurrencyStore';
import { compactMoney, money } from './marketPresentation';
import styles from './MarketExplorePage.module.scss';

interface MarketStockListProps {
  query: string;
  onQueryChange: (query: string) => void;
  isSearching: boolean;
  filter: 'KR' | 'US';
  onFilterChange: (filter: 'KR' | 'US') => void;
  error: string;
  isLoading: boolean;
  visibleStocks: MarketExploreStock[];
  displayCurrency: DisplayCurrency;
  exchangeRate?: number | null;
  onSelectStock: (stock: MarketExploreStock) => void;
}

export function MarketStockList({
  query,
  onQueryChange,
  isSearching,
  filter,
  onFilterChange,
  error,
  isLoading,
  visibleStocks,
  displayCurrency,
  exchangeRate,
  onSelectStock,
}: MarketStockListProps) {
  return (
    <>
      <section className={styles.searchSection} aria-label="종목 검색">
        <label htmlFor="market-search">종목명 또는 티커 검색</label>
        <div className={styles.searchField}>
          <FiSearch aria-hidden="true" />
          <input
            id="market-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
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
                : `${filter === 'KR' ? '국내' : '해외'} 시장의 실시간 거래대금 순위입니다. 5분 동안은 저장된 데이터를 바로 보여줍니다.`}
            </p>
          </div>
          <div className={styles.filters} role="tablist" aria-label="시장 구분">
            {(['KR', 'US'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? styles.activeFilter : undefined}
                onClick={() => onFilterChange(value)}
              >
                {value === 'KR' ? '국내' : '해외'}
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
                  onClick={() => onSelectStock(stock)}
                  aria-label={`${stock.name} ${stock.symbol} 상세 보기`}
                >
                  <span className={styles.stockRank} aria-label={`${stock.rank || '검색'} 순위`}>
                    {stock.rank || '-'}
                  </span>
                  <StockAvatar
                    name={stock.name}
                    ticker={stock.symbol}
                    className={styles.stockAvatar}
                  />
                  <span className={styles.stockName}>
                    <strong>{stock.name}</strong>
                  </span>
                  <span className={styles.stockPrice}>
                    {money(stock.price, stock.currency, displayCurrency, exchangeRate)}
                  </span>
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
                      ? stock.price === null
                        ? '시세 확인 필요'
                        : '등락률 정보 없음'
                      : `${stock.changeRate > 0 ? '+' : ''}${(stock.changeRate * 100).toFixed(2)}%`}
                  </span>
                  <span className={styles.stockMeta}>
                    거래대금{' '}
                    {compactMoney(
                      stock.tradingAmount,
                      stock.currency,
                      displayCurrency,
                      exchangeRate,
                    )}
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
    </>
  );
}
