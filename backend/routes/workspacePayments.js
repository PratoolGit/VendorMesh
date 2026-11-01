import express from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import { normalizePaymentInput, normalizePaymentReversal } from '../services/paymentValidation.js';

export function createWorkspacePaymentsRouter({ requireSession, requireWorkspaceRole }) {
  const router = express.Router();

  router.get('/', requireSession, async (req, res, next) => {
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    if (typeof rawLimit !== 'undefined' && (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit))) {
      return res.status(400).json({ error: 'limit must be an integer from 1 to 200.' });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      return res.status(400).json({ error: 'limit must be an integer from 1 to 200.' });
    }
    try {
      const data = await Payment.find({ companyId: new mongoose.Types.ObjectId(req.session.companyId) })
        .sort({ paidAt: -1, _id: -1 }).limit(limit)
        .select('_id invoiceId invoiceNumber supplierId supplierName amount currency method reference paidAt notes recordType reversesPaymentId reversalReason createdBy createdAt')
        .lean();
      return res.json({ data, limit });
    } catch (error) { return next(error); }
  });

  router.post('/invoices/:id', requireSession, requireWorkspaceRole('owner', 'admin', 'staff'), async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid invoice id.' });
    const companyId = new mongoose.Types.ObjectId(req.session.companyId);
    let session;
    try {
      session = await mongoose.startSession();
      let createdPayment;
      await session.withTransaction(async () => {
        const invoice = await Invoice.findOne({ _id: req.params.id, companyId }).session(session).lean();
        if (!invoice) {
          const error = new Error('Invoice not found in this workspace.');
          error.status = 404;
          throw error;
        }
        if (invoice.status !== 'approved') {
          const error = new Error('Payments can only be recorded against approved invoices.');
          error.status = 409;
          throw error;
        }
        const alreadyPaid = Math.round(Number(invoice.paidAmount || 0) * 100) / 100;
        const invoiceTotal = Math.round(Number(invoice.total) * 100) / 100;
        const outstanding = Math.round((invoiceTotal - alreadyPaid) * 100) / 100;
        if (outstanding <= 0) {
          const error = new Error('This invoice is already fully paid.');
          error.status = 409;
          throw error;
        }
        const normalized = normalizePaymentInput(req.body, outstanding);
        if (normalized.error) {
          const error = new Error(normalized.error);
          error.status = 400;
          throw error;
        }
        const paidCents = Math.round(alreadyPaid * 100) + Math.round(normalized.value.amount * 100);
        const totalCents = Math.round(invoiceTotal * 100);
        const nextPaidAmount = paidCents / 100;
        const paymentStatus = paidCents >= totalCents ? 'paid' : 'partially_paid';

        const rows = await Payment.create([{
          companyId,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          supplierId: invoice.supplierId,
          supplierName: invoice.supplierName,
          amount: normalized.value.amount,
          recordType: 'payment',
          currency: invoice.currency,
          method: normalized.value.method,
          reference: normalized.value.reference,
          paidAt: normalized.value.paidAt,
          notes: normalized.value.notes,
          createdBy: req.session.sub
        }], { session });
        createdPayment = rows[0].toObject();

        const paidFilter = invoice.paidAmount === undefined || invoice.paidAmount === null
          ? { $or: [{ paidAmount: { $exists: false } }, { paidAmount: null }] }
          : { paidAmount: invoice.paidAmount };
        const updated = await Invoice.updateOne(
          { _id: invoice._id, companyId, status: 'approved', ...paidFilter, total: invoice.total },
          { $set: { paidAmount: nextPaidAmount, paymentStatus } },
          { session }
        );
        if (updated.matchedCount !== 1) {
          const error = new Error('This invoice balance changed while recording the payment. Refresh and try again.');
          error.status = 409;
          throw error;
        }
      });
      req.auditAction = 'invoice.payment_recorded';
      return res.status(201).json(createdPayment);
    } catch (error) { return next(error); }
    finally { if (session) await session.endSession(); }
  });


  router.post('/:id/reverse', requireSession, requireWorkspaceRole('owner', 'admin'), async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid payment id.' });
    const normalized = normalizePaymentReversal(req.body);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    const companyId = new mongoose.Types.ObjectId(req.session.companyId);
    let session;
    try {
      session = await mongoose.startSession();
      let reversal;
      await session.withTransaction(async () => {
        const original = await Payment.findOne({
          _id: req.params.id, companyId, recordType: { $ne: 'reversal' }
        }).session(session).lean();
        if (!original) {
          const error = new Error('Payment entry not found in this workspace.');
          error.status = 404;
          throw error;
        }
        const priorReversal = await Payment.findOne({ companyId, reversesPaymentId: original._id }).session(session).lean();
        if (priorReversal) {
          const error = new Error('This payment has already been reversed.');
          error.status = 409;
          throw error;
        }
        const invoice = await Invoice.findOne({
          _id: original.invoiceId, companyId, status: 'approved'
        }).session(session).lean();
        if (!invoice) {
          const error = new Error('The approved invoice linked to this payment is unavailable.');
          error.status = 409;
          throw error;
        }
        const alreadyPaid = Math.round(Number(invoice.paidAmount || 0) * 100) / 100;
        const reversalAmount = Math.round(Number(original.amount) * 100) / 100;
        if (alreadyPaid + 0.000001 < reversalAmount) {
          const error = new Error('The current invoice paid balance is lower than this payment; manual reconciliation is required.');
          error.status = 409;
          throw error;
        }
        const nextPaidAmount = Math.round((alreadyPaid - reversalAmount) * 100) / 100;
        const totalCents = Math.round(Number(invoice.total) * 100);
        const nextPaidCents = Math.round(nextPaidAmount * 100);
        const paymentStatus = nextPaidCents >= totalCents ? 'paid' : nextPaidCents > 0 ? 'partially_paid' : 'unpaid';
        const paidFilter = invoice.paidAmount === undefined || invoice.paidAmount === null
          ? { $or: [{ paidAmount: { $exists: false } }, { paidAmount: null }] }
          : { paidAmount: invoice.paidAmount };
        const updated = await Invoice.updateOne(
          { _id: invoice._id, companyId, status: 'approved', ...paidFilter, total: invoice.total },
          { $set: { paidAmount: nextPaidAmount, paymentStatus } },
          { session }
        );
        if (updated.matchedCount !== 1) {
          const error = new Error('This invoice balance changed while reversing the payment. Refresh and try again.');
          error.status = 409;
          throw error;
        }
        const rows = await Payment.create([{
          companyId,
          invoiceId: original.invoiceId,
          invoiceNumber: original.invoiceNumber,
          supplierId: original.supplierId,
          supplierName: original.supplierName,
          amount: reversalAmount,
          recordType: 'reversal',
          reversesPaymentId: original._id,
          reversalReason: normalized.value.reason,
          currency: original.currency,
          method: original.method,
          reference: original.reference ? `REV-${original.reference}` : 'PAYMENT-REVERSAL',
          paidAt: new Date(),
          notes: `Reversal of payment ${original._id}: ${normalized.value.reason}`,
          createdBy: req.session.sub
        }], { session });
        reversal = rows[0].toObject();
      });
      req.auditAction = 'invoice.payment_reversed';
      return res.status(201).json(reversal);
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: 'This payment has already been reversed.' });
      return next(error);
    } finally { if (session) await session.endSession(); }
  });

  return router;
}
