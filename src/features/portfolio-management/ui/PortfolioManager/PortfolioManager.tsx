import { useCallback, useEffect, useMemo, useState } from 'react';
import { TransactionModal } from '@features/transaction';
import { RecurringInvestmentModal } from '@features/recurring-investment';
import { useAuthStore } from '../../../../store/authStore';
import { usePortfolioStore } from '../../../../store/portfolioStore';
import { useDisplayCurrencyStore } from '../../../../store/displayCurrencyStore';
import type { PortfolioType, RecurringInvestmentRule } from '../../../../types';
import { formatCurrentMoney } from '../../../../utils/displayCurrency';
import { selectPortfolioWorkspace } from '@entities/portfolio';
import { createPortfolioManagerViewModel } from '../../model/portfolioViewModel';
import { usePersistentColumns } from '../../model/usePersistentColumns';
import { usePortfolioPrices } from '../../model/usePortfolioPrices';
import { RecurringInvestmentSection, useRecurringRules } from '@features/recurring-investment';
import { PortfolioHeader } from './PortfolioHeader';
import { PortfolioHoldings } from './PortfolioHoldings';
import { PortfolioSummary } from './PortfolioSummary';
import styles from './PortfolioManager.module.scss';

interface PortfolioManagerProps {
  portfolioType?: PortfolioType;
}

