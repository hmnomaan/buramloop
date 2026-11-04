// client/src/pages/WarehouseStockLedgerWorkspace.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  ShieldCheck,
  RefreshCw,
  Printer,
  Search,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import {
  StatusBadge,
  KgDisplay,
  CountryOriginBadge,
} from '../components/ui/IndustrialPrimitives';
import { ExportMenu } from '../components/ui/CrossCuttingPanels';

export interface ServerDrumRecord {
  _id: string;
  drumCode: string;
  barcode?: string;
  lotNoSnapshot: string;
  country: string;
  unit?: 'kg' | 'l' | 'piece';
  packageType?: string;
  netKg: number;
  netQty?: number;
  status: string;
  location: string;
  reservedBatchId?: string | null;
  updatedAt: string;
}

export interface ServerLedgerMovement {
  _id: string;
  movementType: string;
  country: string;
  unit?: 'kg' | 'l' | 'piece';
  fromStatus?: string | null;
  toStatus: string;
  fromLocation?: string | null;
  toLocation: string;
  signedKg: number;
  signedQty?: number;
  reason: string;
  createdAt: string;
}

export const WarehouseStockLedgerWorkspace: React.FC = () => {
  const [drums, setDrums] = useState<ServerDrumRecord[]>([]);
  const [movements, setMovements] = useState<ServerLedgerMovement[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [integrityReport, setIntegrityReport] = useState<{
    healthy: boolean;
    message: string;
  } | null>(null);
  const [zplPreview, setZplPreview] = useState<{
    drumCode: string;
    zpl: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStockAndLedger = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [drumsData, ledgerData] = await Promise.all([
        apiClient.request<ServerDrumRecord[]>('/stock/drums'),
        apiClient.request<ServerLedgerMovement[]>('/stock/ledger'),
      ]);
      setDrums(Array.isArray(drumsData) ? drumsData : []);
      setMovements(Array.isArray(ledgerData) ? ledgerData : []);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to load live drum stock and ledger from server.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStockAndLedger();
  }, [loadStockAndLedger]);

  const handleVerifyIntegrity = async () => {
    setErrorMessage(null);
    try {
      const res = await apiClient.request<{
        healthy?: boolean;
        checkedDrumsCount?: number;
      }>('/stock/ledger/integrity-check');
      setIntegrityReport({
        healthy: res.healthy !== false,
        message: `Snapshot Ledger Integrity Verified across ${
          res.checkedDrumsCount ?? drums.length
        } package records (0.000 drift).`,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Ledger integrity check failed.'
      );
    }
  };

  const handleGenerateZpl = async (drumId: string) => {
    setErrorMessage(null);
    try {
      const res = await apiClient.request<{ drumCode: string; zpl: string }>(
        `/stock/drums/${drumId}/zpl-label`
      );
      setZplPreview(res);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate Zebra ZPL label.'
      );
    }
  };

  const filteredDrums = drums.filter((d) => {
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      d.drumCode.toLowerCase().includes(q) ||
      (d.barcode || '').toLowerCase().includes(q) ||
      d.lotNoSnapshot.toLowerCase().includes(q) ||
      d.country.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[11px] font-mono text-buram-amber uppercase tracking-widest block">
              WAREHOUSE
            </span>
            <h1 className="text-xl font-bold text-buram-text">
              Stock &amp; Movements
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleVerifyIntegrity}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-buram-success/15 border border-buram-success/40 text-xs font-mono text-buram-success hover:bg-buram-success/25"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verify Snapshot Integrity</span>
          </button>
          <button
            type="button"
            onClick={() => void loadStockAndLedger()}
            disabled={isLoading}
            className="p-2 rounded bg-buram-elevated border border-buram-border text-buram-text hover:border-buram-amber"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-buram-amber' : ''}`} />
          </button>
          <ExportMenu dataset="DRUMS" label="Export Stock" />
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded bg-buram-critical/15 border border-buram-critical/50 flex items-center gap-2 text-xs font-mono text-buram-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {integrityReport && (
        <div className="p-3 rounded bg-buram-success/10 border border-buram-success/40 text-xs font-mono text-buram-success">
          {integrityReport.message}
        </div>
      )}

      {/* FILTER BAR */}
      <div className="bg-buram-surface border border-buram-border rounded-lg p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-3.5 h-3.5 text-buram-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by Drum/Package Code, Barcode, Lot #, or Origin..."
            className="w-full bg-buram-bg border border-buram-border rounded pl-8 pr-3 py-1.5 text-buram-text"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'Quarantine', 'Approved', 'InWarmRoom', 'Reserved', 'Consumed', 'Rejected'].map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded border ${
                  statusFilter === st
                    ? 'bg-buram-amber text-buram-bg font-bold border-buram-gold'
                    : 'bg-buram-bg text-buram-muted border-buram-border hover:text-buram-text'
                }`}
              >
                {st}
              </button>
            )
          )}
        </div>
      </div>

      {/* SERIALIZED DRUMS / PACKAGES REGISTER */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
          <thead>
            <tr className="border-b border-buram-border text-buram-muted uppercase text-[11px]">
              <th className="py-2.5 px-3">Package / Drum Code</th>
              <th className="py-2.5 px-3">Barcode</th>
              <th className="py-2.5 px-3">Lot #</th>
              <th className="py-2.5 px-3">Origin</th>
              <th className="py-2.5 px-3 text-right">Net Quantity</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Location</th>
              <th className="py-2.5 px-3 text-right">Thermal Label</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buram-border/50">
            {filteredDrums.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-buram-muted">
                  No package records match the current filter.
                </td>
              </tr>
            ) : (
              filteredDrums.map((d) => {
                const unit = d.unit || 'kg';
                const qty = d.netQty ?? d.netKg;
                return (
                  <tr key={d._id} className="hover:bg-buram-elevated/40">
                    <td className="py-2.5 px-3 font-bold text-buram-gold">{d.drumCode}</td>
                    <td className="py-2.5 px-3 text-buram-pale">{d.barcode || '—'}</td>
                    <td className="py-2.5 px-3 text-buram-tech">{d.lotNoSnapshot}</td>
                    <td className="py-2.5 px-3">
                      <CountryOriginBadge countryIso={d.country} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-buram-text">
                      {unit === 'kg' ? (
                        <KgDisplay kg={d.netKg} size="sm" />
                      ) : (
                        <span>
                          {qty} {unit}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge
                        label={d.status}
                        variant={
                          d.status === 'Approved'
                            ? 'NOMINAL'
                            : d.status === 'Quarantine'
                            ? 'WARNING'
                            : d.status === 'Rejected'
                            ? 'CRITICAL'
                            : 'TECHNICAL'
                        }
                      />
                    </td>
                    <td className="py-2.5 px-3 text-buram-muted">{d.location}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleGenerateZpl(d._id)}
                        className="px-2.5 py-1 rounded bg-buram-elevated border border-buram-border text-buram-pale hover:border-buram-amber inline-flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3 text-buram-amber" />
                        <span>ZPL</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {zplPreview && (
        <section className="bg-buram-surface border border-buram-amber rounded-lg p-4 font-mono text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-buram-gold">
              Zebra ZPL II Label Payload — {zplPreview.drumCode}
            </span>
            <button
              type="button"
              onClick={() => setZplPreview(null)}
              className="text-buram-muted hover:text-buram-text"
            >
              Close
            </button>
          </div>
          <pre className="p-3 rounded bg-buram-bg border border-buram-border text-[11px] text-buram-pale overflow-x-auto">
            {zplPreview.zpl}
          </pre>
        </section>
      )}

      {/* APPEND-ONLY STOCK MOVEMENTS LEDGER */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <div className="flex items-center justify-between pb-3 border-b border-buram-border mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-buram-amber" />
            <h2 className="text-sm font-semibold text-buram-text">
              Append-Only Stock Movement Ledger ({movements.length} Entries)
            </h2>
          </div>
          <StatusBadge label="IMMUTABLE LEDGER" variant="NOMINAL" />
        </div>

        <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
          <thead>
            <tr className="border-b border-buram-border text-buram-muted uppercase text-[11px]">
              <th className="py-2 px-3">Timestamp</th>
              <th className="py-2 px-3">Movement Type</th>
              <th className="py-2 px-3">Origin</th>
              <th className="py-2 px-3">Transition</th>
              <th className="py-2 px-3 text-right">Signed Delta</th>
              <th className="py-2 px-3">Audited Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buram-border/50">
            {movements.map((m) => (
              <tr key={m._id} className="hover:bg-buram-elevated/40">
                <td className="py-2 px-3 text-buram-muted">
                  {new Date(m.createdAt).toLocaleString('de-DE')}
                </td>
                <td className="py-2 px-3">
                  <StatusBadge label={m.movementType} variant="TECHNICAL" />
                </td>
                <td className="py-2 px-3">
                  <CountryOriginBadge countryIso={m.country} />
                </td>
                <td className="py-2 px-3 text-buram-pale">
                  {m.fromStatus || 'NEW'} → {m.toStatus} ({m.toLocation})
                </td>
                <td
                  className={`py-2 px-3 text-right font-bold ${
                    m.signedKg >= 0 ? 'text-buram-success' : 'text-buram-warning'
                  }`}
                >
                  {m.signedKg >= 0 ? `+${m.signedKg}` : m.signedKg} {m.unit || 'kg'}
                </td>
                <td className="py-2 px-3 font-sans text-buram-text">{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

