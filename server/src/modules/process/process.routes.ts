// server/src/modules/process/process.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { ProcessController } from './process.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { SEVEN_STAGE_SEQUENCE } from './process.service';

const ExecuteStageBodySchema = z.object({
  batchId: z.string().trim().min(1),
  stage: z.enum(['WARMING', 'FILTERING', 'BLENDING', 'FILLING']),
  sevenStageTarget: z.enum(SEVEN_STAGE_SEQUENCE),
  inKg: z.coerce.number().positive(),
  outKg: z.coerce.number().nonnegative(),
  lossKg: z.coerce.number().nonnegative().default(0),
  reworkOutKg: z.coerce.number().nonnegative().default(0),
  tempC: z.coerce.number().min(0).max(100),
  personInChargeName: z.string().trim().min(1),
  tankCode: z.string().trim().optional(),
  fillLineCode: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
  attachmentIds: z.array(z.string()).optional(),
  reason: z.string().trim().optional(),
});

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
    validateBody(ExecuteStageBodySchema),
    ProcessController.executeStage
  );
}
