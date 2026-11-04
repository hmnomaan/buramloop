import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { UserSession } from '../types/erp';
import {
  StatusBadge,
  KgDisplay,
  ReasonDialog,
} from '../components/ui/IndustrialPrimitives';
import { apiClient } from '../lib/apiClient';

interface ServerCostBreakdownLine {
  inputKind: 'HONEY_DRUM' | 'REWORK' | 'FLAVOUR';
  materialId: string;
  materialName: string;
  incomingLotId?: string | null;
  lotNo?: string | null;
  country?: string | null;
  qtyKg: number;
  unitPriceEurPerKg: number;
  lineCostEur: number;
}

interface ServerCostReportRecord {
  _id: string;
  reportNo: string;
  processNo: string;
  shipmentLotNo?: string | null;
  currency: 'EUR';
  totalBatchKg: number;
  honeyCostEur: number;
  flavourCostEur: number;
  processingOverheadEur: number;
  packagingCostEur: number;
  totalCostEur: number;
  costPerKgEur: number;
  sellingPricePerKgEur: number;
  totalRevenueEur: number;
  marginEur: number;
  marginPct: number;
  breakdownLines: ServerCostBreakdownLine[];
  nextcloudAttachmentId?: string | null;
  createdAt: string;
}

interface ServerBatchOption {
  _id: string;
  processNo: string;
  status: string;
  actualOutKg?: number;
  totalFilledKg: number;
  approvedKg: number;
}

interface ServerPriceRecord {
  _id: string;
  country: string;
  currency: string;
  unitPricePerKg: number;
  effectiveDate: string;
  materialId: { code?: string; name?: string } | string;
  supplierId: { code?: string; name?: string } | string;
}

