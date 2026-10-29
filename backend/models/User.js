import mongoose from 'mongoose';

const MembershipSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  role: { type: String, enum: ['owner', 'admin', 'staff'], default: 'staff' },
  status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active' }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
  passwordHash: { type: String, required: true, select: false },
  memberships: { type: [MembershipSchema], default: [] },
  disabled: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
