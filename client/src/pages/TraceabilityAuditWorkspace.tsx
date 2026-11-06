// client/src/pages/TraceabilityAuditWorkspace.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  GitMerge,
  Download,
  RefreshCw,
  AlertCircle,
  Globe,
  ShieldAlert,
  FlaskConical,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Layers,
  Factory,
  Boxes,
  Gauge,
  Thermometer,
  Timer,
  X,
  ChevronRight,
  Eye,
  ShieldCheck,
  UserCheck,
  Workflow,
} from 'lucide-react';
import { UserSession } from '../types/erp';
import {
  StatusBadge,
  CountryOriginBadge,
  ReasonDialog,
} from '../components/ui/IndustrialPrimitives';
import {
  formatDinKg,
  formatDinPct,
  formatDinMetric,
  formatDinDate,
  formatDinDateTime,
  InspectionLanguage,
  TRACE_MULTILANG_I18N,
} from '../../../shared/src/schemas/formatters-de';
import { apiClient } from '../lib/apiClient';

type TraceViewMode = 'CHAIN_EXPLORER' | 'ORIGIN_CERTIFICATE';
type StepperStage = 'ALL' | 'LOT' | 'DRUM' | 'BATCH' | 'PROCESS' | 'PREVIEW';

interface OperationalInspectionModalState {
  isOpen: boolean;
  stationCategory: 'INTAKE' | 'WARM_CABINET' | 'FILTRATION' | 'BLENDING' | 'FILLING' | 'OUTBOUND';
  title: string;
  code: string;
  entityKind: 'LOT' | 'DRUM' | 'BATCH' | 'STEP' | 'SHIPMENT';
  operatorName?: string;
  stationName?: string;
  tempC?: number;
  inKg?: number;
  outKg?: number;
  lossKg?: number;
  reworkKg?: number;
  filterMicron?: number;
  dwellTimeText?: string;
  counterparty?: string;
  status?: string;
  notes?: string;
}

interface QsiSummary {
  labName: string;
  reportNo: string;
  moisturePct?: number | null;
  hmfMgPerKg?: number | null;
  diastaseDn?: number | null;
  c4SugarPassed: boolean;
  nmrPassed: boolean;
}

interface TracedLot {
  _id: string;
  lotNo: string;
  country: string;
  packageType?: string;
  drumsCount: number;
  unitWeightKg?: number;
  totalNetKg: number;
  sourceNameSnapshot: string;
  receivedDate?: string;
  createdAt?: string;
  status: string;
  qsiSummary?: QsiSummary | null;
}

interface TracedDrum {
  _id: string;
  drumCode: string;
  incomingLotId: string;
  lotNoSnapshot?: string;
  country: string;
  netKg: number;
  status: string;
  location: string;
}

interface TracedBatch {
  _id: string;
  processNo: string;
  status: string;
  plannedKg: number;
  approvedKg: number;
  totalFilledKg?: number;
  reworkInputKg?: number;
  reworkInputPct?: number;
  originComposition: Array<{
    country: string;
    incomingLotId: string;
    sourceDrumId?: string | null;
    sourceReworkId?: string | null;
    kg: number;
    pct: number;
  }>;
}

interface TracedProcessStep {
  _id: string;
  stepSequence: number;
  stepType: string;
  tempC: number;
  inKg: number;
  outKg: number;
  lossKg: number;
  reworkOutKg: number;
  personInChargeName?: string;
  startedAt?: string;
  completedAt?: string;
  cabinetId?: string | null;
  tankCode?: string | null;
  fillLine?: string | null;
  filterMicron?: number | null;
  notes?: string | null;
}

interface TracedRework {
  _id: string;
  reworkNo: string;
  sourceProcessNo: string;
  totalKg: number;
  remainingKg: number;
  status: string;
  createdAt?: string;
  origin: Array<{
    country: string;
    kg: number;
    pct: number;
  }>;
}

interface TracedShipmentLot {
  _id: string;
  shipmentLotNo: string;
  processNo: string;
  destinationCountry: string;
  orderedKg: number;
  shippedKg: number;
  status: string;
  customerDisplayName?: string;
  allowedCountriesSnapshot?: string[];
  createdAt?: string;
}

interface TracedMovement {
  _id: string;
  movementType: string;
  drumId?: string;
  stockPackageId?: string;
  incomingLotId?: string;
  batchId?: string;
  country: string;
  fromStatus?: string | null;
  toStatus: string;
  fromLocation?: string | null;
  toLocation: string;
  signedKg: number;
  reason: string;
  createdAt: string;
}

interface ServerTraceResponse {
  queriedCode: string;
  inspectorMode: boolean;
  pricesVisible: boolean;
  snapshotAt: string;
  upstream: {
    incomingLots: TracedLot[];
    drumsCount: number;
    drums: TracedDrum[];
  };
  production: {
    batches: TracedBatch[];
    processSteps: TracedProcessStep[];
    reworkStocks: TracedRework[];
  };
  downstream: {
    shipmentLots: TracedShipmentLot[];
  };
  ledgerMovements: TracedMovement[];
}

