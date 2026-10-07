import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardWidgetLayout } from '../src/pages/Dashboard/DashboardWidgetLayout';
import { createLocalDashboardLayoutRepository } from '../src/pages/Dashboard/layoutRepository';
import {
  DEFAULT_PANEL_ROWS,
  type DashboardPanelContext,
} from '../src/pages/Dashboard/panelRegistry';

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
  it('scrolls toward the page top during a whole-panel drag and drops before the first panel', () => {
    window.localStorage.setItem('dashboard-layout-v3:test-user:dashboard:mode', '"free"');
    render(
      <DashboardWidgetLayout
        view="dashboard"
        userId="test-user"
        context={{} as DashboardPanelContext}
        recurringPanelRef={{ current: null }}
        locked={false}
        editing
      />,
    );
    const market = document.querySelector<HTMLElement>('[data-widget-id="market"]')!;
    const manager = document.querySelector<HTMLElement>('[data-widget-id="manager"]')!;
    const grid = market.parentElement!;
    let scrollY = 600;
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'scrollHeight',
    );
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 3000,
    });
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    const cancelRaf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((options) => {
      scrollY = (options as ScrollToOptions).top ?? scrollY;
    });
    vi.spyOn(grid, 'getBoundingClientRect').mockImplementation(() => {
      const top = 200 - scrollY;
      return {
        x: 0,
        y: top,
        left: 0,
        top,
        right: 1200,
        bottom: top + 1800,
        width: 1200,
        height: 1800,
        toJSON: () => {},
      };
    });
    vi.spyOn(market, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: -400,
      left: 0,
      top: -400,
      right: 1200,
      bottom: 0,
      width: 1200,
      height: 400,
      toJSON: () => {},
    });
    try {
      fireEvent.pointerDown(manager.querySelector('div')!, {
        clientX: 500,
        clientY: 500,
        button: 0,
      });
      fireEvent.pointerMove(window, { clientX: 500, clientY: 10 });
      for (let step = 0; step < 25 && scrollY > 0; step += 1) {
        const [frameId, callback] = frames.entries().next().value!;
        frames.delete(frameId);
        act(() => callback(0));
      }
      expect(scrollY).toBe(0);
      expect(scrollTo).toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('위에 배치');
      fireEvent.pointerUp(window, { clientX: 500, clientY: 10 });
      expect(manager).toHaveStyle({ gridRow: '1 / span 22' });
      expect(market).toHaveStyle({ gridRow: '23 / span 10' });
      expect(frames.size).toBe(0);
    } finally {
      raf.mockRestore();
      cancelRaf.mockRestore();
      scrollTo.mockRestore();
      if (originalScrollY) Object.defineProperty(window, 'scrollY', originalScrollY);
      else Reflect.deleteProperty(window, 'scrollY');
      if (originalScrollHeight)
        Object.defineProperty(document.documentElement, 'scrollHeight', originalScrollHeight);
      else Reflect.deleteProperty(document.documentElement, 'scrollHeight');
    }
  });

  it('visually matches the height of panels in one row and resizes from that height', () => {
    const repository = createLocalDashboardLayoutRepository(window.localStorage);
    const panels = repository.readFree('dashboard', 'test-user', DEFAULT_PANEL_ROWS);
    repository.saveFree(
      'dashboard',
      'test-user',
      panels.map((item) =>
        item.i === 'market'
          ? { ...item, x: 0, y: 0, w: 6 }
          : item.i === 'allocation'
            ? { ...item, x: 6, y: 0, w: 6 }
            : { ...item, x: 0, y: 12, w: 12 },
      ),
    );
    repository.saveMode('dashboard', 'test-user', 'free');
    render(
      <DashboardWidgetLayout
        view="dashboard"
        userId="test-user"
        context={{} as DashboardPanelContext}
        recurringPanelRef={{ current: null }}
        locked={false}
        editing
      />,
    );
    const market = document.querySelector<HTMLElement>('[data-widget-id="market"]')!;
    const allocation = document.querySelector<HTMLElement>('[data-widget-id="allocation"]')!;
    const manager = document.querySelector<HTMLElement>('[data-widget-id="manager"]')!;
    expect(market).toHaveStyle({ gridRow: '1 / span 12' });
    expect(allocation).toHaveStyle({ gridRow: '1 / span 12' });
    expect(allocation.className).toContain('pairedAutoHeightPanel');

    vi.spyOn(market.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 1500,
      width: 1200,
      height: 1500,
      toJSON: () => {},
    });
    const resize = market.querySelectorAll<HTMLButtonElement>('button')[1];
    fireEvent.pointerDown(resize, { clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 340 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 340 });
    expect(market).toHaveStyle({ gridRow: '1 / span 13' });
    expect(allocation).toHaveStyle({ gridRow: '1 / span 13' });
    expect(manager).toHaveStyle({ gridRow: '14 / span 22' });
  });

  it('drops above a panel to reorder, or in its middle to make an equal-width pair', () => {
    window.localStorage.setItem('dashboard-layout-v3:test-user:dashboard:mode', '"free"');
    render(
      <DashboardWidgetLayout
        view="dashboard"
        userId="test-user"
        context={{} as DashboardPanelContext}
        recurringPanelRef={{ current: null }}
        locked={false}
        editing
      />,
    );
    const market = document.querySelector<HTMLElement>('[data-widget-id="market"]')!;
    const manager = document.querySelector<HTMLElement>('[data-widget-id="manager"]')!;
    const allocation = document.querySelector<HTMLElement>('[data-widget-id="allocation"]')!;
    vi.spyOn(market.parentElement!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 1500,
      width: 1200,
      height: 1500,
      toJSON: () => {},
    });
    vi.spyOn(market, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 400,
      width: 1200,
      height: 400,
      toJSON: () => {},
    });
    const handle = manager.querySelector<HTMLButtonElement>('button')!;
    const body = manager.querySelector<HTMLElement>('div')!;
    const contentButton = document.createElement('button');
    body.append(contentButton);
    fireEvent.pointerDown(contentButton, { clientX: 500, clientY: 500, button: 0 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 10 });
    expect(manager).toHaveStyle({ gridRow: '11 / span 22' });
    contentButton.remove();
    fireEvent.pointerDown(body, { clientX: 500, clientY: 500, button: 0 });
    fireEvent.pointerMove(window, { clientX: 503, clientY: 503 });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.pointerMove(window, { clientX: 500, clientY: 10 });
    expect(screen.getByRole('status')).toHaveTextContent('위에 배치');
    expect(manager.className).toContain('freePreviewItem');
    expect(manager).toHaveStyle({ gridRow: '1 / span 22' });
    expect(market).toHaveStyle({ gridRow: '23 / span 10' });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 1600 });
    expect(screen.queryByRole('status')).toBeNull();
    expect(market).toHaveStyle({ gridRow: '1 / span 10' });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 10 });
    expect(screen.queryByRole('status')).toBeNull();
    expect(manager).toHaveStyle({ gridRow: '1 / span 22' });
    expect(market).toHaveStyle({ gridRow: '23 / span 10' });
    expect(allocation).toHaveStyle({ gridRow: '33 / span 12' });

    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: 900, clientY: 200 });
    expect(screen.getByRole('status')).toHaveTextContent('오른쪽에 1:1 배치');
    expect(market).toHaveStyle({ gridColumn: '1 / span 6' });
    expect(manager).toHaveStyle({ gridColumn: '7 / span 6' });
    fireEvent.pointerUp(window, { clientX: 900, clientY: 200 });
    expect(market).toHaveStyle({ gridColumn: '1 / span 6', gridRow: '1 / span 22' });
    expect(manager).toHaveStyle({ gridColumn: '7 / span 6', gridRow: '1 / span 22' });
    expect(allocation).toHaveStyle({ gridRow: '23 / span 12' });
    expect(manager.className).toContain('pairedAutoHeightPanel');

    vi.spyOn(market, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 600,
      bottom: 400,
      width: 600,
      height: 400,
      toJSON: () => {},
    });
    const allocationHandle = allocation.querySelector<HTMLButtonElement>('button')!;
    fireEvent.pointerDown(allocationHandle, { clientX: 500, clientY: 900 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 200 });
    expect(screen.getByRole('status')).toHaveTextContent('오른쪽에 1:1:1 배치');
    expect(market).toHaveStyle({ gridColumn: '1 / span 4' });
    expect(allocation).toHaveStyle({ gridColumn: '5 / span 4' });
    expect(manager).toHaveStyle({ gridColumn: '9 / span 4' });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 200 });
    expect(market).toHaveStyle({ gridRow: '1 / span 22' });
    expect(allocation).toHaveStyle({ gridRow: '1 / span 22' });
    expect(manager).toHaveStyle({ gridRow: '1 / span 22' });
  });

  it('only exposes handles in edit mode, resizes a free widget, and restores its saved layout', async () => {
    const user = userEvent.setup();
    const props = {
      view: 'dashboard' as const,
      userId: 'test-user',
      context: {} as DashboardPanelContext,
      recurringPanelRef: { current: null },
      locked: false,
    };
    const mounted = render(<DashboardWidgetLayout {...props} editing={false} />);
    expect(screen.queryByRole('button', { name: '시장 데이터 이동' })).toBeNull();
    mounted.rerender(<DashboardWidgetLayout {...props} editing />);
    expect(screen.getByRole('button', { name: '시장 데이터 이동' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '자유 배치' }));
    expect(screen.getByRole('checkbox', { name: '평가손익' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '수익률' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: '총 자산 이동' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: '총 자산' }));
    expect(screen.getByRole('button', { name: '총 자산 이동' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '총 자산' }));
    expect(screen.queryByRole('button', { name: '총 자산 이동' })).toBeNull();
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
    mounted.rerender(<DashboardWidgetLayout {...props} editing={false} />);
    expect(screen.queryByRole('button', { name: '시장 데이터 이동' })).toBeNull();
    mounted.unmount();
    render(<DashboardWidgetLayout {...props} editing />);
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

  it('resizes the portfolio panel to its content and moves panels below it', async () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    window.localStorage.setItem('dashboard-layout-v3:test-user:dashboard:mode', '"free"');
    try {
      render(
        <DashboardWidgetLayout
          view="dashboard"
          userId="test-user"
          context={{} as DashboardPanelContext}
          recurringPanelRef={{ current: null }}
          locked={false}
          editing
        />,
      );
      const content = screen.getByText('내 포트폴리오 내용');
      let height = 1400;
      Object.defineProperty(content, 'scrollHeight', {
        configurable: true,
        get: () => height,
      });
      const manager = screen.getByRole('button', { name: '내 포트폴리오 이동' }).parentElement;
      const allocation = screen.getByRole('button', { name: '자산 비중 이동' }).parentElement;

      act(() => callbacks[0]([], {} as ResizeObserver));
      expect(manager).toHaveStyle({ gridRow: '11 / span 36' });
      expect(allocation).toHaveStyle({ gridRow: '47 / span 12' });

      height = 500;
      act(() => callbacks[0]([], {} as ResizeObserver));
      expect(manager).toHaveStyle({ gridRow: '11 / span 13' });
      expect(allocation).toHaveStyle({ gridRow: '24 / span 12' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fits the allocation panel and pulls a distant portfolio beneath the two top panels', () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    const repository = createLocalDashboardLayoutRepository(window.localStorage);
    const panels = repository.readFree('dashboard', 'test-user', DEFAULT_PANEL_ROWS);
    repository.saveFree(
      'dashboard',
      'test-user',
      panels.map((item) =>
        item.i === 'market'
          ? { ...item, x: 0, y: 0, w: 6 }
          : item.i === 'allocation'
            ? { ...item, x: 6, y: 0, w: 6 }
            : { ...item, x: 0, y: 70, w: 12 },
      ),
    );
    repository.saveMode('dashboard', 'test-user', 'free');
    try {
      render(
        <DashboardWidgetLayout
          view="dashboard"
          userId="test-user"
          context={{} as DashboardPanelContext}
          recurringPanelRef={{ current: null }}
          locked={false}
          editing
        />,
      );
      const allocation = screen.getByRole('button', { name: '자산 비중 이동' }).parentElement!;
      const managerHandle = screen.getByRole('button', { name: '내 포트폴리오 이동' });
      const manager = managerHandle.parentElement;
      const content = allocation.querySelector('div')?.firstElementChild;
      expect(content).toBeInstanceOf(HTMLElement);
      Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 1400 });

      vi.spyOn(allocation.parentElement!, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 3000,
        width: 1200,
        height: 3000,
        toJSON: () => {},
      });
      vi.spyOn(allocation, 'getBoundingClientRect').mockReturnValue({
        x: 600,
        y: 0,
        left: 600,
        top: 0,
        right: 1200,
        bottom: 400,
        width: 600,
        height: 400,
        toJSON: () => {},
      });
      fireEvent.pointerDown(managerHandle, { clientX: 500, clientY: 500 });
      fireEvent.pointerMove(window, { clientX: 900, clientY: 390 });
      fireEvent.pointerUp(window, { clientX: 900, clientY: 390 });
      expect(manager).toHaveStyle({ gridRow: '13 / span 22' });

      act(() => callbacks[1]([], {} as ResizeObserver));
      expect(allocation).toHaveStyle({ gridRow: '1 / span 36' });
      const market = document.querySelector<HTMLElement>('[data-widget-id="market"]')!;
      expect(market).toHaveStyle({ gridRow: '1 / span 36' });
      expect(manager).toHaveStyle({ gridRow: '37 / span 22' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
