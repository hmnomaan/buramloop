// server/src/modules/warm-room/warm-room.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { WarmRoomController } from './warm-room.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { WARM_OUT_DESTINATIONS } from '../../../../shared/src/schemas/production';

const CheckInDrumBodySchema = z.object({
  cabinetCode: z.enum(['CAB-01', 'CAB-02']),
  slotNo: z.coerce.number().int().min(1).max(17),
  drumId: z.string().trim().min(1),
  batchId: z.string().trim().optional(),
  targetTempC: z.coerce.number().min(20).max(75).optional(),
  warmingHours: z.coerce.number().min(1).max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  reason: z.string().trim().optional(),
});

const CheckOutDrumBodySchema = z.object({
  cabinetCode: z.enum(['CAB-01', 'CAB-02']),
  slotNo: z.coerce.number().int().min(1).max(17),
  destination: z.enum(WARM_OUT_DESTINATIONS),
  notes: z.string().trim().max(500).optional(),
  reason: z.string().trim().optional(),
});

export const warmRoomRouter: Router = Router();

warmRoomRouter.use(authenticate);

warmRoomRouter.get('/', requirePermission('warmroom:read'), WarmRoomController.list);

warmRoomRouter.post(
  '/check-in',
  requirePermission('warmroom:write'),
  requireReason,
  validateBody(CheckInDrumBodySchema),
  WarmRoomController.checkIn
);

warmRoomRouter.post(
  '/check-out',
  requirePermission('warmroom:write'),
  requireReason,
  validateBody(CheckOutDrumBodySchema),
  WarmRoomController.checkOut
);
