// server/src/modules/attachment/attachment.controller.ts
import { Request, Response, NextFunction } from 'express';
import { UploadAttachmentMetaSchema } from '@buramloop/shared';
import { AppError } from '../../common/errors';
import { getAuditActor } from '../../common/audit.helper';
import { AttachmentService } from './attachment.service';

export class AttachmentController {
  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as Request & {
        file?: Parameters<typeof AttachmentService.uploadAttachment>[1];
      }).file;
      // Validate that a file is provided 
      if (!file) {
        throw AppError.badRequest('Multipart file field "file" is required');
      }
      const parsedMeta = UploadAttachmentMetaSchema.safeParse(req.body);
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
          entityType: req.query.entityType as string | undefined,
          entityId: req.query.entityId as string | undefined,
          docType: req.query.docType as string | undefined,
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
        String(req.body.reason),
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