export function PortfolioManager({ portfolioType }: PortfolioManagerProps) {
  const userId = useAuthStore((state) => state.user?.uid);
  const selectedHoldings = usePortfolioStore((state) => state.holdings);
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const activePortfolioId = usePortfolioStore((state) => state.activePortfolioId);
  const portfolioLedgers = usePortfolioStore((state) => state.portfolioLedgers);
  const prices = usePortfolioStore((state) => state.prices);
  const exchangeRate = usePortfolioStore((state) => state.exchangeRate);
  const isLoading = usePortfolioStore((state) => state.isLoading);
  const ledgerError = usePortfolioStore((state) => state.ledgerError);
  const isSaving = usePortfolioStore((state) => state.isSaving);
  const isTransactionModalOpen = usePortfolioStore((state) => state.isTransactionModalOpen);
  const transactionModalType = usePortfolioStore((state) => state.transactionModalType);
  const transactionModalPreset = usePortfolioStore((state) => state.transactionModalPreset);
  const setPrices = usePortfolioStore((state) => state.setPrices);
  const setActivePortfolioId = usePortfolioStore((state) => state.setActivePortfolioId);
  const openTransactionModal = usePortfolioStore((state) => state.openTransactionModal);
  const closeTransactionModal = usePortfolioStore((state) => state.closeTransactionModal);
  const setTransactionModalType = usePortfolioStore((state) => state.setTransactionModalType);
  const addHoldingHistory = usePortfolioStore((state) => state.addHoldingHistory);
  const loadPortfolioLedgers = usePortfolioStore((state) => state.loadPortfolioLedgers);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurringRule, setEditingRecurringRule] = useState<RecurringInvestmentRule | null>(
    null,
  );
  const [actionNotice, setActionNotice] = useState('');
  const [columnMenuMarket, setColumnMenuMarket] = useState<'KR' | 'US' | null>(null);
  const { visibleColumnsByMarket, toggleColumn, resetColumns } =
    usePersistentColumns(portfolioType);
  const summaryCurrency = useDisplayCurrencyStore((state) => state.displayCurrency);
  const { activePortfolio, transactionPortfolio, holdings, histories } = useMemo(
    () =>
      selectPortfolioWorkspace({
        userId,
        requestedType: portfolioType,
        portfolios,
        activePortfolioId,
        portfolioLedgers,
        fallbackHoldings: selectedHoldings,
      }),
    [activePortfolioId, portfolioLedgers, portfolioType, portfolios, selectedHoldings, userId],
  );
  const { isRefreshing, refreshPrices } = usePortfolioPrices({
    holdings,
    prices,
    setPrices,
    onNotice: setActionNotice,
  });
  const notifyRecurring = useCallback((message: string) => setActionNotice(message), []);
  const {
    rules: recurringRules,
    failureStates: recurringFailureStateByRule,
    progress: recurringExecutionProgress,
    updatingRuleId: updatingRecurringRuleId,
    openStatusRuleId,
    setOpenStatusRuleId,
    updateStatus: updateRecurringRuleStatus,
    retry: retryRecurringRule,
    mergeRule,
    removeRule,
    allowAutomaticExecution,
  } = useRecurringRules({
    userId,
    portfolio: activePortfolio,
    reloadLedgers: loadPortfolioLedgers,
    onNotice: notifyRecurring,
  });

  const viewModel = useMemo(
    () =>
      createPortfolioManagerViewModel(
        holdings,
        histories,
        prices,
        exchangeRate?.rate ?? null,
        summaryCurrency,
      ),
    [exchangeRate?.rate, histories, holdings, prices, summaryCurrency],
  );
  const grouped = viewModel.groups;
  const currentMoney = (value: number, market: 'KR' | 'US') =>
    formatCurrentMoney(value, market, summaryCurrency, exchangeRate?.rate);

  const hasMissingGuestHistoricalRate =
    !userId &&
    summaryCurrency === 'KRW' &&
    histories.some((history) => history.market === 'US' && !history.exchangeRate);

  useEffect(() => {
    if (!hasMissingGuestHistoricalRate) return;
    void loadPortfolioLedgers(undefined).catch(() => {
      // The summary renders "환율 없음" when a historical rate cannot be retrieved.
    });
  }, [hasMissingGuestHistoricalRate, loadPortfolioLedgers]);

  const openTransaction = (params: Parameters<typeof openTransactionModal>[0] = {}) => {
    if (!transactionPortfolio) {
      setActionNotice('포트폴리오를 불러온 뒤 다시 시도해주세요.');
      return;
    }
    setActionNotice('');
    openTransactionModal({ ...params, portfolioId: transactionPortfolio.id });
  };

  const submitTransaction = async (input: Parameters<typeof addHoldingHistory>[1]) => {
    await addHoldingHistory(userId, input);
  };

  return (
    <section className={styles.section}>
      <PortfolioHeader
        activePortfolio={activePortfolio}
        portfolios={portfolios}
        activePortfolioId={activePortfolioId}
        portfolioType={portfolioType}
        holdingsCount={holdings.length}
        krCount={grouped.find((group) => group.market === 'KR')?.holdings.length ?? 0}
        usCount={grouped.find((group) => group.market === 'US')?.holdings.length ?? 0}
        onSelectPortfolio={setActivePortfolioId}
      />

      <PortfolioSummary viewModel={viewModel} displayCurrency={summaryCurrency} />

      {ledgerError && (
        <p className={styles.error} role="alert">
          거래 원장 오류: {ledgerError}
        </p>
      )}
      {actionNotice && (
        <p className={styles.notice} role="status">
          {actionNotice}
        </p>
      )}

      <PortfolioHoldings
        loading={!activePortfolio && isLoading}
        holdings={holdings}
        groups={grouped}
        prices={prices}
        visibleColumnsByMarket={visibleColumnsByMarket}
        money={currentMoney}
        menuMarket={columnMenuMarket}
        onMenuMarketChange={setColumnMenuMarket}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        onBuy={(holding, currentPrice) =>
          openTransaction(
            holding
              ? {
                  type: 'BUY',
                  ticker: holding.ticker,
                  name: holding.name,
                  market: holding.market,
                  price: currentPrice,
                }
              : { type: 'BUY' },
          )
        }
        onRecurring={() => setIsRecurringModalOpen(true)}
        onRefresh={() => void refreshPrices()}
        isRefreshing={isRefreshing}
        showRecurring={Boolean(userId)}
      />
      {userId && activePortfolio && recurringRules.length > 0 ? (
        <RecurringInvestmentSection
          rules={recurringRules}
          histories={histories}
          displayCurrency={summaryCurrency}
          failureStates={recurringFailureStateByRule}
          progress={recurringExecutionProgress}
          updatingRuleId={updatingRecurringRuleId}
          openStatusRuleId={openStatusRuleId}
          showAnalysis={portfolioType === 'REAL'}
          onAdd={() => setIsRecurringModalOpen(true)}
          onEdit={(rule) => {
            setEditingRecurringRule(rule);
            setIsRecurringModalOpen(true);
          }}
          onHistory={(rule) => {
            sessionStorage.setItem('transaction-history-recurring-rule-id', rule.id);
            window.location.hash = '#transactions';
          }}
          onStatusMenu={setOpenStatusRuleId}
          onStatusChange={(rule, status) => void updateRecurringRuleStatus(rule, status)}
          onRetry={(rule) => void retryRecurringRule(rule)}
          onAnalysis={() => {
            try {
              sessionStorage.setItem('focus-recurring-investment-analysis', 'true');
            } catch {
              // Session storage is optional; navigation still works without it.
            }
            window.location.hash = '#analysis';
          }}
        />
      ) : null}
      <TransactionModal
        isOpen={isTransactionModalOpen}
        type={transactionModalType}
        portfolio={transactionPortfolio}
        holdings={holdings}
        preset={transactionModalPreset ?? undefined}
        isSaving={isSaving}
        onTypeChange={setTransactionModalType}
        onClose={closeTransactionModal}
        onSubmit={submitTransaction}
      />
      {userId && activePortfolio ? (
        <RecurringInvestmentModal
          key={editingRecurringRule?.id ?? 'new'}
          isOpen={isRecurringModalOpen}
          userId={userId}
          portfolio={activePortfolio}
          rule={editingRecurringRule ?? undefined}
          onClose={() => {
            setIsRecurringModalOpen(false);
            setEditingRecurringRule(null);
          }}
          onSaved={(rule) => {
            mergeRule(rule);
            setActionNotice(
              editingRecurringRule
                ? '적립식 투자 규칙을 수정했습니다.'
                : '적립식 투자 규칙을 저장했습니다.',
            );
            setEditingRecurringRule(null);
            allowAutomaticExecution();
          }}
          onDeleted={(ruleId) => {
            removeRule(ruleId);
            setActionNotice('적립식 투자 규칙을 삭제했습니다.');
            setEditingRecurringRule(null);
          }}
        />
      ) : null}
    </section>
  );
}
