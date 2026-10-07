import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardWidgetLayout } from '../src/pages/Dashboard/DashboardWidgetLayout';
import type { DashboardPanelContext } from '../src/pages/Dashboard/panelRegistry';

vi.mock('@features/portfolio-management', () => ({
  PortfolioManager: () => <div>내 포트폴리오 내용</div>,
  PortfolioSummaryMetric: ({ metric }: { metric: string }) => <div>{metric} 내용</div>,
}));

vi.mock('@widgets/dashboard-panels', () => {
  const Panel = () => <div>패널 내용</div>;
  return {
    MarketDataPanel: Panel,
    PortfolioAllocationChart: Panel,
    PortfolioPerformanceChart: Panel,
    PortfolioRiskDiagnostic: Panel,
    PortfolioHistoryPanel: Panel,
    MonthlyComparisonPanel: Panel,
    RecurringInvestmentAnalysisPanel: Panel,
  };
});

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false }),
  });
});

describe('dashboard widget editor', () => {
  it('only exposes handles in edit mode, resizes a free widget, and restores its saved layout', async () => {
    const user = userEvent.setup();
    const props = {
      view: 'dashboard' as const,
      userId: 'test-user',
      context: {} as DashboardPanelContext,
      recurringPanelRef: { current: null },
      locked: false,
    };
    const mounted = render(<DashboardWidgetLayout {...props} />);
    expect(screen.queryByRole('button', { name: '시장 데이터 이동' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '레이아웃 편집' }));
    expect(screen.getByRole('button', { name: '시장 데이터 이동' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '자유 배치' }));
    expect(screen.getByRole('button', { name: '총 자산 이동' })).toBeInTheDocument();
    const resize = screen.getByRole('button', { name: '시장 데이터 크기 조절' });
    const panel = resize.parentElement!;
    const grid = panel.parentElement!;
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 1000,
      width: 1200,
      height: 1000,
      toJSON: () => {},
    });
    fireEvent.pointerDown(resize, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 580 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 580 });
    expect(panel).toHaveStyle({ gridColumn: '1 / span 11', gridRow: '1 / span 12' });
    await user.click(screen.getByRole('button', { name: '편집 완료' }));
    expect(screen.queryByRole('button', { name: '시장 데이터 이동' })).toBeNull();
    mounted.unmount();
    render(<DashboardWidgetLayout {...props} />);
    await user.click(screen.getByRole('button', { name: '레이아웃 편집' }));
    expect(screen.getByRole('button', { name: '자유 배치' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '시장 데이터 크기 조절' }).parentElement).toHaveStyle(
      {
        gridColumn: '1 / span 11',
        gridRow: '1 / span 12',
      },
    );
  });
});
