// shared/src/schemas/origin-blend.ts
import { z } from 'zod';
import { Iso2CountrySchema, ObjectIdSchema, roundKg } from './common.js';

export const ReceivingPackageTypeSchema = z.enum([
  'IBC',
  'DRUM',
  'BUCKET_TRAY',
  'PAIL',
  'CARTON',
  'BAG',
  'PALLET',
  'BOTTLE',
  'PIECE',
]);
export type ReceivingPackageType = z.infer<typeof ReceivingPackageTypeSchema>;

export const MassInputUnitSchema = z.enum(['kg', 'ton']);
export type MassInputUnit = z.infer<typeof MassInputUnitSchema>;

export const roundEur = (val: number): number =>
  Math.round((val + Number.EPSILON) * 100) / 100;

export const roundPct = (val: number): number =>
  Math.round((val + Number.EPSILON) * 1000) / 1000;

export const OriginPriceWeightSliceSchema = z.object({
  country: Iso2CountrySchema,
  incomingLotId: ObjectIdSchema,
  sourceDrumId: ObjectIdSchema.optional().nullable(),
  sourcePackageId: ObjectIdSchema.optional().nullable(),
  sourceReworkId: ObjectIdSchema.optional().nullable(),
  kg: z.number().nonnegative(),
  pct: z.number().min(0).max(100), // Weight percentage (sums to 100%)
  unitPriceEurPerKg: z.number().nonnegative().default(0),
  costValueEur: z.number().nonnegative().default(0),
  costSharePct: z.number().min(0).max(100).default(0), // Price value percentage (sums to 100%)
});

export type OriginPriceWeightSlice = z.infer<typeof OriginPriceWeightSliceSchema>;

/**
 * Converts total weight (entered in 'kg' or 'ton') across N packages (IBC, DRUM, BUCKET_TRAY)
 * into totalNetKg, nominal unitWeightKg per package, and an exact per-package weight array
 * whose sum is guaranteed to equal totalNetKg with 0.000 kg rounding drift.
 */
export function computePackageWeightDistribution(params: {
  packagesCount: number;
  inputMassUnit: MassInputUnit;
  totalInputWeight?: number;
  unitInputWeightKg?: number;
}): {
  totalNetKg: number;
  unitWeightKg: number;
  perPackageNetKgs: number[];
} {
  const { packagesCount, inputMassUnit, totalInputWeight, unitInputWeightKg } = params;
  if (!Number.isInteger(packagesCount) || packagesCount <= 0) {
    throw new Error('packagesCount must be a positive integer.');
  }

  let totalNetKg: number;
  if (totalInputWeight !== undefined && totalInputWeight > 0) {
    totalNetKg =
      inputMassUnit === 'ton'
        ? roundKg(totalInputWeight * 1000)
        : roundKg(totalInputWeight);
  } else if (unitInputWeightKg !== undefined && unitInputWeightKg > 0) {
    const unitKg =
      inputMassUnit === 'ton'
        ? roundKg(unitInputWeightKg * 1000)
        : roundKg(unitInputWeightKg);
    totalNetKg = roundKg(packagesCount * unitKg);
  } else {
    throw new Error('Either totalInputWeight or unitInputWeightKg must be > 0.');
  }

  const unitWeightKg = roundKg(totalNetKg / packagesCount);
  const perPackageNetKgs: number[] = [];
  let allocatedKg = 0;

  for (let i = 1; i <= packagesCount; i++) {
    if (i < packagesCount) {
      perPackageNetKgs.push(unitWeightKg);
      allocatedKg = roundKg(allocatedKg + unitWeightKg);
    } else {
      // Final package absorbs any sub-gram remainder so sum(perPackageNetKgs) === totalNetKg
      const lastPackageKg = roundKg(totalNetKg - allocatedKg);
      perPackageNetKgs.push(lastPackageKg);
    }
  }

  return {
    totalNetKg,
    unitWeightKg,
    perPackageNetKgs,
  };
}

/**
 * Combines input slices (from new drums AND/OR multi-origin ReworkStock leftovers)
 * and computes normalized weight percentage (pct = 100%) and price value percentage (costSharePct = 100%).
 */
