import assert from 'node:assert/strict';
import test from 'node:test';
import type { RecurringInvestmentExecution } from '../src/types';
import { getRecurringFailureStates } from '../src/utils/recurringExecution.ts';

const execution = (
  id: string,
  ruleId: string,
  result: RecurringInvestmentExecution['result'],
  attemptedAt: number,
): RecurringInvestmentExecution => ({
  id,
  portfolioId: 'portfolio-1',
  ruleId,
  ruleName: ruleId,
  result,
  attemptedAt,
  executedCount: 0,
  executedDates: [],
});

test('keeps the latest unresolved failure and counts consecutive attempts per rule', () => {
  const failures = getRecurringFailureStates([
    execution('newest-failure', 'rule-a', 'FAILED', 30),
    execution('previous-failure', 'rule-a', 'FAILED', 20),
    execution('success', 'rule-b', 'SUCCEEDED', 15),
    execution('older-failure', 'rule-b', 'FAILED', 10),
  ]);

  assert.equal(failures.get('rule-a')?.latest.id, 'newest-failure');
  assert.equal(failures.get('rule-a')?.consecutiveFailures, 2);
  assert.equal(failures.has('rule-b'), false);
});

test('removes a failure alert after a successful retry', () => {
  const failures = getRecurringFailureStates([
    execution('retry-success', 'rule-a', 'SUCCEEDED', 30),
    execution('previous-failure', 'rule-a', 'FAILED', 20),
  ]);

  assert.equal(failures.size, 0);
});
