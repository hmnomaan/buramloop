// client/src/App.tsx
import { WarehouseStockLedgerWorkspace } from './pages/WarehouseStockLedgerWorkspace';
import React, { useEffect, useState, useCallback } from 'react';
import { AppShell, ModuleKey } from './components/layout/AppShell';
import { MobileCameraBarcodeModal } from './components/ui/FlowAndInfoPrimitives';
import {
  canAccessModule,
  canApproveIncomingLots,
  canReceiveIncomingLots,
} from './lib/moduleAccess';
import { ScannedLabelData } from './lib/labelOcr';
import { OperationsDashboard } from './pages/OperationsDashboard';
import { apiClient } from './lib/apiClient';
import {
  UserSession,
  IncomingLot,
  WarmCabinetSlot,
  BatchPlan,
  SourcingOffer,
  StockMovementEntry,
  NotificationItem,
} from './types/erp';
import { SourcingWorkspace } from './pages/SourcingWorkspace';
import { IncomingStockWorkspace } from './pages/IncomingStockWorkspace';
import { BatchPlanningWorkspace } from './pages/BatchPlanningWorkspace';
import { WarmCabinetsWorkspace } from './pages/WarmCabinetsWorkspace';
import { ProcessingWorkspace } from './pages/ProcessingWorkspace';
import { ShipmentLotsWorkspace } from './pages/ShipmentLotsWorkspace';
import { AdminCostsWorkspace } from './pages/AdminCostsWorkspace';
import { TraceabilityAuditWorkspace } from './pages/TraceabilityAuditWorkspace';
import { LandingWithLoginPage } from './pages/LandingWithLoginPage';
import { toUserSession } from './lib/authSession';
import { UserAndProfileWorkspace } from './pages/UserAndProfileWorkspace';
import { MasterDataWorkspace } from './pages/MasterDataWorkspace';

// Derive workspace data types from their component props so App.tsx stays aligned
// with the existing frontend modules without duplicating their interfaces.
type ProcessingWorkspaceProps = React.ComponentProps<typeof ProcessingWorkspace>;
type ShipmentLotsWorkspaceProps = React.ComponentProps<typeof ShipmentLotsWorkspace>;
interface BackendCabinet {
  code: 'CAB-01' | 'CAB-02';
  capacityDrums: number;
  targetTempC: number;
  occupiedSlots: Array<{
    slotNo: number;
    drumId:
      | string
      | {
          _id: string;
          drumCode: string;
          country: string;
          netKg: number;
          status: string;
        }
      | null;
    batchId?: string | { _id?: string; processNo?: string } | null;
    checkedInAt: string | Date;
    inTempC: number;
    warmingHours?: number;
    notes?: string;
    readyAt: string | Date;
  }>;
}

interface BackendSourcingRecord {
  _id: string;
  sourcingNo: string;
  supplierId: { name?: string } | string;
  materialId: { name?: string } | string;
  country: string;
  offeredKg: number;
  offeredDrums: number;
  stage: string;
  status: string;
  gates?: Array<{ gate: string; decision: string }>;
  updatedAt: string | Date;
}

interface BackendProcessRecord {
  _id: string;
  processNo: string;
  status: string;
  currentStage?: string;
  approvedKg?: number;
  plannedKg?: number;
  actualOutKg?: number;
  originComposition?: Array<{
    country: string;
    incomingLotId?: string;
    sourceReworkId?: string | null;
    pct: number;
    kg: number;
    unitPriceEurPerKg?: number;
    valueEur?: number;
    costValueEur?: number;
    costSharePct?: number;
  }>;
  steps?: Array<Record<string, unknown> & {
    _id: string;
    stage: string;
    inKg: number;
    outKg: number;
    lossKg: number;
    reworkOutKg: number;
    tempC: number;
    personInChargeName: string;
    startedAt: string | Date;
    completedAt?: string | Date;
  }>;
  reworkGenerated?: Array<{
    reworkNo: string;
    sourceProcessNo: string;
    sourceStage?: string;
    totalKg: number;
    remainingKg: number;
    origin: Array<{
      country: string;
      incomingLotId?: string;
      sourceReworkId?: string | null;
      pct: number;
      kg: number;
      unitPriceEurPerKg?: number;
      valueEur?: number;
      costValueEur?: number;
      costSharePct?: number;
    }>;
    createdAt: string | Date;
  }>;
}

