import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioAlertSummary } from '@widgets/dashboard-panels';
import type { HoldingHistory } from '../src/types';

vi.mock('../src/services/portfolioLedgerService', () => ({
  loadRecurringInvestmentRules: vi.fn().mockResolvedValue([]),
}));

const pendingHistory: HoldingHistory = {
  id: 'record-1',
  portfolioId: 'portfolio-1',
  portfolioType: 'REAL',
  ticker: '005930',
  market: 'KR',
  type: 'BUY',
  price: 100,
  quantity: 1,
  grossAmount: 100,
  fee: 0,
  tax: 0,
  realizedPnL: 0,
  date: '2026-10-07',
  createdAt: 1,
  source: 'RECURRING',
  recurringExecutionStatus: 'PENDING',
};

const props = {
  holdings: [],
  histories: [pendingHistory, { ...pendingHistory, id: 'record-2' }],
  portfolioHistory: [],
  prices: {},
  exchangeRate: null,
  lastUpdated: null,
  failedTickers: [],
  userId: 'user-1',
  portfolioId: 'portfolio-1',
};

describe('portfolio alert summary', () => {
  it('keeps action counts visible while details are collapsed, then expands the existing actions', async () => {
    const user = userEvent.setup();
    render(<PortfolioAlertSummary {...props} />);

    expect(screen.getAllByText('체결 확인 2건')[0].closest('[aria-hidden="true"]')).toBeNull();
    const toggle = screen.getByRole('button', { name: '상세 보기 2건' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('portfolio-alert-details')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    await user.click(toggle);
    expect(screen.getByRole('button', { name: '접기 2건' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(document.getElementById('portfolio-alert-details')).toHaveAttribute(
      'aria-hidden',
      'false',
    );
    expect(screen.getByText('오늘 자동 반영')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '거래 내역 보기' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '접기 2건' }));
    expect(document.getElementById('portfolio-alert-details')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('shows a compact empty state without occupying space for status cards', () => {
    render(<PortfolioAlertSummary {...props} histories={[]} />);
    expect(screen.getByText('확인할 알림 없음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상세 보기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(document.getElementById('portfolio-alert-details')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('names a failed price update in the collapsed summary', () => {
    render(<PortfolioAlertSummary {...props} histories={[]} failedTickers={['005930']} />);

    expect(screen.getByText('현재가 갱신 실패 1종목')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상세 보기 1건' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
