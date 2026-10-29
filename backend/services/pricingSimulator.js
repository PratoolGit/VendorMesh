const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

function roundMoney(value, label) {
  const cents = value * 100;
  if (!Number.isFinite(value) || !Number.isFinite(cents) || Math.abs(cents) > MAX_SAFE_CENTS) {
    throw new Error(`${label} exceeds the safe calculation range. Reduce the inputs and try again.`);
  }
  return Math.round(cents) / 100;
}

export function simulatePricing({ basePrice, unitCost, baselineUnits, elasticity = 1.2, competitorPrice = null }) {
  const values = [basePrice, unitCost, baselineUnits, elasticity];
  if (!values.every(Number.isFinite) || basePrice <= 0 || unitCost < 0 || baselineUnits < 0 || elasticity < 0 || elasticity > 5) {
    throw new Error('Provide a positive base price, non-negative cost and units, and elasticity between 0 and 5.');
  }
  if (!Number.isSafeInteger(baselineUnits)) {
    throw new Error('Baseline units must be a non-negative whole number within the safe integer range.');
  }
  if (competitorPrice !== null && (!Number.isFinite(competitorPrice) || competitorPrice <= 0)) {
    throw new Error('Competitor price must be a positive number when provided.');
  }

  const normalizedBasePrice = roundMoney(basePrice, 'Base price');
  const normalizedUnitCost = roundMoney(unitCost, 'Unit cost');
  const normalizedCompetitorPrice = competitorPrice === null ? null : roundMoney(competitorPrice, 'Competitor price');
  if (normalizedBasePrice <= 0) throw new Error('Base price must be at least 0.01.');
  if (normalizedCompetitorPrice !== null && normalizedCompetitorPrice <= 0) {
    throw new Error('Competitor price must be at least 0.01.');
  }

  const changes = [-20, -10, 0, 10, 20];
  const scenarios = changes.map((changePercent) => {
    const price = roundMoney(normalizedBasePrice * (1 + changePercent / 100), 'Scenario price');
    const ratio = price / normalizedBasePrice;
    const rawPredictedUnits = baselineUnits * Math.pow(ratio, -elasticity);
    if (!Number.isFinite(rawPredictedUnits) || !Number.isSafeInteger(Math.round(rawPredictedUnits))) {
      throw new Error('Inputs produce an unsafe predicted unit count. Reduce the baseline units and try again.');
    }
    const predictedUnits = Math.max(0, Math.round(rawPredictedUnits));
    const revenue = roundMoney(price * predictedUnits, 'Estimated revenue');
    const grossProfit = roundMoney((price - normalizedUnitCost) * predictedUnits, 'Estimated gross profit');
    const marginPercent = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0;
    if (!Number.isFinite(marginPercent)) throw new Error('Inputs produced an invalid margin. Reduce the inputs and try again.');

    let versusCompetitorPercent = null;
    if (normalizedCompetitorPrice !== null) {
      versusCompetitorPercent = Math.round(((price / normalizedCompetitorPrice) - 1) * 10000) / 100;
      if (!Number.isFinite(versusCompetitorPercent) || Math.abs(versusCompetitorPercent) > Number.MAX_SAFE_INTEGER) {
        throw new Error('Competitor comparison exceeds the safe calculation range. Check the supplied price.');
      }
    }

    return {
      changePercent, price, predictedUnits, revenue, grossProfit, marginPercent,
      competitorPrice: normalizedCompetitorPrice,
      versusCompetitorPercent
    };
  });
  const bestProfit = scenarios.reduce((best, current) => current.grossProfit > best.grossProfit ? current : best, scenarios[0]);
  return {
    method: 'price-elasticity scenario estimate',
    advisoryOnly: true,
    assumptions: {
      basePrice: normalizedBasePrice,
      unitCost: normalizedUnitCost,
      baselineUnits,
      elasticity,
      competitorPrice: normalizedCompetitorPrice
    },
    warning: 'Illustrative estimates only; validate elasticity and real demand before changing prices. No prices are changed automatically.',
    scenarios,
    highestEstimatedGrossProfit: bestProfit
  };
}
