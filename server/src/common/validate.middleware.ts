// server/src/common/validate.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodEffects, ZodError } from 'zod';
import { AppError } from './errors';

export function validateBody<T extends AnyZodObject | ZodEffects<any>>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          AppError.badRequest('VALIDATION_ERROR', 'Invalid request payload', err.flatten().fieldErrors)
        );
      }
      next(err);
    }
  };
}