import mongoose from 'mongoose';

const PurchaseOrderLineSchema = new mongoose.Schema({
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  itemName: { type: String, required: true, trim: true, maxlength: 180 },
  quantity: { type: Number, required: true, min: 1, max: 1000000 },
  unitCost: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, required: true, min: 0 }
}, { _id: false });

const PurchaseOrderSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  purchaseRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest', required: true },
  poNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  buyerSnapshot: {
    companyName: { type: String, required: true, trim: true, maxlength: 120 }
  },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierSnapshot: {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' }
  },
  lineItems: { type: [PurchaseOrderLineSchema], required: true, validate: value => value.length > 0 && value.length <= 100 },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  subtotal: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  issuedAt: { type: Date, required: true, default: Date.now },
  expectedDeliveryDate: { type: Date, required: true },
  paymentTerms: { type: String, required: true, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  receivedQuantity: { type: Number, min: 0, max: 1000000, default: 0 },
  acceptedQuantity: { type: Number, min: 0, max: 1000000, default: 0 },
  damagedQuantity: { type: Number, min: 0, max: 1000000, default: 0 },
  receivedAt: { type: Date, default: null },
  status: { type: String, enum: ['issued', 'acknowledged', 'partially_received', 'received', 'cancelled'], default: 'issued', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, versionKey: false });

PurchaseOrderSchema.index({ companyId: 1, poNumber: 1 }, { unique: true });
PurchaseOrderSchema.index({ companyId: 1, purchaseRequestId: 1 }, { unique: true });
PurchaseOrderSchema.index({ companyId: 1, issuedAt: -1 });

export default mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', PurchaseOrderSchema);
