// server/src/modules/batch/batch.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { BatchController } from './batch.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { ObjectIdSchema } from '../../../../shared/src/schemas/common';

const SimulateFeasibilityBodySchema = z.object({
  customerId: ObjectIdSchema,
  targetKg: z.coerce.number().positive(),
  materialId: ObjectIdSchema,
  includeReworkIds: z.array(ObjectIdSchema).default([]),
});

const ReserveBatchBodySchema = z.object({
  customerId: ObjectIdSchema,
  materialId: ObjectIdSchema,
  plannedKg: z.coerce.number().positive(),
  includeReworkIds: z.array(ObjectIdSchema).default([]),
  reason: z.string().trim().optional(),
});

export const batchRouter: Router = Router();

batchRouter.use(authenticate);

batchRouter.get('/', requirePermission('batches:read'), BatchController.list);

batchRouter.get(
  '/rework-available',
  requirePermission('batches:read', 'rework:read'),
  BatchController.listAvailableRework
);

batchRouter.get(
  '/stock-availability',
  requirePermission('batches:read', 'stock:read'),
  BatchController.listStockAvailability
);

batchRouter.post(
  '/simulate-feasibility',
  requirePermission('batches:read'),
  validateBody(SimulateFeasibilityBodySchema),
  BatchController.simulate
);

batchRouter.post(
  '/reserve',
  requirePermission('batches:approve', 'batches:write'),
  requireReason,
  validateBody(ReserveBatchBodySchema),
  BatchController.approveAndReserve
);
