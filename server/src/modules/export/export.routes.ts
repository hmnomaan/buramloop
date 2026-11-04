// server/src/modules/export/export.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { ExportController } from './export.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { validateBody } from '../../common/validate.middleware';

const RunExportSchema = z.object({
  dataset: z
    .enum(['DRUM_STOCK', 'BATCHES_PROCESS', 'SHIPMENT_LOTS', 'DRUMS', 'BATCHES'])
    .default('DRUM_STOCK')
    .transform((val) => {
      if (val === 'DRUMS') return 'DRUM_STOCK' as const;
      if (val === 'BATCHES') return 'BATCHES_PROCESS' as const;
      return val;
    }),
  format: z
    .enum(['CSV', 'PRINT_JSON', 'PRINT'])
    .default('CSV')
    .transform((val) => (val === 'PRINT' ? ('PRINT_JSON' as const) : val)),
  saveToNextcloud: z.boolean().default(false),
  filters: z.record(z.unknown()).optional(),
  reason: z.string().trim().optional(),
});

export const exportRouter: Router = Router();

exportRouter.use(authenticate);

exportRouter.get('/logs', requirePermission('exports:run'), ExportController.listLogs);
exportRouter.post('/run', requirePermission('exports:run'), validateBody(RunExportSchema), ExportController.runExport);
