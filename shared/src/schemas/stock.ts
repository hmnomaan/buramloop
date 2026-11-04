// shared/src/schemas/stock.ts
import { z } from 'zod';
import { Iso2CountrySchema, ObjectIdSchema, ReasonSchema, roundKg } from './common.ts';
import { MATERIAL_UNITS, MaterialUnit } from './master.ts';
import {
  computePackageWeightDistribution,
  MassInputUnitSchema,
  roundEur,
} from './origin-blend.js';

export const RECEIPT_PACKAGE_TYPES = ['IBC', 'DRUM', 'BUCKET_TRAY', 'BUCKET', 'TRAY'] as const;
export type ReceiptPackageType = string;

export const RECEIPT_WEIGHT_UNITS = ['kg', 'tonne', 'l', 'piece'] as const;
export type ReceiptWeightUnit = (typeof RECEIPT_WEIGHT_UNITS)[number];

export const ReceiptWeightUnitSchema = z.enum(RECEIPT_WEIGHT_UNITS);
export const ReceiptPackageTypeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9 _-]{0,59}$/, 'Package type contains unsupported characters.');

export const DRUM_STATUSES = [
  'Quarantine',
  'Approved',
  'InWarehouse',
  'InWarmRoom',
  'Reserved',
  'InBatch',
  'Consumed',
  'Rejected',
  'Void',
] as const;
export type DrumStatus = (typeof DRUM_STATUSES)[number];

export const ALLOWED_DRUM_TRANSITIONS: Record<DrumStatus, readonly DrumStatus[]> = {
  Quarantine: ['Approved', 'Rejected', 'Void'], // when a drum is quarantined, it can be approved, rejected, or voided
  Approved: ['InWarehouse', 'InWarmRoom', 'Reserved', 'Void'], // when a drum is approved, it can be moved to warehouse, warm room, reserved, or voided
  InWarehouse: ['InWarmRoom', 'Reserved', 'Void'],
  InWarmRoom: ['InWarehouse', 'Reserved', 'InBatch', 'Void'],
  Reserved: ['InWarehouse', 'InWarmRoom', 'InBatch', 'Void'],
  InBatch: ['Consumed', 'Void'],
  Consumed: [], // when a drum is consumed, it cannot transition to any other status
  Rejected: ['Void'],
  Void: [],
};

