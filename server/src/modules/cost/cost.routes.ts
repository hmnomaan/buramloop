// server/src/modules/cost/cost.routes.ts
import { Router } from 'express';
import { CostController } from './cost.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission, requireAdminOnly } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';

export const costRouter : Router= Router();

costRouter.use(authenticate);

// Admin & Management with reports:read can view cost reports
costRouter.get(
  '/',
  requirePermission('reports:read'),
  CostController.list
);

// Strictly Admin-only generation with mandatory reason
costRouter.post(
  '/generate',
  requireAdminOnly,
  requireReason,
  CostController.generate
);