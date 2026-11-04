import { z } from 'zod';
import {
  Iso2CountrySchema,
  ObjectIdSchema,
  ReasonSchema,
  roundKg,
} from './common.ts';
import {
  MassInputUnitSchema,
  ReceivingPackageTypeSchema,
  roundEur,
} from './origin-blend.ts';

export const SOURCING_GATES = [
  'PRICE_OFFER',
  'EXTERNAL_ANALYSIS',
  'SAMPLE',
  'INHOUSE_QSI',
] as const;
export type SourcingGate = (typeof SOURCING_GATES)[number];

export const SOURCING_STAGES = [
  'OFFER',
  ...SOURCING_GATES,
  'PASSED',
  'REJECTED',
  'CONTRACTED',
  'SHIPPED',
] as const;
export type SourcingStage = (typeof SOURCING_STAGES)[number];

export const SOURCING_GATE_PERMISSIONS: Record<SourcingGate, string> = {
  PRICE_OFFER: 'sourcing:write',
  EXTERNAL_ANALYSIS: 'management:approve',
  SAMPLE: 'sourcing:write',
  INHOUSE_QSI: 'qa:approve',
};

export const OfferPriceBasisSchema = z.enum([
  'PER_KG',
  'PER_TON',
  'TOTAL_OFFER',
]);
export type OfferPriceBasis = z.infer<typeof OfferPriceBasisSchema>;

export const MarketDemandFitSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type MarketDemandFit = z.infer<typeof MarketDemandFitSchema>;

export const SampleRoutingModeSchema = z.enum([
  'REQUESTED_FROM_SUPPLIER',
  'SENT_DIRECT_TO_QSI',
  'RECEIVED_AT_BURAM',
]);
export type SampleRoutingMode = z.infer<typeof SampleRoutingModeSchema>;

export const SupplierLeadStatusSchema = z.enum([
  'LEAD',
  'ACTIVE_PARTNER',
  'ON_HOLD',
]);
export type SupplierLeadStatus = z.infer<typeof SupplierLeadStatusSchema>;

export interface SourcingOfferMetricsInput {
  massInputUnit: z.infer<typeof MassInputUnitSchema>;
  offeredInputWeight: number;
  offeredPackages: number;
  priceBasis?: OfferPriceBasis;
  inputPriceEur?: number;
  transportCostEur?: number;
}

export interface SourcingOfferMetrics {
  offeredKg: number;
  unitWeightKg: number;
  unitPriceEurPerKg: number;
  transportEurPerKg: number;
  landedUnitPriceEurPerKg: number;
  totalOfferValueEur: number;
  totalLandedValueEur: number;
}

export function normalizeSourcingOfferMetrics(
  input: SourcingOfferMetricsInput
): SourcingOfferMetrics {
  if (!Number.isFinite(input.offeredInputWeight) || input.offeredInputWeight <= 0) {
    throw new Error('offeredInputWeight must be a positive finite number.');
  }
  if (!Number.isInteger(input.offeredPackages) || input.offeredPackages <= 0) {
    throw new Error('offeredPackages must be a positive integer.');
  }
  const rawPrice = input.inputPriceEur ?? 0;
  const transportCostEur = input.transportCostEur ?? 0;
  if (!Number.isFinite(rawPrice) || rawPrice < 0) {
    throw new Error('inputPriceEur must be a non-negative finite number.');
  }
  if (!Number.isFinite(transportCostEur) || transportCostEur < 0) {
    throw new Error('transportCostEur must be a non-negative finite number.');
  }

  const offeredKg = roundKg(
    input.massInputUnit === 'ton'
      ? input.offeredInputWeight * 1000
      : input.offeredInputWeight
  );
  const unitWeightKg = roundKg(offeredKg / input.offeredPackages);
  const basis = input.priceBasis ?? 'PER_KG';
  const unitPriceEurPerKg =
    rawPrice === 0
      ? 0
      : roundEur(
          basis === 'PER_TON'
            ? rawPrice / 1000
            : basis === 'TOTAL_OFFER'
              ? rawPrice / offeredKg
              : rawPrice
        );
  const roundedTransportCostEur = roundEur(transportCostEur);
  const transportEurPerKg =
    roundedTransportCostEur > 0
      ? roundEur(roundedTransportCostEur / offeredKg)
      : 0;
  const totalOfferValueEur = roundEur(offeredKg * unitPriceEurPerKg);

  return {
    offeredKg,
    unitWeightKg,
    unitPriceEurPerKg,
    transportEurPerKg,
    landedUnitPriceEurPerKg: roundEur(
      unitPriceEurPerKg + transportEurPerKg
    ),
    totalOfferValueEur,
    totalLandedValueEur: roundEur(
      totalOfferValueEur + roundedTransportCostEur
    ),
  };
}

export const UpsertSupplierSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(24),
  name: z.string().trim().min(2).max(160),
  country: Iso2CountrySchema,
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  contactPhone: z.string().trim().max(50).optional(),
  isActive: z.boolean().default(true),
  reason: ReasonSchema,
});

export const CreateSupplierLeadSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(24).optional(),
  name: z.string().trim().min(2).max(160),
  country: Iso2CountrySchema,
  regionCity: z.string().trim().max(120).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(500).optional(),
  honeyVarieties: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  certifications: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  typicalCapacityTonsPerYear: z.number().nonnegative().max(100000).optional(),
  leadStatus: SupplierLeadStatusSchema.default('LEAD'),
  notes: z.string().trim().max(2000).optional(),
  reason: ReasonSchema,
});
export type CreateSupplierLeadInput = z.infer<typeof CreateSupplierLeadSchema>;

