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


test('pricing simulator rejects inputs that would make money arithmetic unsafe', () => {
  assert.throws(() => simulatePricing({ basePrice: Number.MAX_VALUE, unitCost: 1, baselineUnits: 10 }), /safe calculation range/i);
  assert.throws(() => simulatePricing({ basePrice: 10, unitCost: 1, baselineUnits: 1.5 }), /whole number/i);
  assert.throws(() => simulatePricing({ basePrice: 10, unitCost: 1, baselineUnits: Number.MAX_SAFE_INTEGER, elasticity: 5 }), /safe/i);
});

test('pricing simulator rounds monetary inputs to cents and keeps outputs finite', () => {
  const result = simulatePricing({ basePrice: 12.345, unitCost: 5.555, baselineUnits: 100, competitorPrice: 11.999 });
  assert.equal(result.assumptions.basePrice, 12.35);
  assert.equal(result.assumptions.unitCost, 5.56);
  assert.equal(result.assumptions.competitorPrice, 12);
  assert.ok(result.scenarios.every((scenario) =>
    Number.isFinite(scenario.price)
    && Number.isFinite(scenario.revenue)
    && Number.isFinite(scenario.grossProfit)
    && Number.isFinite(scenario.marginPercent)
    && (scenario.versusCompetitorPercent === null || Number.isFinite(scenario.versusCompetitorPercent))
  ));
});
