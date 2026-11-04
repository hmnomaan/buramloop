import { Request } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  ContractModel,
  DrumModel,
  IncomingLotModel,
  MaterialModel,
  PriceModel,
  SourcingModel,
  StockMovementModel,
  SupplierModel,
  syncAllModelIndexes,
} from '../models';
import { AuthUserContext } from '../middlewares/auth.middleware';
import { sourcingService } from '../modules/sourcing/sourcing.service';
import { StockService } from '../modules/stock/stock.service';
import { ReceiveIncomingLotSchema } from '../../../shared/src/schemas/stock';

let replicaSet: MongoMemoryReplSet;

const actorIds = {
  admin: new Types.ObjectId(),
  management: new Types.ObjectId(),
  qa: new Types.ObjectId(),
  warehouse: new Types.ObjectId(),
};

function makeRequest(
  userId: Types.ObjectId,
  roleName: string,
  permissions: string[]
): Request {
  const user: AuthUserContext = {
    userId,
    email: `${roleName.toLowerCase()}@example.invalid`,
    fullName: `Test ${roleName}`,
    roleName,
    permissions,
    isAdmin: roleName === 'Admin',
    isInspector: false,
    mustChangePassword: false,
  };
  return {
    user,
    headers: {},
    ip: '127.0.0.1',
  } as Request;
}

const isoDate = () => new Date().toISOString();

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

