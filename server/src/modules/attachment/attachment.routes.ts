// server/src/modules/attachment/attachment.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { VoidAttachmentSchema } from '@buramloop/shared';
import { authenticate } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { AttachmentController } from './attachment.controller';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max per certificate/report
  },
});

const router = Router();
router.use(authenticate);

router.get('/health', AttachmentController.health);
router.get('/', requirePermission('attachments:read'), AttachmentController.list);
router.get(
  '/integrity-check',
  requirePermission('attachments:read'),
  AttachmentController.checkIntegrity
);
router.get('/:id/download', requirePermission('attachments:read'), AttachmentController.download);

router.post(
  '/upload',
  requirePermission('attachments:write'),
  uploadMiddleware.single('file'),
  AttachmentController.upload
);

router.post(
  '/:id/void',
  requirePermission('attachments:write'),
  requireReason,
  validateBody(VoidAttachmentSchema),
  AttachmentController.voidAttachment
);

export const attachmentRoutes: Router = router;
