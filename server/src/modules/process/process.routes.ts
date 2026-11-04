// server/src/modules/process/process.routes.ts
import { Router } from 'express';
import { ProcessController } from './process.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';

export const processRouter: Router = Router();

processRouter.use(authenticate);

// GET /api/v1/production/process
processRouter.get(
  '/',
  requirePermission('processing:read'),
  ProcessController.list
);

// POST /api/v1/production/process/stage
for (const path of ['/stage', '/step']) {
  processRouter.post(
    path,
    requirePermission('processing:write'),
    requireReason,
    ProcessController.executeStage
  );
}