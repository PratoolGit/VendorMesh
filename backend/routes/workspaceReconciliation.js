import express from 'express';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import { buildReconciliation } from '../services/reconciliation.js';

export function createWorkspaceReconciliationRouter({ requireSession, requireWorkspaceRole }) {
  const router = express.Router();

  router.get('/', requireSession, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
    try {
      const companyId = new mongoose.Types.ObjectId(req.session.companyId);
      const [requestsWindow, invoices] = await Promise.all([
        PurchaseRequest.find({ companyId }).sort({ createdAt: -1 }).limit(500).lean(),
        Invoice.find({ companyId }).sort({ createdAt: -1 }).limit(1000).lean()
      ]);
      const linkedIds = [...new Set(invoices.map((invoice) => String(invoice.purchaseRequestId)))];
      const idsInWindow = new Set(requestsWindow.map((request) => String(request._id)));
      const missingIds = linkedIds.filter((id) => !idsInWindow.has(id)).filter((id) => mongoose.isValidObjectId(id));
      const linkedRequests = missingIds.length
        ? await PurchaseRequest.find({ companyId, _id: { $in: missingIds } }).lean()
        : [];
      const requestMap = new Map([...requestsWindow, ...linkedRequests].map((request) => [String(request._id), request]));
      const allRequests = [...requestMap.values()];
      const result = buildReconciliation({ purchaseRequests: allRequests, invoices });
      return res.json({
        ...result,
        window: {
          recentPurchaseRequestsLoaded: requestsWindow.length,
          invoicesLoaded: invoices.length,
          purchaseRequestWindowLimit: 500,
          invoiceWindowLimit: 1000
        }
      });
    } catch (error) { return next(error); }
  });

  return router;
}
