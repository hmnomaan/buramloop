// client/src/pages/WarmCabinetsWorkspace.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Layers,
  QrCode,
  Radio,
  RefreshCw,
  Thermometer,
  Warehouse,
} from 'lucide-react';
import { BatchPlan, WarmCabinetSlot } from '../types/erp';
import {
  CountryOriginBadge,
  FeedbackModal,
  FeedbackModalState,
  KgDisplay,
  ReasonDialog,
  StatusBadge,
  TemperatureDisplay,
} from '../components/ui/IndustrialPrimitives';
import {
  MobileCameraBarcodeModal,
} from '../components/ui/FlowAndInfoPrimitives';
import { ScannedLabelData } from '../lib/labelOcr';
import { apiClient } from '../lib/apiClient';

const WARMING_HOUR_PRESETS = [6, 12, 18, 24, 30, 36, 42, 48] as const;

interface EligibleDrumOption {
  _id: string;
  drumCode: string;
  barcode?: string;
  country: string;
  netKg: number;
  status: string;
  location: string;
  reservedBatchId?: string | null;
  incomingLotId?: { _id: string; lotNo: string; status: string } | string | null;
  materialId?: { _id: string; code: string; name: string } | string | null;
}

interface ServerBatchOption {
  _id: string;
  processNo: string;
  status: string;
  plannedKg: number;
  approvedKg: number;
  allowedCountries?: string[];
  customerId?: { _id: string; name: string; allowedCountries?: string[] } | string | null;
  baseMaterialId?: { _id: string; code: string; name: string } | string | null;
}

