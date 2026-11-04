
import { z } from 'zod';
import { ObjectIdSchema, ReasonSchema, roundKg } from './common.js';
import { FILL_LINE_CODES } from './production.js';
import { OriginSliceSchema } from './stock.js';

// --- CONSTANTS & ENUMS ---

export const SHIPMENT_LOT_STATUSES = [
  'DRAFT',
  'QA_HOLD',
  'RELEASED',
  'SHIPPED',
  'VOID',
] as const;

export type ShipmentLotStatus =
  (typeof SHIPMENT_LOT_STATUSES)[number];

export const ALLOWED_SHIPMENT_TRANSITIONS: Record<
  ShipmentLotStatus,
  readonly ShipmentLotStatus[]
> = {
  DRAFT: ['QA_HOLD', 'RELEASED', 'VOID'],
  QA_HOLD: ['RELEASED', 'VOID'],
  RELEASED: ['SHIPPED', 'VOID'],
  SHIPPED: ['VOID'], // Voiding after shipment requires compensating audit and recall log
  VOID: [],
};

export const PACKAGING_TYPES = [
  'PET_SQUEEZE',
  'GLASS_JAR',
  'CLAMP_JAR',
  'CLUB_BOTTLE',
  'PAIL_BUCKET',
  'BULK_DRUM_290KG',
  'OTHER',
] as const;

export type PackagingType = (typeof PACKAGING_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'LOW_STOCK',
  'FEASIBILITY_SHORTFALL',
  'WARM_CABINET_READY_24_48H',
  'SCAN_OR_ORIGIN_MISMATCH',
  'RESERVATION_EXPIRING',
  'QA_GATE_REJECTED',
  'COST_REPORT_GENERATED',
  'WARM_READY',
  'DEVIATION_MISMATCH',
  'PROCESS_DEVIATION',
] as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = [
  'INFO',
  'WARNING',
  'CRITICAL',
] as const;

export type NotificationSeverity =
  (typeof NOTIFICATION_SEVERITIES)[number];

// --- 1. CUSTOMERS (1-3 Allowed Countries Rule) [R8] ---

export const UpsertCustomerSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(2).max(24),
    name: z.string().trim().min(2).max(160),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, 'Must be 2-letter ISO country code'),

    allowedCountries: z
      .array(z.string().trim().toUpperCase().length(2))
      .min(1, 'Customer must specify at least 1 allowed origin country')
      .max(3, 'Customers may restrict to 1-3 allowed origin countries')
      .refine((arr) => new Set(arr).size === arr.length, {
        message:
          'Duplicate country codes are not permitted in allowedCountries',
      }),

    blockedCountries: z
      .array(z.string().trim().toUpperCase().length(2))
      .default([])
      .refine((arr) => new Set(arr).size === arr.length, {
        message:
          'Duplicate country codes are not permitted in blockedCountries',
      }),

    allowReworkHoney: z.boolean().default(true),
    maxReworkSharePct: z.number().min(0).max(100).default(30),
    contactName: z.string().trim().max(120).optional(),
    contactEmail: z
      .string()
      .trim()
      .email()
      .optional()
      .or(z.literal('')),
    contactPhone: z.string().trim().max(50).optional(),
    address: z.string().trim().max(400).optional(),
    isActive: z.boolean().default(true),
    reason: ReasonSchema,
  })
  .superRefine((data, ctx) => {
    const blockedSet = new Set(data.blockedCountries);
    const overlap = data.allowedCountries.filter((country) =>
      blockedSet.has(country),
    );

    if (overlap.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedCountries'],
        message:
          `Country cannot be both allowed and blocked: ${overlap.join(', ')}`,
      });
    }
  });

// --- 2. SHIPMENT LOT ITEMS [R8] ---
// Validate that declared net weight matches units × unit weight.

export const CreateShipmentLotItemSchema = z
  .object({
    shipmentLotId: ObjectIdSchema.optional(),
    skuCode: z.string().trim().toUpperCase().min(2).max(40),
    productName: z.string().trim().min(2).max(160),
    packagingType: z.enum(PACKAGING_TYPES),
    fillLine: z.enum(FILL_LINE_CODES),
    unitWeightGrams: z.number().positive().max(350000),
    unitsCount: z.number().int().positive(),
    netKg: z.number().positive(),
    palletsCount: z.number().int().nonnegative().default(0),
    notes: z.string().trim().max(300).optional(),
  })
  .superRefine((item, ctx) => {
    const expectedNetKg = roundKg(
      (item.unitWeightGrams * item.unitsCount) / 1000,
    );

    if (Math.abs(expectedNetKg - roundKg(item.netKg)) > 0.005) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['netKg'],
        message:
          `Item netKg (${item.netKg}) must equal ` +
          `(unitWeightGrams * unitsCount) / 1000 = ${expectedNetKg} kg.`,
      });
    }
  });

// --- 3. SHIPMENT LOTS [R8, R11] ---
// Validate packaged quantity against ordered and shipped quantities.

