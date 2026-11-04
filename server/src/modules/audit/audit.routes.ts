// server/src/modules/audit/audit.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { AuditLogModel } from '../../models';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';

export const auditRouter : Router = Router();

auditRouter.use(authenticate);

auditRouter.get(
  '/',
  requirePermission('audit:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};
      if (req.query.module) filter.module = String(req.query.module);
      if (req.query.entityType) filter.entityType = String(req.query.entityType);
      if (req.query.entityRef) filter.entityRef = String(req.query.entityRef);

      const data = await AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .limit(250)
        .lean();

      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
);