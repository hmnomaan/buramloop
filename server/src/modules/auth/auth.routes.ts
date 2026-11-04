import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import argon2 from 'argon2';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CreateUserSchema } from '@buramloop/shared';
import { UserModel, RoleModel, AttachmentModel } from '../../models';
import { authController, LoginBodySchema } from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdminOnly } from '../../middlewares/rbac.middleware';
import { requireReason } from '../../middlewares/reason.middleware';
import { validateBody } from '../../common/validate.middleware';
import { getAuditActor, recordAudit } from '../../common/audit.helper';
import { AppError } from '../../common/errors';
import { withTransaction } from '../../config/db';
import { AttachmentService } from '../attachment/attachment.service';

export const authRouter: Router = Router();

const authRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function createAuthRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${req.path}:${req.ip || req.socket?.remoteAddress || 'local'}:${String(req.body?.email || '').toLowerCase()}`;
    const now = Date.now();
    const bucket = authRateLimitBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      authRateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return next(
        new AppError(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Too many authentication attempts. Please wait before trying again.'
        )
      );
    }
    return next();
  };
}

const loginRateLimiter = createAuthRateLimiter(20, 15 * 60 * 1000);
const passwordChangeRateLimiter = createAuthRateLimiter(10, 15 * 60 * 1000);

const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).max(128),
  })
  .strict();

const ProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    avatarAttachmentId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required.');

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(AppError.badRequest('PROFILE_IMAGE_TYPE_INVALID', 'Use a JPEG, PNG, or WebP image.'));
      return;
    }
    callback(null, true);
  },
});

function handleProfileImageUpload(req: Request, res: Response, next: NextFunction) {
  profileImageUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(
        AppError.badRequest(
          'PROFILE_IMAGE_UPLOAD_INVALID',
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Profile pictures must be 5 MB or smaller.'
            : 'Upload one profile picture using the file field.'
        )
      );
      return;
    }
    next(err);
  });
}

function hasValidImageSignature(file: Express.Multer.File): boolean {
  const { buffer, mimetype } = file;
  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  return (
    mimetype === 'image/webp' &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

authRouter.post('/login', loginRateLimiter, validateBody(LoginBodySchema), (req, res, next) =>
  authController.login(req, res, next)
);
authRouter.post('/logout', authenticate, (req, res) => authController.logout(req, res));
authRouter.get('/me', authenticate, (req, res) => authController.me(req, res));

authRouter.patch(
  '/change-password',
  authenticate,
  passwordChangeRateLimiter,
  validateBody(PasswordChangeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = PasswordChangeSchema.parse(req.body);
      const actor = getAuditActor(req);

      await withTransaction(async (session) => {
        const user = await UserModel.findById(actor.userId).select('+passwordHash').session(session);
        if (!user) throw AppError.notFound('User', String(actor.userId));

        if (!(await argon2.verify(user.passwordHash, currentPassword))) {
          throw AppError.badRequest(
            'INVALID_CURRENT_PASSWORD',
            'Current password is incorrect.'
          );
        }

        user.passwordHash = await argon2.hash(newPassword);
        user.mustChangePassword = false;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        await user.save({ session });

        await recordAudit({
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'auth',
          action: 'CHANGE_OWN_PASSWORD',
          entityType: 'USER',
          entityId: user._id,
          entityRef: user.email,
          reason: 'User self-service password change',
          session,
        });
      });

      res.json({ ok: true, message: 'Password updated. Sign in again with your new password.' });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.patch(
  '/profile',
  authenticate,
  validateBody(ProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changes = ProfileSchema.parse(req.body);
      const actor = getAuditActor(req);
      const updated = await withTransaction(async (session) => {
        const user = await UserModel.findById(actor.userId).session(session);
        if (!user) throw AppError.notFound('User', String(actor.userId));

        if (changes.avatarAttachmentId) {
          const avatar = await AttachmentModel.findOne({
            _id: changes.avatarAttachmentId,
            entityType: 'USER',
            entityId: user._id,
            docType: 'PROFILE_IMAGE',
            status: 'ACTIVE',
          }).session(session);
          if (!avatar) {
            throw AppError.badRequest(
              'INVALID_PROFILE_IMAGE',
              'The selected profile image is not attached to this user.'
            );
          }
          user.avatarAttachmentId = avatar._id;
        } else if (changes.avatarAttachmentId === null) {
          user.avatarAttachmentId = null;
        }

        if (changes.fullName !== undefined) user.fullName = changes.fullName;
        await user.save({ session });

        await recordAudit({
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'auth',
          action: 'UPDATE_OWN_PROFILE',
          entityType: 'USER',
          entityId: user._id,
          entityRef: user.email,
          after: {
            fullName: user.fullName,
            avatarAttachmentId: user.avatarAttachmentId,
          },
          reason: 'User self-service profile update',
          session,
        });

        return {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatarAttachmentId: user.avatarAttachmentId,
        };
      });

      res.json({ ok: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.get(
  '/profile/avatar',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = getAuditActor(req);
      const user = await UserModel.findById(actor.userId).select('avatarAttachmentId');
      if (!user?.avatarAttachmentId) throw AppError.notFound('Profile image');

      const { attachment, stream, sizeBytes } = await AttachmentService.getDownloadStream(
        String(user.avatarAttachmentId),
        actor
      );
      if (
        attachment.entityType !== 'USER' ||
        String(attachment.entityId) !== String(user._id) ||
        attachment.docType !== 'PROFILE_IMAGE'
      ) {
        throw AppError.forbidden('Profile image is not available to this account.');
      }

      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, no-store');
      if (sizeBytes !== undefined) res.setHeader('Content-Length', String(sizeBytes));
      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  '/profile/avatar',
  authenticate,
  handleProfileImageUpload,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file || !hasValidImageSignature(file)) {
        throw AppError.badRequest(
          'PROFILE_IMAGE_INVALID',
          'Upload a valid JPEG, PNG, or WebP image.'
        );
      }

      const actor = getAuditActor(req);
      const user = await UserModel.findById(actor.userId).select('_id email');
      if (!user) throw AppError.notFound('User', String(actor.userId));

      const attachment = await AttachmentService.uploadAttachment(
        {
          entityType: 'USER',
          entityId: String(user._id),
          entityCode: String(user._id),
          docType: 'PROFILE_IMAGE',
          adminOnly: false,
          reason: 'User uploaded a profile image',
        },
        file,
        actor
      );

      try {
        const updated = await withTransaction(async (session) => {
          const currentUser = await UserModel.findById(user._id).session(session);
          if (!currentUser) throw AppError.notFound('User', String(actor.userId));
          currentUser.avatarAttachmentId = new Types.ObjectId(attachment._id);
          await currentUser.save({ session });

          await recordAudit({
            actorId: actor.userId,
            actorRole: actor.roleName,
            module: 'auth',
            action: 'UPDATE_OWN_AVATAR',
            entityType: 'USER',
            entityId: currentUser._id,
            entityRef: currentUser.email,
            after: { avatarAttachmentId: attachment._id },
            reason: 'User uploaded a profile image',
            session,
          });
          return currentUser.avatarAttachmentId;
        });
        res.status(201).json({ ok: true, data: { avatarAttachmentId: updated } });
      } catch (err) {
        await AttachmentService.voidAttachment(
          String(attachment._id),
          'Profile image could not be assigned to user profile',
          actor
        );
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

authRouter.get(
  '/users',
  authenticate,
  requireAdminOnly,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await UserModel.find()
        .select('-passwordHash')
        .populate('roleId', 'name')
        .sort({ createdAt: -1 })
        .lean();
      res.json({ ok: true, data: users });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  '/users',
  authenticate,
  requireAdminOnly,
  requireReason,
  validateBody(CreateUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = CreateUserSchema.parse(req.body);
      const actor = getAuditActor(req);
      const createdUser = await withTransaction(async (session) => {
        const email = input.email.toLowerCase();
        const existing = await UserModel.findOne({ email }).session(session);
        if (existing) {
          throw AppError.conflict('USER_EMAIL_EXISTS', `User ${email} already exists.`);
        }

        const role = await RoleModel.findOne({ name: input.roleName, isActive: true }).session(
          session
        );
        if (!role) throw AppError.notFound('Active role', input.roleName);

        const [user] = await UserModel.create(
          [
            {
              email,
              fullName: input.name,
              passwordHash: await argon2.hash(input.password),
              roleId: role._id,
              expiresAt: input.expiresAt ?? null,
              mustChangePassword: true,
              isActive: true,
              createdBy: new Types.ObjectId(actor.userId),
            },
          ],
          { session }
        );

        await recordAudit({
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'users',
          action: role.name === 'Admin' ? 'CREATE_ADMIN_USER' : 'CREATE_USER',
          entityType: 'USER',
          entityId: user._id,
          entityRef: user.email,
          after: {
            email: user.email,
            fullName: user.fullName,
            roleName: role.name,
            mustChangePassword: true,
          },
          reason: input.reason,
          session,
        });

        return {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roleName: role.name,
          mustChangePassword: user.mustChangePassword,
        };
      });

      res.status(201).json({ ok: true, data: createdUser });
    } catch (err) {
      next(err);
    }
  }
);
