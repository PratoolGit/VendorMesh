import mongoose from 'mongoose';

const PurchaseRequestSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  itemName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1, max: 1000000 },
  unitCost: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, required: true, min: 0 },
  currency: { type: String, uppercase: true, default: 'USD', match: /^[A-Z]{3}$/ },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'ordered', 'partially_received', 'received', 'cancelled'], default: 'pending', index: true },
  orderedQuantity: { type: Number, min: 0, max: 1000000, default: 0 },
  receivedQuantity: { type: Number, min: 0, max: 1000000, default: 0 },
  orderedAt: { type: Date, default: null },
  receivedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  statusHistory: [{
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'ordered', 'partially_received', 'received', 'cancelled'], required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, maxlength: 500, default: '' }
  }],
  rationale: { type: String, trim: true, maxlength: 2000, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true });
PurchaseRequestSchema.index({ companyId: 1, createdAt: -1 });
export default mongoose.models.PurchaseRequest || mongoose.model('PurchaseRequest', PurchaseRequestSchema);
