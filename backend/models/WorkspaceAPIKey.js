import mongoose from 'mongoose';

const WorkspaceAPIKeySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
  keyPrefix: { type: String, required: true, maxlength: 40 },
  keyHash: { type: String, required: true, select: false },
  scopes: {
    type: [String],
    enum: ['inventory:read', 'suppliers:read', 'purchasing:read'],
    required: true,
    validate: (value) => Array.isArray(value) && value.length > 0
  },
  createdAt: { type: Date, default: Date.now, immutable: true },
  lastUsedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null }
}, { versionKey: false });
WorkspaceAPIKeySchema.index({ companyId: 1, createdAt: -1 });
WorkspaceAPIKeySchema.index({ keyHash: 1 }, { unique: true, sparse: true });

export default mongoose.models.WorkspaceAPIKey || mongoose.model('WorkspaceAPIKey', WorkspaceAPIKeySchema);
