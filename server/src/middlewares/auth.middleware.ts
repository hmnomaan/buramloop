// server/src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../common/errors';
import { UserModel, RoleModel } from '../models';
import { getEffectiveRolePermissions } from '../modules/auth/rolePermissions';

export interface AuthUserContext {
  userId: Types.ObjectId;
  email: string;
  fullName: string;
  roleName: string;
  permissions: string[];
  isAdmin: boolean;
  isInspector: boolean;
  mustChangePassword: boolean;
  avatarAttachmentId?: Types.ObjectId | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserContext;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token =
      req.cookies?.buramloop_token ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);

    if (!token) {
      throw AppError.unauthorized('Missing authentication token');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.sub !== 'string' ||
      !Types.ObjectId.isValid(decoded.sub)
    ) {
      throw AppError.unauthorized('Invalid authentication token');
    }

    const user = await UserModel.findById(decoded.sub).lean();
    if (
      !user ||
      !user.isActive ||
      (user.expiresAt !== null && user.expiresAt !== undefined && user.expiresAt <= new Date())
    ) {
      throw AppError.unauthorized('User account is inactive, expired, or does not exist');
    }
    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw AppError.unauthorized('Session has expired; sign in again.');
    }

    const role = await RoleModel.findById(user.roleId).lean();
    if (!role || !role.isActive) {
      throw AppError.forbidden('Assigned role is inactive');
    }
    const permissions = getEffectiveRolePermissions(role.name, role.permissions);

    req.user = {
      userId: new Types.ObjectId(String(user._id)),
      email: user.email,
      fullName: user.fullName,
      roleName: role.name,
      permissions,
      isAdmin: role.name === 'Admin' || permissions.includes('*:*'),
      isInspector: role.name === 'Inspector',
      mustChangePassword: user.mustChangePassword ?? false,
      avatarAttachmentId: user.avatarAttachmentId ?? null,
    };

    const allowedDuringPasswordSetup = [
      '/auth/me',
      '/auth/logout',
      '/auth/change-password',
    ].some((suffix) => req.originalUrl.split('?')[0].endsWith(suffix));
    if (req.user.mustChangePassword && !allowedDuringPasswordSetup) {
      throw AppError.forbidden('Change the temporary password before using the application.');
    }

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    if (
      err instanceof Error &&
      ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)
    ) {
      return next(AppError.unauthorized('Invalid or expired session token'));
    }
    return next(err);
  }
}