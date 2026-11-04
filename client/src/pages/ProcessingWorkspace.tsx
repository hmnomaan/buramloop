// client/src/pages/ProcessingWorkspace.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  Cpu,
  CheckCircle2,
  ArrowRight,
  Thermometer,
  Recycle,
  Paperclip,
  UserCheck,
  Database,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  StatusBadge,
  KgDisplay,
  TemperatureDisplay,
  CountryOriginBadge,
  FeedbackModal,
  FeedbackModalState,
  MassBalanceIndicator,
  ReasonDialog,
} from '../components/ui/IndustrialPrimitives';
import { apiClient } from '../lib/apiClient';

export interface ProcessStageLog {
  id: string;
  stage: 'WARMING' | 'FILTERING' | 'BLENDING' | 'FILLING';
  sevenStageState: string;
  inKg: number;
  outKg: number;
  lossKg: number;
  reworkOutKg: number;
  tempC: number;
  personInChargeName: string;
  tankCode?: string;
  fillLineCode?: 'QUIEL_PET' | 'CARLO_JAR' | 'HAND';
  completedAt: string;
  reworkGeneratedCode?: string;
}

export interface ReworkDrumRecord {
  reworkNo: string;
  drumCode: string;
  sourceProcessNo: string;
  sourceStage: string;
  netKg: number;
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
  createdAt: string;
}

export interface ActiveProcessBatch {
  id: string;
  processNo: string; // Equal to batchNo per R7
  customerName: string;
  allowedCountries: string[];
  flavourProfile: string;
  currentSevenStage:
    | 'RESERVED'
    | 'WARMING_IN'
    | 'WARMING_OUT'
    | 'FILTERING'
    | 'BLENDING'
    | 'RESTING_TANK'
    | 'FILLING'
    | 'COMPLETED';
  approvedInputKg: number;
  originComposition: Array<{
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
  steps: ProcessStageLog[];
  reworkDrums: ReworkDrumRecord[];
}

interface ApiProcessRecord {
  _id: string;
  processNo: string;
  currentStage?: string;
  plannedKg?: number;
  approvedKg?: number;
  originComposition?: ActiveProcessBatch['originComposition'];
  steps?: Array<{
    _id: string;
    stage: string;
    stepType?: string;
    sevenStageState?: string;
    inKg: number;
    outKg: number;
    lossKg: number;
    reworkOutKg: number;
    tempC: number;
    personInChargeName: string;
    tankCode?: string;
    fillLineCode?: ProcessStageLog['fillLineCode'];
    completedAt?: string | Date;
    startedAt: string | Date;
  }>;
  reworkGenerated?: Array<{
    reworkNo: string;
    sourceProcessNo: string;
    sourceStage?: string;
    remainingKg: number;
    origin: ReworkDrumRecord['origin'];
    createdAt: string | Date;
  }>;
}

interface ProcessInfrastructure {
  tanks: Array<{ code: string; name: string; capacityKg: number; isActive: boolean }>;
  fillLines: Array<{
    code: 'QUIEL_PET' | 'CARLO_JAR' | 'HAND';
    name: string;
    isActive: boolean;
  }>;
}

const STAGE_ORDER: ActiveProcessBatch['currentSevenStage'][] = [
  'RESERVED',
  'WARMING_IN',
  'WARMING_OUT',
  'FILTERING',
  'BLENDING',
  'RESTING_TANK',
  'FILLING',
  'COMPLETED',
];

function mapApiProcess(record: ApiProcessRecord): ActiveProcessBatch {
  const stageMap: Record<string, ProcessStageLog['stage']> = {
    WARMING_IN: 'WARMING',
    WARMING_OUT: 'WARMING',
    FILTERING: 'FILTERING',
    FILTRATION: 'FILTERING',
    BLENDING: 'BLENDING',
    RESTING_TANK: 'BLENDING',
    FILLING: 'FILLING',
  };
  const currentSevenStage = STAGE_ORDER.includes(
    record.currentStage as ActiveProcessBatch['currentSevenStage']
  )
    ? (record.currentStage as ActiveProcessBatch['currentSevenStage'])
    : 'RESERVED';
  return {
    id: record._id,
    processNo: record.processNo,
    customerName: 'Customer',
    allowedCountries: [],
    flavourProfile: '',
    currentSevenStage,
    approvedInputKg: record.approvedKg ?? record.plannedKg ?? 0,
    originComposition: record.originComposition ?? [],
    steps: (record.steps ?? []).map((step) => ({
      id: step._id,
      stage: stageMap[step.stepType ?? step.stage] ?? 'BLENDING',
      sevenStageState:
        step.sevenStageState ??
        (step.stepType === 'FILTRATION' ? 'FILTERING' : step.stepType ?? currentSevenStage),
      inKg: step.inKg,
      outKg: step.outKg,
      lossKg: step.lossKg,
      reworkOutKg: step.reworkOutKg,
      tempC: step.tempC,
      personInChargeName: step.personInChargeName,
      tankCode: step.tankCode,
      fillLineCode: step.fillLineCode,
      completedAt: new Date(step.completedAt ?? step.startedAt).toISOString(),
    })),
    reworkDrums: (record.reworkGenerated ?? []).map((rework) => ({
      reworkNo: rework.reworkNo,
      drumCode: `DR-${rework.reworkNo}`,
      sourceProcessNo: rework.sourceProcessNo,
      sourceStage: rework.sourceStage ?? 'UNKNOWN',
      netKg: rework.remainingKg,
      origin: rework.origin,
      createdAt: new Date(rework.createdAt).toISOString(),
    })),
  };
}

function nextStageFor(current: ActiveProcessBatch['currentSevenStage']) {
  const index = STAGE_ORDER.indexOf(current);
  return STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)];
}

