import type { ReactNode } from 'react';
import { MarketDataPanel } from '../../components/MarketDataPanel/MarketDataPanel';
import { PortfolioManager } from '../../components/PortfolioManager/PortfolioManager';
import { PortfolioAllocationChart } from '../../components/PortfolioAllocationChart/PortfolioAllocationChart';
import { PortfolioPerformanceChart } from '../../components/PortfolioPerformanceChart/PortfolioPerformanceChart';
import { PortfolioRiskDiagnostic } from '../../components/PortfolioRiskDiagnostic/PortfolioRiskDiagnostic';
import { PortfolioHistoryPanel } from '../../components/PortfolioHistoryPanel/PortfolioHistoryPanel';
import { MonthlyComparisonPanel } from '../../components/MonthlyComparisonPanel/MonthlyComparisonPanel';
import { RecurringInvestmentAnalysisPanel } from '../../components/RecurringInvestmentAnalysisPanel/RecurringInvestmentAnalysisPanel';
import { createDashboardLayout, type DashboardView } from '../../features/dashboard-layout';
import type {
  ExchangeRate,
  Holding,
  HoldingHistory,
  PortfolioHistory,
  PriceMap,
  RiskData,
  StockItem,
  TossCandleItem,
} from '../../types';

export interface DashboardPanelContext {
  realHoldings: Holding[];
  realHistories: HoldingHistory[];
  realPortfolioId?: string;
  addMarketSearchBuyRecord?: (preset: {
    ticker: string;
    name: string;
    market: 'KR' | 'US';
    price: number;
  }) => void;
  portfolio: StockItem[];
  prices: PriceMap;
  exchangeRate: ExchangeRate | null;
  historicalData: Record<string, TossCandleItem[]>;
  portfolioHistory: PortfolioHistory[];
  riskData: RiskData | null;
  isRiskLoading: boolean;
}

/** Panel identity, destination view, and content are registered together. */
export const PANEL_REGISTRY = {
  market: {
    view: 'dashboard',
    render: (context: DashboardPanelContext) => (
      <MarketDataPanel
        holdings={context.realHoldings}
        onAddBuyRecord={context.addMarketSearchBuyRecord}
      />
    ),
  },
  manager: {
    view: 'dashboard',
    render: (_context: DashboardPanelContext) => <PortfolioManager portfolioType="REAL" />,
  },
  allocation: {
    view: 'dashboard',
    render: (context: DashboardPanelContext) => (
      <PortfolioAllocationChart
        portfolio={context.realHoldings}
        prices={context.prices}
        exchangeRate={context.exchangeRate}
      />
    ),
  },
  recurring: {
    view: 'analysis',
    render: (context: DashboardPanelContext) => (
      <RecurringInvestmentAnalysisPanel
        portfolioId={context.realPortfolioId}
        histories={context.realHistories}
        prices={context.prices}
      />
    ),
  },
  performance: {
    view: 'analysis',
    render: (context: DashboardPanelContext) => (
      <PortfolioPerformanceChart
        portfolio={context.portfolio}
        historicalData={context.historicalData}
        portfolioHistory={context.portfolioHistory}
        holdingHistories={context.realHistories}
        exchangeRate={context.exchangeRate}
        isLoading={context.isRiskLoading}
      />
    ),
  },
  history: {
    view: 'analysis',
    render: (context: DashboardPanelContext) => (
      <PortfolioHistoryPanel history={context.portfolioHistory} />
    ),
  },
  monthly: {
    view: 'analysis',
    render: (context: DashboardPanelContext) => (
      <MonthlyComparisonPanel history={context.portfolioHistory} />
    ),
  },
  guide: {
    view: 'analysis',
    render: (context: DashboardPanelContext) => (
      <PortfolioRiskDiagnostic
        portfolioId={context.realPortfolioId}
        holdings={context.realHoldings}
        prices={context.prices}
        exchangeRate={context.exchangeRate}
        riskData={context.riskData}
        isRiskLoading={context.isRiskLoading}
      />
    ),
  },
} satisfies Record<
  string,
  { view: DashboardView; render: (context: DashboardPanelContext) => ReactNode }
>;

export type PanelId = keyof typeof PANEL_REGISTRY;
export const {
  DEFAULT_PANEL_ORDER,
  DEFAULT_PANEL_ROWS,
  dashboardLayoutReducer,
  isValidPanelRows,
  panelGridPosition,
  readDashboardLayout,
  saveDashboardLayout,
  visiblePanelRows,
} = createDashboardLayout(PANEL_REGISTRY);