interface OperatorNoteEntry {
  id: string;
  timestamp: string;
  slotCode: string;
  drumCode: string;
  batchNo?: string;
  warmingHours?: number;
  tempC?: number;
  note: string;
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '00:00:00 (READY)';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(
    seconds
  ).padStart(2, '0')}s`;
}

/**
 * Computes real-time simulated drum/cabinet temperature between ambient (20°C)
 * and target temperature (default 45°C) based on conditioning progress.
 * Designed so future hardware/IoT room sensors can override with live sensor telemetry.
 */
function computeRealTimeSlotTemp(slot: WarmCabinetSlot, nowMs: number): {
  currentTempC: number;
  targetTempC: number;
  progressPct: number;
  isReadyByTime: boolean;
  isReadyByTemp: boolean;
  remainingMs: number;
} {
  const targetTempC = slot.targetTempC ?? 45;
  if (slot.state === 'EMPTY' || !slot.checkedInAt || !slot.targetReadyAt) {
    return {
      currentTempC: 20,
      targetTempC,
      progressPct: 0,
      isReadyByTime: false,
      isReadyByTemp: false,
      remainingMs: 0,
    };
  }

  const startMs = new Date(slot.checkedInAt).getTime();
  const readyMs = new Date(slot.targetReadyAt).getTime();
  const totalDurationMs = Math.max(1000, readyMs - startMs);
  const elapsedMs = Math.max(0, nowMs - startMs);
  const remainingMs = Math.max(0, readyMs - nowMs);
  const ratio = Math.min(1, elapsedMs / totalDurationMs);
  const progressPct = Number((ratio * 100).toFixed(1));

  const ambientTempC = 20;
  const simulatedTempC = Number(
    (ambientTempC + (targetTempC - ambientTempC) * ratio).toFixed(1)
  );
  const currentTempC =
    ratio >= 1 ? targetTempC : Math.max(ambientTempC, simulatedTempC);

  return {
    currentTempC,
    targetTempC,
    progressPct,
    isReadyByTime: remainingMs <= 0,
    isReadyByTemp: currentTempC >= targetTempC,
    remainingMs,
  };
}

export const WarmCabinetsWorkspace: React.FC<{
  cabinetSlots: WarmCabinetSlot[];
  batches?: BatchPlan[];
  onRefresh: () => void;
}> = ({ cabinetSlots, batches = [], onRefresh }) => {
  const [selectedSlotCode, setSelectedSlotCode] = useState<string>(
    cabinetSlots.find((s) => s.state === 'EMPTY')?.slotCode ??
      cabinetSlots[0]?.slotCode ??
      'CAB-A-01'
  );
  const [drumIdInput, setDrumIdInput] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [presetMode, setPresetMode] = useState<'PRESET' | 'CUSTOM'>('PRESET');
  const [warmingHours, setWarmingHours] = useState<number>(24);
  const [customHoursInput, setCustomHoursInput] = useState<string>('24');
  const [targetTempCInput, setTargetTempCInput] = useState<number>(45);
  const [notes, setNotes] = useState('');
  const [autoAdvanceEmptySlot, setAutoAdvanceEmptySlot] = useState(true);

  const [eligibleDrums, setEligibleDrums] = useState<EligibleDrumOption[]>([]);
  const [serverBatches, setServerBatches] = useState<ServerBatchOption[]>([]);
  const [isLoadingAux, setIsLoadingAux] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    | { mode: 'CHECK_IN' | 'OUT_FILTRATION' | 'OUT_WAREHOUSE'; slot: WarmCabinetSlot }
    | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState | null>(null);

  // Real-time 1-second clock for live date, countdowns, temperature rise, and ready alerts
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [dismissedReadySlotCodes, setDismissedReadySlotCodes] = useState<string[]>([]);
  const [operatorNotesLog, setOperatorNotesLog] = useState<OperatorNoteEntry[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadDrumsAndBatches = useCallback(async () => {
    setIsLoadingAux(true);
    try {
      const [drumsRes, batchesRes] = await Promise.all([
        apiClient
          .request<EligibleDrumOption[]>('/stock/drums')
          .catch(() => [] as EligibleDrumOption[]),
        apiClient
          .request<ServerBatchOption[]>('/batches')
          .catch(() => [] as ServerBatchOption[]),
      ]);

      const warmEligible = drumsRes.filter((drum) =>
        ['Reserved', 'Approved', 'InWarehouse'].includes(drum.status)
      );
      setEligibleDrums(warmEligible);
      setServerBatches(
        batchesRes.filter((b) => ['RESERVED', 'WARMING', 'FEASIBLE'].includes(b.status))
      );
    } finally {
      setIsLoadingAux(false);
    }
  }, []);

  useEffect(() => {
    void loadDrumsAndBatches();
  }, [loadDrumsAndBatches, cabinetSlots]);

  const effectiveSlots = useMemo<WarmCabinetSlot[]>(() => {
    if (cabinetSlots.length > 0) return cabinetSlots;
    // Fallback 34 empty slots if backend has not returned cabinets yet
    return (['CABINET_A', 'CABINET_B'] as const).flatMap((cabinetId) => {
      const prefix = cabinetId === 'CABINET_A' ? 'CAB-A' : 'CAB-B';
      return Array.from({ length: 17 }, (_, idx) => ({
        cabinetId,
        positionIndex: idx + 1,
        slotCode: `${prefix}-${String(idx + 1).padStart(2, '0')}`,
        state: 'EMPTY' as const,
      }));
    });
  }, [cabinetSlots]);

  const selectedSlot = useMemo(
    () =>
      effectiveSlots.find((s) => s.slotCode === selectedSlotCode) ??
      effectiveSlots[0] ??
      null,
    [effectiveSlots, selectedSlotCode]
  );

  // Merge serverBatches and prop batches so the operator always sees feasible/reserved batches
  const batchOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; processNo: string; status: string; plannedKg: number; customerName: string }
    >();
    for (const sb of serverBatches) {
      const custName =
        typeof sb.customerId === 'object' && sb.customerId?.name
          ? sb.customerId.name
          : 'Customer';
      map.set(sb._id, {
        id: sb._id,
        processNo: sb.processNo,
        status: sb.status,
        plannedKg: sb.approvedKg || sb.plannedKg,
        customerName: custName,
      });
    }
    for (const pb of batches) {
      if (!map.has(pb.id)) {
        map.set(pb.id, {
          id: pb.id,
          processNo: pb.batchNumber,
          status: pb.status,
          plannedKg: pb.plannedInputKg,
          customerName: pb.customerName,
        });
      }
    }
    return [...map.values()];
  }, [batches, serverBatches]);

  // Filter / sort eligible drums: drums reserved for the selected batch appear first
  const sortedEligibleDrums = useMemo(() => {
    return [...eligibleDrums].sort((a, b) => {
      const aMatchesBatch =
        selectedBatchId && String(a.reservedBatchId ?? '') === selectedBatchId ? 1 : 0;
      const bMatchesBatch =
        selectedBatchId && String(b.reservedBatchId ?? '') === selectedBatchId ? 1 : 0;
      if (bMatchesBatch !== aMatchesBatch) return bMatchesBatch - aMatchesBatch;
      if (a.status === 'Reserved' && b.status !== 'Reserved') return -1;
      if (b.status === 'Reserved' && a.status !== 'Reserved') return 1;
      return a.drumCode.localeCompare(b.drumCode);
    });
  }, [eligibleDrums, selectedBatchId]);

  const matchedScannedDrum = useMemo(() => {
    const query = drumIdInput.trim().toUpperCase();
    if (!query) return null;
    return (
      eligibleDrums.find(
        (d) =>
          d._id.toUpperCase() === query ||
          d.drumCode.toUpperCase() === query ||
          (d.barcode && d.barcode.toUpperCase() === query)
      ) ?? null
    );
  }, [drumIdInput, eligibleDrums]);

  // Auto-select batch if scanned drum is already reserved for a batch
  useEffect(() => {
    if (matchedScannedDrum?.reservedBatchId && !selectedBatchId) {
      setSelectedBatchId(String(matchedScannedDrum.reservedBatchId));
    }
  }, [matchedScannedDrum, selectedBatchId]);

  const occupiedSlots = useMemo(
    () => effectiveSlots.filter((s) => s.state !== 'EMPTY'),
    [effectiveSlots]
  );

  const readyAlertSlots = useMemo(() => {
    return occupiedSlots.filter((slot) => {
      const telemetry = computeRealTimeSlotTemp(slot, nowMs);
      return telemetry.isReadyByTime || telemetry.isReadyByTemp;
    });
  }, [nowMs, occupiedSlots]);

  const activeUnacknowledgedAlerts = useMemo(
    () =>
      readyAlertSlots.filter((slot) => !dismissedReadySlotCodes.includes(slot.slotCode)),
    [dismissedReadySlotCodes, readyAlertSlots]
  );

  const totalOccupiedKg = useMemo(
    () => occupiedSlots.reduce((sum, s) => sum + (s.netKg ?? 0), 0),
    [occupiedSlots]
  );

  const estimatedReadyDate = useMemo(
    () => new Date(nowMs + Math.max(1, warmingHours) * 3600 * 1000),
    [nowMs, warmingHours]
  );

  const handleBarcodeCaptured = (barcode: string) => {
    const cleaned = barcode.trim().toUpperCase();
    setDrumIdInput(cleaned);
    setIsScannerOpen(false);
    setSuccessBanner(`Scanned drum label: ${cleaned}`);
  };

  const handleLabelExtracted = (data: ScannedLabelData) => {
    const code = (data.fields.barcode || '').trim().toUpperCase();
    if (code) {
      setDrumIdInput(code);
    }
    if (data.fields.rawText) {
      setNotes((prev) =>
        prev
          ? `${prev} | OCR: ${data.fields.rawText.slice(0, 120)}`
          : `Label OCR: ${data.fields.rawText.slice(0, 120)}`
      );
    }
    setIsScannerOpen(false);
    setSuccessBanner(`Extracted drum label data${code ? ` (${code})` : ''}.`);
  };

  const handleConfirm = async (reason: string) => {
    if (!pendingAction) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessBanner(null);

    const cabinetCode =
      pendingAction.slot.cabinetId === 'CABINET_A' ? 'CAB-01' : 'CAB-02';
    try {
      if (pendingAction.mode === 'CHECK_IN') {
        const drumRefToSubmit = matchedScannedDrum?._id ?? drumIdInput.trim();
        await apiClient.auditedMutation('/warm-room/check-in', 'POST', {
          body: {
            cabinetCode,
            slotNo: pendingAction.slot.positionIndex,
            drumId: drumRefToSubmit,
            ...(selectedBatchId ? { batchId: selectedBatchId } : {}),
            warmingHours,
            targetTempC: targetTempCInput,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
          reason,
        });

        const loggedDrumCode = matchedScannedDrum?.drumCode ?? drumIdInput.trim().toUpperCase();
        const selectedBatchObj = batchOptions.find((b) => b.id === selectedBatchId);

        if (notes.trim()) {
          setOperatorNotesLog((prev) => [
            {
              id: `${Date.now()}-${pendingAction.slot.slotCode}`,
              timestamp: new Date().toISOString(),
              slotCode: pendingAction.slot.slotCode,
              drumCode: loggedDrumCode,
              batchNo: selectedBatchObj?.processNo,
              warmingHours,
              tempC: targetTempCInput,
              note: notes.trim(),
            },
            ...prev,
          ]);
        }

        const successMsg = `Checked in drum ${loggedDrumCode} to ${pendingAction.slot.slotCode} for ${warmingHours}h (target ${targetTempCInput}°C).`;
        setSuccessBanner(successMsg);
        setFeedbackModal({
          isOpen: true,
          variant: 'SUCCESS',
          title: 'Drum Checked In!',
          detailBadge: `${pendingAction.slot.slotCode} · ${loggedDrumCode}`,
          message: `${successMsg}${selectedBatchObj ? ` Linked to Batch ${selectedBatchObj.processNo}.` : ''}`,
        });
        setDrumIdInput('');
        setNotes('');

        if (autoAdvanceEmptySlot) {
          const nextEmpty = effectiveSlots.find(
            (s) =>
              s.state === 'EMPTY' && s.slotCode !== pendingAction.slot.slotCode
          );
          if (nextEmpty) {
            setSelectedSlotCode(nextEmpty.slotCode);
          }
        }
      } else {
        const destination =
          pendingAction.mode === 'OUT_FILTRATION' ? 'FILTRATION' : 'WAREHOUSE';
        await apiClient.auditedMutation('/warm-room/check-out', 'POST', {
          body: {
            cabinetCode,
            slotNo: pendingAction.slot.positionIndex,
            destination,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
          reason,
        });

        if (notes.trim()) {
          setOperatorNotesLog((prev) => [
            {
              id: `${Date.now()}-${pendingAction.slot.slotCode}`,
              timestamp: new Date().toISOString(),
              slotCode: pendingAction.slot.slotCode,
              drumCode: pendingAction.slot.drumCode ?? 'DRUM',
              batchNo: pendingAction.slot.batchNumber,
              note: `[CHECK-OUT -> ${destination}] ${notes.trim()}`,
            },
            ...prev,
          ]);
        }

        const outMsg = `Checked out ${pendingAction.slot.drumCode ?? 'drum'} from ${pendingAction.slot.slotCode} to ${destination}.`;
        setSuccessBanner(outMsg);
        setFeedbackModal({
          isOpen: true,
          variant: 'SUCCESS',
          title:
            destination === 'FILTRATION'
              ? 'Released to Filtration!'
              : 'Returned to Warehouse!',
          detailBadge: `${pendingAction.slot.slotCode} → ${destination}`,
          message: outMsg,
        });
        setNotes('');
      }

      setPendingAction(null);
      onRefresh();
      await loadDrumsAndBatches();
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Warm cabinet operation rejected by server.';
      setErrorMessage(errMsg);
      setFeedbackModal({
        isOpen: true,
        variant: 'ERROR',
        title: 'Warm Cabinet Action Failed',
        detailBadge: pendingAction.slot.slotCode,
        message: errMsg,
      });
      setPendingAction(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cabinetASlots = useMemo(
    () => effectiveSlots.filter((s) => s.cabinetId === 'CABINET_A'),
    [effectiveSlots]
  );
  const cabinetBSlots = useMemo(
    () => effectiveSlots.filter((s) => s.cabinetId === 'CABINET_B'),
    [effectiveSlots]
  );

  const selectedSlotTelemetry = useMemo(
    () =>
      selectedSlot
        ? computeRealTimeSlotTemp(selectedSlot, nowMs)
        : null,
    [nowMs, selectedSlot]
  );

  return (
    <div className="space-y-5">
      {/* Header with Live Date/Time & Sensor Status */}
      <header className="flex flex-col gap-3 border-b border-buram-border pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 text-buram-amber" />
          <div>
            <span className="block text-[11px] font-mono uppercase tracking-widest text-buram-amber">
              WARM ROOM
            </span>
            <h1 className="text-xl font-bold text-buram-text">
              Warm Cabinets (2 × 17)
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
          <div className="flex items-center gap-2 rounded border border-buram-border bg-buram-surface px-3 py-1.5 text-buram-text">
            <Clock className="h-3.5 w-3.5 text-buram-amber" />
            <span className="tabular-nums font-bold">
              {new Date(nowMs).toLocaleDateString('de-DE')}{' '}
              {new Date(nowMs).toLocaleTimeString('de-DE')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onRefresh();
              void loadDrumsAndBatches();
            }}
            disabled={isLoadingAux}
            className="inline-flex items-center gap-1.5 rounded border border-buram-border bg-buram-elevated px-3 py-1.5 text-xs font-mono text-buram-text hover:border-buram-amber"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Cabinets
          </button>
        </div>
      </header>

      {/* Real-time Target Time / Temperature Ready Notification Banner */}
      {activeUnacknowledgedAlerts.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-buram-success/70 bg-buram-success/15 p-4 font-mono text-xs text-buram-text shadow-panel sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <BellRing className="h-5 w-5 shrink-0 text-buram-success animate-bounce mt-0.5" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm uppercase text-buram-success">
                  Warming Target Reached · {activeUnacknowledgedAlerts.length} Drum(s) Ready for Filtration
                </strong>
                <StatusBadge label="TARGET TIME & TEMP REACHED" variant="NOMINAL" />
              </div>
              <p className="text-buram-muted">
                {activeUnacknowledgedAlerts
                  .map(
                    (s) =>
                      `${s.slotCode} (${s.drumCode ?? 'Drum'}${
                        s.batchNumber ? ` · Batch ${s.batchNumber}` : ''
                      })`
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedSlotCode(activeUnacknowledgedAlerts[0].slotCode);
              }}
              className="rounded bg-buram-success px-3 py-1.5 font-bold uppercase text-buram-bg hover:opacity-90"
            >
              Inspect Ready Slot
            </button>
            <button
              type="button"
              onClick={() =>
                setDismissedReadySlotCodes((prev) => [
                  ...new Set([
                    ...prev,
                    ...activeUnacknowledgedAlerts.map((s) => s.slotCode),
                  ]),
                ])
              }
              className="rounded border border-buram-border bg-buram-surface px-2.5 py-1.5 text-buram-muted hover:text-buram-text"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded border border-buram-critical/50 bg-buram-critical/15 p-3 text-xs font-mono text-buram-critical"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successBanner && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded border border-buram-success/50 bg-buram-success/15 p-3 text-xs font-mono text-buram-success"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successBanner}
          </span>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-[11px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Telemetry Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
        <div className="rounded-lg border border-buram-border bg-buram-surface p-3.5">
          <span className="text-[10px] uppercase text-buram-muted block">
            Cabinet Occupancy (2 × 17 Slots)
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <strong className="text-lg text-buram-text tabular-nums">
              {occupiedSlots.length} / 34 Slots
            </strong>
            <StatusBadge
              label={`${34 - occupiedSlots.length} FREE`}
              variant={occupiedSlots.length < 34 ? 'NOMINAL' : 'WARNING'}
            />
          </div>
        </div>

        <div className="rounded-lg border border-buram-border bg-buram-surface p-3.5">
          <span className="text-[10px] uppercase text-buram-muted block">
            Conditioning Honey Mass
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <KgDisplay kg={totalOccupiedKg} size="md" />
            <span className="text-[11px] text-buram-gold">Max 9,860 kg</span>
          </div>
        </div>

        <div className="rounded-lg border border-buram-border bg-buram-surface p-3.5">
          <span className="text-[10px] uppercase text-buram-muted block">
            Ready for Filtration
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <strong className="text-lg text-buram-success tabular-nums">
              {readyAlertSlots.length} Drum(s)
            </strong>
            <StatusBadge
              label={readyAlertSlots.length > 0 ? 'READY ALERT' : 'WARMING'}
              variant={readyAlertSlots.length > 0 ? 'NOMINAL' : 'AMBER'}
            />
          </div>
        </div>

        <div className="rounded-lg border border-buram-border bg-buram-surface p-3.5">
          <span className="text-[10px] uppercase text-buram-muted block">
            Thermal Sensor &amp; Timer Mode
          </span>
          <div className="mt-1 flex items-center justify-between">
            <TemperatureDisplay celsius={targetTempCInput} />
            <span className="inline-flex items-center gap-1 text-[11px] text-buram-tech">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              Live Sim + Timer
            </span>
          </div>
        </div>
      </div>

      {/* Operator One-by-One Drum Scanner + Batch Assignment + Timing & Notes Bar */}
      <section className="rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel space-y-4 font-mono text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-buram-border pb-3">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-buram-amber" />
            <h2 className="text-sm font-bold uppercase text-buram-text">
              Drum Check-In &amp; Conditioning Setup
            </h2>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] text-buram-muted">
            <input
              type="checkbox"
              checked={autoAdvanceEmptySlot}
              onChange={(e) => setAutoAdvanceEmptySlot(e.target.checked)}
            />
            <span>Auto-advance to next empty slot</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Column 1: Scan Drum Label or Select Eligible Drum */}
          <div className="space-y-2.5 rounded border border-buram-border bg-buram-bg/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="uppercase text-[11px] font-bold text-buram-amber">
                1. Drum Selection
              </span>
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded bg-buram-amber px-2.5 py-1 text-[11px] font-bold uppercase text-buram-bg hover:bg-buram-gold"
              >
                <Camera className="h-3.5 w-3.5" />
                Scan Label
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] text-buram-muted">
                Barcode / Drum Code
              </span>
              <input
                type="text"
                value={drumIdInput}
                onChange={(e) => setDrumIdInput(e.target.value)}
                placeholder="e.g. DR-26-0001 or scan barcode..."
                className="w-full rounded border border-buram-border bg-buram-surface px-3 py-2 font-bold text-buram-gold placeholder:text-buram-muted/50"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] text-buram-muted">
                Eligible Drums ({sortedEligibleDrums.length})
              </span>
              <select
                value={matchedScannedDrum?._id ?? ''}
                onChange={(e) => {
                  const chosen = eligibleDrums.find((d) => d._id === e.target.value);
                  if (chosen) {
                    setDrumIdInput(chosen.drumCode);
                    if (chosen.reservedBatchId) {
                      setSelectedBatchId(String(chosen.reservedBatchId));
                    }
                  }
                }}
                className="w-full rounded border border-buram-border bg-buram-surface px-2.5 py-1.5 text-buram-text"
              >
                <option value="">Select eligible warehouse drum...</option>
                {sortedEligibleDrums.map((drum) => (
                  <option key={drum._id} value={drum._id}>
                    {drum.drumCode} · {drum.country} · {drum.netKg} kg [{drum.status}]
                  </option>
                ))}
              </select>
            </label>

            {matchedScannedDrum && (
              <div className="flex items-center justify-between rounded border border-buram-success/40 bg-buram-success/10 px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <strong className="text-buram-gold">{matchedScannedDrum.drumCode}</strong>
                  <CountryOriginBadge countryIso={matchedScannedDrum.country} />
                  <span className="text-buram-muted">{matchedScannedDrum.status}</span>
                </div>
                <KgDisplay kg={matchedScannedDrum.netKg} size="sm" />
              </div>
            )}
          </div>

          {/* Column 2: Link to Server-Feasible / Reserved Batch & Timing Presets */}
          <div className="space-y-2.5 rounded border border-buram-border bg-buram-bg/60 p-3.5">
            <span className="uppercase text-[11px] font-bold text-buram-amber block">
              2. Batch &amp; Duration
            </span>

            <label className="block space-y-1">
              <span className="text-[11px] text-buram-muted flex items-center gap-1">
                <Layers className="h-3 w-3 text-buram-gold" />
                Batch Assignment
              </span>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full rounded border border-buram-border bg-buram-surface px-2.5 py-2 font-bold text-buram-text"
              >
                <option value="">Unassigned / Pre-Warming Conditioning</option>
                {batchOptions.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.processNo} — {batch.customerName} ({batch.plannedKg} kg · {batch.status})
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-buram-muted">
                  Target Warming Time (Hours)
                </span>
                <span className="text-[11px] font-bold text-buram-tech">
                  Ready: {estimatedReadyDate.toLocaleDateString('de-DE')}{' '}
                  {estimatedReadyDate.toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {WARMING_HOUR_PRESETS.map((preset) => {
                  const isSelected = presetMode === 'PRESET' && warmingHours === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setPresetMode('PRESET');
                        setWarmingHours(preset);
                        setCustomHoursInput(String(preset));
                      }}
                      className={`rounded border px-2 py-1.5 text-center font-bold transition-colors ${
                        isSelected
                          ? 'border-buram-amber bg-buram-amber text-buram-bg'
                          : 'border-buram-border bg-buram-surface text-buram-text hover:border-buram-amber/50'
                      }`}
                    >
                      {preset}h
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPresetMode('CUSTOM')}
                  className={`col-span-2 rounded border px-2 py-1.5 text-center font-bold transition-colors ${
                    presetMode === 'CUSTOM'
                      ? 'border-buram-tech bg-buram-tech text-buram-bg'
                      : 'border-buram-border bg-buram-surface text-buram-tech hover:border-buram-tech/50'
                  }`}
                >
                  Custom ({warmingHours}h)
                </button>
              </div>

              {presetMode === 'CUSTOM' && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    value={customHoursInput}
                    onChange={(e) => {
                      setCustomHoursInput(e.target.value);
                      const parsed = Number(e.target.value);
                      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 120) {
                        setWarmingHours(Math.round(parsed));
                      }
                    }}
                    placeholder="Custom hours (1-120)"
                    className="w-full rounded border border-buram-tech bg-buram-surface px-2.5 py-1.5 font-bold text-buram-tech"
                  />
                  <span className="text-[11px] text-buram-muted shrink-0">hours (1–120h)</span>
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Target Temperature (Sensor Hook) & Operator Notes */}
          <div className="space-y-2.5 rounded border border-buram-border bg-buram-bg/60 p-3.5">
            <div className="flex items-center justify-between">
              <span className="uppercase text-[11px] font-bold text-buram-amber">
                3. Temperature &amp; Notes
              </span>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] text-buram-muted flex items-center gap-1">
                <Thermometer className="h-3 w-3 text-buram-tech" />
                Target Temperature (°C)
              </span>
              <input
                type="number"
                min="25"
                max="65"
                step="0.5"
                value={targetTempCInput}
                onChange={(e) => setTargetTempCInput(Number(e.target.value) || 45)}
                className="w-full rounded border border-buram-border bg-buram-surface px-2.5 py-1.5 font-bold text-buram-tech"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] text-buram-muted flex items-center gap-1">
                <FileText className="h-3 w-3 text-buram-gold" />
                Notes
              </span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional conditioning notes..."
                className="w-full rounded border border-buram-border bg-buram-surface px-2.5 py-1.5 text-buram-text placeholder:text-buram-muted/50"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Main Workspace Grid: Dual 17-Slot Cabinets + Selected Slot Action Terminal */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Left 2 Columns: CAB-01 and CAB-02 17-Slot Grids */}
        <div className="xl:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            { code: 'CAB-01', title: 'Cabinet A (CAB-01)', slots: cabinetASlots },
            { code: 'CAB-02', title: 'Cabinet B (CAB-02)', slots: cabinetBSlots },
          ].map((cab) => {
            const occupiedCount = cab.slots.filter((s) => s.state !== 'EMPTY').length;
            return (
              <div
                key={cab.code}
                className="rounded-lg border border-buram-border bg-buram-surface p-4 shadow-panel space-y-3 font-mono text-xs"
              >
                <div className="flex items-center justify-between border-b border-buram-border pb-2.5">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-buram-amber block">
                      {cab.code} · 17 DRUM SLOTS
                    </span>
                    <h3 className="text-sm font-bold text-buram-text">{cab.title}</h3>
                  </div>
                  <StatusBadge
                    label={`${occupiedCount} / 17 OCCUPIED`}
                    variant={occupiedCount === 17 ? 'WARNING' : 'TECHNICAL'}
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {cab.slots.map((slot) => {
                    const isSelected = selectedSlot?.slotCode === slot.slotCode;
                    const occupied = slot.state !== 'EMPTY';
                    const telemetry = computeRealTimeSlotTemp(slot, nowMs);

                    return (
                      <button
                        key={slot.slotCode}
                        type="button"
                        onClick={() => setSelectedSlotCode(slot.slotCode)}
                        className={`w-full rounded border p-2.5 text-left transition-all ${
                          isSelected
                            ? 'border-buram-amber bg-buram-amber/15 ring-1 ring-buram-amber'
                            : occupied
                              ? telemetry.isReadyByTime
                                ? 'border-buram-success/60 bg-buram-success/10 hover:border-buram-success'
                                : 'border-buram-tech/40 bg-buram-bg/90 hover:border-buram-tech'
                              : 'border-buram-border bg-buram-bg/40 hover:border-buram-amber/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <strong className="text-buram-text">{slot.slotCode}</strong>
                          {occupied ? (
                            <StatusBadge
                              label={
                                telemetry.isReadyByTime
                                  ? 'READY'
                                  : `${telemetry.currentTempC.toFixed(1)}°C`
                              }
                              variant={telemetry.isReadyByTime ? 'NOMINAL' : 'AMBER'}
                            />
                          ) : (
                            <span className="text-[10px] uppercase text-buram-muted">
                              EMPTY
                            </span>
                          )}
                        </div>

                        {occupied ? (
                          <div className="mt-1.5 space-y-1 text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-buram-gold">
                                {slot.drumCode ?? slot.drumId}
                              </span>
                              {slot.originCountryIso && (
                                <CountryOriginBadge countryIso={slot.originCountryIso} />
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-buram-muted">
                              <span>
                                {slot.batchNumber ? `Batch ${slot.batchNumber}` : 'No Batch'}
                              </span>
                              <span className="tabular-nums text-buram-tech">
                                {telemetry.isReadyByTime
                                  ? 'READY FOR FILTRATION'
                                  : formatDurationMs(telemetry.remainingMs)}
                              </span>
                            </div>
                            {slot.notes && (
                              <p className="truncate text-[10px] text-buram-pale/80 italic">
                                “{slot.notes}”
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-[10px] text-buram-muted">
                            Click to check in scanned drum
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Selected Slot Action & Telemetry Details + Operator Notes Log */}
        <div className="space-y-4 font-mono text-xs">
          <div className="rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel space-y-4">
            {selectedSlot ? (
              <>
                <div className="flex items-center justify-between border-b border-buram-border pb-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-buram-amber block">
                      SELECTED CABINET SLOT
                    </span>
                    <h3 className="text-base font-bold text-buram-text">
                      {selectedSlot.slotCode} (Slot #{selectedSlot.positionIndex})
                    </h3>
                  </div>
                  <StatusBadge
                    label={
                      selectedSlot.state === 'EMPTY'
                        ? 'EMPTY · READY FOR CHECK-IN'
                        : selectedSlotTelemetry?.isReadyByTime
                          ? 'CONDITIONING COMPLETE'
                          : 'WARMING IN PROGRESS'
                    }
                    variant={
                      selectedSlot.state === 'EMPTY'
                        ? 'MUTED'
                        : selectedSlotTelemetry?.isReadyByTime
                          ? 'NOMINAL'
                          : 'AMBER'
                    }
                  />
                </div>

                {selectedSlot.state !== 'EMPTY' && selectedSlotTelemetry ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2.5 rounded border border-buram-border bg-buram-bg/70 p-3">
                      <div>
                        <span className="text-[10px] uppercase text-buram-muted block">
                          Drum Code
                        </span>
                        <strong className="text-sm text-buram-gold">
                          {selectedSlot.drumCode ?? selectedSlot.drumId ?? '—'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-buram-muted block">
                          Net Weight / Origin
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <KgDisplay kg={selectedSlot.netKg} size="sm" />
                          {selectedSlot.originCountryIso && (
                            <CountryOriginBadge countryIso={selectedSlot.originCountryIso} />
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-buram-muted block">
                          Assigned Batch
                        </span>
                        <strong className="text-buram-text">
                          {selectedSlot.batchNumber ?? 'Unassigned'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-buram-muted block">
                          Real-Time Temperature
                        </span>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <TemperatureDisplay celsius={selectedSlotTelemetry.currentTempC} />
                          <span className="text-[10px] text-buram-muted">
                            / {selectedSlotTelemetry.targetTempC}°C
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Real-time Countdown & Thermal Progress Bar */}
                    <div className="space-y-1.5 rounded border border-buram-border bg-buram-bg/60 p-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-buram-muted">Conditioning Progress</span>
                        <strong className="text-buram-tech tabular-nums">
                          {selectedSlotTelemetry.progressPct}% ·{' '}
                          {formatDurationMs(selectedSlotTelemetry.remainingMs)}
                        </strong>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded bg-buram-surface">
                        <div
                          className={`h-full transition-all duration-500 ${
                            selectedSlotTelemetry.isReadyByTime
                              ? 'bg-buram-success'
                              : 'bg-buram-amber'
                          }`}
                          style={{ width: `${selectedSlotTelemetry.progressPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-buram-muted pt-1">
                        <span>
                          In:{' '}
                          {selectedSlot.checkedInAt
                            ? new Date(selectedSlot.checkedInAt).toLocaleString('de-DE')
                            : '—'}
                        </span>
                        <span>
                          Ready:{' '}
                          {selectedSlot.targetReadyAt
                            ? new Date(selectedSlot.targetReadyAt).toLocaleString('de-DE')
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {selectedSlot.notes && (
                      <div className="rounded border border-buram-amber/40 bg-buram-amber/10 p-2.5 text-[11px]">
                        <span className="text-[10px] uppercase text-buram-amber block font-bold">
                          Recorded Slot Notes
                        </span>
                        <p className="mt-0.5 text-buram-text">{selectedSlot.notes}</p>
                      </div>
                    )}

                    <div className="space-y-2 pt-2">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() =>
                          setPendingAction({ mode: 'OUT_FILTRATION', slot: selectedSlot })
                        }
                        className="w-full inline-flex items-center justify-center gap-2 rounded bg-buram-success px-4 py-2.5 font-bold uppercase text-buram-bg hover:opacity-90 disabled:opacity-40"
                      >
                        <ArrowRight className="h-4 w-4" />
                        Check-Out to Filtration (Stage 2)
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() =>
                          setPendingAction({ mode: 'OUT_WAREHOUSE', slot: selectedSlot })
                        }
                        className="w-full inline-flex items-center justify-center gap-2 rounded border border-buram-border bg-buram-elevated px-4 py-2 font-bold uppercase text-buram-text hover:border-buram-amber disabled:opacity-40"
                      >
                        <Warehouse className="h-4 w-4" />
                        Return Drum to Warehouse
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded border border-buram-border bg-buram-bg/70 p-3 space-y-2 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-buram-muted">Target Slot:</span>
                        <strong className="text-buram-text">{selectedSlot.slotCode}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-buram-muted">Scanned / Selected Drum:</span>
                        <strong className="text-buram-gold">
                          {matchedScannedDrum?.drumCode || drumIdInput.trim() || 'None scanned'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-buram-muted">Assigned Batch:</span>
                        <strong className="text-buram-text">
                          {batchOptions.find((b) => b.id === selectedBatchId)?.processNo ??
                            'Pre-Warming (Unassigned)'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-buram-muted">Warming Duration:</span>
                        <strong className="text-buram-tech">{warmingHours} hours</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-buram-muted">Calculated Ready Time:</span>
                        <strong className="text-buram-tech">
                          {estimatedReadyDate.toLocaleString('de-DE')}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-buram-muted">Target Temperature:</span>
                        <strong className="text-buram-tech">{targetTempCInput.toFixed(1)} °C</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isSubmitting || !drumIdInput.trim()}
                      onClick={() =>
                        setPendingAction({ mode: 'CHECK_IN', slot: selectedSlot })
                      }
                      className="w-full inline-flex items-center justify-center gap-2 rounded bg-buram-amber px-4 py-2.5 font-bold uppercase text-buram-bg hover:bg-buram-gold disabled:opacity-40"
                    >
                      <Flame className="h-4 w-4" />
                      Check-In Drum to {selectedSlot.slotCode} ({warmingHours}h)
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-buram-muted">Select a slot to inspect or check in a drum.</p>
            )}
          </div>

          {/* Operator Notes & Conditioning Log */}
          <div className="rounded-lg border border-buram-border bg-buram-surface p-4 shadow-panel space-y-2.5">
            <div className="flex items-center justify-between border-b border-buram-border pb-2">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-buram-gold">
                <FileText className="h-3.5 w-3.5 text-buram-amber" />
                Warm Room Operator Notes Log
              </span>
              <span className="text-[10px] text-buram-muted">
                {operatorNotesLog.length +
                  occupiedSlots.filter((s) => Boolean(s.notes)).length}{' '}
                note(s)
              </span>
            </div>

            {operatorNotesLog.length === 0 &&
            occupiedSlots.every((s) => !s.notes) ? (
              <p className="text-[11px] text-buram-muted">
                Notes entered during drum check-in or check-out appear here and stay attached to the cabinet slot.
              </p>
            ) : (
              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {occupiedSlots
                  .filter((s) => Boolean(s.notes))
                  .map((s) => (
                    <div
                      key={`slot-note-${s.slotCode}`}
                      className="rounded border border-buram-border bg-buram-bg/70 p-2.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between text-[10px] text-buram-amber">
                        <strong>
                          {s.slotCode} · {s.drumCode ?? s.drumId}
                        </strong>
                        <span>{s.batchNumber ? `Batch ${s.batchNumber}` : 'Active Slot'}</span>
                      </div>
                      <p className="mt-1 text-buram-text">{s.notes}</p>
                    </div>
                  ))}
                {operatorNotesLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded border border-buram-border/70 bg-buram-bg/40 p-2.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between text-[10px] text-buram-muted">
                      <strong className="text-buram-gold">
                        {entry.slotCode} · {entry.drumCode}
                      </strong>
                      <span>
                        {new Date(entry.timestamp).toLocaleTimeString('de-DE')}
                      </span>
                    </div>
                    <p className="mt-1 text-buram-text">{entry.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Camera / Barcode Label Scanner Modal */}
      <MobileCameraBarcodeModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onBarcodeCaptured={handleBarcodeCaptured}
        onLabelExtracted={handleLabelExtracted}
      />

      {/* Audited Reason Dialog */}
      {pendingAction && (
        <ReasonDialog
          isOpen={true}
          title={
            pendingAction.mode === 'CHECK_IN'
              ? `Warm Cabinet Check-In (${pendingAction.slot.slotCode})`
              : pendingAction.mode === 'OUT_FILTRATION'
                ? `Release Drum to Filtration (${pendingAction.slot.slotCode})`
                : `Return Drum to Warehouse (${pendingAction.slot.slotCode})`
          }
          actionSummary={
            pendingAction.mode === 'CHECK_IN'
              ? `Check in drum ${matchedScannedDrum?.drumCode || drumIdInput.trim()} into ${pendingAction.slot.slotCode} for ${warmingHours}h (target ${targetTempCInput}°C).`
              : pendingAction.mode === 'OUT_FILTRATION'
                ? `Check out drum ${pendingAction.slot.drumCode ?? ''} from ${pendingAction.slot.slotCode} to Filtration.`
                : `Return drum ${pendingAction.slot.drumCode ?? ''} from ${pendingAction.slot.slotCode} to Warehouse.`
          }
          onCancel={() => setPendingAction(null)}
          onConfirm={handleConfirm}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Tailwind Action Feedback Modal */}
      <FeedbackModal
        state={feedbackModal}
        onClose={() => setFeedbackModal(null)}
      />
    </div>
  );
};
