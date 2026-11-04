// client/src/components/ui/CrossCuttingPanels.tsx
import React, { useEffect, useState } from 'react';
import {
  Paperclip,
  UploadCloud,
  Download,
  FileSpreadsheet,
  Printer,
  HardDrive,
  ShieldCheck,
  Ban,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { StatusBadge, ReasonDialog } from './IndustrialPrimitives';

export interface AttachmentRecord {
  _id: string;
  entityType: string;
  entityId?: string;
  entityCode: string;
  docType: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
  adminOnly?: boolean;
  storage: {
    provider: 'nextcloud' | 'local';
    path: string;
  };
  createdAt: string;
  status: 'ACTIVE' | 'VOID';
}

const DATASET_NORMALIZATION_MAP: Record<string, string> = {
  INCOMING_LOTS: 'INCOMING_LOTS',
  DRUMS: 'DRUM_STOCK',
  DRUM_STOCK: 'DRUM_STOCK',
  BATCHES: 'BATCHES_PROCESS',
  BATCHES_PROCESS: 'BATCHES_PROCESS',
  SHIPMENT_LOTS: 'SHIPMENT_LOTS',
  AUDIT_LOGS: 'AUDIT_LOGS',
};

export const ExportMenu: React.FC<{
  dataset:
    | 'INCOMING_LOTS'
    | 'DRUMS'
    | 'DRUM_STOCK'
    | 'BATCHES'
    | 'BATCHES_PROCESS'
    | 'SHIPMENT_LOTS'
    | 'AUDIT_LOGS';
  label?: string;
}> = ({ dataset, label = 'Snapshot Export' }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (
    format: 'CSV' | 'XLSX' | 'PDF' | 'DOCX' | 'PRINT',
    saveToNextcloud: boolean
  ) => {
    setIsExporting(true);
    setBanner(null);
    setExportError(null);
    const normalizedDataset = DATASET_NORMALIZATION_MAP[dataset] || dataset;
    const normalizedFormat = format === 'PRINT' ? 'PRINT_JSON' : format;
    try {
      if (format === 'PRINT') {
        window.print();
      }
      const res = await apiClient.auditedMutation<
        {
          rowCount: number;
          nextcloudPath: string | null;
          csvContent?: string;
          csvPayload?: string;
        },
        Record<string, unknown>
      >('/exports/run', 'POST', {
        body: {
          dataset: normalizedDataset,
          format: normalizedFormat,
          saveToNextcloud,
        },
        reason: `Snapshot export (${normalizedFormat}) requested for ${normalizedDataset}`,
      });

      const csvText = res.csvContent ?? res.csvPayload;
      if (csvText && format === 'CSV') {
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${normalizedDataset}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }

      setBanner(
        `Exported ${res.rowCount} rows (${format}) via MongoDB snapshot isolation${
          res.nextcloudPath ? ` → Archived to Nextcloud: ${res.nextcloudPath}` : ''
        }`
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : `Snapshot export (${format}) failed.`
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="inline-flex flex-wrap items-center gap-1.5 bg-buram-surface border border-buram-border rounded p-1 font-mono text-xs">
        <span className="px-2 text-[11px] text-buram-muted uppercase flex items-center gap-1">
          <FileSpreadsheet className="w-3.5 h-3.5 text-buram-amber" />
          {label}:
        </span>
        {(['CSV', 'XLSX', 'PDF', 'DOCX'] as const).map((fmt) => (
          <button
            key={fmt}
            type="button"
            disabled={isExporting}
            onClick={() => void handleExport(fmt, true)}
            className="px-2.5 py-1 rounded bg-buram-elevated text-buram-pale hover:bg-buram-amber hover:text-buram-ink font-semibold transition-colors disabled:opacity-50"
            title={`Export ${dataset} as ${fmt} and archive to Nextcloud /Exports`}
          >
            {fmt}
          </button>
        ))}
        <button
          type="button"
          disabled={isExporting}
          onClick={() => void handleExport('PRINT', false)}
          className="px-2.5 py-1 rounded bg-buram-bg text-buram-muted hover:text-buram-text border border-buram-border inline-flex items-center gap-1"
        >
          <Printer className="w-3 h-3" />
          <span>PRINT</span>
        </button>
      </div>
      {banner && (
        <span className="text-[11px] font-mono text-buram-success">{banner}</span>
      )}
      {exportError && (
        <span className="text-[11px] font-mono text-buram-critical">{exportError}</span>
      )}
    </div>
  );
};

export const AttachmentsPanel: React.FC<{
  entityType: string;
  entityId?: string;
  entityCode: string;
  defaultDocType?: string;
  initialAttachments?: AttachmentRecord[];
}> = ({
  entityType,
  entityId,
  entityCode,
  defaultDocType = 'QSI_CERTIFICATE',
  initialAttachments = [],
}) => {
  const [attachments, setAttachments] = useState<AttachmentRecord[]>(initialAttachments);
  const [docType, setDocType] = useState(defaultDocType);
  const [voidTarget, setVoidTarget] = useState<AttachmentRecord | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ entityType, entityCode, includeVoid: 'true' });
    if (entityId) params.set('entityId', entityId);

    void apiClient
      .request<AttachmentRecord[]>(`/attachments?${params.toString()}`)
      .then((rows) => {
        if (active && Array.isArray(rows)) {
          setAttachments(rows);
        }
      })
      .catch(() => {
        // Keep initialAttachments if server list fails
      });

    return () => {
      active = false;
    };
  }, [entityType, entityId, entityCode]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      if (entityId) formData.append('entityId', entityId);
      formData.append('entityCode', entityCode);
      formData.append('docType', docType);

      const created = await apiClient.request<AttachmentRecord>('/attachments/upload', {
        method: 'POST',
        body: formData,
      });
      setAttachments((prev) => [created, ...prev]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to upload attachment to vault.'
      );
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleConfirmVoid = async (reason: string) => {
    if (!voidTarget) return;
    setErrorMsg(null);
    try {
      await apiClient.auditedMutation(`/attachments/${voidTarget._id}/void`, 'POST', {
        body: { reason },
        reason,
      });
      setAttachments((prev) =>
        prev.map((a) => (a._id === voidTarget._id ? { ...a, status: 'VOID' } : a))
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to void attachment.'
      );
    } finally {
      setVoidTarget(null);
    }
  };

  return (
    <div className="bg-buram-surface border border-buram-border rounded-lg p-4 shadow-panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-buram-amber" />
          <h3 className="text-sm font-semibold text-buram-text">
            Nextcloud Document &amp; Certificate Vault (R12 / R16) —{' '}
            <span className="font-mono text-buram-gold">{entityCode}</span>
          </h3>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            aria-label="Document Type"
            className="bg-buram-bg border border-buram-border rounded px-2.5 py-1 text-buram-text"
          >
            <option value="QSI_CERTIFICATE">QSI_CERTIFICATE</option>
            <option value="EXTERNAL_ANALYSIS_REPORT">EXTERNAL_ANALYSIS_REPORT</option>
            <option value="CONTRACT_PDF">CONTRACT_PDF</option>
            <option value="DELIVERY_NOTE">DELIVERY_NOTE</option>
            <option value="BATCH_PROCESS_SHEET">BATCH_PROCESS_SHEET</option>
            <option value="CUSTOMS_EUR1">CUSTOMS_EUR1</option>
            <option value="OTHER">OTHER</option>
          </select>

          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded bg-buram-amber text-buram-ink font-bold uppercase hover:bg-buram-gold">
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Uploading...' : 'Two-Phase Upload'}</span>
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mt-3 p-2.5 rounded bg-buram-critical/15 border border-buram-critical/50 flex items-center gap-2 text-xs font-mono text-buram-critical"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="py-4 text-xs font-mono text-buram-muted">
          No active attachments linked to {entityCode}. Uploaded files are hashed (SHA-256) and stored in Nextcloud WebDAV under{' '}
          <code className="text-buram-pale">
            BuramLoop/{entityType}/{entityCode}/
          </code>
          .
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {attachments.map((att) => (
            <div
              key={att._id}
              className="p-2.5 rounded bg-buram-bg/80 border border-buram-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-buram-text">{att.originalName}</span>
                  <StatusBadge
                    label={att.docType}
                    variant={att.status === 'VOID' ? 'MUTED' : 'TECHNICAL'}
                  />
                  {att.status === 'VOID' && (
                    <StatusBadge label="VOIDED" variant="CRITICAL" />
                  )}
                </div>
                <div className="text-[11px] text-buram-muted flex flex-wrap items-center gap-3 tabular-nums">
                  <span className="inline-flex items-center gap-1 text-buram-pale">
                    <HardDrive className="w-3 h-3 text-buram-amber" />
                    {att.storage.path}
                  </span>
                  <span>{(att.sizeBytes / 1024).toFixed(1)} KB</span>
                  <span className="inline-flex items-center gap-1 text-buram-success">
                    <ShieldCheck className="w-3 h-3" />
                    SHA-256: {att.sha256.slice(0, 12)}…
                  </span>
                </div>
              </div>

              {att.status === 'ACTIVE' && (
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/attachments/${att._id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded bg-buram-elevated border border-buram-border text-buram-tech hover:border-buram-tech inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Stream</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setVoidTarget(att)}
                    className="px-2.5 py-1 rounded bg-buram-critical/15 border border-buram-critical/40 text-buram-critical hover:bg-buram-critical/25 inline-flex items-center gap-1"
                  >
                    <Ban className="w-3 h-3" />
                    <span>Void</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ReasonDialog
        isOpen={Boolean(voidTarget)}
        title={`Soft-Void Attachment ${voidTarget?.originalName}`}
        actionSummary={`Marks attachment ${voidTarget?.originalName} as VOID in MongoDB while preserving the binary in Nextcloud for audit inspection.`}
        onCancel={() => setVoidTarget(null)}
        onConfirm={handleConfirmVoid}
      />
    </div>
  );
};
