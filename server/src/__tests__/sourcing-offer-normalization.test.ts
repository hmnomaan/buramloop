import { normalizeSourcingOfferMetrics } from '../../../shared/src/schemas/purchase';

describe('Sourcing offer normalization', () => {
  it.each([
    {
      label: 'tonnes and EUR per kg',
      input: {
        massInputUnit: 'ton' as const,
        offeredInputWeight: 20,
        offeredPackages: 80,
        priceBasis: 'PER_KG' as const,
        inputPriceEur: 3.25,
        transportCostEur: 2000,
      },
      expected: {
        offeredKg: 20000,
        unitWeightKg: 250,
        unitPriceEurPerKg: 3.25,
        transportEurPerKg: 0.1,
        landedUnitPriceEurPerKg: 3.35,
        totalOfferValueEur: 65000,
        totalLandedValueEur: 67000,
      },
    },
    {
      label: 'kilograms and EUR per tonne',
      input: {
        massInputUnit: 'kg' as const,
        offeredInputWeight: 20000,
        offeredPackages: 80,
        priceBasis: 'PER_TON' as const,
        inputPriceEur: 3250,
      },
      expected: {
        offeredKg: 20000,
        unitWeightKg: 250,
        unitPriceEurPerKg: 3.25,
        transportEurPerKg: 0,
        landedUnitPriceEurPerKg: 3.25,
        totalOfferValueEur: 65000,
        totalLandedValueEur: 65000,
      },
    },
    {
      label: 'total offer price',
      input: {
        massInputUnit: 'ton' as const,
        offeredInputWeight: 20,
        offeredPackages: 80,
        priceBasis: 'TOTAL_OFFER' as const,
        inputPriceEur: 66000,
        transportCostEur: 1000,
      },
      expected: {
        offeredKg: 20000,
        unitWeightKg: 250,
        unitPriceEurPerKg: 3.3,
        transportEurPerKg: 0.05,
        landedUnitPriceEurPerKg: 3.35,
        totalOfferValueEur: 66000,
        totalLandedValueEur: 67000,
      },
    },
  ])('normalizes $label', ({ input, expected }) => {
    expect(normalizeSourcingOfferMetrics(input)).toEqual(expected);
  });

  it.each([
    { offeredInputWeight: 0, offeredPackages: 1 },
    { offeredInputWeight: 10, offeredPackages: 0 },
    { offeredInputWeight: Number.NaN, offeredPackages: 1 },
  ])('rejects invalid weight or package count: %o', (values) => {
    expect(() =>
      normalizeSourcingOfferMetrics({
        massInputUnit: 'kg',
        ...values,
      })
    ).toThrow();
  });

  it('rejects negative offer and transport prices', () => {
    expect(() =>
      normalizeSourcingOfferMetrics({
        massInputUnit: 'kg',
        offeredInputWeight: 100,
        offeredPackages: 2,
        inputPriceEur: -1,
      })
    ).toThrow('inputPriceEur must be a non-negative finite number.');
    expect(() =>
      normalizeSourcingOfferMetrics({
        massInputUnit: 'kg',
        offeredInputWeight: 100,
        offeredPackages: 2,
        transportCostEur: -1,
      })
    ).toThrow('transportCostEur must be a non-negative finite number.');
  });
});
