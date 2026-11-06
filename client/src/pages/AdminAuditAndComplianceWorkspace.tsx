// client/src/pages/AdminAuditAndComplianceWorkspace.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  FileText,
  Database,
  FileSpreadsheet,
  FolderArchive,
  Eye,
  X,
  Copy,
  Check,
  ShieldAlert,
  Calendar,
  User as UserIcon,
  Activity,
  Layers,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { UserSession } from '../types/erp';
import { StatusBadge } from '../components/ui/IndustrialPrimitives';
import { apiClient } from '../lib/apiClient';

type AuditTab = 'AUDIT_TRAIL' | 'STOCK_LEDGER' | 'EXPORT_HISTORY' | 'DOCUMENTS';
type SeverityLevel = 'ALL' | 'INFO' | 'WARNING' | 'CRITICAL';
type DiffViewMode = 'VISUAL_DIFF' | 'RAW_JSON';

interface AuditRecord {
  _id: string;
  createdAt: string;
  actorId?: { _id?: string; fullName?: string; email?: string } | string;
  actorRole: string;
  module: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityRef?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
}

interface StockMovementRecord {
  _id: string;
  movementType: string;
  drumId?: { _id: string; drumCode: string; netKg: number } | string | null;
  stockPackageId?: { _id: string; packageCode: string; netKg: number } | string | null;
  incomingLotId?: { _id: string; lotNo: string } | string | null;
  materialId?: { _id: string; name: string } | string | null;
  country: string;
  fromStatus?: string | null;
  toStatus: string;
  fromLocation?: string | null;
  toLocation: string;
  signedKg: number;
  reason: string;
  performedBy?: { _id: string; fullName?: string; email?: string } | string;
  createdAt: string;
}

interface ExportLogRecord {
  _id: string;
  module: string;
  format: string;
  entityIds?: string[];
  filters?: Record<string, unknown>;
  fileName?: string;
  rowCount?: number;
  nextcloudPath?: string | null;
  createdBy?: { _id: string; fullName?: string; email?: string } | string;
  createdAt: string;
}

interface AttachmentRecord {
  _id: string;
  entityType: string;
  entityCode: string;
  docType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: 'ACTIVE' | 'VOID';
  storage: {
    provider: string;
    path: string;
  };
  notes?: string;
  createdAt: string;
}

interface KeyDiff {
  key: string;
  type: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';
  beforeVal: unknown;
  afterVal: unknown;
}

function deriveSeverity(action: string, module: string): 'INFO' | 'WARNING' | 'CRITICAL' {
  const upperAction = action.toUpperCase();
  const upperModule = module.toUpperCase();

  if (
    upperAction.includes('HOLD') ||
    upperAction.includes('QUARANTINE') ||
    upperAction.includes('VOID') ||
    upperAction.includes('DELETE') ||
    upperAction.includes('CRITICAL') ||
    upperAction.includes('DEVIATION_MISMATCH') ||
    upperAction.includes('REJECT')
  ) {
    return 'CRITICAL';
  }
  if (
    upperAction.includes('DEVIATION') ||
    upperAction.includes('WARN') ||
    upperAction.includes('UPDATE') ||
    upperAction.includes('OVERRIDE') ||
    upperAction.includes('FAIL')
  ) {
    return 'WARNING';
  }
  return 'INFO';
}

function computeKeyDiffs(before: unknown, after: unknown): KeyDiff[] {
  const b = (typeof before === 'object' && before !== null ? before : {}) as Record<string, unknown>;
  const a = (typeof after === 'object' && after !== null ? after : {}) as Record<string, unknown>;
  const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();

  return allKeys.map((key) => {
    const hasB = key in b;
    const hasA = key in a;
    const valB = b[key];
    const valA = a[key];

    if (!hasB && hasA) {
      return { key, type: 'ADDED', beforeVal: undefined, afterVal: valA };
    }
    if (hasB && !hasA) {
      return { key, type: 'REMOVED', beforeVal: valB, afterVal: undefined };
    }
    const isEq = JSON.stringify(valB) === JSON.stringify(valA);
    if (!isEq) {
      return { key, type: 'MODIFIED', beforeVal: valB, afterVal: valA };
    }
    return { key, type: 'UNCHANGED', beforeVal: valB, afterVal: valA };
  });
}

