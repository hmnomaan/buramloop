import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { BatchController } from '../modules/batch/batch.controller';
import { BatchService } from '../modules/batch/batch.service';
import { ProcessController } from '../modules/process/process.controller';
import { ProcessService } from '../modules/process/process.service';
import { TraceController } from '../modules/trace/trace.controller';
import { TraceService } from '../modules/trace/trace.service';
import { BatchModel, ReworkStockModel } from '../models';

function requestWithRole(roleName: string): Request {
  return {
    user: { userId: '671f00000000000000000001', roleName },
    body: {},
    headers: {},
  } as unknown as Request;
}

function responseCapture() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { res, json: res.json as jest.Mock };
}

describe('R9 controller price-field serialization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips feasibility prices and package prices for Warehouse while retaining blend weights', async () => {
    jest.spyOn(BatchService, 'simulateFeasibility').mockResolvedValue({
      canFulfill: true,
      shortfallKg: 0,
      accumulatedKg: 40,
      totalCostValueEur: 120,
      weightedAvgEurPerKg: 3,
      drumsToUse: [
        {
          unitKind: 'DRUM',
          unitId: '671f00000000000000000002',
          code: 'DR-1',
          materialId: '671f00000000000000000003',
          country: 'RO',
          incomingLotId: '671f00000000000000000004',
          netKg: 40,
          fromStatus: 'Approved',
          fromLocation: 'Warehouse',
          originSlices: [],
          unitPriceEurPerKg: 3,
        },
      ],
      reworkToUse: [],
      originComposition: [
        {
          country: 'RO',
          incomingLotId: '671f00000000000000000004',
          kg: 40,
          pct: 100,
          unitPriceEurPerKg: 3,
          costValueEur: 120,
          costSharePct: 100,
        },
      ],
      message: 'Feasible',
    } as never);

    const { res, json } = responseCapture();
    await BatchController.simulate(
      {
        ...requestWithRole('Warehouse'),
        body: {
          customerId: '671f00000000000000000005',
          materialId: '671f00000000000000000003',
          targetKg: 40,
        },
      } as Request,
      res,
      jest.fn() as NextFunction
    );

    const payload = json.mock.calls[0][0];
    expect(payload.data.totalCostValueEur).toBeUndefined();
    expect(payload.data.weightedAvgEurPerKg).toBeUndefined();
    expect(payload.data.originComposition[0]).toMatchObject({
      country: 'RO',
      kg: 40,
      pct: 100,
    });
    expect(payload.data.originComposition[0].unitPriceEurPerKg).toBeUndefined();
    expect(payload.data.originComposition[0].costValueEur).toBeUndefined();
    expect(payload.data.originComposition[0].costSharePct).toBeUndefined();
    expect(payload.data.drumsToUse[0].unitPriceEurPerKg).toBeUndefined();
  });

  it('masks batch list, available rework, and reservation payloads for non-price roles', async () => {
    const origin = [
      {
        country: 'RO',
        incomingLotId: '671f00000000000000000004',
        kg: 40,
        pct: 100,
        unitPriceEurPerKg: 3,
        costValueEur: 120,
        costSharePct: 100,
      },
    ];
    const batch = { originComposition: origin, totalCostValueEur: 120 };
    const findQuery = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([batch]),
    };
    jest.spyOn(BatchModel, 'find').mockReturnValue(findQuery as never);

    const batchListResponse = responseCapture();
    await BatchController.list(
      requestWithRole('Production'),
      batchListResponse.res,
      jest.fn() as NextFunction
    );
    const listedBatch = batchListResponse.json.mock.calls[0][0].data[0];
    expect(listedBatch.originComposition[0].pct).toBe(100);
    expect(listedBatch.originComposition[0].unitPriceEurPerKg).toBeUndefined();
    expect(listedBatch.totalCostValueEur).toBeUndefined();

    const reworkQuery = {
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ origin, totalCostValueEur: 120 }]),
    };
    jest.spyOn(ReworkStockModel, 'find').mockReturnValue(reworkQuery as never);
    const reworkResponse = responseCapture();
    await BatchController.listAvailableRework(
      requestWithRole('Warehouse'),
      reworkResponse.res,
      jest.fn() as NextFunction
    );
    const listedRework = reworkResponse.json.mock.calls[0][0].data[0];
    expect(listedRework.origin[0].pct).toBe(100);
    expect(listedRework.origin[0].costValueEur).toBeUndefined();
    expect(listedRework.totalCostValueEur).toBeUndefined();

    jest.spyOn(BatchService, 'approveAndReserveBatch').mockResolvedValue({
      toObject: () => batch,
    } as never);
    const reserveResponse = responseCapture();
    await BatchController.approveAndReserve(
      {
        ...requestWithRole('Production'),
        body: { reason: 'Reserve planned batch' },
        headers: {},
      } as Request,
      reserveResponse.res,
      jest.fn() as NextFunction
    );
    const reservedBatch = reserveResponse.json.mock.calls[0][0].data;
    expect(reservedBatch.originComposition[0].costSharePct).toBeUndefined();
    expect(reservedBatch.totalCostValueEur).toBeUndefined();
  });

  it('preserves prices for Management and strips nested process and generated rework prices for Inspector', async () => {
    const slice = {
      country: 'DE',
      incomingLotId: '671f00000000000000000004',
      kg: 100,
      pct: 100,
      unitPriceEurPerKg: 4.5,
      costValueEur: 450,
      costSharePct: 100,
    };
    const batchSpy = jest.spyOn(BatchService, 'simulateFeasibility').mockResolvedValue({
      canFulfill: true,
      shortfallKg: 0,
      accumulatedKg: 100,
      totalCostValueEur: 450,
      weightedAvgEurPerKg: 4.5,
      drumsToUse: [],
      reworkToUse: [],
      originComposition: [slice],
      message: 'Feasible',
    } as never);
    const processSpy = jest.spyOn(ProcessService, 'listProcesses').mockResolvedValue([
      {
        originComposition: [slice],
        reworkGenerated: [{ origin: [slice], totalCostValueEur: 450 }],
      },
    ] as never);
    const executeSpy = jest.spyOn(ProcessService, 'executeStage').mockResolvedValue({
      batch: { originComposition: [slice] },
      reworkStock: { origin: [slice] },
      reworkDrum: { originComposition: [slice] },
    } as never);

    const managementResponse = responseCapture();
    await BatchController.simulate(
      {
        ...requestWithRole('Management'),
        body: {
          customerId: '671f00000000000000000005',
          materialId: '671f00000000000000000003',
          targetKg: 100,
        },
      } as Request,
      managementResponse.res,
      jest.fn() as NextFunction
    );
    expect(managementResponse.json.mock.calls[0][0].data.originComposition[0].costValueEur).toBe(
      450
    );

    const inspectorResponse = responseCapture();
    await ProcessController.list(
      requestWithRole('Inspector'),
      inspectorResponse.res,
      jest.fn() as NextFunction
    );
    const processPayload = inspectorResponse.json.mock.calls[0][0].data[0];
    expect(processPayload.originComposition[0].pct).toBe(100);
    expect(processPayload.originComposition[0].unitPriceEurPerKg).toBeUndefined();
    expect(processPayload.reworkGenerated[0].origin[0].costValueEur).toBeUndefined();
    expect(processPayload.reworkGenerated[0].totalCostValueEur).toBeUndefined();

    const executionResponse = responseCapture();
    await ProcessController.executeStage(
      {
        ...requestWithRole('Warehouse'),
        body: { reason: 'Complete filling step' },
        headers: {},
      } as Request,
      executionResponse.res,
      jest.fn() as NextFunction
    );
    const executionPayload = executionResponse.json.mock.calls[0][0].data;
    expect(executionPayload.batch.originComposition[0].costValueEur).toBeUndefined();
    expect(executionPayload.reworkStock.origin[0].unitPriceEurPerKg).toBeUndefined();
    expect(executionPayload.reworkDrum.originComposition[0].costSharePct).toBeUndefined();

    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  describe('BL-058: TraceController lookup RBAC & masking enforcement', () => {
    it('forces Inspector role for lookup when caller lacks trace:admin_route and is not Admin', async () => {
      const traceSpy = jest
        .spyOn(TraceService, 'traceByReference')
        .mockResolvedValue({ queriedCode: 'B-2026-089', inspectorMode: true } as any);

      const inspectorReq = {
        user: {
          userId: new Types.ObjectId('671f00000000000000000001'),
          roleName: 'INSPECTOR',
          permissions: ['trace:inspect'],
          isAdmin: false,
          isInspector: true,
        },
        params: { code: 'B-2026-089' },
        query: {},
        body: {},
        headers: {},
      } as unknown as Request;

      const inspectorRes = responseCapture();
      await TraceController.lookup(inspectorReq, inspectorRes.res, jest.fn() as NextFunction);

      expect(traceSpy).toHaveBeenCalledWith('B-2026-089', 'Inspector');
      expect(inspectorRes.json.mock.calls[0][0].data.inspectorMode).toBe(true);
    });

    it('passes actor role when caller is Admin', async () => {
      const traceSpy = jest
        .spyOn(TraceService, 'traceByReference')
        .mockResolvedValue({ queriedCode: 'B-2026-089', inspectorMode: false } as any);

      const adminReq = {
        user: {
          userId: new Types.ObjectId('671f00000000000000000002'),
          roleName: 'ADMIN',
          permissions: ['*:*'],
          isAdmin: true,
          isInspector: false,
        },
        params: { code: 'B-2026-089' },
        query: {},
        body: {},
        headers: {},
      } as unknown as Request;

      const adminRes = responseCapture();
      await TraceController.lookup(adminReq, adminRes.res, jest.fn() as NextFunction);

      expect(traceSpy).toHaveBeenCalledWith('B-2026-089', 'ADMIN');
      expect(adminRes.json.mock.calls[0][0].data.inspectorMode).toBe(false);
    });

    it('allows non-Admin user with explicitly granted trace:admin_route to view admin route', async () => {
      const traceSpy = jest
        .spyOn(TraceService, 'traceByReference')
        .mockResolvedValue({ queriedCode: 'B-2026-089', inspectorMode: false } as any);

      const privilegedReq = {
        user: {
          userId: new Types.ObjectId('671f00000000000000000003'),
          roleName: 'QA_LEAD',
          permissions: ['qa:inspect', 'trace:admin_route'],
          isAdmin: false,
          isInspector: false,
        },
        params: { code: 'B-2026-089' },
        query: {},
        body: {},
        headers: {},
      } as unknown as Request;

      const privilegedRes = responseCapture();
      await TraceController.lookup(privilegedReq, privilegedRes.res, jest.fn() as NextFunction);

      expect(traceSpy).toHaveBeenCalledWith('B-2026-089', 'QA_LEAD');
      expect(privilegedRes.json.mock.calls[0][0].data.inspectorMode).toBe(false);
    });
  });
});
