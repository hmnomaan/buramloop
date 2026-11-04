import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  AuditLogModel,
  BatchModel,
  CustomerModel,
  DrumModel,
  ExportLogModel,
  FillLineModel,
  IncomingLotModel,
  LabReportModel,
  MaterialModel,
  ReworkStockModel,
  StockPackageModel,
  SupplierModel,
  TankModel,
  syncAllModelIndexes,
} from '../models';
import { StockService } from '../modules/stock/stock.service';
import { BatchService } from '../modules/batch/batch.service';
import { ProcessService } from '../modules/process/process.service';
import { ShipmentService } from '../modules/shipment/shipment.service';
import { CostService } from '../modules/cost/cost.service';
import { TraceService } from '../modules/trace/trace.service';
import { ExportService } from '../modules/export/export.service';
import { ReceiveIncomingLotSchema } from '../../../shared/src/schemas/stock';
import { CreateShipmentLotSchema } from '../../../shared/src/schemas/outbound';

jest.mock('../storage', () => ({
  getStorageProvider: jest.fn(() => ({
    providerName: 'local',
    putObject: jest.fn(
      async (path: string, buffer: Buffer, _mimeType: string, sha256: string) => ({
        provider: 'local',
        path,
        sizeBytes: buffer.length,
        sha256,
      })
    ),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  })),
}));

let replicaSet: MongoMemoryReplSet;

const actorId = new Types.ObjectId().toHexString();
const auditReason = 'Replica-set workflow integration test';

async function recordStage(
  batchId: string,
  stage: 'WARMING' | 'FILTERING' | 'BLENDING' | 'FILLING',
  sevenStageTarget:
    | 'WARMING_IN'
    | 'WARMING_OUT'
    | 'FILTERING'
    | 'BLENDING'
    | 'RESTING_TANK'
    | 'FILLING'
    | 'COMPLETED',
  inKg: number,
  outKg: number,
  lossKg = 0,
  reworkOutKg = 0,
  options: { tankCode?: string; fillLineCode?: 'QUIEL_PET' } = {}
) {
  return ProcessService.executeStage(
    {
      batchId,
      stage,
      sevenStageTarget,
      inKg,
      outKg,
      lossKg,
      reworkOutKg,
      tempC: 41.5,
      personInChargeName: 'Integration Test Operator',
      ...options,
    },
    actorId,
    'Admin',
    auditReason
  );
}

function expectCommercialDataMasked(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectCommercialDataMasked);
    return;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const record = value as Record<string, unknown>;
    for (const field of [
      'unitPriceEurPerKg',
      'totalCostValueEur',
      'costValueEur',
      'costSharePct',
      'totalValueEur',
      'valueEur',
      'weightedAvgEurPerKg',
    ]) {
      expect(record).not.toHaveProperty(field);
    }
    Object.values(record).forEach(expectCommercialDataMasked);
  }
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(replicaSet.getUri());
  await syncAllModelIndexes();
}, 120_000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (replicaSet) await replicaSet.stop();
});

