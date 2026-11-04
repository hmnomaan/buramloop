import mongoose from 'mongoose';
import { STOCK_MOVEMENT_TYPES } from '../../../shared/src/schemas/stock';
import * as dbModule from '../config/db';
import * as auditHelper from '../common/audit.helper';
import {
  BatchModel,
  CabinetModel,
  CounterModel,
  CustomerModel,
  DrumModel,
  FillLineModel,
  IncomingLotModel,
  MaterialModel,
  NotificationModel,
  PriceModel,
  ProcessStepModel,
  ReworkStockModel,
  StockMovementModel,
  StockPackageModel,
} from '../models';
import { BatchService } from '../modules/batch/batch.service';
import { ProcessService } from '../modules/process/process.service';
import { WarmRoomService } from '../modules/warm-room/warm-room.service';

function fakeQuery<T>(result: T) {
  const query = {
    session: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return query as never;
}

describe('BatchService origin-aware feasibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blends exact origins from variable-weight drums, a package, and selected rework', async () => {
    const customerId = new mongoose.Types.ObjectId();
    const materialId = new mongoose.Types.ObjectId();
    const reworkId = new mongoose.Types.ObjectId();
    const deLotId = new mongoose.Types.ObjectId();
    const roLotId = new mongoose.Types.ObjectId();
    const packageId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-11-02T09:00:00.000Z');

    jest.spyOn(CustomerModel, 'findById').mockReturnValue(
      fakeQuery({
        _id: customerId,
        isActive: true,
        allowedCountries: ['DE', 'RO'],
        blockedCountries: [],
      })
    );
    jest.spyOn(MaterialModel, 'findById').mockReturnValue(
      fakeQuery({
        _id: materialId,
        isActive: true,
        kind: 'HONEY',
        unit: 'kg',
        code: 'HONEY',
      })
    );
    jest.spyOn(ReworkStockModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: reworkId,
          reworkNo: 'RW-26-0001',
          materialId,
          status: 'AVAILABLE',
          remainingKg: 5,
          isVoid: false,
          origin: [
            {
              country: 'DE',
              incomingLotId: deLotId,
              kg: 3,
              pct: 60,
              unitPriceEurPerKg: 2,
            },
            {
              country: 'RO',
              incomingLotId: roLotId,
              kg: 2,
              pct: 40,
              unitPriceEurPerKg: 4,
            },
          ],
        },
      ])
    );
    jest.spyOn(DrumModel, 'find').mockReturnValue(
      fakeQuery(
        Array.from({ length: 71 }, (_, index) => {
          const drumId = new mongoose.Types.ObjectId();
          const incomingLotId = index % 2 === 0 ? deLotId : roLotId;
          const country = index % 2 === 0 ? 'DE' : 'RO';
          return {
            _id: drumId,
            drumCode: `DR-26-${String(index + 1).padStart(4, '0')}`,
            materialId,
            country,
            netKg: 10,
            status: 'Approved',
            location: 'Warehouse',
            createdAt: new Date(createdAt.getTime() + index),
            incomingLotId,
            unitPriceEurPerKg: 1.5,
            originComposition: [{
              country,
              incomingLotId,
              sourceDrumId: drumId,
              kg: 10,
              pct: 100,
              unitPriceEurPerKg: 1.5,
            }],
          };
        })
      )
    );
    jest.spyOn(StockPackageModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: packageId,
          packageCode: 'PK-26-0001',
          materialId,
          country: 'DE',
          netKg: 15,
          status: 'Approved',
          location: 'Warehouse',
          createdAt: new Date(createdAt.getTime() + 100),
          incomingLotId: deLotId,
          originComposition: [{
            country: 'DE',
            incomingLotId: deLotId,
            kg: 15,
            pct: 100,
            unitPriceEurPerKg: 2,
          }],
        },
      ])
    );
    jest.spyOn(IncomingLotModel, 'find').mockReturnValue(fakeQuery([]));
    jest.spyOn(PriceModel, 'find').mockReturnValue(fakeQuery([]));

    const result = await BatchService.simulateFeasibility(
      customerId.toHexString(),
      730,
      materialId.toHexString(),
      [reworkId.toHexString()]
    );

    expect(result.canFulfill).toBe(true);
    expect(result.accumulatedKg).toBe(730);
    expect(result.drumsToUse).toHaveLength(72);
    expect(result.reworkToUse).toHaveLength(1);
    expect(result.reworkToUse[0].kgToConsume).toBe(5);
    expect(result.drumsToUse.some((unit) => unit.unitId.equals(packageId))).toBe(true);
    expect(result.originComposition.reduce((sum, slice) => sum + slice.kg, 0)).toBe(730);
    expect(
      result.originComposition.reduce((sum, slice) => sum + slice.pct, 0)
    ).toBeCloseTo(100, 8);
    expect(
      result.originComposition.reduce((sum, slice) => sum + slice.costSharePct, 0)
    ).toBeCloseTo(100, 8);
    expect(result.totalCostValueEur).toBe(1109);
    expect(result.originComposition.some((slice) => slice.sourcePackageId?.equals(packageId))).toBe(
      true
    );
  });

  it('rejects selected rework containing a country outside the customer policy', async () => {
    const customerId = new mongoose.Types.ObjectId();
    const materialId = new mongoose.Types.ObjectId();
    const reworkId = new mongoose.Types.ObjectId();
    const incomingLotId = new mongoose.Types.ObjectId();

    jest.spyOn(CustomerModel, 'findById').mockReturnValue(
      fakeQuery({
        _id: customerId,
        isActive: true,
        allowedCountries: ['DE'],
        blockedCountries: [],
      })
    );
    jest.spyOn(MaterialModel, 'findById').mockReturnValue(
      fakeQuery({ _id: materialId, isActive: true, kind: 'HONEY', unit: 'kg' })
    );
    jest.spyOn(ReworkStockModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: reworkId,
          reworkNo: 'RW-26-0002',
          remainingKg: 1,
          origin: [{
            country: 'RO',
            incomingLotId,
            kg: 1,
            pct: 100,
            unitPriceEurPerKg: 1,
          }],
        },
      ])
    );

    await expect(
      BatchService.simulateFeasibility(
        customerId.toHexString(),
        1,
        materialId.toHexString(),
        [reworkId.toHexString()]
      )
    ).rejects.toMatchObject({ code: 'REWORK_ORIGIN_NOT_ALLOWED' });
  });

  it('summarizes connected warehouse stock availability per active kg honey material', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const lotId = new mongoose.Types.ObjectId();

    jest.spyOn(MaterialModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: materialId,
          code: 'HON-ACA',
          name: 'Acacia Honey',
          kind: 'HONEY',
          unit: 'kg',
          isActive: true,
        },
      ])
    );
    jest.spyOn(DrumModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          materialId,
          country: 'RO',
          netKg: 285,
          status: 'Approved',
          reservedBatchId: null,
          incomingLotId: lotId,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          materialId,
          country: 'RO',
          netKg: 285,
          status: 'Quarantine',
          reservedBatchId: null,
          incomingLotId: lotId,
        },
      ])
    );
    jest.spyOn(StockPackageModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          materialId,
          country: 'UA',
          netKg: 1000,
          status: 'InWarehouse',
          reservedBatchId: null,
          incomingLotId: lotId,
        },
      ])
    );
    jest.spyOn(IncomingLotModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: lotId,
          lotNo: 'IL-26-0009',
          materialId,
          country: 'RO',
          status: 'PASSED',
          sourceNameSnapshot: 'Carpathian Apiaries',
          totalNetKg: 1570,
          receivedDate: new Date('2026-11-03T08:00:00.000Z'),
        },
      ])
    );

    const availability = await BatchService.listMaterialStockAvailability();

    expect(availability).toHaveLength(1);
    expect(availability[0]).toMatchObject({
      materialId: materialId.toHexString(),
      code: 'HON-ACA',
      name: 'Acacia Honey',
      availableKg: 1285,
      availableUnitCount: 2,
      quarantineKg: 285,
      quarantineUnitCount: 1,
    });
    expect(availability[0].countries).toEqual([
      { country: 'UA', availableKg: 1000, unitCount: 1 },
      { country: 'RO', availableKg: 285, unitCount: 1 },
    ]);
    expect(availability[0].lots[0]).toMatchObject({
      lotNo: 'IL-26-0009',
      availableKg: 1285,
      availableUnitCount: 2,
      quarantineKg: 285,
      quarantineUnitCount: 1,
    });
  });

  it('fulfills feasibility with available quarantine and non-blocked origin stock when requested target exceeds lot weight', async () => {
    const customerId = new mongoose.Types.ObjectId();
    const materialId = new mongoose.Types.ObjectId();
    const trLotId = new mongoose.Types.ObjectId();

    jest.spyOn(CustomerModel, 'findById').mockReturnValue(
      fakeQuery({
        _id: customerId,
        isActive: true,
        allowedCountries: ['DE', 'RO'],
        blockedCountries: ['CN'],
      })
    );
    jest.spyOn(MaterialModel, 'findById').mockReturnValue(
      fakeQuery({
        _id: materialId,
        isActive: true,
        kind: 'HONEY',
        unit: 'kg',
        code: 'MAT-HON-PINE',
        name: 'Pine Honey',
      })
    );
    jest.spyOn(DrumModel, 'find').mockReturnValue(
      fakeQuery(
        Array.from({ length: 20 }, (_, idx) => ({
          _id: new mongoose.Types.ObjectId(),
          drumCode: `IL-26-0010-D${String(idx + 1).padStart(3, '0')}`,
          materialId,
          country: 'TR',
          netKg: 290,
          status: 'Quarantine',
          location: 'QuarantineZone',
          createdAt: new Date(Date.now() + idx),
          incomingLotId: trLotId,
          unitPriceEurPerKg: 0,
          originComposition: [
            {
              country: 'TR',
              incomingLotId: trLotId,
              kg: 290,
              pct: 100,
              unitPriceEurPerKg: 0,
            },
          ],
        }))
      )
    );
    jest.spyOn(StockPackageModel, 'find').mockReturnValue(fakeQuery([]));
    jest.spyOn(IncomingLotModel, 'find').mockReturnValue(
      fakeQuery([
        {
          _id: trLotId,
          lotNo: 'IL-26-0010',
          materialId,
          country: 'TR',
          unitPriceEurPerKg: 4.2,
          totalNetKg: 5800,
          status: 'UNDER_REVIEW',
        },
      ])
    );
    jest.spyOn(PriceModel, 'find').mockReturnValue(fakeQuery([]));

    const result = await BatchService.simulateFeasibility(
      customerId.toHexString(),
      6000,
      materialId.toHexString()
    );

    expect(result.canFulfill).toBe(true);
    expect(result.accumulatedKg).toBe(5800);
    expect(result.shortfallKg).toBe(200);
    expect(result.drumsToUse).toHaveLength(20);
    expect(result.weightedAvgEurPerKg).toBe(4.2);
    expect(result.totalCostValueEur).toBe(24360);
  });

  it('uses valid STOCK_MOVEMENT_TYPES enum values on WarmRoomService.checkOutDrum', async () => {
    const cabinetId = new mongoose.Types.ObjectId();
    const drumId = new mongoose.Types.ObjectId();
    const lotId = new mongoose.Types.ObjectId();
    const materialId = new mongoose.Types.ObjectId();
    const batchId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId().toHexString();

    jest
      .spyOn(dbModule, 'withTransaction')
      .mockImplementation(async <T>(fn: (session: mongoose.ClientSession) => Promise<T>) =>
        fn({} as mongoose.ClientSession)
      );
    jest.spyOn(auditHelper, 'recordAudit').mockResolvedValue(undefined as never);
    jest.spyOn(NotificationModel, 'create').mockResolvedValue([] as never);

    const mockCabinet = {
      _id: cabinetId,
      code: 'CAB-01',
      occupiedSlots: [
        {
          slotNo: 1,
          drumId,
          batchId,
          readyAt: new Date(Date.now() - 3600_000),
        },
      ],
      save: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: cabinetId, code: 'CAB-01', occupiedSlots: [] }),
    };

    const mockDrum = {
      _id: drumId,
      drumCode: 'DR-26-00001',
      incomingLotId: lotId,
      materialId,
      country: 'TR',
      status: 'Warming',
      location: 'WarmCabinet1',
      reservedBatchId: batchId,
      save: jest.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: drumId, drumCode: 'DR-26-00001', status: 'InBatch', location: 'Filtration' }),
    };

    jest.spyOn(CabinetModel, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue(mockCabinet),
    } as never);
    jest.spyOn(DrumModel, 'findById').mockReturnValue({
      session: jest.fn().mockResolvedValue(mockDrum),
    } as never);

    const createSpy = jest
      .spyOn(StockMovementModel, 'create')
      .mockResolvedValue([] as never);

    await WarmRoomService.checkOutDrum(
      {
        cabinetCode: 'CAB-01',
        slotNo: 1,
        destination: 'FILTRATION',
        notes: 'Target temp 45C reached',
      },
      userId,
      'Warehouse',
      'Routine release to filtration'
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    const createdMovement = (createSpy.mock.calls[0][0] as unknown as Array<{ movementType: string; reason: string }>)[0];
    expect(createdMovement.movementType).toBe('WARM_OUT_FILTRATION');
    expect(STOCK_MOVEMENT_TYPES).toContain(createdMovement.movementType);
    expect(createdMovement.reason).toContain('Notes: Target temp 45C reached');
  });

  it('populates materialId and country on CONSUME_BATCH and REWORK_CREATED movements when completing FILLING', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const materialId = new mongoose.Types.ObjectId();
    const lotId = new mongoose.Types.ObjectId();
    const drumId = new mongoose.Types.ObjectId();
    const stepId = new mongoose.Types.ObjectId();
    const reworkId = new mongoose.Types.ObjectId();
    const reworkDrumId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId().toHexString();

    jest
      .spyOn(dbModule, 'withTransaction')
      .mockImplementation(async <T>(fn: (session: mongoose.ClientSession) => Promise<T>) =>
        fn({} as mongoose.ClientSession)
      );
    jest.spyOn(auditHelper, 'recordAudit').mockResolvedValue(undefined as never);
    jest.spyOn(NotificationModel, 'create').mockResolvedValue([] as never);

    const mockBatch = {
      _id: batchId,
      processNo: 'B26-0001',
      status: 'FILLING',
      currentStage: 'FILLING',
      baseMaterialId: materialId,
      allowedCountries: ['TR'],
      totalInputKg: 5800,
      totalFilledKg: 0,
      totalLossKg: 0,
      totalReworkOutKg: 0,
      originComposition: [
        {
          country: 'TR',
          incomingLotId: lotId,
          sourceDrumId: drumId,
          kg: 5800,
          pct: 100,
          unitPriceEurPerKg: 4.2,
          costValueEur: 24360,
          costSharePct: 100,
        },
      ],
      transitionTo: jest.fn(function (this: { status: string }, nextStatus: string) {
        this.status = nextStatus;
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(BatchModel, 'findById').mockReturnValue({
      session: jest.fn().mockResolvedValue(mockBatch),
    } as never);
    jest.spyOn(ProcessStepModel, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue([{ stepType: 'FILLING', outKg: 5750 }]),
      }),
    } as never);
    jest.spyOn(FillLineModel, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: 'QUIEL_PET',
        isActive: true,
      }),
    } as never);
    jest.spyOn(ProcessStepModel, 'create').mockResolvedValue([
      {
        _id: stepId,
        save: jest.fn().mockResolvedValue(undefined),
        toObject: () => ({
          _id: stepId,
          inKg: 5750,
          outKg: 5445,
          lossKg: 15,
          reworkOutKg: 290,
          tempC: 41.4,
          personInChargeName: 'Operator',
          startedAt: new Date(),
        }),
      },
    ] as never);
    jest.spyOn(CounterModel, 'findOneAndUpdate').mockResolvedValue({ seq: 1 } as never);
    jest.spyOn(DrumModel, 'create').mockResolvedValue([
      {
        _id: reworkDrumId,
        drumCode: 'DR-RW-26-0001',
        save: jest.fn().mockResolvedValue(undefined),
      },
    ] as never);
    jest.spyOn(ReworkStockModel, 'create').mockResolvedValue([
      {
        _id: reworkId,
        reworkNo: 'RW-26-0001',
        sourceProcessNo: 'B26-0001',
        remainingKg: 290,
        origin: mockBatch.originComposition,
        createdAt: new Date(),
      },
    ] as never);

    const mockReservedDrum = {
      _id: drumId,
      incomingLotId: lotId,
      materialId,
      country: 'TR',
      netKg: 290,
      status: 'InBatch',
      location: 'Filtration',
      save: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(DrumModel, 'find').mockReturnValue({
      session: jest.fn().mockResolvedValue([mockReservedDrum]),
    } as never);
    jest.spyOn(StockPackageModel, 'find').mockReturnValue({
      session: jest.fn().mockResolvedValue([]),
    } as never);

    const createMovementSpy = jest
      .spyOn(StockMovementModel, 'create')
      .mockResolvedValue([] as never);

    await ProcessService.executeStage(
      {
        batchId: batchId.toHexString(),
        stage: 'FILLING',
        sevenStageTarget: 'COMPLETED',
        inKg: 5750,
        outKg: 5445,
        lossKg: 15,
        reworkOutKg: 290,
        tempC: 41.4,
        personInChargeName: 'Operator',
        fillLineCode: 'QUIEL_PET',
      },
      userId,
      'Production',
      'Completed filling stage'
    );

    expect(createMovementSpy).toHaveBeenCalledTimes(2);
    const reworkMovement = (createMovementSpy.mock.calls[0][0] as unknown as Array<Record<string, unknown>>)[0];
    const consumeMovement = (createMovementSpy.mock.calls[1][0] as unknown as Array<Record<string, unknown>>)[0];

    expect(reworkMovement.movementType).toBe('REWORK_CREATED');
    expect(reworkMovement.materialId).toEqual(materialId);
    expect(reworkMovement.country).toBe('TR');

    expect(consumeMovement.movementType).toBe('CONSUME_BATCH');
    expect(consumeMovement.materialId).toEqual(materialId);
    expect(consumeMovement.country).toBe('TR');
    expect(consumeMovement.fromStatus).toBe('InBatch');
    expect(consumeMovement.toStatus).toBe('Consumed');
    expect(mockBatch.totalInputKg).toBe(5800);
    expect(mockBatch.totalFilledKg).toBe(5445);
    expect(mockBatch.totalLossKg).toBe(15);
    expect(mockBatch.totalReworkOutKg).toBe(290);
  });

  it('includes WARM_READY, DEVIATION_MISMATCH, and PROCESS_DEVIATION in NOTIFICATION_TYPES', async () => {
    const { NOTIFICATION_TYPES } = await import('../../../shared/src/schemas/outbound.ts');
    expect(NOTIFICATION_TYPES).toContain('WARM_READY');
    expect(NOTIFICATION_TYPES).toContain('DEVIATION_MISMATCH');
    expect(NOTIFICATION_TYPES).toContain('PROCESS_DEVIATION');
  });
});
