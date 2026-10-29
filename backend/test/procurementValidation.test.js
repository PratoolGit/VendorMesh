import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupplierPatch, calculatePurchaseTotal } from '../services/procurementValidation.js';

test('supplier updates require strict booleans and valid email values', () => {
  assert.match(normalizeSupplierPatch({ active: 'false' }, 'owner').error, /boolean/);
  assert.match(normalizeSupplierPatch({ email: 'not-an-email' }, 'admin').error, /valid supplier email/i);
  assert.deepEqual(normalizeSupplierPatch({ active: false }, 'owner').patch, { active: false });
});

test('supplier staff cannot change ranking or activation controls', () => {
  assert.equal(normalizeSupplierPatch({ active: false }, 'staff').status, 403);
  assert.equal(normalizeSupplierPatch({ reliabilityScore: 99 }, 'staff').status, 403);
  assert.equal(normalizeSupplierPatch({ leadTimeDays: 2 }, 'staff').status, 403);
});

test('supplier update rejects empty and unexpected patches', () => {
  assert.match(normalizeSupplierPatch({}, 'owner').error, /at least one/i);
  assert.match(normalizeSupplierPatch({ companyId: 'other-tenant' }, 'owner').error, /unsupported/i);
  assert.deepEqual(normalizeSupplierPatch({ name: '  Acme  ', email: 'BUY@EXAMPLE.COM' }, 'staff').patch,
    { name: 'Acme', email: 'buy@example.com' });
});

test('purchase total calculations retain cent precision and reject unsafe amounts', () => {
  assert.deepEqual(calculatePurchaseTotal(2.345, 3), { totalCost: 7.05 });
  assert.match(calculatePurchaseTotal(100_000_000, 1_000_000).error, /safe calculation range/i);
  assert.match(calculatePurchaseTotal(-1, 4).error, /unit cost/i);
});
