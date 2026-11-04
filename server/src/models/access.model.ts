import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IRole extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, trim: true },
    permissions: { type: [String], required: true, default: [] },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

RoleSchema.pre('deleteOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Roles cannot be hard-deleted. Deactivate them instead.');
});
RoleSchema.pre('findOneAndDelete', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Roles cannot be hard-deleted. Deactivate them instead.');
});

export const RoleModel = mongoose.model<IRole>('Role', RoleSchema);

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  fullName: string;
  passwordHash: string;
  roleId: Types.ObjectId;
  isActive: boolean;
  expiresAt?: Date | null;
  lastLoginAt?: Date | null;
  mustChangePassword: boolean;
  avatarAttachmentId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    fullName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    avatarAttachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    tokenVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);
UserSchema.pre('deleteOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Users cannot be hard-deleted. Deactivate them instead.');
});
UserSchema.pre('findOneAndDelete', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Users cannot be hard-deleted. Deactivate them instead.');
});

export const UserModel = mongoose.model<IUser>('User', UserSchema);