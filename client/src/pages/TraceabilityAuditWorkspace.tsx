import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Database,
  Download,
  FileSpreadsheet,
  GitMerge,
  RefreshCw,
  Search,
} from 'lucide-react';
import { UserSession } from '../types/erp';
import {
  CountryOriginBadge,
  KgDisplay,
  StatusBadge,
} from '../components/ui/IndustrialPrimitives';
import { apiClient } from '../lib/apiClient';

interface OriginSlice {
  country: string;
  kg: number;
  pct: number;
  unitPriceEurPerKg?: number;
  costValueEur?: number;
  costSharePct?: number;
}

interface TraceResponse {
  queriedCode: string;
  inspectorMode: boolean;
  pricesVisible: boolean;
  snapshotAt: string;
  upstream: {
    incomingLots: Array<{
      _id: string;
      lotNo: string;
      country: string;
      packageType?: string;
      packageCount?: number;
      drumsCount?: number;
      unitWeightKg?: number;
      totalNetKg: number;
      unitPriceEurPerKg?: number;
      totalCostValueEur?: number;
      sourceNameSnapshot?: string;
      status: string;
    }>;
    drumsCount: number;
    drums: Array<{
      _id: string;
      drumCode: string;
      country: string;
      netKg: number;
      status: string;
      location: string;
      originComposition?: OriginSlice[];
    }>;
    packages: Array<{
      _id: string;
      packageCode: string;
      country: string;
      quantity?: number;
      unit?: string;
      netKg: number;
      status: string;
      location: string;
      originComposition?: OriginSlice[];
    }>;
  };
  production: {
    batches: Array<{
      _id: string;
      processNo: string;
      status: string;
      plannedKg: number;
      approvedKg: number;
      actualOutKg?: number;
      originComposition: OriginSlice[];
    }>;
    batchInputs: Array<{
      _id: string;
      processNo: string;
      inputKind: string;
      qtyKg: number;
      originSnapshot: OriginSlice[];
    }>;
    processSteps: Array<{
      _id: string;
      processNo: string;
      stepSequence: number;
      stepType: string;
      tempC: number;
      inKg: number;
      outKg: number;
      lossKg: number;
      reworkOutKg: number;
      completedAt?: string;
    }>;
    reworkStocks: Array<{
      _id: string;
      reworkNo: string;
      sourceProcessNo: string;
      sourceStage?: string;
      totalKg: number;
      remainingKg: number;
      status: string;
      origin: OriginSlice[];
    }>;
  };
  downstream: {
    shipmentLots: Array<{
      _id: string;
      shipmentLotNo: string;
      processNo: string;
      customerId: string;
      destinationCountry: string;
      orderedKg: number;
      shippedKg: number;
      status: string;
      originComposition: OriginSlice[];
      allowedCountriesSnapshot: string[];
    }>;
    customers: Array<{
      _id: string;
      code: string;
      name: string;
      country: string;
      allowedCountries: string[];
    }>;
  };
  ledgerMovements: Array<{
    _id: string;
    movementType: string;
    incomingLotId?: string;
    drumId?: string;
    stockPackageId?: string;
    signedKg: number;
    signedQty?: number;
    quantityUnit?: string;
    reason?: string;
    createdAt: string;
  }>;
}

