// shared/src/schemas/access.ts
import { z } from 'zod';
import { ObjectIdSchema, ReasonSchema } from './common.js';

export const SYSTEM_ROLES = [
  'Admin',
  'Management',
  'QA',
  'Warehouse',
  'Production',
  'Inspector',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const UpsertRoleSchema = z.object({
  name: z.enum(SYSTEM_ROLES),
  description: z.string().trim().min(3).max(200),
  permissions: z.array(z.string().trim().min(3)).min(1),
  isSystem: z.boolean().default(true),
  reason: ReasonSchema.optional(),
});

export const CreateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(10).max(128),
    roleName: z.enum(SYSTEM_ROLES),
    roleId: ObjectIdSchema.optional(),
    expiresAt: z.coerce.date().optional().nullable(),
    reason: ReasonSchema,
  })
  .superRefine((data, ctx) => {
    if (data.roleName === 'Inspector' && !data.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Inspector accounts require a mandatory expiration timestamp (expiresAt).',
      });
    }
  });

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type UpsertRoleInput = z.infer<typeof UpsertRoleSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;