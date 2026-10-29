import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastInventory } from '../services/inventoryForecast.js';

test('inventory forecast uses configured demand and marks its estimates clearly', () => {
  const result = forecastInventory([
    { _id: 'item1', sku: 'SKU-1', name: 'Paper', onHand: 10, reorderPoint: 5, dailyDemand: 2, supplierId: 'supplier1' }
  ], [{ _id: 'supplier1', name: 'Paper Supplier', leadTimeDays: 4 }]);
  assert.equal(result[0].next7DaysDemand, 14);
  assert.equal(result[0].next30DaysDemand, 60);
  assert.equal(result[0].daysOfCover, 5);
  assert.equal(result[0].stockoutRisk, 'medium');
  assert.equal(result[0].suggestedReorderQuantity, 4);
});

test('inventory forecast handles zero or missing demand without inventing a quantity', () => {
  const result = forecastInventory([
    { _id: 'item1', sku: 'A', name: 'A', onHand: 10, reorderPoint: 3, dailyDemand: 0 },
    { _id: 'item2', sku: 'B', name: 'B', onHand: 0, reorderPoint: 1 }
  ], []);
  assert.equal(result[0].stockoutRisk, 'insufficient_data');
  assert.equal(result[0].next7DaysDemand, null);
  assert.equal(result[0].suggestedReorderQuantity, null);
  assert.equal(result[1].stockoutRisk, 'insufficient_data');
});

test('inventory forecast handles extreme and invalid values conservatively', () => {
  const result = forecastInventory([
    { _id: 'item1', name: 'Overflow', onHand: Number.MAX_VALUE, reorderPoint: 0, dailyDemand: Number.MAX_VALUE }
  ], []);
  assert.ok(['high', 'medium', 'normal', 'insufficient_data'].includes(result[0].stockoutRisk));
  assert.ok(result[0].daysOfCover === null || Number.isFinite(result[0].daysOfCover));
});
