import { useEffect, useRef, useState } from 'react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { MarketDataPanel } from '../../components/MarketDataPanel/MarketDataPanel';
import { PortfolioManager } from '../../components/PortfolioManager/PortfolioManager';
import { PortfolioAllocationChart } from '../../components/PortfolioAllocationChart/PortfolioAllocationChart';
import { PortfolioPerformanceChart } from '../../components/PortfolioPerformanceChart/PortfolioPerformanceChart';
import { RiskGuidePanel } from '../../components/RiskGuidePanel/RiskGuidePanel';
import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import styles from './Dashboard.module.scss';
const Dashboard = () => {
  const { isPortfolioLoading, portfolioError } = usePortfolioSync();
  const {
    portfolio,
    prices,
    historicalData,
    isLoading,
    isError,
    lastUpdated,
    exchangeRate,
    riskData,
    refreshPrices,
    loadHistoricalData,
  } = usePortfolio();
  const refreshPricesRef = useRef(refreshPrices);
  const lastAutoRefreshKey = useRef<string | null>(null);
  const initialRefreshRequested = useRef(false);
  const loadHistoricalDataRef = useRef(loadHistoricalData);
  const lastRiskRefresh = useRef<string | null>(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const autoRefreshKey = portfolio.map((stock) => stock.id).join('|');
  const stockLabel = (ticker: string) => {
    const stock = portfolio.find((item) => item.ticker === ticker);
    return stock?.name ? `${stock.name} (${ticker})` : ticker;
  };

  useEffect(() => {
    refreshPricesRef.current = refreshPrices;
  }, [refreshPrices]);

  useEffect(() => {
    loadHistoricalDataRef.current = loadHistoricalData;
  }, [loadHistoricalData]);

  useEffect(() => {
    if (isPortfolioLoading || initialRefreshRequested.current) return;
    initialRefreshRequested.current = true;
    if (!autoRefreshKey) void refreshPricesRef.current();
  }, [autoRefreshKey, isPortfolioLoading]);

  useEffect(() => {
    if (!autoRefreshKey) {
      lastAutoRefreshKey.current = null;
      return;
    }
    // React StrictMode의 개발용 effect 재실행과 시세 상태 변경으로 인한 중복 요청을 막는다.
    if (lastAutoRefreshKey.current === autoRefreshKey) return;
    lastAutoRefreshKey.current = autoRefreshKey;
    void refreshPricesRef.current();
  }, [autoRefreshKey]);

  useEffect(() => {
    if (!lastUpdated || lastRiskRefresh.current === lastUpdated) return;
    lastRiskRefresh.current = lastUpdated;
    setIsRiskLoading(true);
    void loadHistoricalDataRef.current()
      .catch((error) => {
        console.error('[Dashboard] risk data load error:', error);
      })
      .finally(() => setIsRiskLoading(false));
  }, [lastUpdated]);

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>📊 포트폴리오 대시보드</h1>
        <div className={styles.meta}>
          {lastUpdated && (
            <span className={styles.updated}>
              업데이트: {new Date(lastUpdated).toLocaleTimeString('ko-KR')}
            </span>
          )}
          {exchangeRate && <span className={styles.exchangeRate} title={`유효 시간: ${new Date(exchangeRate.validFrom).toLocaleTimeString('ko-KR')} ~ ${new Date(exchangeRate.validUntil).toLocaleTimeString('ko-KR')}`}>
            USD/KRW {exchangeRate.rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원
          </span>}
          <button className={styles.refreshBtn} onClick={refreshPrices} disabled={isLoading}>
            {isLoading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </header>
      <MarketDataPanel />
      <PortfolioManager />
      <PortfolioAllocationChart portfolio={portfolio} prices={prices} exchangeRate={exchangeRate} />
      <PortfolioPerformanceChart portfolio={portfolio} historicalData={historicalData} exchangeRate={exchangeRate} isLoading={isRiskLoading} />
      <RiskGuidePanel riskData={riskData} isLoading={isRiskLoading} />

      {isPortfolioLoading && <p className={styles.storageStatus}>저장된 포트폴리오를 불러오는 중...</p>}
      {portfolioError && <div className={styles.errorBanner}>⚠️ {portfolioError}</div>}

      {isError && (
        <div className={styles.errorBanner}>
          ⚠️ 데이터를 불러오는 중 오류가 발생했습니다. 토스 API 설정을 확인해주세요.
        </div>
      )}

      {portfolio.length === 0 && (
        <div className={styles.empty}>
          <p>종목을 추가해 포트폴리오를 시작하세요.</p>
          <p className={styles.emptyHint}>종목을 검색하고 매수가와 수량을 입력하세요.</p>
        </div>
      )}

      {/* 차트 — Week 5 */}
      <section className={styles.placeholder}>
        <p>📈 차트 영역 (Week 5)</p>
      </section>

      {/* 리스크 패널 — Week 5 */}
      <section className={styles.placeholder}>
        <p>🛡️ 리스크 분석 패널 (Week 5) — 토스 캔들 데이터 기반</p>
      </section>

      {/* 시그널 패널 — Week 8 */}
      <section className={styles.placeholder}>
        <p>🚦 월별 투자 시그널 패널 (Week 8)</p>
      </section>
      <section className={styles.riskSection} aria-labelledby="risk-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="risk-title">리스크 분석</h2>
            <p>최근 90일 일봉 기준으로 계산합니다.</p>
          </div>
          {riskData && <span className={styles.analysisCount}>분석 종목 {riskData.analyzedTickers.length}개</span>}
        </div>

        {isRiskLoading && <p className={styles.riskStatus}>일봉 데이터를 불러와 리스크를 계산하는 중입니다...</p>}
        {!isRiskLoading && !riskData && portfolio.length > 0 && <p className={styles.riskStatus}>현재가를 불러온 뒤 리스크 분석을 준비합니다.</p>}

        {!isRiskLoading && riskData && (
          <>
            <div className={styles.riskGrid}>
              <article className={styles.riskCard}><span>연율 변동성</span><strong>{riskData.volatility === null ? '-' : `${riskData.volatility.toFixed(2)}%`}</strong><small>종목 비중을 반영한 평균</small></article>
              <article className={styles.riskCard}><span>최대 낙폭 (MDD)</span><strong className={styles.negative}>{riskData.mdd === null ? '-' : `${riskData.mdd.toFixed(2)}%`}</strong><small>분석 종목 중 가장 큰 하락폭</small></article>
              <article className={styles.riskCard}><span>상위 2종목 집중도</span><strong>{riskData.concentration.toFixed(2)}%</strong><small>비중이 높은 두 종목의 합계</small></article>
              <article className={styles.riskCard}><span>최대 단일 종목 비중</span><strong>{riskData.maxWeight.toFixed(2)}%</strong><small>현재가와 환율을 반영</small></article>
            </div>

            {riskData.insufficientTickers.length > 0 && <p className={styles.riskWarning}>일봉 데이터가 부족해 제외된 종목: {riskData.insufficientTickers.map(stockLabel).join(', ')}</p>}

            <div className={styles.riskTableWrap}>
              <table className={styles.riskTable}>
                <thead><tr><th>종목</th><th>일봉 수</th><th>연율 변동성</th><th>MDD</th></tr></thead>
                <tbody>{riskData.stocks.map((stock) => (
                  <tr key={stock.ticker}>
                    <td>{stockLabel(stock.ticker)}</td><td>{stock.observations}</td>
                    <td>{stock.volatility === null ? '데이터 부족' : `${stock.volatility.toFixed(2)}%`}</td>
                    <td className={stock.mdd !== null && stock.mdd < 0 ? styles.negative : undefined}>{stock.mdd === null ? '데이터 부족' : `${stock.mdd.toFixed(2)}%`}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
};

export default Dashboard;
