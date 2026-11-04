import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  ATTACHMENT_DOC_TYPES,
  ATTACHMENT_ENTITY_TYPES,
} from '../../../shared/src/schemas/attachment';

export interface IAttachment extends Document {
  _id: Types.ObjectId;
  entityType: (typeof ATTACHMENT_ENTITY_TYPES)[number];
  entityId: Types.ObjectId;
  entityCode: string;
  docType: (typeof ATTACHMENT_DOC_TYPES)[number];
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  adminOnly: boolean;
  status: 'ACTIVE' | 'VOID';
  storage: {
    provider: string;
    path: string;
    fileId?: string;
    etag?: string;
  };
  notes?: string;
  uploadedBy: Types.ObjectId;
  voidReason?: string;
  voidedBy?: Types.ObjectId;
  voidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    entityType: { type: String, enum: ATTACHMENT_ENTITY_TYPES, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    entityCode: { type: String, required: true, trim: true },
    docType: { type: String, enum: ATTACHMENT_DOC_TYPES, required: true, index: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    sha256: { type: String, required: true, minlength: 64, maxlength: 64, index: true },
    adminOnly: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['ACTIVE', 'VOID'], default: 'ACTIVE', index: true },
    storage: {
      provider: { type: String, required: true },
      path: { type: String, required: true },
      fileId: { type: String },
      etag: { type: String },
    },
    notes: { type: String },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    voidReason: { type: String },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
  },
  { timestamps: true }
);

AttachmentSchema.index({ entityType: 1, entityId: 1, status: 1 });
AttachmentSchema.pre('deleteOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Attachments cannot be hard-deleted. Void them with a reason.');
});
AttachmentSchema.pre('deleteMany', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Attachments cannot be hard-deleted. Void them with a reason.');
});
AttachmentSchema.pre('findOneAndDelete', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Attachments cannot be hard-deleted. Void them with a reason.');
});

export const AttachmentModel = mongoose.model<IAttachment>('Attachment', AttachmentSchema);