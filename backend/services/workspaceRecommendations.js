import { rankSuppliers } from './supplierMatching.js';

export function buildWorkspaceRecommendations(items, suppliers) {
  const rankedSuppliers = rankSuppliers(suppliers);
  const validSuppliers = rankedSuppliers.map(entry => entry.supplier);
  const supplierById = new Map(validSuppliers.map(supplier => [String(supplier._id), supplier]));
  return items.map(item => {
    const daysOfCover = item.dailyDemand > 0 ? item.onHand / item.dailyDemand : null;
    const linkedSupplier = item.supplierId ? supplierById.get(String(item.supplierId)) : null;
    const supplier = linkedSupplier || validSuppliers[0] || null;
    const selectedRanking = supplier ? rankedSuppliers.find(entry => String(entry.supplier._id) === String(supplier._id))?.ranking : null;
    const leadTimeDays = supplier?.leadTimeDays ?? null;
    const targetDays = leadTimeDays === null ? 7 : leadTimeDays + 3;
    const targetStock = item.dailyDemand > 0 ? Math.ceil(item.dailyDemand * targetDays) : item.reorderPoint;
    const shortage = Math.max(0, targetStock - item.onHand);
    const lowStock = item.onHand <= item.reorderPoint;
    const shouldReplenish = lowStock || (daysOfCover !== null && daysOfCover <= targetDays);
    const reasons = [];
    if (lowStock) reasons.push('On-hand quantity is at or below the reorder point.');
    if (daysOfCover !== null && leadTimeDays !== null && daysOfCover <= leadTimeDays) reasons.push('Estimated stock cover is no longer than the supplier lead time.');
    else if (daysOfCover !== null && daysOfCover <= targetDays) reasons.push('Stock cover is within the lead-time plus 3-day safety buffer.');
    if (!supplier) reasons.push('No active linked supplier; choose one before raising a purchase request.');
    return {
      inventoryItemId: String(item._id), sku: item.sku, name: item.name,
      onHand: item.onHand, reorderPoint: item.reorderPoint, dailyDemand: item.dailyDemand || 0,
      daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
      suggestedQuantity: shouldReplenish ? shortage || Math.max(1, item.reorderPoint - item.onHand + 1) : 0,
      priority: lowStock || (daysOfCover !== null && leadTimeDays !== null && daysOfCover <= leadTimeDays) ? 'high' : shouldReplenish ? 'medium' : 'normal',
      supplier: supplier ? { id: String(supplier._id), name: supplier.name, leadTimeDays: supplier.leadTimeDays, reliabilityScore: supplier.reliabilityScore } : null,
      supplierLinked: Boolean(linkedSupplier),
      supplierMatch: supplier ? { method: 'rules-based', score: selectedRanking?.score ?? null, reliabilityWeight: 0.7, leadTimeWeight: 0.3, leadTimeScore: selectedRanking?.leadTimeScore ?? null, explanation: linkedSupplier ? 'Existing active supplier link; score shows the stored reliability and lead-time factors.' : 'Highest weighted score among active suppliers with valid reliability and lead-time data; review before use.' } : null,
      reasons, action: shouldReplenish ? 'review_purchase_request' : 'monitor'
    };
  }).filter(item => item.priority !== 'normal')
    .sort((a, b) => ({ high: 0, medium: 1 }[a.priority] - { high: 0, medium: 1 }[b.priority] || (b.suggestedQuantity - a.suggestedQuantity)));
}