function mapBackendProcesses(
  records: BackendProcessRecord[]
): ProcessingWorkspaceProps['processes'] {
  const stages: ProcessingWorkspaceProps['processes'][number]['currentSevenStage'][] = [
    'RESERVED',
    'WARMING_IN',
    'WARMING_OUT',
    'FILTERING',
    'BLENDING',
    'RESTING_TANK',
    'FILLING',
    'COMPLETED',
  ];

  return records.map((record) => ({
    id: record._id,
    processNo: record.processNo,
    customerName: 'Customer',
    allowedCountries: [],
    flavourProfile: '',
    currentSevenStage: stages.includes(
      record.currentStage as ProcessingWorkspaceProps['processes'][number]['currentSevenStage']
    )
      ? (record.currentStage as ProcessingWorkspaceProps['processes'][number]['currentSevenStage'])
      : 'RESERVED',
    approvedInputKg: record.approvedKg ?? record.plannedKg ?? 0,
    originComposition: (record.originComposition ?? []).map((origin) => ({
      country: origin.country,
      incomingLotId: origin.incomingLotId,
      sourceReworkId: origin.sourceReworkId,
      pct: origin.pct,
      kg: origin.kg,
      unitPriceEurPerKg: origin.unitPriceEurPerKg,
      valueEur: origin.valueEur,
      costValueEur: origin.costValueEur,
      costSharePct: origin.costSharePct,
    })),
    steps: (record.steps ?? []).map((step) => ({
      id: step._id,
      stage: step.stage as ProcessingWorkspaceProps['processes'][number]['steps'][number]['stage'],
      sevenStageState: record.currentStage ?? 'RESERVED',
      inKg: step.inKg,
      outKg: step.outKg,
      lossKg: step.lossKg,
      reworkOutKg: step.reworkOutKg,
      tempC: step.tempC,
      personInChargeName: step.personInChargeName,
      tankCode: typeof step.tankCode === 'string' ? step.tankCode : undefined,
      fillLineCode:
        step.fillLineCode === 'QUIEL_PET' ||
        step.fillLineCode === 'CARLO_JAR' ||
        step.fillLineCode === 'HAND'
          ? step.fillLineCode
          : undefined,
      completedAt: new Date(step.completedAt ?? step.startedAt).toISOString(),
    })),
    reworkDrums: (record.reworkGenerated ?? []).map((rework) => ({
      reworkNo: rework.reworkNo,
      drumCode: `DR-${rework.reworkNo}`,
      sourceProcessNo: rework.sourceProcessNo,
      sourceStage: rework.sourceStage ?? 'UNKNOWN',
      netKg: rework.remainingKg,
      origin: rework.origin.map((slice) => ({
        country: slice.country,
        incomingLotId: slice.incomingLotId,
        sourceReworkId: slice.sourceReworkId,
        pct: slice.pct,
        kg: slice.kg,
        unitPriceEurPerKg: slice.unitPriceEurPerKg,
        valueEur: slice.valueEur,
        costValueEur: slice.costValueEur,
        costSharePct: slice.costSharePct,
      })),
      createdAt: new Date(rework.createdAt).toISOString(),
    })),
  }));
}

