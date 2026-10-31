import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import PurchaseOrder from '../models/PurchaseOrder.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import InventoryItem from '../models/InventoryItem.js';
import GoodsReceipt from '../models/GoodsReceipt.js';
import { normalizeGoodsReceiptInput } from '../services/goodsReceiptValidation.js';

export function createWorkspaceGoodsReceiptsRouter({ requireSession, requireWorkspaceRole }) {
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
      const data = await GoodsReceipt.find({ companyId: new mongoose.Types.ObjectId(req.session.companyId) })
        .sort({ receivedAt: -1, _id: -1 }).limit(limit).lean();
      return res.json({ data, limit });
    } catch (error) { return next(error); }
  });

  router.get('/:id', requireSession, async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid purchase order id.' });
    try {
      const companyId = new mongoose.Types.ObjectId(req.session.companyId);
      const order = await PurchaseOrder.exists({ _id: req.params.id, companyId });
      if (!order) return res.status(404).json({ error: 'Purchase order not found in this workspace.' });
      const data = await GoodsReceipt.find({ companyId, purchaseOrderId: req.params.id }).sort({ receivedAt: -1 }).limit(100).lean();
      return res.json({ data });
    } catch (error) { return next(error); }
  });

  router.post('/:id', requireSession, requireWorkspaceRole('owner', 'admin', 'staff'), async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid purchase order id.' });
    const companyId = new mongoose.Types.ObjectId(req.session.companyId);
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
    const receiptNumber = `VM-GRN-${datePart}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    let session;
    let createdReceipt;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const order = await PurchaseOrder.findOne({ _id: req.params.id, companyId }).session(session).lean();
        if (!order) {
          const error = new Error('Purchase order not found in this workspace.');
          error.status = 404;
          throw error;
        }
        if (order.status === 'cancelled' || order.status === 'received') {
          const error = new Error('This purchase order is cancelled or already fully received.');
          error.status = 409;
          throw error;
        }
        const line = order.lineItems?.[0];
        if (!line) {
          const error = new Error('This purchase order has no receivable line item.');
          error.status = 409;
          throw error;
        }
        const request = await PurchaseRequest.findOne({
          _id: order.purchaseRequestId, companyId, status: { $in: ['ordered', 'partially_received'] }
        }).session(session).lean();
        if (!request) {
          const error = new Error('The linked purchase request is not available for receiving.');
          error.status = 409;
          throw error;
        }
        const inventoryItem = await InventoryItem.findOne({ _id: line.inventoryItemId, companyId }).session(session).lean();
        if (!inventoryItem) {
          const error = new Error('The linked inventory item no longer exists in this workspace.');
          error.status = 409;
          throw error;
        }

        // Reconcile quantities recorded by the earlier request-only receiving flow as accepted legacy stock.
        const storedReceived = Number(order.receivedQuantity || 0);
        const requestPreviouslyReceived = Number(request.receivedQuantity || 0);
        const legacyAcceptedQuantity = Math.max(0, requestPreviouslyReceived - storedReceived);
        const receivedQuantity = Math.max(storedReceived, requestPreviouslyReceived);
        const orderedQuantity = Number(line.quantity);
        const remainingQuantity = orderedQuantity - receivedQuantity;
        const normalized = normalizeGoodsReceiptInput(req.body, remainingQuantity);
        if (normalized.error) {
          const error = new Error(normalized.error);
          error.status = 400;
          throw error;
        }
        const quantities = normalized.value;
        const nextReceived = receivedQuantity + quantities.deliveredQuantity;
        const nextAccepted = Number(order.acceptedQuantity || 0) + legacyAcceptedQuantity + quantities.acceptedQuantity;
        const nextDamaged = Number(order.damagedQuantity || 0) + quantities.damagedQuantity;
        const nextStatus = nextReceived >= orderedQuantity ? 'received' : nextReceived > 0 ? 'partially_received' : order.status;
        const receiptRows = await GoodsReceipt.create([{
          companyId,
          purchaseOrderId: order._id,
          purchaseRequestId: request._id,
          inventoryItemId: inventoryItem._id,
          receiptNumber,
          poNumber: order.poNumber,
          supplierName: order.supplierSnapshot?.name || 'Supplier',
          itemName: line.itemName,
          sku: line.sku,
          currency: order.currency,
          ...quantities,
          legacyAcceptedQuantity,
          receivedBy: req.session.sub,
          receivedAt: now
        }], { session });
        createdReceipt = receiptRows[0].toObject();

        const orderFilter = {
          _id: order._id,
          companyId,
          status: { $in: ['issued', 'acknowledged', 'partially_received'] }
        };
        if (order.receivedQuantity === undefined) orderFilter.receivedQuantity = { $exists: false };
        else orderFilter.receivedQuantity = Number(order.receivedQuantity);
        const orderUpdate = await PurchaseOrder.updateOne(
          orderFilter,
          {
            $set: {
              receivedQuantity: nextReceived,
              acceptedQuantity: nextAccepted,
              damagedQuantity: nextDamaged,
              status: nextStatus,
              ...(nextStatus === 'received' ? { receivedAt: now } : {})
            }
          },
          { session }
        );
        if (orderUpdate.matchedCount !== 1) {
          const error = new Error('This purchase order changed during receiving. Refresh and record the goods again.');
          error.status = 409;
          throw error;
        }

        if (quantities.deliveredQuantity > 0) {
          const requestReceived = requestPreviouslyReceived + quantities.deliveredQuantity;
          const requestOrdered = Number(request.orderedQuantity || orderedQuantity);
          if (requestReceived > requestOrdered) {
            const error = new Error('The recorded delivery would exceed the linked purchase request quantity.');
            error.status = 409;
            throw error;
          }
          const requestStatus = requestReceived >= requestOrdered ? 'received' : 'partially_received';
          const requestUpdate = await PurchaseRequest.updateOne(
            { _id: request._id, companyId, receivedQuantity: requestPreviouslyReceived, status: { $in: ['ordered', 'partially_received'] } },
            {
              $set: { receivedQuantity: requestReceived, status: requestStatus, ...(requestStatus === 'received' ? { receivedAt: now } : {}) },
              $push: { statusHistory: { $each: [{
                status: requestStatus,
                changedBy: req.session.sub,
                changedAt: now,
                note: `Goods receipt ${receiptNumber}: ${quantities.acceptedQuantity} accepted, ${quantities.damagedQuantity} damaged, ${quantities.missingQuantity} missing`
              }], $slice: -50 } }
            },
            { session }
          );
          if (requestUpdate.matchedCount !== 1) {
            const error = new Error('The linked purchase request changed during receiving. Refresh and try again.');
            error.status = 409;
            throw error;
          }
        }

        const inventoryIncrease = legacyAcceptedQuantity + quantities.acceptedQuantity;
        if (inventoryIncrease > 0) {
          const inventoryUpdate = await InventoryItem.updateOne(
            { _id: inventoryItem._id, companyId },
            { $inc: { onHand: inventoryIncrease } },
            { session }
          );
          if (inventoryUpdate.matchedCount !== 1) {
            const error = new Error('Inventory could not be updated for the accepted goods.');
            error.status = 409;
            throw error;
          }
        }
      });
      req.auditAction = 'goods_receipt.recorded';
      return res.status(201).json(createdReceipt);
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: 'The GRN number collided. Please retry the receipt.' });
      return next(error);
    } finally {
      if (session) await session.endSession();
    }
  });

  return router;
}
