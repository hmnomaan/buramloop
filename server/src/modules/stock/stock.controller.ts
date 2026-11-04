// server/src/modules/stock/stock.controller.ts
import { Request, Response, NextFunction } from 'express';
import { DrumModel, StockMovementModel, StockPackageModel } from '../../models';
import { getAuditActor } from '../../common/audit.helper.ts';
import { sanitizeCommercialDataForRole } from '../../common/price-strip.helper';
import { StockService } from './stock.service';

export class StockController {
  static async listIncomingLots(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await StockService.listIncomingLotsWithUsage({
        status: req.query.status as string | undefined,
        country: req.query.country as string | undefined,
        materialId: req.query.materialId as string | undefined,
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
        { ...req.body, incomingLotId: req.params.id },
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
        { ...req.body, incomingLotId: req.params.id },
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
      if (req.query.incomingLotId) filter.incomingLotId = req.query.incomingLotId;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.country) filter.country = String(req.query.country).toUpperCase();
      if (req.query.materialId) filter.materialId = req.query.materialId;

      const drums = await DrumModel.find(filter)
        .populate('incomingLotId', 'lotNo status receivedDate')
        .populate('materialId', 'code name kind')
        .sort({ incomingLotId: -1, drumNo: 1 })
        .limit(500)
        .lean();

      res.json({ ok: true, data: drums });
    } catch (err) {
      next(err);
    }
  }

  static async listStockPackages(req: Request, res: Response, next: NextFunction) {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.incomingLotId) filter.incomingLotId = req.query.incomingLotId;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.packageType) filter.packageType = req.query.packageType;
      if (req.query.country) filter.country = String(req.query.country).toUpperCase();
      if (req.query.materialId) filter.materialId = req.query.materialId;

      const stockPackages = await StockPackageModel.find(filter)
        .populate('incomingLotId', 'lotNo status receivedDate')
        .populate('materialId', 'code name kind')
        .sort({ incomingLotId: -1, packageNo: 1 })
        .limit(1000)
        .lean();

      res.json({ ok: true, data: stockPackages });
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
      if (req.query.drumId) filter.drumId = req.query.drumId;
      if (req.query.stockPackageId) filter.stockPackageId = req.query.stockPackageId;
      if (req.query.incomingLotId) filter.incomingLotId = req.query.incomingLotId;
      if (req.query.batchId) filter.batchId = req.query.batchId;

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