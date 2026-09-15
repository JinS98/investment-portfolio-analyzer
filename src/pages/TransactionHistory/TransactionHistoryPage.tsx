import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { TransactionHistory } from '../../components/TransactionHistory/TransactionHistory';
import type { HoldingHistory } from '../../types';
import styles from './TransactionHistoryPage.module.scss';

export function TransactionHistoryPage() {
  const userId = useAuthStore((state) => state.user?.uid);
  const { isPortfolioLoading, portfolioError } = usePortfolioSync();
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const activePortfolioId = usePortfolioStore((state) => state.activePortfolioId);
  const histories = usePortfolioStore((state) => state.holdingHistories);
  const isSaving = usePortfolioStore((state) => state.isSaving);
  const setActivePortfolioId = usePortfolioStore((state) => state.setActivePortfolioId);
  const deleteHoldingHistory = usePortfolioStore((state) => state.deleteHoldingHistory);
  const activePortfolio = portfolios.find((portfolio) => portfolio.id === activePortfolioId);

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
