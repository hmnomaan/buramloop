// shared/src/schemas/master.ts
import { z } from 'zod';
import { ReasonSchema } from './common.ts';

export const MATERIAL_KINDS = ['HONEY', 'POLLEN', 'COMB', 'FLAVOUR', 'OTHER'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export const QUALITY_GRADE_CODES = ['Quality1', 'Quality2', 'Quality3'] as const;
export type QualityGradeCode = (typeof QUALITY_GRADE_CODES)[number];

export const MATERIAL_UNITS = ['kg', 'l', 'piece'] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export const UpsertMaterialSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(32),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(MATERIAL_KINDS),
  category: z.string().trim().min(2).max(80),
  unit: z.enum(MATERIAL_UNITS).default('kg'),
  defaultPackageType: z.string().trim().min(2).max(60).optional(),
  defaultDrumKg: z.number().positive().max(1000).optional(),
  isAllergen: z.boolean().default(false),
  countsTowardOrigin: z.boolean().default(true),
  isActive: z.boolean().default(true),
  reason: ReasonSchema,
}).superRefine((material, ctx) => {
  if (material.unit !== 'kg' && material.defaultDrumKg !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['defaultDrumKg'],
      message: 'Default drum weight only applies to materials measured in kg.',
    });
  }
});

export const UpsertQualityGradeSchema = z.object({
  code: z.enum(QUALITY_GRADE_CODES),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  maxMoisturePct: z.number().positive().max(25).default(20),
  maxHmfMgPerKg: z.number().positive().max(80).default(40),
  isActive: z.boolean().default(true),
  reason: ReasonSchema,
});

export type UpsertMaterialInput = z.infer<typeof UpsertMaterialSchema>;
export type UpsertQualityGradeInput = z.infer<typeof UpsertQualityGradeSchema>;