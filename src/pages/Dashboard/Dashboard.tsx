import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { usePortfolio } from '../../hooks/usePortfolio';
import { PortfolioAlertSummary } from '@widgets/dashboard-panels';
import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { dropPosition, splitFromPointer } from '@features/dashboard-layout';
import type { DashboardView } from '@features/dashboard-layout';
import {
  DEFAULT_PANEL_ORDER,
  PANEL_REGISTRY,
  dashboardLayoutReducer,
  panelGridPosition,
  readDashboardLayout,
  saveDashboardLayout,
  visiblePanelRows,
} from './panelRegistry';
import type { DashboardPanelContext, PanelId } from './panelRegistry';
import styles from './Dashboard.module.scss';

const EMPTY_HOLDINGS: import('../../types').Holding[] = [];

interface DashboardProps {
  view: DashboardView;
  onLogin: () => void;
}

const Dashboard = ({ view, onLogin }: DashboardProps) => {
  const { isPortfolioLoading, portfolioError } = usePortfolioSync();
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const portfolioLedgers = usePortfolioStore((state) => state.portfolioLedgers);
  const openTransactionModal = usePortfolioStore((state) => state.openTransactionModal);
  const userId = useAuthStore((state) => state.user?.uid);
  const realPortfolio = useMemo(
    () => portfolios.find((portfolio) => portfolio.type === 'REAL'),
    [portfolios],
  );
  const realHoldings = useMemo(() => {
    return realPortfolio
      ? (portfolioLedgers[realPortfolio.id]?.holdings ?? EMPTY_HOLDINGS)
      : EMPTY_HOLDINGS;
  }, [portfolioLedgers, realPortfolio]);
  const realHistories = realPortfolio ? (portfolioLedgers[realPortfolio.id]?.histories ?? []) : [];

  const addMarketSearchBuyRecord = realPortfolio
    ? (preset: { ticker: string; name: string; market: 'KR' | 'US'; price: number }) => {
        openTransactionModal({
          ...preset,
          type: 'BUY',
          portfolioId: realPortfolio.id,
        });
      }
    : undefined;
  const {
    portfolio,
    prices,
    historicalData,
    portfolioHistory,
    isLoading,
    isError,
    lastUpdated,
    exchangeRate,
    riskData,
    historySaveError,
    priceRefreshFailures,
    refreshPrices,
    loadHistoricalData,
  } = usePortfolio();
  const refreshPricesRef = useRef(refreshPrices);
  const lastAutoRefreshKey = useRef<string | null>(null);
  const loadHistoricalDataRef = useRef(loadHistoricalData);
  const lastRiskRefresh = useRef<string | null>(null);
  const recurringAnalysisPanelRef = useRef<HTMLDivElement>(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [panelRows, dispatchLayout] = useReducer(dashboardLayoutReducer, undefined, () =>
    readDashboardLayout(typeof localStorage === 'undefined' ? undefined : localStorage),
  );
  const [draggingPanel, setDraggingPanel] = useState<PanelId | null>(null);
  const shownRows = visiblePanelRows(panelRows, view);
  const autoRefreshKey = realHoldings
    .map((holding) => `${holding.market}:${holding.ticker}:${holding.lastTransactionAt ?? ''}`)
    .join('|');
  const handleResizeStart = (id: PanelId, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const grid = event.currentTarget.closest(`.${styles.componentGrid}`);
    if (!grid) return;
    const bounds = grid.getBoundingClientRect();

    const resize = (pointerEvent: globalThis.PointerEvent) => {
      dispatchLayout({
        type: 'resize',
        id,
        split: splitFromPointer(pointerEvent.clientX, bounds.left, bounds.width),
      });
    };
    const finish = () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', finish);
    };
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', finish);
  };

  const panelProps = (id: PanelId) => {
    const row = shownRows.find((item) => item.ids.includes(id));
    const pairPosition =
      row?.ids.length === 2 ? (row.ids[0] === id ? styles.pairedFirst : styles.pairedSecond) : '';

    return {
      className: `${styles.panelItem} ${pairPosition} ${draggingPanel === id ? styles.panelDragging : ''} ${PANEL_REGISTRY[id].view === view ? '' : styles.hiddenPanel}`,
      style: panelGridPosition(shownRows, id),
      draggable: true,
      onDragStart: (event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
        setDraggingPanel(id);
      },
      onDragOver: (event: DragEvent<HTMLDivElement>) => event.preventDefault(),
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const source = event.dataTransfer.getData('text/plain') as PanelId;
        if (!Object.hasOwn(PANEL_REGISTRY, source) || source === id) return;
        const targetBounds = event.currentTarget.getBoundingClientRect();
        dispatchLayout({
          type: 'move',
          source,
          target: id,
          position: dropPosition(event.clientX, event.clientY, targetBounds),
        });
        setDraggingPanel(null);
      },
      onDragEnd: () => setDraggingPanel(null),
    };
  };

  const renderResizeHandle = (id: PanelId) =>
    shownRows.some((row) => row.ids[0] === id && row.ids.length === 2) ? (
      <button
        type="button"
        className={styles.resizeHandle}
        aria-label="같은 행 패널의 너비 조절"
        title="드래그하여 너비 조절"
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => handleResizeStart(id, event)}
      />
    ) : null;

  useEffect(() => {
    refreshPricesRef.current = refreshPrices;
  }, [refreshPrices]);

  useEffect(() => {
    loadHistoricalDataRef.current = loadHistoricalData;
  }, [loadHistoricalData]);

  useEffect(() => {
    saveDashboardLayout(typeof localStorage === 'undefined' ? undefined : localStorage, panelRows);
  }, [panelRows]);

  useEffect(() => {
    if (view !== 'analysis') return;
    try {
      if (sessionStorage.getItem('focus-recurring-investment-analysis') !== 'true') return;
      sessionStorage.removeItem('focus-recurring-investment-analysis');
    } catch {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      recurringAnalysisPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => {
    if (isPortfolioLoading || !autoRefreshKey) {
      lastAutoRefreshKey.current = null;
      return;
    }
    // React StrictMode의 개발용 effect 재실행과 시세 상태 변경으로 인한 중복 요청을 막는다.
    if (lastAutoRefreshKey.current === autoRefreshKey) return;
    lastAutoRefreshKey.current = autoRefreshKey;
    void refreshPricesRef.current();
  }, [autoRefreshKey, isPortfolioLoading]);

  useEffect(() => {
    void refreshPricesRef.current();
  }, []);

  useEffect(() => {
    if (!lastUpdated || lastRiskRefresh.current === lastUpdated) return;
    lastRiskRefresh.current = lastUpdated;
    setIsRiskLoading(true);
    void loadHistoricalDataRef
      .current()
      .catch((error) => {
        console.error('[Dashboard] risk data load error:', error);
      })
      .finally(() => setIsRiskLoading(false));
  }, [lastUpdated]);

  const panelContext: DashboardPanelContext = {
    realHoldings,
    realHistories,
    realPortfolioId: realPortfolio?.id,
    addMarketSearchBuyRecord,
    portfolio,
    prices,
    exchangeRate,
    historicalData,
    portfolioHistory,
    riskData,
    isRiskLoading,
  };

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {view === 'analysis' ? '📈 투자 분석' : '📊 포트폴리오 대시보드'}
        </h1>
        <div className={styles.meta}>
          {lastUpdated && (
            <span className={styles.updated}>
              업데이트: {new Date(lastUpdated).toLocaleTimeString('ko-KR')}
            </span>
          )}
          {exchangeRate && (
            <span
              className={styles.exchangeRate}
              title={`유효 시간: ${new Date(exchangeRate.validFrom).toLocaleTimeString('ko-KR')} ~ ${new Date(exchangeRate.validUntil).toLocaleTimeString('ko-KR')}`}
            >
              USD/KRW{' '}
              {exchangeRate.rate.toLocaleString('ko-KR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              원
            </span>
          )}
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={refreshPrices}
            disabled={isLoading}
            aria-label={isLoading ? '현재가를 새로고침하는 중' : '현재가 새로고침'}
            title={isLoading ? '새로고침 중' : '현재가 새로고침'}
          >
            <FiRefreshCw
              className={isLoading ? styles.refreshIconSpinning : undefined}
              aria-hidden="true"
            />
            {isLoading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </header>
      {view === 'dashboard' && userId && realPortfolio ? (
        <PortfolioAlertSummary
          holdings={realHoldings}
          histories={realHistories}
          portfolioHistory={portfolioHistory}
          prices={prices}
          exchangeRate={exchangeRate}
          lastUpdated={lastUpdated}
          failedTickers={priceRefreshFailures}
          userId={userId}
          portfolioId={realPortfolio.id}
        />
      ) : null}
      <div
        className={`${styles.componentGrid} ${view === 'analysis' && !userId ? styles.analysisLockedContent : ''}`}
      >
        {DEFAULT_PANEL_ORDER.map((id) => (
          <div
            key={id}
            {...panelProps(id)}
            ref={id === 'recurring' ? recurringAnalysisPanelRef : undefined}
          >
            <span className={styles.dragHandle} aria-hidden="true">
              ⠿
            </span>
            {renderResizeHandle(id)}
            {PANEL_REGISTRY[id].render(panelContext)}
          </div>
        ))}

        {isPortfolioLoading && (
          <p className={styles.storageStatus}>저장된 포트폴리오를 불러오는 중...</p>
        )}
        {portfolioError && <div className={styles.errorBanner}>⚠️ {portfolioError}</div>}

        {historySaveError && (
          <div className={styles.historyError}>이력 저장 실패: {historySaveError}</div>
        )}

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

        {/* 차트 — Day 5 */}
        <section className={styles.placeholder}>
          <p>📈 차트 영역 (Day 5)</p>
        </section>

        {/* 리스크 패널 — Day 5 */}
        <section className={styles.placeholder}>
          <p>🛡️ 리스크 분석 패널 (Day 5) — 토스 캔들 데이터 기반</p>
        </section>

        {/* 시그널 패널 — Day 8 */}
        <section className={styles.placeholder}>
          <p>🚦 월별 투자 시그널 패널 (Day 8)</p>
        </section>
      </div>
      {view === 'analysis' && !userId ? (
        <section className={styles.analysisLoginPrompt} aria-labelledby="analysis-login-title">
          <p className={styles.analysisLoginEyebrow}>투자 분석은 로그인 후 이용할 수 있습니다</p>
          <h2 id="analysis-login-title">포트폴리오를 저장하고 분석을 이어가세요</h2>
          <p>
            로그인하면 평가금액 이력, 기간별 수익률, 적립식 성과와 리스크 진단을 지속해서 확인할 수
            있습니다.
          </p>
          <button type="button" className={styles.analysisLoginButton} onClick={onLogin}>
            로그인하고 투자 분석 보기
          </button>
        </section>
      ) : null}
    </main>
  );
};

export default Dashboard;
