import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReconciliation } from '../services/reconciliation.js';

const request = (overrides = {}) => ({
  _id: 'request-1',
  supplierId: 'supplier-1',
  itemName: 'Paper',
  totalCost: 100,
  currency: 'USD',
  status: 'received',
  ...overrides
});
const invoice = (overrides = {}) => ({
  _id: 'invoice-1',
  purchaseRequestId: 'request-1',
  supplierId: 'supplier-1',
  supplierName: 'Paper Co.',
  invoiceNumber: 'INV-1',
  total: 100,
  currency: 'USD',
  status: 'approved',
  ...overrides
});

test('reconciliation reports a matching received purchase with no signals', () => {
  const result = buildReconciliation({ purchaseRequests: [request()], invoices: [invoice()] });
  assert.equal(result.isReadOnly, true);
  assert.equal(result.counts.signals, 0);
});

test('reconciliation flags missing invoices, overbilling, and pending review', () => {
  const result = buildReconciliation({
    purchaseRequests: [
      request({ _id: 'missing', totalCost: 50 }),
      request({ _id: 'overbilled', totalCost: 100 })
    ],
    invoices: [
      invoice({ _id: 'high-invoice', purchaseRequestId: 'overbilled', total: 130 }),
      invoice({ _id: 'pending', purchaseRequestId: 'overbilled', invoiceNumber: 'INV-PENDING', total: 10, status: 'pending_review' })
    ]
  });
  const types = new Set(result.signals.map((signal) => signal.type));
  assert.ok(types.has('missing_invoice'));
  assert.ok(types.has('invoice_total_exceeds_order'));
  assert.ok(types.has('invoice_pending_review'));
});

test('reconciliation flags currency mismatches and duplicate supplier invoice numbers', () => {
  const result = buildReconciliation({
    purchaseRequests: [request()],
    invoices: [
      invoice({ _id: 'one', currency: 'EUR' }),
      invoice({ _id: 'two', currency: 'USD' })
    ]
  });
  const types = new Set(result.signals.map((signal) => signal.type));
  assert.ok(types.has('currency_mismatch'));
  assert.ok(types.has('duplicate_invoice_number'));
});

test('reconciliation does not call a partial invoice a mismatch until a purchase is fully received', () => {
  const result = buildReconciliation({
    purchaseRequests: [request({ status: 'partially_received', totalCost: 100 })],
    invoices: [invoice({ total: 40 })]
  });
  assert.equal(result.signals.some((signal) => signal.type === 'invoice_total_mismatch'), false);
});
