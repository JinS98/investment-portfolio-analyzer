import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDomesticFundamentals } from '../src/utils/domesticFundamentals.ts';

const inputs = {
  year: 2025,
  basis: 'CFS' as const,
  eps: 500,
  bps: 2000,
  roe: 12,
  dividendPerShare: 100,
};
test('domestic valuation uses raw KRW quote and percentages exactly once', () => {
  assert.deepEqual(calculateDomesticFundamentals(inputs, 10000), {
    per: 20,
    pbr: 5,
    roe: 12,
    dividendYield: 1,
    marketCap: null,
  });
  assert.equal(calculateDomesticFundamentals(inputs, 20000).per, 40);
  assert.equal(calculateDomesticFundamentals(inputs, 20000).dividendYield, 0.5);
});
test('missing or invalid quote hides price-dependent metrics while preserving ROE', () => {
  for (const price of [null, 0, -100, NaN, Infinity]) {
    assert.deepEqual(calculateDomesticFundamentals(inputs, price), {
      per: null,
      pbr: null,
      roe: 12,
      dividendYield: null,
      marketCap: null,
    });
  }
});
test('losses, invalid capital and missing dividends differ from explicit zero dividend', () => {
  const result = calculateDomesticFundamentals(
    { ...inputs, eps: -10, bps: 0, roe: -5, dividendPerShare: null },
    10000,
  );
  assert.equal(result.per, null);
  assert.equal(result.pbr, null);
  assert.equal(result.roe, -5);
  assert.equal(result.dividendYield, null);
  assert.equal(
    calculateDomesticFundamentals({ ...inputs, dividendPerShare: 0 }, 10000).dividendYield,
    0,
  );
});
