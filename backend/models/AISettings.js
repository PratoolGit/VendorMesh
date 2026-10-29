import mongoose from 'mongoose';

const AISettingsSchema = new mongoose.Schema({
  // Missing companyId identifies the separate legacy global operator setting.
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: undefined },
  keyLast4: { type: String, maxlength: 4, default: '' },
  provider: { type: String, enum: ['anthropic', 'openai', 'gemini'], required: true, default: 'anthropic' },
  model: { type: String, required: true },
  keyCiphertext: { type: String, required: true },
  keyIv: { type: String, required: true },
  keyTag: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

// Preserve one global legacy setting while allowing one encrypted setting per workspace.
AISettingsSchema.index({ companyId: 1 }, { unique: true, partialFilterExpression: { companyId: { $type: 'objectId' } } });

export default mongoose.models.AISettings || mongoose.model('AISettings', AISettingsSchema);
