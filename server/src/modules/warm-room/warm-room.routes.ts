// server/src/modules/warm-room/warm-room.routes.ts
import { Router } from 'express';
import { WarmRoomController } from './warm-room.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';

export const warmRoomRouter :Router = Router();

warmRoomRouter.use(authenticate);

warmRoomRouter.get('/', requirePermission('warmroom:read'), WarmRoomController.list);

warmRoomRouter.post(
  '/check-in',
  requirePermission('warmroom:write'),
  requireReason,
  WarmRoomController.checkIn
);

warmRoomRouter.post(
  '/check-out',
  requirePermission('warmroom:write'),
  requireReason,
  WarmRoomController.checkOut
);