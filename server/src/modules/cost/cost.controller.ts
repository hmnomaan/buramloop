// server/src/modules/cost/cost.controller.ts
import { Request, Response, NextFunction } from 'express';
import { CostService } from './cost.service';

export class CostController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const data = await CostService.listCostReports(user.roleName || user.role);
      res.setHeader('Cache-Control', 'no-store, private');
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const reason = req.body.reason || req.headers['x-audit-reason'];
      const data = await CostService.generateCostReport(
        req.body,
        user.userId || user.id,
        user.roleName || user.role,
        String(reason)
      );
      res.setHeader('Cache-Control', 'no-store, private');
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
}