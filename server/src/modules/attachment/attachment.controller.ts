// server/src/modules/attachment/attachment.controller.ts
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { UploadAttachmentMetaSchema } from '@buramloop/shared';
import { AppError } from '../../common/errors';
import { getAuditActor } from '../../common/audit.helper';
import { getStorageProvider } from '../../storage';
import { AttachmentService } from './attachment.service';

export class AttachmentController {
  static async health(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await getStorageProvider().healthCheck();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as Request & {
        file?: Parameters<typeof AttachmentService.uploadAttachment>[1];
      }).file;
      if (!file) {
        throw AppError.badRequest('Multipart file field "file" is required');
      }

      const fallbackEntityId =
        req.body?.entityId ||
        crypto
          .createHash('md5')
          .update(`${req.body?.entityType || 'ENTITY'}:${req.body?.entityCode || 'UNKNOWN'}`)
          .digest('hex')
          .slice(0, 24);

      const parsedMeta = UploadAttachmentMetaSchema.safeParse({
        ...req.body,
        entityId: fallbackEntityId,
      });
      if (!parsedMeta.success) {
        throw AppError.validation(parsedMeta.error.errors.map((e) => e.message).join('; '));
      }

      const data = await AttachmentService.uploadAttachment(
        parsedMeta.data,
        file,
        getAuditActor(req)
      );
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AttachmentService.listAttachments(
        {
          entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
          entityId: typeof req.query.entityId === 'string' ? req.query.entityId : undefined,
          entityCode: typeof req.query.entityCode === 'string' ? req.query.entityCode : undefined,
          docType: typeof req.query.docType === 'string' ? req.query.docType : undefined,
          includeVoid: req.query.includeVoid === 'true',
        },
        getAuditActor(req)
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async download(req: Request, res: Response, next: NextFunction) {
    try {
      const { attachment, stream, sizeBytes } = await AttachmentService.getDownloadStream(
        String(req.params.id),
        getAuditActor(req)
      );

      const safeName = encodeURIComponent((attachment as any).originalName || 'document');
      res.setHeader('Content-Type', (attachment as any).mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      if (sizeBytes !== undefined) {
        res.setHeader('Content-Length', String(sizeBytes));
      }

      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  static async voidAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AttachmentService.voidAttachment(
        String(req.params.id),
        String(req.body.reason || (req as any).auditReason || req.headers['x-audit-reason'] || ''),
        getAuditActor(req)
      );
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async checkIntegrity(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AttachmentService.verifyStorageIntegrity();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
}
