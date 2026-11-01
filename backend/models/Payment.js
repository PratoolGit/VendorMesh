import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: { type: String, required: true, trim: true, maxlength: 180 },
  amount: { type: Number, required: true, min: 0.01, max: 100000000 },
  recordType: { type: String, enum: ['payment', 'reversal'], default: 'payment', index: true },
  reversesPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
  reversalReason: { type: String, trim: true, maxlength: 500, default: '' },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  method: { type: String, enum: ['bank_transfer', 'upi', 'cash', 'cheque', 'card', 'other'], required: true },
  reference: { type: String, trim: true, maxlength: 100, default: '' },
  paidAt: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, versionKey: false });

PaymentSchema.index({ companyId: 1, paidAt: -1 });
PaymentSchema.index({ companyId: 1, invoiceId: 1, paidAt: -1 });
PaymentSchema.index({ companyId: 1, reversesPaymentId: 1 }, { unique: true, partialFilterExpression: { reversesPaymentId: { $type: 'objectId' } } });

export default mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
