import type { ReactNode } from 'react';
import {
  PortfolioManager,
  type createPortfolioManagerViewModel,
} from '@features/portfolio-management';
import {
  MarketDataPanel,
  PortfolioAllocationChart,
  PortfolioPerformanceChart,
  PortfolioRiskDiagnostic,
  PortfolioHistoryPanel,
  MonthlyComparisonPanel,
  RecurringInvestmentAnalysisPanel,
} from '@widgets/dashboard-panels';
import {
  createDashboardLayout,
  type DashboardView,
  type WidgetSize,
} from '@features/dashboard-layout';
import type { DisplayCurrency } from '@shared/lib';
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
  summaryViewModel: ReturnType<typeof createPortfolioManagerViewModel>;
  summaryCurrency: DisplayCurrency;
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
    title: '시장 데이터',
    size: { minW: 4, minH: 7, defaultH: 10 },
    render: (context: DashboardPanelContext) => (
      <MarketDataPanel
        holdings={context.realHoldings}
        onAddBuyRecord={context.addMarketSearchBuyRecord}
      />
    ),
  },
  manager: {
    view: 'dashboard',
    title: '내 포트폴리오',
    size: { minW: 6, minH: 12, defaultH: 22 },
    render: (_context: DashboardPanelContext) => <PortfolioManager portfolioType="REAL" />,
  },
  allocation: {
    view: 'dashboard',
    title: '자산 비중',
    size: { minW: 4, minH: 8, defaultH: 12 },
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
    title: '적립식 투자 분석',
    size: { minW: 4, minH: 8, defaultH: 12 },
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
    title: '투자 성과',
    size: { minW: 6, minH: 10, defaultH: 15 },
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
    title: '포트폴리오 이력',
    size: { minW: 4, minH: 9, defaultH: 15 },
    render: (context: DashboardPanelContext) => (
      <PortfolioHistoryPanel history={context.portfolioHistory} />
    ),
  },
  monthly: {
    view: 'analysis',
    title: '월별 비교',
    size: { minW: 4, minH: 8, defaultH: 12 },
    render: (context: DashboardPanelContext) => (
      <MonthlyComparisonPanel history={context.portfolioHistory} />
    ),
  },
  guide: {
    view: 'analysis',
    title: '리스크 진단',
    size: { minW: 6, minH: 10, defaultH: 16 },
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
  {
    view: DashboardView;
    title: string;
    size: WidgetSize;
    render: (context: DashboardPanelContext) => ReactNode;
  }
>;

export type PanelId = keyof typeof PANEL_REGISTRY;
export const SUMMARY_WIDGETS = {
  accountValue: { title: '총 자산', size: { minW: 3, minH: 2, defaultH: 3 } },
  profitAmount: { title: '평가손익', size: { minW: 3, minH: 2, defaultH: 3 } },
  profitRate: { title: '수익률', size: { minW: 3, minH: 2, defaultH: 3 } },
} satisfies Record<string, { title: string; size: WidgetSize }>;
export type WidgetId = PanelId | keyof typeof SUMMARY_WIDGETS;
export const PANEL_SIZES = Object.fromEntries(
  Object.entries(PANEL_REGISTRY).map(([id, panel]) => [id, panel.size]),
) as Record<PanelId, WidgetSize>;
export const WIDGET_SIZES: Record<WidgetId, WidgetSize> = {
  ...PANEL_SIZES,
  accountValue: SUMMARY_WIDGETS.accountValue.size,
  profitAmount: SUMMARY_WIDGETS.profitAmount.size,
  profitRate: SUMMARY_WIDGETS.profitRate.size,
};
export const widgetTitle = (id: WidgetId): string =>
  id in SUMMARY_WIDGETS
    ? SUMMARY_WIDGETS[id as keyof typeof SUMMARY_WIDGETS].title
    : PANEL_REGISTRY[id as PanelId].title;
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

export const freeWidgetRows = (rows: ReturnType<typeof visiblePanelRows>, view: DashboardView) =>
  visiblePanelRows(rows, view).flatMap((row) =>
    view === 'dashboard' && row.ids.includes('manager')
      ? [{ ids: ['accountValue', 'profitAmount'], split: 50 }, { ids: ['profitRate'] }, row]
      : [row],
  ) as { ids: WidgetId[]; split?: number }[];
