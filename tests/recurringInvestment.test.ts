import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextRecurringInvestmentDate,
  getPendingRecurringInvestmentDatesUntil,
} from '../src/utils/recurringInvestment.ts';

test('weekly rule calculates the configured weekday including today', () => {
  assert.equal(
    getNextRecurringInvestmentDate(
      { frequency: 'WEEKLY', weeklyDay: 1, startDate: '2026-09-01' },
      new Date('2026-09-21T01:00:00Z'),
    ),
    '2026-09-21',
  );
});

test('monthly weekend dates move to the following weekday', () => {
  assert.equal(
    getNextRecurringInvestmentDate(
      { frequency: 'MONTHLY', monthlyDay: 19, startDate: '2026-09-01' },
      new Date('2026-09-17T01:00:00Z'),
    ),
    '2026-09-21',
  );
});

test('monthly dates missing from a month use that month’s last day', () => {
  assert.equal(
    getNextRecurringInvestmentDate(
      { frequency: 'MONTHLY', monthlyDay: 31, startDate: '2026-01-01' },
      new Date('2026-02-01T01:00:00Z'),
    ),
    '2026-03-02',
  );
});

test('pending dates include every scheduled purchase since the start date', () => {
  assert.deepEqual(
    getPendingRecurringInvestmentDatesUntil(
      { frequency: 'WEEKLY', weeklyDay: 1, startDate: '2026-09-01' },
      '2026-09-21',
    ),
    ['2026-09-07', '2026-09-14', '2026-09-21'],
  );
});

test('pending dates resume after the last executed purchase', () => {
  assert.deepEqual(
    getPendingRecurringInvestmentDatesUntil(
      { frequency: 'MONTHLY', monthlyDay: 15, startDate: '2026-01-01', lastExecutedDate: '2026-08-17' },
      '2026-10-01',
    ),
    ['2026-09-15'],
  );
});
