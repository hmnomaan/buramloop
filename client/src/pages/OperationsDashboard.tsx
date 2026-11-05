import { DetailModal } from '../components/ui/DetailModal';
// client/src/pages/OperationsDashboard.tsx
import React, { useState } from 'react';
import {
  Flame,
  GitBranch,
  RefreshCw,
  Database,
  AlertOctagon,
  Camera,
  UserRound,
} from 'lucide-react';
import {
  UserSession,
  IncomingLot,
  WarmCabinetSlot,
  BatchPlan,
  SourcingOffer,
  StockMovementEntry,
  NotificationItem,
} from '../types/erp';
import {
  KpiCard,
  StatusBadge,
  KgDisplay,
  TemperatureDisplay,
  CountryOriginBadge,
  MassBalanceIndicator,
  ReasonDialog,
} from '../components/ui/IndustrialPrimitives';
import { ModuleKey } from '../components/layout/AppShell';
import { canReceiveIncomingLots } from '../lib/moduleAccess';

const ROLE_WORKSPACE_BRIEFS: Record<
  UserSession['role'],
  {
    headline: string;
    focusSummary: string;
    primaryModule: ModuleKey;
    primaryCtaLabel: string;
    secondaryModule: ModuleKey;
    secondaryCtaLabel: string;
  }
> = {
  ADMIN: {
    headline: 'System Administrator & Plant Command',
    focusSummary: 'Manage users and master data, monitor operations, and review authorized cost and margin reports.',
    primaryModule: 'USER_PROFILE',
    primaryCtaLabel: 'Manage Users & Profile',
    secondaryModule: 'ADMIN_COSTS',
    secondaryCtaLabel: 'Open Cost & Margin Reports',
  },
  MANAGEMENT: {
    headline: 'Executive Management & Approval Desk',
    focusSummary: 'Review sourcing approvals, batch feasibility, and authorized management reports.',
    primaryModule: 'SOURCING',
    primaryCtaLabel: 'Open Sourcing Pipeline',
    secondaryModule: 'ADMIN_COSTS',
    secondaryCtaLabel: 'View Management Reports',
  },
  QA_LEAD: {
    headline: 'Quality Assurance & Incoming Lot Review',
    focusSummary: 'Review quarantined incoming honey lots, QSI certificates, and shipment quality release.',
    primaryModule: 'INCOMING_QA',
    primaryCtaLabel: 'Review Incoming Lots',
    secondaryModule: 'SHIPMENTS',
    secondaryCtaLabel: 'Review Shipment Lots',
  },
  WAREHOUSE: {
    headline: 'Warehouse Receiving & Stock Operations',
    focusSummary: 'Receive supported honey lots in drums measured in kg, scan or enter label details, and manage warehouse stock and warm cabinets.',
    primaryModule: 'INCOMING_QA',
    primaryCtaLabel: 'Receive Incoming Lot',
    secondaryModule: 'WARM_CABINETS',
    secondaryCtaLabel: 'Open Warm Cabinets',
  },
  PLANT_OPERATOR: {
    headline: 'Production Execution & Processing',
    focusSummary: 'Review batch plans and execute authorized processing and filling operations.',
    primaryModule: 'PROCESSING',
    primaryCtaLabel: 'Open Processing',
    secondaryModule: 'BATCH_PLANNING',
    secondaryCtaLabel: 'Review Batch Plans',
  },
  INSPECTOR: {
    headline: 'Government Inspection & Traceability',
    focusSummary: 'Review authorized stock, traceability, and audit records in read-only workspaces.',
    primaryModule: 'TRACEABILITY',
    primaryCtaLabel: 'Open Traceability',
    secondaryModule: 'AUDIT_DOCS',
    secondaryCtaLabel: 'Open Audit Documents',
  },
};

