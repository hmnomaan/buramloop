import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  DRUM_STATUSES,
  STOCK_MOVEMENT_TYPES,
  DrumStatus,
  StockMovementType,
} from '../../../shared/src/schemas/stock';
import { roundKg } from '../../../shared/src/schemas/common';
import type { MaterialUnit } from '../../../shared/src/schemas/master';

const blockHardDelete = function (): never {
  throw new Error('[IMMUTABILITY_VIOLATION] Stock records cannot be hard-deleted. Use a status transition with an audit reason.');
};

export interface IOriginSlice {
  country: string;
  incomingLotId: Types.ObjectId;
  sourceDrumId?: Types.ObjectId | null;
  sourcePackageId?: Types.ObjectId | null;
  sourceReworkId?: Types.ObjectId | null;
  kg: number;
  pct: number;
  unitPriceEurPerKg?: number;
  valueEur?: number;
  costValueEur?: number;
  costSharePct?: number;
}

export const OriginSliceSchema = new Schema<IOriginSlice>(
  {
    country: { type: String, required: true, trim: true, uppercase: true },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', required: true },
    sourceDrumId: { type: Schema.Types.ObjectId, ref: 'Drum', default: null },
    sourcePackageId: { type: Schema.Types.ObjectId, ref: 'StockPackage', default: null },
    sourceReworkId: { type: Schema.Types.ObjectId, ref: 'ReworkStock', default: null, index: true },
    kg: { type: Number, required: true, min: 0.001, set: roundKg },
    pct: { type: Number, required: true, min: 0.001, max: 100 },
    unitPriceEurPerKg: { type: Number, min: 0 },
    valueEur: { type: Number, min: 0 },
    costValueEur: { type: Number, default: 0, min: 0 },
    costSharePct: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false }
);

const DrumOriginSliceSchema = new Schema<
  IOriginSlice & { isRework?: boolean; sourceBatchId?: Types.ObjectId | null }
>(
  {
    ...OriginSliceSchema.obj,
    isRework: { type: Boolean, default: false, index: true },
    sourceBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  },
  { _id: false }
);

