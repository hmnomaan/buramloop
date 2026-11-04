// server/src/middlewares/reason.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors';

/**
 * Enforces Rule R2 / R14: Every admin create, update, override, or void
 * must supply a non-empty audit reason (>= 5 characters).
 */
export function requireReason(req: Request, _res: Response, next: NextFunction) {
  const reason = req.body?.reason ?? req.body?.voidReason ?? req.body?.overrideReason; // Support multiple naming conventions for different endpoints
  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return next(
      AppError.badRequest(
        'AUDIT_REASON_REQUIRED',
        'A descriptive audit reason (minimum 5 characters) is mandatory for this action.'
      )
    );
  }
  req.body.reason = reason.trim();
  next();
}