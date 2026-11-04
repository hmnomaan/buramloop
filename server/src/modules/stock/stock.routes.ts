// server/src/modules/stock/stock.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { ReceiveIncomingLotSchema } from '@buramloop/shared';
// import { Iso2CountrySchema, ObjectIdSchema, ReasonSchema } from '../../common/schemas/common.ts';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { StockController } from './stock.controller';

const Iso2CountrySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const ReasonSchema = z.string().trim().min(1).max(1000);

const ReviewIncomingLotBodySchema = z.object({
  decision: z.enum(['PASSED', 'FAILED']),
  qualityGradeId: ObjectIdSchema.optional().nullable(),
  labReport: z.object({
    labName: z.string().trim().default('QSI Bremen'),
    reportNo: z.string().trim().min(2).max(80),
    moisturePct: z.number().min(0).max(40).optional(),
    hmfMgPerKg: z.number().min(0).max(200).optional(),
    diastaseDn: z.number().min(0).max(100).optional(),
    c4SugarPassed: z.boolean().default(true),
    nmrPassed: z.boolean().default(true),
    attachmentId: ObjectIdSchema.optional().nullable(),
    notes: z.string().trim().max(1000).optional(),
  }),
  reason: ReasonSchema,
});

const ReturnMismatchBodySchema = z.object({
  mismatchDetails: z.string().trim().min(5).max(1000),
  reason: ReasonSchema,
});

const router = Router();
router.use(authenticate);

// Incoming Lots listing & receipt
router.get('/lots', requirePermission('stock:read'), StockController.listIncomingLots);
router.post(
  '/lots/receive',
  requirePermission('stock:write'),
  requireReason,
  validateBody(ReceiveIncomingLotSchema),
  StockController.receiveIncomingLot
);

// QA Review (PASSED / FAILED) & Return to Supplier on Mismatch
router.post(
  '/lots/:id/review',
  requirePermission('qa:approve'),
  requireReason,
  validateBody(ReviewIncomingLotBodySchema),
  StockController.reviewIncomingLot
);
router.post(
  '/lots/:id/return-mismatch',
  requirePermission('stock:write'),
  requireReason,
  validateBody(ReturnMismatchBodySchema),
  StockController.returnLotMismatch
);

// Stock packages, drums, summary & append-only ledger
router.get('/drums', requirePermission('stock:read'), StockController.listDrums);
router.get('/packages', requirePermission('stock:read'), StockController.listStockPackages);
router.get('/summary', requirePermission('stock:read'), StockController.getStockSummary);
router.get('/ledger', requirePermission('stock:read'), StockController.listLedgerMovements);
router.get(
  '/ledger/integrity-check',
  requirePermission('stock:read'),
  StockController.checkLedgerIntegrity
);

export const stockRoutes: Router = router;