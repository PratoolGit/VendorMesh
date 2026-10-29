import express from 'express';
import mongoose from 'mongoose';
import WorkspaceAPIKey from '../models/WorkspaceAPIKey.js';
import User from '../models/User.js';
import InventoryItem from '../models/InventoryItem.js';
import Supplier from '../models/Supplier.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { parseAPIKeyToken, hashAPIKeyToken, constantTimeHashMatches } from '../services/workspaceAPIKeys.js';

function parseLimit(raw) {
  if (raw === undefined) return 50;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= 100 ? value : null;
}

function parseCursor(raw) {
  if (raw === undefined || raw === '') return { value: null };
  if (typeof raw !== 'string' || !mongoose.isValidObjectId(raw)) return { error: 'after must be a valid object id.' };
  return { value: new mongoose.Types.ObjectId(raw) };
}

function parseBooleanFilter(raw, fieldName) {
  if (raw === undefined) return { value: null };
  if (raw === 'true') return { value: true };
  if (raw === 'false') return { value: false };
  return { error: `${fieldName} must be true or false.` };
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey?.scopes?.includes(scope)) {
      return res.status(403).json({ error: `This API key does not have the required scope: ${scope}.` });
    }
    next();
  };
}

function authenticateAPIKey() {
  return async (req, res, next) => {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const parsed = parseAPIKeyToken(token);
    if (!parsed) return res.status(401).json({ error: 'Valid workspace API key required.' });

    try {
      const now = new Date();
      const key = await WorkspaceAPIKey.findOne({
        _id: parsed.id,
        revokedAt: null,
        expiresAt: { $gt: now }
      }).select('+keyHash').lean();
      if (!key) return res.status(401).json({ error: 'API key is invalid, revoked, or expired.' });
      const suppliedHash = hashAPIKeyToken(token);
      if (!constantTimeHashMatches(key.keyHash, suppliedHash)) {
        return res.status(401).json({ error: 'API key is invalid, revoked, or expired.' });
      }

      // Tie the key's continuing validity to its creator's active owner/admin membership.
      const user = await User.findById(key.createdBy).select('memberships disabled').lean();
      const membership = user?.memberships?.find((item) =>
        String(item.companyId) === String(key.companyId) && item.status === 'active'
      );
      if (!user || user.disabled || !membership || !['owner', 'admin'].includes(membership.role)) {
        return res.status(401).json({ error: 'The API key owner no longer has active administrative access.' });
      }

      await WorkspaceAPIKey.updateOne(
        { _id: key._id, keyHash: key.keyHash, revokedAt: null },
        { $set: { lastUsedAt: now } }
      );
      req.apiKey = {
        id: String(key._id),
        companyId: String(key.companyId),
        actorUserId: String(key.createdBy),
        scopes: key.scopes
      };
      return next();
    } catch (error) { return next(error); }
  };
}

function paginationResult(rows, limit, serialize = (row) => row) {
  return {
    data: rows.map(serialize),
    limit,
    nextCursor: rows.length === limit ? String(rows[rows.length - 1]._id) : null
  };
}

export function createPublicAPIRouter() {
  const router = express.Router();
  // Process-local defense in depth; use a shared edge/store before running multiple instances.
  router.use(createRateLimiter({ windowMs: 60_000, maxRequests: 240 }));
  router.use(authenticateAPIKey());
  router.use(createRateLimiter({
    windowMs: 60_000,
    maxRequests: 120,
    keyGenerator: (req) => req.apiKey?.id || 'invalid-key'
  }));

  router.get('/inventory', requireScope('inventory:read'), async (req, res, next) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) return res.status(400).json({ error: 'limit must be an integer from 1 to 100.' });
    const cursor = parseCursor(req.query.after);
    if (cursor.error) return res.status(400).json({ error: cursor.error });
    const filter = { companyId: new mongoose.Types.ObjectId(req.apiKey.companyId) };
    if (cursor.value) filter._id = { $gt: cursor.value };
    if (req.query.sku !== undefined) {
      if (typeof req.query.sku !== 'string' || req.query.sku.trim().length < 1 || req.query.sku.trim().length > 80) {
        return res.status(400).json({ error: 'sku filter must be 1–80 characters.' });
      }
      filter.sku = req.query.sku.trim().toUpperCase();
    }
    const lowStock = parseBooleanFilter(req.query.lowStock, 'lowStock');
    if (lowStock.error) return res.status(400).json({ error: lowStock.error });
    if (lowStock.value === true) filter.$expr = { $lte: ['$onHand', '$reorderPoint'] };
    if (lowStock.value === false) filter.$expr = { $gt: ['$onHand', '$reorderPoint'] };

    try {
      const rows = await InventoryItem.find(filter)
        .sort({ _id: 1 }).limit(limit)
        .select('_id sku name onHand reorderPoint unitCost dailyDemand supplierId createdAt updatedAt')
        .lean();
      return res.json(paginationResult(rows, limit));
    } catch (error) { return next(error); }
  });

  router.get('/suppliers', requireScope('suppliers:read'), async (req, res, next) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) return res.status(400).json({ error: 'limit must be an integer from 1 to 100.' });
    const cursor = parseCursor(req.query.after);
    if (cursor.error) return res.status(400).json({ error: cursor.error });
    const filter = { companyId: new mongoose.Types.ObjectId(req.apiKey.companyId) };
    if (cursor.value) filter._id = { $gt: cursor.value };
    const active = parseBooleanFilter(req.query.active, 'active');
    if (active.error) return res.status(400).json({ error: active.error });
    if (active.value !== null) filter.active = active.value;
    if (req.query.name !== undefined) {
      if (typeof req.query.name !== 'string' || req.query.name.trim().length < 1 || req.query.name.trim().length > 180) {
        return res.status(400).json({ error: 'name filter must be 1–180 characters.' });
      }
      filter.name = { $regex: '^' + req.query.name.trim().replace(/[.*+?^{}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    try {
      const rows = await Supplier.find(filter)
        .sort({ _id: 1 }).limit(limit)
        .select('_id name email leadTimeDays reliabilityScore paymentTerms active createdAt updatedAt')
        .lean();
      return res.json(paginationResult(rows, limit));
    } catch (error) { return next(error); }
  });

  router.get('/purchase-requests', requireScope('purchasing:read'), async (req, res, next) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) return res.status(400).json({ error: 'limit must be an integer from 1 to 100.' });
    const cursor = parseCursor(req.query.after);
    if (cursor.error) return res.status(400).json({ error: cursor.error });
    const filter = { companyId: new mongoose.Types.ObjectId(req.apiKey.companyId) };
    if (cursor.value) filter._id = { $gt: cursor.value };
    const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'ordered', 'partially_received', 'received', 'cancelled']);
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string' || !allowedStatuses.has(req.query.status)) {
        return res.status(400).json({ error: 'status filter is not supported.' });
      }
      filter.status = req.query.status;
    }
    try {
      const rows = await PurchaseRequest.find(filter)
        .sort({ _id: 1 }).limit(limit)
        .select('_id inventoryItemId supplierId sku itemName quantity orderedQuantity receivedQuantity unitCost totalCost currency status createdAt updatedAt reviewedBy reviewedAt orderedAt receivedAt')
        .lean();
      return res.json(paginationResult(rows, limit));
    } catch (error) { return next(error); }
  });

  return router;
}
