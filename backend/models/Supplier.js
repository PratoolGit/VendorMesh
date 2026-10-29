import mongoose from 'mongoose';

const SupplierSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  leadTimeDays: { type: Number, min: 0, max: 3650, default: 7 },
  reliabilityScore: { type: Number, min: 0, max: 100, default: 80 },
  paymentTerms: { type: String, trim: true, maxlength: 120, default: 'Net 30' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });
SupplierSchema.index({ companyId: 1, name: 1 });
export default mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);
