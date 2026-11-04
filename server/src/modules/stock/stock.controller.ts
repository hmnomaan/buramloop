// server/src/modules/stock/stock.controller.ts
import { Request, Response, NextFunction } from 'express';
import { DrumModel, StockMovementModel, StockPackageModel } from '../../models';
import { getAuditActor } from '../../common/audit.helper.ts';
import { sanitizeCommercialDataForRole } from '../../common/price-strip.helper';
import { BarcodeService } from './barcode.service';
import { StockService } from './stock.service';

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export class StockController {
  static async listIncomingLots(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await StockService.listIncomingLotsWithUsage({
        status: queryString(req.query.status),
        country: queryString(req.query.country),
        materialId: queryString(req.query.materialId),
      });
      res.json({
        ok: true,
        data: sanitizeCommercialDataForRole(data, req.user?.roleName ?? ''),
      });
    } catch (err) {
      next(err);
    }
  }

  static async receiveIncomingLot(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await StockService.receiveIncomingLot(req.body, getAuditActor(req));
      res.status(201).json({
        ok: true,
        data: sanitizeCommercialDataForRole(data, req.user?.roleName ?? ''),
      });
    } catch (err) {
      next(err);
    }
  }

  static async reviewIncomingLot(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await StockService.reviewIncomingLot(
        { ...req.body, incomingLotId: String(req.params.id) },
        getAuditActor(req)
      );
      res.json({
        ok: true,
        data: sanitizeCommercialDataForRole(data, req.user?.roleName ?? ''),
      });
    } catch (err) {
      next(err);
    }
  }

  static async returnLotMismatch(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await StockService.returnLotOnMismatch(
        { ...req.body, incomingLotId: String(req.params.id) },
        getAuditActor(req)
      );
      res.json({
        ok: true,
        data: sanitizeCommercialDataForRole(data, req.user?.roleName ?? ''),
      });
    } catch (err) {
      next(err);
    }
  }

  static async listDrums(req: Request, res: Response, next: NextFunction) {
    try {
      const filter: Record<string, unknown> = {};
      const incomingLotId = queryString(req.query.incomingLotId);
      const status = queryString(req.query.status);
      const country = queryString(req.query.country);
      const materialId = queryString(req.query.materialId);
      if (incomingLotId) filter.incomingLotId = incomingLotId;
      if (status) filter.status = status;
      if (country) filter.country = country.toUpperCase();
      if (materialId) filter.materialId = materialId;

      const drums = await DrumModel.find(filter)
        .populate('incomingLotId', 'lotNo status receivedDate')
        .populate('materialId', 'code name kind')
        .sort({ incomingLotId: -1, drumNo: 1 })
        .limit(500)
        .lean();

      res.json({
        ok: true,
        data: sanitizeCommercialDataForRole(drums, req.user?.roleName ?? ''),
      });
    } catch (err) {
      next(err);
    }
  }

  static async generateDrumZplLabel(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await BarcodeService.generateDrumZplLabel(String(req.params.id));
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async resolveBarcode(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await BarcodeService.resolveBarcode(
        String(req.params.code),
        queryString(req.query.expectedCountry)
      );
      res.json({
        ok: true,
        data: sanitizeCommercialDataForRole(data, req.user?.roleName ?? ''),
      });
    } catch (err) {
      next(err);
    }
  }

  static async listStockPackages(req: Request, res: Response, next: NextFunction) {
    try {
      const filter: Record<string, unknown> = {};
      const incomingLotId = queryString(req.query.incomingLotId);
      const status = queryString(req.query.status);
      const packageType = queryString(req.query.packageType);
      const country = queryString(req.query.country);
      const materialId = queryString(req.query.materialId);
      if (incomingLotId) filter.incomingLotId = incomingLotId;
      if (status) filter.status = status;
      if (packageType) filter.packageType = packageType;
      if (country) filter.country = country.toUpperCase();
      if (materialId) filter.materialId = materialId;

      const stockPackages = await StockPackageModel.find(filter)
        .populate('incomingLotId', 'lotNo status receivedDate')
        .populate('materialId', 'code name kind')
        .sort({ incomingLotId: -1, packageNo: 1 })
        .limit(1000)
        .lean();

      res.json({
        ok: true,
        data: sanitizeCommercialDataForRole(stockPackages, req.user?.roleName ?? ''),
      });
    } catch (err) {
      next(err);
    }
  }

  static async getStockSummary(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await StockService.getStockSummary();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async listLedgerMovements(req: Request, res: Response, next: NextFunction) {
    try {
      const filter: Record<string, unknown> = {};
      const drumId = queryString(req.query.drumId);
      const stockPackageId = queryString(req.query.stockPackageId);
      const incomingLotId = queryString(req.query.incomingLotId);
      const batchId = queryString(req.query.batchId);
      if (drumId) filter.drumId = drumId;
      if (stockPackageId) filter.stockPackageId = stockPackageId;
      if (incomingLotId) filter.incomingLotId = incomingLotId;
      if (batchId) filter.batchId = batchId;

      const movements = await StockMovementModel.find(filter)
        .populate('performedBy', 'fullName email roleName')
        .sort({ createdAt: -1 })
        .limit(300)
        .lean();

      res.json({ ok: true, data: movements });
    } catch (err) {
      next(err);
    }
  }

  static async checkLedgerIntegrity(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await StockService.verifyLedgerIntegrity();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
}
