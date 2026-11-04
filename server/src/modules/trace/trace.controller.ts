// server/src/modules/trace/trace.controller.ts
import { Request, Response, NextFunction } from 'express';
import { TraceService } from './trace.service';

export class TraceController {
  static async lookup(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const code = String(req.query.code || req.params.code || 'B-2026-089');
      const data = await TraceService.traceEntity(code, user.roleName || user.role);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
}