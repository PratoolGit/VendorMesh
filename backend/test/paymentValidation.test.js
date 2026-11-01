import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePaymentInput, normalizePaymentReversal } from '../services/paymentValidation.js';

const now = new Date('2026-11-01T08:00:00.000Z');

test('normalizes a valid partial bank transfer payment', () => {
  const result = normalizePaymentInput({
    amount: '125.50', method: 'bank_transfer', reference: 'UTR-12345', paidAt: '2026-10-31', notes: 'First instalment'
  }, 500, now);
  assert.equal(result.value.amount, 125.5);
  assert.equal(result.value.method, 'bank_transfer');
  assert.equal(result.value.reference, 'UTR-12345');
  assert.equal(result.value.paidAt.toISOString(), '2026-10-31T00:00:00.000Z');
});

test('rejects payment above outstanding and invalid money precision', () => {
  assert.match(normalizePaymentInput({ amount: 51, method: 'upi' }, 50, now).error, /outstanding/i);
  assert.match(normalizePaymentInput({ amount: 0, method: 'upi' }, 50, now).error, /between/i);
  assert.match(normalizePaymentInput({ amount: 0.001, method: 'upi' }, 50, now).error, /between/i);
});

test('rejects unsupported methods, extra fields, and bad references', () => {
  assert.match(normalizePaymentInput({ amount: 10, method: 'paypal' }, 50, now).error, /payment method/i);
  assert.match(normalizePaymentInput({ amount: 10, method: 'upi', status: 'paid' }, 50, now).error, /unsupported/i);
  assert.match(normalizePaymentInput({ amount: 10, method: 'upi', reference: 'x\nforged' }, 50, now).error, /printable/i);
});

test('validates payment dates and note length', () => {
  assert.match(normalizePaymentInput({ amount: 10, method: 'cash', paidAt: '2026-02-30' }, 50, now).error, /valid payment date/i);
  assert.match(normalizePaymentInput({ amount: 10, method: 'cash', paidAt: '2026-11-02' }, 50, now).error, /future/i);
  assert.match(normalizePaymentInput({ amount: 10, method: 'cash', notes: 'x'.repeat(501) }, 50, now).error, /notes/i);
});

test('rejects invalid outstanding balance', () => {
  assert.match(normalizePaymentInput({ amount: 10, method: 'cash' }, -1, now).error, /outstanding balance/i);
});

test('requires a clear reason to reverse a payment', () => {
  assert.match(normalizePaymentReversal({ reason: '  ' }).error, /3–500 characters/);
  assert.match(normalizePaymentReversal({ reason: 'wrong invoice', force: true }).error, /unsupported/i);
  assert.equal(normalizePaymentReversal({ reason: 'Wrong invoice reference' }).value.reason, 'Wrong invoice reference');
});
