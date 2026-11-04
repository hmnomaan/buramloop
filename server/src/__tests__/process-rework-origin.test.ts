import { Types } from 'mongoose';
import { deriveReworkOriginComposition } from '../../../shared/src/schemas/origin-blend';

describe('deriveReworkOriginComposition', () => {
  it('preserves origin, source IDs, weight percentages, and price-value percentages', () => {
    const incomingLotA = new Types.ObjectId().toHexString();
    const incomingLotB = new Types.ObjectId().toHexString();
    const sourceDrumId = new Types.ObjectId().toHexString();
    const sourcePackageId = new Types.ObjectId().toHexString();
    const sourceReworkId = new Types.ObjectId().toHexString();

    const result = deriveReworkOriginComposition(
      [
        {
          country: 'DE',
          incomingLotId: incomingLotA,
          sourceDrumId,
          kg: 40,
          pct: 40,
          unitPriceEurPerKg: 3,
          costValueEur: 120,
          costSharePct: 25,
        },
        {
          country: 'FR',
          incomingLotId: incomingLotB,
          sourcePackageId,
          sourceReworkId,
          kg: 60,
          pct: 60,
          unitPriceEurPerKg: 5,
          costValueEur: 300,
          costSharePct: 75,
        },
      ],
      20
    );

    expect(result.totalReworkKg).toBe(20);
    expect(result.reworkSlices).toEqual([
      expect.objectContaining({
        country: 'DE',
        incomingLotId: incomingLotA,
        sourceDrumId,
        sourcePackageId: null,
        sourceReworkId: null,
        kg: 8,
        pct: 40,
        unitPriceEurPerKg: 3,
        costValueEur: 24,
        costSharePct: 28.571,
      }),
      expect.objectContaining({
        country: 'FR',
        incomingLotId: incomingLotB,
        sourceDrumId: null,
        sourcePackageId,
        sourceReworkId,
        kg: 12,
        pct: 60,
        unitPriceEurPerKg: 5,
        costValueEur: 60,
        costSharePct: 71.429,
      }),
    ]);
  });
});
