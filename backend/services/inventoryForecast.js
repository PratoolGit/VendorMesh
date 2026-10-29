/**
 * Transparent inventory coverage baseline.
 *
 * Uses the workspace's configured dailyDemand field; it does not train on historical
 * sales, infer seasonality, or claim statistically validated forecast accuracy.
 */
export function forecastInventory(items, suppliers, { safetyBufferDays = 3 } = {}) {
  const supplierById = new Map((suppliers || []).map((supplier) => [String(supplier._id), supplier]));
  return (items || []).map((item) => {
    const dailyDemand = Number(item.dailyDemand);
    const onHand = Number(item.onHand);
    const reorderPoint = Number(item.reorderPoint);
    const supplier = item.supplierId ? supplierById.get(String(item.supplierId)) || null : null;
    const validDemand = Number.isFinite(dailyDemand) && dailyDemand > 0;
    const validStock = Number.isFinite(onHand) && onHand >= 0;
    const validReorderPoint = Number.isFinite(reorderPoint) && reorderPoint >= 0;
    const leadTimeDays = supplier && Number.isFinite(Number(supplier.leadTimeDays))
      ? Number(supplier.leadTimeDays)
      : null;
    const daysOfCover = validDemand && validStock ? onHand / dailyDemand : null;
    const targetDays = (leadTimeDays ?? 7) + safetyBufferDays;
    const targetStock = validDemand ? Math.ceil(dailyDemand * targetDays) : null;
    const suggestedReorderQuantity = validDemand && validStock
      ? Math.max(0, targetStock - onHand)
      : null;
    const stockoutRisk = !validDemand || !validStock
      ? 'insufficient_data'
      : daysOfCover <= (leadTimeDays ?? 7)
        ? 'high'
        : daysOfCover <= targetDays
          ? 'medium'
          : 'normal';

    return {
      inventoryItemId: String(item._id),
      sku: item.sku || '',
      name: item.name || 'Unnamed item',
      onHand: validStock ? onHand : null,
      reorderPoint: validReorderPoint ? reorderPoint : null,
      dailyDemand: validDemand ? dailyDemand : null,
      next7DaysDemand: validDemand ? Math.ceil(dailyDemand * 7) : null,
      next30DaysDemand: validDemand ? Math.ceil(dailyDemand * 30) : null,
      daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
      supplier: supplier ? {
        id: String(supplier._id),
        name: supplier.name,
        leadTimeDays
      } : null,
      targetStock,
      suggestedReorderQuantity,
      stockoutRisk,
      explanation: !validDemand
        ? 'Daily demand is missing or zero. Add a reasonable daily demand estimate before using this baseline.'
        : !validStock
          ? 'On-hand quantity is invalid; review the inventory record.'
          : stockoutRisk === 'high'
            ? 'Estimated stock cover is no longer than the supplier lead time (or the 7-day fallback when no active linked supplier is available).'
            : stockoutRisk === 'medium'
              ? 'Estimated stock cover is within the lead-time plus safety-buffer target.'
              : 'Current estimated stock cover exceeds the lead-time plus safety-buffer target.'
    };
  });
}
