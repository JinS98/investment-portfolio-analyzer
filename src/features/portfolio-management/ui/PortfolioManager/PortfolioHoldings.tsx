import { HoldingsSection } from '../HoldingsSection';
import type { HoldingColumnId } from '../../model/holdingColumns';
import type { createPortfolioManagerViewModel } from '../../model/portfolioViewModel';
import type { Holding, HoldingHistory, MarketType, PriceMap } from '../../../../types';
import styles from './PortfolioManager.module.scss';

interface PortfolioHoldingsProps {
  loading: boolean;
  holdings: Holding[];
  histories: HoldingHistory[];
  displayCurrency: 'KRW' | 'USD';
  exchangeRate: number | null;
  groups: ReturnType<typeof createPortfolioManagerViewModel>['groups'];
  prices: PriceMap;
  visibleColumnsByMarket: Record<MarketType, HoldingColumnId[]>;
  money: (value: number, market: MarketType) => string;
  menuMarket: MarketType | null;
  onMenuMarketChange: (market: MarketType | null) => void;
  onToggleColumn: (market: MarketType, column: HoldingColumnId) => void;
  onResetColumns: (market: MarketType) => void;
  onBuy: (holding?: Holding, currentPrice?: number) => void;
  onRecurring: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  showRecurring: boolean;
}

export function PortfolioHoldings({
  loading,
  holdings,
  histories,
  displayCurrency,
  exchangeRate,
  groups,
  prices,
  visibleColumnsByMarket,
  money,
  menuMarket,
  onMenuMarketChange,
  onToggleColumn,
  onResetColumns,
  onBuy,
  onRecurring,
  onRefresh,
  isRefreshing,
  showRecurring,
}: PortfolioHoldingsProps) {
  if (loading) return <p className={styles.empty}>거래 원장을 불러오는 중입니다.</p>;
  if (holdings.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>아직 보유 종목이 없습니다.</p>
        <div className={styles.actionButtons}>
          {showRecurring && (
            <button type="button" onClick={onRecurring}>
              적립식 투자
            </button>
          )}
          <button type="button" onClick={() => onBuy()}>
            첫 매수 기록 추가
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className={styles.actions}>
        <span>KRW와 USD는 통화별로 따로 표시합니다. 현재가는 보유 종목 기준으로 갱신합니다.</span>
        <div className={styles.actionButtons}>
          {showRecurring && (
            <button type="button" onClick={onRecurring}>
              적립식 투자
            </button>
          )}
          <button type="button" onClick={() => onBuy()}>
            매수 기록 추가
          </button>
          <button type="button" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? '시세 갱신 중…' : '현재가 갱신'}
          </button>
        </div>
      </div>
      <HoldingsSection
        groups={groups}
        histories={histories}
        displayCurrency={displayCurrency}
        exchangeRate={exchangeRate}
        prices={prices}
        visibleColumnsByMarket={visibleColumnsByMarket}
        money={money}
        menuMarket={menuMarket}
        onMenuMarketChange={onMenuMarketChange}
        onToggleColumn={onToggleColumn}
        onResetColumns={onResetColumns}
        onBuy={(holding, currentPrice) => onBuy(holding, currentPrice)}
      />
    </>
  );
}
