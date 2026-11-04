// server/src/modules/export/export.routes.ts
import { Router } from 'express';
import { ExportController } from './export.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';

export const exportRouter:Router = Router();

exportRouter.use(authenticate);

exportRouter.get('/logs', requirePermission('exports:run'), ExportController.listLogs);
exportRouter.post('/run', requirePermission('exports:run'), ExportController.runExport);