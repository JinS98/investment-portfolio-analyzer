import { useEffect } from 'react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { isTossConfigured } from '../../services/tossApi';
import styles from './Dashboard.module.scss';

const Dashboard = () => {
  const {
    portfolio,
    computedData,
    isLoading,
    isError,
    lastUpdated,
    refreshPrices,
  } = usePortfolio();

  useEffect(() => {
    refreshPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio.length]);

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>📊 포트폴리오 대시보드</h1>
        <div className={styles.meta}>
          {!isTossConfigured() && (
            <span className={styles.mockBadge}>Mock 데이터</span>
          )}
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

      {isError && (
        <div className={styles.errorBanner}>
          ⚠️ 데이터를 불러오는 중 오류가 발생했습니다. 토스 API 설정을 확인해주세요.
        </div>
      )}

      {/* Summary — Week 3에서 완성 */}
      {computedData && (
        <section className={styles.summary}>
          <div className={styles.summaryCard}>
            <span className={styles.label}>총 평가금액</span>
            <span className={styles.value}>
              ${computedData.totalEvaluatedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.label}>총 수익률</span>
            <span
              className={`${styles.value} ${computedData.totalProfitRate >= 0 ? styles.positive : styles.negative}`}
            >
              {computedData.totalProfitRate >= 0 ? '+' : ''}
              {computedData.totalProfitRate.toFixed(2)}%
            </span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.label}>보유 종목 수</span>
            <span className={styles.value}>{portfolio.length}개</span>
          </div>
        </section>
      )}

      {portfolio.length === 0 && (
        <div className={styles.empty}>
          <p>종목을 추가해 포트폴리오를 시작하세요.</p>
          <p className={styles.emptyHint}>Week 3에서 종목 추가 UI가 구현됩니다.</p>
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
