// server/src/models/production.model.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  BATCH_STATUSES,
  BatchStatus,
  ALLOWED_BATCH_TRANSITIONS,
  FILL_LINE_CODES,
  FillLineCode,
  PROCESS_STEP_TYPES,
  ProcessStepType,
  WARM_OUT_DESTINATIONS,
  WarmOutDestination,
  REWORK_STATUSES,
  ReworkStatus,
  SLOTS_PER_CABINET,
} from '../../../shared/src/schemas/production';
import { roundKg } from '../../../shared/src/schemas/common.ts';
import { IOriginSlice } from './stock.model.ts';

const blockHardDelete = function (): never {
  throw new Error('[IMMUTABILITY_VIOLATION] Production records cannot be hard-deleted. Use status="VOID" with an audit reason.');
};

// ============================================================================
// 1. WARM CABINET MODEL (2 cabinets x 17 slots = 34 drums) [R5]
// ============================================================================
export interface ICabinetSlot {
  slotNo: number;
  drumId: Types.ObjectId;
  batchId?: Types.ObjectId | null;
  checkedInAt: Date;
  checkedInBy: Types.ObjectId;
  inTempC: number;
  warmingHours?: number;
  notes?: string;
  readyAt: Date; // 6-48h+ ready timestamp
}

export interface ICabinet extends Document {
  _id: Types.ObjectId;
  code: 'CAB-01' | 'CAB-02';
  name: string;
  capacityDrums: number; // Strictly 17
  targetTempC: number;
  minWarmHours: number; // Default 6
  maxWarmHours: number; // Default 48
  occupiedSlots: ICabinetSlot[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CabinetSlotSchema = new Schema<ICabinetSlot>(
  {
    slotNo: { type: Number, required: true, min: 1, max: SLOTS_PER_CABINET },
    drumId: { type: Schema.Types.ObjectId, ref: 'Drum', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    checkedInAt: { type: Date, required: true, default: Date.now },
    checkedInBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inTempC: { type: Number, required: true, min: 0, max: 80 },
    warmingHours: { type: Number, min: 1, max: 120, default: 24 },
    notes: { type: String, trim: true, maxlength: 1000 },
    readyAt: { type: Date, required: true },
  },
  { _id: false }
);

const CabinetSchema = new Schema<ICabinet>(
  {
    code: { type: String, enum: ['CAB-01', 'CAB-02'], required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    capacityDrums: { type: Number, required: true, default: SLOTS_PER_CABINET, max: SLOTS_PER_CABINET },
    targetTempC: { type: Number, required: true, default: 45 },
    minWarmHours: { type: Number, required: true, default: 6 },
    maxWarmHours: { type: Number, required: true, default: 48 },
    occupiedSlots: {
      type: [CabinetSlotSchema],
      default: [],
      validate: {
        validator: function (slots: ICabinetSlot[]) {
          if (slots.length > SLOTS_PER_CABINET) return false;
          const uniqueSlots = new Set(slots.map((s) => s.slotNo));
          const uniqueDrums = new Set(slots.map((s) => s.drumId.toHexString()));
          return uniqueSlots.size === slots.length && uniqueDrums.size === slots.length;
        },
        message: `Cabinet cannot exceed ${SLOTS_PER_CABINET} slots or contain duplicate slotNo/drumId.`,
      },
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

CabinetSchema.pre('deleteOne', blockHardDelete);
CabinetSchema.pre('deleteMany', blockHardDelete);
CabinetSchema.pre('findOneAndDelete', blockHardDelete);

export const CabinetModel = mongoose.model<ICabinet>('Cabinet', CabinetSchema);

// ============================================================================
// 2. RESTING TANK MODEL [R7]
// ============================================================================
export interface ITank extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  capacityKg: number;
  currentBatchId?: Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TankSchema = new Schema<ITank>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    capacityKg: { type: Number, required: true, min: 1, set: roundKg },
    currentBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

TankSchema.pre('deleteOne', blockHardDelete);
TankSchema.pre('findOneAndDelete', blockHardDelete);

export const TankModel = mongoose.model<ITank>('Tank', TankSchema);

// ============================================================================
// 3. FILL LINE MODEL (Quiel PET, Carlo Jar, Hand) [R7]
// ============================================================================
export interface IFillLine extends Document {
  _id: Types.ObjectId;
  code: FillLineCode;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FillLineSchema = new Schema<IFillLine>(
  {
    code: { type: String, enum: FILL_LINE_CODES, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

FillLineSchema.pre('deleteOne', blockHardDelete);
FillLineSchema.pre('findOneAndDelete', blockHardDelete);

export const FillLineModel = mongoose.model<IFillLine>('FillLine', FillLineSchema);

// ============================================================================
// 4. BATCH MODEL (processNo = batchNo, plannedKg vs approvedKg buffer) [R6, R7]
// ============================================================================
export interface IBatchFlavour {
  materialId: Types.ObjectId;
  incomingLotId?: Types.ObjectId | null;
  plannedKg: number;
  consumedKg: number;
}

export interface IBatchCabinetAssignment {
  cabinetId: Types.ObjectId;
  drumIds: Types.ObjectId[];
  checkedInAt?: Date | null;
  readyAt?: Date | null;
  checkedOutAt?: Date | null;
  targetTempC: number;
  outTempC?: number | null;
  destination?: WarmOutDestination | null;
}

export interface IBatch extends Document {
  _id: Types.ObjectId;
  processNo: string; // Batch No === Process No (e.g., B26-0001)
  status: BatchStatus;
  currentStage: string;
  customerId?: Types.ObjectId | null;
  allowedCountries: string[]; // 1 to 3 ISO-2 countries
  baseMaterialId: Types.ObjectId;
  plannedKg: number; // e.g., 6,000 kg
  approvedKg: number; // e.g., 9,000 - 9,500 kg (with buffer approved by Admin)
  totalInputKg: number;
  totalFilledKg: number;
  totalLossKg: number;
  totalReworkOutKg: number;
  actualOutKg?: number;
  completedAt?: Date | null;
  flavours: IBatchFlavour[];
  cabinetAssignments: IBatchCabinetAssignment[];
  feasibility?: {
    checkedAt: Date;
    checkedBy: Types.ObjectId;
    canFulfill: boolean;
    availableApprovedKg: number;
    availableDrumsCount: number;
    availableReworkKg: number;
    cabinetSlotsFree: number;
    requiredDrumsCount: number;
    shortfallKg: number;
    shortfallDrums: number;
    verdictMessage: string;
  } | null;
  originComposition: IOriginSlice[]; // Weighted origin[] of all honey inputs
  restingTankId?: Types.ObjectId | null;
  fillLine?: FillLineCode | null;
  readyAt?: Date | null; // 24-48h warm cycle ready timestamp
  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  approvalReason?: string | null;
  releasedBy?: Types.ObjectId | null;
  releasedAt?: Date | null;
  isVoid: boolean;
  voidReason?: string | null;
  voidedBy?: Types.ObjectId | null;
  voidedAt?: Date | null;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  transitionTo(nextStatus: BatchStatus, actorId: Types.ObjectId, reason?: string): void;
}

const BatchOriginSliceSchema = new Schema<IOriginSlice>(
  {
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', required: true },
    sourceDrumId: { type: Schema.Types.ObjectId, ref: 'Drum', default: null },
    sourcePackageId: { type: Schema.Types.ObjectId, ref: 'StockPackage', default: null },
    sourceReworkId: { type: Schema.Types.ObjectId, ref: 'ReworkStock', default: null },
    kg: { type: Number, required: true, min: 0.001, set: roundKg },
    pct: { type: Number, required: true, min: 0.001, max: 100 },
    unitPriceEurPerKg: { type: Number, min: 0 },
    valueEur: { type: Number, min: 0 },
    costValueEur: { type: Number, default: 0, min: 0 },
    costSharePct: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false }
);

const BatchSchema = new Schema<IBatch>(
  {
    processNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    status: { type: String, enum: BATCH_STATUSES, default: 'DRAFT', required: true, index: true },
    currentStage: { type: String, default: 'RESERVED', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    allowedCountries: {
      type: [{ type: String, uppercase: true, minlength: 2, maxlength: 2 }],
      required: true,
      validate: [(v: string[]) => v.length >= 1 && v.length <= 3, 'allowedCountries must contain 1 to 3 ISO-2 codes'],
    },
    baseMaterialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    plannedKg: { type: Number, required: true, min: 0.001, set: roundKg },
    approvedKg: { type: Number, required: true, min: 0.001, set: roundKg },
    totalInputKg: { type: Number, required: true, default: 0, min: 0, set: roundKg },
    totalFilledKg: { type: Number, required: true, default: 0, min: 0, set: roundKg },
    totalLossKg: { type: Number, required: true, default: 0, min: 0, set: roundKg },
    totalReworkOutKg: { type: Number, required: true, default: 0, min: 0, set: roundKg },
    actualOutKg: { type: Number, min: 0, set: roundKg },
    completedAt: { type: Date, default: null },
    flavours: [
      {
        materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
        incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', default: null },
        plannedKg: { type: Number, required: true, min: 0.001, set: roundKg },
        consumedKg: { type: Number, required: true, default: 0, min: 0, set: roundKg },
      },
    ],
    cabinetAssignments: [
      {
        cabinetId: { type: Schema.Types.ObjectId, ref: 'Cabinet', required: true },
        drumIds: [{ type: Schema.Types.ObjectId, ref: 'Drum', required: true }],
        checkedInAt: { type: Date, default: null },
        readyAt: { type: Date, default: null },
        checkedOutAt: { type: Date, default: null },
        targetTempC: { type: Number, required: true, default: 45 },
        outTempC: { type: Number, default: null },
        destination: { type: String, enum: WARM_OUT_DESTINATIONS, default: null },
      },
    ],
    feasibility: {
      type: {
        checkedAt: { type: Date, required: true },
        checkedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        canFulfill: { type: Boolean, required: true },
        availableApprovedKg: { type: Number, required: true, set: roundKg },
        availableDrumsCount: { type: Number, required: true },
        availableReworkKg: { type: Number, required: true, default: 0, set: roundKg },
        cabinetSlotsFree: { type: Number, required: true },
        requiredDrumsCount: { type: Number, required: true },
        shortfallKg: { type: Number, required: true, set: roundKg },
        shortfallDrums: { type: Number, required: true },
        verdictMessage: { type: String, required: true },
      },
      default: null,
    },
    originComposition: { type: [BatchOriginSliceSchema], default: [] },
    restingTankId: { type: Schema.Types.ObjectId, ref: 'Tank', default: null },
    fillLine: { type: String, enum: FILL_LINE_CODES, default: null },
    readyAt: { type: Date, default: null, index: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    approvalReason: { type: String, default: null },
    releasedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    releasedAt: { type: Date, default: null },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: null },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    voidedAt: { type: Date, default: null },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

BatchSchema.methods.transitionTo = function (
  this: IBatch,
  nextStatus: BatchStatus,
  actorId: Types.ObjectId,
  reason?: string
): void {
  if (this.status === nextStatus) return;
  const allowed = ALLOWED_BATCH_TRANSITIONS[this.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`[BATCH_STATE_VIOLATION] Illegal transition on Batch ${this.processNo}: ${this.status} -> ${nextStatus}`);
  }
  if (nextStatus === 'VOID') {
    if (!reason || reason.trim().length < 5) {
      throw new Error('[VOID_REASON_REQUIRED] Voiding a Batch requires a mandatory audit reason.');
    }
    this.isVoid = true;
    this.voidReason = reason.trim();
    this.voidedBy = actorId;
    this.voidedAt = new Date();
  }
  if (nextStatus === 'RELEASED') {
    this.releasedBy = actorId;
    this.releasedAt = new Date();
  }
  this.status = nextStatus;
};

BatchSchema.pre('deleteOne', blockHardDelete);
BatchSchema.pre('deleteMany', blockHardDelete);
BatchSchema.pre('findOneAndDelete', blockHardDelete);

export const BatchModel = mongoose.model<IBatch>('Batch', BatchSchema);

// ============================================================================
// 5. BATCH INPUT MODEL (Drums, Rework Stocks, Flavours linked to Batch) [R6]
// ============================================================================
export interface IBatchInput extends Document {
  _id: Types.ObjectId;
  batchId: Types.ObjectId;
  processNo: string;
  inputKind: 'DRUM' | 'PACKAGE' | 'REWORK' | 'FLAVOUR';
  drumId?: Types.ObjectId | null;
  packageId?: Types.ObjectId | null;
  reworkStockId?: Types.ObjectId | null;
  flavourMaterialId?: Types.ObjectId | null;
  incomingLotId?: Types.ObjectId | null;
  qtyKg: number;
  originSnapshot: IOriginSlice[];
  overrideMismatch: boolean;
  overrideReason?: string | null;
  addedBy: Types.ObjectId;
  addedAt: Date;
  isVoid: boolean;
  voidReason?: string | null;
}

const BatchInputSchema = new Schema<IBatchInput>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    processNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    inputKind: { type: String, enum: ['DRUM', 'PACKAGE', 'REWORK', 'FLAVOUR'], required: true },
    drumId: { type: Schema.Types.ObjectId, ref: 'Drum', default: null, index: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'StockPackage', default: null, index: true },
    reworkStockId: { type: Schema.Types.ObjectId, ref: 'ReworkStock', default: null, index: true },
    flavourMaterialId: { type: Schema.Types.ObjectId, ref: 'Material', default: null },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', default: null, index: true },
    qtyKg: { type: Number, required: true, min: 0.001, set: roundKg },
    originSnapshot: { type: [BatchOriginSliceSchema], default: [] },
    overrideMismatch: { type: Boolean, default: false },
    overrideReason: { type: String, default: null },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    addedAt: { type: Date, default: Date.now, required: true },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: null },
  },
  { timestamps: true }
);

BatchInputSchema.index({ batchId: 1, drumId: 1 });
BatchInputSchema.index({ batchId: 1, packageId: 1 });
BatchInputSchema.pre('deleteOne', blockHardDelete);
BatchInputSchema.pre('findOneAndDelete', blockHardDelete);

export const BatchInputModel = mongoose.model<IBatchInput>('BatchInput', BatchInputSchema);

// ============================================================================
// 6. PROCESS STEP MODEL (tempC, personInCharge, in = out + loss + reworkOut) [R7]
// ============================================================================
export interface IProcessStep extends Document {
  _id: Types.ObjectId;
  batchId: Types.ObjectId;
  processNo: string; // Strictly equals Batch.processNo
  stepSequence: number;
  stepType: ProcessStepType;
  tempC: number;
  personInChargeId: Types.ObjectId;
  personInChargeName: string;
  startedAt: Date;
  completedAt?: Date | null;
  inKg: number;
  outKg: number;
  lossKg: number;
  reworkOutKg: number;
  cabinetId?: Types.ObjectId | null;
  warmOutDestination?: WarmOutDestination | null;
  tankId?: Types.ObjectId | null;
  tankCode?: string | null;
  fillLine?: FillLineCode | null;
  filterMicron?: number | null;
  generatedReworkId?: Types.ObjectId | null;
  notes?: string;
  isVoid: boolean;
  voidReason?: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProcessStepSchema = new Schema<IProcessStep>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    processNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    stepSequence: { type: Number, required: true, min: 1 },
    stepType: { type: String, enum: PROCESS_STEP_TYPES, required: true, index: true },
    tempC: { type: Number, required: true, min: 10, max: 85 },
    personInChargeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    personInChargeName: { type: String, required: true, trim: true },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null },
    inKg: { type: Number, required: true, min: 0.001, set: roundKg },
    outKg: { type: Number, required: true, min: 0, set: roundKg },
    lossKg: { type: Number, required: true, min: 0, set: roundKg },
    reworkOutKg: { type: Number, required: true, default: 0, min: 0, set: roundKg },
    cabinetId: { type: Schema.Types.ObjectId, ref: 'Cabinet', default: null },
    warmOutDestination: { type: String, enum: WARM_OUT_DESTINATIONS, default: null },
    tankId: { type: Schema.Types.ObjectId, ref: 'Tank', default: null },
    tankCode: { type: String, trim: true, default: null },
    fillLine: { type: String, enum: FILL_LINE_CODES, default: null },
    filterMicron: { type: Number, default: null },
    generatedReworkId: { type: Schema.Types.ObjectId, ref: 'ReworkStock', default: null },
    notes: { type: String, trim: true },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: null },    
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ProcessStepSchema.index({ batchId: 1, stepSequence: 1 }, { unique: true });

// Server-side Mass Balance Guard: inKg === outKg + lossKg + reworkOutKg
ProcessStepSchema.pre('validate', function (next) {
  const expectedIn = roundKg(this.outKg + this.lossKg + this.reworkOutKg);
  if (Math.abs(roundKg(this.inKg) - expectedIn) > 0.001) {
    return next(
      new Error(
        `[MASS_BALANCE_ERROR] ProcessStep (${this.processNo} / ${this.stepType}): inKg (${this.inKg}) !== outKg (${this.outKg}) + lossKg (${this.lossKg}) + reworkOutKg (${this.reworkOutKg})`
      )
    );
  }
  next();
});

ProcessStepSchema.pre('deleteOne', blockHardDelete);
ProcessStepSchema.pre('findOneAndDelete', blockHardDelete);

export const ProcessStepModel = mongoose.model<IProcessStep>('ProcessStep', ProcessStepSchema);

// ============================================================================
// 7. REWORK STOCK MODEL (Leftover honey with recursive origin[]) [R6]
// ============================================================================
export interface IReworkStock extends Document {
  _id: Types.ObjectId;
  reworkNo: string; // e.g., "RW-26-0001"
  sourceBatchId: Types.ObjectId;
  sourceProcessNo: string;
  sourceStage?: string;
  sourceProcessStepId?: Types.ObjectId | null;
  materialId: Types.ObjectId;
  status: ReworkStatus;
  totalKg: number;
  remainingKg: number;
  reservedBatchId?: Types.ObjectId | null;
  origin: IOriginSlice[]; // Preserves exact country + incomingLotId % breakdown
  isVoid: boolean;
  voidReason?: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReworkStockSchema = new Schema<IReworkStock>(
  {
    reworkNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    sourceBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    sourceProcessNo: { type: String, required: true, uppercase: true, trim: true },
    sourceStage: { type: String, trim: true },
    sourceProcessStepId: { type: Schema.Types.ObjectId, ref: 'ProcessStep', default: null },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    status: { type: String, enum: REWORK_STATUSES, default: 'AVAILABLE', required: true, index: true },
    totalKg: { type: Number, required: true, min: 0.001, set: roundKg },
    remainingKg: { type: Number, required: true, min: 0, set: roundKg },
    reservedBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    origin: {
      type: [BatchOriginSliceSchema],
      required: true,
      validate: {
        validator: function (origins: IOriginSlice[]) {
          if (!origins || origins.length === 0) return false;
          const sumPct = origins.reduce((acc, o) => acc + o.pct, 0);
          return Math.abs(sumPct - 100) <= 0.1;
        },
        message: 'ReworkStock origin[] percentages must sum to 100% (±0.1%).',
      },
    },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

ReworkStockSchema.index({ status: 1, remainingKg: 1, createdAt: 1 });
ReworkStockSchema.pre('deleteOne', blockHardDelete);
ReworkStockSchema.pre('findOneAndDelete', blockHardDelete);

export const ReworkStockModel = mongoose.model<IReworkStock>('ReworkStock', ReworkStockSchema);