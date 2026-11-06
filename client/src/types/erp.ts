// client/src/types/erp.ts
export type UserRole =
  | 'ADMIN'
  | 'MANAGEMENT'
  | 'QA_LEAD'
  | 'PLANT_OPERATOR'
  | 'WAREHOUSE'
  | 'INSPECTOR'
  | (string & {});

export type Permission =
  | 'management:approve'
  | 'admin:master_data'
  | 'admin:costs'
  | 'stock:write'
  | 'qa:inspect'
  | 'production:execute'
  | 'trace:inspect'
  | 'trace:admin_route'
  | 'export:generate';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: string[];
  stationId: string;
  avatarAttachmentId?: string | null;
  mustChangePassword?: boolean;
}

export type SourcingGateStage =
  | 'OFFER'
  | 'EXTERNAL_ANALYSIS'
  | 'SAMPLE'
  | 'IN_HOUSE_QSI'
  | 'CONTRACT'
  | 'SHIPPED'
  | 'LOT';

export type GateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'HOLD';

export interface SourcingOffer {
  id: string;
  referenceCode: string;
  supplierName: string;
  originCountryIso: string; // e.g. 'DE', 'RO', 'UA', 'AR'
  honeyVariety: string;
  offeredKg: number;
  estimatedDrums: number;
  currentStage: SourcingGateStage;
  gateStatus: GateStatus;
  requiresManagementApproval: boolean;
  qsiAttachmentId?: string;
  updatedAt: string;
  updatedBy: string;
  rejectionReason?: string;
}

export type LotQualityStatus =
  | 'APPROVED'
  | 'UNDER_REVIEW'
  | 'QUALITY_HOLD'
  | 'FAILED'
  | 'RETURNED_TO_SUPPLIER';

export interface IncomingLot {
  id: string;
  lotNumber: string;
  supplierName: string;
  originCountryIso: string;
  honeyType: string;
  receivedAt: string;
  drumCount: number;
  packageCount?: number;
  packageType?: string;
  unit?: 'kg' | 'l' | 'piece';
  totalQuantity?: number;
  availableQuantity?: number;
  totalNetKg: number;
  availableNetKg: number;
  qualityStatus: LotQualityStatus;
  qsiCertificateFileId?: string;
  mismatchDetected: boolean;
  mismatchNotes?: string;
}

export type DrumStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'IN_WARM_CABINET'
  | 'IN_PROCESSING'
  | 'CONSUMED'
  | 'HOLD'
  | 'RETURNED';

export interface StockDrum {
  id: string;
  drumCode: string;
  barcode?: string;
  lotId: string;
  lotNumber: string;
  originCountryIso: string;
  netKg: number; // Typically 290 kg or rework weight
  isReworkDrum: boolean;
  originComposition: Array<{ countryIso: string; percentage: number }>;
  status: DrumStatus;
  storageLocation: string;
  reservedBatchId?: string;
  updatedAt: string;
}

export type CabinetId = 'CABINET_A' | 'CABINET_B';

export type CabinetSlotState =
  | 'EMPTY'
  | 'OCCUPIED_WARMING'
  | 'READY_48H'
  | 'RESERVED'
  | 'EXCEPTION';

export interface WarmCabinetSlot {
  cabinetId: CabinetId;
  positionIndex: number; // 1..17 per cabinet (34 total)
  slotCode: string;      // e.g. 'CAB-A-01' .. 'CAB-B-17'
  state: CabinetSlotState;
  drumId?: string;
  drumCode?: string;
  lotNumber?: string;
  originCountryIso?: string;
  netKg?: number;
  batchId?: string;
  batchNumber?: string;
  checkedInAt?: string;
  targetReadyAt?: string;
  warmingHours?: number;
  targetTempC?: number;
  currentTempC?: number;
  notes?: string;
}

export type BatchStatus =
  | 'DRAFT'
  | 'FEASIBLE'
  | 'AWAITING_APPROVAL'
  | 'RESERVED'
  | 'IN_PROCESS'
  | 'COMPLETED'
  | 'VOIDED';

export interface BatchPlan {
  id: string;
  batchNumber: string; // Equal to processNumber per R7
  customerName: string;
  allowedOriginCountries: string[]; // 1 to 3 countries per R8
  plannedInputKg: number;           // Standard 6,000 kg
  targetOutputKg: number;           // 9,000 - 9,500 kg with buffer
  selectedDrumCount: number;
  originBreakdown: Array<{ countryIso: string; kg: number; percentage: number }>;
  flavourProfile: string;
  status: BatchStatus;
  createdBy: string;
  updatedAt: string;
}

export type ProcessStageName =
  | 'WARMING'
  | 'FILTERING'
  | 'BLENDING'
  | 'FILLING';

export interface StockMovementEntry {
  id: string;
  timestamp: string;
  // Server STOCK_MOVEMENT_TYPES value (e.g. RECEIPT, RESERVE_BATCH, WARM_IN, CONSUME_BATCH).
  movementType: string;
  drumCode: string;
  lotNumber: string;
  deltaKg: number;
  balanceAfterKg: number;
  performedBy: string;
  reason: string;
  auditRef: string;
}

export interface NotificationItem {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: 'LOW_STOCK' | 'FEASIBILITY' | 'WARMING_READY' | 'DEVIATION' | 'GATE_APPROVAL';
  title: string;
  message: string;
  entityRef?: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface EndpointReadiness {
  module: string;
  stepCode: string;
  available: boolean;
  statusCode?: number;
  lastCheckedAt: string;
}
