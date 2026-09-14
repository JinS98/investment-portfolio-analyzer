import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRiskGuide } from '../src/utils/riskGuide.ts';

test('risk guide marks high volatility and concentration as high risk', () => {
  const guide = createRiskGuide({
    volatility: 180, mdd: -70, concentration: 100, maxWeight: 70,
    analyzedTickers: ['RAM', 'MVLL'], insufficientTickers: [], stocks: [],
  });

  assert.equal(guide.level, 'high');
  assert.ok(guide.score >= 65);
  assert.equal(guide.alerts.length, 4);
});
