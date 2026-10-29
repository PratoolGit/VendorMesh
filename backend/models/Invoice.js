import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  purchaseRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest', required: true, index: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: { type: String, required: true, trim: true, maxlength: 180 },
  itemName: { type: String, required: true, trim: true, maxlength: 180 },
  sku: { type: String, required: true, trim: true, maxlength: 80 },
  purchaseRequestTotal: { type: Number, required: true, min: 0 },
  invoiceNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, default: null },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  subtotal: { type: Number, required: true, min: 0 },
  taxTotal: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending_review', 'approved', 'rejected'], default: 'pending_review', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true, versionKey: false });

InvoiceSchema.index({ companyId: 1, createdAt: -1 });
InvoiceSchema.index({ companyId: 1, supplierId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ companyId: 1, purchaseRequestId: 1, status: 1 });

export default mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
