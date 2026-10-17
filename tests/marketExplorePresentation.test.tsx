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

describe('stock detail disclosures', () => {
  const props = {
    selectedStock: stock,
    stockDetail: {
      quote: { symbol: '005930', price: 70000, currency: 'KRW' as const, timestamp: null },
      candles: [],
      insights: {
        fundamentals: null,
        fundamentalsMessage: null,
        news: [],
        newsMessage: null,
        financialStatement: {
          year: 2025,
          basis: 'CFS' as const,
          currency: 'KRW',
          receiptNo: '20260310002820',
          revenue: 1000000000,
          operatingProfit: 100000000,
          netIncome: 80000000,
          assets: 2000000000,
          liabilities: 500000000,
          equity: 1500000000,
        },
        domesticMetricInputs: {
          year: 2025,
          basis: 'CFS' as const,
          eps: 5000,
          bps: 50000,
          roe: 10,
          dividendPerShare: 1000,
        },
      },
    },
    isDetailLoading: false,
    detailError: '',
    portfolioActionNotice: '',
    displayCurrency: 'KRW' as const,
    onClose: vi.fn(),
    onAdd: vi.fn(),
    onRetry: vi.fn(),
  };

  it('orders price, chart, statements, metrics and news; financial sections start collapsed', () => {
    render(<StockDetailDrawer {...props} />);
    const ordered = [
      screen.getByRole('region', { name: '현재가' }),
      screen.getByRole('heading', { name: '주가 흐름' }),
      screen.getByRole('button', { name: /^재무제표/ }),
      screen.getByRole('button', { name: /^재무지표/ }),
      screen.getByRole('heading', { name: '관련 뉴스' }),
    ];
    ordered
      .slice(1)
      .forEach((element, i) =>
        expect(
          ordered[i].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy(),
      );
    expect(ordered[2]).toHaveAttribute('aria-expanded', 'false');
    expect(ordered[3]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('매출액')).not.toBeInTheDocument();
    expect(screen.queryByText('PER')).not.toBeInTheDocument();
  });

  it('opens sections independently by keyboard and click, and resets for another stock', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StockDetailDrawer {...props} />);
    const statement = screen.getByRole('button', { name: /^재무제표/ });
    statement.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('매출액')).toBeVisible();
    expect(screen.getByRole('link', { name: /사업보고서 새 탭에서 보기/ })).toHaveAttribute(
      'href',
      'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260310002820',
    );
    await user.click(screen.getByRole('button', { name: /^재무지표/ }));
    expect(screen.getAllByText('PER')[0]).toBeVisible();
    const method = screen.getByRole('button', { name: '지표 산정 방식' });
    expect(method).toHaveAttribute('aria-expanded', 'false');
    await user.click(method);
    expect(screen.getByText(/현재가 ÷ 연간 기본 주당순이익/)).toBeVisible();
    await user.click(statement);
    expect(screen.queryByText('매출액')).not.toBeInTheDocument();
    expect(screen.getAllByText('PER')[0]).toBeVisible();
    rerender(
      <StockDetailDrawer
        {...props}
        selectedStock={{ ...stock, symbol: '035420', name: 'NAVER' }}
      />,
    );
    expect(screen.getByRole('button', { name: /^재무지표/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows overseas annual statements with native units, fiscal end and SEC source', async () => {
    render(
      <StockDetailDrawer
        {...props}
        selectedStock={{
          ...stock,
          symbol: 'AAPL',
          name: 'Apple',
          market: 'NASDAQ',
          currency: 'USD',
        }}
        stockDetail={{
          ...props.stockDetail,
          insights: {
            ...props.stockDetail.insights,
            domesticMetricInputs: undefined,
            financialStatement: {
              ...props.stockDetail.insights.financialStatement,
              source: 'SEC',
              currency: 'USD',
              receiptNo: null,
              periodStart: '2024-09-29',
              periodEnd: '2025-09-27',
              filedAt: '2025-10-31',
              reportUrl:
                'https://www.sec.gov/Archives/edgar/data/320193/000032019325000001/aapl-20250927.htm',
            },
          },
        }}
      />,
    );
    const trigger = screen.getByRole('button', { name: /재무제표.*2025-09-27.*백만 달러/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.setup().click(trigger);
    expect(screen.getByText('1,000')).toBeVisible();
    expect(screen.getByText(/출처 · SEC · 공시 2025-10-31/)).toBeVisible();
    expect(screen.getByRole('link', { name: /SEC 연간보고서 새 탭/ })).toHaveAttribute(
      'href',
      'https://www.sec.gov/Archives/edgar/data/320193/000032019325000001/aapl-20250927.htm',
    );
    expect(screen.queryByText('출처 · 금융감독원 DART')).not.toBeInTheDocument();
  });
});
