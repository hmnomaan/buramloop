import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorRole: string;
  module: string;
  action: string;
  entityType: string;
  entityId: Types.ObjectId;
  entityRef?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorRole: { type: String, required: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    entityRef: { type: String, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

AuditLogSchema.pre('deleteOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Audit logs cannot be deleted.');
});
AuditLogSchema.pre('deleteMany', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Audit logs cannot be deleted.');
});
AuditLogSchema.pre('findOneAndDelete', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Audit logs cannot be deleted.');
});
AuditLogSchema.pre('updateOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Audit logs cannot be modified.');
});
AuditLogSchema.pre('updateMany', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Audit logs cannot be modified.');
});
AuditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Audit logs cannot be modified.');
});
AuditLogSchema.pre('replaceOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Audit logs cannot be replaced.');
});

export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);