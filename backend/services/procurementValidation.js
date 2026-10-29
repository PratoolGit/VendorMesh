const SUPPLIER_STRING_FIELDS = {
  name: { max: 180, required: true },
  email: { max: 254, required: false },
  paymentTerms: { max: 120, required: false },
  notes: { max: 2000, required: false }
};

export function normalizeSupplierCreate(body, role) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Provide supplier details.' };
  }
  const allowed = new Set(['name', 'email', 'leadTimeDays', 'reliabilityScore', 'paymentTerms', 'notes']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { error: 'Unsupported supplier field.' };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 180) return { error: 'Supplier name must be 2–180 characters.' };

  const email = body.email === undefined ? '' : body.email;
  if (typeof email !== 'string' || email.trim().length > 254
    || (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
    return { error: 'Enter a valid supplier email address.' };
  }

  const hasProtectedFields = ['leadTimeDays', 'reliabilityScore', 'paymentTerms'].some((field) => body[field] !== undefined);
  if (role === 'staff' && hasProtectedFields) {
    return { status: 403, error: 'Only owners and admins can set supplier lead time, reliability, or payment terms. Staff can add the supplier contact details.' };
  }

  const leadTimeDays = body.leadTimeDays === undefined ? 7 : Number(body.leadTimeDays);
  const reliabilityScore = body.reliabilityScore === undefined ? 80 : Number(body.reliabilityScore);
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 3650) {
    return { error: 'Lead time must be between 0 and 3650 days.' };
  }
  if (!Number.isFinite(reliabilityScore) || reliabilityScore < 0 || reliabilityScore > 100) {
    return { error: 'Reliability score must be between 0 and 100.' };
  }

  const paymentTerms = body.paymentTerms === undefined ? 'Net 30' : body.paymentTerms;
  const notes = body.notes === undefined ? '' : body.notes;
  if (typeof paymentTerms !== 'string' || paymentTerms.trim().length > 120) {
    return { error: 'Payment terms must be text up to 120 characters.' };
  }
  if (typeof notes !== 'string' || notes.trim().length > 2000) {
    return { error: 'Supplier notes must be text up to 2000 characters.' };
  }

  return {
    supplier: {
      name,
      email: email.trim().toLowerCase(),
      leadTimeDays,
      reliabilityScore,
      paymentTerms: paymentTerms.trim() || 'Net 30',
      notes: notes.trim()
    }
  };
}

export function normalizeSupplierPatch(body, role) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Provide supplier fields to update.' };
  }

  const patch = {};
  for (const [field, config] of Object.entries(SUPPLIER_STRING_FIELDS)) {
    if (body[field] === undefined) continue;
    if (field === 'paymentTerms' && role === 'staff') return { status: 403, error: 'Only owners and admins can change supplier payment terms.' };
    if (typeof body[field] !== 'string') return { error: `${field} must be text.` };
    const value = body[field].trim();
    if (value.length > config.max) return { error: `${field} must be no longer than ${config.max} characters.` };
    if (config.required && value.length < 2) return { error: 'Supplier name must be at least 2 characters.' };
    if (field === 'email' && value && (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
      return { error: 'Enter a valid supplier email address.' };
    }
    patch[field] = field === 'email' ? value.toLowerCase() : value;
  }

  for (const [field, min, max] of [['leadTimeDays', 0, 3650], ['reliabilityScore', 0, 100]]) {
    if (body[field] === undefined) continue;
    if (typeof body[field] === 'string' && !body[field].trim()) return { error: `${field} must be a number in the allowed range.` };
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < min || value > max) {
      return { error: `${field} must be between ${min} and ${max}.` };
    }
    if (role === 'staff') return { status: 403, error: 'Only owners and admins can change supplier scoring and lead-time settings.' };
    patch[field] = value;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return { error: 'active must be a boolean.' };
    if (role === 'staff') return { status: 403, error: 'Only owners and admins can activate or deactivate a supplier.' };
    patch.active = body.active;
  }

  const allowed = new Set([...Object.keys(SUPPLIER_STRING_FIELDS), 'leadTimeDays', 'reliabilityScore', 'active']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { error: 'Unsupported supplier field.' };
  if (Object.keys(patch).length === 0) return { error: 'Provide at least one supplier field to update.' };
  return { patch };
}

export function calculatePurchaseTotal(unitCost, quantity) {
  if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 100_000_000) {
    return { error: 'Enter a valid non-negative unit cost.' };
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    return { error: 'Quantity must be a whole number between 1 and 1,000,000.' };
  }
  const roundedUnitCost = Math.round(unitCost * 100) / 100;
  const cents = roundedUnitCost * quantity * 100;
  if (!Number.isFinite(cents) || !Number.isSafeInteger(Math.round(cents))) {
    return { error: 'Purchase total exceeds the safe calculation range. Reduce the unit cost or quantity.' };
  }
  return { totalCost: Math.round(cents) / 100 };
}
