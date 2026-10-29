import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorRole: { type: String, maxlength: 40, default: 'unknown' },
  action: { type: String, required: true, maxlength: 20 },
  resource: { type: String, required: true, maxlength: 240 },
  statusCode: { type: Number, required: true, min: 100, max: 599 },
  occurredAt: { type: Date, default: Date.now, immutable: true },
  requestId: { type: String, maxlength: 100, default: '' }
}, {
  versionKey: false,
  strict: 'throw'
});

AuditLogSchema.index({ companyId: 1, occurredAt: -1 });
AuditLogSchema.index({ actorUserId: 1, occurredAt: -1 });

// Application-level append-only guard. Production database credentials should also
// restrict this collection to inserts and reads for defense in depth.
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  AuditLogSchema.pre(operation, function rejectMutation() {
    throw new Error('Audit logs are append-only.');
  });
}
AuditLogSchema.pre('save', function rejectExistingDocumentMutation() {
  if (!this.isNew) throw new Error('Audit logs are append-only.');
});

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
