import mongoose from 'mongoose';

const InventoryItemSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  onHand: { type: Number, required: true, min: 0, default: 0 },
  reorderPoint: { type: Number, required: true, min: 0, default: 0 },
  unitCost: { type: Number, required: true, min: 0, default: 0 },
  dailyDemand: { type: Number, min: 0, default: 0 },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null }
}, { timestamps: true });
InventoryItemSchema.index({ companyId: 1, sku: 1 }, { unique: true });
export default mongoose.models.InventoryItem || mongoose.model('InventoryItem', InventoryItemSchema);
