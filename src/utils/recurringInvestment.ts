import type { RecurringInvestmentRule } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

const isWeekend = (date: Date): boolean => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

/** 토·일을 다음 평일로 보정한다. 휴장일 보정은 거래소 휴장일 데이터가 연결될 때 확장한다. */
export function nextWeekday(date: Date): Date {
  let candidate = date;
  while (isWeekend(candidate)) candidate = addDays(candidate, 1);
  return candidate;
}

/** 규칙 시작일 이후, 기준일 당일을 포함하는 다음 예정 매수일을 계산한다. */
export function getNextRecurringInvestmentDate(
  rule: Pick<RecurringInvestmentRule, 'frequency' | 'weeklyDay' | 'monthlyDay' | 'startDate'>,
  referenceDate = new Date(),
): string {
  const reference = parseDate(referenceDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
  const start = parseDate(rule.startDate);
  const minimum = start > reference ? start : reference;

  if (rule.frequency === 'WEEKLY') {
    const weekday = rule.weeklyDay ?? 1;
    const currentWeekday = minimum.getUTCDay();
    const daysUntil = (weekday - currentWeekday + 7) % 7;
    return formatDate(nextWeekday(addDays(minimum, daysUntil)));
  }

  const monthlyDay = rule.monthlyDay ?? 1;
  for (let monthOffset = 0; monthOffset < 240; monthOffset += 1) {
    const year = minimum.getUTCFullYear();
    const month = minimum.getUTCMonth() + monthOffset;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const scheduled = nextWeekday(new Date(Date.UTC(year, month, Math.min(monthlyDay, lastDay))));
    if (scheduled >= minimum) return formatDate(scheduled);
  }

  throw new Error('다음 적립식 투자 예정일을 계산하지 못했습니다.');
}

/** 마지막 반영일 다음부터 계산한, 아직 거래 이력에 반영되지 않은 예정 매수일이다. */
export function getNextPendingRecurringInvestmentDate(
  rule: Pick<RecurringInvestmentRule, 'frequency' | 'weeklyDay' | 'monthlyDay' | 'startDate' | 'lastExecutedDate'>,
): string {
  const reference = rule.lastExecutedDate ? addDays(parseDate(rule.lastExecutedDate), 1) : parseDate(rule.startDate);
  return getNextRecurringInvestmentDate(rule, reference);
}

/** 시작일 또는 마지막 반영일 다음부터 종료일까지의 모든 예정 매수일을 계산한다. */
export function getPendingRecurringInvestmentDatesUntil(
  rule: Pick<RecurringInvestmentRule, 'frequency' | 'weeklyDay' | 'monthlyDay' | 'startDate' | 'lastExecutedDate'>,
  untilDate: string,
): string[] {
  const until = parseDate(untilDate);
  const dates: string[] = [];
  let candidate = getNextPendingRecurringInvestmentDate(rule);
  while (parseDate(candidate) <= until) {
    dates.push(candidate);
    if (dates.length > 600) throw new Error('적립식 투자 소급 반영 기간이 너무 깁니다.');
    candidate = getNextRecurringInvestmentDate(rule, addDays(parseDate(candidate), 1));
  }
  return dates;
}

export const koreaToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
