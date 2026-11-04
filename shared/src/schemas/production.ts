
// shared/src/schemas/production.ts

import { z } from 'zod';
import { ObjectIdSchema, ReasonSchema, roundKg } from './common.js';
import { OriginSliceSchema } from './stock.js';

// --- CONSTANTS & STATE MACHINES ---

export const NOMINAL_DRUM_KG = 290;
export const CABINET_COUNT = 2;
export const SLOTS_PER_CABINET = 17;
export const MAX_WARM_CYCLE_DRUMS =
  CABINET_COUNT * SLOTS_PER_CABINET; // 34 drums (9,860 kg)

export const BATCH_STATUSES = [
  'DRAFT',
  'RESERVED',
  'WARMING',
  'FILTERING',
  'BLENDING',
  'FILLING',
  'DONE',
  'RELEASED',
  'VOID',
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const ALLOWED_BATCH_TRANSITIONS: Record<
  BatchStatus,
  readonly BatchStatus[]
> = {
  DRAFT: ['RESERVED', 'VOID'],
  RESERVED: ['WARMING', 'VOID'],
  WARMING: ['FILTERING', 'VOID'],
  FILTERING: ['BLENDING', 'VOID'],
  BLENDING: ['FILLING', 'VOID'],
  FILLING: ['DONE', 'VOID'],
  DONE: ['RELEASED', 'VOID'],
  RELEASED: [],
  VOID: [],
};

export const FILL_LINE_CODES = [
  'QUIEL_PET',
  'CARLO_JAR',
  'HAND',
] as const;

export type FillLineCode = (typeof FILL_LINE_CODES)[number];

export const PROCESS_STEP_TYPES = [
  'WARMING_IN',
  'WARMING_OUT',
  'FILTRATION',
  'BLENDING',
  'RESTING_TANK',
  'FILLING',
] as const;

export type ProcessStepType = (typeof PROCESS_STEP_TYPES)[number];

export const WARM_OUT_DESTINATIONS = [
  'FILTRATION',
  'WAREHOUSE',
] as const;

export type WarmOutDestination =
  (typeof WARM_OUT_DESTINATIONS)[number];

export const REWORK_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'CONSUMED',
  'VOID',
] as const;

export type ReworkStatus = (typeof REWORK_STATUSES)[number];

// --- HELPERS ---

// ObjectIdSchema should produce hexadecimal ID strings.
const normalizeId = (id: string): string => id.toLowerCase();

// --- 1. WARM CABINETS (2 x 17 = 34 drums) [R5] ---

export const CabinetSlotOccupancySchema = z.object({
  slotNo: z.number().int().min(1).max(SLOTS_PER_CABINET),
  drumId: ObjectIdSchema,
  batchId: ObjectIdSchema.optional().nullable(),
  checkedInAt: z.coerce.date(),
  checkedInBy: ObjectIdSchema,
  inTempC: z.number().min(0).max(80),
  readyAt: z.coerce.date(),
});

export const UpsertCabinetSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^CAB-0[12]$/, 'Cabinet code must be CAB-01 or CAB-02'),
  name: z.string().trim().min(2).max(80),
  capacityDrums: z
    .number()
    .int()
    .default(SLOTS_PER_CABINET)
    .refine((value) => value === SLOTS_PER_CABINET, {
      message: `Each warm cabinet has strictly ${SLOTS_PER_CABINET} drum slots`,
    }),
  targetTempC: z.number().min(25).max(65).default(45),
  minWarmHours: z.number().int().min(24).max(48).default(24),
  maxWarmHours: z.number().int().min(24).max(72).default(48),
  isActive: z.boolean().default(true),
  reason: ReasonSchema,
});

export const WarmCabinetCheckInSchema = z
  .object({
    cabinetId: ObjectIdSchema,
    batchId: ObjectIdSchema.optional().nullable(),
    entries: z
      .array(
        z.object({
          slotNo: z
            .number()
            .int()
            .min(1)
            .max(SLOTS_PER_CABINET),
          drumId: ObjectIdSchema,
          inTempC: z.number().min(0).max(70),
        })
      )
      .min(1)
      .max(SLOTS_PER_CABINET),
    targetWarmHours: z.number().min(24).max(48).default(36),
    personInChargeId: ObjectIdSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const slots = data.entries.map((entry) => entry.slotNo);

    if (new Set(slots).size !== slots.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries'],
        message:
          'Duplicate slotNo in warm cabinet check-in entries.',
      });
    }

    const drumIds = data.entries.map((entry) =>
      normalizeId(entry.drumId),
    );

    if (new Set(drumIds).size !== drumIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries'],
        message:
          'Duplicate drumId in warm cabinet check-in entries.',
      });
    }
  });

