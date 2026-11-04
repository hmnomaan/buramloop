import mongoose, { Document, Schema, Types } from 'mongoose';
import { SOURCING_GATES } from '../../../shared/src/schemas/purchase';

const blockHardDelete = function (): never {
  throw new Error('[IMMUTABILITY_VIOLATION] Purchase records cannot be hard-deleted. Void them with an audit reason.');
};

export interface ISupplier extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  country: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  regionCity?: string;
  contactPerson?: string;
  honeyVarieties: string[];
  certifications: string[];
  typicalCapacityTonsPerYear?: number;
  leadStatus: 'LEAD' | 'ACTIVE_PARTNER' | 'ON_HOLD';
  notes?: string;
  isApproved: boolean;
  createdBy?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    address: { type: String, trim: true },
    regionCity: { type: String, trim: true, maxlength: 120 },
    contactPerson: { type: String, trim: true, maxlength: 120 },
    honeyVarieties: { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    typicalCapacityTonsPerYear: { type: Number, min: 0 },
    leadStatus: {
      type: String,
      enum: ['LEAD', 'ACTIVE_PARTNER', 'ON_HOLD'],
      default: 'LEAD',
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    isApproved: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);
SupplierSchema.pre('deleteOne', blockHardDelete);
SupplierSchema.pre('findOneAndDelete', blockHardDelete);
export const SupplierModel = mongoose.model<ISupplier>('Supplier', SupplierSchema);

export interface ISourcingGate {
  gate: (typeof SOURCING_GATES)[number];
  decision: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: Types.ObjectId | null;
  decidedAt?: Date | null;
  reason?: string | null;
}

export interface ISourcing extends Document {
  _id: Types.ObjectId;
  sourcingNo: string;
  supplierId: Types.ObjectId;
  materialId: Types.ObjectId;
  country: string;
  massInputUnit?: 'kg' | 'ton';
  offeredInputWeight?: number;
  packageType?: string;
  offeredKg: number;
  offeredDrums: number;
  stage: string;
  status: string;
  offer?: Record<string, unknown>;
  gates: ISourcingGate[];
  externalAnalysis?: Record<string, unknown>;
  sample?: Record<string, unknown>;
  inhouse?: Record<string, unknown>;
  qsi?: Record<string, unknown>;
  isVoid: boolean;
  mismatchBlockedReason?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SourcingGateSchema = new Schema<ISourcingGate>(
  {
    gate: { type: String, enum: SOURCING_GATES, required: true },
    decision: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    reason: { type: String, default: null },
  },
  { _id: false }
);

const SourcingSchema = new Schema<ISourcing>(
  {
    sourcingNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    massInputUnit: { type: String, enum: ['kg', 'ton'], default: 'kg' },
    offeredInputWeight: { type: Number, min: 0 },
    packageType: { type: String, trim: true, uppercase: true, default: 'DRUM' },
    offeredKg: { type: Number, required: true, min: 0 },
    offeredDrums: { type: Number, required: true, min: 0 },
    stage: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    offer: { type: Schema.Types.Mixed },
    gates: { type: [SourcingGateSchema], default: [] },
    externalAnalysis: { type: Schema.Types.Mixed },
    sample: { type: Schema.Types.Mixed },
    inhouse: { type: Schema.Types.Mixed },
    qsi: { type: Schema.Types.Mixed },
    isVoid: { type: Boolean, default: false, index: true },
    mismatchBlockedReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);
SourcingSchema.pre('deleteOne', blockHardDelete);
SourcingSchema.pre('findOneAndDelete', blockHardDelete);
export const SourcingModel = mongoose.model<ISourcing>('Sourcing', SourcingSchema);

export interface IContract extends Document {
  _id: Types.ObjectId;
  contractNo: string;
  sourcingId: Types.ObjectId;
  supplierId: Types.ObjectId;
  materialId: Types.ObjectId;
  country: string;
  contractedKg: number;
  contractedDrums: number;
  packageType?: string;
  unitWeightKg?: number;
  unitPriceEurPerKg?: number;
  transportCostEur?: number;
  transportEurPerKg?: number;
  landedUnitPriceEurPerKg?: number;
  totalOfferValueEur?: number;
  totalLandedValueEur?: number;
  receivedKg: number;
  receivedPackages: number;
  deliveryTerms?: string;
  expectedArrivalDate?: Date | null;
  status: string;
  shippedAt?: Date | null;
  shippingRef?: string;
  isVoid: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ContractSchema = new Schema<IContract>(
  {
    contractNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    sourcingId: { type: Schema.Types.ObjectId, ref: 'Sourcing', required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    country: { type: String, required: true, uppercase: true },
    contractedKg: { type: Number, required: true, min: 0 },
    contractedDrums: { type: Number, required: true, min: 0 },
    packageType: { type: String, trim: true, uppercase: true, default: 'DRUM' },
    unitWeightKg: { type: Number, min: 0 },
    unitPriceEurPerKg: { type: Number, min: 0 },
    transportCostEur: { type: Number, min: 0 },
    transportEurPerKg: { type: Number, min: 0 },
    landedUnitPriceEurPerKg: { type: Number, min: 0 },
    totalOfferValueEur: { type: Number, min: 0 },
    totalLandedValueEur: { type: Number, min: 0 },
    receivedKg: { type: Number, min: 0, default: 0, set: (value: number) => Math.round(value * 1000) / 1000 },
    receivedPackages: { type: Number, min: 0, default: 0 },
    deliveryTerms: { type: String, trim: true },
    expectedArrivalDate: { type: Date, default: null },
    status: { type: String, required: true, index: true },
    shippedAt: { type: Date, default: null },
    shippingRef: { type: String, trim: true },
    isVoid: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
ContractSchema.pre('deleteOne', blockHardDelete);
ContractSchema.pre('findOneAndDelete', blockHardDelete);
export const ContractModel = mongoose.model<IContract>('Contract', ContractSchema);

export interface IPrice extends Document {
  _id: Types.ObjectId;
  entityType: string;
  sourcingId?: Types.ObjectId | null;
  contractId?: Types.ObjectId | null;
  incomingLotId?: Types.ObjectId | null;
  supplierId: Types.ObjectId;
  materialId: Types.ObjectId;
  country: string;
  currency: string;
  unitPricePerKg: number;
  transportCostEur?: number;
  transportEurPerKg?: number;
  landedUnitPriceEurPerKg?: number;
  totalOfferValueEur?: number;
  totalLandedValueEur?: number;
  effectiveDate: Date;
  createdBy: Types.ObjectId;
  reason?: string;
  isVoid: boolean;
  createdAt: Date;
}

const PriceSchema = new Schema<IPrice>(
  {
    entityType: { type: String, required: true, index: true },
    sourcingId: { type: Schema.Types.ObjectId, ref: 'Sourcing', default: null, index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'Contract', default: null, index: true },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', default: null },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    country: { type: String, required: true, uppercase: true },
    currency: { type: String, default: 'EUR', enum: ['EUR'] },
    unitPricePerKg: { type: Number, required: true, min: 0 },
    transportCostEur: { type: Number, min: 0 },
    transportEurPerKg: { type: Number, min: 0 },
    landedUnitPriceEurPerKg: { type: Number, min: 0 },
    totalOfferValueEur: { type: Number, min: 0 },
    totalLandedValueEur: { type: Number, min: 0 },
    effectiveDate: { type: Date, required: true, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String },
    isVoid: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
PriceSchema.pre('deleteOne', blockHardDelete);
PriceSchema.pre('findOneAndDelete', blockHardDelete);
export const PriceModel = mongoose.model<IPrice>('Price', PriceSchema);