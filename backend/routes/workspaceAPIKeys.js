import express from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import WorkspaceAPIKey from '../models/WorkspaceAPIKey.js';
import { normalizeAPIKeyRequest, createAPIKeyToken, hashAPIKeyToken } from '../services/workspaceAPIKeys.js';

export function createWorkspaceAPIKeysRouter({ requireSession, requireWorkspaceRole }) {
  const router = express.Router();
  const ownerOrAdmin = [requireSession, requireWorkspaceRole('owner', 'admin')];

  router.get('/', ...ownerOrAdmin, async (req, res, next) => {
    try {
      const companyId = new mongoose.Types.ObjectId(req.session.companyId);
      const keys = await WorkspaceAPIKey.find({ companyId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(100)
        .select('_id name keyPrefix scopes createdAt lastUsedAt expiresAt revokedAt')
        .lean();
      return res.json({
        keys: keys.map((key) => ({
          id: String(key._id),
          name: key.name,
          prefix: key.keyPrefix,
          scopes: key.scopes,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          revokedAt: key.revokedAt
        }))
      });
    } catch (error) { return next(error); }
  });

  router.post('/', ...ownerOrAdmin, async (req, res, next) => {
    const normalized = normalizeAPIKeyRequest(req.body);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    try {
      const id = new mongoose.Types.ObjectId();
      const token = createAPIKeyToken(String(id));
      const tokenPrefix = token.split('.')[0];
      const doc = await WorkspaceAPIKey.create({
        _id: id,
        companyId: new mongoose.Types.ObjectId(req.session.companyId),
        createdBy: new mongoose.Types.ObjectId(req.session.sub),
        name: normalized.value.name,
        keyPrefix: tokenPrefix,
        keyHash: hashAPIKeyToken(token),
        scopes: normalized.value.scopes,
        expiresAt: normalized.value.expiresAt
      });
      req.auditAction = 'api_key.created';
      return res.status(201).json({
        key: {
          id: String(doc._id),
          name: doc.name,
          prefix: doc.keyPrefix,
          token,
          scopes: doc.scopes,
          createdAt: doc.createdAt,
          expiresAt: doc.expiresAt
        },
        warning: 'Copy this token now. It is shown only once; only its hash is stored on the server.'
      });
    } catch (error) { return next(error); }
  });

  router.delete('/:id', ...ownerOrAdmin, async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid API key id.' });
    try {
      const revokedAt = new Date();
      const key = await WorkspaceAPIKey.findOneAndUpdate(
        { _id: req.params.id, companyId: req.session.companyId, revokedAt: null },
        { $set: { revokedAt } },
        { new: true }
      ).select('_id name keyPrefix scopes revokedAt').lean();
      if (!key) {
        const existing = await WorkspaceAPIKey.findOne({ _id: req.params.id, companyId: req.session.companyId }).select('_id').lean();
        if (!existing) return res.status(404).json({ error: 'API key not found in this workspace.' });
        return res.json({ id: req.params.id, revoked: true });
      }
      req.auditAction = 'api_key.revoked';
      return res.json({ id: String(key._id), revoked: true, revokedAt: key.revokedAt });
    } catch (error) { return next(error); }
  });

  return router;
}
