import { useId, useState, type ReactNode } from 'react';
import { FiChevronDown, FiExternalLink, FiInfo, FiX } from 'react-icons/fi';
import { Drawer } from '@shared/ui';
import { isKoreanMarket, StockAvatar } from '@entities/stock';
import type { DisplayCurrency } from '../../store/displayCurrencyStore';
import type { MarketExploreStock } from '../../services/marketExploreService';
import type { StockInsights } from '../../services/marketInsightsApi';
import type { DailyCandle, Quote } from '../../types/market';
import { calculateDomesticFundamentals } from '../../utils/domesticFundamentals';
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

function DetailDisclosure({
  title,
  description,
  children,
  compact = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={compact ? styles.methodDisclosure : styles.detailDisclosure}>
      <button
        type="button"
        className={styles.disclosureTrigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.disclosureLabel}>
          {compact ? (
            <span className={styles.methodLabel}>
              <FiInfo aria-hidden="true" />
              {title}
            </span>
          ) : (
            <span className={styles.disclosureTitle}>{title}</span>
          )}
          {description ? <span className={styles.disclosureDescription}>{description}</span> : null}
        </span>
        <FiChevronDown className={styles.disclosureChevron} aria-hidden="true" />
      </button>
      <div
        id={id}
        hidden={!open}
        className={compact ? styles.methodContent : styles.disclosureContent}
      >
        {open ? children : null}
      </div>
    </section>
  );
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
  const domestic = selectedStock ? isKoreanMarket(selectedStock.market) : false;
  const metricInputs = stockDetail?.insights?.domesticMetricInputs;
  const fundamentals = domestic
    ? metricInputs
      ? calculateDomesticFundamentals(
          metricInputs,
          stockDetail?.quote?.price ?? selectedStock?.price ?? null,
        )
      : null
    : stockDetail?.insights?.fundamentals;
  const statement = stockDetail?.insights?.financialStatement;
  const secStatement = statement?.source === 'SEC';
  const statementScale = secStatement ? 1_000_000 : statement?.currency === 'KRW' ? 100_000_000 : 1;
  const statementDescription = statement
    ? secStatement
      ? `회계연도 종료 ${statement.periodEnd} · ${statement.currency === 'USD' ? '백만 달러' : `백만 ${statement.currency}`}`
      : `${statement.year}년 · ${statement.basis === 'CFS' ? '연결' : '별도'} · ${statement.currency === 'KRW' ? '억 원' : statement.currency}`
    : '연간 실적과 재무 현황';
  const statementUrl = secStatement
    ? statement?.reportUrl
    : statement?.receiptNo
      ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${statement.receiptNo}`
      : null;
  return (
    <Drawer open={selectedStock !== null} labelledBy="stock-drawer-title" onClose={onClose}>
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
            <div className={styles.drawerContent} key={selectedStock.symbol}>
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
                    ? `${new Date(stockDetail.quote.timestamp).toLocaleString('ko-KR')} 기준`
                    : '현재 시세 기준'}
                </small>
              </section>

              <section className={styles.dailyChartSection} aria-labelledby="daily-chart-title">
                <div className={styles.detailSectionHeading}>
                  <h3 id="daily-chart-title">주가 흐름</h3>
                  <span>최근 30일 · 종가</span>
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

              <DetailDisclosure title="재무제표" description={statementDescription}>
                {statement ? (
                  <>
                    <dl className={styles.fundamentalsGrid}>
                      {[
                        ['매출액', statement.revenue],
                        ['영업이익', statement.operatingProfit],
                        ['당기순이익', statement.netIncome],
                        ['자산총계', statement.assets],
                        ['부채총계', statement.liabilities],
                        ['자본총계', statement.equity],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>
                            {typeof value === 'number'
                              ? (value / statementScale).toLocaleString('ko-KR', {
                                  maximumFractionDigits: 2,
                                })
                              : '-'}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <footer className={styles.financialSource}>
                      <span>
                        {secStatement
                          ? `출처 · SEC${statement.filedAt ? ` · 공시 ${statement.filedAt}` : ''}`
                          : '출처 · 금융감독원 DART'}
                      </span>
                      {statementUrl ? (
                        <a
                          href={statementUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${statement.year}년 ${secStatement ? 'SEC 연간보고서' : '사업보고서'} 새 탭에서 보기`}
                        >
                          {secStatement ? '연간보고서' : '사업보고서'}{' '}
                          <FiExternalLink aria-hidden="true" />
                        </a>
                      ) : null}
                    </footer>
                  </>
                ) : (
                  <p className={styles.insightUnavailable}>
                    {stockDetail.insights?.financialStatementMessage ??
                      '재무제표를 불러오지 못했습니다.'}
                  </p>
                )}
              </DetailDisclosure>

              <DetailDisclosure
                title="재무지표"
                description={
                  domestic && metricInputs
                    ? `${metricInputs.year}년 ${metricInputs.basis === 'CFS' ? '연결' : '별도'} 실적 · 현재가 기준`
                    : '가치평가 · 수익성 · 배당'
                }
              >
                {fundamentals ? (
                  <dl className={styles.fundamentalsGrid}>
                    {[
                      ['PER', fundamentals.per, '배'],
                      [domestic ? 'PBR (참고)' : 'PBR', fundamentals.pbr, '배'],
                      ['ROE', fundamentals.roe, '%'],
                      ['배당수익률', fundamentals.dividendYield, '%'],
                    ].map(([label, value, unit]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          {typeof value === 'number' ? (
                            <>
                              {value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                              <small className={styles.metricUnit}>{unit}</small>
                            </>
                          ) : (
                            '-'
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className={styles.insightUnavailable}>
                    {domestic
                      ? (stockDetail.insights?.financialStatementMessage ??
                        '국내 재무 지표를 확인할 수 없습니다.')
                      : (stockDetail.insights?.fundamentalsMessage ??
                        '재무 지표를 확인할 수 없습니다.')}
                  </p>
                )}
                {domestic && metricInputs ? (
                  <DetailDisclosure title="지표 산정 방식" compact>
                    <dl className={styles.methodList}>
                      <div>
                        <dt>PER</dt>
                        <dd>현재가 ÷ 연간 기본 주당순이익(EPS)</dd>
                      </div>
                      <div>
                        <dt>PBR</dt>
                        <dd>
                          현재가 ÷ 참고 주당순자산(BPS). 연말 지배주주지분을 보통주·우선주 합계
                          유통주식수로 나눕니다.
                        </dd>
                      </div>
                      <div>
                        <dt>ROE</dt>
                        <dd>
                          연간 지배주주순이익 ÷ 기초·기말 평균 지배주주지분 × 100. 별도재무제표는
                          순이익과 자본총계를 사용합니다.
                        </dd>
                      </div>
                      <div>
                        <dt>배당수익률</dt>
                        <dd>해당 연도 보통주 주당 현금배당금 ÷ 현재가 × 100</dd>
                      </div>
                    </dl>
                    <p>
                      연간 확정 실적 기준이며 예상치가 아닙니다. PBR은 종류주별 권리 차이를 반영하지
                      않은 참고값입니다. 별도 BPS는 자본총계를 사용합니다.
                    </p>
                    <p>
                      공시 이후 주식분할·증자는 반영하지 않습니다. 적자 EPS, 비양수 자본 또는 자료가
                      없는 항목은 -로 표시합니다.
                    </p>
                  </DetailDisclosure>
                ) : null}
                {domestic && stockDetail.insights?.domesticMetricsMessage ? (
                  <p className={styles.insightUnavailable}>
                    {stockDetail.insights.domesticMetricsMessage}
                  </p>
                ) : null}
              </DetailDisclosure>

              <section className={styles.newsSection} aria-labelledby="stock-news-title">
                <div className={styles.detailSectionHeading}>
                  <h3 id="stock-news-title">관련 뉴스</h3>
                  <span>최신 소식</span>
                </div>
                {stockDetail.insights?.news.length ? (
                  <ul className={styles.newsList}>
                    {stockDetail.insights.news.map((article) => (
                      <li key={article.url}>
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${article.title} (새 탭)`}
                        >
                          <div className={styles.newsHeadline}>
                            <strong>{article.title}</strong>
                            <FiExternalLink aria-hidden="true" />
                          </div>
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
    </Drawer>
  );
}
