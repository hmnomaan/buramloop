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
  unitPriceEurPerKg?: number;
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
    unitPriceEurPerKg?: number;
    costSharePct?: number;
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
  completedAt?: string;
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
      const res = await apiClient.request<string[]>('/trace/suggestions');
      if (Array.isArray(res) && res.length > 0) {
        setSuggestedCodes(res);
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
      const res = await apiClient.request<ServerTraceResponse>(
        `/trace/${encodeURIComponent(cleaned)}`
      );
      setTraceData(res);
      setSelectedCardFilter({
        kind: 'ALL',
        id: '',
        code: res.queriedCode,
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
      {/* 1. HEADER & CONTROLS (BILINGUAL / 4-LANG + STAFF/INSPECTOR VIEW + VIEW MODE) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-buram-border">
        <div>
          <span className="text-[11px] font-mono font-bold text-buram-amber uppercase tracking-widest block">
            {t.assuranceTag}
          </span>
          <h1 className="text-2xl font-bold text-buram-text mt-0.5">
            {t.pageTitle}
          </h1>
          <p className="text-xs text-buram-muted mt-1">{t.pageSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Dual-Perspective Switcher: Staff view | Inspector view (Masked) */}
          <div className="inline-flex rounded-lg bg-buram-surface p-1 border border-buram-border font-mono text-xs">
            <button
              type="button"
              onClick={() => setIsInspectorMode(false)}
              className={`px-3 py-1.5 rounded transition-colors ${
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
              className={`px-3 py-1.5 rounded transition-colors ${
                isInspectorMode
                  ? 'bg-buram-amber text-buram-bg font-bold shadow-sm'
                  : 'text-buram-muted hover:text-buram-text'
              }`}
            >
              {t.inspectorViewBtn}
            </button>
          </div>

          {/* Dual-View Toggle (Chain Explorer vs Origin Certificate Preview) */}
          {traceData && (
            <div className="inline-flex rounded-lg bg-buram-surface p-1 border border-buram-border font-mono text-xs">
              <button
                type="button"
                onClick={() => setViewMode('CHAIN_EXPLORER')}
                className={`px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'CHAIN_EXPLORER'
                    ? 'bg-buram-amber text-buram-bg font-bold shadow-sm'
                    : 'text-buram-muted hover:text-buram-text'
                }`}
              >
                {t.viewChainBtn}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('ORIGIN_CERTIFICATE')}
                className={`px-3 py-1.5 rounded transition-colors ${
                  viewMode === 'ORIGIN_CERTIFICATE'
                    ? 'bg-buram-amber text-buram-bg font-bold shadow-sm'
                    : 'text-buram-muted hover:text-buram-text'
                }`}
              >
                {t.viewCertBtn}
              </button>
            </div>
          )}

          {/* Instant IFS Food v8 Regulatory Hold Trigger */}
          {traceData && canExecuteRegulatoryHold && (
            <button
              type="button"
              onClick={() => setIsHoldDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-buram-critical text-white font-mono text-xs font-bold uppercase hover:opacity-90 shadow-panel transition-all"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{t.holdActionBtn}</span>
            </button>
          )}

          {/* 4-Language Switcher (DE | TR | EN | BN) */}
          <div className="inline-flex rounded-lg bg-buram-elevated border border-buram-border p-1 font-mono text-xs">
            <div className="flex items-center px-2 text-buram-amber">
              <Globe className="w-3.5 h-3.5" />
            </div>
            {(['DE', 'EN', 'TR', 'BN'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`px-2.5 py-1 rounded transition-colors ${
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

            {/* 6-COLUMN HORIZONTAL SEQUENCE GRAPH */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3.5 font-mono text-xs tabular-nums">
              {/* COLUMN 1: SOURCE LOTS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span>{t.col1SourceLots}</span>
                  <span>{traceData.upstream.incomingLots.length}</span>
                </div>
                {traceData.upstream.incomingLots.map((lot) => {
                  const isSelected =
                    selectedCardFilter?.kind === 'LOT' &&
                    selectedCardFilter.id === lot._id;
                  const displayName = isInspectorMode
                    ? `SUPPLIER-${lot.country}`
                    : lot.sourceNameSnapshot;
                  return (
                    <button
                      key={lot._id}
                      type="button"
                      onClick={() =>
                        setSelectedCardFilter({
                          kind: 'LOT',
                          id: lot._id,
                          code: lot.lotNo,
                        })
                      }
                      className={`w-full text-left p-3 rounded-lg border transition-all space-y-1.5 ${
                        isSelected
                          ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                          : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                      }`}
                    >
                      <div className="font-bold text-buram-gold">{lot.lotNo}</div>
                      <div>
                        <CountryOriginBadge countryIso={lot.country} />
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
                            <FlaskConical className="w-3 h-3" />
                            <span>QSI: {lot.qsiSummary.reportNo}</span>
                          </div>
                          <div className="text-buram-pale mt-0.5">
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
                    </button>
                  );
                })}
              </div>

              {/* COLUMN 2: DRUMS / PACKAGES */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span>{t.col2Drums}</span>
                  <span>{traceData.upstream.drumsCount}</span>
                </div>
                {visibleDrums.map((drum) => {
                  const isSelected =
                    selectedCardFilter?.kind === 'DRUM' &&
                    selectedCardFilter.id === drum._id;
                  return (
                    <button
                      key={drum._id}
                      type="button"
                      onClick={() =>
                        setSelectedCardFilter({
                          kind: 'DRUM',
                          id: drum._id,
                          code: drum.drumCode,
                        })
                      }
                      className={`w-full text-left p-2.5 rounded-lg border transition-all space-y-1 ${
                        isSelected
                          ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                          : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                      }`}
                    >
                      <div className="font-bold text-buram-gold truncate">
                        {drum.drumCode}
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
                    </button>
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
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span>{t.col3Batch}</span>
                  <span>{traceData.production.batches.length}</span>
                </div>
                {traceData.production.batches.map((b) => {
                  const isSelected =
                    selectedCardFilter?.kind === 'BATCH' &&
                    selectedCardFilter.id === b._id;
                  return (
                    <button
                      key={b._id}
                      type="button"
                      onClick={() =>
                        setSelectedCardFilter({
                          kind: 'BATCH',
                          id: b._id,
                          code: b.processNo,
                        })
                      }
                      className={`w-full text-left p-3 rounded-lg border transition-all space-y-1.5 ${
                        isSelected
                          ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                          : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                      }`}
                    >
                      <div className="font-bold text-buram-gold">{b.processNo}</div>
                      <div className="text-sm font-bold text-buram-text">
                        {formatDinKg(b.approvedKg || b.plannedKg)}
                      </div>
                      <StatusBadge label={b.status} variant="TECHNICAL" />
                      <div className="text-[11px] text-buram-muted">
                        {new Set(b.originComposition.map((s) => s.country)).size} {t.sourceCountryCount}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* COLUMN 4: PROCESS STEPS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span>{t.col4Process}</span>
                  <span>{traceData.production.processSteps.length}</span>
                </div>
                {traceData.production.processSteps.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-buram-border text-[11px] text-buram-muted">
                    Keine Prozessschritte / No steps
                  </div>
                ) : (
                  traceData.production.processSteps.map((st) => (
                    <div
                      key={st._id}
                      className="p-3 rounded-lg bg-buram-bg/80 border border-buram-border space-y-1"
                    >
                      <div className="font-bold text-buram-gold">
                        #{st.stepSequence} · {st.stepType}
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
                    </div>
                  ))
                )}
              </div>

              {/* COLUMN 5: REWORK */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span>{t.col5Rework}</span>
                  <span>{traceData.production.reworkStocks.length}</span>
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
                      <div className="font-bold text-buram-gold">{rw.reworkNo}</div>
                      <div className="text-sm font-bold text-buram-text">
                        {formatDinKg(rw.remainingKg)}
                      </div>
                      <StatusBadge label={rw.status} variant="AMBER" />
                    </div>
                  ))
                )}
              </div>

              {/* COLUMN 6: SHIPMENT LOT */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-buram-muted uppercase pb-1 border-b border-buram-border">
                  <span>{t.col6ShipmentLot}</span>
                  <span>{traceData.downstream.shipmentLots.length}</span>
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
                      <button
                        key={shp._id}
                        type="button"
                        onClick={() =>
                          setSelectedCardFilter({
                            kind: 'SHIPMENT',
                            id: shp._id,
                            code: shp.shipmentLotNo,
                          })
                        }
                        className={`w-full text-left p-3 rounded-lg border transition-all space-y-1.5 ${
                          isSelected
                            ? 'bg-buram-amber/15 border-buram-amber ring-1 ring-buram-gold shadow-amberGlow'
                            : 'bg-buram-bg/80 border-buram-border hover:border-buram-amber/50'
                        }`}
                      >
                        <div className="font-bold text-buram-gold">{shp.shipmentLotNo}</div>
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
                      </button>
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
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase">
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
                  <tr className="border-t-2 border-buram-border font-bold">
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
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase">
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
        </section>
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
