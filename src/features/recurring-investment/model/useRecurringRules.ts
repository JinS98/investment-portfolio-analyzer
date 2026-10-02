import { useEffect, useMemo, useRef, useState } from 'react';
import {
  executeDueRecurringInvestmentRule,
  loadRecurringInvestmentExecutions,
  loadRecurringInvestmentRules,
  setRecurringInvestmentRuleStatus,
} from '../../../services/portfolioLedgerService';
import type {
  Portfolio,
  RecurringInvestmentExecution,
  RecurringInvestmentRule,
} from '../../../types';
import { getRecurringFailureStates } from '../../../utils/recurringExecution';

interface UseRecurringRulesOptions {
  userId?: string;
  portfolio: Portfolio | null;
  reloadLedgers: (userId?: string) => Promise<void>;
  onNotice: (message: string) => void;
}

export function useRecurringRules({
  userId,
  portfolio,
  reloadLedgers,
  onNotice,
}: UseRecurringRulesOptions) {
  const [ruleData, setRuleData] = useState<{
    portfolioId: string | null;
    rules: RecurringInvestmentRule[];
  }>({ portfolioId: null, rules: [] });
  const [executions, setExecutions] = useState<RecurringInvestmentExecution[]>([]);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [updatingRuleId, setUpdatingRuleId] = useState<string | null>(null);
  const [openStatusRuleId, setOpenStatusRuleId] = useState<string | null>(null);
  const executedPortfolioRef = useRef<string | null>(null);
  const portfolioId = portfolio?.id ?? null;
  const rules = ruleData.portfolioId === portfolioId ? ruleData.rules : [];
  const failureStates = useMemo(() => getRecurringFailureStates(executions), [executions]);

  const mergeRule = (rule: RecurringInvestmentRule) => {
    setRuleData((current) =>
      current.portfolioId === rule.portfolioId
        ? {
            ...current,
            rules: current.rules.some((item) => item.id === rule.id)
              ? current.rules.map((item) => (item.id === rule.id ? rule : item))
              : [...current.rules, rule],
          }
        : current,
    );
  };
  const removeRule = (ruleId: string) =>
    setRuleData((current) => ({
      ...current,
      rules: current.rules.filter((item) => item.id !== ruleId),
    }));
  const allowAutomaticExecution = () => {
    executedPortfolioRef.current = null;
  };

  const updateStatus = async (rule: RecurringInvestmentRule, status: 'ACTIVE' | 'PAUSED') => {
    if (!userId) return;
    setUpdatingRuleId(rule.id);
    try {
      mergeRule(await setRecurringInvestmentRuleStatus(userId, rule.portfolioId, rule.id, status));
      onNotice(
        status === 'ACTIVE'
          ? '적립식 투자 규칙을 재개했습니다.'
          : '적립식 투자 규칙을 일시 정지했습니다.',
      );
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : '적립식 투자 규칙 상태를 변경하지 못했습니다.',
      );
    } finally {
      setUpdatingRuleId(null);
      setOpenStatusRuleId(null);
    }
  };

  const retry = async (rule: RecurringInvestmentRule) => {
    if (!userId || !portfolio) return;
    setUpdatingRuleId(rule.id);
    try {
      const result = await executeDueRecurringInvestmentRule(userId, rule.id, portfolio.id, {
        triggeredByRetry: true,
      });
      if (result.rule) mergeRule(result.rule);
      if (result.executedCount) await reloadLedgers(userId);
      setExecutions(await loadRecurringInvestmentExecutions(userId, portfolio.id));
      onNotice(
        result.executedCount
          ? `적립식 투자 ${result.executedCount}건을 반영했습니다.`
          : '반영할 예정 매수가 없습니다.',
      );
    } catch (error) {
      setExecutions(await loadRecurringInvestmentExecutions(userId, portfolio.id));
      onNotice(error instanceof Error ? error.message : '적립식 투자 자동 반영에 실패했습니다.');
    } finally {
      setUpdatingRuleId(null);
    }
  };

  useEffect(() => {
    let active = true;
    if (!userId || !portfolioId)
      return () => {
        active = false;
      };
    void Promise.all([
      loadRecurringInvestmentRules(userId, portfolioId),
      loadRecurringInvestmentExecutions(userId, portfolioId),
    ])
      .then(([loadedRules, loadedExecutions]) => {
        if (active) {
          setRuleData({ portfolioId, rules: loadedRules });
          setExecutions(loadedExecutions);
        }
      })
      .catch((error: unknown) => {
        if (active)
          onNotice(
            error instanceof Error ? error.message : '적립식 투자 규칙을 불러오지 못했습니다.',
          );
      });
    return () => {
      active = false;
    };
  }, [onNotice, portfolioId, userId]);

  useEffect(() => {
    if (
      !userId ||
      !portfolio ||
      ruleData.portfolioId !== portfolio.id ||
      executedPortfolioRef.current === portfolio.id
    )
      return;
    executedPortfolioRef.current = portfolio.id;
    const dueRules = ruleData.rules.filter((rule) => rule.status === 'ACTIVE');
    if (!dueRules.length) return;
    void (async () => {
      await Promise.resolve();
      setProgress({ completed: 0, total: dueRules.length });
      const results = [];
      for (const [index, rule] of dueRules.entries()) {
        try {
          results.push(await executeDueRecurringInvestmentRule(userId, rule.id, portfolio.id));
        } catch {
          /* failure is persisted by the service */
        }
        setProgress({ completed: index + 1, total: dueRules.length });
      }
      return results;
    })()
      .then(async (results) => {
        setExecutions(await loadRecurringInvestmentExecutions(userId, portfolio.id));
        results.flatMap((result) => (result.rule ? [result.rule] : [])).forEach(mergeRule);
        const executedCount = results.reduce((total, result) => total + result.executedCount, 0);
        if (executedCount) {
          await reloadLedgers(userId);
          onNotice(`적립식 투자 ${executedCount}건을 거래일 종가로 반영했습니다.`);
        }
      })
      .catch((error: unknown) =>
        onNotice(error instanceof Error ? error.message : '적립식 투자 자동 반영에 실패했습니다.'),
      )
      .finally(() => setProgress(null));
  }, [onNotice, portfolio, reloadLedgers, ruleData.portfolioId, ruleData.rules, userId]);

  return {
    rules,
    executions,
    failureStates,
    progress,
    updatingRuleId,
    openStatusRuleId,
    setOpenStatusRuleId,
    updateStatus,
    retry,
    mergeRule,
    removeRule,
    allowAutomaticExecution,
  };
}
