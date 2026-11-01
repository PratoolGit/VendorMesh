const MAX_PAYMENT_AMOUNT = 100_000_000;
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;
const METHODS = new Set(['bank_transfer', 'upi', 'cash', 'cheque', 'card', 'other']);

export function normalizePaymentInput(body, outstanding, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide payment details.' };
  const allowed = new Set(['amount', 'method', 'reference', 'paidAt', 'notes']);
  if (Object.keys(body).some(key => !allowed.has(key))) return { error: 'Unsupported payment field.' };

  if ((typeof body.amount !== 'number' && typeof body.amount !== 'string') || String(body.amount).trim() === '') {
    return { error: 'Payment amount must be a valid number.' };
  }
  const amount = Number(body.amount);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isFinite(cents) || !Number.isSafeInteger(cents)
    || cents < 1 || cents > MAX_SAFE_CENTS || amount > MAX_PAYMENT_AMOUNT) {
    return { error: `Payment amount must be between 0.01 and ${MAX_PAYMENT_AMOUNT}.` };
  }
  const outstandingCents = Math.round(Number(outstanding) * 100);
  if (!Number.isSafeInteger(outstandingCents) || outstandingCents < 0) return { error: 'Invoice outstanding balance is invalid.' };
  if (cents > outstandingCents) return { error: 'Payment cannot exceed the invoice outstanding balance.' };

  if (typeof body.method !== 'string' || !METHODS.has(body.method)) {
    return { error: 'Choose a supported payment method.' };
  }
  const reference = body.reference === undefined ? '' : body.reference;
  if (typeof reference !== 'string' || reference.trim().length > 100 || /[\r\n\u0000-\u001f]/.test(reference)) {
    return { error: 'Payment reference must be printable text up to 100 characters.' };
  }
  const notes = body.notes === undefined ? '' : body.notes;
  if (typeof notes !== 'string' || notes.trim().length > 500) return { error: 'Payment notes must be text up to 500 characters.' };

  let paidAt = now;
  if (body.paidAt !== undefined && body.paidAt !== '') {
    if (typeof body.paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.paidAt)) {
      return { error: 'Payment date must use YYYY-MM-DD format.' };
    }
    paidAt = new Date(`${body.paidAt}T00:00:00.000Z`);
    if (!Number.isFinite(paidAt.getTime()) || paidAt.toISOString().slice(0, 10) !== body.paidAt) {
      return { error: 'Enter a valid payment date.' };
    }
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (paidAt > today) return { error: 'Payment date cannot be in the future.' };
  }

  return {
    value: {
      amount: cents / 100,
      method: body.method,
      reference: reference.trim(),
      paidAt,
      notes: notes.trim()
    }
  };
}

export function normalizePaymentReversal(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide a reversal reason.' };
  if (Object.keys(body).some(key => key !== 'reason')) return { error: 'Unsupported reversal field.' };
  if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 500) {
    return { error: 'Reversal reason must contain 3–500 characters.' };
  }
  return { value: { reason: body.reason.trim() } };
}
