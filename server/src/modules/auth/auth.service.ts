// server/src/modules/auth/auth.service.ts
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import { UserModel, RoleModel } from '../../models';
import { getEffectiveRolePermissions } from './rolePermissions';

export class AuthService {
  async login(email: string, passwordPlain: string, req: Request) {
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    if (
      !user ||
      !user.isActive ||
      (user.expiresAt !== null && user.expiresAt !== undefined && user.expiresAt <= new Date())
    ) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const validPassword = await argon2.verify(user.passwordHash, passwordPlain);
    if (!validPassword) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const role = await RoleModel.findById(user.roleId).lean();
    if (!role || !role.isActive) {
      throw AppError.forbidden('Assigned role is inactive');
    }
    const permissions = getEffectiveRolePermissions(role.name, role.permissions);

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { sub: String(user._id), role: role.name, tokenVersion: user.tokenVersion ?? 0 },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    await recordAudit({
      req,
      actorId: user._id,
      actorRole: role.name,
      module: 'auth',
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user._id,
      entityRef: user.email,
      reason: 'User login',
    });

    return {
      token,
      user: {
        id: String(user._id),
        email: user.email,
        fullName: user.fullName,
        role: role.name,
        permissions,
        mustChangePassword: user.mustChangePassword ?? false,
        avatarAttachmentId: user.avatarAttachmentId ?? null,
      },
    };
  }
}

export const authService = new AuthService();