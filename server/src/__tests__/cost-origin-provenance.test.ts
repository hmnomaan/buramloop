import { calculateOriginSliceCost } from '../modules/cost/cost.service';

describe('cost origin slice price provenance', () => {
  it('uses the recorded price and cost retained by a honey origin slice', () => {
    expect(
      calculateOriginSliceCost(
        { kg: 125.4567, unitPriceEurPerKg: 4.25, costValueEur: 532.19 },
        3.8
      )
    ).toEqual({
      qtyKg: 125.457,
      unitPriceEurPerKg: 4.25,
      lineCostEur: 532.19,
    });
  });

  it('uses the source fallback price only when the slice has no recorded price', () => {
    expect(calculateOriginSliceCost({ kg: 50, unitPriceEurPerKg: 0 }, 3.6)).toEqual({
      qtyKg: 50,
      unitPriceEurPerKg: 3.6,
      lineCostEur: 180,
    });
  });

  it('preserves rework cost value rather than recalculating it at a current price', () => {
    expect(
      calculateOriginSliceCost(
        { kg: 20, unitPriceEurPerKg: 4.1, costValueEur: 0, valueEur: 72.5 },
        5
      )
    ).toEqual({
      qtyKg: 20,
      unitPriceEurPerKg: 4.1,
      lineCostEur: 72.5,
    });
  });
});
