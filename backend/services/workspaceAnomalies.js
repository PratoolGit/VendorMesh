const ACTIVE_REQUEST_STATUSES = new Set(['pending', 'approved', 'ordered']);
const CENTS_MAX = Number.MAX_SAFE_INTEGER;

function requestKey(request) {
  return [
    String(request.inventoryItemId || ''),
    String(request.supplierId || ''),
    String(request.quantity ?? ''),
    String(request.unitCost ?? ''),
    String(request.currency || '').toUpperCase()
  ].join('|');
}

function safeExpectedTotal(request) {
  const price = Number(request.unitCost);
  const quantity = Number(request.quantity);
  if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(quantity) || quantity < 1) return null;
  const cents = Math.round(price * 100) * quantity;
  if (!Number.isFinite(cents) || Math.abs(cents) > CENTS_MAX) return null;
  return Math.round(cents) / 100;
}

/** Read-only rules for human review; these are not fraud findings. */
export function detectWorkspaceAnomalies({
  purchaseRequests = [],
  inventoryItems = [],
  suppliers = [],
  maxSinglePayment = 15_000,
  now = Date.now(),
  duplicateWindowMs = 24 * 60 * 60 * 1000
} = {}) {
  const inventoryById = new Map(inventoryItems.map((item) => [String(item._id), item]));
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));
  const anomalies = [];
  const safeLimit = Number.isFinite(Number(maxSinglePayment)) && Number(maxSinglePayment) >= 0
    ? Number(maxSinglePayment)
    : 15_000;

  const requests = [...purchaseRequests].sort((a, b) =>
    new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
  const seenPending = new Map();

  for (const request of requests) {
    const requestId = String(request._id || 'unknown-request');
    const status = String(request.status || 'unknown');
    const item = inventoryById.get(String(request.inventoryItemId || ''));
    const supplier = supplierById.get(String(request.supplierId || ''));
    const total = Number(request.totalCost);
    const finiteTotal = Number.isFinite(total) && total >= 0;
    const add = (type, severity, title, message, nextStep, evidence = {}) => {
      anomalies.push({
        id: requestId + ':' + type,
        type,
        severity,
        title,
        message,
        recordId: requestId,
        status,
        nextStep,
        evidence: { requestId, itemName: request.itemName || item?.name || null, sku: request.sku || item?.sku || null, supplierName: supplier?.name || null, ...evidence }
      });
    };

    if (ACTIVE_REQUEST_STATUSES.has(status) && !item) {
      add('missing_inventory_reference', 'high_priority_review', 'Inventory reference missing',
        'This purchase request references an inventory item that cannot be found in the current workspace.',
        'Verify the record link before processing the request.');
    }
    if (ACTIVE_REQUEST_STATUSES.has(status) && !supplier) {
      add('missing_supplier_reference', 'high_priority_review', 'Supplier reference missing',
        'This purchase request references a supplier that cannot be found in the current workspace.',
        'Verify the supplier record before processing the request.');
    } else if (ACTIVE_REQUEST_STATUSES.has(status) && supplier?.active === false) {
      add('inactive_supplier', 'high_priority_review', 'Inactive supplier on open request',
        'The supplier was deactivated after this request was created.',
        'Review supplier status and confirm the purchase should proceed.');
    }
    if (finiteTotal && total > safeLimit && status === 'pending') {
      add('purchase_over_limit', 'high_priority_review', 'Purchase exceeds single-request limit',
        'The request total is above the workspace configured limit and remains pending.',
        'Review the workspace purchase policy; this signal does not approve or release a payment.',
        { totalCost: total, maximumAllowed: safeLimit, currency: request.currency || 'USD' });
    }
    const expectedTotal = safeExpectedTotal(request);
    if (finiteTotal && expectedTotal !== null && Math.abs(total - expectedTotal) >= 0.02) {
      add('purchase_total_mismatch', 'high_priority_review', 'Purchase total does not reconcile',
        'The stored request total differs from unit cost multiplied by quantity.',
        'Check the request amount and underlying quantity/price fields before approval.',
        { storedTotal: total, calculatedTotal: expectedTotal, currency: request.currency || 'USD' });
    }
    if (['approved', 'rejected'].includes(status) && (!request.reviewedBy || !request.reviewedAt)) {
      add('review_metadata_missing', 'review_recommended', 'Review metadata incomplete',
        'The request has a reviewed status but is missing its reviewer or review timestamp.',
        'Verify the historical record and preserve evidence rather than silently editing the status.');
    }
    if (status === 'pending') {
      const createdAt = new Date(request.createdAt || 0).getTime();
      const key = requestKey(request);
      const previous = seenPending.get(key);
      if (Number.isFinite(createdAt) && createdAt > 0 && previous
        && createdAt - previous.createdAt >= 0
        && createdAt - previous.createdAt <= duplicateWindowMs) {
        add('possible_duplicate_request', 'review_recommended', 'Possible duplicate pending request',
          'Another pending request with the same item, supplier, quantity, unit cost, and currency was created within the last 24 hours.',
          'Compare both requests before approving either one.',
          { previousRequestId: previous.id, duplicateWindowHours: duplicateWindowMs / (60 * 60 * 1000) });
      }
      if (Number.isFinite(createdAt) && createdAt > 0) seenPending.set(key, { id: requestId, createdAt });
    }
  }

  const severityWeight = { high_priority_review: 0, review_recommended: 1 };
  anomalies.sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity]
    || a.title.localeCompare(b.title)
    || a.recordId.localeCompare(b.recordId));
  return {
    generatedAt: new Date(now).toISOString(),
    method: 'deterministic rules',
    isReadOnly: true,
    warning: 'These are review signals, not fraud determinations. No records, purchase states, or payments are changed.',
    count: anomalies.length,
    anomalies
  };
}
