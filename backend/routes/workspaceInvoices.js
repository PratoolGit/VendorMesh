import express from 'express';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import Supplier from '../models/Supplier.js';
import { normalizeInvoiceInput, compareInvoiceWithPurchase } from '../services/invoiceValidation.js';

const allowedStatuses = new Set(['pending_review', 'approved', 'rejected']);

export function createWorkspaceInvoicesRouter({ requireSession, requireWorkspaceRole }) {
  const router = express.Router();

  router.get('/', requireSession, async (req, res, next) => {
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (typeof rawLimit !== 'undefined' && (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit))) {
      return res.status(400).json({ error: 'limit must be an integer from 1 to 100.' });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'limit must be an integer from 1 to 100.' });
    const filter = { companyId: new mongoose.Types.ObjectId(req.session.companyId) };
    if (req.query.after !== undefined) {
      if (typeof req.query.after !== 'string' || !mongoose.isValidObjectId(req.query.after)) return res.status(400).json({ error: 'after must be a valid object id.' });
      filter._id = { $lt: new mongoose.Types.ObjectId(req.query.after) };
    }
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string' || !allowedStatuses.has(req.query.status)) return res.status(400).json({ error: 'Unsupported invoice status filter.' });
      filter.status = req.query.status;
    }
    try {
      const rows = await Invoice.find(filter).sort({ _id: -1 }).limit(limit)
        .select('_id purchaseRequestId supplierId supplierName itemName sku purchaseRequestTotal invoiceNumber invoiceDate dueDate currency subtotal taxTotal total status createdBy reviewedBy reviewedAt reviewNote createdAt updatedAt')
        .lean();
      return res.json({
        data: rows,
        limit,
        nextCursor: rows.length === limit ? String(rows[rows.length - 1]._id) : null
      });
    } catch (error) { return next(error); }
  });

  router.post('/', requireSession, requireWorkspaceRole('owner', 'admin', 'staff'), async (req, res, next) => {
    const normalized = normalizeInvoiceInput(req.body);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    const companyId = new mongoose.Types.ObjectId(req.session.companyId);
    try {
      const request = await PurchaseRequest.findOne({
        _id: normalized.value.purchaseRequestId,
        companyId
      }).lean();
      if (!request) return res.status(404).json({ error: 'Purchase request not found in this workspace.' });
      if (!['approved', 'ordered', 'partially_received', 'received'].includes(request.status)) {
        return res.status(409).json({ error: 'Invoices can only be recorded against approved or fulfilled purchase requests.' });
      }
      if (normalized.value.currency !== request.currency) {
        return res.status(400).json({ error: 'Invoice currency must match the linked purchase request currency.' });
      }
      const supplier = await Supplier.findOne({ _id: request.supplierId, companyId }).select('name').lean();
      if (!supplier) return res.status(409).json({ error: 'The supplier linked to this purchase request is not available in this workspace.' });

      const created = await Invoice.create({
        companyId,
        purchaseRequestId: request._id,
        supplierId: request.supplierId,
        supplierName: supplier.name,
        itemName: request.itemName,
        sku: request.sku,
        purchaseRequestTotal: request.totalCost,
        invoiceNumber: normalized.value.invoiceNumber,
        invoiceDate: normalized.value.invoiceDate,
        dueDate: normalized.value.dueDate,
        currency: request.currency,
        subtotal: normalized.value.subtotal,
        taxTotal: normalized.value.taxTotal,
        total: normalized.value.total,
        status: 'pending_review',
        createdBy: req.session.sub
      });
      req.auditAction = 'invoice.created';
      return res.status(201).json(created);
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: 'This supplier invoice number already exists in this workspace.' });
      return next(error);
    }
  });

  router.post('/:id/review', requireSession, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid invoice id.' });
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be approved or rejected.' });
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (note.length > 1000) return res.status(400).json({ error: 'Review note must be no longer than 1000 characters.' });
    if (decision === 'rejected' && note.length < 3) return res.status(400).json({ error: 'Add a short reason when rejecting an invoice.' });

    try {
      const companyId = new mongoose.Types.ObjectId(req.session.companyId);
      const invoice = await Invoice.findOne({ _id: req.params.id, companyId, status: 'pending_review' }).lean();
      if (!invoice) return res.status(404).json({ error: 'Pending invoice not found in this workspace.' });
      const request = await PurchaseRequest.findOne({ _id: invoice.purchaseRequestId, companyId }).lean();
      if (!request) return res.status(409).json({ error: 'Linked purchase request is unavailable; invoice review is blocked.' });
      const comparison = compareInvoiceWithPurchase(invoice, request);
      if (decision === 'approved' && comparison.mismatch && note.length < 5) {
        return res.status(409).json({ error: `Invoice differs from the purchase request. Add a review note (at least 5 characters) describing the discrepancy override. ${comparison.reason}` });
      }
      const reviewedAt = new Date();
      const updated = await Invoice.findOneAndUpdate(
        { _id: invoice._id, companyId, status: 'pending_review', updatedAt: invoice.updatedAt },
        { $set: {
          status: decision,
          reviewedBy: new mongoose.Types.ObjectId(req.session.sub),
          reviewedAt,
          reviewNote: note
        } },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) return res.status(409).json({ error: 'This invoice changed while it was being reviewed. Refresh and try again.' });
      req.auditAction = decision === 'approved' ? 'invoice.approved' : 'invoice.rejected';
      return res.json(updated);
    } catch (error) { return next(error); }
  });

  return router;
}
