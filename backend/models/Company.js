import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  currency: { type: String, default: 'USD', uppercase: true, match: /^[A-Z]{3}$/ },
  settings: {
    initialBalance: { type: Number, default: 25000, min: 0 },
    minimumCashReserve: { type: Number, default: 5000, min: 0 },
    maxSinglePayment: { type: Number, default: 15000, min: 0 }
  }
}, { timestamps: true });

export default mongoose.models.Company || mongoose.model('Company', CompanySchema);
