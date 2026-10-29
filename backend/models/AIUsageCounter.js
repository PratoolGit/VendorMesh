import mongoose from 'mongoose';

const AIUsageCounterSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  dayKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  count: { type: Number, min: 0, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
AIUsageCounterSchema.index({ companyId: 1, dayKey: 1 }, { unique: true });

export default mongoose.models.AIUsageCounter || mongoose.model('AIUsageCounter', AIUsageCounterSchema);
