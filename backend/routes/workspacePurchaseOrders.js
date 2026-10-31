import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import PurchaseOrder from '../models/PurchaseOrder.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import Supplier from '../models/Supplier.js';
import Company from '../models/Company.js';
import { normalizePurchaseOrderOptions } from '../services/purchaseOrderValidation.js';

export function createWorkspacePurchaseOrdersRouter({ requireSession, requireWorkspaceRole }) {
  const router = express.Router();

  router.get('/', requireSession, async (req, res, next) => {
    try {
      const rawLimit = req.query.limit;
      const limit = rawLimit === undefined ? 100 : Number(rawLimit);
      if (typeof rawLimit !== 'undefined' && (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit))) {
        return res.status(400).json({ error: 'limit must be an integer from 1 to 100.' });
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ error: 'limit must be an integer from 1 to 100.' });
      }
      const filter = { companyId: new mongoose.Types.ObjectId(req.session.companyId) };
      if (req.query.status !== undefined) {
        const statuses = new Set(['issued', 'acknowledged', 'partially_received', 'received', 'cancelled']);
        if (typeof req.query.status !== 'string' || !statuses.has(req.query.status)) {
          return res.status(400).json({ error: 'Unsupported purchase order status filter.' });
        }
        filter.status = req.query.status;
      }
      const data = await PurchaseOrder.find(filter).sort({ issuedAt: -1, _id: -1 }).limit(limit).lean();
      return res.json({ data, limit });
    } catch (error) { return next(error); }
  });

  router.post('/from-request/:id', requireSession, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid purchase request id.' });
    const companyId = new mongoose.Types.ObjectId(req.session.companyId);
    try {
      const request = await PurchaseRequest.findOne({ _id: req.params.id, companyId }).lean();
      if (!request) return res.status(404).json({ error: 'Purchase request not found in this workspace.' });
      if (request.status !== 'approved') {
        return res.status(409).json({ error: 'A purchase order can only be issued from an approved purchase request.' });
      }
      const [supplier, company] = await Promise.all([
        Supplier.findOne({ _id: request.supplierId, companyId }).lean(),
        Company.findById(companyId).select('name').lean()
      ]);
      if (!supplier || !company) return res.status(409).json({ error: 'The linked supplier or workspace is no longer available.' });
      const normalized = normalizePurchaseOrderOptions(req.body, supplier);
      if (normalized.error) return res.status(400).json({ error: normalized.error });

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
      const poNumber = `VM-PO-${datePart}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const order = await PurchaseOrder.create({
        companyId,
        purchaseRequestId: request._id,
        poNumber,
        buyerSnapshot: { companyName: company.name },
        supplierId: supplier._id,
        supplierSnapshot: { name: supplier.name, email: supplier.email || '' },
        lineItems: [{
          inventoryItemId: request.inventoryItemId,
          sku: request.sku,
          itemName: request.itemName,
          quantity: request.quantity,
          unitCost: request.unitCost,
          totalCost: request.totalCost
        }],
        currency: request.currency,
        subtotal: request.totalCost,
        total: request.totalCost,
        issuedAt: now,
        expectedDeliveryDate: normalized.value.expectedDeliveryDate,
        paymentTerms: normalized.value.paymentTerms,
        notes: normalized.value.notes,
        status: 'issued',
        createdBy: req.session.sub
      });

      // Compare-and-set prevents two managers from issuing separate POs for the same approved request.
      const updatedRequest = await PurchaseRequest.findOneAndUpdate(
        { _id: request._id, companyId, status: 'approved', updatedAt: request.updatedAt },
        {
          $set: { status: 'ordered', orderedQuantity: request.quantity, receivedQuantity: 0, orderedAt: now },
          $push: { statusHistory: { $each: [{
            status: 'ordered',
            changedBy: req.session.sub,
            changedAt: now,
            note: `Formal purchase order ${poNumber} issued`
          }], $slice: -50 } }
        },
        { new: true, runValidators: true }
      );
      if (!updatedRequest) {
        await PurchaseOrder.deleteOne({ _id: order._id, companyId });
        return res.status(409).json({ error: 'This request changed while its purchase order was being issued. Refresh and try again.' });
      }

      req.auditAction = 'purchase_order.issued';
      return res.status(201).json(order);
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'A purchase order already exists for this request, or the generated PO number collided. Refresh the order register.' });
      }
      return next(error);
    }
  });

  return router;
}
