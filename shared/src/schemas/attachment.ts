// shared/src/schemas/attachment.ts
import { z } from 'zod';
import { ObjectIdSchema, ReasonSchema } from './common.ts';

export const ATTACHMENT_ENTITY_TYPES = [
  'SOURCING',
  'CONTRACT',
  'INCOMING_LOT',
  'DRUM',
  'LAB_REPORT',
  'BATCH',
  'PROCESS_STEP',
  'REWORK_STOCK',
  'SHIPMENT_LOT',
  'COST_REPORT',
  'USER',
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export const ATTACHMENT_DOC_TYPES = [
  'OFFER_DOC',
  'EXTERNAL_ANALYSIS_REPORT',
  'QSI_CERTIFICATE',
  'INHOUSE_SENSORY_REPORT',
  'CONTRACT_PDF',
  'DELIVERY_NOTE',
  'WARM_ROOM_TEMP_LOG',
  'BATCH_PROCESS_SHEET',
  'FILTRATION_LOG',
  'FILLING_LINE_CHECKLIST',
  'COA_FINAL', // Certificate of Analysis (Final)
  'ORIGIN_CERTIFICATE_PDF',
  'SHIPPING_BILL_OF_LADING',
  'MANAGEMENT_COST_REPORT', // Management Cost Report
  'PROFILE_IMAGE',
  'OTHER', // For any other document types not listed above
] as const;
export type AttachmentDocType = (typeof ATTACHMENT_DOC_TYPES)[number];

export const ENTITY_AREA_FOLDER_MAP: Record<AttachmentEntityType, string> = {
  SOURCING: 'Sourcings',
  CONTRACT: 'Contracts',
  INCOMING_LOT: 'IncomingLots',
  DRUM: 'Drums',
  LAB_REPORT: 'LabReports',
  BATCH: 'Batches',
  PROCESS_STEP: 'ProcessSteps',
  REWORK_STOCK: 'ReworkStocks',
  SHIPMENT_LOT: 'Shipments',
  COST_REPORT: 'AdminCostReports',
  USER: 'Users',
};

export const UploadAttachmentMetaSchema = z.object({
  entityType: z.enum(ATTACHMENT_ENTITY_TYPES),
  entityId: ObjectIdSchema,
  entityCode: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'entityCode must be alphanumeric/hyphen/underscore'),
  docType: z.enum(ATTACHMENT_DOC_TYPES),
  adminOnly: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  notes: z.string().trim().max(500).optional(),
  reason: ReasonSchema.optional(),
});

export const VoidAttachmentSchema = z.object({
  reason: ReasonSchema,
});

export type UploadAttachmentMetaInput = z.infer<typeof UploadAttachmentMetaSchema>;
export type VoidAttachmentInput = z.infer<typeof VoidAttachmentSchema>;