export const CreateShipmentLotSchema = z
  .object({
    // Example: US26-09000-B26-0001-0045
    shipmentLotNo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z]{2}\d{2}-\d{5}-B\d{2}-\d{4}-\d{4}$/,
        'Format must match <ISO2><YY>-<KG5>-<BATCHNO>-<SERIAL4>',
      )
      .optional(),

    isManualLotNo: z.boolean().default(false),
    batchId: ObjectIdSchema,
    processNo: z.string().trim().toUpperCase(),
    customerId: ObjectIdSchema,
    destinationCountry: z
      .string()
      .trim()
      .toUpperCase()
      .length(2),
    orderedKg: z.number().positive(),
    shippedKg: z.number().nonnegative().default(0),
    items: z
      .array(CreateShipmentLotItemSchema)
      .min(1, 'At least one packaging item line is required'),
    bestBeforeDate: z.coerce.date(),
    deliveryNoteNo: z.string().trim().max(60).optional(),
    carrierName: z.string().trim().max(120).optional(),
    reason: ReasonSchema,
  })
  .superRefine((data, ctx) => {
    const totalItemsNetKg = roundKg(
      data.items.reduce((sum, item) => sum + item.netKg, 0),
    );

    const maxAllowedKg = roundKg(data.orderedKg * 1.1);

    if (totalItemsNetKg > maxAllowedKg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message:
          `Sum of packaging items (${totalItemsNetKg} kg) exceeds ` +
          `orderedKg (${data.orderedKg} kg) by more than 10% tolerance.`,
      });
    }

    if (data.shippedKg > totalItemsNetKg + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shippedKg'],
        message:
          `shippedKg (${data.shippedKg} kg) cannot exceed ` +
          `total packaged items weight (${totalItemsNetKg} kg).`,
      });
    }
  });

export const ReleaseOrShipLotSchema = z.object({
  shipmentLotId: ObjectIdSchema,
  action: z.enum(['RELEASE', 'HOLD', 'SHIP', 'VOID']),
  shippedKg: z.number().positive().optional(),
  deliveryNoteNo: z.string().trim().max(60).optional(),
  carrierName: z.string().trim().max(120).optional(),
  reason: ReasonSchema,
});

// --- 4. COST REPORTS [R9] ---

export const CostBreakdownLineSchema = z.object({
  inputKind: z.enum(['HONEY_DRUM', 'REWORK', 'FLAVOUR']),
  materialId: ObjectIdSchema,
  materialName: z.string().trim(),
  incomingLotId: ObjectIdSchema.optional().nullable(),
  lotNo: z.string().trim().optional().nullable(),
  country: z.string().trim().length(2).optional().nullable(),
  qtyKg: z.number().positive(),
  unitPriceEurPerKg: z.number().nonnegative(),
  lineCostEur: z.number().nonnegative(),
});

export const GenerateCostReportSchema = z.object({
  reportNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^CR-\d{2}-\d{4}$/)
    .optional(),
  batchId: ObjectIdSchema,
  shipmentLotId: ObjectIdSchema.optional().nullable(),
  currency: z.literal('EUR').default('EUR'),
  sellingPriceEurPerKg: z.number().positive(),
  sentToManagement: z.boolean().default(false),
  managementRecipientIds: z.array(ObjectIdSchema).default([]),
  saveToNextcloudAdminFolder: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
  reason: ReasonSchema,
});

// --- 5. STOCK THRESHOLDS [R10] ---

export const UpsertStockThresholdSchema = z.object({
  materialId: ObjectIdSchema,
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
    .optional()
    .nullable(),
  minApprovedFreeKg: z.number().nonnegative(),
  minApprovedFreeDrums: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
  reason: ReasonSchema,
});

// --- 6. NOTIFICATIONS [R10] ---

export const CreateNotificationSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  severity: z.enum(NOTIFICATION_SEVERITIES).default('WARNING'),
  title: z.string().trim().min(3).max(160),
  message: z.string().trim().min(5).max(1000),
  targetRoles: z.array(z.string()).default(['Admin', 'Management']),
  targetUserIds: z.array(ObjectIdSchema).default([]),
  entityType: z
    .enum([
      'SOURCING',
      'INCOMING_LOT',
      'DRUM',
      'CABINET',
      'BATCH',
      'SHIPMENT_LOT',
      'COST_REPORT',
      'STOCK_THRESHOLD',
    ])
    .optional()
    .nullable(),
  entityId: ObjectIdSchema.optional().nullable(),
});

// --- EXPORTED INPUT TYPES ---

export type UpsertCustomerInput =
  z.infer<typeof UpsertCustomerSchema>;

export type CreateShipmentLotItemInput =
  z.infer<typeof CreateShipmentLotItemSchema>;

export type CreateShipmentLotInput =
  z.infer<typeof CreateShipmentLotSchema>;

export type ReleaseOrShipLotInput =
  z.infer<typeof ReleaseOrShipLotSchema>;

export type GenerateCostReportInput =
  z.infer<typeof GenerateCostReportSchema>;

export type UpsertStockThresholdInput =
  z.infer<typeof UpsertStockThresholdSchema>;

export type CreateNotificationInput =
  z.infer<typeof CreateNotificationSchema>;