export const STOCK_MOVEMENT_TYPES = [
  'RECEIVE_QUARANTINE',
  'QA_APPROVE',
  'QA_REJECT',
  'WARM_IN',
  'WARM_OUT_WAREHOUSE',
  'WARM_OUT_FILTRATION',
  'RESERVE_BATCH',
  'RELEASE_RESERVATION',
  'CONSUME_BATCH',
  'PROCESS_LOSS',
  'REWORK_CREATED',
  'VOID_REVERSAL',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const OriginSliceSchema = z.object({
  country: Iso2CountrySchema,
  incomingLotId: ObjectIdSchema,
  sourceDrumId: ObjectIdSchema.optional().nullable(),
  sourcePackageId: ObjectIdSchema.optional().nullable(),
  sourceReworkId: ObjectIdSchema.optional().nullable(),
  kg: z.number().positive().transform(roundKg),
  pct: z.number().gt(0).lte(100),
  unitPriceEurPerKg: z.number().nonnegative().optional(),
  valueEur: z.number().nonnegative().optional(),
  costValueEur: z.number().nonnegative().optional(),
  costSharePct: z.number().min(0).max(100).optional(),
});
export type OriginSlice = z.infer<typeof OriginSliceSchema>;

export const LabelOcrMetadataSchema = z.object({
  rawText: z.string().trim().max(4000).optional(),
  extractedSupplier: z.string().trim().max(200).optional(),
  extractedOrigin: z.string().trim().max(40).optional(),
  extractedMaterial: z.string().trim().max(200).optional(),
  extractedLotCode: z.string().trim().max(120).optional(),
  extractedBestBefore: z.string().trim().max(60).optional(),
  confidencePct: z.number().min(0).max(100).optional(),
});
export type LabelOcrMetadata = z.infer<typeof LabelOcrMetadataSchema>;

const LegacyDrumReceiptFieldsSchema = z.object({
  drumsCount: z.number().int().min(1).max(10_000).optional(),
  nominalDrumNetKg: z.number().positive().max(100_000).optional(),
  defaultTareKg: z.number().nonnegative().max(100_000).optional(),
});

export function resolveReceivedLotQuantities(input: {
  unit: MaterialUnit;
  packageCount: number;
  massInputUnit?: 'kg' | 'ton';
  totalInputWeight?: number;
  quantityPerPackage?: number;
  unitPriceEurPerKg?: number;
}): {
  totalQty: number;
  totalNetKg: number;
  unitWeightKg: number;
  perPackageQtys: number[];
  unitPriceEurPerKg: number;
  totalCostValueEur: number;
} {
  const unitPriceEurPerKg = roundEur(input.unitPriceEurPerKg ?? 0);

  if (input.unit === 'kg') {
    const distribution =
      input.totalInputWeight !== undefined
        ? computePackageWeightDistribution({
            packagesCount: input.packageCount,
            inputMassUnit: input.massInputUnit ?? 'kg',
            totalInputWeight: input.totalInputWeight,
          })
        : computePackageWeightDistribution({
            packagesCount: input.packageCount,
            inputMassUnit: 'kg',
            unitInputWeightKg: input.quantityPerPackage,
          });
    return {
      totalQty: distribution.totalNetKg,
      totalNetKg: distribution.totalNetKg,
      unitWeightKg: distribution.unitWeightKg,
      perPackageQtys: distribution.perPackageNetKgs,
      unitPriceEurPerKg,
      totalCostValueEur: roundEur(distribution.totalNetKg * unitPriceEurPerKg),
    };
  }

  if (input.totalInputWeight !== undefined) {
    throw new Error('Total mass input is only supported for kg-unit materials.');
  }
  const quantityPerPackage = input.quantityPerPackage;
  if (quantityPerPackage === undefined) {
    throw new Error('quantityPerPackage is required for non-kg materials.');
  }
  const totalQty = input.packageCount * quantityPerPackage;
  return {
    totalQty,
    totalNetKg: 0,
    unitWeightKg: 0,
    perPackageQtys: Array.from({ length: input.packageCount }, () => quantityPerPackage),
    unitPriceEurPerKg,
    totalCostValueEur: 0,
  };
}

export const ReceiveIncomingLotSchema = z
  .object({
    lotNo: z.string().trim().toUpperCase().min(3).max(40).optional(),
    sourcingId: ObjectIdSchema.optional().nullable(),
    contractId: ObjectIdSchema.optional().nullable(),
    supplierId: ObjectIdSchema,
    materialId: ObjectIdSchema,
    qualityGradeId: ObjectIdSchema.optional().nullable(),
    country: Iso2CountrySchema,
    receivedDate: z.coerce.date().optional(),
    packageType: ReceiptPackageTypeSchema.default('DRUM'),
    packageCount: z.number().int().min(1).max(10_000).optional(),
    massInputUnit: MassInputUnitSchema.default('kg'),
    totalInputWeight: z.number().positive().max(500_000).optional(),
    quantityPerPackage: z.number().min(0.001).optional(),
    unit: z.enum(MATERIAL_UNITS).optional(),
    quantityUnit: ReceiptWeightUnitSchema.optional(),
    tareKgPerPackage: z.number().nonnegative().max(100_000).optional(),
    unitPriceEurPerKg: z.number().nonnegative().optional(),
    supplierLotBarcode: z.string().trim().toUpperCase().min(3).max(120).optional().nullable(),
    labelMetadata: LabelOcrMetadataSchema.optional().nullable(),
    labelData: z.object({
      supplierLotReference: z.string().trim().max(120).optional(),
      supplierName: z.string().trim().max(160).optional(),
      exporter: z.string().trim().max(160).optional(),
      originCountry: z.string().trim().max(80).optional(),
      materialName: z.string().trim().max(160).optional(),
      labelDate: z.string().trim().max(32).optional(),
      packageCount: z.string().trim().max(32).optional(),
      packageType: z.string().trim().max(80).optional(),
      quantity: z.string().trim().max(40).optional(),
      unit: z.string().trim().max(24).optional(),
      barcode: z.string().trim().max(160).optional(),
      drumNumber: z.string().trim().max(80).optional(),
      tareKg: z.string().trim().max(32).optional(),
      rawText: z.string().trim().max(10_000).optional(),
    }).optional(),
    notes: z.string().trim().max(1000).optional(),
    reason: ReasonSchema,
  })
  .merge(LegacyDrumReceiptFieldsSchema)
  .superRefine((value, ctx) => {
    const unit: MaterialUnit =
      value.unit ??
      (value.quantityUnit === 'tonne' ? 'kg' : value.quantityUnit ?? 'kg');
    const quantity = value.quantityPerPackage ?? value.nominalDrumNetKg;
    const tare = value.tareKgPerPackage ?? value.defaultTareKg ?? 0;

    if (value.packageCount === undefined && value.drumsCount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packageCount'],
        message: 'A package count is required.',
      });
    }

    if (
      value.totalInputWeight === undefined &&
      value.quantityPerPackage === undefined &&
      value.nominalDrumNetKg === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityPerPackage'],
        message: 'Net quantity per package is required.',
      });
    }

    if (
      unit === 'kg' &&
      value.packageType !== 'DRUM' &&
      value.defaultTareKg !== undefined &&
      value.tareKgPerPackage === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tareKgPerPackage'],
        message: 'Use tareKgPerPackage for non-drum packages.',
      });
    }

    if (unit === 'piece' && quantity !== undefined && !Number.isInteger(quantity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityPerPackage'],
        message: 'Piece quantities must be whole numbers.',
      });
    }

    if (unit !== 'kg' && value.packageType === 'DRUM') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packageType'],
        message: 'Drum inventory is only supported for kg materials.',
      });
    }

    if (unit !== 'kg' && value.totalInputWeight !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totalInputWeight'],
        message: 'Total mass input is only supported for kg-unit materials.',
      });
    }

    if (unit !== 'kg' && value.massInputUnit === 'ton') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['massInputUnit'],
        message: 'Mass input unit "ton" is only valid for kg-unit materials.',
      });
    }

    if (unit !== 'kg' && value.nominalDrumNetKg !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nominalDrumNetKg'],
        message: 'Use quantityPerPackage for non-kg materials.',
      });
    }

    if (unit !== 'kg' && tare > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: value.tareKgPerPackage !== undefined ? ['tareKgPerPackage'] : ['defaultTareKg'],
        message: 'Kg tare can only be recorded for kg materials.',
      });
    }

    if (unit !== 'kg' && value.unitPriceEurPerKg !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitPriceEurPerKg'],
        message: 'Price per kg can only be recorded for kg materials.',
      });
    }

    if (
      value.unit !== undefined &&
      value.quantityUnit !== undefined &&
      ((value.quantityUnit === 'tonne' && value.unit !== 'kg') ||
        (value.quantityUnit !== 'tonne' && value.unit !== value.quantityUnit))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantityUnit'],
        message: 'Receipt unit and quantity unit must match.',
      });
    }
  })
  .superRefine((value, ctx) => {
    const inputUnit: MaterialUnit =
      value.unit ??
      (value.quantityUnit === 'tonne' ? 'kg' : value.quantityUnit ?? 'kg');
    const packageCount = value.packageCount ?? value.drumsCount ?? 1;
    if (inputUnit === 'kg') {
      try {
        computePackageWeightDistribution(
          value.totalInputWeight !== undefined
            ? {
                packagesCount: packageCount,
                inputMassUnit: value.massInputUnit,
                totalInputWeight: value.totalInputWeight,
              }
            : {
                packagesCount: packageCount,
                inputMassUnit: 'kg',
                unitInputWeightKg:
                  value.quantityUnit === 'tonne' &&
                  value.quantityPerPackage !== undefined
                    ? value.quantityPerPackage * 1000
                    : value.quantityPerPackage ?? value.nominalDrumNetKg ?? 290,
              }
        );
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['totalInputWeight'],
          message:
            error instanceof Error ? error.message : 'Invalid package weight distribution.',
        });
      }
    }
  })
  .transform((value) => {
    const inputUnit = value.quantityUnit ?? value.unit ?? 'kg';
    const unit: MaterialUnit = inputUnit === 'tonne' ? 'kg' : inputUnit;
    const packageCount = value.packageCount ?? value.drumsCount ?? 1;
    const quantity = value.quantityPerPackage ?? value.nominalDrumNetKg ?? 290;
    const quantityPerPackageInput =
      value.quantityUnit === 'tonne' && value.quantityPerPackage !== undefined
        ? quantity * 1000
        : quantity;
    const distribution =
      unit === 'kg'
        ? resolveReceivedLotQuantities({
            unit,
            packageCount,
            massInputUnit: value.massInputUnit,
            totalInputWeight: value.totalInputWeight,
            quantityPerPackage: quantityPerPackageInput,
            unitPriceEurPerKg: value.unitPriceEurPerKg,
          })
        : undefined;
    const quantityPerPackage =
      distribution?.unitWeightKg ??
      quantityPerPackageInput;
    const tareKgPerPackage =
      value.tareKgPerPackage ?? value.defaultTareKg ?? 0;

    return {
      ...value,
      unit,
      packageCount,
      quantityPerPackage,
      quantityUnit: unit,
      netKgPerPackage: unit === 'kg' ? roundKg(quantityPerPackage) : undefined,
      tareKgPerPackage: unit === 'kg' ? roundKg(tareKgPerPackage) : undefined,
      unitWeightKg: distribution?.unitWeightKg ?? 0,
      perPackageQuantities:
        distribution?.perPackageQtys ??
        Array.from({ length: packageCount }, () => quantityPerPackage),
      totalNetKg: distribution?.totalNetKg ?? 0,
      totalCostValueEur: distribution?.totalCostValueEur ?? 0,
      unitPriceEurPerKg:
        value.unitPriceEurPerKg === undefined
          ? undefined
          : distribution?.unitPriceEurPerKg ?? value.unitPriceEurPerKg,
    };
  });

