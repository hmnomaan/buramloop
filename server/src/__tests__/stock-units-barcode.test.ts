// server/src/__tests__/stock-units-barcode.test.ts
import mongoose from 'mongoose';
import {
  ReceiveIncomingLotSchema,
  computeLotTotalQty,
  resolveReceivedLotQuantities,
} from '../../../shared/src/schemas/stock';
import { DrumModel, StockMovementModel, StockPackageModel } from '../models/stock.model';

describe('BL-024 & BL-028: Unit-Aware Lot Receipt & Barcode Schema Validation', () => {
  it('computes exact kg and piece totals without cross-unit conversion', () => {
    expect(computeLotTotalQty(20, 290, 'kg')).toBe(5800);
    expect(computeLotTotalQty(12, 250, 'piece')).toBe(3000);
    expect(computeLotTotalQty(4, 1000, 'l')).toBe(4000);
    expect(() => computeLotTotalQty(2, 1.5, 'piece')).toThrow(RangeError);
  });

  it('distributes total package mass across 72 packages exactly for tons and kg', () => {
    const tonnes = ReceiveIncomingLotSchema.parse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'RO',
      unit: 'kg',
      packageType: 'DRUM',
      packageCount: 72,
      massInputUnit: 'ton',
      totalInputWeight: 20.52,
      unitPriceEurPerKg: 3.8,
      reason: 'Receive honey with total tonnage',
    });

    expect(tonnes.unitWeightKg).toBe(285);
    expect(tonnes.totalNetKg).toBe(20520);
    expect(tonnes.totalCostValueEur).toBe(77976);
    expect(tonnes.perPackageQuantities).toHaveLength(72);
    expect(tonnes.perPackageQuantities.reduce((sum, kg) => sum + kg, 0)).toBe(20520);

    const arbitraryKg = resolveReceivedLotQuantities({
      unit: 'kg',
      packageCount: 72,
      massInputUnit: 'kg',
      totalInputWeight: 20500,
      unitPriceEurPerKg: 3.8,
    });
    expect(arbitraryKg.unitWeightKg).toBe(284.722);
    expect(
      Number(arbitraryKg.perPackageQtys.reduce((sum, kg) => sum + kg, 0).toFixed(3))
    ).toBe(20500);

    const arbitraryKgSchema = ReceiveIncomingLotSchema.parse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'RO',
      unit: 'kg',
      packageType: 'BUCKET_TRAY',
      packageCount: 72,
      massInputUnit: 'kg',
      totalInputWeight: 20500,
      unitPriceEurPerKg: 3.8,
      reason: 'Receive honey with arbitrary total kg',
    });
    expect(arbitraryKgSchema.packageType).toBe('BUCKET_TRAY');
    expect(arbitraryKgSchema.unitWeightKg).toBe(284.722);
    expect(
      Number(arbitraryKgSchema.perPackageQuantities.reduce((sum, kg) => sum + kg, 0).toFixed(3))
    ).toBe(20500);
  });

  it('rejects total-ton mass for non-kg materials', () => {
    const parsed = ReceiveIncomingLotSchema.safeParse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'DE',
      unit: 'l',
      packageType: 'IBC',
      packageCount: 2,
      massInputUnit: 'ton',
      totalInputWeight: 2,
      quantityPerPackage: 1000,
      reason: 'Receive non-kg material',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts a unit-aware non-drum receipt without kg conversion', () => {
    const parsed = ReceiveIncomingLotSchema.safeParse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'DE',
      unit: 'l',
      packageType: 'IBC',
      packageCount: 2,
      quantityPerPackage: 1000,
      reason: 'Receiving liquid flavour IBC',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unit).toBe('l');
      expect(parsed.data.quantityPerPackage).toBe(1000);
      expect(parsed.data.netKgPerPackage).toBeUndefined();
    }
  });

  it('accepts whole-piece receipts and rejects kg-only legacy weights for piece stock', () => {
    const pieceReceipt = ReceiveIncomingLotSchema.safeParse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'DE',
      unit: 'piece',
      packageType: 'CARTON',
      packageCount: 12,
      quantityPerPackage: 250,
      reason: 'Receiving glass jar cartons',
    });
    expect(pieceReceipt.success).toBe(true);

    const legacyWeightReceipt = ReceiveIncomingLotSchema.safeParse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'DE',
      unit: 'piece',
      packageType: 'CARTON',
      drumsCount: 10,
      nominalDrumNetKg: 12.5,
      defaultTareKg: 0,
      reason: 'Receiving glass jar cartons',
    });
    expect(legacyWeightReceipt.success).toBe(false);
  });

  it('stores generic package quantities separately from kg and keeps legacy kg packages compatible', async () => {
    const incomingLotId = new mongoose.Types.ObjectId();
    const materialId = new mongoose.Types.ObjectId();
    const piecePackage = new StockPackageModel({
      packageCode: 'IL-26-CARTON-0001',
      packageType: 'CARTON',
      incomingLotId,
      packageNo: 1,
      materialId,
      country: 'DE',
      unit: 'piece',
      quantity: 24,
      netKg: 0,
      tareKg: 0,
      status: 'Quarantine',
      location: 'QuarantineZone',
      originComposition: [],
    });

    await expect(piecePackage.validate()).resolves.toBeUndefined();
    expect(piecePackage.netKg).toBe(0);
    expect(piecePackage.quantity).toBe(24);

    const legacyKgPackage = new StockPackageModel({
      packageCode: 'IL-26-IBC-0001',
      packageType: 'IBC',
      incomingLotId,
      packageNo: 2,
      materialId,
      country: 'DE',
      netKg: 1000,
      tareKg: 20,
      status: 'Quarantine',
      location: 'QuarantineZone',
      originComposition: [],
    });

    await expect(legacyKgPackage.validate()).resolves.toBeUndefined();
    expect(legacyKgPackage.unit).toBe('kg');
    expect(legacyKgPackage.quantity).toBe(1000);

    const movement = new StockMovementModel({
      movementType: 'RECEIVE_QUARANTINE',
      stockPackageId: piecePackage._id,
      materialId,
      country: 'DE',
      signedKg: 0,
      signedQuantity: 24,
      quantityUnit: 'piece',
      reason: 'Receive carton of glass jars',
      performedBy: new mongoose.Types.ObjectId(),
    });
    await expect(movement.validate()).resolves.toBeUndefined();
  });

  it('preserves origin pricing fields and existing package references', async () => {
    const incomingLotId = new mongoose.Types.ObjectId();
    const sourcePackageId = new mongoose.Types.ObjectId();
    const packageRecord = new StockPackageModel({
      packageCode: 'IL-26-DRUM-ORIGIN-0001',
      packageType: 'DRUM',
      incomingLotId,
      packageNo: 1,
      materialId: new mongoose.Types.ObjectId(),
      country: 'DE',
      netKg: 20,
      tareKg: 1,
      originComposition: [{
        country: 'DE',
        incomingLotId,
        sourcePackageId,
        kg: 20,
        pct: 100,
        unitPriceEurPerKg: 2,
        valueEur: 40,
        costValueEur: 40,
        costSharePct: 100,
      }],
    });

    await expect(packageRecord.validate()).resolves.toBeUndefined();
    expect(packageRecord.originComposition[0].sourcePackageId?.toString()).toBe(
      sourcePackageId.toString()
    );
    expect(packageRecord.originComposition[0].valueEur).toBe(40);
    expect(packageRecord.originComposition[0].costValueEur).toBe(40);
    expect(packageRecord.originComposition[0].costSharePct).toBe(100);

    const sourceBatchId = new mongoose.Types.ObjectId();
    const drum = new DrumModel({
      drumCode: 'DR-26-ORIGIN-0001',
      drumNo: 1,
      materialId: new mongoose.Types.ObjectId(),
      country: 'DE',
      grossKg: 21,
      tareKg: 1,
      netKg: 20,
      status: 'Quarantine',
      location: 'QuarantineZone',
      originComposition: [{
        country: 'DE',
        incomingLotId,
        sourcePackageId,
        kg: 20,
        pct: 100,
        unitPriceEurPerKg: 2,
        valueEur: 40,
        costValueEur: 40,
        costSharePct: 100,
        isRework: true,
        sourceBatchId,
      }],
    });

    await expect(drum.validate()).resolves.toBeUndefined();
    expect(drum.originComposition?.[0].costValueEur).toBe(40);
    expect(drum.originComposition?.[0].costSharePct).toBe(100);
    expect(drum.toObject().originComposition).toEqual(
      expect.arrayContaining([expect.objectContaining({ isRework: true, sourceBatchId })])
    );
  });

  it('rejects fractional package quantities when unit is piece', () => {
    const parsed = ReceiveIncomingLotSchema.safeParse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'DE',
      unit: 'piece',
      packageType: 'CARTON',
      packageCount: 10,
      quantityPerPackage: 12.5,
      supplierLotBarcode: 'BC-DE-JAR-2026-001',
      reason: 'Receiving glass jars carton lot',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects positive kg tare weight on non-kg materials', () => {
    const parsed = ReceiveIncomingLotSchema.safeParse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'RO',
      unit: 'l',
      packageType: 'IBC',
      packageCount: 2,
      quantityPerPackage: 1000,
      tareKgPerPackage: 17.5,
      reason: 'Receiving liquid flavour IBC',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts valid supplierLotBarcode and OCR labelMetadata payload', () => {
    const parsed = ReceiveIncomingLotSchema.safeParse({
      supplierId: '671f00000000000000000001',
      materialId: '671f00000000000000000002',
      country: 'RO',
      unit: 'kg',
      packageType: 'DRUM',
      packageCount: 10,
      quantityPerPackage: 290,
      unitPriceEurPerKg: 0,
      tareKgPerPackage: 17.5,
      supplierLotBarcode: 'bc-ro-2026-lot99',
      labelMetadata: {
        extractedSupplier: 'Apicola Danubius SRL',
        extractedOrigin: 'RO',
        confidencePct: 94.5,
      },
      reason: 'Verified OCR label intake',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.supplierLotBarcode).toBe('BC-RO-2026-LOT99');
    }
  });
});