describe('BL-041 sourcing-to-receipt replica-set workflow', () => {
  it(
    'normalizes an offer, passes the gates, ships a contract, and receives its balance in two priced lots',
    async () => {
      const adminReq = makeRequest(actorIds.admin, 'Admin', ['*:*']);
      const managementReq = makeRequest(actorIds.management, 'Management', [
        'management:approve',
      ]);
      const qaReq = makeRequest(actorIds.qa, 'QA', ['qa:approve']);

      const material = await MaterialModel.create({
        code: 'MAT-HON-RO-ACA',
        name: 'Romanian Acacia Raw Honey',
        kind: 'HONEY',
        category: 'Honey',
        unit: 'kg',
        packageType: 'DRUM',
        isActive: true,
      });

      const supplier = await sourcingService.createSupplierLead(adminReq, {
        code: 'SUP-RO-001',
        name: 'Danubius Honey Apiary Test SRL',
        country: 'RO',
        regionCity: 'Timisoara',
        contactPerson: 'Test Contact',
        email: 'supplier@example.invalid',
        honeyVarieties: ['Acacia Honey Raw'],
        certifications: [],
        typicalCapacityTonsPerYear: 500,
        leadStatus: 'LEAD',
        notes: 'Replica-set supplier lead',
        reason: 'Register a local Romanian supplier lead',
      });

      expect(supplier.code).toBe('SUP-RO-001');
      expect(supplier.leadStatus).toBe('LEAD');

      const offer = await sourcingService.createSourcing(adminReq, {
        supplierId: supplier._id.toHexString(),
        materialId: material._id.toHexString(),
        country: 'RO',
        packageType: 'DRUM',
        massInputUnit: 'ton',
        offeredInputWeight: 20.52,
        offeredDrums: 72,
        priceBasis: 'PER_TON',
        inputPriceEur: 3850,
        transportCostEur: 1026,
        offerRef: 'OFFER-DANUBIUS-2026-A',
        offerNotes: 'Replica-set sourcing offer',
        saveAsFutureLead: true,
        reason: 'Record a normalized Romanian honey offer',
      });

      expect(offer.offeredKg).toBe(20520);
      expect(offer.offeredDrums).toBe(72);
      expect(offer.offer).toMatchObject({
        unitWeightKg: 285,
        unitPriceEurPerKg: 3.85,
        transportEurPerKg: 0.05,
        landedUnitPriceEurPerKg: 3.9,
      });
      expect(offer.stage).toBe('EXTERNAL_ANALYSIS');
      expect(
        offer.gates.find((gate) => gate.gate === 'PRICE_OFFER')?.decision
      ).toBe('APPROVED');

      await sourcingService.evaluateGate(adminReq, offer._id.toHexString(), {
        gate: 'EXTERNAL_ANALYSIS',
        decision: 'APPROVED',
        externalAnalysis: {
          labName: 'External Test Lab',
          reportNo: 'LAB-RO-2026-001',
          reportDate: isoDate(),
          locationAcceptable: true,
          priceAcceptable: true,
          marketDemandFit: 'HIGH',
          transportCostEur: 1026,
          qualityAcceptable: true,
          parametersSummary: 'Honey quality assessment passed.',
          managementNotes: 'Approved for the sourcing test workflow.',
        },
        reason: 'Management approves commercial analysis',
      });

      expect((await SourcingModel.findById(offer._id).lean())?.stage).toBe(
        'SAMPLE'
      );

      await sourcingService.evaluateGate(
        makeRequest(actorIds.admin, 'Admin', ['sourcing:write']),
        offer._id.toHexString(),
        {
          gate: 'SAMPLE',
          decision: 'APPROVED',
          sample: {
            sampleCode: 'SMP-RO-DANUBIUS-01',
            routingMode: 'SENT_DIRECT_TO_QSI',
            qsiTrackingRef: 'QSI-TRACK-LOCAL-001',
            receivedAt: isoDate(),
            weightGrams: 500,
            notes: 'Sample sent directly to QSI.',
          },
          reason: 'Register sample sent direct to QSI',
        }
      );

      await sourcingService.evaluateGate(
        qaReq,
        offer._id.toHexString(),
        {
          gate: 'INHOUSE_QSI',
          decision: 'APPROVED',
          inhouseQsi: {
            inhouseSensoryPass: true,
            sensoryNotes: 'Sensory comparison passed.',
            qsiReportNo: 'QSI-RO-2026-001',
            qsiReportPublishedAt: isoDate(),
            qsiPass: true,
            moisturePct: 16.7,
            hmfMgKg: 8.5,
            c4SugarPass: true,
            nmrPass: true,
          },
          reason: 'QA verifies sensory and QSI match',
        }
      );

      const passedSourcing = await SourcingModel.findById(offer._id).lean();
      expect(passedSourcing).toMatchObject({ status: 'PASSED', stage: 'PASSED' });

      const contract = await sourcingService.createContractFromSourcing(
        adminReq,
        offer._id.toHexString(),
        {
          deliveryTerms: 'DAP Hennigsdorf',
          expectedArrivalDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          reason: 'Issue contract for passed sourcing offer',
        }
      );

      const expectedYear = String(new Date().getFullYear()).slice(-2);
      expect(contract.contractNo).toBe(`CT-${expectedYear}-0001`);
      expect(contract).toMatchObject({
        contractedKg: 20520,
        contractedDrums: 72,
        unitWeightKg: 285,
        unitPriceEurPerKg: 3.85,
        status: 'SIGNED',
      });
      expect(
        (await SupplierModel.findById(supplier._id).lean())?.leadStatus
      ).toBe('ACTIVE_PARTNER');
      expect(
        await PriceModel.findOne({ contractId: contract._id }).lean()
      ).toMatchObject({ unitPricePerKg: 3.85 });

      const shippedContract = await sourcingService.markContractShipped(
        adminReq,
        contract._id.toHexString(),
        {
          shippingRef: 'CMR-RO-DE-2026-001',
          shippedAt: isoDate(),
          reason: 'Mark contract shipped for receipt acceptance',
        }
      );
      expect(shippedContract.status).toBe('SHIPPED');

      const receivePartialLot = async (lotNo: string, barcode: string) => {
        const input = ReceiveIncomingLotSchema.parse({
          lotNo,
          sourcingId: offer._id.toHexString(),
          contractId: contract._id.toHexString(),
          supplierId: supplier._id.toHexString(),
          materialId: material._id.toHexString(),
          country: 'RO',
          unit: 'kg',
          packageType: 'DRUM',
          packageCount: 36,
          massInputUnit: 'kg',
          totalInputWeight: 10260,
          tareKgPerPackage: 17.5,
          supplierLotBarcode: barcode,
          reason: 'Receive a partial shipment against contract',
        });
        return StockService.receiveIncomingLot(input, {
          userId: actorIds.warehouse,
          roleName: 'Warehouse',
        });
      };

      const firstReceipt = await receivePartialLot(
        'IL-26-SRC-TRUCK-1',
        'SUP-LOT-RO-TRUCK1'
      );
      expect(firstReceipt.drumsCreated).toBe(36);
      expect(firstReceipt.lot).toMatchObject({
        drumsCount: 36,
        totalNetKg: 10260,
        unitPriceEurPerKg: 3.85,
        totalCostValueEur: 39501,
      });

      const firstReceiptDrums = await DrumModel.find({
        incomingLotId: firstReceipt.lot._id,
      }).lean();
      expect(firstReceiptDrums).toHaveLength(36);
      const firstOrigin = firstReceiptDrums[0]?.originComposition?.[0];
      expect(firstOrigin).toBeDefined();
      expect(firstOrigin).toMatchObject({
        country: 'RO',
        kg: 285,
        pct: 100,
        unitPriceEurPerKg: 3.85,
      });

      const firstReceiptMovements = await StockMovementModel.find({
        incomingLotId: firstReceipt.lot._id,
      }).lean();
      expect(firstReceiptMovements).toHaveLength(36);
      expect(
        firstReceiptMovements.reduce((sum, movement) => sum + movement.signedKg, 0)
      ).toBe(10260);

      const partialContract = await ContractModel.findById(contract._id).lean();
      expect(partialContract).toMatchObject({
        receivedKg: 10260,
        receivedPackages: 36,
      });

      const secondReceipt = await receivePartialLot(
        'IL-26-SRC-TRUCK-2',
        'SUP-LOT-RO-TRUCK2'
      );
      expect(secondReceipt.drumsCreated).toBe(36);
      expect(secondReceipt.lot).toMatchObject({
        drumsCount: 36,
        totalNetKg: 10260,
        unitPriceEurPerKg: 3.85,
      });

      const rejectOverReceipt = async (
        lotNo: string,
        packageCount: number,
        totalInputWeight: number
      ) => {
        const input = ReceiveIncomingLotSchema.parse({
          lotNo,
          contractId: contract._id.toHexString(),
          supplierId: supplier._id.toHexString(),
          materialId: material._id.toHexString(),
          country: 'RO',
          unit: 'kg',
          packageType: 'DRUM',
          packageCount,
          massInputUnit: 'kg',
          totalInputWeight,
          reason: 'Reject receipt beyond contracted balance',
        });
        await expect(
          StockService.receiveIncomingLot(input, {
            userId: actorIds.warehouse,
            roleName: 'Warehouse',
          })
        ).rejects.toMatchObject({
          statusCode: 409,
          code: 'CONTRACT_BALANCE_EXCEEDED',
        });
      };

      await rejectOverReceipt('IL-26-SRC-OVER-PACKAGES', 73, 20805);
      await rejectOverReceipt('IL-26-SRC-OVER-WEIGHT', 1, 20521);

      const completedContract = await ContractModel.findById(contract._id).lean();
      expect(completedContract).toMatchObject({
        receivedKg: 20520,
        receivedPackages: 72,
      });
      expect(
        await IncomingLotModel.countDocuments({ contractId: contract._id })
      ).toBe(2);
      expect(
        await StockMovementModel.countDocuments({
          incomingLotId: {
            $in: [firstReceipt.lot._id, secondReceipt.lot._id],
          },
        })
      ).toBe(72);
    },
    120_000
  );
});
