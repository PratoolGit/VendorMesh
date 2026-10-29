const HIGH = 'high_priority_review';
const REVIEW = 'review_recommended';

export function buildReconciliation({ purchaseRequests = [], invoices = [], now = new Date() } = {}) {
  const requestById = new Map(purchaseRequests.map((request) => [String(request._id), request]));
  const invoicesByRequest = new Map();
  const invoiceNumberGroups = new Map();
  const signals = [];

  const add = (signal) => signals.push(signal);
  for (const invoice of invoices) {
    const requestId = String(invoice.purchaseRequestId || '');
    const group = invoicesByRequest.get(requestId) || [];
    group.push(invoice);
    invoicesByRequest.set(requestId, group);
    const duplicateKey = [String(invoice.supplierId || ''), String(invoice.invoiceNumber || '').trim().toUpperCase()].join('|');
    const duplicateGroup = invoiceNumberGroups.get(duplicateKey) || [];
    duplicateGroup.push(invoice);
    invoiceNumberGroups.set(duplicateKey, duplicateGroup);

    if (invoice.status === 'pending_review') {
      add({
        id: String(invoice._id) + ':invoice_pending_review',
        type: 'invoice_pending_review',
        severity: REVIEW,
        title: 'Invoice awaiting review',
        message: 'This manually entered invoice has not been approved or rejected.',
        requestId: requestId || null,
        invoiceId: String(invoice._id),
        nextStep: 'Compare the invoice against the purchase request and receipt evidence before approving it.',
        evidence: { invoiceNumber: invoice.invoiceNumber, supplierName: invoice.supplierName, total: invoice.total, currency: invoice.currency }
      });
    }

    const request = requestById.get(requestId);
    if (!request) {
      add({
        id: String(invoice._id) + ':request_reference_missing',
        type: 'purchase_request_reference_missing',
        severity: HIGH,
        title: 'Purchase request reference unavailable',
        message: 'The invoice references a purchase request not found in the reconciliation window for this workspace.',
        requestId: requestId || null,
        invoiceId: String(invoice._id),
        nextStep: 'Verify the related purchase request and refresh the reconciliation window.',
        evidence: { invoiceNumber: invoice.invoiceNumber, total: invoice.total, currency: invoice.currency }
      });
    } else if (invoice.currency !== request.currency) {
      add({
        id: String(invoice._id) + ':currency_mismatch',
        type: 'currency_mismatch',
        severity: HIGH,
        title: 'Invoice currency mismatch',
        message: 'The invoice currency differs from the linked purchase request currency.',
        requestId,
        invoiceId: String(invoice._id),
        nextStep: 'Confirm invoice currency and the order record; do not silently change either value.',
        evidence: { invoiceNumber: invoice.invoiceNumber, invoiceCurrency: invoice.currency, requestCurrency: request.currency }
      });
    }
  }

  for (const duplicateGroup of invoiceNumberGroups.values()) {
    if (duplicateGroup.length < 2) continue;
    const first = duplicateGroup[0];
    add({
      id: String(first._id) + ':duplicate_invoice_number',
      type: 'duplicate_invoice_number',
      severity: HIGH,
      title: 'Possible duplicate invoice number',
      message: 'More than one invoice record shares the same supplier and invoice number in this workspace.',
      requestId: String(first.purchaseRequestId || '') || null,
      invoiceId: String(first._id),
      nextStep: 'Compare the records and source documents before approving or paying any related invoice.',
      evidence: { invoiceNumber: first.invoiceNumber, supplierName: first.supplierName, invoiceIds: duplicateGroup.map((invoice) => String(invoice._id)) }
    });
  }

  for (const request of purchaseRequests) {
    const requestId = String(request._id);
    const linkedInvoices = invoicesByRequest.get(requestId) || [];
    const purchaseTotal = Number(request.totalCost);
    if (!Number.isFinite(purchaseTotal) || purchaseTotal < 0) continue;
    const currency = String(request.currency || 'USD');
    const sameCurrencyInvoices = linkedInvoices.filter((invoice) => invoice.currency === currency);
    const totalCents = sameCurrencyInvoices.reduce((sum, invoice) => {
      const cents = Math.round(Number(invoice.total) * 100);
      return Number.isFinite(cents) && Number.isSafeInteger(cents) && cents >= 0 ? sum + cents : sum;
    }, 0);
    const purchaseCents = Math.round(purchaseTotal * 100);
    if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(purchaseCents)) continue;

    if (totalCents > purchaseCents + 1) {
      add({
        id: requestId + ':invoice_overbilled',
        type: 'invoice_total_exceeds_order',
        severity: HIGH,
        title: 'Invoice total exceeds purchase request',
        message: 'The sum of same-currency invoices is greater than the purchase request total.',
        requestId,
        invoiceId: null,
        nextStep: 'Review invoice amounts, approved quantities, and receipt evidence before payment.',
        evidence: { itemName: request.itemName, supplierId: String(request.supplierId), invoiceTotal: totalCents / 100, purchaseTotal: purchaseTotal, currency }
      });
    } else if (request.status === 'received' && sameCurrencyInvoices.length === 0) {
      add({
        id: requestId + ':missing_invoice',
        type: 'missing_invoice',
        severity: REVIEW,
        title: 'Received purchase has no invoice record',
        message: 'The purchase request is marked received but no same-currency invoice is recorded in the current reconciliation window.',
        requestId,
        invoiceId: null,
        nextStep: 'Check whether a supplier invoice is outstanding or has not yet been entered.',
        evidence: { itemName: request.itemName, supplierId: String(request.supplierId), purchaseTotal, currency }
      });
    } else if (request.status === 'received' && Math.abs(totalCents - purchaseCents) > 1) {
      add({
        id: requestId + ':invoice_total_mismatch',
        type: 'invoice_total_mismatch',
        severity: REVIEW,
        title: 'Received purchase and invoice totals do not reconcile',
        message: 'The same-currency invoice total does not match the fully received purchase request total.',
        requestId,
        invoiceId: null,
        nextStep: 'Review partial invoices, tax, credit notes, quantities and receipt details. Do not silently alter financial records.',
        evidence: { itemName: request.itemName, invoiceTotal: totalCents / 100, purchaseTotal, currency }
      });
    }
  }

  const severityOrder = { [HIGH]: 0, [REVIEW]: 1 };
  signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    || a.title.localeCompare(b.title)
    || String(a.requestId || '').localeCompare(String(b.requestId || '')));

  return {
    generatedAt: now.toISOString(),
    method: 'deterministic invoice/purchase-request comparison',
    isReadOnly: true,
    warning: 'Reconciliation checks workspace purchase requests and manually entered invoice records only. PayPal settlement records are not joined because the legacy transaction ledger is not tenant-scoped. Signals are not fraud findings.',
    counts: {
      purchaseRequests: purchaseRequests.length,
      invoices: invoices.length,
      signals: signals.length,
      highPriority: signals.filter((signal) => signal.severity === HIGH).length,
      reviewRecommended: signals.filter((signal) => signal.severity === REVIEW).length
    },
    signals
  };
}