export const WarmCabinetCheckOutSchema = z.object({
  cabinetId: ObjectIdSchema,
  drumIds: z
    .array(ObjectIdSchema)
    .min(1)
    .max(SLOTS_PER_CABINET),
  outTempC: z.number().min(15).max(75),
  destination: z.enum(WARM_OUT_DESTINATIONS),
  batchId: ObjectIdSchema.optional().nullable(),
  personInChargeId: ObjectIdSchema,
  reason: z.string().trim().max(500).optional(),
});

// --- 2. RESTING TANKS [R7] ---

export const UpsertTankSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(24),
  name: z.string().trim().min(2).max(80),
  capacityKg: z.number().positive().max(50000),
  isActive: z.boolean().default(true),
  reason: ReasonSchema,
});

// --- 3. FILL LINES [R7] ---

export const UpsertFillLineSchema = z.object({
  code: z.enum(FILL_LINE_CODES),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().default(true),
  reason: ReasonSchema,
});

// --- 4. BATCHES & FEASIBILITY [R6, R7] ---

export const BatchFlavourItemSchema = z.object({
  materialId: ObjectIdSchema, // Material must have kind === 'FLAVOUR'
  incomingLotId: ObjectIdSchema.optional().nullable(),
  plannedKg: z.number().positive(),
  consumedKg: z.number().nonnegative().default(0),
});

export const BatchFeasibilitySnapshotSchema = z.object({
  checkedAt: z.coerce.date(),
  checkedBy: ObjectIdSchema,
  canFulfill: z.boolean(),
  availableApprovedKg: z.number().nonnegative(),
  availableDrumsCount: z.number().int().nonnegative(),
  availableReworkKg: z.number().nonnegative().default(0),
  cabinetSlotsFree: z
    .number()
    .int()
    .min(0)
    .max(MAX_WARM_CYCLE_DRUMS),
  requiredDrumsCount: z.number().int().positive(),
  shortfallKg: z.number().nonnegative(),
  shortfallDrums: z.number().int().nonnegative(),
  allowedCountries: z
    .array(z.string().length(2).toUpperCase())
    .min(1)
    .max(3),
  candidateDrumIds: z.array(ObjectIdSchema),
  candidateReworkIds: z.array(ObjectIdSchema).default([]),
  verdictMessage: z.string().trim().min(3).max(1000),
});

export const CreateBatchSchema = z
  .object({
    // processNo === batchNo; e.g. B26-0001
    processNo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^B\d{2}-\d{4}$/,
        'Batch/Process No must match B<YY>-<NNNN> (e.g., B26-0001)',
      )
      .optional(),
    customerId: ObjectIdSchema.optional().nullable(),
    allowedCountries: z
      .array(z.string().trim().toUpperCase().length(2))
      .min(1, 'At least 1 allowed country required')
      .max(3, 'Customers may restrict to 1-3 countries'),
    baseMaterialId: ObjectIdSchema, // Material must have kind === 'HONEY'
    plannedKg: z.number().positive().max(50000),
    approvedKg: z.number().positive().max(50000),
    flavours: z.array(BatchFlavourItemSchema).default([]),
    restingTankId: ObjectIdSchema.optional().nullable(),
    fillLine: z.enum(FILL_LINE_CODES).optional().nullable(),
    notes: z.string().trim().max(1000).optional(),
    reason: ReasonSchema,
  })
  .superRefine((data, ctx) => {
    if (data.approvedKg < data.plannedKg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedKg'],
        message:
          `approvedKg (${data.approvedKg}) must be >= plannedKg ` +
          `(${data.plannedKg}) to cover buffer/rework.`,
      });
    }

    const drumsNeeded = Math.ceil(
      data.approvedKg / NOMINAL_DRUM_KG,
    );

    if (drumsNeeded > MAX_WARM_CYCLE_DRUMS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedKg'],
        message:
          `approvedKg (${data.approvedKg} kg ≈ ${drumsNeeded} drums) ` +
          `exceeds warm cycle capacity of ${MAX_WARM_CYCLE_DRUMS} drums ` +
          '(9,860 kg).',
      });
    }
  });

// --- 4A. APPROVE AND RESERVE BATCH ---

