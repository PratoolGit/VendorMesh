import mongoose from 'mongoose';

const GoodsReceiptSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
  purchaseRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest', required: true },
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  receiptNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  poNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  supplierName: { type: String, required: true, trim: true, maxlength: 180 },
  itemName: { type: String, required: true, trim: true, maxlength: 180 },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  expectedQuantity: { type: Number, required: true, min: 1, max: 1000000 },
  deliveredQuantity: { type: Number, required: true, min: 0, max: 1000000 },
  acceptedQuantity: { type: Number, required: true, min: 0, max: 1000000 },
  damagedQuantity: { type: Number, required: true, min: 0, max: 1000000 },
  legacyAcceptedQuantity: { type: Number, min: 0, max: 1000000, default: 0 },
  missingQuantity: { type: Number, required: true, min: 0, max: 1000000 },
  discrepancyNotes: { type: String, trim: true, maxlength: 1000, default: '' },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receivedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true, versionKey: false });

GoodsReceiptSchema.index({ companyId: 1, receiptNumber: 1 }, { unique: true });
GoodsReceiptSchema.index({ companyId: 1, purchaseOrderId: 1, receivedAt: -1 });

export default mongoose.models.GoodsReceipt || mongoose.model('GoodsReceipt', GoodsReceiptSchema);