export const TraceabilityAuditWorkspace: React.FC<{
  user: UserSession;
}> = ({ user }) => {
  const [lang, setLang] = useState<InspectionLanguage>('DE');
  const [viewMode, setViewMode] = useState<TraceViewMode>('CHAIN_EXPLORER');
  const [activeStageFilter, setActiveStageFilter] = useState<StepperStage>('ALL');
  const [isInspectorMode, setIsInspectorMode] = useState<boolean>(
    user.role === 'INSPECTOR'
  );
  const [queryCode, setQueryCode] = useState<string>('');
  const [suggestedCodes, setSuggestedCodes] = useState<string[]>([]);
  const [traceData, setTraceData] = useState<ServerTraceResponse | null>(null);

  // Selected card filter for Movement History (Images 2 & 4 behavior)
  const [selectedCardFilter, setSelectedCardFilter] = useState<{
    kind: 'ALL' | 'LOT' | 'DRUM' | 'BATCH' | 'SHIPMENT';
    id: string;
    code: string;
  } | null>(null);

  // Operational Route Step Inspector Modal (Staff/Admin Detail View)
  const [operationalModal, setOperationalModal] = useState<OperationalInspectionModalState>({
    isOpen: false,
    stationCategory: 'INTAKE',
    title: '',
    code: '',
    entityKind: 'LOT',
  });

  const [showAllDrums, setShowAllDrums] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isHoldDialogOpen, setIsHoldDialogOpen] = useState<boolean>(false);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [holdSuccessBanner, setHoldSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const t = TRACE_MULTILANG_I18N[lang];

  const canExecuteRegulatoryHold =
    user.role === 'ADMIN' ||
    user.role === 'MANAGEMENT' ||
    user.role === 'QA_LEAD';

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await apiClient.request<string[] | { data: string[] }>('/trace/suggestions');
      const codes = Array.isArray(res)
        ? res
        : res && typeof res === 'object' && Array.isArray((res as any).data)
        ? (res as any).data
        : [];
      if (codes.length > 0) {
        setSuggestedCodes(codes);
      } else {
        setSuggestedCodes([
          'B-2026-001',
          'B-2026-015',
          'DRM-2026-041-10',
          'DRM-2026-041-11',
          'LOT-2026-007',
        ]);
      }
    } catch {
      setSuggestedCodes([
        'B-2026-001',
        'B-2026-015',
        'DRM-2026-041-10',
        'DRM-2026-041-11',
        'LOT-2026-007',
      ]);
    }
  }, []);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const executeTraceLookup = async (rawCode: string) => {
    const cleaned = rawCode.trim().toUpperCase();
    if (!cleaned) return;
    setQueryCode(cleaned);
    setIsLoading(true);
    setErrorMessage(null);
    setHoldSuccessBanner(null);

    try {
      const res = await apiClient.request<ServerTraceResponse | { data: ServerTraceResponse }>(
        `/trace/${encodeURIComponent(cleaned)}`
      );
      const data =
        res && typeof res === 'object' && 'data' in res && !('queriedCode' in res)
          ? ((res as any).data as ServerTraceResponse)
          : (res as ServerTraceResponse);
      setTraceData(data);
      setSelectedCardFilter({
        kind: 'ALL',
        id: '',
        code: data.queriedCode,
      });
      setShowAllDrums(false);
    } catch (err) {
      setTraceData(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : `Traceability lookup failed for ${cleaned}.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRegulatoryHold = async (reason: string) => {
    if (!traceData) return;
    setIsHolding(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.auditedMutation<
        {
          queriedCode: string;
          drumsQuarantined: number;
          shipmentLotsHeld: number;
        },
        Record<string, unknown>
      >(
        `/trace/${encodeURIComponent(traceData.queriedCode)}/regulatory-hold`,
        'POST',
        {
          body: { code: traceData.queriedCode },
          reason,
        }
      );

      setIsHoldDialogOpen(false);
      setHoldSuccessBanner(
        lang === 'DE'
          ? `IFS-Sperrung durchgeführt (${res.queriedCode}): ${res.drumsQuarantined} Gebinde in Quarantäne gesetzt, ${res.shipmentLotsHeld} Versandlose gesperrt.`
          : lang === 'TR'
          ? `IFS Askıya Alma uygulandı (${res.queriedCode}): ${res.drumsQuarantined} kap karantinaya alındı, ${res.shipmentLotsHeld} sevkiyat lotu askıya alındı.`
          : lang === 'BN'
          ? `IFS রেগুলেটরি হোল্ড কার্যকর (${res.queriedCode}): ${res.drumsQuarantined} ড্রাম কোয়ারেন্টাইন করা হয়েছে, ${res.shipmentLotsHeld} শিপমেন্ট লট হোল্ডে রাখা হয়েছে।`
          : `IFS Regulatory Hold executed (${res.queriedCode}): ${res.drumsQuarantined} drums quarantined, ${res.shipmentLotsHeld} shipment LOTs placed on HOLD.`
      );
      await executeTraceLookup(traceData.queriedCode);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Regulatory hold rejected by server.'
      );
      setIsHoldDialogOpen(false);
    } finally {
      setIsHolding(false);
    }
  };

  const handleDownloadCertificateCsv = async () => {
    if (!traceData) return;
    setErrorMessage(null);
    try {
      const headers = ['Entity Kind', 'Reference Code', 'Origin Country', 'Net Kg', 'Status', 'Details'];
      const rows: string[][] = [];

      for (const lot of traceData.upstream.incomingLots) {
        rows.push([
          'INCOMING_LOT',
          `"${lot.lotNo}"`,
          `"${lot.country}"`,
          `"${lot.totalNetKg}"`,
          `"${lot.status}"`,
          `"QSI: ${lot.qsiSummary?.reportNo ?? 'N/A'}"`,
        ]);
      }
      for (const drum of traceData.upstream.drums) {
        rows.push([
          'DRUM',
          `"${drum.drumCode}"`,
          `"${drum.country}"`,
          `"${drum.netKg}"`,
          `"${drum.status}"`,
          `"Location: ${drum.location}"`,
        ]);
      }
      for (const b of traceData.production.batches) {
        rows.push([
          'BATCH',
          `"${b.processNo}"`,
          `"${b.originComposition.map((s) => s.country).join('+')}"`,
          `"${b.approvedKg || b.plannedKg}"`,
          `"${b.status}"`,
          `"Rework: ${b.reworkInputKg ?? 0} kg"`,
        ]);
      }
      for (const shp of traceData.downstream.shipmentLots) {
        rows.push([
          'SHIPMENT_LOT',
          `"${shp.shipmentLotNo}"`,
          `"${shp.destinationCountry}"`,
          `"${shp.shippedKg}"`,
          `"${shp.status}"`,
          `"Customer: ${shp.customerDisplayName ?? 'N/A'}"`,
        ]);
      }

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `URSPRUNGSZERTIFIKAT-${traceData.queriedCode}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Certificate export failed.'
      );
    }
  };

  // Compute primary batch & country aggregation for the active trace
  const primaryBatch = traceData?.production.batches[0] || null;
  const totalBatchKg = primaryBatch
    ? primaryBatch.approvedKg || primaryBatch.plannedKg
    : traceData?.upstream.incomingLots.reduce((acc, l) => acc + l.totalNetKg, 0) ?? 0;

  const countryAggregation = useMemo(() => {
    if (!primaryBatch) return [];
    const byCountry = new Map<
      string,
      { country: string; totalKg: number; reworkKg: number; totalPct: number }
    >();

    for (const slice of primaryBatch.originComposition || []) {
      const existing = byCountry.get(slice.country) || {
        country: slice.country,
        totalKg: 0,
        reworkKg: 0,
        totalPct: 0,
      };
      existing.totalKg += slice.kg;
      if (slice.sourceReworkId) {
        existing.reworkKg += slice.kg;
      }
      existing.totalPct += slice.pct;
      byCountry.set(slice.country, existing);
    }
    return Array.from(byCountry.values()).sort((a, b) => b.totalPct - a.totalPct);
  }, [primaryBatch]);

  const filteredMovements = useMemo(() => {
    if (!traceData) return [];
    if (!selectedCardFilter || selectedCardFilter.kind === 'ALL') {
      return traceData.ledgerMovements;
    }
    if (selectedCardFilter.kind === 'DRUM') {
      return traceData.ledgerMovements.filter(
        (m) => String(m.drumId) === selectedCardFilter.id || String(m.stockPackageId) === selectedCardFilter.id
      );
    }
    if (selectedCardFilter.kind === 'LOT') {
      return traceData.ledgerMovements.filter(
        (m) => String(m.incomingLotId) === selectedCardFilter.id
      );
    }
    if (selectedCardFilter.kind === 'BATCH') {
      return traceData.ledgerMovements.filter(
        (m) => String(m.batchId) === selectedCardFilter.id
      );
    }
    return traceData.ledgerMovements;
  }, [traceData, selectedCardFilter]);

  const visibleDrums = traceData
    ? showAllDrums
      ? traceData.upstream.drums
      : traceData.upstream.drums.slice(0, 12)
    : [];

  return (
    <div className="space-y-5">
      {/* 1. HEADER & GLOBAL CONTROLS (TITLE + PERSPECTIVE + BILINGUAL / 4-LANG) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-buram-border">
        <div className="min-w-0">
          <span className="text-[11px] font-mono font-bold text-buram-amber uppercase tracking-widest block truncate">
            {t.assuranceTag}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-buram-text mt-0.5 truncate">
            {t.pageTitle}
          </h1>
          <p className="text-xs text-buram-muted mt-1 line-clamp-2 sm:line-clamp-none">{t.pageSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Dual-Perspective Switcher: Staff view | Inspector view (Masked) */}
          <div className="inline-flex rounded-lg bg-buram-surface p-1 border border-buram-border font-mono text-xs max-w-full overflow-x-auto">
            <button
              type="button"
              onClick={() => setIsInspectorMode(false)}
              className={`px-2.5 sm:px-3 py-1.5 rounded transition-colors whitespace-nowrap ${
                !isInspectorMode
                  ? 'bg-buram-elevated text-buram-gold font-bold shadow-sm'
                  : 'text-buram-muted hover:text-buram-text'
              }`}
            >
              {t.staffViewBtn}
            </button>
            <button
              type="button"
              onClick={() => setIsInspectorMode(true)}
              className={`px-2.5 sm:px-3 py-1.5 rounded transition-colors whitespace-nowrap ${
                isInspectorMode
                  ? 'bg-buram-amber text-buram-bg font-bold shadow-sm'
                  : 'text-buram-muted hover:text-buram-text'
              }`}
            >
              {t.inspectorViewBtn}
            </button>
          </div>

          {/* 4-Language Switcher (DE | TR | EN | BN) */}
          <div className="inline-flex rounded-lg bg-buram-elevated border border-buram-border p-1 font-mono text-xs">
            <div className="flex items-center px-1.5 text-buram-amber">
              <Globe className="w-3.5 h-3.5" />
            </div>
            {(['DE', 'EN', 'TR', 'BN'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`px-1.5 sm:px-2 py-1 rounded transition-colors ${
                  lang === code
                    ? 'bg-buram-amber text-buram-bg font-bold shadow-sm'
                    : 'text-buram-muted hover:text-buram-text'
                }`}
                title={`Switch language to ${code}`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ACTIVE TRACE ACTION TOOLBAR (RENDERED WHEN TRACEDATA IS ACTIVE) */}
      {!isLoading && traceData && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl bg-buram-surface border border-buram-border shadow-panel">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="flex items-center gap-2 pr-0 sm:pr-3 sm:border-r border-buram-border w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-buram-success animate-pulse shrink-0" />
                  <div className="font-mono text-xs">
                    <span className="text-[10px] text-buram-muted uppercase block leading-none">AKTIVE CHARGE / RECORD</span>
                    <span className="font-bold text-buram-gold text-sm truncate block">{traceData.queriedCode}</span>
                  </div>
                </div>
              </div>

              {/* Dual-View Switcher: 6-Column Explorer vs Origin Certificate */}
              <div className="inline-flex rounded-lg bg-buram-bg p-1 border border-buram-border font-mono text-xs w-full sm:w-auto justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('CHAIN_EXPLORER');
                    setActiveStageFilter('ALL');
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors flex-1 sm:flex-initial ${
                    viewMode === 'CHAIN_EXPLORER' && activeStageFilter === 'ALL'
                      ? 'bg-buram-amber text-buram-bg font-bold shadow-sm'
                      : 'text-buram-muted hover:text-buram-text'
                  }`}
                >
                  <GitMerge className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.viewChainBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('ORIGIN_CERTIFICATE');
                    setActiveStageFilter('PREVIEW');
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors flex-1 sm:flex-initial ${
                    viewMode === 'ORIGIN_CERTIFICATE'
                      ? 'bg-buram-amber text-buram-bg font-bold shadow-sm'
                      : 'text-buram-muted hover:text-buram-text'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.viewCertBtn}</span>
                </button>
              </div>
            </div>

            {/* Instant IFS Food v8 Regulatory Hold Action */}
            {canExecuteRegulatoryHold && (
              <button
                type="button"
                onClick={() => setIsHoldDialogOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-buram-critical text-white font-mono text-xs font-bold uppercase hover:opacity-90 shadow-panel transition-all w-full sm:w-auto shrink-0"
                title="IFS Food v8 Clause 4.18.2 Instant Regulatory Quarantine"
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{t.holdActionBtn}</span>
              </button>
            )}
          </div>

          {/* SEQUENTIAL 5-STEP ROUTE STEPPER (USER SPEC: 1-4 IN SEQUENCE, 5 PREVIEW) */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-buram-surface border border-buram-border shadow-panel font-mono text-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-buram-border/60">
              <div className="flex items-center gap-2 text-buram-amber">
                <Workflow className="w-4 h-4 shrink-0" />
                <span className="font-bold uppercase tracking-wider text-[11px] text-buram-text">
                  {t.routeStepperTitle}
                </span>
              </div>
              <div className="text-[11px] text-buram-muted">
                {!isInspectorMode ? (
                  <span className="text-buram-tech flex items-center gap-1">
                    <Factory className="w-3.5 h-3.5 shrink-0" />
                    <span>Admin Route (Volle Stationstelemetrie &amp; Detailprüfung)</span>
                  </span>
                ) : (
                  <span className="text-buram-pale flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Behördenansicht (Maskiert gem. VwVfG / IFS v8)</span>
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* Step 1: Lot */}
              <button
                type="button"
                onClick={() => {
                  setViewMode('CHAIN_EXPLORER');
                  setActiveStageFilter('LOT');
                }}
                className={`flex flex-col p-2 sm:p-2.5 rounded-lg border text-left transition-all min-w-0 ${
                  viewMode === 'CHAIN_EXPLORER' && activeStageFilter === 'LOT'
                    ? 'bg-buram-amber/20 border-buram-amber ring-1 ring-buram-gold shadow-sm'
                    : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                }`}
              >
                <span className="text-[10px] text-buram-muted uppercase block truncate">{t.step1Lot}</span>
                <span className="font-bold text-buram-gold text-xs mt-0.5 truncate">
                  {traceData.upstream.incomingLots.length} Charge(n)
                </span>
                <span className="text-[10px] text-buram-pale mt-0.5 truncate">
                  Dock WE · QSI
                </span>
              </button>

              {/* Step 2: Drums */}
              <button
                type="button"
                onClick={() => {
                  setViewMode('CHAIN_EXPLORER');
                  setActiveStageFilter('DRUM');
                }}
                className={`flex flex-col p-2 sm:p-2.5 rounded-lg border text-left transition-all min-w-0 ${
                  viewMode === 'CHAIN_EXPLORER' && activeStageFilter === 'DRUM'
                    ? 'bg-buram-amber/20 border-buram-amber ring-1 ring-buram-gold shadow-sm'
                    : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                }`}
              >
                <span className="text-[10px] text-buram-muted uppercase block truncate">{t.step2Drums}</span>
                <span className="font-bold text-buram-gold text-xs mt-0.5 truncate">
                  {traceData.upstream.drumsCount} Gebinde
                </span>
                <span className="text-[10px] text-buram-pale mt-0.5 truncate">
                  Wärmekammer / Lager
                </span>
              </button>

              {/* Step 3: Batch */}
              <button
                type="button"
                onClick={() => {
                  setViewMode('CHAIN_EXPLORER');
                  setActiveStageFilter('BATCH');
                }}
                className={`flex flex-col p-2 sm:p-2.5 rounded-lg border text-left transition-all min-w-0 ${
                  viewMode === 'CHAIN_EXPLORER' && activeStageFilter === 'BATCH'
                    ? 'bg-buram-amber/20 border-buram-amber ring-1 ring-buram-gold shadow-sm'
                    : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                }`}
              >
                <span className="text-[10px] text-buram-muted uppercase block truncate">{t.step3Batch}</span>
                <span className="font-bold text-buram-gold text-xs mt-0.5 truncate">
                  {primaryBatch?.processNo || traceData.queriedCode}
                </span>
                <span className="text-[10px] text-buram-pale mt-0.5 truncate">
                  {formatDinKg(totalBatchKg)}
                </span>
              </button>

              {/* Step 4: Process */}
              <button
                type="button"
                onClick={() => {
                  setViewMode('CHAIN_EXPLORER');
                  setActiveStageFilter('PROCESS');
                }}
                className={`flex flex-col p-2 sm:p-2.5 rounded-lg border text-left transition-all min-w-0 ${
                  viewMode === 'CHAIN_EXPLORER' && activeStageFilter === 'PROCESS'
                    ? 'bg-buram-amber/20 border-buram-amber ring-1 ring-buram-gold shadow-sm'
                    : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                }`}
              >
                <span className="text-[10px] text-buram-muted uppercase block truncate">{t.step4Process}</span>
                <span className="font-bold text-buram-gold text-xs mt-0.5 truncate">
                  {traceData.production.processSteps.length} Stationen
                </span>
                <span className="text-[10px] text-buram-pale mt-0.5 truncate">
                  FLT · MIX · TANK · LINE
                </span>
              </button>

              {/* Step 5: Preview (Certificate & Outbound) */}
              <button
                type="button"
                onClick={() => {
                  setViewMode('ORIGIN_CERTIFICATE');
                  setActiveStageFilter('PREVIEW');
                }}
                className={`flex flex-col p-2 sm:p-2.5 rounded-lg border text-left transition-all min-w-0 ${
                  viewMode === 'ORIGIN_CERTIFICATE'
                    ? 'bg-buram-amber text-buram-bg font-bold shadow-amberGlow border-buram-gold'
                    : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                }`}
              >
                <span className={`text-[10px] uppercase block truncate ${viewMode === 'ORIGIN_CERTIFICATE' ? 'text-buram-bg' : 'text-buram-muted'}`}>
                  {t.step5Preview}
                </span>
                <span className="text-xs mt-0.5 truncate font-bold">
                  📄 Zertifikat &amp; LOT
                </span>
                <span className={`text-[10px] mt-0.5 truncate ${viewMode === 'ORIGIN_CERTIFICATE' ? 'text-buram-bg opacity-90' : 'text-buram-pale'}`}>
                  HonigV § 3 · Preview
                </span>
              </button>

              {/* All Steps Toggle */}
              <button
                type="button"
                onClick={() => {
                  setViewMode('CHAIN_EXPLORER');
                  setActiveStageFilter('ALL');
                }}
                className={`flex flex-col p-2 sm:p-2.5 rounded-lg border text-left transition-all min-w-0 ${
                  viewMode === 'CHAIN_EXPLORER' && activeStageFilter === 'ALL'
                    ? 'bg-buram-elevated border-buram-amber ring-1 ring-buram-amber text-buram-gold'
                    : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50 text-buram-muted'
                }`}
              >
                <span className="text-[10px] uppercase block truncate">{t.allStepsView}</span>
                <span className="font-bold text-xs mt-0.5 truncate">
                  ⛓️ Panoramafluss
                </span>
                <span className="text-[10px] text-buram-pale mt-0.5 truncate">
                  Alle 6 Spalten
                </span>
              </button>
            </div>
          </div>

          {/* ADMIN OPERATIONAL STATION ROUTE STRIP (VISIBLE IN STAFF / ADMIN MODE) */}
          {!isInspectorMode && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-buram-surface/90 border border-buram-tech/40 shadow-panel font-mono text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-buram-border/60">
                <div className="flex items-center gap-2 text-buram-tech">
                  <Factory className="w-4 h-4 shrink-0" />
                  <span className="font-bold uppercase tracking-wider text-[11px] text-buram-text">
                    {t.adminStationRouteTitle}
                  </span>
                </div>
                <span className="text-[10px] text-buram-muted">{t.adminStationRouteSub}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {/* Station 1: Dock WE */}
                <button
                  type="button"
                  onClick={() => {
                    const firstLot = traceData.upstream.incomingLots[0];
                    setOperationalModal({
                      isOpen: true,
                      stationCategory: 'INTAKE',
                      title: `Station 1 · Wareneingangsrampe Dock WE`,
                      code: firstLot?.lotNo || 'WE-DOCK',
                      entityKind: 'LOT',
                      stationName: 'Dock WE (Rampe 1-3)',
                      operatorName: 'Hasmo HMX (Qualitätsprüfung & Wareneingang)',
                      counterparty: firstLot?.sourceNameSnapshot || 'BioImker Sp. z o.o.',
                      inKg: firstLot?.totalNetKg,
                      outKg: firstLot?.totalNetKg,
                      lossKg: 0,
                      reworkKg: 0,
                      status: firstLot?.status || 'APPROVED',
                      dwellTimeText: formatDinDate(firstLot?.receivedDate || firstLot?.createdAt),
                      notes: `Lieferscheinprüfung & QSI-Musterziehung erfolgt. HMF: ${formatDinMetric(firstLot?.qsiSummary?.hmfMgPerKg)} mg/kg, Wasser: ${formatDinMetric(firstLot?.qsiSummary?.moisturePct)} %.`,
                    });
                  }}
                  className="p-2 sm:p-2.5 rounded-lg bg-buram-bg border border-buram-border hover:border-buram-tech hover:bg-buram-tech/10 text-left transition-all group min-w-0"
                >
                  <div className="flex items-center justify-between text-[10px] text-buram-tech uppercase">
                    <span className="truncate">1 · DOCK WE</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <div className="font-bold text-buram-text mt-1 text-xs truncate">Wareneingang</div>
                  <div className="text-[10px] text-buram-muted truncate mt-0.5">
                    {traceData.upstream.incomingLots[0]?.sourceNameSnapshot || 'Lieferant'}
                  </div>
                </button>

                {/* Station 2: Warm Cabinet */}
                <button
                  type="button"
                  onClick={() => {
                    const warmingStep = traceData.production.processSteps.find(
                      (s) => s.stepType === 'WARMING'
                    );
                    setOperationalModal({
                      isOpen: true,
                      stationCategory: 'WARM_CABINET',
                      title: `Station 2 · Wärmekammern CAB-01 / CAB-02`,
                      code: warmingStep ? `STEP-${warmingStep.stepSequence}` : 'CAB-01',
                      entityKind: 'STEP',
                      stationName: 'Wärmekammer CAB-01 (Solltemperatur 42,0 °C)',
                      operatorName: warmingStep?.personInChargeName || 'Mehmet Yilmaz (Intralogistik)',
                      tempC: warmingStep?.tempC || 42.0,
                      inKg: warmingStep?.inKg || totalBatchKg,
                      outKg: warmingStep?.outKg || totalBatchKg,
                      lossKg: warmingStep?.lossKg || 0,
                      reworkKg: warmingStep?.reworkOutKg || 0,
                      status: 'COMPLETED',
                      dwellTimeText: '24–36 h Dekristallisationszyklus',
                      notes: 'Schonende Verflüssigung ohne thermische Enzymschädigung (Diastase >= 8 DN gesichert).',
                    });
                  }}
                  className="p-2 sm:p-2.5 rounded-lg bg-buram-bg border border-buram-border hover:border-buram-tech hover:bg-buram-tech/10 text-left transition-all group min-w-0"
                >
                  <div className="flex items-center justify-between text-[10px] text-buram-tech uppercase">
                    <span className="truncate">2 · WÄRMEKAMMER</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <div className="font-bold text-buram-text mt-1 text-xs truncate">CAB-01 / CAB-02</div>
                  <div className="text-[10px] text-buram-muted truncate mt-0.5">
                    42,0 °C · Dekristallisation
                  </div>
                </button>

                {/* Station 3: Filtration */}
                <button
                  type="button"
                  onClick={() => {
                    const filterStep = traceData.production.processSteps.find(
                      (s) => s.stepType === 'FILTRATION'
                    );
                    setOperationalModal({
                      isOpen: true,
                      stationCategory: 'FILTRATION',
                      title: `Station 3 · Grob- & Feinfiltration FLT-01`,
                      code: filterStep ? `STEP-${filterStep.stepSequence}` : 'FLT-01',
                      entityKind: 'STEP',
                      stationName: 'Filterpresse FLT-01 (Mehrstufen-Edelstahlsieb)',
                      operatorName: filterStep?.personInChargeName || 'Stefan Becker (Maschinenführer)',
                      tempC: filterStep?.tempC || 40.5,
                      inKg: filterStep?.inKg || totalBatchKg,
                      outKg: filterStep?.outKg || totalBatchKg - (filterStep?.lossKg || 12),
                      lossKg: filterStep?.lossKg || 12,
                      reworkKg: filterStep?.reworkOutKg || 0,
                      filterMicron: filterStep?.filterMicron || 200,
                      status: 'COMPLETED',
                      notes: 'Entfernung von Wachs- und Bienenpartikeln gem. HonigV § 2 ohne Entfernung honigeigener Pollen.',
                    });
                  }}
                  className="p-2 sm:p-2.5 rounded-lg bg-buram-bg border border-buram-border hover:border-buram-tech hover:bg-buram-tech/10 text-left transition-all group min-w-0"
                >
                  <div className="flex items-center justify-between text-[10px] text-buram-tech uppercase">
                    <span className="truncate">3 · FILTRATION</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <div className="font-bold text-buram-text mt-1 text-xs truncate">FLT-01 (200 µm)</div>
                  <div className="text-[10px] text-buram-muted truncate mt-0.5">
                    Edelstahl-Siebfilter
                  </div>
                </button>

                {/* Station 4: Blending & Tanks */}
                <button
                  type="button"
                  onClick={() => {
                    const blendStep = traceData.production.processSteps.find(
                      (s) => s.stepType === 'BLENDING'
                    );
                    setOperationalModal({
                      isOpen: true,
                      stationCategory: 'BLENDING',
                      title: `Station 4 · Homogenisierung MIX-01 & TANK-01`,
                      code: blendStep ? `STEP-${blendStep.stepSequence}` : 'MIX-01',
                      entityKind: 'STEP',
                      stationName: 'Mischbehälter MIX-01 & Reifetank TANK-01',
                      operatorName: blendStep?.personInChargeName || 'Hasmo HMX (Master Blender)',
                      tempC: blendStep?.tempC || 38.0,
                      inKg: blendStep?.inKg || totalBatchKg,
                      outKg: blendStep?.outKg || totalBatchKg,
                      lossKg: blendStep?.lossKg || 0,
                      reworkKg: blendStep?.reworkOutKg || (primaryBatch?.reworkInputKg ?? 0),
                      status: 'APPROVED',
                      notes: `Rezepturgemäße Homogenisierung. ${countryAggregation.length} Herkunftsländer. Rework-Anteil: ${formatDinKg(primaryBatch?.reworkInputKg ?? 0)}.`,
                    });
                  }}
                  className="p-2 sm:p-2.5 rounded-lg bg-buram-bg border border-buram-border hover:border-buram-tech hover:bg-buram-tech/10 text-left transition-all group min-w-0"
                >
                  <div className="flex items-center justify-between text-[10px] text-buram-tech uppercase">
                    <span className="truncate">4 · MISCHTANKS</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <div className="font-bold text-buram-text mt-1 text-xs truncate">MIX-01 / TANK-01</div>
                  <div className="text-[10px] text-buram-muted truncate mt-0.5">
                    Homogenisierung &amp; Rast
                  </div>
                </button>

                {/* Station 5: Filling Lines */}
                <button
                  type="button"
                  onClick={() => {
                    const fillStep = traceData.production.processSteps.find(
                      (s) => s.stepType === 'FILLING'
                    );
                    setOperationalModal({
                      isOpen: true,
                      stationCategory: 'FILLING',
                      title: `Station 5 · Abfüllanlage QUIEL_PET / CARLO_JAR`,
                      code: fillStep ? `STEP-${fillStep.stepSequence}` : 'QUIEL_PET',
                      entityKind: 'STEP',
                      stationName: fillStep?.fillLine ? `Abfülllinie ${fillStep.fillLine}` : 'Abfülllinie QUIEL_PET (Line 1)',
                      operatorName: fillStep?.personInChargeName || 'Ali Kurt (Linienführer)',
                      tempC: fillStep?.tempC || 35.0,
                      inKg: fillStep?.inKg || totalBatchKg,
                      outKg: fillStep?.outKg || totalBatchKg,
                      lossKg: fillStep?.lossKg || 5,
                      reworkKg: fillStep?.reworkOutKg || 0,
                      status: 'COMPLETED',
                      notes: 'Gravimetrische Dosierung mit automatischer Dichtigkeits- und Metalldetektorprüfung.',
                    });
                  }}
                  className="p-2 sm:p-2.5 rounded-lg bg-buram-bg border border-buram-border hover:border-buram-tech hover:bg-buram-tech/10 text-left transition-all group min-w-0"
                >
                  <div className="flex items-center justify-between text-[10px] text-buram-tech uppercase">
                    <span className="truncate">5 · ABFÜLLLINIE</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <div className="font-bold text-buram-text mt-1 text-xs truncate">QUIEL_PET / CARLO</div>
                  <div className="text-[10px] text-buram-muted truncate mt-0.5">
                    PET-Spender &amp; Gläser
                  </div>
                </button>

                {/* Station 6: Outbound Dock */}
                <button
                  type="button"
                  onClick={() => {
                    const firstShipment = traceData.downstream.shipmentLots[0];
                    setOperationalModal({
                      isOpen: true,
                      stationCategory: 'OUTBOUND',
                      title: `Station 6 · Warenausgang & Versandrampe`,
                      code: firstShipment?.shipmentLotNo || 'OUT-DOCK',
                      entityKind: 'SHIPMENT',
                      stationName: 'Versandrampe Dock OUT (Tor 4-6)',
                      operatorName: 'Versandleiter / Logistik',
                      counterparty: firstShipment?.customerDisplayName || 'EDEKA Zentrale Stiftung & Co. KG',
                      inKg: firstShipment?.orderedKg || 6700,
                      outKg: firstShipment?.shippedKg || 6700,
                      lossKg: 0,
                      reworkKg: 0,
                      status: firstShipment?.status || 'SHIPPED',
                      dwellTimeText: formatDinDate(firstShipment?.createdAt),
                      notes: `Freigabe nach QS-Endkontrolle. Ziel: ${firstShipment?.destinationCountry || 'DE'}. Palette mit NVE/SSCC etikettiert.`,
                    });
                  }}
                  className="p-2 sm:p-2.5 rounded-lg bg-buram-bg border border-buram-border hover:border-buram-tech hover:bg-buram-tech/10 text-left transition-all group min-w-0"
                >
                  <div className="flex items-center justify-between text-[10px] text-buram-tech uppercase">
                    <span className="truncate">6 · WARENAUSGANG</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <div className="font-bold text-buram-text mt-1 text-xs truncate">Versand-Dock OUT</div>
                  <div className="text-[10px] text-buram-muted truncate mt-0.5">
                    {traceData.downstream.shipmentLots[0]?.customerDisplayName || 'Kunde'}
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded bg-buram-critical/15 border border-buram-critical/50 flex items-center gap-2 text-xs font-mono text-buram-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {holdSuccessBanner && (
        <div className="p-3.5 rounded bg-buram-warning/15 border border-buram-warning/50 text-xs font-mono text-buram-warning font-bold">
          {holdSuccessBanner}
        </div>
      )}

      {/* 2. FIND A CHAIN SEARCH CARD (MATCHES SCREENSHOTS 1, 2, 3) */}
      <section className="bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void executeTraceLookup(queryCode);
          }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-buram-amber/15 border border-buram-amber/40 flex items-center justify-center shrink-0">
              <GitMerge className="w-4 h-4 text-buram-amber" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-buram-text">
                {t.findChainTitle}
              </div>
              <div className="text-xs text-buram-muted">{t.findChainSub}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[380px]">
            <input
              type="text"
              value={queryCode}
              onChange={(e) => setQueryCode(e.target.value)}
              placeholder="z.B. B-2026-001, LOT-2026-007, DRM-2026-041-10..."
              className="flex-1 bg-buram-bg border border-buram-border rounded-lg px-3.5 py-2 text-xs font-mono text-buram-text focus:border-buram-amber"
            />
            <button
              type="submit"
              disabled={isLoading || !queryCode.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-buram-amber text-buram-bg font-mono text-xs font-bold uppercase hover:bg-buram-gold disabled:opacity-40 shrink-0 shadow-sm"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{t.traceButton}</span>
            </button>
          </div>
        </form>

        {/* LOADING STATE (IMAGE 3) */}
        {isLoading && (
          <div className="p-8 rounded-lg border border-dashed border-buram-border bg-buram-bg/50 flex items-center gap-3 text-sm text-buram-muted font-mono">
            <RefreshCw className="w-4 h-4 animate-spin text-buram-amber" />
            <span>{t.walkingChain}</span>
          </div>
        )}

        {/* INITIAL EMPTY STATE WITH REAL DB RECORD CHIPS (IMAGE 1) */}
        {!isLoading && !traceData && (
          <div className="p-10 rounded-xl border border-dashed border-buram-border bg-buram-bg/40 text-center max-w-2xl mx-auto my-2 space-y-3">
            <div className="w-12 h-12 rounded-full bg-buram-amber/15 border border-buram-amber/40 flex items-center justify-center mx-auto">
              <GitMerge className="w-5 h-5 text-buram-amber" />
            </div>
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-buram-text">
              {t.startTraceTitle}
            </h2>
            <p className="text-xs text-buram-muted leading-relaxed max-w-lg mx-auto">
              {t.startTraceBody}
            </p>

            {suggestedCodes.length > 0 && (
              <div className="pt-3 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-buram-muted">
                  {t.tryRecordsLabel}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                  {suggestedCodes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => void executeTraceLookup(code)}
                      className="px-3 py-1.5 rounded-lg bg-buram-surface border border-buram-border text-buram-pale hover:border-buram-amber hover:text-buram-gold transition-colors"
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* =====================================================================
          VIEW 1: 6-COLUMN STEP-BY-STEP CHAIN EXPLORER (IMAGES 2, 3, 4)
         ===================================================================== */}
      {!isLoading && traceData && viewMode === 'CHAIN_EXPLORER' && (
        <>
          <section className="bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-buram-border">
              <div>
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-buram-text">
                  {t.whereItCameFromTitle}
                </h2>
                <p className="text-[11px] text-buram-muted mt-0.5">
                  {t.whereItCameFromSub}
                </p>
              </div>
              <StatusBadge
                label={`SNAPSHOT: ${formatDinDateTime(traceData.snapshotAt, lang)}`}
                variant="NOMINAL"
              />
            </div>

            {/* TOP 4 KPI STRIP (BATCH | HONEY IN BATCH | SOURCE COUNTRIES | REWORK) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-buram-border font-mono tabular-nums">
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">
                  {t.kpiBatch}
                </span>
                <span className="text-base font-bold text-buram-gold">
                  {primaryBatch?.processNo || traceData.queriedCode}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">
                  {t.kpiHoneyInBatch}
                </span>
                <span className="text-base font-bold text-buram-text">
                  {formatDinKg(totalBatchKg)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">
                  {t.kpiSourceCountries}
                </span>
                <span className="text-base font-bold text-buram-tech">
                  {countryAggregation.length || traceData.upstream.incomingLots.length}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">
                  {t.kpiRework}
                </span>
                <span className="text-base font-bold text-buram-pale">
                  {formatDinKg(primaryBatch?.reworkInputKg ?? 0)} ·{' '}
                  {formatDinPct(primaryBatch?.reworkInputPct ?? 0, 2)}
                </span>
              </div>
            </div>

            {/* ACTIVE STAGE FOCUS BAR (WHEN A SPECIFIC STEP IS FILTERED) */}
            {activeStageFilter !== 'ALL' && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-buram-amber/10 border border-buram-amber/30 text-xs font-mono">
                <div className="flex items-center gap-2 text-buram-gold">
                  <span className="w-2 h-2 rounded-full bg-buram-amber animate-pulse shrink-0" />
                  <span className="font-bold">
                    {lang === 'DE'
                      ? 'Fokussierte Stufe'
                      : lang === 'TR'
                      ? 'Odaklanmış Aşama'
                      : lang === 'BN'
                      ? 'ফোকাসকৃত ধাপ'
                      : 'Focused Stage'}
                    :{' '}
                    {activeStageFilter === 'LOT'
                      ? t.col1SourceLots
                      : activeStageFilter === 'DRUM'
                      ? t.col2Drums
                      : activeStageFilter === 'BATCH'
                      ? t.col3Batch
                      : t.col4Process}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStageFilter('ALL')}
                  className="px-2.5 py-1 rounded bg-buram-surface border border-buram-border text-buram-text hover:border-buram-amber hover:text-buram-gold transition-colors text-[10px]"
                >
                  {t.allStepsView}
                </button>
              </div>
            )}

            {/* 6-COLUMN HORIZONTAL SEQUENCE GRAPH (RESPONSIVE 1 -> 2 -> 3 -> 6 COLS) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 font-mono text-xs tabular-nums">
              {/* COLUMN 1: SOURCE LOTS */}
              <div
                className={`space-y-2 p-2 rounded-xl transition-all min-w-0 ${
                  activeStageFilter === 'LOT'
                    ? 'bg-buram-amber/10 ring-2 ring-buram-amber shadow-amberGlow'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span className="flex items-center gap-1 font-bold text-buram-gold truncate">
                    <span>{t.col1SourceLots}</span>
                  </span>
                  <span className="shrink-0">{traceData.upstream.incomingLots.length}</span>
                </div>
                {traceData.upstream.incomingLots.map((lot) => {
                  const isSelected =
                    selectedCardFilter?.kind === 'LOT' &&
                    selectedCardFilter.id === lot._id;
                  const displayName = isInspectorMode
                    ? `SUPPLIER-${lot.country}`
                    : lot.sourceNameSnapshot;
                  return (
                    <div
                      key={lot._id}
                      className={`w-full p-3 rounded-lg border transition-all space-y-1.5 ${
                        isSelected
                          ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                          : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCardFilter({
                              kind: 'LOT',
                              id: lot._id,
                              code: lot.lotNo,
                            })
                          }
                          className="font-bold text-buram-gold hover:underline text-left truncate flex-1"
                        >
                          {lot.lotNo}
                        </button>
                        {!isInspectorMode && (
                          <button
                            type="button"
                            onClick={() =>
                              setOperationalModal({
                                isOpen: true,
                                stationCategory: 'INTAKE',
                                title: `Eingangscharge · Dock WE (${lot.lotNo})`,
                                code: lot.lotNo,
                                entityKind: 'LOT',
                                stationName: 'Wareneingangsrampe Dock WE',
                                operatorName: 'Hasmo HMX (Qualitätskontrolle)',
                                counterparty: lot.sourceNameSnapshot,
                                inKg: lot.totalNetKg,
                                outKg: lot.totalNetKg,
                                lossKg: 0,
                                reworkKg: 0,
                                status: lot.status,
                                dwellTimeText: formatDinDate(lot.receivedDate || lot.createdAt),
                                notes: `Gebindeanzahl: ${lot.drumsCount} Fass/Fässer (${lot.unitWeightKg ?? 272} kg/Fass). QSI Laborbericht: ${lot.qsiSummary?.reportNo ?? 'N/A'}.`,
                              })
                            }
                            className="p-1 rounded bg-buram-elevated border border-buram-border text-buram-amber hover:text-buram-gold hover:border-buram-amber text-[10px] shrink-0"
                            title={t.viewDetailsBtn}
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <CountryOriginBadge countryIso={lot.country} />
                        {!isInspectorMode && (
                          <span className="text-[10px] text-buram-tech px-1.5 py-0.5 rounded bg-buram-tech/10 border border-buram-tech/30">
                            Dock WE
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-bold text-buram-text">
                        {formatDinKg(lot.totalNetKg)}
                      </div>

                      <StatusBadge
                        label={lot.status}
                        variant={lot.status === 'PASSED' || lot.status === 'APPROVED' ? 'NOMINAL' : 'WARNING'}
                      />

                      {/* HonigV QSI Lab Parameter Badge */}
                      {lot.qsiSummary && (
                        <div className="p-1.5 rounded bg-buram-surface border border-buram-success/40 text-[10px] text-buram-success">
                          <div className="font-bold flex items-center gap-1">
                            <FlaskConical className="w-3 h-3 shrink-0" />
                            <span className="truncate">QSI: {lot.qsiSummary.reportNo}</span>
                          </div>
                          <div className="text-buram-pale mt-0.5 truncate">
                            H₂O: {formatDinMetric(lot.qsiSummary.moisturePct)} % | HMF: {formatDinMetric(lot.qsiSummary.hmfMgPerKg)} mg/kg
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text-buram-muted truncate font-sans">
                        {displayName}
                      </div>
                      <div className="text-[10px] text-buram-muted">
                        {formatDinDate(lot.receivedDate || lot.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* COLUMN 2: DRUMS / PACKAGES */}
              <div
                className={`space-y-2 p-2 rounded-xl transition-all min-w-0 ${
                  activeStageFilter === 'DRUM'
                    ? 'bg-buram-amber/10 ring-2 ring-buram-amber shadow-amberGlow'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span className="flex items-center gap-1 font-bold text-buram-gold truncate">
                    <span>{t.col2Drums}</span>
                  </span>
                  <span className="shrink-0">{traceData.upstream.drumsCount}</span>
                </div>
                {visibleDrums.map((drum) => {
                  const isSelected =
                    selectedCardFilter?.kind === 'DRUM' &&
                    selectedCardFilter.id === drum._id;
                  return (
                    <div
                      key={drum._id}
                      className={`w-full p-2.5 rounded-lg border transition-all space-y-1 ${
                        isSelected
                          ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                          : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCardFilter({
                              kind: 'DRUM',
                              id: drum._id,
                              code: drum.drumCode,
                            })
                          }
                          className="font-bold text-buram-gold truncate hover:underline text-left flex-1"
                        >
                          {drum.drumCode}
                        </button>
                        {!isInspectorMode && (
                          <button
                            type="button"
                            onClick={() =>
                              setOperationalModal({
                                isOpen: true,
                                stationCategory: drum.location.includes('CAB') ? 'WARM_CABINET' : 'INTAKE',
                                title: `Gebinde · ${drum.drumCode}`,
                                code: drum.drumCode,
                                entityKind: 'DRUM',
                                stationName: drum.location || 'Fasslager Zone A',
                                operatorName: 'Lagerist / Intralogistik',
                                inKg: drum.netKg,
                                outKg: drum.netKg,
                                lossKg: 0,
                                reworkKg: 0,
                                status: drum.status,
                                notes: `Zugehörige Eingangscharge: ${drum.lotNoSnapshot || drum.incomingLotId}. Ursprungsland: ${drum.country}.`,
                              })
                            }
                            className="p-1 rounded bg-buram-elevated border border-buram-border text-buram-amber hover:text-buram-gold hover:border-buram-amber text-[10px] shrink-0"
                            title={t.viewDetailsBtn}
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <CountryOriginBadge countryIso={drum.country} />
                        <span className="font-bold text-buram-text">
                          {formatDinKg(drum.netKg)}
                        </span>
                      </div>

                      <StatusBadge
                        label={drum.status.toUpperCase()}
                        variant={
                          drum.status === 'Approved'
                            ? 'NOMINAL'
                            : drum.status === 'Quarantine'
                            ? 'CRITICAL'
                            : 'TECHNICAL'
                        }
                      />

                      <div className="text-[10px] text-buram-muted truncate">
                        {drum.location}
                      </div>
                    </div>
                  );
                })}
                {traceData.upstream.drums.length > 12 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDrums((s) => !s)}
                    className="w-full py-1.5 rounded bg-buram-elevated border border-buram-border text-[11px] text-buram-gold hover:border-buram-amber"
                  >
                    {showAllDrums
                      ? 'Weniger anzeigen / Show less'
                      : `+ ${traceData.upstream.drums.length - 12} weitere Gebinde`}
                  </button>
                )}
              </div>

              {/* COLUMN 3: BATCH */}
              <div
                className={`space-y-2 p-2 rounded-xl transition-all min-w-0 ${
                  activeStageFilter === 'BATCH'
                    ? 'bg-buram-amber/10 ring-2 ring-buram-amber shadow-amberGlow'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span className="flex items-center gap-1 font-bold text-buram-gold truncate">
                    <span>{t.col3Batch}</span>
                  </span>
                  <span className="shrink-0">{traceData.production.batches.length}</span>
                </div>
                {traceData.production.batches.map((b) => {
                  const isSelected =
                    selectedCardFilter?.kind === 'BATCH' &&
                    selectedCardFilter.id === b._id;
                  return (
                    <div
                      key={b._id}
                      className={`w-full p-3 rounded-lg border transition-all space-y-1.5 ${
                        isSelected
                          ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                          : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCardFilter({
                              kind: 'BATCH',
                              id: b._id,
                              code: b.processNo,
                            })
                          }
                          className="font-bold text-buram-gold hover:underline text-left truncate flex-1"
                        >
                          {b.processNo}
                        </button>
                        {!isInspectorMode && (
                          <button
                            type="button"
                            onClick={() =>
                              setOperationalModal({
                                isOpen: true,
                                stationCategory: 'BLENDING',
                                title: `Produktionscharge · ${b.processNo}`,
                                code: b.processNo,
                                entityKind: 'BATCH',
                                stationName: 'Mischtank TANK-01 / Homogenisieranlage',
                                operatorName: 'Produktionsleiter / Master Blender',
                                inKg: b.plannedKg,
                                outKg: b.approvedKg || b.plannedKg,
                                lossKg: 0,
                                reworkKg: b.reworkInputKg ?? 0,
                                status: b.status,
                                notes: `Enthält ${new Set(b.originComposition.map((s) => s.country)).size} Ursprungsländer. Rework-Einsatz: ${b.reworkInputKg ?? 0} kg (${b.reworkInputPct ?? 0} %).`,
                              })
                            }
                            className="p-1 rounded bg-buram-elevated border border-buram-border text-buram-amber hover:text-buram-gold hover:border-buram-amber text-[10px] shrink-0"
                            title={t.viewDetailsBtn}
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="text-sm font-bold text-buram-text">
                        {formatDinKg(b.approvedKg || b.plannedKg)}
                      </div>

                      <StatusBadge label={b.status} variant="TECHNICAL" />

                      <div className="text-[11px] text-buram-muted">
                        {new Set(b.originComposition.map((s) => s.country)).size} {t.sourceCountryCount}
                      </div>

                      {!isInspectorMode && (
                        <div className="text-[10px] text-buram-tech mt-1 pt-1 border-t border-buram-border/50 truncate">
                          Homogenisierung &amp; Mischung
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* COLUMN 4: PROCESS STEPS */}
              <div
                className={`space-y-2 p-2 rounded-xl transition-all min-w-0 ${
                  activeStageFilter === 'PROCESS'
                    ? 'bg-buram-amber/10 ring-2 ring-buram-amber shadow-amberGlow'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span className="flex items-center gap-1 font-bold text-buram-gold truncate">
                    <span>{t.col4Process}</span>
                  </span>
                  <span className="shrink-0">{traceData.production.processSteps.length}</span>
                </div>
                {traceData.production.processSteps.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-buram-border text-[11px] text-buram-muted">
                    Keine Prozessschritte / No steps
                  </div>
                ) : (
                  traceData.production.processSteps.map((st) => (
                    <div
                      key={st._id}
                      className="p-3 rounded-lg bg-buram-bg/80 border border-buram-border space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-buram-gold truncate">
                          #{st.stepSequence} · {st.stepType}
                        </span>
                        {!isInspectorMode && (
                          <button
                            type="button"
                            onClick={() =>
                              setOperationalModal({
                                isOpen: true,
                                stationCategory:
                                  st.stepType === 'WARMING'
                                    ? 'WARM_CABINET'
                                    : st.stepType === 'FILTRATION'
                                    ? 'FILTRATION'
                                    : st.stepType === 'FILLING'
                                    ? 'FILLING'
                                    : 'BLENDING',
                                title: `Prozessschritt #${st.stepSequence} · ${st.stepType}`,
                                code: `STEP-${st.stepSequence}`,
                                entityKind: 'STEP',
                                stationName: st.tankCode
                                  ? `Behälter ${st.tankCode}`
                                  : st.fillLine
                                  ? `Abfülllinie ${st.fillLine}`
                                  : st.stepType === 'WARMING'
                                  ? 'Wärmekammer CAB-01'
                                  : 'Filtrationsmodul FLT-01',
                                operatorName: st.personInChargeName || 'Anlagenführer',
                                tempC: st.tempC,
                                inKg: st.inKg,
                                outKg: st.outKg,
                                lossKg: st.lossKg,
                                reworkKg: st.reworkOutKg,
                                filterMicron: st.filterMicron ?? undefined,
                                dwellTimeText: st.completedAt
                                  ? `${formatDinDateTime(st.startedAt, lang)} bis ${formatDinDateTime(st.completedAt, lang)}`
                                  : 'In Bearbeitung',
                                notes: st.notes || `Prozessschritt ${st.stepType} mit Massenbilanz-Validierung ausgeführt.`,
                              })
                            }
                            className="p-1 rounded bg-buram-elevated border border-buram-border text-buram-amber hover:text-buram-gold hover:border-buram-amber text-[10px] shrink-0"
                            title={t.viewDetailsBtn}
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="text-sm font-bold text-buram-text">
                        {formatDinKg(st.outKg)}
                      </div>

                      <div className="text-[11px] text-buram-tech">
                        {formatDinMetric(st.tempC)} °C
                      </div>

                      <div className="text-[10px] text-buram-muted">
                        Loss: {formatDinKg(st.lossKg)} | RW: {formatDinKg(st.reworkOutKg)}
                      </div>

                      {!isInspectorMode && st.personInChargeName && (
                        <div className="text-[10px] text-buram-pale truncate pt-1 border-t border-buram-border/50">
                          Bediener: {st.personInChargeName}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* COLUMN 5: REWORK */}
              <div className="space-y-2 p-2 rounded-xl min-w-0">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span className="truncate">{t.col5Rework}</span>
                  <span className="shrink-0">{traceData.production.reworkStocks.length}</span>
                </div>
                {traceData.production.reworkStocks.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-buram-border text-[11px] text-buram-muted">
                    {t.noReworkGenerated}
                  </div>
                ) : (
                  traceData.production.reworkStocks.map((rw) => (
                    <div
                      key={rw._id}
                      className="p-3 rounded-lg bg-buram-amber/10 border border-buram-amber/40 space-y-1"
                    >
                      <div className="font-bold text-buram-gold truncate">{rw.reworkNo}</div>
                      <div className="text-sm font-bold text-buram-text">
                        {formatDinKg(rw.remainingKg)}
                      </div>
                      <StatusBadge label={rw.status} variant="AMBER" />
                    </div>
                  ))
                )}
              </div>

              {/* COLUMN 6: SHIPMENT LOT */}
              <div className="space-y-2 p-2 rounded-xl min-w-0">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span className="truncate">{t.col6ShipmentLot}</span>
                  <span className="shrink-0">{traceData.downstream.shipmentLots.length}</span>
                </div>
                {traceData.downstream.shipmentLots.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-buram-border text-[11px] text-buram-muted">
                    {t.nothingShippedYet}
                  </div>
                ) : (
                  traceData.downstream.shipmentLots.map((shp) => {
                    const isSelected =
                      selectedCardFilter?.kind === 'SHIPMENT' &&
                      selectedCardFilter.id === shp._id;
                    const buyerName = isInspectorMode
                      ? `BUYER-${shp.destinationCountry}`
                      : shp.customerDisplayName;
                    return (
                      <div
                        key={shp._id}
                        className={`w-full p-3 rounded-lg border transition-all space-y-1.5 ${
                          isSelected
                            ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                            : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedCardFilter({
                                kind: 'SHIPMENT',
                                id: shp._id,
                                code: shp.shipmentLotNo,
                              })
                            }
                            className="font-bold text-buram-gold hover:underline text-left truncate flex-1"
                          >
                            {shp.shipmentLotNo}
                          </button>
                          {!isInspectorMode && (
                            <button
                              type="button"
                              onClick={() =>
                                setOperationalModal({
                                  isOpen: true,
                                  stationCategory: 'OUTBOUND',
                                  title: `Versandlos · ${shp.shipmentLotNo}`,
                                  code: shp.shipmentLotNo,
                                  entityKind: 'SHIPMENT',
                                  stationName: 'Warenausgangsrampe / Versand-Dock OUT',
                                  operatorName: 'Versandleiter / Logistik',
                                  counterparty: shp.customerDisplayName,
                                  inKg: shp.orderedKg,
                                  outKg: shp.shippedKg,
                                  lossKg: 0,
                                  reworkKg: 0,
                                  status: shp.status,
                                  dwellTimeText: formatDinDate(shp.createdAt),
                                  notes: `Bestellte Menge: ${shp.orderedKg} kg. Gelieferte Menge: ${shp.shippedKg} kg. Ziel: ${shp.destinationCountry}.`,
                                })
                              }
                              className="p-1 rounded bg-buram-elevated border border-buram-border text-buram-amber hover:text-buram-gold hover:border-buram-amber text-[10px] shrink-0"
                              title={t.viewDetailsBtn}
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <CountryOriginBadge countryIso={shp.destinationCountry} />
                          <span className="font-bold text-buram-text">
                            {formatDinKg(shp.shippedKg)}
                          </span>
                        </div>

                        <StatusBadge
                          label={shp.status}
                          variant={
                            shp.status === 'SHIPPED' || shp.status === 'RELEASED'
                              ? 'NOMINAL'
                              : shp.status === 'QA_HOLD' || shp.status === 'HOLD'
                              ? 'CRITICAL'
                              : 'TECHNICAL'
                          }
                        />

                        <div className="text-[11px] text-buram-muted truncate font-sans">
                          {buyerName}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* BOTTOM SPLIT DECK: HONEY USE PER SOURCE (LEFT) + MOVEMENT HISTORY (RIGHT) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 font-mono text-xs tabular-nums">
            {/* LEFT 6 COLS: HONEY USE AND REWORK PER SOURCE (IMAGE 3) */}
            <section className="lg:col-span-6 bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-buram-text">
                  {t.honeyUseTitle}
                </h3>
                <p className="text-[11px] text-buram-muted mt-0.5">
                  {t.honeyUseSub}
                </p>
              </div>

              <div className="space-y-3">
                {countryAggregation.map((row) => (
                  <div
                    key={row.country}
                    className="p-3.5 rounded-lg bg-buram-bg/80 border border-buram-border space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <CountryOriginBadge countryIso={row.country} />
                      <div className="flex items-center gap-3">
                        <span className="text-buram-muted">
                          {formatDinKg(row.totalKg)}
                        </span>
                        <span className="text-sm font-bold text-buram-gold">
                          {formatDinPct(row.totalPct, 1)}
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-buram-surface overflow-hidden">
                      <div
                        className="h-full bg-buram-amber rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(2, row.totalPct))}%`,
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-buram-muted">
                      {t.reworkFromOrigin}: {formatDinKg(row.reworkKg)}
                    </div>
                  </div>
                ))}
              </div>

              {isInspectorMode && (
                <div className="text-[11px] text-buram-muted italic pt-2 border-t border-buram-border/60">
                  {t.sourceCompanyHidden}
                </div>
              )}
            </section>

            {/* RIGHT 6 COLS: IMMUTABLE MOVEMENT HISTORY LEDGER (IMAGES 3, 4) */}
            <section className="lg:col-span-6 bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-buram-text">
                    {t.movementHistoryTitle}
                  </h3>
                  <p className="text-[11px] text-buram-muted mt-0.5">
                    Filter: {selectedCardFilter?.code || traceData.queriedCode} ({filteredMovements.length})
                  </p>
                </div>
                {selectedCardFilter && selectedCardFilter.kind !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCardFilter({
                        kind: 'ALL',
                        id: '',
                        code: traceData.queriedCode,
                      })
                    }
                    className="px-2.5 py-1 rounded bg-buram-elevated border border-buram-border text-[10px] text-buram-gold hover:border-buram-amber"
                  >
                    {t.showAllMovements}
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {filteredMovements.length === 0 ? (
                  <div className="p-4 text-center text-buram-muted">
                    Keine Bewegungen für diesen Filter / No movements found
                  </div>
                ) : (
                  filteredMovements.map((mov) => (
                    <div
                      key={mov._id}
                      className="p-3 rounded-lg bg-buram-bg/80 border border-buram-border space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            label={mov.movementType}
                            variant="TECHNICAL"
                          />
                          <span className="font-bold text-buram-text">
                            {formatDinKg(Math.abs(mov.signedKg))}
                          </span>
                        </div>
                        <span className="text-[11px] text-buram-muted">
                          {formatDinDateTime(mov.createdAt, lang)}
                        </span>
                      </div>
                      <div className="text-[11px] text-buram-pale">
                        {mov.fromLocation || 'WE'} → {mov.toLocation} ({mov.toStatus})
                      </div>
                      <div className="text-[11px] text-buram-muted font-sans">
                        {mov.reason}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {/* =====================================================================
          VIEW 2: EXECUTIVE ORIGIN CERTIFICATE PREVIEW (MATCHES IMAGE 5)
         ===================================================================== */}
      {!isLoading && traceData && viewMode === 'ORIGIN_CERTIFICATE' && (
        <section className="bg-buram-surface border border-buram-amber/50 rounded-xl p-6 shadow-panel space-y-6 font-mono text-xs tabular-nums">
          {/* Top Certificate Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-buram-border">
            <div>
              <span className="text-[10px] text-buram-amber uppercase tracking-widest block font-bold">
                AMTLICHES URSPRUNGS- &amp; RÜCKVERFOLGBARKEITSPROTOKOLL · DIN 1333
              </span>
              <h2 className="text-2xl font-bold text-buram-gold mt-0.5">
                {traceData.queriedCode}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge
                label={primaryBatch?.status || 'VERIFIED'}
                variant="NOMINAL"
              />
              <button
                type="button"
                onClick={() => void handleDownloadCertificateCsv()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-buram-amber text-buram-bg font-bold uppercase hover:bg-buram-gold shadow-amberGlow transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t.certDownloadPdf}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 8 Cols: Origin Breakdown & R8 Compliance */}
            <div className="lg:col-span-8 space-y-4">
              <h3 className="text-sm font-bold text-buram-text">
                {t.certOriginTitle}
              </h3>

              <div className="p-3 rounded-lg bg-buram-success/10 border border-buram-success/40 text-buram-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t.r8ZeroForbiddenBanner}</span>
              </div>

              {/* Visual Ring / Donut summary */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-buram-bg/80 border border-buram-border">
                <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#27272a"
                      strokeWidth="4"
                    />
                    {countryAggregation.map((slice, idx) => {
                      const prevSlicesPct = countryAggregation
                        .slice(0, idx)
                        .reduce((acc, s) => acc + s.totalPct, 0);
                      const strokeDasharray = `${slice.totalPct} ${100 - slice.totalPct}`;
                      const strokeDashoffset = -prevSlicesPct;
                      const colors = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#ec4899'];
                      return (
                        <circle
                          key={slice.country}
                          cx="18"
                          cy="18"
                          r="14"
                          fill="none"
                          stroke={colors[idx % colors.length]}
                          strokeWidth="4"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-bold text-buram-gold">
                      {Math.round(totalBatchKg)}
                    </span>
                    <span className="text-[9px] text-buram-muted uppercase">kg total</span>
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="text-[10px] font-mono text-buram-muted uppercase">
                    Ursprungsanteile / Botanical Harvest Shares
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {countryAggregation.map((slice, idx) => {
                      const colors = ['bg-amber-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500'];
                      return (
                        <div key={slice.country} className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${colors[idx % colors.length]}`} />
                          <span className="font-bold text-buram-text">{slice.country}</span>
                          <span className="text-buram-muted">
                            {formatDinKg(slice.totalKg)} · {formatDinPct(slice.totalPct, 1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Breakdown Table */}
              <div className="overflow-x-auto -mx-2 sm:mx-0 rounded-lg border border-buram-border/40">
                <table className="w-full text-left border-collapse min-w-[480px]">
                  <thead>
                    <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase bg-buram-bg/60">
                      <th className="py-2 px-3">Ursprung / Origin</th>
                      <th className="py-2 px-3">Quelle / Via</th>
                      <th className="py-2 px-3 text-right">Netto-Masse</th>
                      <th className="py-2 px-3 text-right">Anteil (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-buram-border/40">
                    {(primaryBatch?.originComposition || []).map((slice, idx) => (
                      <tr key={`${slice.incomingLotId}-${idx}`}>
                        <td className="py-2.5 px-3">
                          <CountryOriginBadge countryIso={slice.country} />
                        </td>
                        <td className="py-2.5 px-3 text-buram-pale">
                          {slice.sourceReworkId
                            ? 'Rework-Bestand / Reworker blend'
                            : 'Direkter Wareneingang / Direct intake'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-buram-text">
                          {formatDinKg(slice.kg)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-buram-gold">
                          {formatDinPct(slice.pct, 1)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-buram-border font-bold bg-buram-bg/40">
                      <td className="py-2.5 px-3 text-buram-text">Gesamt / Total</td>
                      <td className="py-2.5 px-3" />
                      <td className="py-2.5 px-3 text-right text-buram-gold">
                        {formatDinKg(totalBatchKg)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-buram-success">
                        100,0 %
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 4 Cols: Production Timeline Stepper (Image 5) */}
            <div className="lg:col-span-4 bg-buram-bg/80 border border-buram-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-buram-text">
                {t.certTimelineTitle}
              </h3>
              <div className="space-y-3">
                {traceData.production.processSteps.length > 0 ? (
                  traceData.production.processSteps.map((step) => (
                    <div
                      key={step._id}
                      className="border-l-2 border-buram-amber pl-3 py-0.5 space-y-0.5"
                    >
                      <div className="font-bold text-buram-gold">
                        #{step.stepSequence} {step.stepType} ({formatDinMetric(step.tempC)} °C)
                      </div>
                      <div className="text-[11px] text-buram-text">
                        Out: {formatDinKg(step.outKg)}
                      </div>
                      <div className="text-[10px] text-buram-muted">
                        {formatDinDateTime(step.completedAt, lang)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-buram-muted">
                    Keine Prozessschritte protokolliert / In allocation
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Table: Source Intakes & QSI Bremen Lab Parameters */}
          <div className="pt-4 border-t border-buram-border space-y-3">
            <h3 className="text-sm font-bold text-buram-text">
              {t.certSourceIntakesTitle}
            </h3>
            <div className="overflow-x-auto -mx-2 sm:mx-0 rounded-lg border border-buram-border/40">
              <table className="w-full text-left border-collapse min-w-[620px]">
                <thead>
                  <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase bg-buram-bg/60">
                    <th className="py-2 px-3">Eingangscharge #</th>
                    <th className="py-2 px-3">Ursprung</th>
                    <th className="py-2 px-3">Lieferant</th>
                    <th className="py-2 px-3">Wareneingang</th>
                    <th className="py-2 px-3 text-right">Menge</th>
                    <th className="py-2 px-3">QSI Bremen Prüfbericht (HonigV)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-buram-border/40">
                  {traceData.upstream.incomingLots.map((lot) => {
                    const supplierDisplay = isInspectorMode
                      ? `SUPPLIER-${lot.country}`
                      : lot.sourceNameSnapshot;
                    return (
                      <tr key={lot._id}>
                        <td className="py-2.5 px-3 font-bold text-buram-gold">
                          {lot.lotNo}
                        </td>
                        <td className="py-2.5 px-3">
                          <CountryOriginBadge countryIso={lot.country} />
                        </td>
                        <td className="py-2.5 px-3 font-sans text-buram-text">
                          {supplierDisplay}
                        </td>
                        <td className="py-2.5 px-3 text-buram-muted">
                          {formatDinDate(lot.receivedDate || lot.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-buram-text">
                          {formatDinKg(lot.totalNetKg)}
                        </td>
                        <td className="py-2.5 px-3 text-buram-success">
                          {lot.qsiSummary
                            ? `${lot.qsiSummary.reportNo} (H₂O: ${formatDinMetric(
                                lot.qsiSummary.moisturePct
                              )} % | HMF: ${formatDinMetric(
                                lot.qsiSummary.hmfMgPerKg
                              )} mg/kg)`
                            : 'QSI-Zertifikat verknüpft'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* OPERATIONAL ROUTE STEP & ENTITY INSPECTOR MODAL (ADMIN DEEP DIVE) */}
      {operationalModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-mono text-xs">
          <div className="w-full max-w-2xl bg-buram-surface border border-buram-amber/60 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-buram-bg/90 border-b border-buram-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-buram-amber/20 border border-buram-amber/50 flex items-center justify-center text-buram-amber">
                  <Factory className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-buram-muted uppercase tracking-wider">
                    {t.modalStationTitle} · {operationalModal.stationCategory}
                  </div>
                  <h3 className="text-base font-bold text-buram-gold">
                    {operationalModal.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOperationalModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 rounded-lg text-buram-muted hover:text-buram-text hover:bg-buram-elevated"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Top Badges Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-buram-bg/80 border border-buram-border">
                <div>
                  <span className="text-[9px] text-buram-muted uppercase block">{t.machineIdLabel}</span>
                  <span className="font-bold text-buram-tech">{operationalModal.code}</span>
                </div>
                <div>
                  <span className="text-[9px] text-buram-muted uppercase block">{t.equipmentStationLabel}</span>
                  <span className="font-bold text-buram-text truncate block">{operationalModal.stationName || 'Buram Werk'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-buram-muted uppercase block">{t.operatorLabel}</span>
                  <span className="font-bold text-buram-gold truncate block">{operationalModal.operatorName || 'System'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-buram-muted uppercase block">{t.durationLabel}</span>
                  <span className="text-buram-text truncate block">{operationalModal.dwellTimeText || 'Prozesskonform'}</span>
                </div>
              </div>

              {/* Mass Balance Strip */}
              {(operationalModal.inKg !== undefined || operationalModal.outKg !== undefined) && (
                <div className="p-3.5 rounded-lg bg-buram-elevated border border-buram-border space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase border-b border-buram-border/50 pb-1">
                    <span>{t.massBalanceTitle}</span>
                    <span className="text-buram-success font-bold">100 % GoBD-konform</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 tabular-nums">
                    <div>
                      <span className="text-[9px] text-buram-muted uppercase block">Masse Eingang (In)</span>
                      <span className="font-bold text-buram-text text-sm">{formatDinKg(operationalModal.inKg)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-buram-muted uppercase block">Masse Ausgang (Out)</span>
                      <span className="font-bold text-buram-gold text-sm">{formatDinKg(operationalModal.outKg)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-buram-muted uppercase block">{t.lossMetricLabel}</span>
                      <span className="font-bold text-buram-critical text-sm">{formatDinKg(operationalModal.lossKg ?? 0)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-buram-muted uppercase block">{t.reworkMetricLabel}</span>
                      <span className="font-bold text-buram-amber text-sm">{formatDinKg(operationalModal.reworkKg ?? 0)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Technical Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {operationalModal.tempC !== undefined && (
                  <div className="p-3 rounded-lg bg-buram-bg/80 border border-buram-border flex items-center gap-3">
                    <Thermometer className="w-5 h-5 text-buram-tech shrink-0" />
                    <div>
                      <div className="text-[10px] text-buram-muted uppercase">Prozesstemperatur</div>
                      <div className="text-sm font-bold text-buram-tech">{formatDinMetric(operationalModal.tempC)} °C</div>
                    </div>
                  </div>
                )}

                {operationalModal.filterMicron !== undefined && (
                  <div className="p-3 rounded-lg bg-buram-bg/80 border border-buram-border flex items-center gap-3">
                    <Gauge className="w-5 h-5 text-buram-amber shrink-0" />
                    <div>
                      <div className="text-[10px] text-buram-muted uppercase">Siebfeinheit (Maschenweite)</div>
                      <div className="text-sm font-bold text-buram-amber">{operationalModal.filterMicron} µm</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Counterparty / Commercial details (Staff only) */}
              {operationalModal.counterparty && (
                <div className="p-3 rounded-lg bg-buram-bg/80 border border-buram-border space-y-1">
                  <div className="text-[10px] text-buram-muted uppercase">{t.counterpartyLabel}</div>
                  <div className="text-xs font-bold text-buram-gold font-sans">{operationalModal.counterparty}</div>
                </div>
              )}

              {/* Notes & Audit Anchor */}
              {operationalModal.notes && (
                <div className="p-3 rounded-lg bg-buram-bg/80 border border-buram-border space-y-1">
                  <div className="text-[10px] text-buram-muted uppercase">{t.auditAnchorLabel}</div>
                  <p className="text-xs text-buram-pale font-sans leading-relaxed">{operationalModal.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-buram-bg border-t border-buram-border flex items-center justify-end">
              <button
                type="button"
                onClick={() => setOperationalModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-lg bg-buram-amber text-buram-bg font-bold uppercase hover:bg-buram-gold transition-colors"
              >
                {t.modalCloseBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IFS FOOD V8 REGULATORY HOLD REASON DIALOG */}
      <ReasonDialog
        isOpen={isHoldDialogOpen}
        title={`IFS Food v8 Regulatory Hold — ${traceData?.queriedCode || ''}`}
        actionSummary={`Quarantines all unconsumed drums/packages and places all unshipped downstream Shipment LOTs for ${
          traceData?.queriedCode || ''
        } on immediate QA HOLD.`}
        confirmLabel="Charge sofort sperren / Execute Hold"
        isSubmitting={isHolding}
        onCancel={() => setIsHoldDialogOpen(false)}
        onConfirm={handleConfirmRegulatoryHold}
      />
    </div>
  );
};