export const ApproveAndReserveBatchSchema = z
  .object({
    batchId: ObjectIdSchema,
    approvedKg: z.number().positive().max(9860),

    drumIds: z
      .array(ObjectIdSchema)
      .min(1)
      .max(MAX_WARM_CYCLE_DRUMS)
      .refine(
        (ids) =>
          new Set(ids.map(normalizeId)).size === ids.length,
        'Duplicate drumIds are not allowed',
      ),

    reworkStockIds: z
      .array(ObjectIdSchema)
      .default([])
      .refine(
        (ids) =>
          new Set(ids.map(normalizeId)).size === ids.length,
        'Duplicate reworkStockIds are not allowed',
      ),

    cabinetAssignments: z
      .array(
        z.object({
          cabinetId: ObjectIdSchema,
          drumIds: z
            .array(ObjectIdSchema)
            .min(1)
            .max(SLOTS_PER_CABINET)
            .refine(
              (ids) =>
                new Set(ids.map(normalizeId)).size === ids.length,
              'Duplicate drumIds within a cabinet are not allowed',
            ),
          targetTempC: z.number().min(25).max(65).default(45),
        }),
      )
      .max(CABINET_COUNT)
      .default([]),

    reason: ReasonSchema,
  })
  .superRefine((data, ctx) => {
    const reservedSet = new Set(
      data.drumIds.map(normalizeId),
    );

    const seenCabinetDrums = new Set<string>();
    const seenCabinets = new Set<string>();

    for (const [idx, cabinet] of data.cabinetAssignments.entries()) {
      const cabinetId = normalizeId(cabinet.cabinetId);

      if (seenCabinets.has(cabinetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cabinetAssignments', idx, 'cabinetId'],
          message: 'Duplicate cabinetId in cabinetAssignments.',
        });
      }

      seenCabinets.add(cabinetId);

      for (const drumIdValue of cabinet.drumIds) {
        const drumId = normalizeId(drumIdValue);

        if (!reservedSet.has(drumId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cabinetAssignments', idx, 'drumIds'],
            message:
              `Cabinet drum ${drumIdValue} must be included in batch drumIds.`,
          });
        }

        if (seenCabinetDrums.has(drumId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cabinetAssignments', idx, 'drumIds'],
            message:
              `Drum ${drumIdValue} cannot be assigned to multiple ` +
              'cabinet slots simultaneously.',
          });
        }

        seenCabinetDrums.add(drumId);
      }
    }
  });

// --- 5. BATCH INPUTS (Drums, Rework, Flavours into Batch) [R6] ---

export const CreateBatchInputSchema = z
  .object({
    batchId: ObjectIdSchema,
    inputKind: z.enum(['DRUM', 'PACKAGE', 'REWORK', 'FLAVOUR']),
    drumId: ObjectIdSchema.optional().nullable(),
    packageId: ObjectIdSchema.optional().nullable(),
    reworkStockId: ObjectIdSchema.optional().nullable(),
    flavourMaterialId: ObjectIdSchema.optional().nullable(),
    incomingLotId: ObjectIdSchema.optional().nullable(),
    qtyKg: z.number().positive(),
    overrideMismatch: z.boolean().default(false),
    overrideReason: ReasonSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.inputKind === 'DRUM' && !data.drumId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['drumId'],
        message: 'drumId is required when inputKind is DRUM',
      });
    }

    if (data.inputKind === 'PACKAGE' && !data.packageId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packageId'],
        message: 'packageId is required when inputKind is PACKAGE',
      });
    }

    if (data.inputKind === 'REWORK' && !data.reworkStockId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reworkStockId'],
        message: 'reworkStockId is required when inputKind is REWORK',
      });
    }

    if (
      data.inputKind === 'FLAVOUR' &&
      !data.flavourMaterialId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flavourMaterialId'],
        message:
          'flavourMaterialId is required when inputKind is FLAVOUR',
      });
    }

    if (data.overrideMismatch && !data.overrideReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overrideReason'],
        message:
          'Mandatory audit reason required when overriding a batch spec mismatch',
      });
    }
  });

// --- 6. PROCESS STEPS [R7] ---
// Mass balance: in = out + loss + reworkOut

