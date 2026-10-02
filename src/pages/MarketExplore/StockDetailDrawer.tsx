import { FiX } from 'react-icons/fi';
import { SidePanel } from '../../components/layout/SidePanel/SidePanel';
import { StockAvatar } from '@entities/stock';
import type { DisplayCurrency } from '../../store/displayCurrencyStore';
import type { MarketExploreStock } from '../../services/marketExploreService';
import type { StockInsights } from '../../services/marketInsightsApi';
import type { DailyCandle, Quote } from '../../types/market';
import { MiniLineChart } from './MarketCharts';
import { money } from './marketPresentation';
import styles from './MarketExplorePage.module.scss';

export type StockDetail = {
  quote: Quote | null;
  candles: DailyCandle[];
  insights: StockInsights | null;
};

interface StockDetailDrawerProps {
  selectedStock: MarketExploreStock | null;
  stockDetail: StockDetail | null;
  isDetailLoading: boolean;
  detailError: string;
  portfolioActionNotice: string;
  displayCurrency: DisplayCurrency;
  exchangeRate?: number | null;
  onClose: () => void;
  onAdd: () => void;
  onRetry: () => void;
}

export function StockDetailDrawer({
  selectedStock,
  stockDetail,
  isDetailLoading,
  detailError,
  portfolioActionNotice,
  displayCurrency,
  exchangeRate,
  onClose,
  onAdd,
  onRetry,
}: StockDetailDrawerProps) {
  return (
    <SidePanel isOpen={selectedStock !== null} labelledBy="stock-drawer-title" onClose={onClose}>
      {selectedStock ? (
        <>
          <header className={styles.drawerHeader}>
            <div className={styles.drawerTitle}>
              <StockAvatar
                name={selectedStock.name}
                ticker={selectedStock.symbol}
                className={styles.stockAvatar}
              />
              <div>
                <h2 id="stock-drawer-title">{selectedStock.name}</h2>
                <p>
                  {selectedStock.symbol} · {selectedStock.market}
                </p>
              </div>
            </div>
            <div className={styles.drawerActions}>
              <button type="button" className={styles.addStockButton} onClick={onAdd}>
                + 담기
              </button>
              <button
                type="button"
                className={styles.drawerCloseButton}
                onClick={onClose}
                aria-label="종목 상세 닫기"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
          </header>

          {portfolioActionNotice ? (
            <p className={styles.portfolioActionNotice} role="status">
              {portfolioActionNotice}
            </p>
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
              <button type="button" onClick={onRetry}>
                다시 시도
              </button>
            </div>
          ) : stockDetail ? (
            <div className={styles.drawerContent}>
              <section className={styles.currentQuote} aria-label="현재가">
                <span>현재가</span>
                <strong>
                  {money(
                    stockDetail.quote?.price ?? selectedStock.price,
                    selectedStock.currency,
                    displayCurrency,
                    exchangeRate,
                  )}
                </strong>
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
                        <dd>
                          {typeof value === 'number'
                            ? `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${unit}`
                            : '-'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className={styles.insightUnavailable}>
                    {stockDetail.insights?.fundamentalsMessage ?? '재무 지표를 확인할 수 없습니다.'}
                  </p>
                )}
              </section>
              <section className={styles.dailyChartSection} aria-labelledby="daily-chart-title">
                <div>
                  <h3 id="daily-chart-title">최근 30일 종가</h3>
                  <p>일별 종가 기준 흐름입니다.</p>
                </div>
                {stockDetail.candles.length >= 2 ? (
                  <MiniLineChart
                    candles={stockDetail.candles}
                    currency={selectedStock.currency}
                    displayCurrency={displayCurrency}
                    exchangeRate={exchangeRate}
                  />
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
                          <span>
                            {article.source}
                            {article.publishedAt
                              ? ` · ${new Date(article.publishedAt).toLocaleDateString('ko-KR')}`
                              : ''}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.insightUnavailable}>
                    {stockDetail.insights?.newsMessage ?? '최근 관련 뉴스를 확인할 수 없습니다.'}
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </SidePanel>
  );
}
