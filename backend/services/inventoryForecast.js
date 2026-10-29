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
    const validDemand = Number.isFinite(dailyDemand) && dailyDemand > 0
      && Number.isSafeInteger(Math.ceil(dailyDemand * 30));
    const validStock = Number.isFinite(onHand) && onHand >= 0 && onHand <= Number.MAX_SAFE_INTEGER;
    const validReorderPoint = Number.isFinite(reorderPoint) && reorderPoint >= 0 && reorderPoint <= Number.MAX_SAFE_INTEGER;
    const leadTimeDays = supplier && Number.isFinite(Number(supplier.leadTimeDays))
      ? Number(supplier.leadTimeDays)
      : null;
    const rawDaysOfCover = validDemand && validStock ? onHand / dailyDemand : null;
    const daysOfCover = rawDaysOfCover !== null && Number.isFinite(rawDaysOfCover)
      && Number.isFinite(rawDaysOfCover * 10)
      ? Math.round(rawDaysOfCover * 10) / 10
      : null;
    const targetDays = (leadTimeDays ?? 7) + safetyBufferDays;
    const targetStockIsSafe = validDemand && Number.isSafeInteger(Math.ceil(dailyDemand * targetDays));
    const targetStock = targetStockIsSafe ? Math.ceil(dailyDemand * targetDays) : null;
    const suggestedReorderQuantity = targetStockIsSafe && validStock
      ? Math.max(0, targetStock - onHand)
      : null;
    const stockoutRisk = !validDemand || !validStock || !targetStockIsSafe
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
      daysOfCover,
      supplier: supplier ? {
        id: String(supplier._id),
        name: supplier.name,
        leadTimeDays
      } : null,
      targetStock,
      suggestedReorderQuantity,
      stockoutRisk,
      explanation: !validDemand
        ? 'Daily demand is missing, zero, or too large for a safe projection. Add a reasonable daily demand estimate.'
        : !validStock
          ? 'On-hand quantity is invalid or outside the safe calculation range; review the inventory record.'
          : !targetStockIsSafe
            ? 'Demand and supplier lead time exceed safe calculation bounds; review these values.'
          : stockoutRisk === 'high'
            ? 'Estimated stock cover is no longer than the supplier lead time (or the 7-day fallback when no active linked supplier is available).'
            : stockoutRisk === 'medium'
              ? 'Estimated stock cover is within the lead-time plus safety-buffer target.'
              : 'Current estimated stock cover exceeds the lead-time plus safety-buffer target.'
    };
  });
}
