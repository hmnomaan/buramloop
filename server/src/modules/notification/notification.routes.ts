// server/src/modules/notification/notification.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { NotificationModel } from '../../models';
import { authenticate } from '../../middlewares/auth.middleware';
import { getAuditActor } from '../../common/audit.helper';

export const notificationRouter: Router = Router();

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
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = getAuditActor(req);
    const actorObjId = Types.ObjectId.isValid(actor.userId)
      ? new Types.ObjectId(actor.userId)
      : undefined;
    const updated = await NotificationModel.findByIdAndUpdate(
      String(req.params.id),
      {
        ...(actorObjId ? { $addToSet: { readByUserIds: actorObjId } } : {}),
        $set: {
          ...(actorObjId ? { acknowledgedBy: actorObjId } : {}),
          acknowledgedAt: new Date(),
        },
      },
      { new: true }
    ).lean();
    res.json({ ok: true, data: updated });
  } catch (err) {
    next(err);
  }
};

notificationRouter.post('/:id/acknowledge', markNotificationRead);
notificationRouter.patch('/:id/read', markNotificationRead);
