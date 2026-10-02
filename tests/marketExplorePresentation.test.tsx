import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarketIndicatorSection } from '../src/pages/MarketExplore/MarketIndicatorSection';
import { MarketStockList } from '../src/pages/MarketExplore/MarketStockList';
import { StockDetailDrawer } from '../src/pages/MarketExplore/StockDetailDrawer';
import type { MarketExploreStock } from '../src/services/marketExploreService';

const stock: MarketExploreStock = {
  symbol: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  rank: 1,
  currency: 'KRW',
  price: 70_000,
  changeRate: 0.02,
  tradingAmount: 1_000_000,
};

describe('market explore presentation', () => {
  it('opens an indicator and closes its detail dialog', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const props = {
      indicators: [],
      intradayIndicators: {},
      selectedIndicator: 'KOSPI' as const,
      indicatorCandles: [],
      displayCurrency: 'KRW' as const,
      onSelect,
      onClose,
    };
    const { rerender } = render(<MarketIndicatorSection {...props} isDialogOpen={false} />);
    await user.click(screen.getByRole('button', { name: /코스피/ }));
    expect(onSelect).toHaveBeenCalledWith('KOSPI');
    rerender(<MarketIndicatorSection {...props} isDialogOpen />);
    expect(screen.getByRole('dialog', { name: /코스피 최근 30일/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '지수 차트 닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('delegates a stock selection from the market list', async () => {
    const onSelectStock = vi.fn();
    render(
      <MarketStockList
        query=""
        onQueryChange={vi.fn()}
        isSearching={false}
        filter="KR"
        onFilterChange={vi.fn()}
        error=""
        isLoading={false}
        visibleStocks={[stock]}
        displayCurrency="KRW"
        onSelectStock={onSelectStock}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '삼성전자 005930 상세 보기' }));
    expect(onSelectStock).toHaveBeenCalledWith(stock);
  });

  it('shows selected stock detail and delegates the buy action', async () => {
    const onAdd = vi.fn();
    render(
      <StockDetailDrawer
        selectedStock={stock}
        stockDetail={null}
        isDetailLoading
        detailError=""
        portfolioActionNotice=""
        displayCurrency="KRW"
        onClose={vi.fn()}
        onAdd={onAdd}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: '삼성전자' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '+ 담기' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
