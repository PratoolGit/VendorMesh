import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePurchaseOrderOptions } from '../services/purchaseOrderValidation.js';

const now = new Date('2026-10-31T12:00:00.000Z');
const supplier = { leadTimeDays: 9, paymentTerms: 'Net 45' };

test('purchase order defaults delivery date and payment terms from supplier', () => {
  const result = normalizePurchaseOrderOptions({}, supplier, now);
  assert.equal(result.value.expectedDeliveryDate.toISOString(), '2026-11-09T00:00:00.000Z');
  assert.equal(result.value.paymentTerms, 'Net 45');
  assert.equal(result.value.notes, '');
});

test('purchase order accepts explicit delivery, terms, and notes', () => {
  const result = normalizePurchaseOrderOptions({
    expectedDeliveryDate: '2026-11-15', paymentTerms: '50% advance, balance on delivery', notes: 'Deliver at warehouse gate.'
  }, supplier, now);
  assert.equal(result.value.expectedDeliveryDate.toISOString(), '2026-11-15T00:00:00.000Z');
  assert.equal(result.value.paymentTerms, '50% advance, balance on delivery');
  assert.equal(result.value.notes, 'Deliver at warehouse gate.');
});

test('purchase order rejects malformed, past, or too-distant delivery dates', () => {
  assert.match(normalizePurchaseOrderOptions({ expectedDeliveryDate: '15-11-2026' }, supplier, now).error, /YYYY-MM-DD/);
  assert.match(normalizePurchaseOrderOptions({ expectedDeliveryDate: '2026-10-30' }, supplier, now).error, /today or within/i);
  assert.match(normalizePurchaseOrderOptions({ expectedDeliveryDate: '2037-01-01' }, supplier, now).error, /10 years/i);
});

test('purchase order rejects unsupported and invalid text fields', () => {
  assert.match(normalizePurchaseOrderOptions({ status: 'received' }, supplier, now).error, /unsupported/i);
  assert.match(normalizePurchaseOrderOptions({ paymentTerms: ' ' }, supplier, now).error, /Payment terms/);
  assert.match(normalizePurchaseOrderOptions({ notes: 'x'.repeat(2001) }, supplier, now).error, /notes/i);
});