export function computeBlendedOriginComposition(
  rawSlices: Array<{
    country: string;
    incomingLotId: string;
    sourceDrumId?: string | null;
    sourcePackageId?: string | null;
    sourceReworkId?: string | null;
    kg: number;
    unitPriceEurPerKg?: number;
  }>
): {
  totalKg: number;
  totalCostValueEur: number;
  weightedAvgEurPerKg: number;
  slices: OriginPriceWeightSlice[];
} {
  const validSlices = rawSlices.filter((s) => s.kg > 0);
  const totalKg = roundKg(validSlices.reduce((sum, s) => sum + s.kg, 0));
  if (totalKg <= 0) {
    return { totalKg: 0, totalCostValueEur: 0, weightedAvgEurPerKg: 0, slices: [] };
  }

  const withCosts = validSlices.map((s) => {
    const kg = roundKg(s.kg);
    const unitPriceEurPerKg = roundEur(s.unitPriceEurPerKg ?? 0);
    const costValueEur = roundEur(kg * unitPriceEurPerKg);
    return {
      country: s.country.toUpperCase(),
      incomingLotId: s.incomingLotId,
      sourceDrumId: s.sourceDrumId ?? null,
      sourcePackageId: s.sourcePackageId ?? null,
      sourceReworkId: s.sourceReworkId ?? null,
      kg,
      unitPriceEurPerKg,
      costValueEur,
    };
  });

  const totalCostValueEur = roundEur(
    withCosts.reduce((sum, s) => sum + s.costValueEur, 0)
  );

  let runningWeightPct = 0;
  let runningCostPct = 0;

  const slices: OriginPriceWeightSlice[] = withCosts.map((s, idx) => {
    const isLast = idx === withCosts.length - 1;
    const pct = isLast
      ? roundPct(Math.max(0, 100 - runningWeightPct))
      : roundPct((s.kg / totalKg) * 100);
    runningWeightPct = roundPct(runningWeightPct + pct);

    let costSharePct = 0;
    if (totalCostValueEur > 0) {
      costSharePct = isLast
        ? roundPct(Math.max(0, 100 - runningCostPct))
        : roundPct((s.costValueEur / totalCostValueEur) * 100);
      runningCostPct = roundPct(runningCostPct + costSharePct);
    }

    return {
      ...s,
      pct,
      costSharePct,
    };
  });

  return {
    totalKg,
    totalCostValueEur,
    weightedAvgEurPerKg:
      totalCostValueEur > 0 ? roundEur(totalCostValueEur / totalKg) : 0,
    slices,
  };
}

/**
 * Scales an existing batch's originComposition[] down to a leftover Rework weight (reworkOutKg),
 * preserving exact weight percentages, origin countries, unit prices, scaled price values, and costSharePct.
 */
export function deriveReworkOriginComposition(
  parentOrigins: OriginPriceWeightSlice[],
  reworkOutKg: number
): {
  totalReworkKg: number;
  totalReworkCostValueEur: number;
  weightedAvgEurPerKg: number;
  reworkSlices: OriginPriceWeightSlice[];
} {
  const targetKg = roundKg(reworkOutKg);
  if (targetKg <= 0 || parentOrigins.length === 0) {
    return {
      totalReworkKg: 0,
      totalReworkCostValueEur: 0,
      weightedAvgEurPerKg: 0,
      reworkSlices: [],
    };
  }

  const parentTotalKg = roundKg(parentOrigins.reduce((sum, slice) => sum + slice.kg, 0));
  let allocatedKg = 0;
  const scaledInputs = parentOrigins.map((slice, idx) => {
    const isLast = idx === parentOrigins.length - 1;
    const weightRatio =
      parentTotalKg > 0 ? slice.kg / parentTotalKg : slice.pct / 100;
    const sliceKg = isLast
      ? roundKg(Math.max(0, targetKg - allocatedKg))
      : roundKg(targetKg * weightRatio);
    allocatedKg = roundKg(allocatedKg + sliceKg);

    return {
      country: slice.country,
      incomingLotId: slice.incomingLotId,
      sourceDrumId: slice.sourceDrumId ?? null,
      sourcePackageId: slice.sourcePackageId ?? null,
      sourceReworkId: slice.sourceReworkId ?? null,
      kg: sliceKg,
      unitPriceEurPerKg: slice.unitPriceEurPerKg,
    };
  });

  const blended = computeBlendedOriginComposition(scaledInputs);
  return {
    totalReworkKg: blended.totalKg,
    totalReworkCostValueEur: blended.totalCostValueEur,
    weightedAvgEurPerKg: blended.weightedAvgEurPerKg,
    reworkSlices: blended.slices,
  };
}