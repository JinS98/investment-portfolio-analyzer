import type { RecurringInvestmentExecution } from '../types';

export interface RecurringFailureState {
  latest: RecurringInvestmentExecution;
  consecutiveFailures: number;
}

/**
 * 실행 시각 내림차순 이력에서, 아직 성공으로 해소되지 않은 규칙별 실패 상태를 만든다.
 */
export function getRecurringFailureStates(
  executions: RecurringInvestmentExecution[],
): Map<string, RecurringFailureState> {
  const failuresByRule = new Map<string, RecurringFailureState>();
  const resolvedRuleIds = new Set<string>();

  for (const execution of executions) {
    if (resolvedRuleIds.has(execution.ruleId)) continue;

    const previous = failuresByRule.get(execution.ruleId);
    if (execution.result === 'SUCCEEDED') {
      resolvedRuleIds.add(execution.ruleId);
    } else if (previous) {
      previous.consecutiveFailures += 1;
    } else {
      failuresByRule.set(execution.ruleId, { latest: execution, consecutiveFailures: 1 });
    }
  }

  return failuresByRule;
}
