// server/src/modules/attachment/attachment.service.ts
import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  ENTITY_AREA_FOLDER_MAP,
  UploadAttachmentMetaInput,
} from '@buramloop/shared';
import { AttachmentModel } from '../../models';
import { withTransaction } from '../../config/db';
import { getStorageProvider } from '../../storage';
import { AppError } from '../../common/errors';
import { AuditActor, recordAudit } from '../../common/audit.helper';

export class AttachmentService {
  /**
   * Two-phase upload:
   * Phase 1: Write binary to StorageProvider (Nextcloud or Local) with SHA-256 checksum.
   * Phase 2: Save Attachment document + AuditLog inside MongoDB ACID transaction.
   * Compensation: If Phase 2 fails, delete the uploaded binary from StorageProvider immediately.
   */
  static async uploadAttachment(
    meta: UploadAttachmentMetaInput,
    file: Express.Multer.File,
    actor: AuditActor
  ) {
    if (!file || !file.buffer || file.buffer.byteLength === 0) {
      throw AppError.badRequest('Uploaded file buffer is empty');
    }

    const isAdminOnly =
      meta.adminOnly ||
      meta.entityType === 'COST_REPORT' ||
      meta.docType === 'MANAGEMENT_COST_REPORT';

    if (isAdminOnly && actor.roleName !== 'Admin' && actor.roleName !== 'Management') {
      throw AppError.forbidden('Only Admin or Management can upload admin-restricted documents');
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const safeOriginalName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-100);
    const areaFolder = ENTITY_AREA_FOLDER_MAP[meta.entityType] || 'Misc';
    const uuid = crypto.randomUUID();
    const relativePath = `${areaFolder}/${meta.entityCode}/${meta.docType}/${uuid}-${safeOriginalName}`;

    const storage = getStorageProvider();

    // Phase 1: Put binary into Nextcloud / Local disk
    const putResult = await storage.putObject(
      relativePath,
      file.buffer,
      file.mimetype || 'application/octet-stream',
      sha256
    );

    try {
      // Phase 2: Commit metadata + audit inside MongoDB transaction
      return await withTransaction(async (session) => {
        const [attachment] = await AttachmentModel.create(
          [
            {
              entityType: meta.entityType,
              entityId: new mongoose.Types.ObjectId(meta.entityId),
              entityCode: meta.entityCode,
              docType: meta.docType,
              originalName: file.originalname,
              mimeType: file.mimetype || 'application/octet-stream',
              sizeBytes: putResult.sizeBytes,
              sha256,
              adminOnly: isAdminOnly,
              status: 'ACTIVE',
              storage: {
                provider: putResult.provider,
                path: putResult.path,
                fileId: putResult.fileId,
                etag: putResult.etag,
              },
              notes: meta.notes,
              uploadedBy: new mongoose.Types.ObjectId(actor.userId),
            },
          ],
          { session }
        );

        await recordAudit({
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'attachments',
          action: 'CREATE',
          entityType: 'ATTACHMENT',
          entityId: attachment._id,
          entityRef: meta.entityCode,
          before: null,
          after: {
            entityType: meta.entityType,
            entityId: meta.entityId,
            entityCode: meta.entityCode,
            docType: meta.docType,
            originalName: file.originalname,
            sha256,
            storagePath: putResult.path,
          },
          reason: meta.reason || `Uploaded ${meta.docType} for ${meta.entityCode}`,
          session,
        });

        return attachment.toObject();
      });
    } catch (dbErr) {
      // Compensating action: remove orphan binary from storage provider
      await storage.deleteObject(relativePath);
      throw dbErr;
    }
  }

  /**
   * List attachments for an entity (strips adminOnly attachments for non-Admin/Management users)
   */
  static async listAttachments(
    filters: { entityType?: string; entityId?: string; entityCode?: string; docType?: string; includeVoid?: boolean },
    actor: AuditActor
  ) {
    const query: Record<string, unknown> = {};
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.entityId && mongoose.isValidObjectId(filters.entityId)) {
      query.entityId = new mongoose.Types.ObjectId(filters.entityId);
    }
    if (filters.entityCode) query.entityCode = String(filters.entityCode);
    if (filters.docType) query.docType = filters.docType;
    if (!filters.includeVoid) query.status = 'ACTIVE';

    if (actor.roleName !== 'Admin' && actor.roleName !== 'Management') {
      query.adminOnly = { $ne: true };
    }

