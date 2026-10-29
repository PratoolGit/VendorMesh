const SUPPLIER_STRING_FIELDS = {
  name: { max: 180, required: true },
  email: { max: 254, required: false },
  paymentTerms: { max: 120, required: false },
  notes: { max: 2000, required: false }
};

export function normalizeSupplierPatch(body, role) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Provide supplier fields to update.' };
  }

  const patch = {};
  for (const [field, config] of Object.entries(SUPPLIER_STRING_FIELDS)) {
    if (body[field] === undefined) continue;
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