export const AdminAuditAndComplianceWorkspace: React.FC<{
  user: UserSession;
}> = ({ user }) => {
  // Navigation tabs (matches Image 1)
  const [activeTab, setActiveTab] = useState<AuditTab>('AUDIT_TRAIL');

  // Filter States (matches Image 1 & 2)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterActor, setFilterActor] = useState<string>('');
  const [filterModule, setFilterModule] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel>('ALL');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Pagination states
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Data states
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [exportLogs, setExportLogs] = useState<ExportLogRecord[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [nextcloudStatus, setNextcloudStatus] = useState<'CONNECTED' | 'OFFLINE' | 'CHECKING'>('CHECKING');

  // Loading & error
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Detail Diff Modal state
  const [selectedAuditRecord, setSelectedAuditRecord] = useState<AuditRecord | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('VISUAL_DIFF');
  const [showUnchangedDiffKeys, setShowUnchangedDiffKeys] = useState<boolean>(false);
  const [hasCopiedDiff, setHasCopiedDiff] = useState<boolean>(false);

  // Load Audit Logs
  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (filterActor.trim()) params.set('actor', filterActor.trim());
      if (filterModule.trim()) params.set('module', filterModule.trim());
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      params.set('limit', '500');

      const res = await apiClient.request<{ count: number; data: AuditRecord[] }>(
        `/audit?${params.toString()}`
      );
      if (res && Array.isArray(res.data)) {
        setAuditLogs(res.data);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filterActor, filterModule, filterStartDate, filterEndDate]);

  // Load Stock Movements
  const loadStockMovements = useCallback(async () => {
    try {
      const res = await apiClient.request<StockMovementRecord[]>('/stock/ledger?limit=250');
      if (Array.isArray(res)) {
        setMovements(res);
      }
    } catch {
      // Handled silently
    }
  }, []);

  // Load Export Logs
  const loadExportLogs = useCallback(async () => {
    try {
      const res = await apiClient.request<ExportLogRecord[]>('/exports/logs');
      if (Array.isArray(res)) {
        setExportLogs(res);
      }
    } catch {
      // Handled silently
    }
  }, []);

  // Load Attachments & Nextcloud Health
  const loadAttachmentsAndStorage = useCallback(async () => {
    try {
      const [attRes, healthRes] = await Promise.allSettled([
        apiClient.request<AttachmentRecord[]>('/attachments'),
        apiClient.request<{ ok: boolean; status?: string }>('/attachments/health'),
      ]);

      if (attRes.status === 'fulfilled' && Array.isArray(attRes.value)) {
        setAttachments(attRes.value);
      }
      if (healthRes.status === 'fulfilled' && healthRes.value?.ok) {
        setNextcloudStatus('CONNECTED');
      } else {
        setNextcloudStatus('OFFLINE');
      }
    } catch {
      setNextcloudStatus('OFFLINE');
    }
  }, []);

  // Initial load and tab change trigger
  useEffect(() => {
    void loadAuditLogs();
    void loadStockMovements();
    void loadExportLogs();
    void loadAttachmentsAndStorage();
  }, [loadAuditLogs, loadStockMovements, loadExportLogs, loadAttachmentsAndStorage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterActor, filterModule, filterSeverity, filterStartDate, filterEndDate]);

  // Filtered Audit Logs (Severity & in-memory filters)
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const sev = deriveSeverity(log.action, log.module);
      if (filterSeverity !== 'ALL' && sev !== filterSeverity) {
        return false;
      }
      return true;
    });
  }, [auditLogs, filterSeverity]);

  // Paginated slice for current page
  const paginatedAuditLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAuditLogs.slice(start, start + pageSize);
  }, [filteredAuditLogs, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAuditLogs.length / pageSize) || 1;

  // Filtered Stock Movements
  const filteredStockMovements = useMemo(() => {
    return movements.filter((m) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const reasonMatch = m.reason?.toLowerCase().includes(query);
        const typeMatch = m.movementType?.toLowerCase().includes(query);
        const locMatch = m.toLocation?.toLowerCase().includes(query);
        if (!reasonMatch && !typeMatch && !locMatch) return false;
      }
      return true;
    });
  }, [movements, searchQuery]);

  // Filtered Export Logs
  const filteredExportLogs = useMemo(() => {
    return exportLogs.filter((exp) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const modMatch = exp.module?.toLowerCase().includes(query);
        const fileMatch = exp.fileName?.toLowerCase().includes(query);
        const pathMatch = exp.nextcloudPath?.toLowerCase().includes(query);
        if (!modMatch && !fileMatch && !pathMatch) return false;
      }
      return true;
    });
  }, [exportLogs, searchQuery]);

  // Filtered Attachments
  const filteredAttachments = useMemo(() => {
    return attachments.filter((att) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const codeMatch = att.entityCode?.toLowerCase().includes(query);
        const nameMatch = att.originalName?.toLowerCase().includes(query);
        const docMatch = att.docType?.toLowerCase().includes(query);
        if (!codeMatch && !nameMatch && !docMatch) return false;
      }
      return true;
    });
  }, [attachments, searchQuery]);

  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterActor('');
    setFilterModule('');
    setFilterSeverity('ALL');
    setFilterStartDate('');
    setFilterEndDate('');
    setCurrentPage(1);
  };

  // Quick Date Presets
  const applyDatePreset = (preset: 'TODAY' | '24H' | '7D' | '30D' | 'ALL') => {
    const now = new Date();
    if (preset === 'ALL') {
      setFilterStartDate('');
      setFilterEndDate('');
    } else if (preset === 'TODAY') {
      const todayStr = now.toISOString().slice(0, 10);
      setFilterStartDate(todayStr);
      setFilterEndDate(todayStr);
    } else if (preset === '24H') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      setFilterStartDate(yesterday.toISOString().slice(0, 10));
      setFilterEndDate(now.toISOString().slice(0, 10));
    } else if (preset === '7D') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setFilterStartDate(sevenDaysAgo.toISOString().slice(0, 10));
      setFilterEndDate(now.toISOString().slice(0, 10));
    } else if (preset === '30D') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFilterStartDate(thirtyDaysAgo.toISOString().slice(0, 10));
      setFilterEndDate(now.toISOString().slice(0, 10));
    }
  };

  // Export Filtered Audit to CSV
  const handleExportFilteredAuditCsv = () => {
    if (filteredAuditLogs.length === 0) return;
    const headers = [
      'Timestamp (CET)',
      'Module / Event',
      'Action',
      'Entity Type',
      'Reference Code',
      'Severity',
      'Source IP',
      'Actor Name',
      'Actor Role',
      'Reason',
    ];
    const rows = filteredAuditLogs.map((log) => {
      const actorName =
        typeof log.actorId === 'object'
          ? log.actorId?.fullName || log.actorId?.email || 'System'
          : 'System';
      const sev = deriveSeverity(log.action, log.module);
      return [
        `"${new Date(log.createdAt).toLocaleString('de-DE')}"`,
        `"${log.module}"`,
        `"${log.action}"`,
        `"${log.entityType}"`,
        `"${log.entityRef ?? ''}"`,
        `"${sev}"`,
        `"${log.ipAddress ?? '127.0.0.1'}"`,
        `"${actorName}"`,
        `"${log.actorRole}"`,
        `"${(log.reason ?? '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `buramloop_compliance_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyDiff = (record: AuditRecord) => {
    const payload = JSON.stringify(
      {
        id: record._id,
        action: record.action,
        module: record.module,
        entityRef: record.entityRef,
        before: record.before,
        after: record.after,
      },
      null,
      2
    );
    navigator.clipboard.writeText(payload);
    setHasCopiedDiff(true);
    setTimeout(() => setHasCopiedDiff(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & BREADCRUMBS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-buram-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-buram-muted">
            <span>Dashboard</span>
            <span>&rsaquo;</span>
            <span className="text-buram-amber font-bold">Audit &amp; Compliance</span>
          </div>
          <h1 className="text-2xl font-bold text-buram-text mt-1">
            Compliance Audit Log
          </h1>
          <p className="text-xs text-buram-muted mt-0.5">
            Policy, access, inventory mutations, and security events recorded by the universal compliance audit ledger.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadAuditLogs()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-buram-elevated border border-buram-border text-xs font-mono text-buram-text hover:border-buram-amber transition-colors shadow-sm"
            title="Refresh current audit logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-buram-gold ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportFilteredAuditCsv}
            disabled={filteredAuditLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-buram-critical text-white text-xs font-mono font-bold uppercase hover:opacity-90 shadow-panel transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-buram-critical/15 border border-buram-critical/50 flex items-center gap-2 text-xs font-mono text-buram-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2. ADVANCED FILTERS PANEL (MATCHES IMAGES 1 & 2) */}
      <section className="bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
        <div className="flex items-center justify-between border-b border-buram-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-buram-amber/15 border border-buram-amber/30 flex items-center justify-center text-buram-amber">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-buram-text">
                FILTERS
              </span>
              <span className="text-[11px] text-buram-muted ml-2">
                Applied to the selected tab
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-xs font-mono text-buram-muted hover:text-buram-amber transition-colors"
          >
            Clear filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          {/* Universal Event/Action/Doc Search */}
          <div>
            <label className="block text-[10px] text-buram-muted uppercase tracking-wider mb-1">
              Search Action, Reference or Doc
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-buram-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Action, reference or document"
                className="w-full bg-buram-bg border border-buram-border rounded-lg pl-8 pr-3 py-2 text-xs text-buram-text focus:border-buram-amber"
              />
            </div>
          </div>

          {/* Actor Name Filter */}
          <div>
            <label className="block text-[10px] text-buram-muted uppercase tracking-wider mb-1">
              Actor
            </label>
            <div className="relative">
              <UserIcon className="w-3.5 h-3.5 text-buram-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterActor}
                onChange={(e) => setFilterActor(e.target.value)}
                placeholder="Name or email"
                className="w-full bg-buram-bg border border-buram-border rounded-lg pl-8 pr-3 py-2 text-xs text-buram-text focus:border-buram-amber"
              />
            </div>
          </div>

          {/* Module / Event Type Filter */}
          <div>
            <label className="block text-[10px] text-buram-muted uppercase tracking-wider mb-1">
              Module / Event Type
            </label>
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="w-full bg-buram-bg border border-buram-border rounded-lg px-3 py-2 text-xs text-buram-text focus:border-buram-amber"
            >
              <option value="">All modules</option>
              <option value="auth">AUTH (Authentication &amp; RBAC)</option>
              <option value="sourcing">SOURCING (Leads &amp; Contracts)</option>
              <option value="stock">STOCK (Lots, Drums &amp; Packages)</option>
              <option value="warm-room">WARM_ROOM (Warm Cabinets)</option>
              <option value="batch">BATCH (Planning &amp; Reservation)</option>
              <option value="process">PROCESS (7-Stage Execution)</option>
              <option value="shipment">SHIPMENT (Lots &amp; Release)</option>
              <option value="master">MASTER (Catalog &amp; Counters)</option>
              <option value="trace">TRACE (Inspection &amp; Hold)</option>
              <option value="attachment">STORAGE (Nextcloud WebDAV)</option>
              <option value="export">EXPORTS (Snapshots &amp; CSV)</option>
            </select>
          </div>

          {/* Severity Filter (Image 2) */}
          <div>
            <label className="block text-[10px] text-buram-muted uppercase tracking-wider mb-1">
              Severity
            </label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as SeverityLevel)}
              className="w-full bg-buram-bg border border-buram-border rounded-lg px-3 py-2 text-xs text-buram-text focus:border-buram-amber"
            >
              <option value="ALL">All severities</option>
              <option value="INFO">Info (Routine mutations)</option>
              <option value="WARNING">Warning (Deviations, updates)</option>
              <option value="CRITICAL">Critical (Quarantines, holds, voids)</option>
            </select>
          </div>

          {/* Date Range: From */}
          <div>
            <label className="block text-[10px] text-buram-muted uppercase tracking-wider mb-1">
              From Date
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-buram-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full bg-buram-bg border border-buram-border rounded-lg pl-8 pr-3 py-2 text-xs text-buram-text focus:border-buram-amber"
              />
            </div>
          </div>

          {/* Date Range: To */}
          <div>
            <label className="block text-[10px] text-buram-muted uppercase tracking-wider mb-1">
              To Date
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-buram-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full bg-buram-bg border border-buram-border rounded-lg pl-8 pr-3 py-2 text-xs text-buram-text focus:border-buram-amber"
              />
            </div>
          </div>

          {/* Quick Date Presets Strip */}
          <div className="sm:col-span-2 lg:col-span-2 flex flex-col justify-end">
            <span className="text-[10px] text-buram-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3 text-buram-amber" />
              <span>Quick Date Presets:</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'TODAY', label: 'Today' },
                { id: '24H', label: 'Last 24h' },
                { id: '7D', label: 'Last 7 Days' },
                { id: '30D', label: 'Last 30 Days' },
                { id: 'ALL', label: 'All Time' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDatePreset(p.id as any)}
                  className="px-2.5 py-1.5 rounded-lg bg-buram-bg border border-buram-border hover:border-buram-amber text-[10px] font-mono text-buram-text hover:text-buram-amber transition-colors shadow-sm"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. TABS SWITCHER (PILL STYLE MATCHING IMAGE 1) */}
      <div className="flex items-center gap-2 border-b border-buram-border pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('AUDIT_TRAIL')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'AUDIT_TRAIL'
              ? 'bg-buram-surface text-buram-gold border border-buram-amber shadow-sm ring-1 ring-buram-amber/30'
              : 'text-buram-muted hover:text-buram-text hover:bg-buram-elevated'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-buram-amber" />
          <span>Audit trail</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-buram-elevated border border-buram-border">
            {filteredAuditLogs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('STOCK_LEDGER')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'STOCK_LEDGER'
              ? 'bg-buram-surface text-buram-gold border border-buram-amber shadow-sm ring-1 ring-buram-amber/30'
              : 'text-buram-muted hover:text-buram-text hover:bg-buram-elevated'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-buram-amber" />
          <span>Stock ledger</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-buram-elevated border border-buram-border">
            {filteredStockMovements.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('EXPORT_HISTORY')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'EXPORT_HISTORY'
              ? 'bg-buram-surface text-buram-gold border border-buram-amber shadow-sm ring-1 ring-buram-amber/30'
              : 'text-buram-muted hover:text-buram-text hover:bg-buram-elevated'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-buram-amber" />
          <span>Export history</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-buram-elevated border border-buram-border">
            {filteredExportLogs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DOCUMENTS')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'DOCUMENTS'
              ? 'bg-buram-surface text-buram-gold border border-buram-amber shadow-sm ring-1 ring-buram-amber/30'
              : 'text-buram-muted hover:text-buram-text hover:bg-buram-elevated'
          }`}
        >
          <FolderArchive className="w-3.5 h-3.5 text-buram-amber" />
          <span>Documents</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-buram-elevated border border-buram-border">
            {filteredAttachments.length}
          </span>
        </button>
      </div>

      {/* 4. MAIN CONTENT CARDS ACCORDING TO ACTIVE TAB */}

      {/* TAB 1: AUDIT TRAIL TABLE (MATCHES IMAGE 1 & 2) */}
      {activeTab === 'AUDIT_TRAIL' && (
        <section className="bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-buram-amber/15 border border-buram-amber/40 flex items-center justify-center shrink-0 text-buram-gold">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-buram-text">
                  AUDIT TRAIL
                </h2>
                <p className="text-xs text-buram-muted mt-0.5">
                  Every production stage, approval, hold, release, reservation and movement — each with its stated reason.
                </p>
              </div>
            </div>

            {/* Density & Count Selector */}
            <div className="flex items-center gap-3 text-xs font-mono text-buram-muted">
              <span>Showing {paginatedAuditLogs.length} of {filteredAuditLogs.length} events</span>
              <div className="flex items-center gap-1.5 pl-2 border-l border-buram-border">
                <span className="text-[10px] uppercase text-buram-muted">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-buram-bg border border-buram-border rounded px-2 py-0.5 text-xs text-buram-text"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase">
                  <th className="py-2.5 px-3">When</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">Reference</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Source IP</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-buram-border/40">
                {paginatedAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-buram-muted">
                      No audit events matching current filters.
                    </td>
                  </tr>
                ) : (
                  paginatedAuditLogs.map((log) => {
                    const actorName =
                      typeof log.actorId === 'object'
                        ? log.actorId?.fullName || log.actorId?.email || 'System'
                        : 'System';
                    const sev = deriveSeverity(log.action, log.module);
                    return (
                      <tr
                        key={log._id}
                        className="hover:bg-buram-elevated/40 transition-colors"
                      >
                        <td className="py-3 px-3 whitespace-nowrap text-buram-pale">
                          {new Date(log.createdAt).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}{' '}
                          ·{' '}
                          {new Date(log.createdAt).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => setFilterModule(log.module)}
                            title={`Filter by module ${log.module}`}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-buram-elevated border border-buram-border uppercase text-buram-amber hover:border-buram-amber transition-colors"
                          >
                            {log.module}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-buram-text font-sans font-medium">
                          {log.action}
                        </td>
                        <td className="py-3 px-3 text-buram-muted uppercase">
                          {log.entityType}
                        </td>
                        <td className="py-3 px-3">
                          {log.entityRef ? (
                            <button
                              type="button"
                              onClick={() => setSearchQuery(log.entityRef!)}
                              title={`Search reference ${log.entityRef}`}
                              className="px-2 py-0.5 rounded bg-buram-bg border border-buram-border font-bold text-buram-gold hover:border-buram-amber transition-colors"
                            >
                              {log.entityRef}
                            </button>
                          ) : (
                            <span className="text-buram-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => setFilterSeverity(sev)}
                            title={`Filter by severity ${sev}`}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-transform hover:scale-105 ${
                              sev === 'CRITICAL'
                                ? 'bg-buram-critical/20 text-buram-critical border border-buram-critical/40'
                                : sev === 'WARNING'
                                ? 'bg-buram-warning/20 text-buram-warning border border-buram-warning/40'
                                : 'bg-buram-tech/20 text-buram-tech border border-buram-tech/40'
                            }`}
                          >
                            {sev}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-buram-muted whitespace-nowrap">
                          {log.ipAddress || '127.0.0.1'}
                        </td>
                        <td className="py-3 px-3 text-buram-text font-sans">
                          <button
                            type="button"
                            onClick={() => setFilterActor(actorName)}
                            title={`Filter by actor ${actorName}`}
                            className="hover:text-buram-amber transition-colors text-left"
                          >
                            {actorName}
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-buram-amber/15 text-buram-gold border border-buram-amber/30 uppercase font-bold">
                            {log.actorRole}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-buram-muted font-sans max-w-xs truncate" title={log.reason || ''}>
                          {log.reason || '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAuditRecord(log);
                              setDiffViewMode('VISUAL_DIFF');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-buram-elevated border border-buram-border text-buram-gold hover:border-buram-amber transition-colors text-[11px]"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-buram-border/60 pt-3 text-xs font-mono">
              <span className="text-buram-muted">
                Page <span className="font-bold text-buram-text">{currentPage}</span> of{' '}
                <span className="font-bold text-buram-text">{totalPages}</span> ({filteredAuditLogs.length} total events)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-buram-elevated border border-buram-border text-buram-text hover:border-buram-amber disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-buram-elevated border border-buram-border text-buram-text hover:border-buram-amber disabled:opacity-40 transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: STOCK LEDGER TABLE */}
      {activeTab === 'STOCK_LEDGER' && (
        <section className="bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-buram-amber/15 border border-buram-amber/40 flex items-center justify-center shrink-0 text-buram-gold">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-buram-text">
                  STOCK LEDGER
                </h2>
                <p className="text-xs text-buram-muted mt-0.5">
                  Append-only immutable stock movements ledger (GoBD / EU 178/2002).
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-buram-muted">
              {filteredStockMovements.length} movements recorded
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase">
                  <th className="py-2.5 px-3">When</th>
                  <th className="py-2.5 px-3">Movement Type</th>
                  <th className="py-2.5 px-3">Package / Drum</th>
                  <th className="py-2.5 px-3">Net Kg (Δ)</th>
                  <th className="py-2.5 px-3">Flow</th>
                  <th className="py-2.5 px-3">Performed By</th>
                  <th className="py-2.5 px-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-buram-border/40">
                {filteredStockMovements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-buram-muted">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredStockMovements.map((mov) => {
                    const drumCode =
                      typeof mov.drumId === 'object'
                        ? mov.drumId?.drumCode
                        : typeof mov.stockPackageId === 'object'
                        ? mov.stockPackageId?.packageCode
                        : '—';
                    const actorName =
                      typeof mov.performedBy === 'object'
                        ? mov.performedBy?.fullName || mov.performedBy?.email || 'Operator'
                        : 'Operator';
                    return (
                      <tr key={mov._id} className="hover:bg-buram-elevated/40">
                        <td className="py-3 px-3 text-buram-pale whitespace-nowrap">
                          {new Date(mov.createdAt).toLocaleString('de-DE')}
                        </td>
                        <td className="py-3 px-3">
                          <StatusBadge label={mov.movementType} variant="TECHNICAL" />
                        </td>
                        <td className="py-3 px-3 font-bold text-buram-gold">
                          {drumCode || '—'}
                        </td>
                        <td className="py-3 px-3 font-bold">
                          <span
                            className={
                              mov.signedKg > 0
                                ? 'text-buram-success'
                                : mov.signedKg < 0
                                ? 'text-buram-critical'
                                : 'text-buram-muted'
                            }
                          >
                            {mov.signedKg > 0 ? `+${mov.signedKg.toFixed(1)}` : mov.signedKg.toFixed(1)} kg
                          </span>
                        </td>
                        <td className="py-3 px-3 text-buram-pale">
                          {mov.fromLocation || 'WE'} &rarr; {mov.toLocation} ({mov.toStatus})
                        </td>
                        <td className="py-3 px-3 text-buram-text font-sans">
                          {actorName}
                        </td>
                        <td className="py-3 px-3 text-buram-muted font-sans max-w-sm truncate" title={mov.reason}>
                          {mov.reason}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: EXPORT HISTORY TABLE */}
      {activeTab === 'EXPORT_HISTORY' && (
        <section className="bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-buram-amber/15 border border-buram-amber/40 flex items-center justify-center shrink-0 text-buram-gold">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-buram-text">
                  EXPORT HISTORY
                </h2>
                <p className="text-xs text-buram-muted mt-0.5">
                  Audit trail of dataset dumps, snapshots and regulatory export runs.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-buram-muted">
              {filteredExportLogs.length} exports archived
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase">
                  <th className="py-2.5 px-3">When</th>
                  <th className="py-2.5 px-3">Dataset</th>
                  <th className="py-2.5 px-3">Format</th>
                  <th className="py-2.5 px-3">Rows</th>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Nextcloud Archive</th>
                  <th className="py-2.5 px-3">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-buram-border/40">
                {filteredExportLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-buram-muted">
                      No data exports executed yet.
                    </td>
                  </tr>
                ) : (
                  filteredExportLogs.map((exp) => {
                    const creatorName =
                      typeof exp.createdBy === 'object'
                        ? exp.createdBy?.fullName || exp.createdBy?.email || 'User'
                        : 'User';
                    return (
                      <tr key={exp._id} className="hover:bg-buram-elevated/40">
                        <td className="py-3 px-3 text-buram-pale whitespace-nowrap">
                          {new Date(exp.createdAt).toLocaleString('de-DE')}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-buram-amber/15 text-buram-gold border border-buram-amber/30 uppercase">
                            {exp.module}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-buram-elevated border border-buram-border text-buram-text">
                            {exp.format}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold text-buram-text">
                          {exp.rowCount ?? exp.entityIds?.length ?? 0}
                        </td>
                        <td className="py-3 px-3 text-buram-gold font-sans font-medium">
                          {exp.fileName || 'export.csv'}
                        </td>
                        <td className="py-3 px-3 text-buram-muted truncate max-w-xs font-sans" title={exp.nextcloudPath || ''}>
                          {exp.nextcloudPath || '—'}
                        </td>
                        <td className="py-3 px-3 text-buram-text font-sans">
                          {creatorName}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 4: DOCUMENTS & NEXTCLOUD STORAGE ARCHIVE */}
      {activeTab === 'DOCUMENTS' && (
        <section className="bg-buram-surface border border-buram-border rounded-xl p-5 shadow-panel space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-buram-amber/15 border border-buram-amber/40 flex items-center justify-center shrink-0 text-buram-gold">
                <FolderArchive className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-buram-text">
                  DOCUMENTS ARCHIVE
                </h2>
                <p className="text-xs text-buram-muted mt-0.5">
                  Nextcloud WebDAV storage attachments, inspection certificates and OCR label records.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 ${
                  nextcloudStatus === 'CONNECTED'
                    ? 'bg-buram-success/20 text-buram-success border border-buram-success/40'
                    : 'bg-buram-critical/20 text-buram-critical border border-buram-critical/40'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                <span>STORAGE: {nextcloudStatus}</span>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-buram-border text-[11px] text-buram-muted uppercase">
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3">Doc Type</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">SHA-256 Hash</th>
                  <th className="py-2.5 px-3">Storage Path</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-buram-border/40">
                {filteredAttachments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-buram-muted">
                      No attachments archived yet.
                    </td>
                  </tr>
                ) : (
                  filteredAttachments.map((att) => (
                    <tr key={att._id} className="hover:bg-buram-elevated/40">
                      <td className="py-3 px-3 text-buram-pale whitespace-nowrap">
                        {new Date(att.createdAt).toLocaleString('de-DE')}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-buram-amber/15 text-buram-gold border border-buram-amber/30 uppercase">
                          {att.docType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-buram-text">
                        {att.entityCode}
                      </td>
                      <td className="py-3 px-3 font-sans text-buram-text font-medium">
                        {att.originalName}
                      </td>
                      <td className="py-3 px-3 text-buram-muted">
                        {(att.sizeBytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="py-3 px-3 text-buram-muted text-[10px]">
                        {att.sha256 ? `${att.sha256.slice(0, 10)}...${att.sha256.slice(-6)}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-buram-muted truncate max-w-xs font-sans" title={att.storage?.path}>
                        {att.storage?.path || 'Nextcloud/BuramLoop'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <StatusBadge
                          label={att.status}
                          variant={att.status === 'ACTIVE' ? 'NOMINAL' : 'CRITICAL'}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 5. BEFORE / AFTER JSON DIFF INSPECTION MODAL */}
      {selectedAuditRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedAuditRecord(null)}
        >
          <div
            className="bg-buram-surface border border-buram-amber/50 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-buram-border pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-buram-amber" />
                <div>
                  <h3 className="text-base font-bold text-buram-text font-mono">
                    Audit Inspection — {selectedAuditRecord.action}
                  </h3>
                  <div className="text-xs text-buram-muted font-mono mt-0.5">
                    ID: {selectedAuditRecord._id} · {new Date(selectedAuditRecord.createdAt).toLocaleString('de-DE')} CET
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyDiff(selectedAuditRecord)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-buram-elevated border border-buram-border text-xs font-mono text-buram-gold hover:border-buram-amber transition-colors"
                >
                  {hasCopiedDiff ? <Check className="w-3.5 h-3.5 text-buram-success" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{hasCopiedDiff ? 'Copied' : 'Copy JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAuditRecord(null)}
                  className="p-1.5 rounded-lg text-buram-muted hover:text-buram-text hover:bg-buram-elevated transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Metadata Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-buram-bg/80 border border-buram-border text-xs font-mono">
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">ACTOR</span>
                <span className="font-bold text-buram-text">
                  {typeof selectedAuditRecord.actorId === 'object'
                    ? selectedAuditRecord.actorId?.fullName || selectedAuditRecord.actorId?.email || 'System'
                    : 'System'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">ROLE</span>
                <span className="font-bold text-buram-gold">{selectedAuditRecord.actorRole}</span>
              </div>
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">MODULE</span>
                <span className="font-bold text-buram-tech">{selectedAuditRecord.module}</span>
              </div>
              <div>
                <span className="text-[10px] text-buram-muted uppercase block">SOURCE IP</span>
                <span className="text-buram-pale">{selectedAuditRecord.ipAddress || '127.0.0.1'}</span>
              </div>
            </div>

            {selectedAuditRecord.reason && (
              <div className="p-3 rounded-lg bg-buram-amber/10 border border-buram-amber/30 text-xs font-mono">
                <span className="text-buram-gold font-bold uppercase block mb-1">Stated Reason:</span>
                <p className="text-buram-text font-sans">{selectedAuditRecord.reason}</p>
              </div>
            )}

            {/* View Mode Switcher: Visual Key Diff vs Raw JSON */}
            <div className="flex items-center justify-between border-b border-buram-border pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDiffViewMode('VISUAL_DIFF')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold transition-all ${
                    diffViewMode === 'VISUAL_DIFF'
                      ? 'bg-buram-amber text-buram-bg shadow-sm'
                      : 'text-buram-muted hover:text-buram-text bg-buram-elevated'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Visual Key Diff</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiffViewMode('RAW_JSON')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold transition-all ${
                    diffViewMode === 'RAW_JSON'
                      ? 'bg-buram-amber text-buram-bg shadow-sm'
                      : 'text-buram-muted hover:text-buram-text bg-buram-elevated'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>Raw JSON</span>
                </button>
              </div>

              {diffViewMode === 'VISUAL_DIFF' && (
                <label className="flex items-center gap-1.5 text-[11px] font-mono text-buram-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showUnchangedDiffKeys}
                    onChange={(e) => setShowUnchangedDiffKeys(e.target.checked)}
                    className="rounded bg-buram-bg border-buram-border text-buram-amber focus:ring-0"
                  />
                  <span>Show unchanged keys</span>
                </label>
              )}
            </div>

            {/* Diff Content Rendering */}
            {diffViewMode === 'VISUAL_DIFF' ? (
              <div className="flex-1 overflow-y-auto space-y-2 max-h-80 pr-1">
                {(() => {
                  const diffs = computeKeyDiffs(selectedAuditRecord.before, selectedAuditRecord.after);
                  const filteredDiffs = showUnchangedDiffKeys
                    ? diffs
                    : diffs.filter((d) => d.type !== 'UNCHANGED');

                  if (filteredDiffs.length === 0) {
                    return (
                      <div className="p-6 text-center text-xs font-mono text-buram-muted bg-buram-bg/50 rounded-lg border border-buram-border">
                        No structural state differences detected between before and after snapshots.
                      </div>
                    );
                  }

                  return filteredDiffs.map((diff) => (
                    <div
                      key={diff.key}
                      className={`p-2.5 rounded-lg border text-xs font-mono flex flex-col gap-1 ${
                        diff.type === 'ADDED'
                          ? 'bg-buram-success/10 border-buram-success/30 text-buram-success'
                          : diff.type === 'REMOVED'
                          ? 'bg-buram-critical/10 border-buram-critical/30 text-buram-critical'
                          : diff.type === 'MODIFIED'
                          ? 'bg-buram-warning/10 border-buram-warning/30 text-buram-warning'
                          : 'bg-buram-bg/40 border-buram-border/60 text-buram-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              diff.type === 'ADDED'
                                ? 'bg-buram-success'
                                : diff.type === 'REMOVED'
                                ? 'bg-buram-critical'
                                : diff.type === 'MODIFIED'
                                ? 'bg-buram-warning'
                                : 'bg-buram-muted'
                            }`}
                          />
                          <span>{diff.key}</span>
                        </span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/30">
                          {diff.type}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-1">
                        <div>
                          <span className="text-[10px] text-buram-muted block uppercase">Previous:</span>
                          <span className="break-all font-mono">
                            {diff.beforeVal !== undefined ? JSON.stringify(diff.beforeVal) : '<empty>'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-buram-muted block uppercase">Committed:</span>
                          <span className="break-all font-mono font-bold">
                            {diff.afterVal !== undefined ? JSON.stringify(diff.afterVal) : '<empty>'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              /* Side-by-Side Before vs After JSON Diffs */
              <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <span className="text-xs font-mono font-bold text-buram-muted uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-buram-critical" />
                    State Before:
                  </span>
                  <pre className="p-3 rounded-lg bg-buram-bg border border-buram-border text-[11px] font-mono text-buram-pale overflow-x-auto max-h-72">
                    {selectedAuditRecord.before
                      ? JSON.stringify(selectedAuditRecord.before, null, 2)
                      : '// No prior state recorded'}
                  </pre>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-mono font-bold text-buram-success uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-buram-success" />
                    State After (Committed):
                  </span>
                  <pre className="p-3 rounded-lg bg-buram-bg border border-buram-border text-[11px] font-mono text-buram-gold overflow-x-auto max-h-72">
                    {selectedAuditRecord.after
                      ? JSON.stringify(selectedAuditRecord.after, null, 2)
                      : '// No mutation payload'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