export const OperationsDashboard: React.FC<{
  user: UserSession;
  lots: IncomingLot[];
  cabinetSlots: WarmCabinetSlot[];
  batches: BatchPlan[];
  sourcingOffers: SourcingOffer[];
  movements: StockMovementEntry[];
  notifications: NotificationItem[];
  activeProcessesCount: number;
  shipmentLotsCount: number;
  isLoading: boolean;
  onRefresh: () => void;
  onNavigate: (module: ModuleKey) => void;
  onOpenMobileScanner: () => void;
  onCabinetAction: (
    slot: WarmCabinetSlot,
    action: 'CHECK_IN' | 'CHECK_OUT_FILTRATION' | 'CHECK_OUT_WAREHOUSE',
    reason: string
  ) => Promise<void>;
  onApproveExternalAnalysis: (offerId: string, reason: string) => Promise<void>;
  onAcknowledgeNotification?: (notificationId: string) => Promise<void> | void;
}> = ({
  user,
  lots,
  cabinetSlots,
  batches,
  sourcingOffers,
  movements,
  notifications,
  activeProcessesCount,
  shipmentLotsCount,
  isLoading,
  onRefresh,
  onNavigate,
  onOpenMobileScanner,
  onCabinetAction,
  onApproveExternalAnalysis,
  onAcknowledgeNotification,
}) => {
  const [selectedCabinet, setSelectedCabinet] = useState<'CABINET_A' | 'CABINET_B'>('CABINET_A');
  const [selectedSlot, setSelectedSlot] = useState<WarmCabinetSlot | null>(null);
  const [inspectingOffer, setInspectingOffer] = useState<SourcingOffer | null>(null);
  const [inspectingMovement, setInspectingMovement] = useState<StockMovementEntry | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    type: 'CABINET_OUT' | 'SOURCING_APPROVE';
    title: string;
    summary: string;
    payload: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  // Interactive Mass-Balance Sandbox (Prepares operators for Step 5g validation)
  const [simInKg, setSimInKg] = useState(6000);
  const [simOutKg, setSimOutKg] = useState(5680);
  const [simLossKg, setSimLossKg] = useState(30);
  const [simReworkKg, setSimReworkKg] = useState(290);

  const roleBrief = ROLE_WORKSPACE_BRIEFS[user.role];
  const approvedFreeKg = lots
    .filter((l) => l.qualityStatus === 'APPROVED')
    .reduce((acc, l) => acc + l.availableNetKg, 0);

  const lotsAwaitingReview = lots.filter((l) => l.qualityStatus === 'UNDER_REVIEW').length;
  const lotsOnHoldOrFailed = lots.filter(
    (l) => l.qualityStatus === 'QUALITY_HOLD' || l.qualityStatus === 'FAILED'
  ).length;

  const occupiedSlots = cabinetSlots.filter((s) => s.state !== 'EMPTY').length;
  const ready48hSlots = cabinetSlots.filter((s) => s.state === 'READY_48H').length;

  const batchesAwaitingApproval = batches.filter(
    (b) => b.status === 'AWAITING_APPROVAL' || b.status === 'FEASIBLE'
  ).length;

  const canApproveManagementGate =
    user.role === 'MANAGEMENT' ||
    user.role === 'ADMIN' ||
    user.permissions.includes('management:approve');

  const visibleCabinetSlots = cabinetSlots.filter((s) => s.cabinetId === selectedCabinet);
  const initials = user.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleConfirmReason = async (reason: string) => {
    if (!pendingAction) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      if (pendingAction.type === 'CABINET_OUT' && selectedSlot) {
        await onCabinetAction(selectedSlot, 'CHECK_OUT_FILTRATION', reason);
      } else if (pendingAction.type === 'SOURCING_APPROVE') {
        await onApproveExternalAnalysis(pendingAction.payload, reason);
      }
      setPendingAction(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The operation failed. No changes were saved.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ROLE-PERSONALIZED OPERATOR COMMAND BANNER */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-4 sm:p-5 shadow-panel bg-honeycomb-header flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-full bg-buram-amber/20 border-2 border-buram-amber flex items-center justify-center overflow-hidden shrink-0 shadow-amberGlow">
            {user.avatarAttachmentId ? (
              <img
                src={`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/profile/avatar`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-mono font-bold text-buram-gold">
                {initials || <UserRound className="h-6 w-6" />}
              </span>
            )}
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-buram-amber font-bold">
                {roleBrief.headline}
              </span>
              <StatusBadge label={`ROLE: ${user.role}`} variant="NOMINAL" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-buram-text truncate">
              Welcome, {user.name}
            </h1>
            <p className="text-xs text-buram-muted max-w-2xl">{roleBrief.focusSummary}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canReceiveIncomingLots(user) && (
            <button
              type="button"
              onClick={onOpenMobileScanner}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-buram-tech/20 border border-buram-tech text-xs font-mono font-bold text-buram-tech hover:bg-buram-tech/30"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Mobile Barcode Scan</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate(roleBrief.secondaryModule)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-buram-elevated border border-buram-border text-xs font-mono text-buram-pale hover:border-buram-amber"
          >
            <span>{roleBrief.secondaryCtaLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate(roleBrief.primaryModule)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-buram-amber text-buram-ink font-mono text-xs font-bold uppercase tracking-wider hover:bg-buram-gold shadow-amberGlow"
          >
            <span>{roleBrief.primaryCtaLabel}</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded bg-buram-elevated border border-buram-border text-buram-muted hover:text-buram-text"
            title="Synchronize operational data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-buram-amber' : ''}`} />
          </button>
        </div>
      </section>

      {/* LIVE OPERATIONAL KPI TELEMETRY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3.5">
        <KpiCard
          code="STK-FREE-KG"
          title="Approved Free Stock"
          primaryValue={<KgDisplay kg={approvedFreeKg} size="lg" />}
          subtitle="Unreserved QA-Approved Stock"
          statusLabel={lots.length > 0 ? 'STOCK SNAPSHOT' : 'NO LOT DATA'}
          statusVariant={lots.length > 0 ? 'TECHNICAL' : 'MUTED'}
          footerMetric={`${Math.floor(approvedFreeKg / 290)} Equiv. Drums`}
        />

        <KpiCard
          code="QA-INCOMING-LOTS"
          title="Incoming Lots & Hold"
          primaryValue={`${lotsAwaitingReview} Review / ${lotsOnHoldOrFailed} Hold`}
          subtitle="Incoming QA Status"
          statusLabel={lotsOnHoldOrFailed > 0 ? 'HOLD ACTIVE' : 'NOMINAL'}
          statusVariant={lotsOnHoldOrFailed > 0 ? 'WARNING' : 'NOMINAL'}
          footerMetric={`${lots.length} Total Lots`}
        />

        <KpiCard
          code="CAB-OCCUPANCY"
          title="Warm Cabinets (2Ã—17)"
          primaryValue={`${occupiedSlots} / 34 Drums`}
          subtitle="Warming Conditioning"
          statusLabel={cabinetSlots.length === 34 ? `${ready48hSlots} READY` : 'NO TELEMETRY'}
          statusVariant={cabinetSlots.length === 34 ? 'AMBER' : 'MUTED'}
          footerMetric={
            cabinetSlots.length === 34
              ? `${((occupiedSlots / 34) * 100).toFixed(0)}% Capacity`
              : 'Telemetry unavailable'
          }
        />

        <KpiCard
          code="BAT-QUEUE"
          title="Batch Plans"
          primaryValue={`${batchesAwaitingApproval} Pending`}
          subtitle="Feasible & Reserved"
          statusLabel={batches.length > 0 ? 'ACTIVE' : 'NO BATCH DATA'}
          statusVariant={batches.length > 0 ? 'TECHNICAL' : 'MUTED'}
          footerMetric={`${batches.filter((b) => b.status === 'RESERVED').length} Reserved`}
        />

        <KpiCard
          code="PRC-EXEC"
          title="Active Processes"
          primaryValue={`${activeProcessesCount} Active`}
          subtitle="Filter â†’ Blend â†’ Fill"
          statusLabel={activeProcessesCount > 0 ? 'IN PROGRESS' : 'IDLE'}
          statusVariant={activeProcessesCount > 0 ? 'TECHNICAL' : 'MUTED'}
          footerMetric={`${activeProcessesCount} Running`}
        />

        <KpiCard
          code="SHP-RELEASE"
          title="Shipment LOTs"
          primaryValue={`${shipmentLotsCount} LOTs`}
          subtitle="Outbound Release"
          statusLabel={shipmentLotsCount > 0 ? 'ACTIVE' : 'NONE'}
          statusVariant={shipmentLotsCount > 0 ? 'NOMINAL' : 'MUTED'}
          footerMetric={`${shipmentLotsCount} Total`}
        />
      </div>

      {/* MAIN TWO-COLUMN MISSION CONTROL DECK */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: 2 x 17 WARM CABINET PHYSICAL MATRIX (Step 5f Live) */}
        <section
          className="xl:col-span-7 bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel"
          aria-labelledby="warm-cabinet-heading"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-buram-border">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-buram-amber" />
                <h2 id="warm-cabinet-heading" className="text-base font-semibold text-buram-text">
                  Warm Cabinets (2 Ã— 17)
                </h2>
              </div>
            </div>

            {/* Cabinet Switcher */}
            <div className="inline-flex rounded bg-buram-bg p-1 border border-buram-border font-mono text-xs">
              <button
                type="button"
                onClick={() => setSelectedCabinet('CABINET_A')}
                className={`px-3 py-1 rounded ${
                  selectedCabinet === 'CABINET_A'
                    ? 'bg-buram-amber text-buram-ink font-bold'
                    : 'text-buram-muted hover:text-buram-text'
                }`}
              >
                CABINET A (17)
              </button>
              <button
                type="button"
                onClick={() => setSelectedCabinet('CABINET_B')}
                className={`px-3 py-1 rounded ${
                  selectedCabinet === 'CABINET_B'
                    ? 'bg-buram-amber text-buram-ink font-bold'
                    : 'text-buram-muted hover:text-buram-text'
                }`}
              >
                CABINET B (17)
              </button>
            </div>
          </div>

          {/* 17-Slot Physical Grid */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
            {visibleCabinetSlots.length === 0 && (
              <p className="col-span-full rounded border border-buram-border bg-buram-bg/60 p-4 text-xs text-buram-muted">
                Warm-room positions have not synchronized from the server yet.
              </p>
            )}
            {visibleCabinetSlots.map((slot) => {
              const isSelected = selectedSlot?.slotCode === slot.slotCode;
              const stateStyle = {
                EMPTY: 'bg-buram-bg/60 border-buram-border/60 text-buram-muted',
                OCCUPIED_WARMING: 'bg-buram-amber/10 border-buram-amber/50 text-buram-text',
                READY_48H: 'bg-buram-success/15 border-buram-success/60 text-buram-text',
                RESERVED: 'bg-buram-tech/10 border-buram-tech/50 text-buram-text',
                EXCEPTION: 'bg-buram-critical/15 border-buram-critical/60 text-buram-text',
              }[slot.state];

              return (
                <button
                  key={slot.slotCode}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`p-2.5 rounded border text-left font-mono transition-all ${stateStyle} ${
                    isSelected ? 'ring-2 ring-buram-gold shadow-amberGlow' : 'hover:border-buram-gold/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-buram-pale">{slot.slotCode}</span>
                    {slot.originCountryIso && (
                      <span className="px-1 rounded bg-buram-surface text-[10px] text-buram-gold">
                        {slot.originCountryIso}
                      </span>
                    )}
                  </div>

                  {slot.state === 'EMPTY' ? (
                    <div className="mt-3 text-[11px] text-buram-muted/70 uppercase">EMPTY SLOT</div>
                  ) : (
                    <>
                      <div className="mt-1.5 text-xs font-semibold truncate text-buram-text">
                        {slot.drumCode}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-buram-muted tabular-nums">
                        <span>{slot.netKg ?? 290}kg</span>
                        <span>{slot.currentTempC ? `${slot.currentTempC.toFixed(1)}Â°C` : 'â€”'}</span>
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Drum Slot Inspector & Audited Action Bar */}
          {selectedSlot && (
            <div className="mt-4 p-4 rounded bg-buram-elevated border border-buram-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-bold text-buram-gold">{selectedSlot.slotCode}</span>
                  <span>â€¢</span>
                  <StatusBadge
                    label={selectedSlot.state}
                    variant={
                      selectedSlot.state === 'READY_48H'
                        ? 'NOMINAL'
                        : selectedSlot.state === 'OCCUPIED_WARMING'
                        ? 'AMBER'
                        : 'MUTED'
                    }
                  />
                  {selectedSlot.currentTempC && (
                    <TemperatureDisplay celsius={selectedSlot.currentTempC} />
                  )}
                </div>

                {selectedSlot.drumCode ? (
                  <p className="text-buram-muted font-mono">
                    Drum: <strong className="text-buram-text">{selectedSlot.drumCode}</strong> | Lot:{' '}
                    <strong className="text-buram-text">{selectedSlot.lotNumber}</strong> | Origin:{' '}
                    <strong className="text-buram-pale">{selectedSlot.originCountryIso}</strong> | Batch:{' '}
                    <strong className="text-buram-tech">{selectedSlot.batchNumber || 'UNASSIGNED'}</strong>
                  </p>
                ) : (
                  <p className="text-buram-muted">
                    Slot is currently unoccupied.
                  </p>
                )}
              </div>

              {selectedSlot.drumCode && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAction({
                        type: 'CABINET_OUT',
                        title: `Check Out ${selectedSlot.drumCode} from ${selectedSlot.slotCode}`,
                        summary: `Routes drum ${selectedSlot.drumCode} (${selectedSlot.netKg} kg) from Warm Cabinet ${selectedSlot.slotCode} to Filtration Stage.`,
                        payload: selectedSlot.slotCode,
                      })
                    }
                    className="px-3 py-1.5 rounded bg-buram-amber text-buram-ink font-mono text-xs font-semibold uppercase hover:bg-buram-gold"
                  >
                    Route to Filtration (Audited)
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT 5 COLS: GATED SOURCING PIPELINE (R1) + PRIORITY ALERTS (R10) */}
        <section className="xl:col-span-5 space-y-6">
          {/* Gated Sourcing Pipeline */}
          <div className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-buram-border">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-buram-tech" />
                <h2 className="text-base font-semibold text-buram-text">
                  Sourcing Pipeline
                </h2>
              </div>
              <StatusBadge
                label={canApproveManagementGate ? 'MGMT GATE UNLOCKED' : 'MGMT GATE READ-ONLY'}
                variant={canApproveManagementGate ? 'NOMINAL' : 'MUTED'}
              />
            </div>

            <div className="mt-3 space-y-2.5">
              {sourcingOffers.length === 0 && (
                <p className="rounded border border-buram-border bg-buram-bg/60 p-3 text-xs text-buram-muted">
                  No sourcing records are currently available.
                </p>
              )}
              {sourcingOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="p-3 rounded bg-buram-bg/80 border border-buram-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-buram-gold">
                        {offer.referenceCode}
                      </span>
                      <CountryOriginBadge countryIso={offer.originCountryIso} />
                      <StatusBadge
                        label={offer.currentStage}
                        variant={offer.currentStage === 'EXTERNAL_ANALYSIS' ? 'WARNING' : 'TECHNICAL'}
                      />
                    </div>
                    <div className="text-xs text-buram-text mt-1">
                      {offer.supplierName} â€¢ {offer.honeyVariety} â€¢{' '}
                      <KgDisplay kg={offer.offeredKg} showDrumEquivalent />
                    </div>
                  </div>

                  {offer.currentStage === 'EXTERNAL_ANALYSIS' && offer.gateStatus === 'PENDING' && (
                    <button
                      type="button"
                      disabled={!canApproveManagementGate}
                      onClick={() =>
                        setPendingAction({
                          type: 'SOURCING_APPROVE',
                          title: `Approve External Analysis Gate â€” ${offer.referenceCode}`,
                          summary: `Management gate sign-off (management:approve) for ${offer.supplierName} (${offer.offeredKg} kg ${offer.honeyVariety}) to advance to SAMPLE stage.`,
                          payload: offer.id,
                        })
                      }
                      title={
                        canApproveManagementGate
                          ? 'Approve External Analysis Gate'
                          : 'Blocked: Requires management:approve permission'
                      }
                      className="px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold bg-buram-success/20 text-buram-success border border-buram-success/50 hover:bg-buram-success/30 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      {canApproveManagementGate ? 'Approve Gate (Mgmt)' : 'Requires Mgmt Role'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Priority Alerts & Deviations (R10) */}
          <div className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-buram-border">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-buram-warning" />
                <h2 className="text-base font-semibold text-buram-text">
                  Notifications &amp; Alerts
                </h2>
              </div>
              <span className="text-xs font-mono text-buram-muted tabular-nums">
                {notifications.length} ACTIVE
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {notifications.length === 0 && (
                <p className="rounded border border-buram-border bg-buram-bg/60 p-3 text-xs text-buram-muted">
                  No active notifications or alerts for your role.
                </p>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded border text-xs ${
                    n.severity === 'CRITICAL'
                      ? 'bg-buram-critical/10 border-buram-critical/40'
                      : n.severity === 'WARNING'
                      ? 'bg-buram-warning/10 border-buram-warning/40'
                      : 'bg-buram-bg/70 border-buram-border'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono mb-1">
                    <span className="font-bold text-buram-text">{n.title}</span>
                    <span className="text-[10px] text-buram-muted tabular-nums">
                      {new Date(n.createdAt).toLocaleTimeString('de-DE')}
                    </span>
                  </div>
                  <p className="text-buram-muted">{n.message}</p>
                  {onAcknowledgeNotification && !n.acknowledged && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void onAcknowledgeNotification(n.id)}
                        className="rounded border border-buram-border bg-buram-elevated px-2 py-0.5 text-[10px] font-mono uppercase text-buram-pale hover:border-buram-amber"
                      >
                        Acknowledge
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* MASS BALANCE VERIFICATION WORKBENCH */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-buram-text">
              Mass-Balance Calculator
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
            <label className="flex flex-col">
              <span className="text-[10px] text-buram-muted">INPUT KG</span>
              <input
                type="number"
                value={simInKg}
                onChange={(e) => setSimInKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-2 py-1 text-buram-text tabular-nums"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] text-buram-muted">OUTPUT KG</span>
              <input
                type="number"
                value={simOutKg}
                onChange={(e) => setSimOutKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-2 py-1 text-buram-text tabular-nums"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] text-buram-muted">LOSS KG</span>
              <input
                type="number"
                value={simLossKg}
                onChange={(e) => setSimLossKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-2 py-1 text-buram-text tabular-nums"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] text-buram-muted">REWORK OUT KG</span>
              <input
                type="number"
                value={simReworkKg}
                onChange={(e) => setSimReworkKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-2 py-1 text-buram-text tabular-nums"
              />
            </label>
          </div>
        </div>

        <MassBalanceIndicator
          inputKg={simInKg}
          outputKg={simOutKg}
          lossKg={simLossKg}
          reworkOutKg={simReworkKg}
        />
      </section>

      {/* APPEND-ONLY STOCK MOVEMENT & AUDIT STREAM */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
        <div className="flex items-center justify-between pb-3 border-b border-buram-border">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-buram-amber" />
            <h2 className="text-base font-semibold text-buram-text">
              Recent Stock Movements
            </h2>
          </div>
          <StatusBadge label="AUDIT LEDGER" variant="NOMINAL" />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-buram-border text-buram-muted uppercase text-[11px]">
                <th className="py-2.5 px-3">Timestamp (CET)</th>
                <th className="py-2.5 px-3">Movement Type</th>
                <th className="py-2.5 px-3">Drum Code</th>
                <th className="py-2.5 px-3">Lot #</th>
                <th className="py-2.5 px-3 text-right">Delta (kg)</th>
                <th className="py-2.5 px-3 text-right">Lot Net, recent window (kg)</th>
                <th className="py-2.5 px-3">Operator</th>
                <th className="py-2.5 px-3">Audited Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-buram-border/50">
              {movements.map((m) => (
                <tr key={m.id} onClick={() => setInspectingMovement(m)} className="hover:bg-buram-elevated/70 cursor-pointer transition-colors" title="Click to view full movement details in modal">
                  <td className="py-2.5 px-3 text-buram-muted">
                    {new Date(m.timestamp).toLocaleString('de-DE')}
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge
                      label={m.movementType}
                      variant={
                        m.deltaKg > 0
                          ? 'NOMINAL'
                          : m.movementType === 'RESERVE'
                          ? 'AMBER'
                          : 'TECHNICAL'
                      }
                    />
                  </td>
                  <td className="py-2.5 px-3 font-bold text-buram-pale">{m.drumCode}</td>
                  <td className="py-2.5 px-3 text-buram-tech">{m.lotNumber}</td>
                  <td
                    className={`py-2.5 px-3 text-right font-bold ${
                      m.deltaKg >= 0 ? 'text-buram-success' : 'text-buram-warning'
                    }`}
                  >
                    {m.deltaKg >= 0 ? `+${m.deltaKg.toFixed(1)}` : m.deltaKg.toFixed(1)} kg
                  </td>
                  <td className="py-2.5 px-3 text-right text-buram-text">
                    {m.balanceAfterKg.toFixed(1)} kg
                  </td>
                  <td className="py-2.5 px-3 text-buram-muted">{m.performedBy}</td>
                  <td className="py-2.5 px-3 text-buram-text font-sans">{m.reason}</td>
                </tr>
              ))}
            </tbody>
            {movements.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={8} className="py-6 text-center text-xs text-buram-muted">
                    No stock movements recorded yet.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </section>

      {/* SOURCING OFFER DETAIL MODAL */}
      <DetailModal
        isOpen={Boolean(inspectingOffer)}
        onClose={() => setInspectingOffer(null)}
        title={inspectingOffer?.referenceCode ?? 'Sourcing Offer'}
        subtitle="Sourcing Offer Details"
        badgeLabel={inspectingOffer?.currentStage}
        badgeVariant={inspectingOffer?.currentStage === 'EXTERNAL_ANALYSIS' ? 'WARNING' : 'TECHNICAL'}
        fields={[
          { label: 'Reference Code', value: inspectingOffer?.referenceCode, isMono: true },
          { label: 'Supplier', value: inspectingOffer?.supplierName },
          { label: 'Origin Country', value: inspectingOffer?.originCountryIso, isMono: true },
          { label: 'Honey Variety', value: inspectingOffer?.honeyVariety },
          { label: 'Offered Weight', value: `${inspectingOffer?.offeredKg?.toLocaleString('de-DE')} kg`, isMono: true },
          { label: 'Estimated Drums', value: inspectingOffer?.estimatedDrums, isMono: true },
          { label: 'Current Stage', value: inspectingOffer?.currentStage, isMono: true },
          { label: 'Gate Status', value: inspectingOffer?.gateStatus, isMono: true },
          { label: 'Last Updated', value: inspectingOffer?.updatedAt ? new Date(inspectingOffer.updatedAt).toLocaleString('de-DE') : '—' },
          { label: 'Updated By', value: inspectingOffer?.updatedBy ?? 'Server' },
        ]}
        actions={
          inspectingOffer?.currentStage === 'EXTERNAL_ANALYSIS' && inspectingOffer?.gateStatus === 'PENDING' && canApproveManagementGate ? (
            <button
              type="button"
              onClick={() => {
                const target = inspectingOffer;
                setInspectingOffer(null);
                setPendingAction({
                  type: 'SOURCING_APPROVE',
                  title: `Approve External Analysis Gate — ${target.referenceCode}`,
                  summary: `Management gate sign-off (management:approve) for ${target.supplierName} (${target.offeredKg} kg ${target.honeyVariety}) to advance to SAMPLE stage.`,
                  payload: target.id,
                });
              }}
              className="px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold bg-buram-success text-buram-ink hover:bg-buram-success/90"
            >
              Approve Gate (Mgmt)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setInspectingOffer(null)}
              className="px-3 py-1.5 rounded text-xs font-mono uppercase font-semibold bg-buram-elevated border border-buram-border text-buram-pale hover:border-buram-amber"
            >
              Close
            </button>
          )
        }
      />

      {/* STOCK MOVEMENT DETAIL MODAL */}
      <DetailModal
        isOpen={Boolean(inspectingMovement)}
        onClose={() => setInspectingMovement(null)}
        title={`Stock Movement: ${inspectingMovement?.movementType ?? ''}`}
        subtitle="Immutable Audit Ledger Entry"
        badgeLabel={inspectingMovement?.movementType}
        badgeVariant={
          (inspectingMovement?.deltaKg ?? 0) >= 0 ? 'NOMINAL' : 'WARNING'
        }
        fields={[
          { label: 'Movement ID', value: inspectingMovement?.id, isMono: true },
          { label: 'Timestamp (CET)', value: inspectingMovement ? new Date(inspectingMovement.timestamp).toLocaleString('de-DE') : '—' },
          { label: 'Movement Type', value: inspectingMovement?.movementType, isMono: true },
          { label: 'Drum Code', value: inspectingMovement?.drumCode, isMono: true },
          { label: 'Lot Number', value: inspectingMovement?.lotNumber, isMono: true },
          { label: 'Delta Weight', value: inspectingMovement ? `${inspectingMovement.deltaKg >= 0 ? '+' : ''}${inspectingMovement.deltaKg.toFixed(1)} kg` : '—', isMono: true },
          { label: 'Lot Net (Recent Window)', value: inspectingMovement ? `${inspectingMovement.balanceAfterKg.toFixed(1)} kg` : '—', isMono: true },
          { label: 'Performed By', value: inspectingMovement?.performedBy },
        ]}
      >
        <div className="p-3 rounded-lg bg-buram-elevated/40 border border-buram-border space-y-1">
          <div className="text-[10px] font-mono uppercase text-buram-muted">Audited Reason</div>
          <div className="text-xs text-buram-text font-sans">{inspectingMovement?.reason || 'No reason provided.'}</div>
        </div>
      </DetailModal>

      {/* MANDATORY REASON DIALOG FOR AUDITED ACTIONS */}
      {actionError && (
        <p
          className="fixed bottom-4 right-4 z-[60] max-w-lg rounded border border-buram-critical/50 bg-buram-surface px-4 py-3 text-sm text-buram-critical shadow-panel"
          role="alert"
        >
          Operation failed: {actionError}
        </p>
      )}
      <ReasonDialog
        isOpen={Boolean(pendingAction)}
        title={pendingAction?.title || ''}
        actionSummary={pendingAction?.summary || ''}
        isSubmitting={isSubmitting}
        onCancel={() => {
          setPendingAction(null);
          setActionError('');
        }}
        onConfirm={handleConfirmReason}
      />
    </div>
  );
};