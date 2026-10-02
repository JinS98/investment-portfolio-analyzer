import { useMemo } from 'react';
import { TransactionModal } from '@features/transaction';
import { usePortfolioSync } from '../../hooks/usePortfolioSync';
import { useAuthStore } from '../../store/authStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useDisplayCurrencyStore } from '../../store/displayCurrencyStore';
import { isKoreanMarket } from '@entities/stock';
import type { Holding, HoldingHistoryInput } from '../../types';
import { MarketIndicatorSection } from './MarketIndicatorSection';
import { MarketStockList } from './MarketStockList';
import { StockDetailDrawer } from './StockDetailDrawer';
import { useMarketOverview } from './useMarketOverview';
import { useMarketSearch } from './useMarketSearch';
import { useStockDetail } from './useStockDetail';
import styles from './MarketExplorePage.module.scss';

const EMPTY_HOLDINGS: Holding[] = [];
const GUEST_REAL_PORTFOLIO = {
  id: 'guest-real',
  userId: 'guest',
  name: '실제 포트폴리오',
  type: 'REAL' as const,
  createdAt: 0,
  updatedAt: 0,
};

export function MarketExplorePage() {
  usePortfolioSync();
  const userId = useAuthStore((state) => state.user?.uid);
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const portfolioLedgers = usePortfolioStore((state) => state.portfolioLedgers);
  const isTransactionModalOpen = usePortfolioStore((state) => state.isTransactionModalOpen);
  const transactionModalType = usePortfolioStore((state) => state.transactionModalType);
  const transactionModalPreset = usePortfolioStore((state) => state.transactionModalPreset);
  const isSaving = usePortfolioStore((state) => state.isSaving);
  const openTransactionModal = usePortfolioStore((state) => state.openTransactionModal);
  const closeTransactionModal = usePortfolioStore((state) => state.closeTransactionModal);
  const setTransactionModalType = usePortfolioStore((state) => state.setTransactionModalType);
  const addHoldingHistory = usePortfolioStore((state) => state.addHoldingHistory);
  const exchangeRate = usePortfolioStore((state) => state.exchangeRate);
  const setExchangeRate = usePortfolioStore((state) => state.setExchangeRate);
  const displayCurrency = useDisplayCurrencyStore((state) => state.displayCurrency);
  const {
    overview,
    indicators,
    intradayIndicators,
    selectedIndicator,
    setSelectedIndicator,
    indicatorCandles,
    isIndicatorDialogOpen,
    setIsIndicatorDialogOpen,
    isLoading,
    error,
    setError,
  } = useMarketOverview({ setExchangeRate });
  const { filter, setFilter, query, setQuery, isSearching, visibleStocks } = useMarketSearch(
    overview,
    setError,
  );
  const {
    selectedStock,
    stockDetail,
    isDetailLoading,
    detailError,
    portfolioActionNotice,
    setPortfolioActionNotice,
    openStockDrawer,
    closeStockDrawer,
    retryStockDetail,
  } = useStockDetail();
  const realPortfolio = useMemo(
    () =>
      portfolios.find((portfolio) => portfolio.type === 'REAL') ??
      (!userId ? GUEST_REAL_PORTFOLIO : null),
    [portfolios, userId],
  );
  const realHoldings = realPortfolio
    ? (portfolioLedgers[realPortfolio.id]?.holdings ?? EMPTY_HOLDINGS)
    : EMPTY_HOLDINGS;

  const addStockToPortfolio = () => {
    if (!selectedStock) return;
    if (!realPortfolio) {
      setPortfolioActionNotice('실제 포트폴리오를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const price = stockDetail?.quote?.price ?? selectedStock.price;
    if (price === null || !Number.isFinite(price) || price <= 0) {
      setPortfolioActionNotice('현재가를 확인한 뒤 담을 수 있습니다.');
      return;
    }
    closeStockDrawer();
    openTransactionModal({
      type: 'BUY',
      portfolioId: realPortfolio.id,
      ticker: selectedStock.symbol,
      name: selectedStock.name,
      market: isKoreanMarket(selectedStock.market) ? 'KR' : 'US',
      price,
    });
  };

  const submitTransaction = async (input: HoldingHistoryInput) => {
    await addHoldingHistory(userId, input);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p>시장 데이터</p>
        <h1>시장 탐색</h1>
        <span>국내와 미국 종목을 살펴보고, 관심 종목을 빠르게 찾아보세요.</span>
      </header>

      <MarketIndicatorSection
        indicators={indicators}
        intradayIndicators={intradayIndicators}
        selectedIndicator={selectedIndicator}
        indicatorCandles={indicatorCandles}
        isDialogOpen={isIndicatorDialogOpen}
        displayCurrency={displayCurrency}
        exchangeRate={exchangeRate?.rate}
        onSelect={(symbol) => {
          setSelectedIndicator(symbol);
          setIsIndicatorDialogOpen(true);
        }}
        onClose={() => setIsIndicatorDialogOpen(false)}
      />

      <MarketStockList
        query={query}
        onQueryChange={setQuery}
        isSearching={isSearching}
        filter={filter}
        onFilterChange={setFilter}
        error={error}
        isLoading={isLoading}
        visibleStocks={visibleStocks}
        displayCurrency={displayCurrency}
        exchangeRate={exchangeRate?.rate}
        onSelectStock={openStockDrawer}
      />

      <StockDetailDrawer
        selectedStock={selectedStock}
        stockDetail={stockDetail}
        isDetailLoading={isDetailLoading}
        detailError={detailError}
        portfolioActionNotice={portfolioActionNotice}
        displayCurrency={displayCurrency}
        exchangeRate={exchangeRate?.rate}
        onClose={closeStockDrawer}
        onAdd={addStockToPortfolio}
        onRetry={retryStockDetail}
      />
      <TransactionModal
        isOpen={isTransactionModalOpen}
        type={transactionModalType}
        portfolio={realPortfolio}
        holdings={realHoldings}
        preset={transactionModalPreset ?? undefined}
        isSaving={isSaving}
        onTypeChange={setTransactionModalType}
        onClose={closeTransactionModal}
        onSubmit={submitTransaction}
      />
    </main>
  );
}
