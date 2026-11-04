import {
  computePackageWeightDistribution,
  computeBlendedOriginComposition,
  deriveReworkOriginComposition,
  ReceivingPackageTypeSchema,
} from '../../../shared/src/schemas/origin-blend';
import { sanitizeOriginSlicesForRole } from '../common/price-strip.helper';

describe('Origin, price, package-weight, and rework invariants', () => {
  it('distributes 72 packages exactly for ton and kilogram inputs', () => {
    const evenDistribution = computePackageWeightDistribution({
      packagesCount: 72,
      inputMassUnit: 'ton',
      totalInputWeight: 20.52,
    });

    expect(evenDistribution.totalNetKg).toBe(20520);
    expect(evenDistribution.unitWeightKg).toBe(285);
    expect(evenDistribution.perPackageNetKgs).toHaveLength(72);

    const arbitraryDistribution = computePackageWeightDistribution({
      packagesCount: 72,
      inputMassUnit: 'kg',
      totalInputWeight: 20500,
    });

    expect(arbitraryDistribution.totalNetKg).toBe(20500);
    expect(arbitraryDistribution.unitWeightKg).toBe(284.722);
    expect(
      Number(arbitraryDistribution.perPackageNetKgs.reduce((sum, kg) => sum + kg, 0).toFixed(3))
    ).toBe(20500);
  });

  it.each(['IBC', 'DRUM', 'BUCKET_TRAY'] as const)(
    'supports %s with 100% initial origin-weight and price attribution',
    (packageType) => {
      expect(ReceivingPackageTypeSchema.parse(packageType)).toBe(packageType);

      const composition = computeBlendedOriginComposition([
        {
          country: 'RO',
          incomingLotId: '671f00000000000000000101',
          kg: 1250,
          unitPriceEurPerKg: 3.8,
        },
      ]);

      expect(composition.totalKg).toBe(1250);
      expect(composition.totalCostValueEur).toBe(4750);
      expect(composition.slices).toHaveLength(1);
      expect(composition.slices[0]).toEqual(
        expect.objectContaining({
          country: 'RO',
          kg: 1250,
          pct: 100,
          unitPriceEurPerKg: 3.8,
          costValueEur: 4750,
          costSharePct: 100,
        })
      );
    }
  );

  it('preserves rework composition and blends it with a new origin while enforcing price visibility', () => {
    const lotRoId = '671f00000000000000000101';
    const lotDeId = '671f00000000000000000102';
    const lotMxId = '671f00000000000000000103';
    const reworkId = '671f00000000000000000999';

    const originalBlend = computeBlendedOriginComposition([
      { country: 'RO', incomingLotId: lotRoId, kg: 4000, unitPriceEurPerKg: 3.8 },
      { country: 'DE', incomingLotId: lotDeId, kg: 2000, unitPriceEurPerKg: 4.5 },
    ]);

    expect(originalBlend.totalKg).toBe(6000);
    expect(originalBlend.totalCostValueEur).toBe(24200);
    expect(originalBlend.slices.map((slice) => slice.pct)).toEqual([66.667, 33.333]);
    expect(originalBlend.slices.map((slice) => slice.costValueEur)).toEqual([15200, 9000]);
    expect(originalBlend.slices.reduce((sum, slice) => sum + slice.costSharePct, 0)).toBe(100);

    const rework = deriveReworkOriginComposition(originalBlend.slices, 300);
    expect(rework.totalReworkKg).toBe(300);
    expect(rework.totalReworkCostValueEur).toBe(1210);
    expect(rework.reworkSlices).toEqual([
      expect.objectContaining({
        country: 'RO',
        incomingLotId: lotRoId,
        kg: 200,
        pct: 66.667,
        unitPriceEurPerKg: 3.8,
        costValueEur: 760,
        costSharePct: 62.81,
      }),
      expect.objectContaining({
        country: 'DE',
        incomingLotId: lotDeId,
        kg: 100,
        pct: 33.333,
        unitPriceEurPerKg: 4.5,
        costValueEur: 450,
        costSharePct: 37.19,
      }),
    ]);

    const nextBlend = computeBlendedOriginComposition([
      ...rework.reworkSlices.map((slice) => ({
        country: slice.country,
        incomingLotId: slice.incomingLotId,
        sourceReworkId: reworkId,
        kg: slice.kg,
        unitPriceEurPerKg: slice.unitPriceEurPerKg,
      })),
      { country: 'MX', incomingLotId: lotMxId, kg: 2700, unitPriceEurPerKg: 3.2 },
    ]);

    expect(nextBlend.totalKg).toBe(3000);
    expect(nextBlend.totalCostValueEur).toBe(9850);
    expect(nextBlend.slices.map((slice) => slice.country)).toEqual(['RO', 'DE', 'MX']);
    expect(nextBlend.slices.map((slice) => slice.pct)).toEqual([6.667, 3.333, 90]);
    expect(nextBlend.slices.map((slice) => slice.costValueEur)).toEqual([760, 450, 8640]);
    expect(nextBlend.slices.reduce((sum, slice) => sum + slice.pct, 0)).toBe(100);
    expect(nextBlend.slices.reduce((sum, slice) => sum + slice.costSharePct, 0)).toBe(100);
    expect(nextBlend.slices.slice(0, 2).every((slice) => slice.sourceReworkId === reworkId)).toBe(
      true
    );

    for (const role of ['Admin', 'Management']) {
      const privilegedView = sanitizeOriginSlicesForRole(nextBlend.slices, role);
      expect(privilegedView[0].unitPriceEurPerKg).toBe(3.8);
      expect(privilegedView[0].costValueEur).toBe(760);
      expect(privilegedView[0].costSharePct).toBeDefined();
    }

    const inspectorView = sanitizeOriginSlicesForRole(nextBlend.slices, 'Inspector');
    expect(inspectorView[0].unitPriceEurPerKg).toBeUndefined();
    expect(inspectorView[0].costValueEur).toBeUndefined();
    expect(inspectorView[0].costSharePct).toBeUndefined();
    expect(inspectorView[0].pct).toBe(6.667);
    expect(inspectorView[0].country).toBe('RO');
  });
});
