import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePurchaseTransition } from '../services/purchaseWorkflow.js';

const request = (overrides = {}) => ({
  _id: 'req-1', status: 'approved', quantity: 10, orderedQuantity: 0, receivedQuantity: 0,
  ...overrides
});
const now = new Date('2026-10-29T12:00:00.000Z');

test('only owner/admin can mark an approved request as ordered', () => {
  assert.equal(validatePurchaseTransition(request(), { status: 'ordered' }, 'staff', now).status, 403);
  const result = validatePurchaseTransition(request(), { status: 'ordered', orderedQuantity: 8 }, 'owner', now);
  assert.equal(result.patch.status, 'ordered');
  assert.equal(result.patch.orderedQuantity, 8);
  assert.equal(result.patch.orderedAt, now);
});

test('receipt quantities are cumulative, ordered-bounded, and status-consistent', () => {
  const ordered = request({ status: 'ordered', orderedQuantity: 10 });
  assert.match(validatePurchaseTransition(ordered, { status: 'partially_received', receivedQuantity: 10 }, 'staff', now).error, /use received/i);
  assert.match(validatePurchaseTransition(ordered, { status: 'received', receivedQuantity: 9 }, 'staff', now).error, /all ordered units/i);
  const partial = validatePurchaseTransition(ordered, { status: 'partially_received', receivedQuantity: 4 }, 'staff', now);
  assert.equal(partial.patch.receivedQuantity, 4);
  const complete = validatePurchaseTransition(request({ status: 'partially_received', orderedQuantity: 10, receivedQuantity: 4 }), { status: 'received', receivedQuantity: 10 }, 'staff', now);
  assert.equal(complete.patch.status, 'received');
  assert.equal(complete.patch.receivedQuantity, 10);
});

test('invalid or backward receipt quantities are rejected', () => {
  const result = request({ status: 'partially_received', orderedQuantity: 10, receivedQuantity: 4 });
  assert.match(validatePurchaseTransition(result, { status: 'partially_received', receivedQuantity: 3 }, 'admin', now).error, /above the current/i);
  assert.match(validatePurchaseTransition(result, { status: 'partially_received', receivedQuantity: 11 }, 'admin', now).error, /no greater/i);
  assert.match(validatePurchaseTransition(result, { status: 'received', receivedQuantity: 10.5 }, 'admin', now).error, /whole number/i);
});

test('terminal states cannot be moved back into ordering or receipt', () => {
  assert.equal(validatePurchaseTransition(request({ status: 'received', orderedQuantity: 10, receivedQuantity: 10 }), { status: 'ordered' }, 'owner', now).status, 409);
  assert.equal(validatePurchaseTransition(request({ status: 'rejected' }), { status: 'cancelled' }, 'owner', now).status, 409);
});

test('cancellation is a manager-only transition', () => {
  assert.equal(validatePurchaseTransition(request({ status: 'pending' }), { status: 'cancelled' }, 'staff', now).status, 403);
  assert.equal(validatePurchaseTransition(request({ status: 'pending' }), { status: 'cancelled', note: 'No longer needed' }, 'admin', now).patch.cancelledAt, now);
});
