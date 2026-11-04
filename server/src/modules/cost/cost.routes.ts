// server/src/modules/cost/cost.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { CostController } from './cost.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission, requireAdminOnly } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { ObjectIdSchema } from '../../../../shared/src/schemas/common';

const GenerateCostReportBodySchema = z.object({
  batchId: ObjectIdSchema,
  sellingPricePerKgEur: z.coerce.number().positive(),
  processingOverheadEur: z.coerce.number().nonnegative().default(0),
  packagingCostEur: z.coerce.number().nonnegative().default(0),
  managementRecipients: z.array(z.string()).default([]),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().optional(),
});

export const costRouter: Router = Router();

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
  validateBody(GenerateCostReportBodySchema),
  CostController.generate
);
