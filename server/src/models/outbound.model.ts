// server/src/models/outbound.model.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  SHIPMENT_LOT_STATUSES,
  ShipmentLotStatus,
  ALLOWED_SHIPMENT_TRANSITIONS,
  PACKAGING_TYPES,
  PackagingType,
  NOTIFICATION_TYPES,
  NotificationType,
  NOTIFICATION_SEVERITIES,
  NotificationSeverity,
} from '../../../shared/src/schemas/outbound';
import { FILL_LINE_CODES, FillLineCode } from '../../../shared/src/schemas/production';
import { roundKg } from '../../../shared/src/schemas/common';
import { IOriginSlice } from './stock.model';

const roundEur = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

const blockHardDelete = function (): never {
  throw new Error('[IMMUTABILITY_VIOLATION] Outbound, customer, and financial records cannot be hard-deleted. Use void/isActive with reason.');
};

// ============================================================================
// 1. CUSTOMER MODEL (1-3 Allowed Origin Countries Rule) [R8]
// ============================================================================
export interface ICustomer extends Document {
  _id: Types.ObjectId;
  code: string;
  name: string;
  country: string; // ISO-2
  allowedCountries: string[]; // 1 to 3 allowed honey origin countries
  blockedCountries: string[]; // 0.0% tolerance countries
  allowReworkHoney: boolean;
  maxReworkSharePct: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    allowedCountries: {
      type: [{ type: String, uppercase: true, minlength: 2, maxlength: 2 }],
      required: true,
      validate: [
        (arr: string[]) => arr.length >= 1 && arr.length <= 3 && new Set(arr).size === arr.length,
        'Customer allowedCountries must contain 1 to 3 unique ISO-2 country codes.',
      ],
    },
    blockedCountries: {
      type: [{ type: String, uppercase: true, minlength: 2, maxlength: 2 }],
      default: [],
    },
    allowReworkHoney: { type: Boolean, default: true },
    maxReworkSharePct: { type: Number, default: 30, min: 0, max: 100 },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CustomerSchema.pre('deleteOne', blockHardDelete);
CustomerSchema.pre('findOneAndDelete', blockHardDelete);

export const CustomerModel = mongoose.model<ICustomer>('Customer', CustomerSchema);

// ============================================================================
// 2. SHIPMENT LOT MODEL (1 Batch -> N Customer Shipment LOTs) [R8, R11]
// ============================================================================
export interface IShipmentLot extends Document {
  _id: Types.ObjectId;
  shipmentLotNo: string; // Unique immutable customer-facing LOT code
  isManualLotNo: boolean;
  status: ShipmentLotStatus;
  batchId: Types.ObjectId;
  processNo: string;
  customerId: Types.ObjectId;
  destinationCountry: string; // ISO-2
  allowedCountriesSnapshot: string[]; // Locked at LOT creation time
  originComposition: IOriginSlice[]; // Verified against allowedCountriesSnapshot
  orderedKg: number;
  shippedKg: number;
  bestBeforeDate: Date;
  deliveryNoteNo?: string | null;
  carrierName?: string | null;
  releasedBy?: Types.ObjectId | null;
  releasedAt?: Date | null;
  shippedBy?: Types.ObjectId | null;
  shippedAt?: Date | null;
  isVoid: boolean;
  voidReason?: string | null;
  voidedBy?: Types.ObjectId | null;
  voidedAt?: Date | null;
  supersededByLotId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  transitionTo(nextStatus: ShipmentLotStatus, actorId: Types.ObjectId, reason?: string): void;
}

const OriginSliceSubSchema = new Schema<IOriginSlice>(
  {
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', required: true },
    sourceDrumId: { type: Schema.Types.ObjectId, ref: 'Drum', default: null },
    sourcePackageId: { type: Schema.Types.ObjectId, ref: 'StockPackage', default: null },
    sourceReworkId: { type: Schema.Types.ObjectId, ref: 'ReworkStock', default: null },
    kg: { type: Number, required: true, min: 0.001, set: roundKg },
    pct: { type: Number, required: true, min: 0.001, max: 100 },
    unitPriceEurPerKg: { type: Number, min: 0 },
    costValueEur: { type: Number, min: 0 },
    costSharePct: { type: Number, min: 0, max: 100 },
    valueEur: { type: Number, min: 0 },
  },
  { _id: false }
);

const ShipmentLotSchema = new Schema<IShipmentLot>(
  {
    shipmentLotNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    isManualLotNo: { type: Boolean, default: false },
    status: { type: String, enum: SHIPMENT_LOT_STATUSES, default: 'DRAFT', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    processNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    destinationCountry: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    allowedCountriesSnapshot: {
      type: [{ type: String, uppercase: true, minlength: 2, maxlength: 2 }],
      required: true,
      validate: [(v: string[]) => v.length >= 1 && v.length <= 3, 'allowedCountriesSnapshot must have 1-3 countries'],
    },
    originComposition: {
      type: [OriginSliceSubSchema],
      required: true,
      validate: {
        validator: function (this: IShipmentLot, origins: IOriginSlice[]) {
          if (!origins || origins.length === 0) return false;
          // Enforce that every origin country in the batch is permitted by customer's allowedCountriesSnapshot
          return origins.every((slice) => this.allowedCountriesSnapshot.includes(slice.country));
        },
        message: 'ShipmentLot originComposition contains a country not permitted by customer allowedCountries (1-3 rule).',
      },
    },
    orderedKg: { type: Number, required: true, min: 0.001, set: roundKg },
    shippedKg: { type: Number, required: true, default: 0, min: 0, set: roundKg },
    bestBeforeDate: { type: Date, required: true },
    deliveryNoteNo: { type: String, default: null, trim: true },
    carrierName: { type: String, default: null, trim: true },
    releasedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    releasedAt: { type: Date, default: null },
    shippedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    shippedAt: { type: Date, default: null },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: null },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    voidedAt: { type: Date, default: null },
    supersededByLotId: { type: Schema.Types.ObjectId, ref: 'ShipmentLot', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

ShipmentLotSchema.methods.transitionTo = function (
  this: IShipmentLot,
  nextStatus: ShipmentLotStatus,
  actorId: Types.ObjectId,
  reason?: string
): void {
  if (this.status === nextStatus) return;
  const allowed = ALLOWED_SHIPMENT_TRANSITIONS[this.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`[SHIPMENT_STATE_VIOLATION] Cannot transition ShipmentLot ${this.shipmentLotNo} from ${this.status} to ${nextStatus}`);
  }
  if (nextStatus === 'VOID') {
    if (!reason || reason.trim().length < 5) {
      throw new Error('[VOID_REASON_REQUIRED] Voiding a ShipmentLot requires a mandatory audit reason.');
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
  if (nextStatus === 'SHIPPED') {
    this.shippedBy = actorId;
    this.shippedAt = new Date();
  }
  this.status = nextStatus;
};

ShipmentLotSchema.pre('deleteOne', blockHardDelete);
ShipmentLotSchema.pre('findOneAndDelete', blockHardDelete);

export const ShipmentLotModel = mongoose.model<IShipmentLot>('ShipmentLot', ShipmentLotSchema);

// ============================================================================
// 3. SHIPMENT LOT ITEM MODEL (SKUs, Jars, PET, or Drums in a ShipmentLot) [R8]
// ============================================================================
export interface IShipmentLotItem extends Document {
  _id: Types.ObjectId;
  shipmentLotId: Types.ObjectId;
  shipmentLotNo: string;
  batchId: Types.ObjectId;
  skuCode: string;
  productName: string;
  packagingType: PackagingType;
  fillLine: FillLineCode;
  unitWeightGrams: number;
  unitsCount: number;
  netKg: number;
  palletsCount: number;
  notes?: string;
  isVoid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ShipmentLotItemSchema = new Schema<IShipmentLotItem>(
  {
    shipmentLotId: { type: Schema.Types.ObjectId, ref: 'ShipmentLot', required: true, index: true },
    shipmentLotNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    skuCode: { type: String, required: true, uppercase: true, trim: true },
    productName: { type: String, required: true, trim: true },
    packagingType: { type: String, enum: PACKAGING_TYPES, required: true },
    fillLine: { type: String, enum: FILL_LINE_CODES, required: true },
    unitWeightGrams: { type: Number, required: true, min: 1 },
    unitsCount: { type: Number, required: true, min: 1 },
    netKg: { type: Number, required: true, min: 0.001, set: roundKg },
    palletsCount: { type: Number, required: true, default: 0, min: 0 },
    notes: { type: String, trim: true },
    isVoid: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

ShipmentLotItemSchema.pre('deleteOne', blockHardDelete);
ShipmentLotItemSchema.pre('findOneAndDelete', blockHardDelete);

export const ShipmentLotItemModel = mongoose.model<IShipmentLotItem>('ShipmentLotItem', ShipmentLotItemSchema);

// ============================================================================
// 4. COST REPORT MODEL (Admin-Only Batch Cost, Margin & Management Report) [R9]
// ============================================================================
// Formula: batchCost = sum(kg * source price) + flavours; margin = sell - cost
export interface ICostBreakdownLine {
  inputKind: 'HONEY_DRUM' | 'REWORK' | 'FLAVOUR';
  materialId: Types.ObjectId;
  materialName: string;
  incomingLotId?: Types.ObjectId | null;
  lotNo?: string | null;
  country?: string | null;
  qtyKg: number;
  unitPriceEurPerKg: number;
  lineCostEur: number;
}

export interface ICostReport extends Document {
  _id: Types.ObjectId;
  reportNo: string; // e.g., "CR-26-0001"
  batchId: Types.ObjectId;
  processNo: string;
  shipmentLotId?: Types.ObjectId | null;
  shipmentLotNo?: string | null;
  currency: 'EUR';
  totalBatchKg: number;
  honeyCostEur: number;
  flavourCostEur: number;
  processingOverheadEur: number;
  packagingCostEur: number;
  totalCostEur: number; // honeyCostEur + flavourCostEur
  costPerKgEur: number;
  sellingPriceEurPerKg: number;
  totalRevenueEur: number;
  marginEur: number; // totalRevenueEur - totalCostEur
  marginPct: number; // (marginEur / totalRevenueEur) * 100
  breakdownLines: ICostBreakdownLine[];
  sentToManagement: boolean;
  sentToManagementAt?: Date | null;
  managementRecipientIds: Types.ObjectId[];
  nextcloudAttachmentId?: Types.ObjectId | null; // Saved in Admin-only Nextcloud folder
  isVoid: boolean;
  voidReason?: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CostBreakdownLineSubSchema = new Schema<ICostBreakdownLine>(
  {
    inputKind: { type: String, enum: ['HONEY_DRUM', 'REWORK', 'FLAVOUR'], required: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialName: { type: String, required: true, trim: true },
    incomingLotId: { type: Schema.Types.ObjectId, ref: 'IncomingLot', default: null },
    lotNo: { type: String, default: null },
    country: { type: String, default: null },
    qtyKg: { type: Number, required: true, min: 0.001, set: roundKg },
    unitPriceEurPerKg: { type: Number, required: true, min: 0, set: roundEur },
    lineCostEur: { type: Number, required: true, min: 0, set: roundEur },
  },
  { _id: false }
);

const CostReportSchema = new Schema<ICostReport>(
  {
    reportNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    processNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    shipmentLotId: { type: Schema.Types.ObjectId, ref: 'ShipmentLot', default: null, index: true },
    shipmentLotNo: { type: String, default: null },
    currency: { type: String, enum: ['EUR'], default: 'EUR', required: true },
    totalBatchKg: { type: Number, required: true, min: 0.001, set: roundKg },
    honeyCostEur: { type: Number, required: true, min: 0, set: roundEur },
    flavourCostEur: { type: Number, required: true, min: 0, set: roundEur },
    processingOverheadEur: { type: Number, required: true, min: 0, default: 0, set: roundEur },
    packagingCostEur: { type: Number, required: true, min: 0, default: 0, set: roundEur },
    totalCostEur: { type: Number, required: true, min: 0, set: roundEur },
    costPerKgEur: { type: Number, required: true, min: 0, set: roundEur },
    sellingPriceEurPerKg: { type: Number, required: true, min: 0, set: roundEur },
    totalRevenueEur: { type: Number, required: true, min: 0, set: roundEur },
    marginEur: { type: Number, required: true, set: roundEur },
    marginPct: { type: Number, required: true, set: roundEur },
    breakdownLines: { type: [CostBreakdownLineSubSchema], required: true },
    sentToManagement: { type: Boolean, default: false, index: true },
    sentToManagementAt: { type: Date, default: null },
    managementRecipientIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    nextcloudAttachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment', default: null },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CostReportSchema.pre('deleteOne', blockHardDelete);
CostReportSchema.pre('findOneAndDelete', blockHardDelete);

export const CostReportModel = mongoose.model<ICostReport>('CostReport', CostReportSchema);

// ============================================================================
// 5. STOCK THRESHOLD MODEL (Low-Stock Alert Triggers) [R10]
// ============================================================================
export interface IStockThreshold extends Document {
  _id: Types.ObjectId;
  materialId: Types.ObjectId;
  country?: string | null; // ISO-2 or null for all countries
  minApprovedFreeKg: number;
  minApprovedFreeDrums: number;
  lastTriggeredAt?: Date | null;
  isActive: boolean;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StockThresholdSchema = new Schema<IStockThreshold>(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2, default: null },
    minApprovedFreeKg: { type: Number, required: true, min: 0, set: roundKg },
    minApprovedFreeDrums: { type: Number, required: true, min: 0 },
    lastTriggeredAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

StockThresholdSchema.index({ materialId: 1, country: 1 }, { unique: true });
StockThresholdSchema.pre('deleteOne', blockHardDelete);

export const StockThresholdModel = mongoose.model<IStockThreshold>('StockThreshold', StockThresholdSchema);

// ============================================================================
// 6. NOTIFICATION MODEL (Low stock, Feasibility, Ready 24-48h, Deviations) [R10]
// ============================================================================
export interface INotification extends Document {
  _id: Types.ObjectId;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  targetRoles: string[];
  targetUserIds: Types.ObjectId[];
  readByUserIds: Types.ObjectId[];
  acknowledgedBy?: Types.ObjectId | null;
  acknowledgedAt?: Date | null;
  entityType?: string | null;
  entityId?: Types.ObjectId | null;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    severity: { type: String, enum: NOTIFICATION_SEVERITIES, default: 'WARNING', required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    targetRoles: [{ type: String, index: true }],
    targetUserIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    readByUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedAt: { type: Date, default: null },
    entityType: { type: String, default: null },
    entityId: { type: Schema.Types.ObjectId, default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.pre('deleteOne', blockHardDelete);
NotificationSchema.pre('findOneAndDelete', blockHardDelete);

export const NotificationModel = mongoose.model<INotification>('Notification', NotificationSchema);