interface AuditRecord {
  _id: string;
  createdAt: string;
  actorId?: { _id?: string; fullName?: string; email?: string } | string;
  actorRole: string;
  module: string;
  action: string;
  entityType: string;
  entityRef?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

interface ExportLogRecord {
  _id: string;
  module: string;
  format: string;
  entityIds: string[];
  filters?: Record<string, unknown>;
  fileName?: string;
  createdAt: string;
}

type ExportDataset = 'INCOMING_LOTS' | 'DRUM_STOCK' | 'BATCHES_PROCESS' | 'SHIPMENT_LOTS' | 'AUDIT_LOGS';
type ExportFormat = 'CSV' | 'XLSX' | 'PDF' | 'DOCX' | 'PRINT_JSON';

export const TraceabilityAuditWorkspace: React.FC<{ user: UserSession }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'GOVT_TRACE' | 'ADMIN_AUDIT'>(
    user.role === 'INSPECTOR' ? 'GOVT_TRACE' : 'ADMIN_AUDIT'
  );
  const [queryCode, setQueryCode] = useState('');
  // Advanced Admin Audit Filters
  const [filterModule, setFilterModule] = useState('ALL');
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditRecord | null>(null);
  const [traceData, setTraceData] = useState<TraceResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [exportLogs, setExportLogs] = useState<ExportLogRecord[]>([]);
  const [exportDataset, setExportDataset] = useState<ExportDataset>('SHIPMENT_LOTS');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('CSV');
  const [saveToNextcloud, setSaveToNextcloud] = useState(true);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [exportLogError, setExportLogError] = useState<string | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    setAuditError(null);
    setExportLogError(null);
    const [auditResult, exportResult] = await Promise.allSettled([
      apiClient.request<AuditRecord[]>('/audit'),
      apiClient.request<ExportLogRecord[]>('/exports/logs'),
    ]);
    if (auditResult.status === 'fulfilled') {
      if (Array.isArray(auditResult.value)) {
        setAuditLogs(auditResult.value);
      } else {
        setAuditError('The audit endpoint returned an invalid response.');
      }
    } else {
      setAuditError(
        auditResult.reason instanceof Error
          ? auditResult.reason.message
          : 'Failed to load immutable audit logs.'
      );
    }
    if (exportResult.status === 'fulfilled') {
      if (Array.isArray(exportResult.value)) {
        setExportLogs(exportResult.value);
      } else {
        setExportLogError('The export log endpoint returned an invalid response.');
      }
    } else {
      setExportLogError(
        exportResult.reason instanceof Error
          ? exportResult.reason.message
          : 'Failed to load export logs.'
      );
    }
    setIsLoadingLogs(false);
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleRunTrace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = queryCode.trim().toUpperCase();
    if (!code) return;

