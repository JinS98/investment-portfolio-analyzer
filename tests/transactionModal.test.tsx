import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TransactionModal } from '@features/transaction';
import type { Holding, Portfolio } from '../src/types';

const portfolio: Portfolio = {
  id: 'portfolio-1',
  userId: 'user-1',
  name: '실제 포트폴리오',
  type: 'REAL',
  createdAt: 0,
  updatedAt: 0,
};

const holding: Holding = {
  portfolioId: portfolio.id,
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  quantity: 2,
  averagePrice: 70_000,
  investedAmount: 140_000,
};

describe('transaction dialog', () => {
  it('updates estimated costs, retains a custom fee, and submits a buy', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <TransactionModal
        isOpen
        type="BUY"
        portfolio={portfolio}
        holdings={[holding]}
        preset={{ ticker: holding.ticker, name: holding.name, market: 'KR' }}
        onTypeChange={vi.fn()}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: '거래 단가' }), '100000');
    await user.type(screen.getByRole('textbox', { name: '수량' }), '2');
    const preview = screen.getByText('예상 거래금액').parentElement;
    expect(preview).toHaveTextContent('200,000원');
    expect(preview).toHaveTextContent('200,030원');
    expect(preview).toHaveTextContent('85,000원');
    const costToggle = screen.getByRole('button', {
      name: '수수료·세금 입력 (기본 추정값 적용)',
    });
    expect(costToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(costToggle);
    expect(costToggle).toHaveAttribute('aria-expanded', 'true');
    const fee = screen.getByRole('textbox', { name: '수수료' });
    expect(fee).toHaveValue('30');
    await user.clear(fee);
    await user.type(fee, '50');
    await user.clear(screen.getByRole('textbox', { name: '거래 단가' }));
    await user.type(screen.getByRole('textbox', { name: '거래 단가' }), '200000');
    expect(fee).toHaveValue('50');
    expect(preview).toHaveTextContent('400,000원');
    expect(preview).toHaveTextContent('400,050원');
    expect(preview).toHaveTextContent('135,000원');
    await user.click(screen.getByRole('button', { name: '매수 기록 저장' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: '005930', price: 200_000, quantity: 2, fee: 50 }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('rejects a sale above the held quantity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TransactionModal
        isOpen
        type="SELL"
        portfolio={portfolio}
        holdings={[holding]}
        preset={{ ticker: holding.ticker, name: holding.name, market: 'KR' }}
        onTypeChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: '거래 단가' }), '80000');
    await user.type(screen.getByRole('textbox', { name: '수량' }), '3');
    await user.click(screen.getByRole('button', { name: '매도 기록 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('현재 보유 수량 2 이하');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
