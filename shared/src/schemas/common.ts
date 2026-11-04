// shared/src/schemas/common.ts
import { z } from 'zod';

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const ObjectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_REGEX, 'Invalid 24-character hex MongoDB ObjectId');

export const ReasonSchema = z
  .string()
  .trim()
  .min(5, 'Mandatory audit reason must be at least 5 characters')
  .max(500, 'Audit reason cannot exceed 500 characters');

export const Iso2CountrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Must be a valid 2-letter ISO-3166 alpha-2 country code');

/**
 * Deterministic 3-decimal-place rounding (0.001 kg precision)
 */
export const roundKg = (val: number): number =>
  Math.round((val + Number.EPSILON) * 1000) / 1000;

export const roundEur = (val: number): number =>
  Math.round((val + Number.EPSILON) * 100) / 100;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;