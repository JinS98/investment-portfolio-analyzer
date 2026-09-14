import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumericInput, parseNumericInput } from '../src/utils/numericInput.ts';
test('numeric input inserts grouping commas while retaining decimals', () => {
  assert.equal(formatNumericInput('1000'), '1,000');
  assert.equal(formatNumericInput('1234567.89'), '1,234,567.89');
  assert.equal(formatNumericInput('1,2a3.4.5'), '123.45');
  assert.equal(formatNumericInput('.5'), '0.5');
});
test('formatted input parses into a finite numeric value', () => {
  assert.equal(parseNumericInput('1,234.50'), 1234.5);
  assert.ok(Number.isNaN(parseNumericInput('')));
});
