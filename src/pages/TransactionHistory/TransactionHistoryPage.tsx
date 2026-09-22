import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { TransactionHistory } from '../../components/TransactionHistory/TransactionHistory';
import type { HoldingHistory } from '../../types';
import { calculateRealizedKrwPnLBreakdown } from '../../utils/portfolioFxPerformance';
import { confirmRecurringHoldingHistory } from '../../services/portfolioLedgerService';
import styles from './TransactionHistoryPage.module.scss';

const money = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;

export function TransactionHistoryPage() {
  const userId = useAuthStore((state) => state.user?.uid);
  const { isPortfolioLoading, portfolioError } = usePortfolioSync();
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const activePortfolioId = usePortfolioStore((state) => state.activePortfolioId);
  const histories = usePortfolioStore((state) => state.holdingHistories);
  const isSaving = usePortfolioStore((state) => state.isSaving);
  const setActivePortfolioId = usePortfolioStore((state) => state.setActivePortfolioId);
  const deleteHoldingHistory = usePortfolioStore((state) => state.deleteHoldingHistory);
  const loadPortfolioLedgers = usePortfolioStore((state) => state.loadPortfolioLedgers);
  const activePortfolio = portfolios.find((portfolio) => portfolio.id === activePortfolioId);
  const realizedPnL = calculateRealizedKrwPnLBreakdown(histories);

  const removeTransaction = async (history: HoldingHistory) => {
    await deleteHoldingHistory(userId, history.portfolioId, history.id);
  };

  const confirmRecurringTransaction = async (
    history: HoldingHistory,
    values: { price: number; quantity: number; fee: number; tax: number },
  ) => {
    if (!userId) throw new Error('로그인 후 자동매수 체결 내역을 확정할 수 있습니다.');
    await confirmRecurringHoldingHistory(userId, history.portfolioId, history.id, values);
    await loadPortfolioLedgers(userId);
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
            className={
              realizedPnL === null || realizedPnL.profitAmount >= 0
                ? styles.positive
                : styles.negative
            }
          >
            {realizedPnL === null ? '거래일 환율 보정 중' : money(realizedPnL.profitAmount)}
          </strong>
          {realizedPnL ? (
            <div className={styles.realizedBreakdown}>
              <span>
                주가 손익{' '}
                <b
                  className={realizedPnL.stockProfitAmount >= 0 ? styles.positive : styles.negative}
                >
                  {money(realizedPnL.stockProfitAmount)}
                </b>
              </span>
              <span>
                환차익{' '}
                <b
                  className={
                    realizedPnL.foreignExchangeProfitAmount >= 0 ? styles.positive : styles.negative
                  }
                >
                  {money(realizedPnL.foreignExchangeProfitAmount)}
                </b>
              </span>
            </div>
          ) : null}
          <small>매도일 환율과 수수료·세금을 반영한 누적 실현손익입니다.</small>
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
          onDelete={removeTransaction}
          onConfirmRecurring={userId ? confirmRecurringTransaction : undefined}
        />
      )}
    </main>
  );
}
