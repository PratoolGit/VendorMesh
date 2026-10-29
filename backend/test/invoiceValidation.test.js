import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvoiceInput, compareInvoiceWithPurchase } from '../services/invoiceValidation.js';

const validInvoice = (overrides = {}) => ({
  purchaseRequestId: '64f1a123456789abcdef0123',
  invoiceNumber: 'inv-1001',
  invoiceDate: '2026-10-28',
  dueDate: '2026-11-28',
  currency: 'USD',
  subtotal: 100,
  taxTotal: 8,
  total: 108,
  ...overrides
});

test('invoice input normalizes identifiers and money while preserving currency', () => {
  const result = normalizeInvoiceInput(validInvoice());
  assert.equal(result.error, undefined);
  assert.equal(result.value.invoiceNumber, 'INV-1001');
  assert.equal(result.value.currency, 'USD');
  assert.equal(result.value.total, 108);
  assert.equal(result.value.invoiceDate.toISOString(), '2026-10-28T00:00:00.000Z');
});

test('invoice input rejects invalid dates, unbalanced totals, and unsafe amounts', () => {
  assert.match(normalizeInvoiceInput(validInvoice({ invoiceDate: '2026-02-30' })).error, /calendar date/i);
  assert.match(normalizeInvoiceInput(validInvoice({ dueDate: '2026-10-01' })).error, /earlier than/i);
  assert.match(normalizeInvoiceInput(validInvoice({ total: 120 })).error, /subtotal plus tax/i);
  assert.match(normalizeInvoiceInput(validInvoice({ total: Number.MAX_VALUE, subtotal: Number.MAX_VALUE, taxTotal: 0 })).error, /between/i);
  assert.match(normalizeInvoiceInput(validInvoice({ extra: 'not allowed' })).error, /unsupported/i);
});

test('invoice reconciliation flags amount/currency mismatches without mutating records', () => {
  const purchase = { totalCost: 108, currency: 'USD' };
  const matching = { total: 108, currency: 'USD' };
  assert.equal(compareInvoiceWithPurchase(matching, purchase).mismatch, false);
  assert.equal(compareInvoiceWithPurchase({ total: 110, currency: 'USD' }, purchase).difference, 2);
  assert.equal(compareInvoiceWithPurchase({ total: 108, currency: 'EUR' }, purchase).mismatch, true);
});
