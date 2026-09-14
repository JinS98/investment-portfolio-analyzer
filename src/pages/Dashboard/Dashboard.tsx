import { useEffect } from 'react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { MarketDataPanel } from '../../components/MarketDataPanel';
import { PortfolioManager } from '../../components/PortfolioManager';
import styles from './Dashboard.module.scss';
const Dashboard = () => {
  const {
    portfolio,
    isLoading,
    isError,
    lastUpdated,
    refreshPrices,
  } = usePortfolio();
  useEffect(() => { if (portfolio.length) refreshPrices(); }, [portfolio.length, refreshPrices]);

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
          <button className={styles.refreshBtn} onClick={refreshPrices} disabled={isLoading}>
            {isLoading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </header>
      <MarketDataPanel />
      <PortfolioManager />

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
    </main>
  );
};

export default Dashboard;
