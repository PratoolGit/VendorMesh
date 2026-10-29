export function simulatePricing({ basePrice, unitCost, baselineUnits, elasticity = 1.2, competitorPrice = null }) {
  const values = [basePrice, unitCost, baselineUnits, elasticity];
  if (!values.every(Number.isFinite) || basePrice <= 0 || unitCost < 0 || baselineUnits < 0 || elasticity < 0 || elasticity > 5) {
    throw new Error('Provide a positive base price, non-negative cost and units, and elasticity between 0 and 5.');
  }
  if (competitorPrice !== null && (!Number.isFinite(competitorPrice) || competitorPrice <= 0)) {
    throw new Error('Competitor price must be a positive number when provided.');
  }

  const changes = [-20, -10, 0, 10, 20];
  const scenarios = changes.map((changePercent) => {
    const price = Math.round(basePrice * (1 + changePercent / 100) * 100) / 100;
    const ratio = price / basePrice;
    const predictedUnits = Math.max(0, Math.round(baselineUnits * Math.pow(ratio, -elasticity)));
    const revenue = Math.round(price * predictedUnits * 100) / 100;
    const grossProfit = Math.round((price - unitCost) * predictedUnits * 100) / 100;
    const marginPercent = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0;
    return {
      changePercent, price, predictedUnits, revenue, grossProfit, marginPercent,
      competitorPrice,
      versusCompetitorPercent: competitorPrice ? Math.round(((price / competitorPrice) - 1) * 10000) / 100 : null
    };
  });
  const bestProfit = scenarios.reduce((best, current) => current.grossProfit > best.grossProfit ? current : best, scenarios[0]);
  return {
    method: 'price-elasticity scenario estimate',
    advisoryOnly: true,
    assumptions: { basePrice, unitCost, baselineUnits, elasticity, competitorPrice },
    warning: 'Illustrative estimates only; validate elasticity and real demand before changing prices. No prices are changed automatically.',
    scenarios,
    highestEstimatedGrossProfit: bestProfit
  };
}
