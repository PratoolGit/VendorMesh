const MAX_INVOICE_AMOUNT = 100_000_000;
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

function normalizeMoney(value, field, { allowZero = true } = {}) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    return { error: `${field} must be a valid amount.` };
  }
  const numeric = Number(value);
  const cents = Math.round(numeric * 100);
  if (!Number.isFinite(numeric) || !Number.isFinite(cents) || Math.abs(cents) > MAX_SAFE_CENTS
    || numeric < (allowZero ? 0 : 0.01) || numeric > MAX_INVOICE_AMOUNT) {
    return { error: `${field} must be between ${allowZero ? '0' : '0.01'} and ${MAX_INVOICE_AMOUNT}.` };
  }
  return { value: cents / 100, cents };
}

function parseISODate(value, field, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return { value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: `${field} must use YYYY-MM-DD format.` };
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { error: `${field} is not a valid calendar date.` };
  }
  return { value: parsed };
}

export function normalizeInvoiceInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide invoice details.' };
  const allowed = new Set(['purchaseRequestId', 'invoiceNumber', 'invoiceDate', 'dueDate', 'currency', 'subtotal', 'taxTotal', 'total']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { error: 'Unsupported invoice field.' };

  if (typeof body.purchaseRequestId !== 'string' || !/^[a-f0-9]{24}$/i.test(body.purchaseRequestId)) {
    return { error: 'Choose a valid purchase request.' };
  }

  if (typeof body.invoiceNumber !== 'string') return { error: 'Invoice number is required.' };
  const invoiceNumber = body.invoiceNumber.trim().toUpperCase();
  if (invoiceNumber.length < 2 || invoiceNumber.length > 100 || /[\r\n\u0000-\u001f]/.test(invoiceNumber)) {
    return { error: 'Invoice number must be 2–100 printable characters.' };
  }

  const invoiceDate = parseISODate(body.invoiceDate, 'invoiceDate');
  if (invoiceDate.error) return invoiceDate;
  const dueDate = parseISODate(body.dueDate, 'dueDate', true);
  if (dueDate.error) return dueDate;
  if (dueDate.value && dueDate.value < invoiceDate.value) return { error: 'Due date cannot be earlier than the invoice date.' };

  if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/i.test(body.currency.trim())) {
    return { error: 'Currency must be a three-letter ISO code.' };
  }
  const currency = body.currency.trim().toUpperCase();

  const subtotal = normalizeMoney(body.subtotal, 'subtotal', { allowZero: false });
  if (subtotal.error) return subtotal;
  const taxTotal = normalizeMoney(body.taxTotal, 'taxTotal');
  if (taxTotal.error) return taxTotal;
  const total = normalizeMoney(body.total, 'total', { allowZero: false });
  if (total.error) return total;
  if (Math.abs((subtotal.cents + taxTotal.cents) - total.cents) > 1) {
    return { error: 'Invoice total must equal subtotal plus tax, within one cent.' };
  }

  return {
    value: {
      purchaseRequestId: body.purchaseRequestId,
      invoiceNumber,
      invoiceDate: invoiceDate.value,
      dueDate: dueDate.value,
      currency,
      subtotal: subtotal.value,
      taxTotal: taxTotal.value,
      total: total.value
    }
  };
}

export function compareInvoiceWithPurchase(invoice, purchaseRequest) {
  const invoiceTotalCents = Math.round(Number(invoice.total) * 100);
  const purchaseTotalCents = Math.round(Number(purchaseRequest.totalCost) * 100);
  const safe = Number.isSafeInteger(invoiceTotalCents) && Number.isSafeInteger(purchaseTotalCents);
  if (!safe) return { mismatch: true, difference: null, reason: 'Amount could not be safely compared.' };
  const differenceCents = invoiceTotalCents - purchaseTotalCents;
  return {
    mismatch: Math.abs(differenceCents) > 1 || invoice.currency !== purchaseRequest.currency,
    difference: differenceCents / 100,
    reason: invoice.currency !== purchaseRequest.currency
      ? 'Invoice currency differs from the purchase request currency.'
      : Math.abs(differenceCents) > 1
        ? 'Invoice total differs from the approved purchase request total.'
        : 'Invoice total matches the purchase request within one cent.'
  };
}
