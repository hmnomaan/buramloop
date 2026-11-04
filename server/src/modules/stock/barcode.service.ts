// server/src/modules/stock/barcode.service.ts
import { Types } from 'mongoose';
import {
  BatchModel,
  DrumModel,
  IncomingLotModel,
  ReworkStockModel,
  StockPackageModel,
  ShipmentLotModel,
} from '../../models';
import { AppError } from '../../common/errors';

export interface BarcodeResolutionResult {
  scannedCode: string;
  entityKind: 'DRUM' | 'PACKAGE' | 'REWORK_STOCK' | 'INCOMING_LOT' | 'BATCH' | 'SHIPMENT_LOT';
  entityId: Types.ObjectId;
  code: string;
  status: string;
  country?: string;
  netKg?: number;
  quantity?: number;
  unit?: string;
  location?: string;
  warnings: string[];
  payload: Record<string, unknown>;
}

export class BarcodeService {
  /**
   * Resolves a scanned 1D/2D barcode across Drums, ReworkStocks, IncomingLots, Batches, and ShipmentLots.
   * Flags duplicate-receive or quarantine status warnings immediately for shop-floor scanners [R15].
   */
  static async resolveBarcode(
    rawBarcode: string,
    expectedCountry?: string
  ): Promise<BarcodeResolutionResult> {
    const cleanCode = rawBarcode.trim().toUpperCase();
    if (!cleanCode) {
      throw AppError.badRequest('EMPTY_BARCODE', 'Scanned barcode cannot be empty.');
    }

    const warnings: string[] = [];

    // 1. Check Drum (by barcode or drumCode)
    const drum = await DrumModel.findOne({
      $or: [{ barcode: cleanCode }, { drumCode: cleanCode }],
    }).lean();

    if (drum) {
      if (drum.status === 'Consumed') {
        warnings.push(`DUPLICATE_SCAN: Drum ${drum.drumCode} is already Consumed.`);
      }
      if (drum.status === 'Quarantine') {
        warnings.push(`LAB_GATE_BLOCKED: Drum ${drum.drumCode} is still in Quarantine awaiting QA release.`);
      }
      if (expectedCountry && drum.country !== expectedCountry.toUpperCase()) {
        warnings.push(
          `COUNTRY_MISMATCH_ALERT: Drum origin (${drum.country}) does not match expected country (${expectedCountry.toUpperCase()}).`
        );
      }

      return {
        scannedCode: cleanCode,
        entityKind: 'DRUM',
        entityId: drum._id,
        code: drum.drumCode,
        status: drum.status,
        country: drum.country,
        netKg: drum.netKg,
        location: drum.location,
        warnings,
        payload: drum as unknown as Record<string, unknown>,
      };
    }

    // 2. Check non-drum stock packages by generated package code
    const stockPackage = await StockPackageModel.findOne({
      packageCode: cleanCode,
    }).lean();
    if (stockPackage) {
      if (stockPackage.status === 'Consumed') {
        warnings.push(`DUPLICATE_SCAN: Package ${stockPackage.packageCode} is already Consumed.`);
      }
      if (stockPackage.status === 'Quarantine') {
        warnings.push(`LAB_GATE_BLOCKED: Package ${stockPackage.packageCode} is awaiting QA release.`);
      }
      if (expectedCountry && stockPackage.country !== expectedCountry.toUpperCase()) {
        warnings.push(
          `COUNTRY_MISMATCH_ALERT: Package origin (${stockPackage.country}) does not match expected country (${expectedCountry.toUpperCase()}).`
        );
      }

      return {
        scannedCode: cleanCode,
        entityKind: 'PACKAGE',
        entityId: stockPackage._id,
        code: stockPackage.packageCode,
        status: stockPackage.status,
        country: stockPackage.country,
        netKg: stockPackage.netKg,
        quantity: stockPackage.quantity,
        unit: stockPackage.unit,
        location: stockPackage.location,
        warnings,
        payload: stockPackage as unknown as Record<string, unknown>,
      };
    }

    // 3. Check ReworkStock
    const rework = await ReworkStockModel.findOne({
      reworkNo: cleanCode,
      isVoid: false,
    }).lean();

    if (rework) {
      return {
        scannedCode: cleanCode,
        entityKind: 'REWORK_STOCK',
        entityId: rework._id,
        code: rework.reworkNo,
        status: rework.status,
        country: rework.origin.map((o) => o.country).join('/'),
        netKg: rework.remainingKg,
        location: 'Warehouse',
        warnings,
        payload: rework as unknown as Record<string, unknown>,
      };
    }

    // 4. Check IncomingLot
    const lot = await IncomingLotModel.findOne({ lotNo: cleanCode }).lean();
    if (lot) {
      return {
        scannedCode: cleanCode,
        entityKind: 'INCOMING_LOT',
        entityId: lot._id,
        code: lot.lotNo,
        status: lot.status,
        country: lot.country,
        netKg: lot.totalNetKg,
        quantity: lot.totalQuantity ?? lot.totalNetKg,
        unit: lot.unit ?? 'kg',
        warnings,
        payload: lot as unknown as Record<string, unknown>,
      };
    }

    // 5. Check Batch
    const batch = await BatchModel.findOne({
      processNo: cleanCode,
      isVoid: false,
    }).lean();
    if (batch) {
      return {
        scannedCode: cleanCode,
        entityKind: 'BATCH',
        entityId: batch._id,
        code: batch.processNo,
        status: batch.status,
        country: batch.originComposition.map((o) => o.country).join('/'),
        netKg: batch.approvedKg,
        warnings,
        payload: batch as unknown as Record<string, unknown>,
      };
    }

    // 6. Check ShipmentLot
    const shipmentLot = await ShipmentLotModel.findOne({
      shipmentLotNo: cleanCode,
      isVoid: false,
    }).lean();
    if (shipmentLot) {
      return {
        scannedCode: cleanCode,
        entityKind: 'SHIPMENT_LOT',
        entityId: shipmentLot._id,
        code: shipmentLot.shipmentLotNo,
        status: shipmentLot.status,
        country: shipmentLot.destinationCountry,
        netKg: shipmentLot.shippedKg,
        warnings,
        payload: shipmentLot as unknown as Record<string, unknown>,
      };
    }

    throw AppError.notFound('Barcode entity', cleanCode);
  }

