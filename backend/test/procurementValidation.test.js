import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupplierCreate, normalizeSupplierPatch, calculatePurchaseTotal } from '../services/procurementValidation.js';

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


test('supplier creation validates contact data and defaults staff-added suppliers safely', () => {
  const result = normalizeSupplierCreate({ name: ' Paper Co ', email: 'SALES@EXAMPLE.COM' }, 'staff');
  assert.deepEqual(result.supplier, {
    name: 'Paper Co',
    email: 'sales@example.com',
    leadTimeDays: 7,
    reliabilityScore: 80,
    paymentTerms: 'Net 30',
    notes: ''
  });
  assert.match(normalizeSupplierCreate({ name: 'Paper Co', email: 'invalid' }, 'staff').error, /valid supplier email/i);
  assert.equal(normalizeSupplierCreate({ name: 'Paper Co', leadTimeDays: 1 }, 'staff').status, 403);
  assert.equal(normalizeSupplierCreate({ name: 'Paper Co', reliabilityScore: 100 }, 'staff').status, 403);
  assert.equal(normalizeSupplierCreate({ name: 'Paper Co', paymentTerms: 'Prepaid' }, 'staff').status, 403);
});

test('staff cannot change payment terms through supplier updates', () => {
  assert.equal(normalizeSupplierPatch({ paymentTerms: 'Prepaid' }, 'staff').status, 403);
});
