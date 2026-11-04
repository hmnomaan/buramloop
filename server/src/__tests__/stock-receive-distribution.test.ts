import mongoose from 'mongoose';
import {
  ContractModel,
  DrumModel,
  IncomingLotModel,
  MaterialModel,
  StockMovementModel,
  StockPackageModel,
  SourcingModel,
  SupplierModel,
} from '../models';
import { StockService } from '../modules/stock/stock.service';
import { ReceiveIncomingLotSchema } from '../../../shared/src/schemas/stock';

jest.mock('../config/db', () => ({
  withTransaction: jest.fn(async (callback: (session: object) => Promise<unknown>) =>
    callback({})
  ),
  withSnapshotRead: jest.fn(),
}));

jest.mock('../common/audit.helper', () => ({
  recordAudit: jest.fn().mockResolvedValue(undefined),
}));

function sessionQuery<T>(value: T) {
  return {
    session: jest.fn().mockResolvedValue(value),
  } as never;
}

describe('StockService exact package receipt distribution', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['DRUM', 'IBC', 'BUCKET_TRAY'])(
    'persists exact 20,500 kg distribution and 100%% priced origin slices for %s',
    async (packageType) => {
      const incomingLotId = new mongoose.Types.ObjectId();
      const supplierId = new mongoose.Types.ObjectId();
      const materialId = new mongoose.Types.ObjectId();
      const createdLot = {
        _id: incomingLotId,
        toObject: () => ({ _id: incomingLotId }),
      };

      jest.spyOn(SupplierModel, 'findById').mockReturnValue(
        sessionQuery({ _id: supplierId, name: 'Honey Supplier', code: 'SUP', isActive: true })
      );
      jest.spyOn(MaterialModel, 'findById').mockReturnValue(
        sessionQuery({
          _id: materialId,
          name: 'Honey',
          code: 'HONEY',
          unit: 'kg',
          isActive: true,
        })
      );
      jest.spyOn(IncomingLotModel, 'findOne').mockReturnValue(sessionQuery(null));
      jest.spyOn(IncomingLotModel, 'create').mockResolvedValue([createdLot] as never);
      let drumPayloads: Array<Record<string, unknown>> = [];
      const insertedDrums = jest.spyOn(DrumModel, 'insertMany').mockImplementation(
        async (documents: unknown) => {
          drumPayloads = (Array.isArray(documents) ? documents : [documents]) as Array<
            Record<string, unknown>
          >;
          return drumPayloads.map((document) => ({
            _id: new mongoose.Types.ObjectId(),
            netKg: Number(document.netKg),
          })) as never;
        }
      );
      let packagePayloads: Array<Record<string, unknown>> = [];
      const insertedPackages = jest
        .spyOn(StockPackageModel, 'insertMany')
        .mockImplementation(
          async (documents: unknown) => {
            packagePayloads = (Array.isArray(documents) ? documents : [documents]) as Array<
              Record<string, unknown>
            >;
            return packagePayloads.map((document) => ({
              _id: new mongoose.Types.ObjectId(),
              quantity: document.quantity,
              netKg: document.netKg,
            })) as never;
          }
        );
      jest.spyOn(StockMovementModel, 'insertMany').mockResolvedValue([] as never);

      const input = ReceiveIncomingLotSchema.parse({
        lotNo: `IL-26-${packageType}`,
        supplierId: supplierId.toHexString(),
        materialId: materialId.toHexString(),
        country: 'RO',
        unit: 'kg',
        packageType,
        packageCount: 72,
        massInputUnit: 'kg',
        totalInputWeight: 20500,
        unitPriceEurPerKg: 3.8,
        tareKgPerPackage: 18.5,
        reason: 'Receive arbitrary total package weight',
      });

      const result = await StockService.receiveIncomingLot(input, {
        userId: new mongoose.Types.ObjectId(),
        roleName: 'Admin',
      });

      expect(result.totalNetKg).toBe(20500);
      expect(result.packageCount).toBe(72);
      const lotPayload = (IncomingLotModel.create as jest.Mock).mock.calls[0][0][0];
      expect(lotPayload.unitWeightKg).toBe(284.722);
      expect(lotPayload.totalNetKg).toBe(20500);
      expect(lotPayload.totalCostValueEur).toBe(77900);

      const receivedUnits =
        packageType === 'DRUM' ? drumPayloads : packagePayloads;
      const unitWeights = receivedUnits.map((unit) =>
        Number(packageType === 'DRUM' ? unit.netKg : unit.quantity)
      );
      expect(unitWeights).toHaveLength(72);
      expect(Number(unitWeights.reduce((sum: number, kg: number) => sum + kg, 0).toFixed(3))).toBe(
        20500
      );
      const firstOrigin = (
        receivedUnits[0].originComposition as Array<Record<string, unknown>>
      )[0];
      expect(firstOrigin).toMatchObject({
        country: 'RO',
        incomingLotId,
        kg: expect.any(Number),
        pct: 100,
        unitPriceEurPerKg: 3.8,
        costValueEur: expect.any(Number),
        costSharePct: 100,
      });
      expect(insertedDrums).toHaveBeenCalledTimes(packageType === 'DRUM' ? 1 : 0);
      expect(insertedPackages).toHaveBeenCalledTimes(packageType === 'DRUM' ? 0 : 1);
    }
  );

  it('rejects source prices supplied by roles without price access', async () => {
    const input = ReceiveIncomingLotSchema.parse({
      supplierId: new mongoose.Types.ObjectId().toHexString(),
      materialId: new mongoose.Types.ObjectId().toHexString(),
      country: 'RO',
      unit: 'kg',
      packageType: 'DRUM',
      packageCount: 1,
      totalInputWeight: 290,
      unitPriceEurPerKg: 3.8,
      reason: 'Receive a priced package',
    });

    await expect(
      StockService.receiveIncomingLot(input, {
        userId: new mongoose.Types.ObjectId(),
        roleName: 'Warehouse',
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only Admin and Management may assign incoming stock prices.',
    });
  });

  it('inherits contract source price and increments its receipt balance', async () => {
    const incomingLotId = new mongoose.Types.ObjectId();
    const contractId = new mongoose.Types.ObjectId();
    const sourcingId = new mongoose.Types.ObjectId();
    const supplierId = new mongoose.Types.ObjectId();
    const materialId = new mongoose.Types.ObjectId();
    const contract = {
      _id: contractId,
      sourcingId,
      supplierId,
      materialId,
      country: 'RO',
      packageType: 'DRUM',
      unitPriceEurPerKg: 3.8,
      contractedKg: 290,
      contractedDrums: 1,
      receivedKg: 0,
      receivedPackages: 0,
      status: 'SHIPPED',
      isVoid: false,
    };

    jest.spyOn(ContractModel, 'findById').mockReturnValue(
      sessionQuery(contract)
    );
    jest.spyOn(ContractModel, 'updateOne').mockResolvedValue({
      matchedCount: 1,
    } as never);
    jest.spyOn(SourcingModel, 'findById').mockReturnValue(
      sessionQuery({ status: 'PASSED' })
    );
    jest.spyOn(SupplierModel, 'findById').mockReturnValue(
      sessionQuery({
        _id: supplierId,
        name: 'Honey Supplier',
        code: 'SUP',
        isActive: true,
      })
    );
    jest.spyOn(MaterialModel, 'findById').mockReturnValue(
      sessionQuery({
        _id: materialId,
        name: 'Honey',
        code: 'HONEY',
        unit: 'kg',
        isActive: true,
      })
    );
    jest.spyOn(IncomingLotModel, 'findOne').mockReturnValue(sessionQuery(null));
    jest.spyOn(IncomingLotModel, 'create').mockResolvedValue([
      {
        _id: incomingLotId,
        toObject: () => ({ _id: incomingLotId }),
      },
    ] as never);
    let drumDocuments: Array<Record<string, unknown>> = [];
    jest.spyOn(DrumModel, 'insertMany').mockImplementation(async (documents: unknown) => {
      drumDocuments = (Array.isArray(documents) ? documents : [documents]) as Array<
        Record<string, unknown>
      >;
      return drumDocuments.map((document) => ({
        _id: new mongoose.Types.ObjectId(),
        netKg: Number(document.netKg),
      })) as never;
    });
    jest.spyOn(StockMovementModel, 'insertMany').mockResolvedValue([] as never);

    const input = ReceiveIncomingLotSchema.parse({
      lotNo: 'IL-26-CONTRACT',
      supplierId: supplierId.toHexString(),
      materialId: materialId.toHexString(),
      contractId: contractId.toHexString(),
      sourcingId: sourcingId.toHexString(),
      country: 'RO',
      unit: 'kg',
      packageType: 'DRUM',
      packageCount: 1,
      totalInputWeight: 290,
      reason: 'Receive shipped contract balance',
    });

    await StockService.receiveIncomingLot(input, {
      userId: new mongoose.Types.ObjectId(),
      roleName: 'Warehouse',
    });

    const lotPayload = (IncomingLotModel.create as jest.Mock).mock.calls[0][0][0];
    expect(lotPayload).toMatchObject({
      contractId: contractId.toHexString(),
      sourcingId: sourcingId.toHexString(),
      unitPriceEurPerKg: 3.8,
      totalCostValueEur: 1102,
    });
    expect(drumDocuments[0]).toMatchObject({
      unitPriceEurPerKg: 3.8,
    });
    expect(ContractModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: contractId }),
      { $inc: { receivedKg: 290, receivedPackages: 1 } },
      expect.any(Object)
    );
  });
});