  /**
   * Generates a deterministic Zebra ZPL II thermal label (100x150mm) for a 290kg Drum [R4, R15]
   */
  static async generateDrumZplLabel(drumId: string): Promise<{ drumCode: string; zpl: string }> {
    const drum = await DrumModel.findById(drumId).lean();
    if (!drum) {
      throw AppError.notFound('Drum', drumId);
    }

    const barcodeValue = drum.barcode || drum.drumCode;
    const zpl = [
      '^XA',
      '^PW800',
      '^LL1200',
      '^FO50,50^A0N,45,45^FDBURAM HENNIGSDORF - BURAMLOOP ERP^FS',
      '^FO50,110^GB700,4,4^FS',
      `^FO50,140^A0N,55,55^FDDRUM: ${drum.drumCode}^FS`,
      `^FO50,220^A0N,38,38^FDLOT NO: ${drum.lotNoSnapshot}^FS`,
      `^FO50,280^A0N,38,38^FDORIGIN COUNTRY: ${drum.country}^FS`,
      `^FO50,340^A0N,45,45^FDNET WEIGHT: ${drum.netKg.toFixed(1)} KG (TARE: ${drum.tareKg.toFixed(1)} KG)^FS`,
      `^FO50,410^A0N,38,38^FDQA STATUS: ${drum.status} | LOC: ${drum.location}^FS`,
      '^FO50,480^GB700,4,4^FS',
      `^FO100,540^BY3^BCN,180,Y,N,N^FD${barcodeValue}^FS`,
      `^FO500,800^BQN,2,8^FDQA,${barcodeValue}|${drum.country}|${drum.netKg}KG^FS`,
      '^XZ',
    ].join('\n');

    return { drumCode: drum.drumCode, zpl };
  }
}