// server/src/middlewares/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors';
import { env } from '../config/env';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      message: err.message,
      details: err.details ?? null,
    });
  }

  // Mongoose duplicate key error
  if (err?.code === 11000) {
    return res.status(409).json({
      ok: false,
      code: 'DUPLICATE_KEY',
      message: 'A record with the same unique identifier already exists.',
      details: err.keyValue,
    });
  }

  // Mongoose optimistic concurrency error
  if (err?.name === 'VersionError') {
    return res.status(409).json({
      ok: false,
      code: 'CONCURRENCY_CONFLICT',
      message: 'Record was modified by another user. Please refresh and try again.',
    });
  }

  console.error('[UNHANDLED_ERROR]', err);
  const safeMessage =
    env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred.'
      : err?.message || 'An unexpected server error occurred';
  return res.status(500).json({
    ok: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: safeMessage,
  });
}
