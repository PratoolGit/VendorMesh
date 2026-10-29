import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatePricing } from '../services/pricingSimulator.js';

test('pricing simulator returns five advisory scenarios and a profit leader', () => {
  const result = simulatePricing({ basePrice: 100, unitCost: 60, baselineUnits: 100, elasticity: 1.2, competitorPrice: 95 });
  assert.equal(result.scenarios.length, 5);
  assert.equal(result.advisoryOnly, true);
  assert.ok(result.scenarios.every((scenario) => Number.isFinite(scenario.grossProfit)));
  assert.equal(result.highestEstimatedGrossProfit.grossProfit, Math.max(...result.scenarios.map((s) => s.grossProfit)));
  assert.equal(result.scenarios[2].changePercent, 0);
});

test('pricing simulator rejects invalid financial inputs', () => {
  assert.throws(() => simulatePricing({ basePrice: 0, unitCost: 2, baselineUnits: 10 }));
  assert.throws(() => simulatePricing({ basePrice: 10, unitCost: -1, baselineUnits: 10 }));
  assert.throws(() => simulatePricing({ basePrice: 10, unitCost: 2, baselineUnits: 10, elasticity: 8 }));
});
