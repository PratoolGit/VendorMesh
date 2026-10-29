import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWorkspaceAnomalies } from '../services/workspaceAnomalies.js';

const baseRequest = (overrides = {}) => ({
  _id: 'request-1', inventoryItemId: 'item-1', supplierId: 'supplier-1',
  itemName: 'Printer paper', sku: 'PAPER-01', quantity: 10, unitCost: 20,
  totalCost: 200, currency: 'USD', status: 'pending',
  createdAt: '2026-10-29T10:00:00.000Z', ...overrides
});

test('flags pending requests over the configured limit without mutating state', () => {
  const request = baseRequest({ totalCost: 500 });
  const result = detectWorkspaceAnomalies({
    purchaseRequests: [request],
    inventoryItems: [{ _id: 'item-1', name: 'Printer paper', sku: 'PAPER-01' }],
    suppliers: [{ _id: 'supplier-1', name: 'Paper supplier', active: true }],
    maxSinglePayment: 250,
    now: Date.parse('2026-10-29T12:00:00.000Z')
  });
  assert.equal(result.isReadOnly, true);
  assert.equal(result.count, 1);
  assert.equal(result.anomalies[0].type, 'purchase_over_limit');
  assert.equal(request.status, 'pending');
});

test('flags possible duplicate pending purchase requests within the time window', () => {
  const result = detectWorkspaceAnomalies({
    purchaseRequests: [
      baseRequest({ _id: 'request-1' }),
      baseRequest({ _id: 'request-2', createdAt: '2026-10-29T11:00:00.000Z' })
    ],
    inventoryItems: [{ _id: 'item-1', name: 'Printer paper', sku: 'PAPER-01' }],
    suppliers: [{ _id: 'supplier-1', name: 'Paper supplier', active: true }]
  });
  assert.equal(result.anomalies.filter((a) => a.type === 'possible_duplicate_request').length, 1);
});

test('flags inactive and missing supplier links and total mismatches', () => {
  const result = detectWorkspaceAnomalies({
    purchaseRequests: [
      baseRequest({ _id: 'inactive', totalCost: 200, status: 'pending' }),
      baseRequest({ _id: 'mismatch', totalCost: 1, status: 'pending' }),
      baseRequest({ _id: 'missing', supplierId: 'gone', totalCost: 200, status: 'approved', reviewedBy: 'reviewer' })
    ],
    inventoryItems: [{ _id: 'item-1', name: 'Printer paper' }],
    suppliers: [{ _id: 'supplier-1', name: 'Paper supplier', active: false }]
  });
  const types = new Set(result.anomalies.map((a) => a.type));
  assert.ok(types.has('inactive_supplier'));
  assert.ok(types.has('purchase_total_mismatch'));
  assert.ok(types.has('missing_supplier_reference'));
  assert.ok(types.has('review_metadata_missing'));
});

test('ignores duplicate requests outside the configured time window', () => {
  const result = detectWorkspaceAnomalies({
    purchaseRequests: [
      baseRequest({ _id: 'request-1' }),
      baseRequest({ _id: 'request-2', createdAt: '2026-10-27T10:00:00.000Z' })
    ],
    inventoryItems: [{ _id: 'item-1', name: 'Printer paper' }],
    suppliers: [{ _id: 'supplier-1', name: 'Paper supplier', active: true }]
  });
  assert.equal(result.anomalies.some((a) => a.type === 'possible_duplicate_request'), false);
});
