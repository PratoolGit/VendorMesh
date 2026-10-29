import express from 'express';
import { simulatePricing } from '../services/pricingSimulator.js';

export function createPricingSimulatorRouter({ requireSession }) {
  const router = express.Router();
  router.post('/', requireSession, (req, res) => {
    const body = req.body || {};
    const basePrice = Number(body.basePrice);
    const unitCost = Number(body.unitCost);
    const baselineUnits = Number(body.baselineUnits);
    const elasticity = body.elasticity === undefined ? 1.2 : Number(body.elasticity);
    const competitorPrice = body.competitorPrice === undefined || body.competitorPrice === '' ? null : Number(body.competitorPrice);
    try {
      return res.json(simulatePricing({ basePrice, unitCost, baselineUnits, elasticity, competitorPrice }));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });
  return router;
}
