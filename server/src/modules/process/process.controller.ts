// server/src/modules/process/process.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ProcessService } from './process.service';
import { getAuditActor } from '../../common/audit.helper';
import {
  canRoleViewPrices,
  sanitizeOriginSlicesForRole,
} from '../../common/price-strip.helper';

function withoutPrices<T extends Record<string, unknown>>(
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

function sanitizeProcessValue(value: any, roleName: string): any {
  const serialized = value?.toObject ? value.toObject() : value;
  const sanitized = withoutPrices(serialized, roleName);
  if (Array.isArray(serialized?.originComposition)) {
    sanitized.originComposition = sanitizeOriginSlicesForRole(
      serialized.originComposition,
      roleName
    );
  }
  if (Array.isArray(serialized?.reworkGenerated)) {
    sanitized.reworkGenerated = serialized.reworkGenerated.map((rework: any) => ({
      ...withoutPrices(rework, roleName),
      origin: sanitizeOriginSlicesForRole(rework.origin ?? [], roleName),
    }));
  }
  if (Array.isArray(serialized?.reworkStocks)) {
    sanitized.reworkStocks = serialized.reworkStocks.map((rework: any) => ({
      ...withoutPrices(rework, roleName),
      origin: sanitizeOriginSlicesForRole(rework.origin ?? [], roleName),
    }));
  }
  for (const key of ['batch', 'reworkStock', 'reworkDrum'] as const) {
    if (serialized?.[key]) {
      const nested = serialized[key]?.toObject
        ? serialized[key].toObject()
        : serialized[key];
      sanitized[key] = {
        ...withoutPrices(nested, roleName),
        ...(Array.isArray(nested.originComposition)
          ? {
              originComposition: sanitizeOriginSlicesForRole(
                nested.originComposition,
                roleName
              ),
            }
          : {}),
        ...(Array.isArray(nested.origin)
          ? { origin: sanitizeOriginSlicesForRole(nested.origin, roleName) }
          : {}),
      };
    }
  }
  return sanitized;
}

export class ProcessController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const data = await ProcessService.listProcesses();
      res.json({
        ok: true,
        data: data.map((process: any) => sanitizeProcessValue(process, actor.roleName)),
      });
    } catch (err) {
      next(err);
    }
  }

  static async executeStage(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = String(req.user!.userId);
      const reason = req.body.reason || req.headers['x-audit-reason'];
      const result = await ProcessService.executeStage(
        req.body,
        actorId,
        req.user!.roleName,
        String(reason)
      );
      res.status(201).json({
        ok: true,
        data: sanitizeProcessValue(result, req.user!.roleName),
      });
    } catch (err) {
      next(err);
    }
  }
}