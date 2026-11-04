// shared/src/schemas/export.ts
import { z } from 'zod';
import { ObjectIdSchema } from './common.ts';

// --- CONSTANTS & ENUMS ---
export const EXPORT_FORMATS = ['PRINT', 'EXCEL', 'WORD', 'PDF'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// --- EXPORT MODULES --- why this is export modules? because we want to export the modules that can be exported
export const EXPORT_MODULES = [
  'SOURCINGS',
  'INCOMING_LOTS',
  'DRUMS',
  'WARM_CABINETS',
  'BATCHES',
  'PROCESS_STEPS',
  'REWORK_STOCKS',
  'SHIPMENT_LOTS',
  'CUSTOMERS',
  'SUPPLIERS',
  'COST_REPORTS',
  'TRACEABILITY',
  'AUDIT_LOGS',
] as const;
export type ExportModule = (typeof EXPORT_MODULES)[number];

export interface ExportColumnDef {
  key: string;
  label: string;
  width?: number;
  adminOnly?: boolean;
  inspectorHidden?: boolean;
}

export const CreateExportRequestSchema = z.object({
  module: z.enum(EXPORT_MODULES),
  format: z.enum(EXPORT_FORMATS),
  entityIds: z.array(ObjectIdSchema).optional(),
  filters: z.record(z.unknown()).optional(),
  saveToNextcloud: z.boolean().default(false),
});

export type CreateExportRequestInput = z.infer<typeof CreateExportRequestSchema>;