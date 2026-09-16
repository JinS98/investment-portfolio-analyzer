import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { TransactionHistory } from '../../components/TransactionHistory/TransactionHistory';
import type { HoldingHistory } from '../../types';
import styles from './TransactionHistoryPage.module.scss';

const money = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;

export function TransactionHistoryPage() {
  const userId = useAuthStore((state) => state.user?.uid);
  const { isPortfolioLoading, portfolioError } = usePortfolioSync();
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const activePortfolioId = usePortfolioStore((state) => state.activePortfolioId);
  const histories = usePortfolioStore((state) => state.holdingHistories);
  const portfolioSummary = usePortfolioStore((state) => state.portfolioSummary);
  const exchangeRate = usePortfolioStore((state) => state.exchangeRate);
  const isSaving = usePortfolioStore((state) => state.isSaving);
  const setActivePortfolioId = usePortfolioStore((state) => state.setActivePortfolioId);
  const deleteHoldingHistory = usePortfolioStore((state) => state.deleteHoldingHistory);
  const activePortfolio = portfolios.find((portfolio) => portfolio.id === activePortfolioId);
  const hasUsSale = histories.some((history) => history.market === 'US' && history.type === 'SELL');
  const realizedPnL =
    hasUsSale && !exchangeRate
      ? null
      : (portfolioSummary?.byMarket.KR?.realizedPnL ?? 0) +
        (portfolioSummary?.byMarket.US?.realizedPnL ?? 0) * (exchangeRate?.rate ?? 1);

  const removeTransaction = async (history: HoldingHistory) => {
    if (!userId) throw new Error('로그인 후 거래 기록을 삭제할 수 있습니다.');
    await deleteHoldingHistory(userId, history.portfolioId, history.id);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>포트폴리오</p>
          <h1>거래 내역</h1>
          <span>매수·매도 기록과 매도에 따른 실현손익을 확인합니다.</span>
        </div>
      </header>

      {portfolios.length > 1 && (
        <div className={styles.tabs} role="tablist" aria-label="포트폴리오 선택">
          {portfolios.map((portfolio) => (
            <button
              key={portfolio.id}
              type="button"
              role="tab"
              aria-selected={portfolio.id === activePortfolioId}
              className={portfolio.id === activePortfolioId ? styles.activeTab : undefined}
              onClick={() => setActivePortfolioId(portfolio.id)}
            >
              {portfolio.name}
            </button>
          ))}
        </div>
      )}

      {activePortfolio && (
        <section className={styles.realizedSummary} aria-label="누적 실현손익">
          <span>누적 실현손익 (원화)</span>
          <strong
            className={realizedPnL === null || realizedPnL >= 0 ? styles.positive : styles.negative}
          >
            {realizedPnL === null ? '환율 미조회' : money(realizedPnL)}
          </strong>
          <small>매도 거래의 수수료와 세금을 반영한 손익입니다.</small>
        </section>
      )}

      {isPortfolioLoading ? (
        <p className={styles.status}>거래 기록을 불러오는 중입니다.</p>
      ) : portfolioError ? (
        <p className={styles.error} role="alert">
          {portfolioError}
        </p>
      ) : !activePortfolio ? (
        <p className={styles.status}>로그인 후 거래 내역을 확인할 수 있습니다.</p>
      ) : (
        <TransactionHistory
          histories={histories}
          isSaving={isSaving}
          onDelete={userId ? removeTransaction : undefined}
        />
      )}
    </main>
  );
}
