import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import InventoryItem from '../models/InventoryItem.js';
import Supplier from '../models/Supplier.js';
import { forecastInventory } from '../services/inventoryForecast.js';
import { rankSuppliers } from '../services/supplierMatching.js';

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
      const rankedSuppliers = rankSuppliers(suppliers);
      const validSuppliers = rankedSuppliers.map((entry) => entry.supplier);
      const supplierById = new Map(validSuppliers.map((supplier) => [String(supplier._id), supplier]));
      const recommendations = items.map((item) => {
        const daysOfCover = item.dailyDemand > 0 ? item.onHand / item.dailyDemand : null;
        const linkedSupplier = item.supplierId ? supplierById.get(String(item.supplierId)) : null;
        const supplier = linkedSupplier || validSuppliers[0] || null;
        const selectedRanking = supplier ? rankedSuppliers.find((entry) => String(entry.supplier._id) === String(supplier._id))?.ranking : null;
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
      }).filter((item) => item.priority !== 'normal')
        .sort((a, b) => ({ high: 0, medium: 1 }[a.priority] - { high: 0, medium: 1 }[b.priority] || (b.suggestedQuantity - a.suggestedQuantity)));
      res.json({ generatedAt: new Date().toISOString(), method: 'rules-based', autoOrdersCreated: 0, recommendations });
    } catch (error) { next(error); }
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