describe('BL-039 replica-set traceability transaction workflow', () => {
  it(
    'receives, QA-approves, re-blends rework, ships, costs, and enforces trace price masking',
    async () => {
      const [supplierRo, supplierMx, honey, customer] = await Promise.all([
        SupplierModel.create({
          code: 'SUP-RO-72',
          name: 'Danubius Apicola RO',
          country: 'RO',
          isActive: true,
        }),
        SupplierModel.create({
          code: 'SUP-MX-IBC',
          name: 'Yucatan Miel MX',
          country: 'MX',
          isActive: true,
        }),
        MaterialModel.create({
          code: 'MAT-HONEY-INT',
          name: 'Blossom Honey',
          kind: 'HONEY',
          category: 'Honey',
          unit: 'kg',
          isActive: true,
        }),
        CustomerModel.create({
          code: 'CUST-DE-RO-MX',
          name: 'German Retail Customer',
          country: 'DE',
          allowedCountries: ['RO', 'MX'],
          blockedCountries: [],
          isActive: true,
          createdBy: new Types.ObjectId(actorId),
        }),
      ]);

      await Promise.all([
        TankModel.create({
          code: 'TANK-INT',
          name: 'Integration Resting Tank',
          capacityKg: 2000,
          isActive: true,
        }),
        FillLineModel.create({
          code: 'QUIEL_PET',
          name: 'Integration PET Fill Line',
          isActive: true,
        }),
      ]);

      const roReceipt = await StockService.receiveIncomingLot(
        ReceiveIncomingLotSchema.parse({
          supplierId: supplierRo._id.toHexString(),
          materialId: honey._id.toHexString(),
          country: 'RO',
          unit: 'kg',
          packageType: 'DRUM',
          packageCount: 72,
          massInputUnit: 'ton',
          totalInputWeight: 20.52,
          tareKgPerPackage: 17.5,
          unitPriceEurPerKg: 4,
          reason: 'Receive 72 RO drums with exact 20.52 tonne gross net input.',
        }),
        { userId: actorId, roleName: 'Admin' }
      );
      expect(roReceipt.packageCount).toBe(72);
      expect(roReceipt.totalNetKg).toBe(20_520);
      expect(roReceipt.lot.unitWeightKg).toBe(285);

      await StockService.reviewIncomingLot(
        {
          incomingLotId: String(roReceipt.lot._id),
          decision: 'PASSED',
          labReport: { reportNo: 'QSI-RO-INT-001' },
          reason: 'QSI pass for RO receipt integration test.',
        },
        { userId: actorId, roleName: 'QA' }
      );

      const releasedRoLot = await IncomingLotModel.findById(roReceipt.lot._id).lean();
      const releasedRoDrums = await DrumModel.find({
        incomingLotId: roReceipt.lot._id,
      }).lean();
      const savedRoReport = await LabReportModel.findOne({
        incomingLotId: roReceipt.lot._id,
        reportNo: 'QSI-RO-INT-001',
      }).lean();
      expect(releasedRoLot?.status).toBe('PASSED');
      expect(savedRoReport).toBeTruthy();
      expect(releasedRoDrums).toHaveLength(72);
      expect(releasedRoDrums.every(
        (drum) => drum.status === 'Approved' && drum.location === 'Warehouse'
      )).toBe(true);

      const feasibility = await BatchService.simulateFeasibility(
        customer._id.toHexString(),
        570,
        honey._id.toHexString()
      );
      expect(feasibility.canFulfill).toBe(true);
      expect(feasibility.drumsToUse).toHaveLength(2);

      const batch1 = await BatchService.approveAndReserveBatch(
        {
          customerId: customer._id.toHexString(),
          materialId: honey._id.toHexString(),
          plannedKg: 570,
        },
        actorId,
        'Admin',
        auditReason
      );
      expect(batch1.approvedKg).toBe(570);
      await recordStage(String(batch1._id), 'WARMING', 'WARMING_IN', 570, 570);
      await recordStage(String(batch1._id), 'WARMING', 'WARMING_OUT', 570, 570);
      const filteringResult = await recordStage(
        String(batch1._id),
        'FILTERING',
        'FILTERING',
        570,
        360,
        10,
        200
      );
      expect(filteringResult.reworkStock).toBeTruthy();
      expect(filteringResult.reworkStock?.remainingKg).toBe(200);

      const mxReceipt = await StockService.receiveIncomingLot(
        ReceiveIncomingLotSchema.parse({
          supplierId: supplierMx._id.toHexString(),
          materialId: honey._id.toHexString(),
          country: 'MX',
          unit: 'kg',
          packageType: 'IBC',
          packageCount: 2,
          massInputUnit: 'kg',
          totalInputWeight: 800,
          tareKgPerPackage: 45,
          unitPriceEurPerKg: 3,
          reason: 'Receive 800 kg MX honey in two IBCs.',
        }),
        { userId: actorId, roleName: 'Admin' }
      );
      await StockService.reviewIncomingLot(
        {
          incomingLotId: String(mxReceipt.lot._id),
          decision: 'PASSED',
          labReport: { reportNo: 'QSI-MX-INT-001' },
          reason: 'QSI pass for MX receipt integration test.',
        },
        { userId: actorId, roleName: 'QA' }
      );
      await DrumModel.updateMany(
        { incomingLotId: roReceipt.lot._id, status: 'Approved' },
        { $set: { status: 'Consumed', location: 'Consumed' } }
      );
      const receivedMxPackages = await StockPackageModel.find({
        incomingLotId: mxReceipt.lot._id,
      }).lean();
      expect(mxReceipt.totalNetKg).toBe(800);
      expect(receivedMxPackages.map((stockPackage) => stockPackage.netKg)).toEqual([400, 400]);
      const batch2 = await BatchService.approveAndReserveBatch(
        {
          customerId: customer._id.toHexString(),
          materialId: honey._id.toHexString(),
          plannedKg: 1000,
          includeReworkIds: [String(filteringResult.reworkStock?._id)],
        },
        actorId,
        'Admin',
        auditReason
      );
      expect(batch2.approvedKg).toBe(1000);
      const roSlices = batch2.originComposition.filter((slice) => slice.country === 'RO');
      const mxSlices = batch2.originComposition.filter((slice) => slice.country === 'MX');
      expect(roSlices.reduce((sum, slice) => sum + slice.pct, 0)).toBe(20);
      expect(roSlices.reduce((sum, slice) => sum + (slice.costSharePct ?? 0), 0)).toBe(25);
      expect(mxSlices.reduce((sum, slice) => sum + slice.pct, 0)).toBe(80);
      expect(mxSlices.reduce((sum, slice) => sum + (slice.costSharePct ?? 0), 0)).toBe(75);

      await recordStage(String(batch2._id), 'WARMING', 'WARMING_IN', 1000, 1000);
      await recordStage(String(batch2._id), 'WARMING', 'WARMING_OUT', 1000, 1000);
      await recordStage(String(batch2._id), 'FILTERING', 'FILTERING', 1000, 990, 10);
      await recordStage(String(batch2._id), 'BLENDING', 'BLENDING', 990, 990);
      await recordStage(String(batch2._id), 'BLENDING', 'RESTING_TANK', 990, 990, 0, 0, {
        tankCode: 'TANK-INT',
      });
      await recordStage(String(batch2._id), 'FILLING', 'FILLING', 990, 990, 0, 0, {
        fillLineCode: 'QUIEL_PET',
      });
      await recordStage(String(batch2._id), 'FILLING', 'COMPLETED', 990, 990, 0, 0, {
        fillLineCode: 'QUIEL_PET',
      });

      const completedBatch = await BatchModel.findById(batch2._id).lean();
      expect(completedBatch?.status).toBe('DONE');
      expect(completedBatch?.actualOutKg).toBe(990);

      const shipmentInput = CreateShipmentLotSchema.parse({
        batchId: String(batch2._id),
        processNo: batch2.processNo,
        customerId: customer._id.toHexString(),
        destinationCountry: 'DE',
        orderedKg: 500,
        shippedKg: 0,
        items: [
          {
            skuCode: 'HONEY-PET-1KG',
            productName: 'Honey 1kg PET',
            packagingType: 'PET_SQUEEZE',
            fillLine: 'QUIEL_PET',
            unitWeightGrams: 1000,
            unitsCount: 500,
            netKg: 500,
            palletsCount: 10,
          },
        ],
        bestBeforeDate: '2027-11-02',
        reason: 'Create shipment for integration test batch.',
      });
      const createdShipment = await ShipmentService.createShipmentLot(
        shipmentInput,
        actorId,
        'Admin',
        auditReason
      );
      await ShipmentService.transitionStatus(
        String(createdShipment.shipmentLot._id),
        'RELEASED',
        actorId,
        'Admin',
        auditReason
      );
      const shippedLot = await ShipmentService.transitionStatus(
        String(createdShipment.shipmentLot._id),
        'SHIPPED',
        actorId,
        'Admin',
        auditReason
      );
      expect(shippedLot.shippedKg).toBe(500);

      const costReport = await CostService.generateCostReport(
        {
          batchId: String(batch2._id),
          sellingPricePerKgEur: 4.45,
          processingOverheadEur: 100,
          packagingCostEur: 50,
          managementRecipients: [],
        },
        actorId,
        'Admin',
        auditReason
      );
      expect(costReport.breakdownLines).toHaveLength(4);
      expect(
        costReport.breakdownLines.filter((line) => line.inputKind === 'REWORK')
      ).toHaveLength(2);
      expect(
        costReport.breakdownLines.filter((line) => line.inputKind === 'HONEY_DRUM')
      ).toHaveLength(2);

      const adminTrace = await TraceService.traceByReference(
        batch2.processNo,
        'Admin'
      );
      expect(adminTrace.production.batches).toHaveLength(2);
      expect(adminTrace.production.processSteps.length).toBeGreaterThan(0);
      expect(adminTrace.production.reworkStocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reworkNo: filteringResult.reworkStock?.reworkNo }),
        ])
      );
      expect(adminTrace.downstream.shipmentLots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ shipmentLotNo: createdShipment.shipmentLot.shipmentLotNo }),
        ])
      );
      expect(adminTrace.production.batches[0].originComposition[0]).toHaveProperty(
        'unitPriceEurPerKg'
      );
      expect(adminTrace.downstream.customers[0].name).toBe(customer.name);

      const managementTrace = await TraceService.traceByReference(
        batch2.processNo,
        'Management'
      );
      expect(managementTrace.pricesVisible).toBe(true);
      expect(
        managementTrace.production.batches[0].originComposition[0]
      ).toHaveProperty('unitPriceEurPerKg');

      const inspectorTrace = await TraceService.traceByReference(
        batch2.processNo,
        'Inspector'
      );
      expectCommercialDataMasked(inspectorTrace);
      expect(inspectorTrace.production.batches[0].originComposition[0]).toHaveProperty('pct');
      expect(inspectorTrace.production.batches[0].originComposition[0]).toHaveProperty('kg');
      expect(inspectorTrace.downstream.customers[0].name).toContain(
        'INSPECTOR-REDACTED'
      );
      expect(inspectorTrace.upstream.incomingLots[0].sourceNameSnapshot).toContain(
        'SUPPLIER-'
      );
      expect(JSON.stringify(inspectorTrace)).not.toContain(supplierRo.name);
      expect(JSON.stringify(inspectorTrace)).not.toContain(customer.name);

      const exportResult = await ExportService.runSnapshotExport({
        dataset: 'BATCHES_PROCESS',
        format: 'CSV',
        saveToNextcloud: false,
        actorId,
        actorRole: 'Admin',
      });
      expect(exportResult.rowCount).toBeGreaterThan(0);
      const exportLogs = await ExportService.listExportLogs();
      expect(exportLogs[0]).toMatchObject({
        module: 'BATCHES_PROCESS',
        format: 'CSV',
      });
      await expect(
        ExportLogModel.findByIdAndDelete(exportLogs[0]._id)
      ).rejects.toThrow('Export logs cannot be deleted.');
      await expect(
        ExportLogModel.findByIdAndUpdate(exportLogs[0]._id, {
          $set: { fileName: 'tampered.csv' },
        })
      ).rejects.toThrow('Export logs cannot be modified.');
      const batchAuditLog = await AuditLogModel.findOne({
        entityRef: batch2.processNo,
      }).lean();
      expect(batchAuditLog).toBeTruthy();
      await expect(
        AuditLogModel.findByIdAndUpdate(batchAuditLog?._id, {
          $set: { reason: 'tampered' },
        })
      ).rejects.toThrow('Audit logs cannot be modified.');

      const mxPackages = await StockPackageModel.countDocuments({
        incomingLotId: mxReceipt.lot._id,
      });
      expect(mxPackages).toBe(2);
      expect(costReport.processNo).toBe(batch2.processNo);
    },
    120_000
  );
});
