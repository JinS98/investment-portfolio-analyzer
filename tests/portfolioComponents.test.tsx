import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createPortfolioManagerViewModel,
  ColumnVisibilityMenu,
  HoldingsSection,
  HOLDING_COLUMN_OPTIONS,
} from '@features/portfolio-management';
import { RecurringInvestmentSection } from '@features/recurring-investment';
import { PortfolioHeader, PortfolioSummary } from '@features/portfolio-management';
import type { Holding, MarketType, Portfolio, RecurringInvestmentRule } from '../src/types';
import type { HoldingColumnId } from '@features/portfolio-management';

const holding: Holding = {
  portfolioId: 'portfolio-1',
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  quantity: 2,
  averagePrice: 70_000,
  investedAmount: 140_000,
};

const portfolio: Portfolio = {
  id: 'portfolio-1',
  userId: 'user-1',
  name: '실제 포트폴리오',
  type: 'REAL',
  createdAt: 0,
  updatedAt: 0,
};

describe('portfolio header and summary', () => {
  it('shows market counts and delegates portfolio switching', async () => {
    const onSelectPortfolio = vi.fn();
    render(
      <PortfolioHeader
        activePortfolio={portfolio}
        portfolios={[portfolio, { ...portfolio, id: 'portfolio-2', name: '두 번째 포트폴리오' }]}
        activePortfolioId={portfolio.id}
        holdingsCount={1}
        krCount={1}
        usCount={0}
        onSelectPortfolio={onSelectPortfolio}
      />,
    );
    expect(screen.getByText('국내 1개 · 미국 0개')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', { name: '두 번째 포트폴리오' }));
    expect(onSelectPortfolio).toHaveBeenCalledWith('portfolio-2');
  });

  it('renders the existing unavailable summary message', () => {
    const viewModel = {
      ...createPortfolioManagerViewModel([holding], [], {}, null, 'KRW'),
      combinedSummary: null,
      isSummaryCurrencyAvailable: false,
      summaryUnavailableMessage: '시세 미조회',
    };
    render(<PortfolioSummary viewModel={viewModel} displayCurrency="KRW" />);
    expect(screen.getByLabelText('포트폴리오 요약')).toHaveTextContent('시세 미조회');
  });
});

describe('portfolio management presentation', () => {
  it('renders holdings from fixture props and opens a buy transaction', async () => {
    const user = userEvent.setup();
    const onBuy = vi.fn();
    render(
      <HoldingsSection
        groups={[{ market: 'KR', holdings: [holding] }]}
        prices={{ '005930': 80_000 }}
        visibleColumnsByMarket={{
          KR: HOLDING_COLUMN_OPTIONS.map((column) => column.id),
          US: HOLDING_COLUMN_OPTIONS.map((column) => column.id),
        }}
        money={(value) => `${value.toLocaleString('ko-KR')}원`}
        menuMarket={null}
        onMenuMarketChange={vi.fn()}
        onToggleColumn={vi.fn()}
        onResetColumns={vi.fn()}
        onBuy={onBuy}
      />,
    );
    expect(screen.getAllByText('삼성전자').length).toBeGreaterThan(0);
    expect(screen.getAllByText('160,000원').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '삼성전자 매수 기록 추가' })[0]);
    expect(onBuy).toHaveBeenCalledWith(holding, 80_000);
  });

  it('changes only the market whose settings button was used', async () => {
    const user = userEvent.setup();
    const usHolding: Holding = {
      ...holding,
      market: 'US',
      ticker: 'AAPL',
      name: '애플',
    };
    function MarketColumnsFixture() {
      const [menuMarket, setMenuMarket] = useState<MarketType | null>(null);
      const [columns, setColumns] = useState<Record<MarketType, HoldingColumnId[]>>({
        KR: HOLDING_COLUMN_OPTIONS.map((column) => column.id),
        US: HOLDING_COLUMN_OPTIONS.map((column) => column.id),
      });
      return (
        <HoldingsSection
          groups={[
            { market: 'KR', holdings: [holding] },
            { market: 'US', holdings: [usHolding] },
          ]}
          prices={{}}
          visibleColumnsByMarket={columns}
          money={(value) => String(value)}
          menuMarket={menuMarket}
          onMenuMarketChange={setMenuMarket}
          onToggleColumn={(market, column) =>
            setColumns((current) => ({
              ...current,
              [market]: current[market].filter((item) => item !== column),
            }))
          }
          onResetColumns={(market) =>
            setColumns((current) => ({
              ...current,
              [market]: HOLDING_COLUMN_OPTIONS.map((column) => column.id),
            }))
          }
          onBuy={vi.fn()}
        />
      );
    }
    render(<MarketColumnsFixture />);
    await user.click(screen.getByRole('button', { name: '국내 주식 표시 항목 설정' }));
    await user.click(screen.getByRole('checkbox', { name: '평단가' }));

    const [domesticTable, usTable] = screen.getAllByRole('table');
    expect(within(domesticTable).queryByRole('columnheader', { name: '평단가' })).toBeNull();
    expect(within(usTable).getByRole('columnheader', { name: '평단가' })).toBeInTheDocument();
  });

  it('keeps the column menu open for its controls and closes it on outside click or Escape', async () => {
    const user = userEvent.setup();
    const onToggleColumn = vi.fn();
    function MenuFixture() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <ColumnVisibilityMenu
            open={open}
            visibleColumns={['averagePrice']}
            onToggleOpen={() => setOpen((value) => !value)}
            onClose={() => setOpen(false)}
            onToggleColumn={onToggleColumn}
            onReset={vi.fn()}
          />
          <button type="button">메뉴 밖</button>
        </>
      );
    }
    render(<MenuFixture />);

    await user.click(screen.getByRole('button', { name: '표시 항목 설정' }));
    expect(screen.getByText('표시 항목')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '평단가' }));
    expect(onToggleColumn).toHaveBeenCalledWith('averagePrice');
    expect(screen.getByText('표시 항목')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '메뉴 밖' }));
    expect(screen.queryByText('표시 항목')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '표시 항목 설정' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText('표시 항목')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '표시 항목 설정' })).toHaveFocus();
  });
});

