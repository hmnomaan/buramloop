// server/src/common/audit.helper.ts
import { ClientSession, Types } from 'mongoose';
import { Request } from 'express';
import type { AuthUserContext } from '../middlewares/auth.middleware';
import { AppError } from './errors';
import { AuditLogModel } from '../models';

export interface AuditActor {
  userId: Types.ObjectId | string;
  roleName: string;
}

export interface RecordAuditParams {
  req?: Request;
  actorId: Types.ObjectId | string;
  actorRole: string;
  module: string;
  action: string;
  entityType: string;
  entityId: Types.ObjectId | string;
  entityRef?: string; // e.g., lotNo, processNo, shipmentLotNo
  before?: unknown;
  after?: unknown;
  reason?: string;
  session?: ClientSession;
}

export function getAuditActor(req: Request): AuthUserContext {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user;
}

/**
 * Appends an immutable AuditLog entry (inside the active MongoDB transaction session when provided).
 */
export async function recordAudit(params: RecordAuditParams): Promise<void> {
  const doc = {
    actorId: new Types.ObjectId(String(params.actorId)),
    actorRole: params.actorRole,
    module: params.module,
    action: params.action,
    entityType: params.entityType,
    entityId: new Types.ObjectId(String(params.entityId)),
    entityRef: params.entityRef ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
    reason: params.reason ?? null,
    ipAddress: params.req?.ip ?? null,
    userAgent: params.req?.headers['user-agent'] ?? null,
  };

  if (params.session) {
    await AuditLogModel.create([doc], { session: params.session });
  } else {
    await AuditLogModel.create(doc);
  }
}