// server/src/modules/sourcing/sourcing.routes.ts
import { Router } from 'express';
import { sourcingController } from './sourcing.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { AppError } from '../../common/errors';
import { canRoleViewPrices } from '../../common/price-strip.helper';
import {
  CreateContractFromSourcingSchema,
  CreateSourcingSchema,
  CreateSupplierLeadSchema,
  EvaluateSourcingGateSchema,
  UpdateSupplierLeadStatusSchema,
} from '../../../../shared/src/schemas/purchase';

export const sourcingRouter: Router = Router();

sourcingRouter.use(authenticate);

const requireCommercialRole = (
  req: import('express').Request,
  _res: import('express').Response,
  next: import('express').NextFunction
) => {
  if (!canRoleViewPrices(req.user?.roleName ?? '')) {
    return next(
      AppError.forbidden('Commercial sourcing data is restricted to Admin and Management.')
    );
  }
  next();
};

// Permanent source/supplier lead directory. Holds and rejected offers remain queryable.
sourcingRouter.get(
  '/leads',
  requirePermission('sourcing:read', 'management:view', 'qa:approve'),
  (req, res, next) => sourcingController.listLeads(req, res, next)
);
sourcingRouter.post(
  '/leads',
  requirePermission('sourcing:write', 'management:approve', 'master:write'),
  requireReason,
  validateBody(CreateSupplierLeadSchema),
  (req, res, next) => sourcingController.createLead(req, res, next)
);
sourcingRouter.patch(
  '/leads/:id/status',
  requirePermission('sourcing:write', 'management:approve'),
  requireReason,
  validateBody(UpdateSupplierLeadStatusSchema),
  (req, res, next) => sourcingController.updateLeadStatus(req, res, next)
);

// Sourcing board & creation
sourcingRouter.get('/', requirePermission('sourcing:read', 'management:view', 'qa:approve'), (req, res, next) =>
  sourcingController.list(req, res, next)
);
sourcingRouter.post(
  '/',
  requirePermission('sourcing:write', 'management:approve'),
  requireReason,
  validateBody(CreateSourcingSchema),
  (req, res, next) => sourcingController.create(req, res, next)
);

// Shipped contracts are the source for incoming-lot receipt autofill.
sourcingRouter.get(
  '/contracts',
  requirePermission('stock:read', 'sourcing:read', 'management:view'),
  (req, res, next) => sourcingController.listShippedContracts(req, res, next)
);

// Gate permissions are checked in the service for each gate.
sourcingRouter.post('/:id/gates', requireReason, validateBody(EvaluateSourcingGateSchema), (req, res, next) =>
  sourcingController.evaluateGate(req, res, next)
);

// Contract creation (only from PASSED sourcing) & Shipped status
sourcingRouter.post(
  '/:id/contracts',
  requirePermission('contracts:write', 'management:approve', 'sourcing:write'),
  requireReason,
  validateBody(CreateContractFromSourcingSchema),
  (req, res, next) => sourcingController.createContract(req, res, next)
);
sourcingRouter.post(
  '/contracts/:contractId/ship',
  requirePermission('contracts:write', 'management:approve', 'sourcing:write'),
  requireReason,
  (req, res, next) => sourcingController.markShipped(req, res, next)
);

// Commercial sourcing prices [R9]
sourcingRouter.get(
  '/prices',
  requirePermission('sourcing:read', 'management:approve'),
  requireCommercialRole,
  (req, res, next) =>
  sourcingController.listPrices(req, res, next)
);
sourcingRouter.post(
  '/prices',
  requirePermission('sourcing:write', 'management:approve'),
  requireCommercialRole,
  requireReason,
  (req, res, next) => sourcingController.createPrice(req, res, next)
);