// server/src/modules/trace/trace.controller.ts
import { Request, Response, NextFunction } from 'express';
import { TraceService } from './trace.service';
import { getAuditActor } from '../../common/audit.helper';

export class TraceController {
  static async listSuggestions(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await TraceService.listSuggestedTraceCodes();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async lookup(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getAuditActor(req);
      const code = String(req.params.code || req.query.code || 'B-2026-089');

      // Admin route permission check: only Admin or users granted 'trace:admin_route' can view full unmasked details
      const canViewAdminRoute =
        actor.isAdmin ||
        actor.permissions.includes('trace:admin_route') ||
        actor.permissions.includes('*:*');

      const roleForTrace = canViewAdminRoute ? actor.roleName : 'Inspector';
      const data = await TraceService.traceByReference(code, roleForTrace);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async placeRegulatoryHold(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const actor = getAuditActor(req);
      const code = String(req.params.code || req.body.code || '');
      const reason = String(req.body.reason || req.headers['x-audit-reason'] || '');
      const data = await TraceService.placeRegulatoryHold(
        code,
        actor.userId.toHexString(),
        actor.roleName,
        reason
      );
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
}
