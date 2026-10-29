import express from 'express';
import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';

export function createAuditRouter({ requireSession, requireWorkspaceRole }) {
  const router = express.Router();

  router.get('/', requireSession, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
    try {
      const limitValue = Number.parseInt(req.query.limit, 10);
      const limit = Number.isFinite(limitValue) ? Math.min(100, Math.max(1, limitValue)) : 50;
      const companyId = new mongoose.Types.ObjectId(req.session.companyId);
      const filter = { companyId };
      if (req.query.before !== undefined) {
        const before = new Date(String(req.query.before));
        if (Number.isNaN(before.getTime())) {
          return res.status(400).json({ error: 'before must be a valid date.' });
        }
        filter.occurredAt = { $lt: before };
      }

      const entries = await AuditLog.find(filter)
        .sort({ occurredAt: -1, _id: -1 })
        .limit(limit)
        .select('actorUserId actorRole action resource statusCode occurredAt requestId')
        .lean();

      return res.json({
        entries,
        limit,
        nextBefore: entries.length ? entries[entries.length - 1].occurredAt : null
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