    setIsTracing(true);
    setTraceError(null);
    try {
      const result = await apiClient.request<TraceResponse>(
        `/trace/${encodeURIComponent(code)}`
      );
      setTraceData(result);
    } catch (error) {
      setTraceData(null);
      setTraceError(
        error instanceof Error ? error.message : `Trace lookup failed for ${code}.`
      );
    } finally {
      setIsTracing(false);
    }
  };

  const exportFilteredAuditToCsv = () => {
    if (auditLogs.length === 0) return;
    const headers = ['Timestamp (CET)', 'Role', 'Actor', 'Module', 'Action', 'Entity Type', 'Reference', 'Reason'];
    const rows = auditLogs.map((log) => [
      `"${new Date(log.createdAt).toLocaleString('de-DE')}"`,
      `"${log.actorRole}"`,
      `"${typeof log.actorId === 'object' ? log.actorId?.fullName || log.actorId?.email || 'System' : 'System'}"`,
      `"${log.module}"`,
      `"${log.action}"`,
      `"${log.entityType}"`,
      `"${log.entityRef ?? ''}"`,
      `"${(log.reason ?? '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `buramloop_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRunExport = async () => {
    setIsExporting(true);
    setTraceError(null);
    setExportMessage(null);
    try {
      const result = await apiClient.request<{
        exportId: string;
        dataset: string;
        format: string;
        rowCount: number;
        csvContent?: string;
        nextcloudPath?: string | null;
      }>('/exports/run', {
        method: 'POST',
        body: JSON.stringify({
          dataset: exportDataset,
          format: exportFormat,
          saveToNextcloud,
        }),
      });

      if (result.csvContent && exportFormat === 'CSV') {
        const url = URL.createObjectURL(
          new Blob([result.csvContent], { type: 'text/csv;charset=utf-8;' })
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${exportDataset}-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }

      setExportMessage(
        `Export ${result.exportId} completed: ${result.rowCount} ${result.dataset} rows (${result.format}).` +
          (result.nextcloudPath ? ` Archived at ${result.nextcloudPath}.` : '')
      );
      await loadLogs();
    } catch (error) {
      setTraceError(
        error instanceof Error ? error.message : 'Snapshot export failed on the server.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleString();
  const renderOrigin = (origin: OriginSlice[]) =>
    origin.map((slice, index) => (
      <span
        key={`${slice.country}-${index}`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-buram-bg border border-buram-border text-[10px]"
      >
        <CountryOriginBadge countryIso={slice.country} />
        <span>{slice.pct.toFixed(1)}% ({slice.kg.toFixed(3)} kg)</span>
        {slice.costSharePct !== undefined && (
          <span>â€¢ {slice.costSharePct.toFixed(1)}% cost</span>
        )}
      </span>
    ));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
        <div>
          <div className="text-[11px] font-mono text-buram-amber uppercase tracking-widest">
            COMPLIANCE
          </div>
          <h1 className="text-xl font-bold text-buram-text mt-1">
            Traceability, Audit &amp; Exports
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={`VIEWER: ${user.role}`} variant="TECHNICAL" />
          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={isLoadingLogs}
            aria-label="Refresh audit and export logs"
            className="p-2 rounded bg-buram-elevated border border-buram-border text-buram-text hover:border-buram-amber"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {traceError && (
        <div className="p-3.5 rounded bg-buram-critical/15 border border-buram-critical/50 flex items-center gap-2 text-xs font-mono text-buram-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{traceError}</span>
        </div>
      )}

      <form
        onSubmit={handleRunTrace}
        className="bg-buram-surface border border-buram-border rounded-lg p-4 shadow-panel flex flex-col sm:flex-row items-center gap-3"
      >
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-buram-amber absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={queryCode}
            onChange={(event) => setQueryCode(event.target.value)}
            placeholder="Incoming lot, drum/package, batch, rework, or shipment LOT code"
            className="w-full bg-buram-bg border border-buram-border rounded pl-9 pr-4 py-2 text-xs font-mono text-buram-text"
          />
        </div>
        <button
          type="submit"
          disabled={!queryCode.trim() || isTracing}
          className="px-4 py-2 rounded bg-buram-amber text-buram-bg font-mono text-xs font-bold uppercase disabled:opacity-40"
        >
          {isTracing ? 'Tracing...' : 'Run Trace'}
        </button>
      </form>

      {traceData && (
        <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel space-y-4 font-mono text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-buram-border pb-3">
            <div className="flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-buram-amber" />
              <strong className="text-buram-gold text-sm">
                Snapshot for {traceData.queriedCode}
              </strong>
            </div>
            <span className="text-buram-muted">
              {traceData.inspectorMode ? 'INSPECTOR REDACTION' : traceData.pricesVisible ? 'ADMIN PRICE VIEW' : 'PRICE FIELDS MASKED'}
              {' â€¢ '}{formatDate(traceData.snapshotAt)}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-3 rounded bg-buram-bg/80 border border-buram-border space-y-2">
              <h2 className="text-buram-amber uppercase font-bold">
                Incoming lots ({traceData.upstream.incomingLots.length}) â€¢ Packages ({traceData.upstream.drumsCount + traceData.upstream.packages.length})
              </h2>
              {traceData.upstream.incomingLots.map((lot) => (
                <article key={lot._id} className="p-2 rounded bg-buram-surface border border-buram-border">
                  <div className="flex justify-between gap-2">
                    <strong className="text-buram-gold">{lot.lotNo}</strong>
                    <CountryOriginBadge countryIso={lot.country} />
                  </div>
                  <p>{lot.sourceNameSnapshot ?? 'Supplier not recorded'} â€¢ {lot.status}</p>
                  <p>
                    {lot.packageCount ?? lot.drumsCount ?? 0} Ã— {lot.packageType ?? 'package'} â€¢ {lot.totalNetKg} kg
                    {lot.unitWeightKg ? ` (${lot.unitWeightKg} kg/package)` : ''}
                    {lot.unitPriceEurPerKg !== undefined && ` â€¢ â‚¬${lot.unitPriceEurPerKg.toFixed(2)}/kg`}
                  </p>
                </article>
              ))}
              {traceData.upstream.drums.map((drum) => (
                <article key={drum._id} className="p-2 rounded bg-buram-surface border border-buram-border">
                  <div className="flex justify-between gap-2">
                    <strong>{drum.drumCode}</strong><StatusBadge label={drum.status} variant="TECHNICAL" />
                  </div>
                  <p>{drum.country} â€¢ {drum.netKg} kg â€¢ {drum.location}</p>
                  {drum.originComposition?.length ? <div className="flex flex-wrap gap-1 mt-1">{renderOrigin(drum.originComposition)}</div> : null}
                </article>
              ))}
              {traceData.upstream.packages.map((stockPackage) => (
                <article key={stockPackage._id} className="p-2 rounded bg-buram-surface border border-buram-border">
                  <div className="flex justify-between gap-2">
                    <strong>{stockPackage.packageCode}</strong><StatusBadge label={stockPackage.status} variant="TECHNICAL" />
                  </div>
                  <p>{stockPackage.country} â€¢ {stockPackage.netKg} kg â€¢ {stockPackage.location}</p>
                  {stockPackage.originComposition?.length ? <div className="flex flex-wrap gap-1 mt-1">{renderOrigin(stockPackage.originComposition)}</div> : null}
                </article>
              ))}
            </div>

            <div className="p-3 rounded bg-buram-bg/80 border border-buram-border space-y-2">
              <h2 className="text-buram-tech uppercase font-bold">
                Production ({traceData.production.batches.length}) â€¢ Rework ({traceData.production.reworkStocks.length})
              </h2>
              {traceData.production.batches.map((batch) => (
                <article key={batch._id} className="p-2 rounded bg-buram-surface border border-buram-border space-y-1">
                  <div className="flex justify-between gap-2">
                    <strong className="text-buram-gold">{batch.processNo}</strong><StatusBadge label={batch.status} variant="TECHNICAL" />
                  </div>
                  <p>Input {batch.approvedKg} kg â€¢ Output {batch.actualOutKg ?? 0} kg</p>
                  <div className="flex flex-wrap gap-1">{renderOrigin(batch.originComposition)}</div>
                </article>
              ))}
              {traceData.production.processSteps.map((step) => (
                <article key={step._id} className="p-2 rounded bg-buram-surface border border-buram-border">
                  <strong>{step.processNo} â€¢ {step.stepSequence}. {step.stepType}</strong>
                  <p>{step.inKg} in â†’ {step.outKg} out â€¢ {step.lossKg} loss â€¢ {step.reworkOutKg} rework â€¢ {step.tempC}Â°C</p>
                  {step.completedAt && <p className="text-buram-muted">{formatDate(step.completedAt)}</p>}
                </article>
              ))}
              {traceData.production.batchInputs.map((input) => (
                <article key={input._id} className="p-2 rounded bg-buram-surface border border-buram-border">
                  <strong>{input.processNo} â€¢ {input.inputKind}</strong><p>{input.qtyKg} kg</p>
                  <div className="flex flex-wrap gap-1">{renderOrigin(input.originSnapshot)}</div>
                </article>
              ))}
              {traceData.production.reworkStocks.map((rework) => (
                <article key={rework._id} className="p-2 rounded bg-buram-amber/10 border border-buram-amber/40">
                  <div className="flex justify-between gap-2">
                    <strong className="text-buram-gold">{rework.reworkNo}</strong><KgDisplay kg={rework.remainingKg} size="sm" />
                  </div>
                  <p>{rework.sourceProcessNo} â€¢ {rework.sourceStage ?? 'stage unknown'} â€¢ {rework.status}</p>
                  <div className="flex flex-wrap gap-1">{renderOrigin(rework.origin)}</div>
                </article>
              ))}
            </div>

            <div className="p-3 rounded bg-buram-bg/80 border border-buram-border space-y-2">
              <h2 className="text-buram-success uppercase font-bold">
                Shipments ({traceData.downstream.shipmentLots.length}) â€¢ Customers ({traceData.downstream.customers.length})
              </h2>
              {traceData.downstream.shipmentLots.map((shipment) => {
                const customer = traceData.downstream.customers.find(
                  (entry) => entry._id === shipment.customerId
                );
                return (
                  <article key={shipment._id} className="p-2 rounded bg-buram-surface border border-buram-border">
                    <div className="flex justify-between gap-2">
                      <strong className="text-buram-gold">{shipment.shipmentLotNo}</strong><StatusBadge label={shipment.status} variant="NOMINAL" />
                    </div>
                    <p>{shipment.processNo} â€¢ {customer?.name ?? 'Customer'} â€¢ {shipment.destinationCountry}</p>
                    <p>Ordered {shipment.orderedKg} kg â€¢ Shipped {shipment.shippedKg} kg</p>
                    <p>Allowed origins: {shipment.allowedCountriesSnapshot.join(', ')}</p>
                    <div className="flex flex-wrap gap-1 mt-1">{renderOrigin(shipment.originComposition)}</div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <h2 className="font-bold text-buram-text mb-2">Stock ledger movements ({traceData.ledgerMovements.length})</h2>
            <table className="w-full text-left">
              <thead><tr className="border-b border-buram-border text-buram-muted"><th className="p-2">Time</th><th className="p-2">Movement</th><th className="p-2">Quantity</th><th className="p-2">Reason</th></tr></thead>
              <tbody>
                {traceData.ledgerMovements.map((movement) => (
                  <tr key={movement._id} className="border-b border-buram-border/40">
                    <td className="p-2">{formatDate(movement.createdAt)}</td>
                    <td className="p-2">{movement.movementType}</td>
                    <td className="p-2">{movement.signedKg} kg{movement.signedQty !== undefined ? ` / ${movement.signedQty} ${movement.quantityUnit ?? ''}` : ''}</td>
                    <td className="p-2">{movement.reason ?? 'â€”'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
        <div className="flex items-center gap-2 border-b border-buram-border pb-3">
          <FileSpreadsheet className="w-4 h-4 text-buram-tech" />
          <h2 className="text-sm font-semibold">Snapshot export service</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs items-end">
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">DATASET</span>
            <select value={exportDataset} onChange={(event) => setExportDataset(event.target.value as ExportDataset)} className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text">
              <option value="INCOMING_LOTS">INCOMING_LOTS</option>
              <option value="DRUM_STOCK">DRUM_STOCK</option>
              <option value="BATCHES_PROCESS">BATCHES_PROCESS</option>
              <option value="SHIPMENT_LOTS">SHIPMENT_LOTS</option>
              <option value="AUDIT_LOGS">AUDIT_LOGS</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">FORMAT</span>
            <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)} className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-gold">
              <option value="CSV">CSV</option><option value="XLSX">XLSX</option><option value="PDF">PDF</option><option value="DOCX">DOCX</option><option value="PRINT_JSON">PRINT_JSON</option>
            </select>
          </label>
          <label className="flex items-center gap-2 py-2 text-buram-text cursor-pointer">
            <input type="checkbox" checked={saveToNextcloud} onChange={(event) => setSaveToNextcloud(event.target.checked)} />
            <span>Archive copy to Nextcloud</span>
          </label>
          <button type="button" disabled={isExporting} onClick={() => void handleRunExport()} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-buram-amber text-buram-bg font-bold uppercase disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />{isExporting ? 'Exporting...' : 'Run export'}
          </button>
        </div>
        {exportMessage && <p className="mt-3 p-3 rounded bg-buram-success/10 border border-buram-success/40 text-xs text-buram-success">{exportMessage}</p>}
      </section>

      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <div className="flex items-center gap-2 pb-3 border-b border-buram-border">
          <Database className="w-4 h-4 text-buram-amber" />
          <h2 className="text-sm font-semibold">Immutable audit log ({auditLogs.length})</h2>
        </div>
        {auditError && <p className="mt-3 text-xs text-buram-critical">{auditError}</p>}
        {!auditError && auditLogs.length === 0 && <p className="mt-3 text-xs text-buram-muted">No audit records returned.</p>}
        {auditLogs.length > 0 && (
          <table className="w-full mt-3 text-left font-mono text-xs">
            <thead><tr className="border-b border-buram-border text-buram-muted"><th className="p-2">Timestamp</th><th className="p-2">Role</th><th className="p-2">Action</th><th className="p-2">Entity</th><th className="p-2">Reason</th></tr></thead>
            <tbody>{auditLogs.slice(0, 50).map((log) => <tr key={log._id} className="border-b border-buram-border/40"><td className="p-2">{formatDate(log.createdAt)}</td><td className="p-2">{log.actorRole}</td><td className="p-2">{log.module}:{log.action}</td><td className="p-2">{log.entityRef ?? log.entityType}</td><td className="p-2">{log.reason ?? 'â€”'}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <h2 className="text-sm font-semibold">Export history ({exportLogs.length})</h2>
        {exportLogError && <p className="mt-3 text-xs text-buram-critical">{exportLogError}</p>}
        {!exportLogError && exportLogs.length === 0 && <p className="mt-3 text-xs text-buram-muted">No export records returned.</p>}
        {exportLogs.length > 0 && (
          <table className="w-full mt-3 text-left font-mono text-xs">
            <thead><tr className="border-b border-buram-border text-buram-muted"><th className="p-2">Timestamp</th><th className="p-2">Dataset</th><th className="p-2">Format</th><th className="p-2">File</th><th className="p-2">Entities</th></tr></thead>
            <tbody>{exportLogs.map((log) => <tr key={log._id} className="border-b border-buram-border/40"><td className="p-2">{formatDate(log.createdAt)}</td><td className="p-2">{log.module}</td><td className="p-2">{log.format}</td><td className="p-2">{log.fileName ?? 'â€”'}</td><td className="p-2">{log.entityIds?.length ?? 0}</td></tr>)}</tbody>
          </table>
        )}
      </section>
    </div>
  );
};
