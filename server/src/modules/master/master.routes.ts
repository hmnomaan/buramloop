// server/src/modules/master/master.routes.ts
import { Router } from 'express';
import { masterController } from './master.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission, requireAdminOnly } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { UpsertCustomerSchema, UpsertStockThresholdSchema } from '../../../../shared/src/schemas/outbound';
import { UpsertMaterialSchema } from '../../../../shared/src/schemas/master';

export const masterRouter: Router = Router();

masterRouter.use(authenticate);

// Roles & Users (Admin only + mandatory reason)
masterRouter.get('/roles', requirePermission('roles:read', 'master:read'), (req, res, next) =>
  masterController.getRoles(req, res, next)
);
masterRouter.post('/roles', requireAdminOnly, requireReason, (req, res, next) =>
  masterController.saveRole(req, res, next)
);
masterRouter.put('/roles/:id', requireAdminOnly, requireReason, (req, res, next) =>
  masterController.saveRole(req, res, next)
);

masterRouter.get('/users', requirePermission('users:read', 'master:read'), (req, res, next) =>
  masterController.getUsers(req, res, next)
);
masterRouter.post('/users', requireAdminOnly, requireReason, (req, res, next) =>
  masterController.saveUser(req, res, next)
);
masterRouter.put('/users/:id', requireAdminOnly, requireReason, (req, res, next) =>
  masterController.saveUser(req, res, next)
);

// Materials & Quality Grades
masterRouter.get('/materials', (req, res, next) => masterController.getMaterials(req, res, next));
masterRouter.post('/materials', requirePermission('master:write'), requireReason, validateBody(UpsertMaterialSchema), (req, res, next) =>
  masterController.saveMaterial(req, res, next)
);
masterRouter.put('/materials/:id', requirePermission('master:write'), requireReason, validateBody(UpsertMaterialSchema), (req, res, next) =>
  masterController.saveMaterial(req, res, next)
);

masterRouter.get('/quality-grades', (req, res, next) => masterController.getQualityGrades(req, res, next));
masterRouter.post('/quality-grades', requirePermission('master:write'), requireReason, (req, res, next) =>
  masterController.saveQualityGrade(req, res, next)
);
masterRouter.put('/quality-grades/:id', requirePermission('master:write'), requireReason, (req, res, next) =>
  masterController.saveQualityGrade(req, res, next)
);

// Suppliers & Customers (1-3 allowedCountries rule enforced)
masterRouter.get('/suppliers', (req, res, next) => masterController.getSuppliers(req, res, next));
masterRouter.post('/suppliers', requirePermission('master:write', 'sourcing:write'), requireReason, (req, res, next) =>
  masterController.saveSupplier(req, res, next)
);
masterRouter.put('/suppliers/:id', requirePermission('master:write', 'sourcing:write'), requireReason, (req, res, next) =>
  masterController.saveSupplier(req, res, next)
);

masterRouter.get('/customers', (req, res, next) => masterController.getCustomers(req, res, next));
masterRouter.post(
  '/customers',
  requirePermission('master:write', 'shipments:write'),
  requireReason,
  validateBody(UpsertCustomerSchema),
  (req, res, next) => masterController.saveCustomer(req, res, next)
);
masterRouter.put(
  '/customers/:id',
  requirePermission('master:write', 'shipments:write'),
  requireReason,
  validateBody(UpsertCustomerSchema),
  (req, res, next) => masterController.saveCustomer(req, res, next)
);

// Infrastructure (2x17 Warm Cabinets, Resting Tanks, FillLines, StockThresholds)
masterRouter.get('/infrastructure', (req, res, next) => masterController.getInfrastructure(req, res, next));
masterRouter.post(
  '/stock-thresholds',
  requirePermission('master:write'),
  requireReason,
  validateBody(UpsertStockThresholdSchema),
  (req, res, next) => masterController.saveStockThreshold(req, res, next)
);

// Sequence Counters (Admin override with mandatory reason)
// Admin-only endpoints for listing and overriding sequence counters
masterRouter.get('/counters', requireAdminOnly, (req, res, next) => masterController.getCounters(req, res, next));
masterRouter.post('/counters/override', requireAdminOnly, requireReason, (req, res, next) =>
  masterController.overrideCounter(req, res, next)
);