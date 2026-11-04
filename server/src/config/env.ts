// server/src/config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')],
});

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGO_URI: z.string().min(10, 'MONGO_URI is required (must point to replica set rs0)'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('12h'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    // Storage Provider (R16: Nextcloud WebDAV in prod, local in dev)
    STORAGE_PROVIDER: z.enum(['nextcloud', 'local']).default('local'),
    UPLOAD_DIR: z.string().default('./uploads'),
    NC_URL: z.string().url().optional(),
    NC_USER: z.string().optional(),
    NC_APP_PASSWORD: z.string().optional(),
    NC_ROOT: z.string().default('BuramLoop'),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_PROVIDER === 'nextcloud') {
      if (!env.NC_URL || !env.NC_USER || !env.NC_APP_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_PROVIDER'],
          message: 'NC_URL, NC_USER, and NC_APP_PASSWORD are required when STORAGE_PROVIDER=nextcloud',
        });
      }
    }
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[ENV_INVALID] Failed to validate environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;