describe('recurring investment presentation', () => {
  it('renders a rule and delegates status changes without store access', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const rule: RecurringInvestmentRule = {
      id: 'rule-1',
      portfolioId: 'portfolio-1',
      portfolioType: 'REAL',
      ticker: '005930',
      name: '삼성전자',
      market: 'KR',
      quantity: 1,
      frequency: 'WEEKLY',
      weeklyDay: 1,
      startDate: '2026-10-01',
      status: 'ACTIVE',
      createdAt: 1,
      updatedAt: 1,
    };
    const { rerender } = render(
      <RecurringInvestmentSection
        rules={[rule]}
        histories={[]}
        displayCurrency="KRW"
        failureStates={new Map()}
        progress={null}
        updatingRuleId={null}
        openStatusRuleId={null}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onHistory={vi.fn()}
        onStatusMenu={vi.fn()}
        onStatusChange={onStatusChange}
        onRetry={vi.fn()}
        onAnalysis={vi.fn()}
      />,
    );
    expect(screen.getByText('매주 월요일')).toBeInTheDocument();
    rerender(
      <RecurringInvestmentSection
        rules={[rule]}
        histories={[]}
        displayCurrency="KRW"
        failureStates={new Map()}
        progress={null}
        updatingRuleId={null}
        openStatusRuleId="rule-1"
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onHistory={vi.fn()}
        onStatusMenu={vi.fn()}
        onStatusChange={onStatusChange}
        onRetry={vi.fn()}
        onAnalysis={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('menuitem', { name: '일시 정지' }));
    expect(onStatusChange).toHaveBeenCalledWith(rule, 'PAUSED');
  });
});
