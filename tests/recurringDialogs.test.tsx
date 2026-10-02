import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecurringExecutionConfirmModal } from '../src/components/RecurringExecutionConfirmModal/RecurringExecutionConfirmModal';
import { RecurringInvestmentModal } from '../src/components/RecurringInvestmentModal/RecurringInvestmentModal';
import type { HoldingHistory, Portfolio } from '../src/types';

const portfolio: Portfolio = {
  id: 'portfolio-1',
  userId: 'user-1',
  name: '실제 포트폴리오',
  type: 'REAL',
  createdAt: 0,
  updatedAt: 0,
};

const history: HoldingHistory = {
  id: 'history-1',
  portfolioId: portfolio.id,
  portfolioType: 'REAL',
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  type: 'BUY',
  price: 70_000,
  quantity: 1,
  grossAmount: 70_000,
  fee: 0,
  tax: 0,
  realizedPnL: 0,
  date: '2026-10-01',
  createdAt: 0,
};

describe('recurring dialogs', () => {
  it('closes the investment rule dialog with Escape', async () => {
    const onClose = vi.fn();
    render(
      <RecurringInvestmentModal
        isOpen
        userId="user-1"
        portfolio={portfolio}
        onClose={onClose}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: '적립식 투자 설정' })).toBeInTheDocument();
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the confirmation dialog open while saving', async () => {
    const onClose = vi.fn();
    render(
      <RecurringExecutionConfirmModal
        history={history}
        isSaving
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: '자동매수 체결 확인' })).toBeInTheDocument();
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
