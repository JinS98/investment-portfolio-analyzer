import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTransactionFilters } from '@features/transaction-history';
import { TransactionMobileList } from '@features/transaction-history';
import type { HoldingHistory } from '../src/types';

const manual: HoldingHistory = {
  id: 'manual-1',
  portfolioId: 'portfolio-1',
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
  date: '2026-09-01',
  createdAt: 1,
  source: 'MANUAL',
};

const recurring: HoldingHistory = {
  ...manual,
  id: 'recurring-1',
  date: '2026-10-01',
  source: 'RECURRING',
  recurringRuleId: 'rule-1',
  recurringRuleName: '매주 삼성전자',
  recurringExecutionStatus: 'PENDING',
};

afterEach(() => sessionStorage.removeItem('transaction-history-recurring-rule-id'));

describe('transaction history filters', () => {
  it('opens a recurring rule deep link and restores all histories when cleared', () => {
    sessionStorage.setItem('transaction-history-recurring-rule-id', 'rule-1');
    const { result } = renderHook(() => useTransactionFilters([manual, recurring]));
    expect(result.current.filteredHistories.map((history) => history.id)).toEqual([recurring.id]);
    expect(result.current.selectedRecurringRuleName).toBe('매주 삼성전자');

    act(() => result.current.clearRecurringRuleFilter());
    expect(result.current.filteredHistories.map((history) => history.id)).toEqual([
      recurring.id,
      manual.id,
    ]);
    expect(sessionStorage.getItem('transaction-history-recurring-rule-id')).toBeNull();
    act(() => result.current.setType('BUY'));
    act(() => result.current.setFromDate('2026-09-15'));
    expect(result.current.filteredHistories.map((history) => history.id)).toEqual([recurring.id]);
  });

  it('offers confirmation and deletion actions in the mobile list', async () => {
    const onConfirm = vi.fn();
    const onDeleteHistory = vi.fn();
    render(
      <TransactionMobileList
        histories={[recurring]}
        displayCurrency="KRW"
        isSaving={false}
        deletingId={null}
        showConfirm
        showDelete
        onConfirm={onConfirm}
        onDeleteHistory={onDeleteHistory}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByText('체결 확인 필요')).toBeInTheDocument();
    expect(screen.getByText('거래금액')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /거래 상세 보기/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /거래 상세 접기/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.click(screen.getByRole('button', { name: '체결 확인' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledWith(recurring);
    expect(onDeleteHistory).toHaveBeenCalledWith(recurring);
  });
});
