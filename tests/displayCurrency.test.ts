import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrentMoney, formatHistoricalMoney } from '../src/utils/displayCurrency.ts';

test('현재 미국 금액은 현재 환율로 원화 환산한다', () => {
  assert.equal(formatCurrentMoney(10, 'US', 'KRW', 1_400), '14,000원');
  assert.equal(formatCurrentMoney(10, 'US', 'USD', 1_400), '$10.00');
});

test('과거 미국 거래는 기록에 저장된 환율만 사용한다', () => {
  assert.equal(formatHistoricalMoney(10, 'US', 'KRW', 1_300), '13,000원');
  assert.equal(formatHistoricalMoney(10, 'US', 'KRW'), '환율 없음');
});

test('한국 금액은 표시 통화와 관계없이 원화로 유지한다', () => {
  assert.equal(formatCurrentMoney(10_000, 'KR', 'USD', 1_400), '10,000원');
  assert.equal(formatHistoricalMoney(10_000, 'KR', 'USD'), '10,000원');
});
