import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IExportLog extends Document {
  _id: Types.ObjectId;
  module: string;
  format: string;
  entityIds: Types.ObjectId[];
  filters?: Record<string, unknown>;
  fileName?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const ExportLogSchema = new Schema<IExportLog>(
  {
    module: { type: String, required: true, index: true },
    format: { type: String, required: true },
    entityIds: [{ type: Schema.Types.ObjectId }],
    filters: { type: Schema.Types.Mixed },
    fileName: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ExportLogSchema.pre('deleteOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Export logs cannot be deleted.');
});
ExportLogSchema.pre('deleteMany', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Export logs cannot be deleted.');
});
ExportLogSchema.pre('findOneAndDelete', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Export logs cannot be deleted.');
});
ExportLogSchema.pre('updateOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Export logs cannot be modified.');
});
ExportLogSchema.pre('updateMany', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Export logs cannot be modified.');
});
ExportLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Export logs cannot be modified.');
});
ExportLogSchema.pre('replaceOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Export logs cannot be replaced.');
});

export const ExportLogModel = mongoose.model<IExportLog>('ExportLog', ExportLogSchema);