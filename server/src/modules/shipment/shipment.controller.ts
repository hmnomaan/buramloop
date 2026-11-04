import { Request, Response, NextFunction } from 'express';
import { ShipmentService } from './shipment.service';
import { getAuditActor } from '../../common/audit.helper';
import { sanitizeOriginSlicesForRole } from '../../common/price-strip.helper';
import type { ShipmentLotStatus } from '../../../../shared/src/schemas/outbound';

function sanitizeShipment(value: any, roleName: string): any {
  const lot = value?.toObject ? value.toObject() : value;
  if (!lot || typeof lot !== 'object') return lot;
  return {
    ...lot,
    ...(Array.isArray(lot.originComposition)
      ? {
          originComposition: sanitizeOriginSlicesForRole(
            lot.originComposition,
            roleName
          ),
        }
      : {}),
    ...(Array.isArray(lot.originCompositionSnapshot)
      ? {
          originCompositionSnapshot: sanitizeOriginSlicesForRole(
            lot.originCompositionSnapshot,
            roleName
          ),
        }
      : {}),
    ...(lot.batchId && typeof lot.batchId === 'object'
      ? {
          batchId: {
            ...lot.batchId,
            ...(Array.isArray(lot.batchId.originComposition)
              ? {
                  originComposition: sanitizeOriginSlicesForRole(
                    lot.batchId.originComposition,
                    roleName
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

export class ShipmentController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const lots = await ShipmentService.listShipmentLots({
        status: req.query.status as string | undefined,
        customerId: req.query.customerId as string | undefined,
        batchId: req.query.batchId as string | undefined,
      });
      res.setHeader('Cache-Control', 'no-store, private');
      res.json({ ok: true, data: lots.map((lot) => sanitizeShipment(lot, actor.roleName)) });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const reason = String(req.body.reason || req.headers['x-audit-reason'] || '');
      const result = await ShipmentService.createShipmentLot(
        req.body,
        String(actor.userId),
        actor.roleName,
        reason
      );
      res.setHeader('Cache-Control', 'no-store, private');
      res.status(201).json({
        ok: true,
        data: {
          ...result,
          shipmentLot: sanitizeShipment(result.shipmentLot, actor.roleName),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async transitionStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const reason = String(req.body.reason || req.headers['x-audit-reason'] || '');
      const updated = await ShipmentService.transitionStatus(
        String(req.params.id),
        req.body.targetStatus as ShipmentLotStatus,
        String(actor.userId),
        actor.roleName,
        reason
      );
      res.setHeader('Cache-Control', 'no-store, private');
      res.json({ ok: true, data: sanitizeShipment(updated, actor.roleName) });
    } catch (err) {
      next(err);
    }
  }
}
