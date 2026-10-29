import mongoose from 'mongoose';

const AIUsageSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['anthropic', 'openai', 'gemini'], required: true },
  model: { type: String, required: true, maxlength: 120 },
  kind: { type: String, enum: ['ask', 'test'], required: true },
  outcome: { type: String, enum: ['success', 'error'], required: true },
  dayKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  inputTokens: { type: Number, min: 0, default: null },
  outputTokens: { type: Number, min: 0, default: null },
  durationMs: { type: Number, min: 0, required: true },
  errorCategory: { type: String, maxlength: 80, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
AIUsageSchema.index({ companyId: 1, createdAt: -1 });
AIUsageSchema.index({ companyId: 1, dayKey: 1, kind: 1 });

export default mongoose.models.AIUsage || mongoose.model('AIUsage', AIUsageSchema);