export type ReceiveIncomingLotInput = z.infer<typeof ReceiveIncomingLotSchema>;

export function computeIncomingLotTotalKg(
  packageCount: number,
  netKgPerPackage: number
): number {
  if (
    !Number.isInteger(packageCount) ||
    packageCount < 1 ||
    !Number.isFinite(netKgPerPackage) ||
    netKgPerPackage <= 0
  ) {
    throw new RangeError('Package count and per-package net kg must be positive.');
  }
  return roundKg(packageCount * netKgPerPackage);
}

export function computeLotTotalQty(
  packageCount: number,
  quantityPerPackage: number,
  unit: MaterialUnit
): number {
  if (
    !Number.isInteger(packageCount) ||
    packageCount < 1 ||
    !Number.isFinite(quantityPerPackage) ||
    quantityPerPackage <= 0 ||
    (unit === 'piece' && !Number.isInteger(quantityPerPackage))
  ) {
    throw new RangeError('Package count and per-package quantity must be valid positive values.');
  }
  const total = packageCount * quantityPerPackage;
  return unit === 'kg' ? roundKg(total) : total;
}

export const CreateIncomingLotSchema = z.object({
  lotNo: z.string().trim().toUpperCase().min(3).max(32),
  sourceCode: z.string().trim().toUpperCase().min(2).max(16),
  contractId: ObjectIdSchema.optional().nullable(),
  sourcingId: ObjectIdSchema.optional().nullable(),
  supplierId: ObjectIdSchema,
  materialId: ObjectIdSchema,
  qualityGradeId: ObjectIdSchema.optional().nullable(),
  country: Iso2CountrySchema,
  expectedNetKg: z.number().positive().optional(),
  notes: z.string().trim().max(1000).optional(),
  reason: ReasonSchema.optional(),
});

