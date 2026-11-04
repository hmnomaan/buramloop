import { Request, Response, NextFunction } from 'express';
import { ShipmentController } from '../modules/shipment/shipment.controller';
import { ShipmentService } from '../modules/shipment/shipment.service';

const origin = {
  country: 'DE',
  incomingLotId: '671f00000000000000000001',
  kg: 100,
  pct: 100,
  unitPriceEurPerKg: 4.2,
  costValueEur: 420,
  costSharePct: 100,
};

function requestWithRole(roleName: string): Request {
  return {
    user: { userId: '671f00000000000000000002', roleName },
    body: { reason: 'Validated shipment operation', targetStatus: 'RELEASED' },
    headers: {},
    query: {},
    params: { id: '671f00000000000000000003' },
  } as unknown as Request;
}

function responseCapture() {
  const res = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { res, json: res.json as jest.Mock };
}

describe('shipment R9 origin price masking', () => {
  afterEach(() => jest.restoreAllMocks());

  it('masks list origin slices and populated batch origin slices for non-price roles', async () => {
    jest.spyOn(ShipmentService, 'listShipmentLots').mockResolvedValue([
      { originComposition: [origin], batchId: { originComposition: [origin] } },
    ]);
    const { res, json } = responseCapture();

    await ShipmentController.list(
      requestWithRole('Warehouse'),
      res,
      jest.fn() as NextFunction
    );

    const lot = json.mock.calls[0][0].data[0];
    expect(lot.originComposition[0].pct).toBe(100);
    expect(lot.originComposition[0].unitPriceEurPerKg).toBeUndefined();
    expect(lot.batchId.originComposition[0].costValueEur).toBeUndefined();
  });

  it('masks create and transition responses while preserving price data for Admin', async () => {
    jest.spyOn(ShipmentService, 'createShipmentLot').mockResolvedValue({
      shipmentLot: { originComposition: [origin] },
      items: [],
    } as never);
    jest.spyOn(ShipmentService, 'transitionStatus').mockResolvedValue({
      originComposition: [origin],
    } as never);

    const createResponse = responseCapture();
    await ShipmentController.create(
      requestWithRole('Production'),
      createResponse.res,
      jest.fn() as NextFunction
    );
    expect(
      createResponse.json.mock.calls[0][0].data.shipmentLot.originComposition[0]
        .costSharePct
    ).toBeUndefined();

    const transitionResponse = responseCapture();
    await ShipmentController.transitionStatus(
      requestWithRole('Admin'),
      transitionResponse.res,
      jest.fn() as NextFunction
    );
    expect(
      transitionResponse.json.mock.calls[0][0].data.originComposition[0]
        .unitPriceEurPerKg
    ).toBe(4.2);
  });
});
