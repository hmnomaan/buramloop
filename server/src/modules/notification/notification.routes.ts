// server/src/modules/notification/notification.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { NotificationModel } from '../../models';
import { authenticate } from '../../middlewares/auth.middleware';
import { getAuditActor } from '../../common/audit.helper';

export const notificationRouter:Router = Router();

notificationRouter.use(authenticate);

notificationRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = getAuditActor(req);
    const data = await NotificationModel.find({
      $or: [
        { targetRoles: { $size: 0 } },
        { targetRoles: actor.roleName },
      ],
    })
      .sort({ createdAt: -1 }) // Sort by createdAt in descending order to get the latest notifications first
      .limit(100)
      .lean();
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

notificationRouter.post('/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = getAuditActor(req);
    const updated = await NotificationModel.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { readByUserIds: new Types.ObjectId(actor.userId) } },
      { new: true }
    ).lean();
    res.json({ ok: true, data: updated });
  } catch (err) {
    next(err);
  }
});