export const ReceiveDrumSchema = z
  .object({
    barcode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,16}-[A-Z0-9]{2,20}-\d{1,5}$/, 'Barcode must match SOURCE-LOTID-DRUMNO'),
    drumNo: z.number().int().positive(),
    incomingLotId: ObjectIdSchema,
    materialId: ObjectIdSchema,
    country: Iso2CountrySchema,
    grossKg: z.number().positive().max(1000),
    tareKg: z.number().nonnegative().max(150).default(17.5),
    netKg: z.number().positive().max(1000),
    location: z.string().trim().default('QuarantineZone'),
    confirmMismatch: z.boolean().default(false),
    mismatchReason: ReasonSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const expectedNet = roundKg(Number(data.grossKg) - Number(data.tareKg));
    if (Math.abs(expectedNet - roundKg(data.netKg)) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['netKg'],
        message: `netKg (${data.netKg}) must equal grossKg (${data.grossKg}) - tareKg (${data.tareKg}) = ${expectedNet}`,
      });
    }
    if (data.confirmMismatch && !data.mismatchReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mismatchReason'],
        message: 'Mandatory audit reason required when confirming an intake mismatch.',
      });
    }
  });

export const CreateLabReportSchema = z.object({
  incomingLotId: ObjectIdSchema,
  labName: z.string().trim().default('QSI Bremen'),
  reportNo: z.string().trim().min(2).max(80),
  passed: z.boolean(),
  moisturePct: z.number().min(0).max(40).optional(),
  hmfMgPerKg: z.number().min(0).max(200).optional(),
  diastaseDn: z.number().min(0).max(100).optional(),
  c4SugarPassed: z.boolean().default(true),
  nmrPassed: z.boolean().default(true),
  attachmentId: ObjectIdSchema.optional().nullable(),
  notes: z.string().trim().max(1000).optional(),
  reason: ReasonSchema.optional(),
});

export type CreateIncomingLotInput = z.infer<typeof CreateIncomingLotSchema>;
export type ReceiveDrumInput = z.infer<typeof ReceiveDrumSchema>;
export type CreateLabReportInput = z.infer<typeof CreateLabReportSchema>;