export const AdminCostsWorkspace: React.FC<{ user: UserSession }> = ({ user }) => {
  const isAuthorized =
    user.role === 'ADMIN' ||
    user.role === 'MANAGEMENT' ||
    user.permissions.includes('admin:costs');

  const [reports, setReports] = useState<ServerCostReportRecord[]>([]);
  const [prices, setPrices] = useState<ServerPriceRecord[]>([]);
  const [batches, setBatches] = useState<ServerBatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [sellingPricePerKgEur, setSellingPricePerKgEur] = useState(4.45);
  const [overheadEur, setOverheadEur] = useState(0);
  const [packagingEur, setPackagingEur] = useState(0);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isAuthorized) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [costData, batchData] = await Promise.all([
        apiClient.request<{
          reports: ServerCostReportRecord[];
          prices: ServerPriceRecord[];
        }>('/costs'),
        apiClient.request<ServerBatchOption[]>('/batches'),
      ]);
      if (
        !costData ||
        !Array.isArray(costData.reports) ||
        !Array.isArray(costData.prices) ||
        !Array.isArray(batchData)
      ) {
        throw new Error('The server returned an invalid cost or batch response.');
      }
      const reportList = costData.reports;
      const priceList = costData.prices;
      const completedBatches = batchData.filter((batch) => batch.status === 'DONE');
      setReports(reportList);
      setPrices(priceList);
      setBatches(completedBatches);
      setSelectedBatchId((current) =>
        completedBatches.some((batch) => batch._id === current)
          ? current
          : completedBatches[0]?._id ?? ''
      );
      setExpandedReportId((current) =>
        current && reportList.some((report) => report._id === current)
          ? current
          : reportList[0]?._id ?? null
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to load cost reports, prices, and completed batches.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleGenerateReport = async (reason: string) => {
    if (!selectedBatchId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await apiClient.auditedMutation<
        ServerCostReportRecord,
        Record<string, unknown>
      >('/costs/generate', 'POST', {
        body: {
          batchId: selectedBatchId,
          sellingPricePerKgEur,
          processingOverheadEur: overheadEur,
          packagingCostEur: packagingEur,
          managementRecipients: [],
        },
        reason,
      });
      setExpandedReportId(created._id);
      setIsReasonOpen(false);
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Server rejected cost report generation.'
      );
      setIsReasonOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatEur = (value: number) =>
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value || 0);

  if (!isAuthorized) {
    return (
      <div className="bg-buram-critical/10 border border-buram-critical rounded-lg p-8 text-center">
        <ShieldAlert className="w-8 h-8 text-buram-critical mx-auto mb-2" />
        <h2 className="text-lg font-bold text-buram-text">
          Access Restricted: Commercial Cost Reports
        </h2>
        <p className="text-xs text-buram-muted mt-1 font-mono">
          Role {user.role} lacks access to commercial cost reports.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-buram-amber uppercase tracking-widest">
            <Lock className="w-3.5 h-3.5" />
            <span>FINANCE &amp; COSTING</span>
          </div>
          <h1 className="text-xl font-bold text-buram-text mt-1">
            Batch Costing &amp; Reports
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={`RBAC: ${user.role}`} variant="NOMINAL" />
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isLoading}
            aria-label="Refresh cost data"
            className="p-2 rounded bg-buram-elevated border border-buram-border text-buram-text hover:border-buram-amber"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-buram-amber' : ''}`} />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded bg-buram-critical/15 border border-buram-critical/50 flex items-center gap-2 text-xs font-mono text-buram-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {user.role === 'ADMIN' && (
        <section className="bg-buram-surface border border-buram-amber/40 rounded-lg p-5 shadow-panel">
          <h2 className="text-xs font-mono uppercase tracking-wider text-buram-gold mb-3">
            Generate audited batch cost report
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 font-mono text-xs items-end">
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">COMPLETED BATCH *</span>
              <select
                value={selectedBatchId}
                onChange={(event) => setSelectedBatchId(event.target.value)}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              >
                <option value="" disabled>Select completed batch...</option>
                {batches.map((batch) => (
                  <option key={batch._id} value={batch._id}>
                    {batch.processNo} ({batch.actualOutKg ?? batch.totalFilledKg ?? batch.approvedKg} kg)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">SELL PRICE (EUR / KG) *</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={sellingPricePerKgEur}
                onChange={(event) => setSellingPricePerKgEur(Number(event.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-success"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">OVERHEAD (EUR)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={overheadEur}
                onChange={(event) => setOverheadEur(Number(event.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">PACKAGING (EUR)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={packagingEur}
                onChange={(event) => setPackagingEur(Number(event.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              />
            </label>
            <button
              type="button"
              disabled={
                !selectedBatchId ||
                sellingPricePerKgEur <= 0 ||
                overheadEur < 0 ||
                packagingEur < 0 ||
                isSubmitting
              }
              onClick={() => setIsReasonOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-buram-amber text-buram-bg font-bold uppercase hover:bg-buram-gold disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              Generate Report
            </button>
          </div>
          {batches.length === 0 && (
            <p className="mt-3 text-xs font-mono text-buram-muted">
              No completed batches are available for costing.
            </p>
          )}
        </section>
      )}

      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <h2 className="text-sm font-semibold text-buram-text mb-3">Cost reports</h2>
        {reports.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs text-buram-muted">
            {isLoading ? 'Loading reports...' : 'No cost reports found on the server.'}
          </p>
        ) : (
          <div className="space-y-3 font-mono text-xs tabular-nums">
            {reports.map((report) => {
              const isExpanded = expandedReportId === report._id;
              return (
                <article key={report._id} className="rounded border border-buram-border bg-buram-bg/70 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedReportId(isExpanded ? null : report._id)}
                    className="w-full p-3.5 hover:bg-buram-elevated/40 flex flex-wrap items-center justify-between gap-3 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-3">
                      <strong className="text-buram-gold text-sm">{report.reportNo}</strong>
                      <span className="text-buram-tech">{report.processNo}</span>
                      <KgDisplay kg={report.totalBatchKg} size="sm" />
                    </span>
                    <span className="flex flex-wrap items-center gap-4">
                      <span>Honey: <strong>{formatEur(report.honeyCostEur)}</strong></span>
                      <span>Flavour: <strong>{formatEur(report.flavourCostEur)}</strong></span>
                      <span>Unit cost: <strong>{formatEur(report.costPerKgEur)}/kg</strong></span>
                      <span>Sell: <strong>{formatEur(report.sellingPricePerKgEur)}/kg</strong></span>
                      <strong className="text-buram-success">
                        Margin: {formatEur(report.marginEur)} ({report.marginPct.toFixed(2)}%)
                      </strong>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="p-3.5 border-t border-buram-border overflow-x-auto">
                      <div className="text-[11px] text-buram-muted uppercase mb-2">
                        Server breakdown lines ({report.breakdownLines.length})
                      </div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-buram-border text-[10px] text-buram-muted uppercase">
                            <th className="py-1.5 px-2">Kind</th>
                            <th className="py-1.5 px-2">Material</th>
                            <th className="py-1.5 px-2">Lot</th>
                            <th className="py-1.5 px-2">Origin</th>
                            <th className="py-1.5 px-2 text-right">Qty (kg)</th>
                            <th className="py-1.5 px-2 text-right">Price/kg</th>
                            <th className="py-1.5 px-2 text-right">Line cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-buram-border/40">
                          {report.breakdownLines.map((line, index) => (
                            <tr key={`${report._id}-${index}`}>
                              <td className="py-1.5 px-2">{line.inputKind}</td>
                              <td className="py-1.5 px-2">{line.materialName}</td>
                              <td className="py-1.5 px-2">{line.lotNo || '—'}</td>
                              <td className="py-1.5 px-2">{line.country || '—'}</td>
                              <td className="py-1.5 px-2 text-right">{line.qtyKg.toFixed(3)}</td>
                              <td className="py-1.5 px-2 text-right">{formatEur(line.unitPriceEurPerKg)}</td>
                              <td className="py-1.5 px-2 text-right">{formatEur(line.lineCostEur)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <h2 className="text-sm font-semibold text-buram-text mb-3">
          Effective source prices ({prices.length})
        </h2>
        {prices.length === 0 ? (
          <p className="font-mono text-xs text-buram-muted">No effective prices returned by the server.</p>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-buram-border text-buram-muted uppercase">
                <th className="py-2 px-2">Material</th>
                <th className="py-2 px-2">Supplier</th>
                <th className="py-2 px-2">Country</th>
                <th className="py-2 px-2 text-right">Price/kg</th>
                <th className="py-2 px-2">Effective</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((price) => (
                <tr key={price._id} className="border-b border-buram-border/40">
                  <td className="py-2 px-2">
                    {typeof price.materialId === 'object' ? price.materialId.name ?? price.materialId.code : price.materialId}
                  </td>
                  <td className="py-2 px-2">
                    {typeof price.supplierId === 'object' ? price.supplierId.name ?? price.supplierId.code : price.supplierId}
                  </td>
                  <td className="py-2 px-2">{price.country}</td>
                  <td className="py-2 px-2 text-right">{formatEur(price.unitPricePerKg)}</td>
                  <td className="py-2 px-2">{new Date(price.effectiveDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ReasonDialog
        isOpen={isReasonOpen}
        title="Generate Admin Cost Report"
        actionSummary={`Generate a server-computed cost and margin report at ${sellingPricePerKgEur} EUR/kg.`}
        isSubmitting={isSubmitting}
        onCancel={() => setIsReasonOpen(false)}
        onConfirm={handleGenerateReport}
      />
    </div>
  );
};