function mapBackendSourcing(records: BackendSourcingRecord[]): SourcingOffer[] {
  return records.map((record) => {
    const sourcingStage: Record<string, SourcingOffer['currentStage']> = {
      OFFER: 'OFFER',
      PRICE_OFFER: 'OFFER',
      EXTERNAL_ANALYSIS: 'EXTERNAL_ANALYSIS',
      SAMPLE: 'SAMPLE',
      INHOUSE_QSI: 'IN_HOUSE_QSI',
      PASSED: 'LOT',
      CONTRACTED: 'CONTRACT',
      SHIPPED: 'SHIPPED',
      REJECTED: 'LOT',
    };
    const currentStage = sourcingStage[record.stage];
    if (!currentStage) {
      throw new Error(`Unsupported sourcing stage from server: ${record.stage}`);
    }
    const currentGate = record.gates?.find((gate) => gate.gate === record.stage);
    const gateStatus: SourcingOffer['gateStatus'] =
      currentGate?.decision === 'APPROVED'
        ? 'APPROVED'
        : currentGate?.decision === 'REJECTED' || record.status === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING';

    return {
      id: record._id,
      referenceCode: record.sourcingNo,
      supplierName:
        typeof record.supplierId === 'object'
          ? record.supplierId.name ?? 'Unknown supplier'
          : record.supplierId,
      originCountryIso: record.country,
      honeyVariety:
        typeof record.materialId === 'object'
          ? record.materialId.name ?? 'Unknown material'
          : record.materialId,
      offeredKg: record.offeredKg,
      estimatedDrums: record.offeredDrums,
      currentStage,
      gateStatus,
      requiresManagementApproval: record.stage === 'EXTERNAL_ANALYSIS',
      updatedAt: new Date(record.updatedAt).toISOString(),
      updatedBy: 'Server',
    };
  });
}

function mapBackendCabinets(cabinets: BackendCabinet[]): WarmCabinetSlot[] | null {
  if (
    cabinets.length !== 2 ||
    !cabinets.some((cabinet) => cabinet.code === 'CAB-01') ||
    !cabinets.some((cabinet) => cabinet.code === 'CAB-02') ||
    cabinets.some((cabinet) => cabinet.capacityDrums !== 17)
  ) {
    return null;
  }

  return cabinets.flatMap((cabinet) => {
    const cabinetId = cabinet.code === 'CAB-01' ? 'CABINET_A' : 'CABINET_B';
    const prefix = cabinet.code === 'CAB-01' ? 'CAB-A' : 'CAB-B';
    const occupiedBySlot = new Map(
      cabinet.occupiedSlots.map((occupiedSlot) => [occupiedSlot.slotNo, occupiedSlot])
    );

    return Array.from({ length: cabinet.capacityDrums }, (_, index) => {
      const positionIndex = index + 1;
      const occupiedSlot = occupiedBySlot.get(positionIndex);
      if (!occupiedSlot) {
        return {
          cabinetId,
          positionIndex,
          slotCode: `${prefix}-${String(positionIndex).padStart(2, '0')}`,
          state: 'EMPTY' as const,
        };
      }

      const drum =
        typeof occupiedSlot.drumId === 'string' ? null : occupiedSlot.drumId;
      const batch =
        typeof occupiedSlot.batchId === 'object' && occupiedSlot.batchId
          ? occupiedSlot.batchId
          : null;
      const isReady = new Date(occupiedSlot.readyAt).getTime() <= Date.now();

      return {
        cabinetId,
        positionIndex,
        slotCode: `${prefix}-${String(positionIndex).padStart(2, '0')}`,
        state: batch || drum?.status === 'InBatch'
          ? 'RESERVED' as const
          : isReady
            ? 'READY_48H' as const
            : 'OCCUPIED_WARMING' as const,
        drumId:
          typeof occupiedSlot.drumId === 'string'
            ? occupiedSlot.drumId
            : occupiedSlot.drumId?._id,
        drumCode: drum?.drumCode,
        originCountryIso: drum?.country,
        netKg: drum?.netKg,
        batchId:
          typeof occupiedSlot.batchId === 'string'
            ? occupiedSlot.batchId
            : occupiedSlot.batchId?._id,
        batchNumber: batch?.processNo,
        checkedInAt: new Date(occupiedSlot.checkedInAt).toISOString(),
        targetReadyAt: new Date(occupiedSlot.readyAt).toISOString(),
        warmingHours: occupiedSlot.warmingHours,
        targetTempC: cabinet.targetTempC,
        currentTempC: occupiedSlot.inTempC || cabinet.targetTempC,
        notes: occupiedSlot.notes,
      };
    });
  });
}