export const CreateProcessStepSchema = z
  .object({
    batchId: ObjectIdSchema,
    processNo: z.string().trim().toUpperCase(),
    stepType: z.enum(PROCESS_STEP_TYPES),
    tempC: z.number().min(10).max(85),
    personInChargeId: ObjectIdSchema,
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().optional().nullable(),
    inKg: z.number().positive(),
    outKg: z.number().nonnegative(),
    lossKg: z.number().nonnegative(),
    reworkOutKg: z.number().nonnegative().default(0),
    cabinetId: ObjectIdSchema.optional().nullable(),
    warmOutDestination: z
      .enum(WARM_OUT_DESTINATIONS)
      .optional()
      .nullable(),
    tankId: ObjectIdSchema.optional().nullable(),
    fillLine: z.enum(FILL_LINE_CODES).optional().nullable(),
    filterMicron: z.number().positive().optional().nullable(),
    notes: z.string().trim().max(1000).optional(),
    reason: ReasonSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const inRounded = roundKg(data.inKg);
    const outSum =
      roundKg(data.outKg) +
      data.lossKg +
      data.reworkOutKg;

    if (Math.abs(inRounded - outSum) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outKg'],
        message:
          `Mass balance violation: inKg (${inRounded}) must equal ` +
          `outKg (${data.outKg}) + lossKg (${data.lossKg}) + ` +
          `reworkOutKg (${data.reworkOutKg}) = ${outSum}.`,
      });
    }

    if (
      data.stepType === 'WARMING_OUT' &&
      !data.warmOutDestination
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['warmOutDestination'],
        message:
          'WARMING_OUT requires destination (FILTRATION or WAREHOUSE).',
      });
    }

    if (data.stepType === 'RESTING_TANK' && !data.tankId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tankId'],
        message: 'RESTING_TANK step requires tankId.',
      });
    }

    if (data.stepType === 'FILLING' && !data.fillLine) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fillLine'],
        message:
          'FILLING step requires fillLine (QUIEL_PET, CARLO_JAR, or HAND).',
      });
    }
  });

// --- 7. REWORK STOCKS (Leftover honey with origin traceability) [R6] ---

export const CreateReworkStockSchema = z
  .object({
    reworkNo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^RW-\d{2}-\d{4}$/,
        'Rework number must match RW-<YY>-<NNNN>',
      )
      .optional(),

    sourceBatchId: ObjectIdSchema,
    sourceProcessNo: z.string().trim().toUpperCase(),
    sourceProcessStepId: ObjectIdSchema.optional().nullable(),
    materialId: ObjectIdSchema,
    totalKg: z.number().positive(),
    remainingKg: z.number().nonnegative(),

    origin: z
      .array(OriginSliceSchema)
      .min(1)
      .refine(
        (origins) => {
          const sumPct = origins.reduce(
            (sum, origin) => sum + origin.pct,
            0,
          );

          return Math.abs(sumPct - 100) <= 0.1;
        },
        {
          message:
            'Rework origin[] percentages must sum to 100% (±0.1%)',
        },
      ),

    notes: z.string().trim().max(500).optional(),
    reason: ReasonSchema,
  })
  .superRefine((data, ctx) => {
    const totalKg = roundKg(data.totalKg);
    const remainingKg = roundKg(data.remainingKg);

    if (remainingKg > totalKg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remainingKg'],
        message:
          `remainingKg (${data.remainingKg}) cannot exceed ` +
          `totalKg (${data.totalKg}).`,
      });
    }

    const sumOriginKg = roundKg(
      data.origin.reduce((sum, origin) => sum + origin.kg, 0),
    );

    if (Math.abs(sumOriginKg - totalKg) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['origin'],
        message:
          `Sum of origin[].kg (${sumOriginKg} kg) must equal ` +
          `totalKg (${data.totalKg} kg).`,
      });
    }
  });

// --- EXPORTED INPUT TYPES ---

export type UpsertCabinetInput =
  z.infer<typeof UpsertCabinetSchema>;

export type WarmCabinetCheckInInput =
  z.infer<typeof WarmCabinetCheckInSchema>;

export type WarmCabinetCheckOutInput =
  z.infer<typeof WarmCabinetCheckOutSchema>;

export type UpsertTankInput =
  z.infer<typeof UpsertTankSchema>;

export type UpsertFillLineInput =
  z.infer<typeof UpsertFillLineSchema>;

export type CreateBatchInput =
  z.infer<typeof CreateBatchSchema>;

export type ApproveAndReserveBatchInput =
  z.infer<typeof ApproveAndReserveBatchSchema>;

export type CreateBatchInputRecord =
  z.infer<typeof CreateBatchInputSchema>;

export type CreateProcessStepInput =
  z.infer<typeof CreateProcessStepSchema>;

export type CreateReworkStockInput =
  z.infer<typeof CreateReworkStockSchema>;
