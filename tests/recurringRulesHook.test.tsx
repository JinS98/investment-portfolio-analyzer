import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecurringRules } from '@features/recurring-investment';
import type { Portfolio, RecurringInvestmentRule } from '../src/types';

const service = vi.hoisted(() => ({
  loadRules: vi.fn(),
  loadExecutions: vi.fn(),
  setStatus: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../src/services/portfolioLedgerService', () => ({
  loadRecurringInvestmentRules: service.loadRules,
  loadRecurringInvestmentExecutions: service.loadExecutions,
  setRecurringInvestmentRuleStatus: service.setStatus,
  executeDueRecurringInvestmentRule: service.execute,
}));

const portfolio: Portfolio = {
  id: 'portfolio-1',
  userId: 'user-1',
  name: '실제 포트폴리오',
  type: 'REAL',
  createdAt: 0,
  updatedAt: 0,
};

const rule: RecurringInvestmentRule = {
  id: 'rule-1',
  portfolioId: portfolio.id,
  portfolioType: 'REAL',
  ticker: '005930',
  name: '삼성전자',
  market: 'KR',
  quantity: 1,
  frequency: 'WEEKLY',
  weeklyDay: 1,
  startDate: '2026-10-01',
  status: 'PAUSED',
  createdAt: 0,
  updatedAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  service.loadRules.mockResolvedValue([rule]);
  service.loadExecutions.mockResolvedValue([]);
});

describe('useRecurringRules', () => {
  it('executes due active rules once after loading them', async () => {
    const activeRule = { ...rule, status: 'ACTIVE' as const };
    service.loadRules.mockResolvedValue([activeRule]);
    service.execute.mockResolvedValue({ rule: activeRule, executedCount: 1 });
    const reloadLedgers = vi.fn().mockResolvedValue(undefined);
    const onNotice = vi.fn();
    const { rerender } = renderHook(() =>
      useRecurringRules({ userId: 'user-1', portfolio, reloadLedgers, onNotice }),
    );
    await waitFor(() => expect(reloadLedgers).toHaveBeenCalledWith('user-1'));
    rerender();
    expect(service.execute).toHaveBeenCalledTimes(1);
    expect(service.execute).toHaveBeenCalledWith('user-1', rule.id, portfolio.id);
    expect(onNotice).toHaveBeenCalledWith('적립식 투자 1건을 거래일 종가로 반영했습니다.');
  });

  it('loads the active portfolio, changes a rule status, and retries an execution', async () => {
    const onNotice = vi.fn();
    const reloadLedgers = vi.fn().mockResolvedValue(undefined);
    const activeRule = { ...rule, status: 'ACTIVE' as const };
    service.setStatus.mockResolvedValue(activeRule);
    service.execute.mockResolvedValue({ rule: activeRule, executedCount: 1 });
    const { result } = renderHook(() =>
      useRecurringRules({ userId: 'user-1', portfolio, reloadLedgers, onNotice }),
    );

    await waitFor(() => expect(result.current.rules).toEqual([rule]));
    expect(service.execute).not.toHaveBeenCalled();

    await act(async () => result.current.updateStatus(rule, 'ACTIVE'));
    expect(result.current.rules).toEqual([activeRule]);
    expect(onNotice).toHaveBeenCalledWith('적립식 투자 규칙을 재개했습니다.');

    await act(async () => result.current.retry(activeRule));
    expect(service.execute).toHaveBeenCalledWith('user-1', rule.id, portfolio.id, {
      triggeredByRetry: true,
    });
    expect(reloadLedgers).toHaveBeenCalledWith('user-1');
    expect(onNotice).toHaveBeenCalledWith('적립식 투자 1건을 반영했습니다.');
  });
});