interface BackendIncomingLot {
  _id: string;
  lotNo: string;
  sourceNameSnapshot?: string;
  materialCodeSnapshot?: string;
  supplierId?: { name?: string } | string;
  materialId?: { name?: string } | string;
  country: string;
  receivedDate: string | Date;
  packageCount?: number;
  packageType?: string;
  drumsCount: number;
  unit?: 'kg' | 'l' | 'piece';
  totalQuantity?: number;
  totalNetKg: number;
  status: string;
  returnedToSupplier?: boolean;
  usage?: { availableKg?: number; availableQuantity?: number };
}

function mapBackendIncomingLot(lot: BackendIncomingLot): IncomingLot {
  const supplierName =
    typeof lot.supplierId === 'object' && lot.supplierId?.name
      ? lot.supplierId.name
      : lot.sourceNameSnapshot ?? 'Unknown supplier';
  const honeyType =
    typeof lot.materialId === 'object' && lot.materialId?.name
      ? lot.materialId.name
      : lot.materialCodeSnapshot ?? 'Unknown material';
  const qualityStatus: IncomingLot['qualityStatus'] =
    lot.status === 'PASSED' || lot.status === 'APPROVED'
      ? 'APPROVED'
      : lot.status === 'FAILED'
        ? 'FAILED'
        : lot.status === 'RETURNED_TO_SUPPLIER'
          ? 'RETURNED_TO_SUPPLIER'
          : lot.status === 'QUALITY_HOLD'
            ? 'QUALITY_HOLD'
            : 'UNDER_REVIEW';

  return {
    id: lot._id,
    lotNumber: lot.lotNo,
    supplierName,
    originCountryIso: lot.country,
    honeyType,
    receivedAt: new Date(lot.receivedDate).toISOString(),
    drumCount: lot.packageCount ?? lot.drumsCount,
    packageCount: lot.packageCount ?? lot.drumsCount,
    packageType: lot.packageType ?? 'DRUM',
    unit: lot.unit ?? 'kg',
    totalQuantity: lot.totalQuantity ?? lot.totalNetKg,
    availableQuantity: lot.usage?.availableQuantity ?? lot.usage?.availableKg ?? 0,
    totalNetKg: lot.totalNetKg,
    availableNetKg: lot.usage?.availableKg ?? 0,
    qualityStatus,
    mismatchDetected: Boolean(lot.returnedToSupplier),
  };
}

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [user, setUser] = useState<UserSession>({
    id: 'usr-admin-01',
    name: 'H. M. Noman',
    email: 'noman@buram-hennigsdorf.de',
    role: 'ADMIN',
    permissions: [
      'management:approve',
      'admin:master_data',
      'admin:costs',
      'stock:write',
      'qa:inspect',
      'production:execute',
      'trace:inspect',
      'export:generate',
    ],
    stationId: 'DE-BB-HND-01',
  });

  const [activeModule, setActiveModule] = useState<ModuleKey>('DASHBOARD');
  const [lots, setLots] = useState<IncomingLot[]>([]);
  const [cabinetSlots, setCabinetSlots] = useState<WarmCabinetSlot[]>([]);
  const [batches, setBatches] = useState<BatchPlan[]>([]);
  const [sourcingOffers, setSourcingOffers] = useState<SourcingOffer[]>([]);
  const [movements] = useState<StockMovementEntry[]>([]);
  const [notifications] = useState<NotificationItem[]>([]);

  // Process and shipment state use component-derived types and are synchronized
  // from their mounted API workflows where available.
  const [activeProcesses, setActiveProcesses] =
    useState<ProcessingWorkspaceProps['processes']>([]);
  const [shipmentLots, setShipmentLots] =
    useState<ShipmentLotsWorkspaceProps['shipmentLots']>([]);

  const [apiOnline, setApiOnline] = useState(false);
  const [nextcloudOnline, setNextcloudOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncIso, setLastSyncIso] = useState<string | null>(new Date().toISOString());
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [incomingLotBarcode, setIncomingLotBarcode] = useState('');
  const [scannedLabelData, setScannedLabelData] = useState<ScannedLabelData | null>(null);

  const handleBarcodeCaptured = useCallback((barcode: string) => {
    if (!canReceiveIncomingLots(user)) return;
    setIncomingLotBarcode(barcode);
    setActiveModule('INCOMING_QA');
    setIsScannerOpen(false);
  }, [user]);
  const handleLabelExtracted = useCallback((data: ScannedLabelData) => {
    if (!canReceiveIncomingLots(user)) return;
    setIncomingLotBarcode(data.fields.barcode);
    setScannedLabelData(data);
    setActiveModule('INCOMING_QA');
    setIsScannerOpen(false);
  }, [user]);
  const handleCloseScanner = useCallback(() => setIsScannerOpen(false), []);
  const selectModule = useCallback(
    (module: ModuleKey) => {
      if (canAccessModule(user, module)) setActiveModule(module);
    },
    [user]
  );

  const synchronizeWithBackend = useCallback(async () => {
    setIsLoading(true);
    try {
      const [lotsRes, cabRes, batchRes, srcRes, processRes, ncHealth] = await Promise.allSettled([
        apiClient.request<BackendIncomingLot[]>('/stock/lots'),
        apiClient.request<BackendCabinet[]>('/warm-room'),
        apiClient.request<BatchPlan[]>('/production/batches'),
        apiClient.request<BackendSourcingRecord[]>('/sourcings'),
        apiClient.request<BackendProcessRecord[]>('/production/process'),
        apiClient.request<{ ok?: boolean; healthy?: boolean }>('/health/storage'),
      ]);

      let anyConnected = false;
      if (lotsRes.status === 'fulfilled' && Array.isArray(lotsRes.value)) {
        setLots(lotsRes.value.map(mapBackendIncomingLot));
        anyConnected = true;
      }
      if (cabRes.status === 'fulfilled' && Array.isArray(cabRes.value)) {
        const mappedCabinets = mapBackendCabinets(cabRes.value);
        if (mappedCabinets) {
          setCabinetSlots(mappedCabinets);
          anyConnected = true;
        }
      }
      if (batchRes.status === 'fulfilled' && Array.isArray(batchRes.value)) {
        setBatches(batchRes.value);
        anyConnected = true;
      }
      if (srcRes.status === 'fulfilled' && Array.isArray(srcRes.value)) {
        setSourcingOffers(mapBackendSourcing(srcRes.value));
        anyConnected = true;
      }
      if (processRes.status === 'fulfilled' && Array.isArray(processRes.value)) {
        setActiveProcesses(mapBackendProcesses(processRes.value));
        anyConnected = true;
      }
      if (ncHealth.status === 'fulfilled') {
        setNextcloudOnline(Boolean(ncHealth.value?.ok || ncHealth.value?.healthy));
      }

      setApiOnline(anyConnected);
      setLastSyncIso(new Date().toISOString());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const me = await apiClient.request<{
          userId?: string;
          id?: string;
          email: string;
          fullName?: string;
          roleName?: string;
          permissions?: string[];
          avatarAttachmentId?: string | null;
          mustChangePassword?: boolean;
        }>('/auth/me');

        if (active) {
          const session = toUserSession(me);
          setUser(session);
          if (session.mustChangePassword) setActiveModule('USER_PROFILE');
          setIsAuthenticated(true);
        }
      } catch {
        apiClient.setBearerToken(null);
      } finally {
        if (active) {
          setIsCheckingSession(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void synchronizeWithBackend();
    }
  }, [isAuthenticated, synchronizeWithBackend]);

  const handleLogout = async () => {
    try {
      await apiClient.request('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.warn('Server logout request failed; clearing the local session.', error);
    } finally {
      window.sessionStorage.removeItem('buram_jwt');
      setIsAuthenticated(false);
      setActiveModule('DASHBOARD');
      setIsScannerOpen(false);
      setIncomingLotBarcode('');
    }
  };

  const handleCabinetAction = async (
    slot: WarmCabinetSlot,
    action: 'CHECK_IN' | 'CHECK_OUT_FILTRATION' | 'CHECK_OUT_WAREHOUSE',
    reason: string
  ) => {
    if (action === 'CHECK_IN') {
      throw new Error('Warm-cabinet check-in is not available from the dashboard.');
    }

    await apiClient.auditedMutation('/warm-room/check-out', 'POST', {
      body: {
        cabinetCode: slot.cabinetId === 'CABINET_A' ? 'CAB-01' : 'CAB-02',
        slotNo: slot.positionIndex,
        destination: action === 'CHECK_OUT_FILTRATION' ? 'FILTRATION' : 'WAREHOUSE',
      },
      reason,
    });

    setCabinetSlots((prev) =>
      prev.map((currentSlot) =>
        currentSlot.slotCode === slot.slotCode
          ? {
              ...currentSlot,
              state: 'EMPTY',
              drumId: undefined,
              drumCode: undefined,
              lotNumber: undefined,
              originCountryIso: undefined,
              netKg: undefined,
              batchNumber: undefined,
              checkedInAt: undefined,
              targetReadyAt: undefined,
              currentTempC: undefined,
            }
          : currentSlot
      )
    );
  };

  const handleApproveExternalAnalysis = async (offerId: string, reason: string) => {
    await apiClient.auditedMutation(`/sourcings/${offerId}/gates`, 'POST', {
      body: {
        gate: 'EXTERNAL_ANALYSIS',
        decision: 'APPROVED',
        externalAnalysis: {
          labName: 'QSI Bremen / External Partner Lab',
          reportNo: `EXT-${offerId.slice(-6).toUpperCase()}`,
          reportDate: new Date().toISOString(),
          locationAcceptable: true,
          priceAcceptable: true,
          marketDemandFit: 'HIGH',
          transportCostEur: 0,
          qualityAcceptable: true,
          managementNotes: reason,
        },
      },
      reason,
    });

    setSourcingOffers((prev) =>
      prev.map((o) =>
        o.id === offerId ? { ...o, currentStage: 'SAMPLE', gateStatus: 'APPROVED' } : o
      )
    );
  };

  if (isCheckingSession) {
    return (
      <main className="min-h-screen bg-buram-bg text-buram-muted flex items-center justify-center font-mono">
        Checking session…
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <LandingWithLoginPage
        onAuthenticated={(session) => {
          setUser(session);
          setActiveModule(session.mustChangePassword ? 'USER_PROFILE' : 'DASHBOARD');
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <>
      <AppShell
      user={user}
      activeModule={activeModule}
      onSelectModule={selectModule}
      apiOnline={apiOnline}
      nextcloudOnline={nextcloudOnline}
      lastSyncIso={lastSyncIso}
      unreadNotificationsCount={notifications.filter((n) => !n.acknowledged).length}
      onLogout={handleLogout}
      onOpenMobileScanner={() => {
        if (canReceiveIncomingLots(user)) setIsScannerOpen(true);
      }}
    >
      {activeModule === 'DASHBOARD' && (
        <OperationsDashboard
          user={user}
          lots={lots}
          cabinetSlots={cabinetSlots}
          batches={batches}
          sourcingOffers={sourcingOffers}
          movements={movements}
          notifications={notifications}
          activeProcessesCount={
            activeProcesses.filter((process) => process.currentSevenStage !== 'COMPLETED').length
          }
          shipmentLotsCount={shipmentLots.filter((lot) => lot.status !== 'VOID').length}
          isLoading={isLoading}
          onRefresh={synchronizeWithBackend}
          onNavigate={selectModule}
          onOpenMobileScanner={() => {
            if (canReceiveIncomingLots(user)) setIsScannerOpen(true);
          }}
          onCabinetAction={handleCabinetAction}
          onApproveExternalAnalysis={handleApproveExternalAnalysis}
        />
      )}

      {activeModule === 'SOURCING' && (
        <SourcingWorkspace user={user} />
      )}

      {activeModule === 'INCOMING_QA' && (
        <IncomingStockWorkspace
          viewMode='intake'
          lots={lots}
          onLotsUpdated={setLots}
          canReceiveLots={canReceiveIncomingLots(user)}
          canApproveLots={canApproveIncomingLots(user)}
          canViewPrices={user.role === 'ADMIN' || user.role === 'MANAGEMENT'}
          onOpenScanner={() => {
            if (canReceiveIncomingLots(user)) setIsScannerOpen(true);
          }}
          lotBarcode={incomingLotBarcode}
          onLotBarcodeChange={setIncomingLotBarcode}
          scannedLabelData={scannedLabelData}
          onScannedLabelConsumed={() => setScannedLabelData(null)}
        />
      )}
      {activeModule === 'WAREHOUSE_STOCK' && (
        <WarehouseStockLedgerWorkspace />
      )}

      {activeModule === 'WARM_CABINETS' && (
        <WarmCabinetsWorkspace
          cabinetSlots={cabinetSlots}
          batches={batches}
          onRefresh={synchronizeWithBackend}
        />
      )}
      {activeModule === 'BATCH_PLANNING' && (
        <BatchPlanningWorkspace
          lots={lots}
          batches={batches}
          onBatchReserved={(batch) =>
            setBatches((previous) => [batch, ...previous])
          }
        />
      )}

      {activeModule === 'PROCESSING' && (
        <ProcessingWorkspace
          operatorName={user.name}
          canViewPrices={user.role === 'ADMIN' || user.role === 'MANAGEMENT'}
          processes={activeProcesses}
          onProcessUpdated={(updated) =>
            setActiveProcesses((previous) =>
              previous.map((process) =>
                process.id === updated.id ? updated : process
              )
            )
          }
        />
      )}

      {activeModule === 'SHIPMENTS' && (
        <ShipmentLotsWorkspace
          shipmentLots={shipmentLots}
          onDataLoaded={setShipmentLots}
        />
      )}

      {activeModule === 'ADMIN_COSTS' && (
        <AdminCostsWorkspace user={user} />
      )}

      {(activeModule === 'TRACEABILITY' ||
        activeModule === 'AUDIT_DOCS') && (
        <TraceabilityAuditWorkspace user={user} />
      )}
      {activeModule === 'USER_PROFILE' && (
        <UserAndProfileWorkspace
          user={user}
          onUserUpdated={setUser}
          onPasswordChanged={handleLogout}
        />
      )}
      {activeModule === 'MASTER_DATA' && user.role === 'ADMIN' && (
        <MasterDataWorkspace />
      )}
      </AppShell>
      <MobileCameraBarcodeModal
        isOpen={isScannerOpen}
        onClose={handleCloseScanner}
        onBarcodeCaptured={handleBarcodeCaptured}
        onLabelExtracted={handleLabelExtracted}
      />
    </>
  );
};

export default App;