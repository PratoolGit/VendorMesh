export function normalizePurchaseOrderOptions(body, supplier, now = new Date()) {
  if (body === undefined) body = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide purchase order options.' };
  const allowed = new Set(['expectedDeliveryDate', 'paymentTerms', 'notes']);
  if (Object.keys(body).some(key => !allowed.has(key))) return { error: 'Unsupported purchase order field.' };

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let expectedDeliveryDate;
  if (body.expectedDeliveryDate === undefined || body.expectedDeliveryDate === '') {
    const leadTime = Number.isFinite(Number(supplier?.leadTimeDays)) ? Math.max(0, Math.min(3650, Number(supplier.leadTimeDays))) : 7;
    expectedDeliveryDate = new Date(today);
    expectedDeliveryDate.setUTCDate(expectedDeliveryDate.getUTCDate() + leadTime);
  } else {
    if (typeof body.expectedDeliveryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.expectedDeliveryDate)) {
      return { error: 'Expected delivery date must use YYYY-MM-DD.' };
    }
    expectedDeliveryDate = new Date(`${body.expectedDeliveryDate}T00:00:00.000Z`);
    if (!Number.isFinite(expectedDeliveryDate.getTime()) || expectedDeliveryDate.toISOString().slice(0, 10) !== body.expectedDeliveryDate) {
      return { error: 'Enter a valid expected delivery date.' };
    }
    const maximum = new Date(today);
    maximum.setUTCDate(maximum.getUTCDate() + 3650);
    if (expectedDeliveryDate < today || expectedDeliveryDate > maximum) {
      return { error: 'Expected delivery date must be today or within the next 10 years.' };
    }
  }

  const paymentTerms = body.paymentTerms === undefined ? (supplier?.paymentTerms || 'Net 30') : body.paymentTerms;
  if (typeof paymentTerms !== 'string' || paymentTerms.trim().length < 1 || paymentTerms.trim().length > 120) {
    return { error: 'Payment terms must contain 1–120 characters.' };
  }
  const notes = body.notes === undefined ? '' : body.notes;
  if (typeof notes !== 'string' || notes.trim().length > 2000) {
    return { error: 'Purchase order notes must be text up to 2000 characters.' };
  }

  return { value: { expectedDeliveryDate, paymentTerms: paymentTerms.trim(), notes: notes.trim() } };
}