function coreStageFor(target: ActiveProcessBatch['currentSevenStage']): ProcessStageLog['stage'] {
  if (target === 'WARMING_IN' || target === 'WARMING_OUT') return 'WARMING';
  if (target === 'FILTERING') return 'FILTERING';
  if (target === 'FILLING' || target === 'COMPLETED') return 'FILLING';
  return 'BLENDING';
}

const SEVEN_STAGES = [
  { key: 'RESERVED', label: '0. Drums Reserved', sub: 'Locked in Stock Ledger' },
  { key: 'WARMING_IN', label: '1. Warm Room IN', sub: '2×17 Cabinets (40–43°C)' },
  { key: 'WARMING_OUT', label: '2. Warm Room OUT', sub: '24–48h Dwell Verified' },
  { key: 'FILTERING', label: '3. Filtration', sub: 'Fine Mesh Straining' },
  { key: 'BLENDING', label: '4. Blending & Flavours', sub: 'Homogenization' },
  { key: 'RESTING_TANK', label: '5. Resting Tank', sub: 'TANK-01 / TANK-02 Settling' },
  { key: 'FILLING', label: '6. Filling Line', sub: 'Quiel PET / Carlo Jar / Hand' },
  { key: 'COMPLETED', label: '7. Batch Completed', sub: 'Ready for Shipment LOT' },
] as const;

