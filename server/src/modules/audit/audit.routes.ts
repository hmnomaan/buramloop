// server/src/modules/audit/audit.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuditLogModel, UserModel } from '../../models';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';

export const auditRouter: Router = Router();

auditRouter.use(authenticate);

auditRouter.get(
  '/',
  requirePermission('audit:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {};

      if (req.query.module) {
        filter.module = String(req.query.module).trim();
      }
      if (req.query.action) {
        filter.action = String(req.query.action).trim();
      }
      if (req.query.actorRole) {
        filter.actorRole = String(req.query.actorRole).trim();
      }
      if (req.query.entityType) {
        filter.entityType = String(req.query.entityType).trim();
      }
      if (req.query.entityRef) {
        filter.entityRef = { $regex: String(req.query.entityRef).trim(), $options: 'i' };
      }
      if (req.query.actorId && Types.ObjectId.isValid(String(req.query.actorId))) {
        filter.actorId = new Types.ObjectId(String(req.query.actorId));
      }

      // Filter by Actor name/email
      if (req.query.actor) {
        const actorRegex = { $regex: String(req.query.actor).trim(), $options: 'i' };
        const matchingUsers = await UserModel.find({
          $or: [{ fullName: actorRegex }, { email: actorRegex }],
        }).select('_id').lean();
        const userIds = matchingUsers.map((u) => u._id);
        if (userIds.length > 0) {
          filter.actorId = { $in: userIds };
        } else {
          // If no matching users, return empty result
          return res.json({ ok: true, count: 0, data: [] });
        }
      }

      // Date range filtering
      if (req.query.startDate || req.query.endDate) {
        const dateFilter: Record<string, Date> = {};
        if (req.query.startDate) {
          const start = new Date(String(req.query.startDate));
          if (!isNaN(start.getTime())) {
            dateFilter.$gte = start;
          }
        }
        if (req.query.endDate) {
          const end = new Date(String(req.query.endDate));
          if (!isNaN(end.getTime())) {
            // Set to end of day if only date is passed
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
          }
        }
        if (Object.keys(dateFilter).length > 0) {
          filter.createdAt = dateFilter;
        }
      }

      // Full text search on reason, entityRef, action, or module
      if (req.query.search) {
        const searchRegex = { $regex: String(req.query.search).trim(), $options: 'i' };
        filter.$or = [
          { entityRef: searchRegex },
          { reason: searchRegex },
          { action: searchRegex },
          { module: searchRegex },
        ];
      }

      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '500'), 10) || 500, 1), 1000);

      const data = await AuditLogModel.find(filter)
        .populate('actorId', 'fullName email roleName')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.json({ ok: true, count: data.length, data });
    } catch (err) {
      next(err);
    }
  }
);
