// server/src/modules/shipment/shipment.routes.ts
import { Router } from 'express';
import { ShipmentController } from './shipment.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { CreateShipmentLotSchema, SHIPMENT_LOT_STATUSES } from '../../../../shared/src/schemas/outbound';
import { ReasonSchema } from '../../../../shared/src/schemas/common';
import { z } from 'zod';

export const shipmentRouter: Router = Router();
const ShipmentStatusTransitionSchema = z.object({
  targetStatus: z.enum(SHIPMENT_LOT_STATUSES),
  reason: ReasonSchema,
});

shipmentRouter.use(authenticate);

shipmentRouter.get('/', requirePermission('shipments:read'), ShipmentController.list);

shipmentRouter.post(
  '/',
  requirePermission('shipments:write'),
  requireReason,
  validateBody(CreateShipmentLotSchema),
  ShipmentController.create
);

shipmentRouter.post(
  '/:id/status',
  requirePermission('qa:approve'),
  requireReason,
  validateBody(ShipmentStatusTransitionSchema),
  ShipmentController.transitionStatus
);