export const ProcessingWorkspace: React.FC<{
  operatorName: string;
  canViewPrices?: boolean;
  processes: ActiveProcessBatch[];
  onProcessUpdated: (updated: ActiveProcessBatch) => void;
}> = ({ operatorName, canViewPrices = false, processes, onProcessUpdated }) => {
  const [liveProcesses, setLiveProcesses] = useState(processes);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [infrastructure, setInfrastructure] = useState<ProcessInfrastructure>({
    tanks: [],
    fillLines: [],
  });
  const [selectedProcessId, setSelectedProcessId] = useState<string>(processes[0]?.id || '');
  const activeProcess =
    liveProcesses.find((p) => p.id === selectedProcessId) || liveProcesses[0];

  // Determine default stage form values from last completed step
  const lastStep = activeProcess?.steps[activeProcess.steps.length - 1];
  const defaultInKg = lastStep ? lastStep.outKg : activeProcess?.approvedInputKg || 6090;

  const [stage, setStage] = useState<'WARMING' | 'FILTERING' | 'BLENDING' | 'FILLING'>('WARMING');
  const [sevenStageTarget, setSevenStageTarget] =
    useState<ActiveProcessBatch['currentSevenStage']>('WARMING_IN');
  const [inKg, setInKg] = useState<number>(defaultInKg);
  const [outKg, setOutKg] = useState<number>(defaultInKg - 315);
  const [lossKg, setLossKg] = useState<number>(25);
  const [reworkOutKg, setReworkOutKg] = useState<number>(290);
  const [tempC, setTempC] = useState<number>(41.4);
  const [personInCharge, setPersonInCharge] = useState<string>(operatorName);
  const [tankCode, setTankCode] = useState<string>('TANK-01');
  const [fillLineCode, setFillLineCode] = useState<'QUIEL_PET' | 'CARLO_JAR' | 'HAND'>('QUIEL_PET');
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState | null>(null);

  const refreshFromServer = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [processData, infrastructureData] = await Promise.all([
        apiClient.request<ApiProcessRecord[]>('/production/process'),
        apiClient.request<ProcessInfrastructure>('/master/infrastructure'),
      ]);
      const mapped = (Array.isArray(processData) ? processData : []).map(mapApiProcess);
      setLiveProcesses(mapped);
      setSelectedProcessId((current) =>
        mapped.some((process) => process.id === current)
          ? current
          : mapped[0]?.id ?? ''
      );
      setInfrastructure(infrastructureData);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Failed to load process and infrastructure data from the server.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setLiveProcesses(processes);
  }, [processes]);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    if (!activeProcess) return;
    const target = nextStageFor(activeProcess.currentSevenStage);
    setSevenStageTarget(target);
    setStage(coreStageFor(target));
    const latest = activeProcess.steps[activeProcess.steps.length - 1];
    const nextIn = latest ? latest.outKg : activeProcess.approvedInputKg;
    setInKg(nextIn);
    setOutKg(Number(Math.max(0, nextIn - 15).toFixed(3)));
    setLossKg(Math.min(15, nextIn));
    setReworkOutKg(0);
  }, [activeProcess?.id, activeProcess?.currentSevenStage]);

  const varianceKg = Number((inKg - (outKg + lossKg + reworkOutKg)).toFixed(3));
  const isMassBalanced = Math.abs(varianceKg) <= 0.001 && inKg > 0;

  const handleSelectProcess = (proc: ActiveProcessBatch) => {
    setSelectedProcessId(proc.id);
    const latest = proc.steps[proc.steps.length - 1];
    const nextIn = latest ? latest.outKg : proc.approvedInputKg;
    const target = nextStageFor(proc.currentSevenStage);
    setSevenStageTarget(target);
    setStage(coreStageFor(target));
    setInKg(nextIn);
    setOutKg(Number(Math.max(0, nextIn - 15).toFixed(3)));
    setLossKg(Math.min(15, nextIn));
    setReworkOutKg(0);
  };

  const handleCommitStage = async (reason: string) => {
    if (!activeProcess) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const response = await apiClient.auditedMutation<{
        batch: { currentStage?: string; actualOutKg?: number };
        step: {
          _id: string;
          stage: ProcessStageLog['stage'];
          inKg: number;
          outKg: number;
          lossKg: number;
          reworkOutKg: number;
          tempC: number;
          personInChargeName: string;
          tankCode?: string;
          fillLineCode?: ProcessStageLog['fillLineCode'];
          completedAt?: string | Date;
          startedAt: string | Date;
        };
        reworkStock?: {
          reworkNo: string;
          sourceProcessNo: string;
          sourceStage?: string;
          remainingKg: number;
          origin: ReworkDrumRecord['origin'];
          createdAt: string | Date;
        } | null;
        reworkDrum?: { drumCode: string } | null;
      }, Record<string, unknown>>('/production/process/step', 'POST', {
          body: {
            batchId: activeProcess.id,
            stage,
            sevenStageTarget,
            inKg,
            outKg,
            lossKg,
            reworkOutKg,
            tempC,
            personInChargeName: personInCharge,
            tankCode,
            fillLineCode: stage === 'FILLING' ? fillLineCode : undefined,
          },
          reason,
        });

      const newStep: ProcessStageLog = {
        id: response.step._id,
        stage: response.step.stage,
        sevenStageState: response.batch.currentStage ?? sevenStageTarget,
        inKg: response.step.inKg,
        outKg: response.step.outKg,
        lossKg: response.step.lossKg,
        reworkOutKg: response.step.reworkOutKg,
        tempC: response.step.tempC,
        personInChargeName: response.step.personInChargeName,
        tankCode: response.step.tankCode,
        fillLineCode: response.step.fillLineCode,
        completedAt: new Date(
          response.step.completedAt ?? response.step.startedAt
        ).toISOString(),
        reworkGeneratedCode: response.reworkStock?.reworkNo,
      };

      const newReworkDrums: ReworkDrumRecord[] =
        response.reworkStock
          ? [
              {
                reworkNo: response.reworkStock.reworkNo,
                drumCode: response.reworkDrum?.drumCode ?? `DR-${response.reworkStock.reworkNo}`,
                sourceProcessNo: response.reworkStock.sourceProcessNo,
                sourceStage: response.reworkStock.sourceStage ?? stage,
                netKg: response.reworkStock.remainingKg,
                origin: response.reworkStock.origin,
                createdAt: new Date(response.reworkStock.createdAt).toISOString(),
              },
              ...activeProcess.reworkDrums,
            ]
          : activeProcess.reworkDrums;

      const updatedBatch: ActiveProcessBatch = {
        ...activeProcess,
        currentSevenStage:
          (response.batch.currentStage as ActiveProcessBatch['currentSevenStage'] | undefined) ??
          sevenStageTarget,
        steps: [...activeProcess.steps, newStep],
        reworkDrums: newReworkDrums,
      };

      setLiveProcesses((previous) =>
        previous.map((process) => (process.id === updatedBatch.id ? updatedBatch : process))
      );
      onProcessUpdated(updatedBatch);
      await refreshFromServer();
      setInKg(outKg);
      setOutKg(Number(Math.max(0, outKg - 15).toFixed(3)));
      setLossKg(Math.min(15, outKg));
      setReworkOutKg(0);
      setIsReasonOpen(false);
      setFeedbackModal({
        isOpen: true,
        variant: 'SUCCESS',
        title:
          updatedBatch.currentSevenStage === 'COMPLETED'
            ? 'Batch Filling Completed!'
            : `${stage} Stage Committed!`,
        detailBadge: `${activeProcess.processNo} → ${updatedBatch.currentSevenStage}`,
        message: `Recorded IN=${inKg} kg, OUT=${outKg} kg, LOSS=${lossKg} kg${
          response.reworkStock
            ? `, and serialized Rework Drum ${
                response.reworkDrum?.drumCode ?? `DR-${response.reworkStock.reworkNo}`
              } (${reworkOutKg} kg).`
            : '.'
        }`,
      });
    } catch (cause) {
      const errMsg =
        cause instanceof Error ? cause.message : 'The process stage could not be saved.';
      setSubmitError(errMsg);
      setIsReasonOpen(false);
      setFeedbackModal({
        isOpen: true,
        variant: 'ERROR',
        title: 'Process Stage Commit Failed',
        detailBadge: `${activeProcess.processNo} · ${stage}`,
        message: errMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeProcess) {
    return (
      <div className="rounded-lg border border-buram-border bg-buram-surface p-6 text-sm text-buram-muted space-y-3">
        <p>
          {isLoading
            ? 'Loading process batches and infrastructure from the server…'
            : 'No production batches are available from the server. Reserve stock in Batch Planning before recording a process stage.'}
        </p>
        {loadError && <p role="alert" className="text-buram-critical">{loadError}</p>}
        <button type="button" onClick={() => void refreshFromServer()} disabled={isLoading} className="rounded border border-buram-border px-3 py-2 text-xs uppercase text-buram-text disabled:opacity-50">
          Refresh
        </button>
      </div>
    );
  }

  const activeStageIndex = SEVEN_STAGES.findIndex(
    (s) => s.key === activeProcess.currentSevenStage
  );
  const nextStage = nextStageFor(activeProcess.currentSevenStage);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-buram-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-buram-amber uppercase tracking-widest">
            <span>PRODUCTION</span>
            <span>•</span>
            <span>{activeProcess.processNo}</span>
          </div>
          <h1 className="text-2xl font-bold text-buram-text mt-1">
            Processing &amp; Filling
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshFromServer()}
            disabled={isLoading}
            aria-label="Refresh process data"
            className="p-2 rounded border border-buram-border text-buram-text disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {liveProcesses.map((proc) => (
            <button
              key={proc.id}
              type="button"
              onClick={() => handleSelectProcess(proc)}
              className={`px-3.5 py-2 rounded font-mono text-xs border transition-colors ${
                proc.id === activeProcess.id
                  ? 'bg-buram-amber text-buram-ink font-bold border-buram-amber shadow-amberGlow'
                  : 'bg-buram-surface text-buram-muted border-buram-border hover:text-buram-text'
              }`}
            >
              {proc.processNo} ({proc.currentSevenStage})
            </button>
          ))}
        </div>
        {loadError && (
          <p role="alert" className="rounded border border-buram-critical/50 bg-buram-critical/10 p-3 text-sm text-buram-critical">
            Process data refresh failed: {loadError}
          </p>
        )}
      </div>

      {/* 7-STAGE MISSION-CONTROL STATE MACHINE TIMELINE */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-buram-tech" />
            <h2 className="text-sm font-semibold text-buram-text uppercase font-mono tracking-wider">
              7-Stage State Machine Progression — {activeProcess.processNo}
            </h2>
          </div>
          {canViewPrices && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs font-mono">
                <thead className="text-buram-muted">
                  <tr>
                    <th className="text-left p-2">Origin / source</th>
                    <th className="text-right p-2">Weight</th>
                    <th className="text-right p-2">Weight %</th>
                    <th className="text-right p-2">EUR/kg</th>
                    <th className="text-right p-2">Cost EUR</th>
                    <th className="text-right p-2">Cost share</th>
                  </tr>
                </thead>
                <tbody>
                  {activeProcess.originComposition.map((origin, index) => (
                    <tr key={`${origin.country}-${index}`} className="border-t border-buram-border">
                      <td className="p-2 text-buram-text">
                        {origin.country} {origin.sourceReworkId ? '• REWORK' : '• HONEY'}
                      </td>
                      <td className="p-2 text-right">{origin.kg.toLocaleString()} kg</td>
                      <td className="p-2 text-right">{origin.pct.toFixed(2)}%</td>
                      <td className="p-2 text-right">€{(origin.unitPriceEurPerKg ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right">€{(origin.costValueEur ?? origin.valueEur ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{(origin.costSharePct ?? 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center gap-2">
            {activeProcess.originComposition.map((o) => (
              <CountryOriginBadge key={o.country} countryIso={o.country} percentage={o.pct} />
            ))}
            <StatusBadge label={activeProcess.currentSevenStage} variant="AMBER" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
          {SEVEN_STAGES.map((st, idx) => {
            const isDone = idx <= activeStageIndex;
            const isCurrent = idx === activeStageIndex;
            return (
              <div
                key={st.key}
                className={`p-3 rounded border font-mono text-xs transition-all ${
                  isCurrent
                    ? 'bg-buram-amber/15 border-buram-amber text-buram-text ring-1 ring-buram-gold shadow-amberGlow'
                    : isDone
                    ? 'bg-buram-success/10 border-buram-success/40 text-buram-text'
                    : 'bg-buram-bg/60 border-buram-border text-buram-muted'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-buram-muted">
                    STAGE {idx}
                  </span>
                  {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-buram-success" />}
                </div>
                <div className="font-bold text-buram-pale truncate">{st.label}</div>
                <div className="text-[10px] text-buram-muted mt-1 leading-tight">{st.sub}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* TWO-COLUMN EXECUTION FORM + STAGE LEDGER & REWORK SERIALIZATION */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: STAGE EXECUTION & MASS-BALANCE TERMINAL */}
        <section className="xl:col-span-7 bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-buram-border">
            <h2 className="text-base font-semibold text-buram-text">
              Log Stage Execution & Mass Balance ({activeProcess.processNo})
            </h2>
            <StatusBadge
              label={isMassBalanced ? 'MASS BALANCED' : 'IMBALANCE BLOCKED'}
              variant={isMassBalanced ? 'NOMINAL' : 'CRITICAL'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted uppercase">Stage</span>
              <select
                value={stage}
                disabled
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              >
                <option value="WARMING">1. WARMING</option>
                <option value="FILTERING">2. FILTERING</option>
                <option value="BLENDING">3. BLENDING</option>
                <option value="FILLING">4. FILLING</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-buram-muted uppercase">Target Step</span>
              <select
                value={sevenStageTarget}
                onChange={(e) => {
                  const target = e.target.value as ActiveProcessBatch['currentSevenStage'];
                  setSevenStageTarget(target);
                  setStage(coreStageFor(target));
                }}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              >
                {STAGE_ORDER.slice(1).map((target) => (
                  <option key={target} value={target} disabled={target !== nextStage}>
                    {target}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-buram-muted uppercase">Temperature (°C) *</span>
              <input
                type="number"
                step="0.1"
                value={tempC}
                onChange={(e) => setTempC(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-tech tabular-nums font-bold"
              />
            </label>
          </div>

          {/* Resting Tank, Filling Line & Operator Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted uppercase">Resting Tank</span>
              <select
                value={tankCode}
                onChange={(e) => setTankCode(e.target.value)}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              >
                {infrastructure.tanks.filter((tank) => tank.isActive).map((tank) => (
                  <option key={tank.code} value={tank.code}>
                    {tank.code} ({tank.capacityKg.toLocaleString()} kg)
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-buram-muted uppercase">Filling Line</span>
              <select
                value={fillLineCode}
                onChange={(e) => setFillLineCode(e.target.value as any)}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-gold"
              >
                {infrastructure.fillLines.filter((line) => line.isActive).map((line) => (
                  <option key={line.code} value={line.code}>{line.code} ({line.name})</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-buram-muted uppercase">Operator *</span>
              <input
                type="text"
                value={personInCharge}
                onChange={(e) => setPersonInCharge(e.target.value)}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              />
            </label>
          </div>

          {/* Mass-Balance Numeric Inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 font-mono text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">INPUT (inKg)</span>
              <input
                type="number"
                step="0.1"
                value={inKg}
                onChange={(e) => setInKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-sm font-bold text-buram-tech tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">OUTPUT (outKg)</span>
              <input
                type="number"
                step="0.1"
                value={outKg}
                onChange={(e) => setOutKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-sm font-bold text-buram-success tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">LOSS (lossKg)</span>
              <input
                type="number"
                step="0.1"
                value={lossKg}
                onChange={(e) => setLossKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-sm font-bold text-buram-warning tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">REWORK OUT (kg)</span>
              <input
                type="number"
                step="0.1"
                value={reworkOutKg}
                onChange={(e) => setReworkOutKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-sm font-bold text-buram-gold tabular-nums"
              />
            </label>
          </div>

          <MassBalanceIndicator
            inputKg={inKg}
            outputKg={outKg}
            lossKg={lossKg}
            reworkOutKg={reworkOutKg}
          />

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              disabled={!isMassBalanced || isSubmitting || activeProcess.currentSevenStage === 'COMPLETED'}
              onClick={() => setIsReasonOpen(true)}
              className="px-4 py-2.5 rounded bg-buram-amber text-buram-ink font-mono text-xs font-bold uppercase tracking-wider hover:bg-buram-gold disabled:opacity-40 disabled:cursor-not-allowed shadow-amberGlow"
            >
              {activeProcess.currentSevenStage === 'COMPLETED'
                ? 'Batch Completed'
                : `Commit ${stage} Stage`}
            </button>
          </div>
          {submitError && (
            <p role="alert" className="text-sm text-buram-critical">
              {submitError}
            </p>
          )}
        </section>

        {/* RIGHT 5 COLS: AUTO-GENERATED REWORK DRUMS & STAGE HISTORY */}
        <section className="xl:col-span-5 space-y-6">
          {/* Generated Rework Stocks with Inherited Origin[] */}
          <div className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-buram-border">
              <div className="flex items-center gap-2">
                <Recycle className="w-4 h-4 text-buram-gold" />
                <h2 className="text-base font-semibold text-buram-text">
                  Rework Drums
                </h2>
              </div>
              <StatusBadge label="ORIGIN TRACKED" variant="AMBER" />
            </div>

            <div className="mt-3 space-y-3">
              {activeProcess.reworkDrums.map((rw) => (
                <div
                  key={rw.reworkNo}
                  className="p-3.5 rounded bg-buram-bg/80 border border-buram-amber/40 space-y-2"
                >
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="font-bold text-buram-gold">
                      {rw.reworkNo} ({rw.drumCode})
                    </span>
                    <KgDisplay kg={rw.netKg} />
                  </div>
                  <div className="text-[11px] font-mono text-buram-muted">
                    Source: <strong className="text-buram-text">{rw.sourceProcessNo}</strong> • Stage:{' '}
                    <strong className="text-buram-tech">{rw.sourceStage}</strong>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-buram-muted uppercase">
                      Inherited Origin Composition:
                    </span>
                    {rw.origin.map((o) => (
                      <CountryOriginBadge
                        key={o.country}
                        countryIso={o.country}
                        percentage={o.pct}
                      />
                    ))}
                  </div>
                  {canViewPrices && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] font-mono">
                        <thead className="text-buram-muted">
                          <tr>
                            <th className="text-left p-1">Country</th>
                            <th className="text-right p-1">kg / weight %</th>
                            <th className="text-right p-1">EUR/kg</th>
                            <th className="text-right p-1">Cost / share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rw.origin.map((slice, index) => (
                            <tr key={`${slice.country}-${index}`} className="border-t border-buram-border">
                              <td className="p-1">{slice.country} {slice.sourceReworkId ? '• REWORK' : '• HONEY'}</td>
                              <td className="p-1 text-right">{slice.kg} / {slice.pct.toFixed(2)}%</td>
                              <td className="p-1 text-right">€{(slice.unitPriceEurPerKg ?? 0).toFixed(2)}</td>
                              <td className="p-1 text-right">€{(slice.costValueEur ?? slice.valueEur ?? 0).toFixed(2)} / {(slice.costSharePct ?? 0).toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recorded Stage History */}
          <div className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
            <h2 className="text-base font-semibold text-buram-text pb-3 border-b border-buram-border">
              Recorded Steps ({activeProcess.steps.length})
            </h2>
            <div className="mt-3 space-y-2.5">
              {activeProcess.steps.map((st) => (
                <div
                  key={st.id}
                  className="p-3 rounded bg-buram-bg/70 border border-buram-border font-mono text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-buram-pale">
                      {st.stage} → {st.sevenStageState}
                    </span>
                    <TemperatureDisplay celsius={st.tempC} />
                  </div>
                  <div className="text-buram-muted tabular-nums">
                    IN: <strong className="text-buram-tech">{st.inKg}kg</strong> | OUT:{' '}
                    <strong className="text-buram-success">{st.outKg}kg</strong> | LOSS:{' '}
                    <strong className="text-buram-warning">{st.lossKg}kg</strong> | REWORK:{' '}
                    <strong className="text-buram-gold">{st.reworkOutKg}kg</strong>
                  </div>
                  <div className="text-[11px] text-buram-muted flex items-center justify-between">
                    <span>Operator: {st.personInChargeName}</span>
                    <span>{st.tankCode || st.fillLineCode || 'CAB-01/02'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <ReasonDialog
        isOpen={isReasonOpen}
        title={`Commit ${stage} Stage on ${activeProcess.processNo}`}
        actionSummary={`Records IN=${inKg}kg, OUT=${outKg}kg, LOSS=${lossKg}kg, REWORK=${reworkOutKg}kg at ${tempC}°C (${personInCharge}).`}
        isSubmitting={isSubmitting}
        onCancel={() => setIsReasonOpen(false)}
        onConfirm={handleCommitStage}
      />
      <FeedbackModal
        state={feedbackModal}
        onClose={() => setFeedbackModal(null)}
      />
    </div>
  );
};