import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import InventoryItem from '../models/InventoryItem.js';
import Supplier from '../models/Supplier.js';
import { forecastInventory } from '../services/inventoryForecast.js';
import { buildWorkspaceRecommendations } from '../services/workspaceRecommendations.js';
import Company from '../models/Company.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import { detectWorkspaceAnomalies } from '../services/workspaceAnomalies.js';

export function createWorkspaceInsightsRouter({ requireSession, requireWorkspaceRole }) {
  const router = express.Router();
  const companyScope = (req) => ({ companyId: new mongoose.Types.ObjectId(req.session.companyId) });

  // Explainable, deterministic replenishment guidance; this endpoint never creates orders.
  router.get('/recommendations', requireSession, async (req, res, next) => {
    try {
      const scope = companyScope(req);
      const [items, suppliers] = await Promise.all([
        InventoryItem.find(scope).sort({ name: 1 }).limit(1000).lean(),
        Supplier.find({ ...scope, active: true }).sort({ reliabilityScore: -1, leadTimeDays: 1 }).limit(1000).lean()
      ]);
      const recommendations = buildWorkspaceRecommendations(items, suppliers);
      res.json({ generatedAt: new Date().toISOString(), method: 'rules-based', autoOrdersCreated: 0, recommendations });
    } catch (error) { next(error); }
  });

  router.get('/anomalies', requireSession, async (req, res, next) => {
    try {
      const scope = companyScope(req);
      const [requests, items, suppliers, company] = await Promise.all([
        PurchaseRequest.find(scope).sort({ createdAt: -1 }).limit(500).lean(),
        InventoryItem.find(scope).select('_id name sku').limit(1000).lean(),
        Supplier.find(scope).select('_id name active').limit(1000).lean(),
        Company.findById(req.session.companyId).select('settings').lean()
      ]);
      const configuredLimit = Number(company?.settings?.maxSinglePayment ?? process.env.MAX_SINGLE_PAYMENT ?? 15_000);
      return res.json(detectWorkspaceAnomalies({
        purchaseRequests: requests,
        inventoryItems: items,
        suppliers,
        maxSinglePayment: Number.isFinite(configuredLimit) ? configuredLimit : 15_000
      }));
    } catch (error) { return next(error); }
  });

  router.get('/forecast', requireSession, async (req, res, next) => {
    try {
      const scope = companyScope(req);
      const [items, suppliers] = await Promise.all([
        InventoryItem.find(scope).sort({ name: 1 }).limit(1000).lean(),
        Supplier.find({ ...scope, active: true }).select('_id name leadTimeDays').limit(1000).lean()
      ]);
      return res.json({
        generatedAt: new Date().toISOString(),
        method: 'configured daily-demand baseline',
        historicalSalesUsed: false,
        limitation: 'Estimates use the daily demand value configured on each inventory record. No historical sales series or seasonality model is available in this baseline.',
        forecasts: forecastInventory(items, suppliers)
      });
    } catch (error) { return next(error); }
  });

  router.get('/team', requireSession, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
    try {
      const users = await User.find({ 'memberships.companyId': req.session.companyId })
        .select('name email memberships createdAt disabled').sort({ name: 1 }).lean();
      const members = users.map((user) => {
        const membership = user.memberships.find((m) => String(m.companyId) === String(req.session.companyId));
        return membership ? {
          id: String(user._id), name: user.name, email: user.email,
          role: membership.role, status: user.disabled ? 'suspended' : membership.status,
          joinedAt: user.createdAt
        } : null;
      }).filter(Boolean);
      res.json(members);
    } catch (error) { next(error); }
  });

  router.patch('/team/:userId', requireSession, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: 'Invalid team member id.' });
      const { role, status } = req.body || {};
      if (role !== undefined && !['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Role must be admin or staff. Ownership cannot be reassigned here.' });
      if (status !== undefined && !['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Status must be active or suspended.' });
      if (req.session.role !== 'owner' && role === 'admin') return res.status(403).json({ error: 'Only the workspace owner can grant admin access.' });
      if (String(req.params.userId) === String(req.session.sub)) return res.status(400).json({ error: 'You cannot change your own team access.' });
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ error: 'Team member not found.' });
      const membership = user.memberships.find((m) => String(m.companyId) === String(req.session.companyId));
      if (!membership) return res.status(404).json({ error: 'Team member is not part of this workspace.' });
      if (membership.role === 'owner') return res.status(403).json({ error: 'The workspace owner cannot be changed through team management.' });
      if (role !== undefined) membership.role = role;
      if (status !== undefined) membership.status = status;
      await user.save();
      req.auditAction = role !== undefined && status !== undefined
        ? 'team.updated'
        : role !== undefined ? 'team.role_changed' : 'team.access_changed';
      req.auditResource = '/api/workspace/team/' + String(user._id);
      res.json({ id: String(user._id), name: user.name, email: user.email, role: membership.role, status: user.disabled ? 'suspended' : membership.status });
    } catch (error) { next(error); }
  });

  return router;
}
