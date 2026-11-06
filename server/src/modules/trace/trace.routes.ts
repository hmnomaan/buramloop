// server/src/modules/trace/trace.routes.ts
import { Router } from 'express';
import { TraceController } from './trace.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';

export const traceRouter: Router = Router();

traceRouter.use(authenticate);

traceRouter.get(
  '/suggestions',
  requirePermission('trace:read'),
  TraceController.listSuggestions
);

traceRouter.get('/', requirePermission('trace:read'), TraceController.lookup);
traceRouter.get('/:code', requirePermission('trace:read'), TraceController.lookup);

// IFS Food v8 Clause 4.18.2 Regulatory Hold ("Charge sofort sperren")
traceRouter.post(
  '/:code/regulatory-hold',
  requirePermission('qa:approve', 'management:approve', 'stock:write'),
  requireReason,
  TraceController.placeRegulatoryHold
);
