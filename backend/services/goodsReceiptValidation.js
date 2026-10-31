export function normalizeGoodsReceiptInput(body, remainingQuantity) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide goods receipt quantities.' };
  const allowed = new Set(['expectedQuantity', 'deliveredQuantity', 'acceptedQuantity', 'damagedQuantity', 'discrepancyNotes']);
  if (Object.keys(body).some(key => !allowed.has(key))) return { error: 'Unsupported goods receipt field.' };

  const readQuantity = (field, fallback) => {
    const value = body[field] === undefined ? fallback : Number(body[field]);
    return Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : null;
  };
  const expectedQuantity = readQuantity('expectedQuantity', null);
  const deliveredQuantity = readQuantity('deliveredQuantity', null);
  const acceptedQuantity = readQuantity('acceptedQuantity', null);
  const damagedQuantity = readQuantity('damagedQuantity', 0);
  if (expectedQuantity === null || expectedQuantity < 1) return { error: 'Expected quantity must be a whole number from 1 to 1,000,000.' };
  if (!Number.isSafeInteger(remainingQuantity) || remainingQuantity < 1) return { error: 'This purchase order has no outstanding quantity to receive.' };
  if (expectedQuantity > remainingQuantity) return { error: 'Expected quantity cannot exceed the outstanding purchase order quantity.' };
  if (deliveredQuantity === null || deliveredQuantity > expectedQuantity) return { error: 'Delivered quantity must be a whole number no greater than the expected quantity.' };
  if (acceptedQuantity === null || damagedQuantity === null || acceptedQuantity + damagedQuantity !== deliveredQuantity) {
    return { error: 'Accepted quantity plus damaged quantity must equal the delivered quantity.' };
  }
  const discrepancyNotes = body.discrepancyNotes === undefined ? '' : body.discrepancyNotes;
  if (typeof discrepancyNotes !== 'string' || discrepancyNotes.trim().length > 1000) {
    return { error: 'Discrepancy notes must be text up to 1,000 characters.' };
  }
  const missingQuantity = expectedQuantity - deliveredQuantity;
  if ((damagedQuantity > 0 || missingQuantity > 0) && discrepancyNotes.trim().length < 3) {
    return { error: 'Add a short note describing the damaged or missing quantity.' };
  }
  return {
    value: {
      expectedQuantity,
      deliveredQuantity,
      acceptedQuantity,
      damagedQuantity,
      missingQuantity,
      discrepancyNotes: discrepancyNotes.trim()
    }
  };
}
