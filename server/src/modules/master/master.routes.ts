// server/src/modules/master/master.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { masterController } from './master.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission, requireAdminOnly } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { UpsertCustomerSchema, UpsertStockThresholdSchema } from '../../../../shared/src/schemas/outbound';
import { UpsertMaterialSchema, UpsertQualityGradeSchema } from '../../../../shared/src/schemas/master';
import { ReasonSchema } from '../../../../shared/src/schemas/common';

const UpsertSupplierBodySchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2).max(24),
  name: z.string().trim().min(2).max(160),
  country: z.string().trim().length(2),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  contactPhone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(400).optional(),
  isActive: z.boolean().optional(),
  reason: ReasonSchema,
});

const UpsertRoleBodySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(''),
  permissions: z.array(z.string()).default([]),
  isActive: z.boolean().optional(),
  reason: ReasonSchema,
});

const UpsertUserBodySchema = z.object({
  id: z.string().optional(),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(10).optional(),
  roleId: z.string().trim().min(1),
  isActive: z.boolean().optional(),
  reason: ReasonSchema,
});

const OverrideCounterBodySchema = z.object({
  key: z.string().trim().min(2).max(60),
  seq: z.number().int().min(0),
  prefix: z.string().trim().max(24).optional(),
  reason: ReasonSchema,
});

export const masterRouter: Router = Router();

masterRouter.use(authenticate);

// Roles & Users (Admin only + mandatory reason)
masterRouter.get('/roles', requirePermission('roles:read', 'master:read'), (req, res, next) =>
  masterController.getRoles(req, res, next)
);
masterRouter.post('/roles', requireAdminOnly, requireReason, validateBody(UpsertRoleBodySchema), (req, res, next) =>
  masterController.saveRole(req, res, next)
);
masterRouter.put('/roles/:id', requireAdminOnly, requireReason, validateBody(UpsertRoleBodySchema), (req, res, next) =>
  masterController.saveRole(req, res, next)
);

masterRouter.get('/users', requirePermission('users:read', 'master:read'), (req, res, next) =>
  masterController.getUsers(req, res, next)
);
masterRouter.post('/users', requireAdminOnly, requireReason, validateBody(UpsertUserBodySchema), (req, res, next) =>
  masterController.saveUser(req, res, next)
);
masterRouter.put('/users/:id', requireAdminOnly, requireReason, validateBody(UpsertUserBodySchema), (req, res, next) =>
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
masterRouter.post('/quality-grades', requirePermission('master:write'), requireReason, validateBody(UpsertQualityGradeSchema), (req, res, next) =>
  masterController.saveQualityGrade(req, res, next)
);
masterRouter.put('/quality-grades/:id', requirePermission('master:write'), requireReason, validateBody(UpsertQualityGradeSchema), (req, res, next) =>
  masterController.saveQualityGrade(req, res, next)
);

// Suppliers & Customers (1-3 allowedCountries rule enforced)
masterRouter.get('/suppliers', (req, res, next) => masterController.getSuppliers(req, res, next));
masterRouter.post('/suppliers', requirePermission('master:write', 'sourcing:write'), requireReason, validateBody(UpsertSupplierBodySchema), (req, res, next) =>
  masterController.saveSupplier(req, res, next)
);
masterRouter.put('/suppliers/:id', requirePermission('master:write', 'sourcing:write'), requireReason, validateBody(UpsertSupplierBodySchema), (req, res, next) =>
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
masterRouter.post('/counters/override', requireAdminOnly, requireReason, validateBody(OverrideCounterBodySchema), (req, res, next) =>
  masterController.overrideCounter(req, res, next)
);