export interface IIncomingLot extends Document {
  _id: Types.ObjectId;
  lotNo: string;
  sourcingId?: Types.ObjectId | null;
  contractId?: Types.ObjectId | null;
  supplierId: Types.ObjectId;
  sourceNameSnapshot?: string;
  materialId: Types.ObjectId;
  materialCodeSnapshot?: string;
  qualityGradeId?: Types.ObjectId | null;
  country: string;
  receivedDate: Date;
  packageType?: string;
  packageCount?: number;
  massInputUnit?: 'kg' | 'ton';
  unitWeightKg?: number;
  netKgPerPackage?: number;
  quantityPerPackage?: number;
  quantityUnit?: MaterialUnit | 'tonne';
  unit?: MaterialUnit;
  totalQuantity?: number;
  unitPriceEurPerKg?: number;
  totalValueEur?: number;
  totalCostValueEur?: number;
  currency?: 'EUR';
  drumsCount: number;
  totalGrossKg: number;
  totalNetKg: number;
  status: string;
  returnedToSupplier: boolean;
  mismatchReason?: string;
  returnedAt?: Date;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  notes?: string;
  labelData?: {
    supplierLotReference?: string;
    supplierName?: string;
    exporter?: string;
    originCountry?: string;
    materialName?: string;
    labelDate?: string;
    packageCount?: string;
    packageType?: string;
    quantity?: string;
    unit?: string;
    barcode?: string;
    drumNumber?: string;
    tareKg?: string;
    rawText?: string;
    unitPriceEurPerKg?: number;
  };
  labelMetadata?: {
    rawText?: string;
    extractedSupplier?: string;
    extractedOrigin?: string;
    extractedMaterial?: string;
    extractedLotCode?: string;
    extractedBestBefore?: string;
    confidencePct?: number;
  } | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IncomingLotLabelDataSchema = new Schema(
  {
    supplierLotReference: { type: String, trim: true, maxlength: 120 },
    supplierName: { type: String, trim: true, maxlength: 160 },
    exporter: { type: String, trim: true, maxlength: 160 },
    originCountry: { type: String, trim: true, uppercase: true, maxlength: 80 },
    materialName: { type: String, trim: true, maxlength: 160 },
    labelDate: { type: String, trim: true, maxlength: 32 },
    packageCount: { type: String, trim: true, maxlength: 32 },
    packageType: { type: String, trim: true, maxlength: 80 },
    quantity: { type: String, trim: true, maxlength: 40 },
    unit: { type: String, trim: true, maxlength: 24 },
    barcode: { type: String, trim: true, uppercase: true, maxlength: 160 },
    drumNumber: { type: String, trim: true, maxlength: 80 },
    tareKg: { type: String, trim: true, maxlength: 32 },
    rawText: { type: String, trim: true, maxlength: 10000 },
  },
  { _id: false }
);

const IncomingLotSchema = new Schema<IIncomingLot>(
  {
    lotNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    sourcingId: { type: Schema.Types.ObjectId, ref: 'Sourcing', default: null, index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'Contract', default: null, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    sourceNameSnapshot: { type: String },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    materialCodeSnapshot: { type: String },
    qualityGradeId: { type: Schema.Types.ObjectId, ref: 'QualityGrade', default: null },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2, index: true },
    receivedDate: { type: Date, required: true, default: Date.now, index: true },
    packageType: { type: String, trim: true, uppercase: true, default: 'DRUM' },
    packageCount: { type: Number, min: 1 },
    massInputUnit: { type: String, enum: ['kg', 'ton'], default: 'kg' },
    unitWeightKg: { type: Number, min: 0, set: roundKg },
    netKgPerPackage: { type: Number, min: 0.001, set: roundKg },
    quantityPerPackage: { type: Number, min: 0.001 },
    quantityUnit: { type: String, enum: ['kg', 'tonne', 'l', 'piece'], default: 'kg' },
    unit: { type: String, enum: ['kg', 'l', 'piece'], default: 'kg', index: true },
    totalQuantity: { type: Number, min: 0 },
    unitPriceEurPerKg: { type: Number, min: 0 },
    totalValueEur: { type: Number, min: 0 },
    totalCostValueEur: { type: Number, min: 0 },
    currency: { type: String, enum: ['EUR'], default: 'EUR', required: true },
    drumsCount: { type: Number, required: true, min: 0 },
    totalGrossKg: { type: Number, required: true, min: 0, default: 0, set: roundKg },
    totalNetKg: { type: Number, required: true, min: 0, default: 0, set: roundKg },
    status: { type: String, required: true, default: 'UNDER_REVIEW', index: true },
    returnedToSupplier: { type: Boolean, default: false },
    mismatchReason: { type: String },
    returnedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    notes: { type: String, trim: true },
    labelData: { type: IncomingLotLabelDataSchema, default: undefined },
    labelMetadata: {
      rawText: { type: String, trim: true, maxlength: 4000 },
      extractedSupplier: { type: String, trim: true, maxlength: 200 },
      extractedOrigin: { type: String, trim: true, maxlength: 40 },
      extractedMaterial: { type: String, trim: true, maxlength: 200 },
      extractedLotCode: { type: String, trim: true, maxlength: 120 },
      extractedBestBefore: { type: String, trim: true, maxlength: 60 },
      confidencePct: { type: Number, min: 0, max: 100 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);
IncomingLotSchema.pre('validate', function (next) {
  const unit = this.unit ?? 'kg';
  if (unit === 'piece' && this.quantityPerPackage !== undefined &&
      !Number.isInteger(this.quantityPerPackage)) {
    next(new Error('Piece incoming lot quantity must be a whole number.'));
    return;
  }
  if (unit !== 'kg') {
    if (this.packageType === 'DRUM' || (this.totalNetKg ?? 0) > 0 ||
        (this.totalGrossKg ?? 0) > 0 || (this.netKgPerPackage ?? 0) > 0) {
      next(new Error('Non-kg incoming lots cannot contain drum or kg quantities.'));
      return;
    }
    if (this.quantityPerPackage === undefined || this.totalQuantity === undefined) {
      next(new Error('Non-kg incoming lots require package and total quantities.'));
      return;
    }
  }
  next();
});
IncomingLotSchema.pre('deleteOne', blockHardDelete);
IncomingLotSchema.pre('findOneAndDelete', blockHardDelete);
export const IncomingLotModel = mongoose.model<IIncomingLot>('IncomingLot', IncomingLotSchema);

export interface IStockPackage extends Document {
  _id: Types.ObjectId;
  packageCode: string;
  packageType: string;
  incomingLotId: Types.ObjectId;
  packageNo: number;
  materialId: Types.ObjectId;
  country: string;
  unit: MaterialUnit;
  quantity: number;
  netKg: number;
  tareKg: number;
  status: DrumStatus;
  location: string;
  reservedBatchId?: Types.ObjectId | null;
  originComposition: IOriginSlice[];
  createdAt: Date;
  updatedAt: Date;
}

const StockPackageSchema = new Schema<IStockPackage>(
  {
    packageCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    packageType: { type: String, required: true, trim: true, uppercase: true, index: true },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', required: true, index: true },
    packageNo: { type: Number, required: true, min: 1 },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2, index: true },
    unit: { type: String, enum: ['kg', 'l', 'piece'], required: true, default: 'kg', index: true },
    quantity: { type: Number, required: true, min: 0.001, default: 0 },
    netKg: { type: Number, required: true, min: 0, default: 0, set: roundKg },
    tareKg: { type: Number, required: true, min: 0, default: 0, set: roundKg },
    status: { type: String, enum: DRUM_STATUSES, required: true, default: 'Quarantine', index: true },
    location: { type: String, required: true, trim: true, default: 'QuarantineZone', index: true },
    reservedBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    originComposition: { type: [OriginSliceSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true }
);
StockPackageSchema.index({ incomingLotId: 1, packageNo: 1 }, { unique: true });
StockPackageSchema.pre('validate', function (next) {
  if (!this.unit) this.unit = 'kg';
  if (this.unit === 'kg' && this.quantity === 0 && this.netKg > 0) {
    this.quantity = this.netKg;
  }
  if (this.unit === 'piece' && !Number.isInteger(this.quantity)) {
    next(new Error('Piece stock package quantity must be a whole number.'));
    return;
  }
  if (this.unit !== 'kg') {
    if (this.netKg !== 0 || this.tareKg > 0 || this.packageType === 'DRUM') {
      next(new Error('Non-kg stock packages cannot record drum or kg quantities.'));
      return;
    }
  }
  next();
});
StockPackageSchema.pre('deleteOne', blockHardDelete);
StockPackageSchema.pre('findOneAndDelete', blockHardDelete);
export const StockPackageModel = mongoose.model<IStockPackage>('StockPackage', StockPackageSchema);

export interface IDrum extends Document {
  _id: Types.ObjectId;
  drumCode: string;
  incomingLotId?: Types.ObjectId | null;
  lotNoSnapshot?: string;
  drumNo: number;
  barcode?: string;
  materialId: Types.ObjectId;
  country: string;
  grossKg: number;
  tareKg: number;
  netKg: number;
  status: DrumStatus;
  location: string;
  reservedBatchId?: Types.ObjectId | null;
  originComposition?: IOriginSlice[];
  unitPriceEurPerKg?: number;
  isRework?: boolean;
  sourceBatchId?: Types.ObjectId | null;
  sourceReworkId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const DrumSchema = new Schema<IDrum>(
  {
    drumCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', default: null, index: true },
    lotNoSnapshot: { type: String, index: true },
    drumNo: { type: Number, required: true, min: 1 },
    barcode: { type: String, sparse: true, unique: true, uppercase: true, trim: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2, index: true },
    grossKg: { type: Number, required: true, min: 0, set: roundKg },
    tareKg: { type: Number, required: true, min: 0, set: roundKg },
    netKg: { type: Number, required: true, min: 0, set: roundKg },
    status: { type: String, enum: DRUM_STATUSES, required: true, default: 'Quarantine', index: true },
    location: { type: String, required: true, trim: true, default: 'QuarantineZone', index: true },
    reservedBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    originComposition: { type: [DrumOriginSliceSchema], default: [] },
    unitPriceEurPerKg: { type: Number, min: 0 },
    isRework: { type: Boolean, default: false, index: true },
    sourceBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    sourceReworkId: { type: Schema.Types.ObjectId, ref: 'ReworkStock', default: null, index: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);
DrumSchema.index({ incomingLotId: 1, drumNo: 1 }, { unique: true });
DrumSchema.pre('deleteOne', blockHardDelete);
DrumSchema.pre('findOneAndDelete', blockHardDelete);
export const DrumModel = mongoose.model<IDrum>('Drum', DrumSchema);

export interface IStockMovement extends Document {
  _id: Types.ObjectId;
  movementType: StockMovementType;
  drumId?: Types.ObjectId | null;
  stockPackageId?: Types.ObjectId | null;
  incomingLotId?: Types.ObjectId | null;
  materialId: Types.ObjectId;
  country: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  signedKg: number;
  signedQuantity?: number;
  quantityUnit?: MaterialUnit;
  batchId?: Types.ObjectId | null;
  reason: string;
  performedBy: Types.ObjectId;
  createdAt: Date;
}

const StockMovementSchema = new Schema<IStockMovement>(
  {
    movementType: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true, index: true },
    drumId: { type: Schema.Types.ObjectId, ref: 'Drum', default: null, index: true },
    stockPackageId: { type: Schema.Types.ObjectId, ref: 'StockPackage', default: null, index: true },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', default: null, index: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2, index: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    fromLocation: { type: String, default: null },
    toLocation: { type: String, default: null },
    signedKg: { type: Number, required: true, set: roundKg },
    signedQuantity: { type: Number },
    quantityUnit: { type: String, enum: ['kg', 'l', 'piece'] },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    reason: { type: String, required: true, trim: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);
StockMovementSchema.pre('validate', function (next) {
  const hasDrum = Boolean(this.drumId);
  const hasPackage = Boolean(this.stockPackageId);
  if (hasDrum === hasPackage) {
    next(new Error('A stock movement must reference exactly one drum or stock package.'));
    return;
  }
  if (
    this.quantityUnit &&
    this.quantityUnit !== 'kg' &&
    (this.signedKg !== 0 || this.signedQuantity === undefined)
  ) {
    next(new Error('Non-kg stock movements require a quantity delta and cannot record kg.'));
    return;
  }
  next();
});
StockMovementSchema.pre('deleteOne', blockHardDelete);
StockMovementSchema.pre('deleteMany', blockHardDelete);
StockMovementSchema.pre('findOneAndDelete', blockHardDelete);
StockMovementSchema.pre('updateOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Stock movement ledger entries cannot be modified.');
});
StockMovementSchema.pre('updateMany', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Stock movement ledger entries cannot be modified.');
});
StockMovementSchema.pre('findOneAndUpdate', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Stock movement ledger entries cannot be modified.');
});
StockMovementSchema.pre('replaceOne', function () {
  throw new Error('[IMMUTABILITY_VIOLATION] Stock movement ledger entries cannot be replaced.');
});
export const StockMovementModel = mongoose.model<IStockMovement>('StockMovement', StockMovementSchema);

export interface ILabReport extends Document {
  _id: Types.ObjectId;
  incomingLotId: Types.ObjectId;
  labName: string;
  reportNo: string;
  passed: boolean;
  moisturePct?: number;
  hmfMgPerKg?: number;
  diastaseDn?: number;
  c4SugarPassed: boolean;
  nmrPassed: boolean;
  attachmentId?: Types.ObjectId | null;
  notes?: string;
  reviewedBy: Types.ObjectId;
  createdAt: Date;
}

const LabReportSchema = new Schema<ILabReport>(
  {
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', required: true, index: true },
    labName: { type: String, required: true, trim: true, default: 'QSI Bremen' },
    reportNo: { type: String, required: true, trim: true },
    passed: { type: Boolean, required: true },
    moisturePct: { type: Number, min: 0, max: 40 },
    hmfMgPerKg: { type: Number, min: 0, max: 200 },
    diastaseDn: { type: Number, min: 0, max: 100 },
    c4SugarPassed: { type: Boolean, default: true },
    nmrPassed: { type: Boolean, default: true },
    attachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment', default: null },
    notes: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
LabReportSchema.pre('deleteOne', blockHardDelete);
LabReportSchema.pre('findOneAndDelete', blockHardDelete);
export const LabReportModel = mongoose.model<ILabReport>('LabReport', LabReportSchema);