import mongoose from 'mongoose';

const AISettingsSchema = new mongoose.Schema({
  provider: { type: String, enum: ['anthropic', 'openai', 'gemini'], required: true, default: 'anthropic' },
  model: { type: String, required: true },
  keyCiphertext: { type: String, required: true },
  keyIv: { type: String, required: true },
  keyTag: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export default mongoose.models.AISettings || mongoose.model('AISettings', AISettingsSchema);
