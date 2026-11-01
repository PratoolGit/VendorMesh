import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspaceRecommendations } from '../services/workspaceRecommendations.js';

test('workspace recommendations stay rules-based and exclude normal-stock items', () => {
  const suppliers = [
    { _id: 'supplier-1', name: 'Reliable Supply', active: true, reliabilityScore: 95, leadTimeDays: 5, paymentTerms: 'Net 30' }
  ];
  const items = [
    { _id: 'item-low', sku: 'LOW-1', name: 'Low stock', onHand: 2, reorderPoint: 5, dailyDemand: 1, supplierId: 'supplier-1' },
    { _id: 'item-ok', sku: 'OK-1', name: 'Healthy stock', onHand: 50, reorderPoint: 5, dailyDemand: 1, supplierId: 'supplier-1' }
  ];
  const result = buildWorkspaceRecommendations(items, suppliers);
  assert.equal(result.length, 1);
  assert.equal(result[0].inventoryItemId, 'item-low');
  assert.equal(result[0].priority, 'high');
  assert.equal(result[0].supplier.name, 'Reliable Supply');
  assert.equal(result[0].supplierMatch.method, 'rules-based');
  assert.equal(result[0].action, 'review_purchase_request');
});

test('recommendations use available active suppliers and explain when no supplier is available', () => {
  const result = buildWorkspaceRecommendations([
    { _id: 'item-1', sku: 'SKU-1', name: 'Item', onHand: 1, reorderPoint: 3, dailyDemand: 0, supplierId: null }
  ], [
    { _id: 'inactive', name: 'Inactive supplier', active: false, reliabilityScore: 100, leadTimeDays: 1 }
  ]);
  assert.equal(result[0].supplier, null);
  assert.equal(result[0].supplierLinked, false);
  assert.match(result[0].reasons.join(' '), /No active linked supplier/);
});