    return AttachmentModel.find(query)
      .populate('uploadedBy', 'fullName email roleName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }

  /**
   * Stream download after RBAC & status check
   */
  static async getDownloadStream(attachmentId: string, actor: AuditActor) {
    const attachment = await AttachmentModel.findById(attachmentId).lean();
    if (!attachment) {
      throw AppError.notFound('Attachment not found');
    }

    if ((attachment as any).status === 'VOID') {
      throw AppError.badRequest('Cannot download a VOID attachment');
    }

    if (
      (attachment as any).adminOnly &&
      actor.roleName !== 'Admin' &&
      actor.roleName !== 'Management'
    ) {
      throw AppError.forbidden('Access denied: Admin/Management-only attachment');
    }

    if (
      (attachment as any).docType === 'PROFILE_IMAGE' &&
      String((attachment as any).entityId) !== String(actor.userId) &&
      actor.roleName !== 'Admin'
    ) {
      throw AppError.forbidden('Profile images are private to the account owner and Admin.');
    }

    const storagePath = (attachment as any).storage?.path;
    if (!storagePath) {
      throw AppError.internal('Attachment storage path metadata missing');
    }

    const storage = getStorageProvider();
    const { stream, sizeBytes } = await storage.getObjectStream(storagePath);

    return {
      attachment,
      stream,
      sizeBytes: sizeBytes ?? (attachment as any).sizeBytes,
    };
  }

  /**
   * Void an attachment with mandatory reason (never hard-deletes)
   */
  static async voidAttachment(attachmentId: string, reason: string, actor: AuditActor) {
    return withTransaction(async (session) => {
      const attachment = await AttachmentModel.findById(attachmentId).session(session);
      if (!attachment) {
        throw AppError.notFound('Attachment not found');
      }
      if ((attachment as any).status === 'VOID') {
        throw AppError.badRequest('Attachment is already VOID');
      }

      const before = attachment.toObject();
      (attachment as any).status = 'VOID';
      (attachment as any).voidReason = reason;
      (attachment as any).voidedBy = new mongoose.Types.ObjectId(actor.userId);
      (attachment as any).voidedAt = new Date();
      await attachment.save({ session });

      await recordAudit({
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'attachments',
        action: 'VOID',
        entityType: 'ATTACHMENT',
        entityId: attachment._id,
        entityRef: (attachment as any).entityCode,
        before,
        after: attachment.toObject(),
        reason,
        session,
      });

      return attachment.toObject();
    });
  }

  /**
   * Storage-vs-DB Integrity Job: verifies every ACTIVE Attachment in MongoDB exists on storage
   * using bounded concurrency (batches of 8) to avoid sequential WebDAV latency bottlenecks.
   */
  static async verifyStorageIntegrity() {
    const storage = getStorageProvider();
    const activeAttachments = await AttachmentModel.find({ status: 'ACTIVE' }).lean();

    const missingOrMismatch: Array<{
      attachmentId: string;
      originalName: string;
      storagePath: string;
      expectedBytes: number;
      actualBytes?: number;
      issue: string;
    }> = [];

    const CONCURRENCY_LIMIT = 8;
    for (let i = 0; i < activeAttachments.length; i += CONCURRENCY_LIMIT) {
      const batch = activeAttachments.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(
        batch.map(async (att) => {
          const pathStr = (att as any).storage?.path;
          if (!pathStr) {
            missingOrMismatch.push({
              attachmentId: String(att._id),
              originalName: (att as any).originalName,
              storagePath: '',
              expectedBytes: (att as any).sizeBytes || 0,
              issue: 'Missing storage.path in DB document',
            });
            return;
          }

          const stat = await storage.statObject(pathStr);
          if (!stat.exists) {
            missingOrMismatch.push({
              attachmentId: String(att._id),
              originalName: (att as any).originalName,
              storagePath: pathStr,
              expectedBytes: (att as any).sizeBytes || 0,
              issue: 'File missing in storage provider',
            });
          } else if (
            stat.sizeBytes !== undefined &&
            (att as any).sizeBytes !== undefined &&
            stat.sizeBytes !== (att as any).sizeBytes
          ) {
            missingOrMismatch.push({
              attachmentId: String(att._id),
              originalName: (att as any).originalName,
              storagePath: pathStr,
              expectedBytes: (att as any).sizeBytes,
              actualBytes: stat.sizeBytes,
              issue: 'File byte size mismatch between DB and storage',
            });
          }
        })
      );
    }

    return {
      healthy: missingOrMismatch.length === 0,
      provider: storage.providerName,
      checkedAttachmentsCount: activeAttachments.length,
      discrepanciesCount: missingOrMismatch.length,
      discrepancies: missingOrMismatch,
      checkedAt: new Date().toISOString(),
    };
  }
}
