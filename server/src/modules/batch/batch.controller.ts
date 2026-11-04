// server/src/modules/batch/batch.controller.ts
import { Request, Response, NextFunction } from 'express';
import { BatchService } from './batch.service';
import { BatchModel, ReworkStockModel } from '../../models';
import { getAuditActor } from '../../common/audit.helper';
import {
  canRoleViewPrices,
  sanitizeOriginSlicesForRole,
} from '../../common/price-strip.helper';

function stripPriceFields<T extends Record<string, unknown>>(
  value: T,
  roleName: string
): T | Record<string, unknown> {
  if (canRoleViewPrices(roleName)) return value;
  const sanitized = { ...value };
  delete sanitized.unitPriceEurPerKg;
  delete sanitized.costValueEur;
  delete sanitized.costSharePct;
  delete sanitized.totalCostValueEur;
  delete sanitized.totalValueEur;
  delete sanitized.weightedAvgEurPerKg;
  return sanitized;
}

function sanitizeBatch(value: any, roleName: string) {
  const batch = value?.toObject ? value.toObject() : value;
  const sanitized = stripPriceFields(batch, roleName) as Record<string, any>;
  if (Array.isArray(batch?.originComposition)) {
    sanitized.originComposition = sanitizeOriginSlicesForRole(
      batch.originComposition,
      roleName
    );
  }
  return sanitized;
}

export class BatchController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const data = await BatchModel.find({ isVoid: false })
        .populate('customerId', 'code name country allowedCountries')
        .populate('baseMaterialId', 'code name kind')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      res.json({ ok: true, data: data.map((batch) => sanitizeBatch(batch, actor.roleName)) });
    } catch (err) {
      next(err);
    }
  }

  static async listAvailableRework(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const reworks = await ReworkStockModel.find({
        status: 'AVAILABLE',
        remainingKg: { $gt: 0 },
        isVoid: false,
        reservedBatchId: null,
      })
        .sort({ createdAt: 1 })
        .lean();
      res.json({
        ok: true,
        data: reworks.map((rework) => ({
          ...stripPriceFields(rework, actor.roleName),
          origin: sanitizeOriginSlicesForRole(rework.origin ?? [], actor.roleName),
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  static async listStockAvailability(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await BatchService.listMaterialStockAvailability();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async simulate(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const { customerId, targetKg, materialId, includeReworkIds } = req.body;
      const result = await BatchService.simulateFeasibility(
        String(customerId),
        Number(targetKg),
        String(materialId),
        Array.isArray(includeReworkIds) ? includeReworkIds : []
      );
      const data = stripPriceFields(result, actor.roleName) as Record<string, any>;
      data.originComposition = sanitizeOriginSlicesForRole(
        result.originComposition,
        actor.roleName
      );
      if (!canRoleViewPrices(actor.roleName)) {
        data.drumsToUse = result.drumsToUse.map((item) =>
          stripPriceFields(item as unknown as Record<string, unknown>, actor.roleName)
        );
      }
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async approveAndReserve(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const reason = String(req.body.reason || req.headers['x-audit-reason'] || '');
      const data = await BatchService.approveAndReserveBatch(
        req.body,
        String(actor.userId),
        String(actor.roleName),
        String(reason)
      );
      res.status(201).json({ ok: true, data: sanitizeBatch(data, actor.roleName) });
    } catch (err) {
      next(err);
    }
  }
}