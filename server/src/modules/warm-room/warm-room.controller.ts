// server/src/modules/warm-room/warm-room.controller.ts
import { Request, Response, NextFunction } from 'express';
import { WarmRoomService } from './warm-room.service';
import { getAuditActor } from '../../common/audit.helper';

export class WarmRoomController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await WarmRoomService.listCabinets();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const reason = String(req.body.reason || req.headers['x-audit-reason'] || '');
      const data = await WarmRoomService.checkInDrum(
        req.body,
        String(actor.userId),
        actor.roleName,
        reason
      );
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async checkOut(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const reason = String(req.body.reason || req.headers['x-audit-reason'] || '');
      const data = await WarmRoomService.checkOutDrum(
        req.body,
        String(actor.userId),
        String(actor.roleName),
        String(reason)
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
}