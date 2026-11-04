// server/src/modules/trace/trace.routes.ts
import { Router } from 'express';
import { TraceController } from './trace.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';

export const traceRouter : Router= Router();

traceRouter.use(authenticate);

// Accessible to Staff and Government Inspector role (trace:read)
traceRouter.get('/', requirePermission('trace:read'), TraceController.lookup);
traceRouter.get('/:code', requirePermission('trace:read'), TraceController.lookup);