// server/src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import { env } from '../../config/env';

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = LoginBodySchema.parse(req.body);
      const result = await authService.login(email, password, req);

      res.cookie('buramloop_token', result.token, {
        httpOnly: true,
        sameSite: 'lax', // Adjust as needed for your frontend domain
        secure: env.NODE_ENV === 'production',
        maxAge: 12 * 60 * 60 * 1000, // 12 hours
      });

      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async logout(_req: Request, res: Response) {
    res.clearCookie('buramloop_token');
    res.json({ ok: true, message: 'Logged out' });
  }

  async me(req: Request, res: Response) {
    res.json({ ok: true, data: req.user });
  }
}

export const authController = new AuthController();