/**
 * Explainable supplier ranking, intentionally using only values stored in the workspace.
 * Invalid or inactive suppliers are excluded instead of being assigned fabricated scores.
 */
export function scoreSupplier(supplier) {
  if (!supplier || supplier.active !== true) return null;
  const reliability = Number(supplier.reliabilityScore);
  const leadTimeDays = Number(supplier.leadTimeDays);
  if (!Number.isFinite(reliability) || reliability < 0 || reliability > 100) return null;
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 3650) return null;
  const leadTimeScore = Math.max(0, 100 - (leadTimeDays / 3.65));
  return {
    id: String(supplier._id),
    score: Math.round(((reliability * 0.7) + (leadTimeScore * 0.3)) * 100) / 100,
    reliabilityScore: reliability,
    leadTimeDays,
    leadTimeScore: Math.round(leadTimeScore * 100) / 100,
    name: String(supplier.name || 'Unnamed supplier')
  };
}

export function rankSuppliers(suppliers) {
  return (Array.isArray(suppliers) ? suppliers : [])
    .map((supplier) => ({ supplier, ranking: scoreSupplier(supplier) }))
    .filter((entry) => entry.ranking !== null)
    .sort((a, b) =>
      b.ranking.score - a.ranking.score
      || a.ranking.leadTimeDays - b.ranking.leadTimeDays
      || b.ranking.reliabilityScore - a.ranking.reliabilityScore
      || a.ranking.name.localeCompare(b.ranking.name)
    );
}
