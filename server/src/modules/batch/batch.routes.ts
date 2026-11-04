// server/src/modules/batch/batch.routes.ts
import { Router } from 'express';
import { BatchController } from './batch.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';

export const batchRouter:Router = Router();

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
  BatchController.simulate
);

batchRouter.post(
  '/reserve',
  requirePermission('batches:approve', 'batches:write'),
  requireReason,
  BatchController.approveAndReserve
);