export const UpdateSupplierLeadStatusSchema = z.object({
  leadStatus: SupplierLeadStatusSchema,
  reason: ReasonSchema,
});
export type UpdateSupplierLeadStatusInput = z.infer<
  typeof UpdateSupplierLeadStatusSchema
>;

export const CreateSourcingSchema = z
  .object({
    supplierId: ObjectIdSchema,
    materialId: ObjectIdSchema,
    country: Iso2CountrySchema,
    massInputUnit: MassInputUnitSchema.default('kg'),
    offeredInputWeight: z.number().positive().max(500000).optional(),
    offeredKg: z.number().positive().max(500000).optional(),
    offeredDrums: z.number().int().positive().max(10000).optional(),
    packageType: ReceivingPackageTypeSchema.default('DRUM'),
    priceBasis: OfferPriceBasisSchema.default('PER_KG'),
    inputPriceEur: z.number().nonnegative().max(10000000).optional(),
    transportCostEur: z.number().nonnegative().max(1000000).optional(),
    offerRef: z.string().trim().max(120).optional(),
    offerNotes: z.string().trim().max(2000).optional(),
    saveAsFutureLead: z.boolean().default(true),
    unitPriceEurPerKg: z.number().nonnegative().optional(),
    reason: ReasonSchema,
  })
  .superRefine((value, ctx) => {
    if (value.offeredInputWeight === undefined && value.offeredKg === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['offeredInputWeight'],
        message: 'Provide offer weight in kg or tonnes.',
      });
    }
    if (value.packageType === 'DRUM' && value.offeredDrums === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['offeredDrums'],
        message: 'Package count is required.',
      });
    }
    if (value.packageType !== 'DRUM' && value.offeredDrums === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['offeredDrums'],
        message: 'Package count is required.',
      });
    }
  });
export type CreateSourcingInput = z.infer<typeof CreateSourcingSchema>;

const ExternalAnalysisSchema = z.object({
  labName: z.string().trim().min(2).max(120),
  reportNo: z.string().trim().min(1).max(80),
  reportDate: z.string().datetime(),
  locationAcceptable: z.boolean(),
  priceAcceptable: z.boolean(),
  marketDemandFit: MarketDemandFitSchema,
  transportCostEur: z.number().nonnegative().max(1000000),
  qualityAcceptable: z.boolean(),
  parametersSummary: z.string().trim().max(1000).optional(),
  managementNotes: z.string().trim().max(1000).optional(),
});

const SampleSchema = z.object({
  sampleCode: z.string().trim().min(1).max(80),
  routingMode: SampleRoutingModeSchema,
  qsiTrackingRef: z.string().trim().max(120).optional(),
  receivedAt: z.string().datetime(),
  weightGrams: z.number().positive().max(100000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const InhouseQsiSchema = z.object({
  inhouseSensoryPass: z.boolean(),
  sensoryNotes: z.string().trim().max(1000).optional(),
  qsiReportNo: z.string().trim().min(1).max(80),
  qsiReportPublishedAt: z.string().datetime().optional(),
  qsiPass: z.boolean(),
  moisturePct: z.number().min(0).max(40).optional(),
  hmfMgKg: z.number().min(0).max(200).optional(),
  diastaseDn: z.number().nonnegative().optional(),
  c4SugarPass: z.boolean().optional(),
  nmrPass: z.boolean().optional(),
  qsiAttachmentId: ObjectIdSchema.optional(),
});

export const EvaluateSourcingGateSchema = z.object({
  gate: z.enum(SOURCING_GATES),
  decision: z.enum(['APPROVED', 'REJECTED']),
  externalAnalysis: ExternalAnalysisSchema.optional(),
  sample: SampleSchema.optional(),
  inhouseQsi: InhouseQsiSchema.optional(),
  reason: ReasonSchema,
});
export type EvaluateSourcingGateInput = z.infer<
  typeof EvaluateSourcingGateSchema
>;

export const CreateContractFromSourcingSchema = z.object({
  deliveryTerms: z.string().trim().max(200).optional(),
  expectedArrivalDate: z.coerce.date().optional().nullable(),
  reason: ReasonSchema,
});
export type CreateContractFromSourcingInput = z.infer<
  typeof CreateContractFromSourcingSchema
>;

export const CreateContractSchema = z.object({
  contractNo: z.string().trim().toUpperCase().optional(),
  sourcingId: ObjectIdSchema,
  supplierId: ObjectIdSchema,
  materialId: ObjectIdSchema,
  country: Iso2CountrySchema,
  contractedKg: z.number().positive(),
  agreedPriceEurPerKg: z.number().positive(),
  currency: z.literal('EUR').default('EUR'),
  deliveryDeadline: z.coerce.date().optional().nullable(),
  reason: ReasonSchema,
});

export const UpsertPriceSchema = z.object({
  entityType: z.enum(['SOURCING', 'CONTRACT', 'INCOMING_LOT', 'MATERIAL_STANDARD']),
  entityId: ObjectIdSchema,
  unitPriceEurPerKg: z.number().nonnegative(),
  currency: z.literal('EUR').default('EUR'),
  reason: ReasonSchema,
});

export type UpsertSupplierInput = z.infer<typeof UpsertSupplierSchema>;
export type CreateContractInput = z.infer<typeof CreateContractSchema>;
export type UpsertPriceInput = z.infer<typeof UpsertPriceSchema>;
