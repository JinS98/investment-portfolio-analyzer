import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyImportHistory } from '../src/utils/legacyPortfolioMigration.ts';

test('legacy stock data becomes an idempotent initial BUY history', () => {
  const result = createLegacyImportHistory(
    {
      id: 'old-aapl',
      ticker: 'AAPL',
      name: 'Apple',
      market: 'US',
      buyPrice: 180.25,
      quantity: 3,
      addedAt: '2026-09-01T01:02:03.000Z',
    },
    'real',
    1_789_123_456_789,
  );

  assert.equal(result.id, 'legacy-old-aapl');
  assert.equal(result.portfolioId, 'real');
  assert.equal(result.portfolioType, 'REAL');
  assert.equal(result.type, 'BUY');
  assert.equal(result.grossAmount, 540.75);
  assert.equal(result.fee, 0);
  assert.equal(result.tax, 0);
  assert.equal(result.source, 'LEGACY_IMPORT');
  assert.equal(result.legacyStockId, 'old-aapl');
  assert.equal(result.date, '2026-09-01');
  assert.equal(result.importedAt, 1_789_123_456_789);
});
