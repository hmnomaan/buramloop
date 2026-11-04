// client/src/components/ui/IndustrialPrimitives.tsx
import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  Clock,
  Lock,
  Thermometer,
  Scale,
  ShieldAlert,
  Radio,
} from 'lucide-react';

// 1. STATUS BADGE (Never relies on colour alone; uses icon + monospace token)
export type BadgeVariant =
  | 'NOMINAL'
  | 'WARNING'
  | 'CRITICAL'
  | 'TECHNICAL'
  | 'AMBER'
  | 'MUTED';

export const StatusBadge: React.FC<{
  label: string;
  variant: BadgeVariant;
  pulse?: boolean;
}> = ({ label, variant, pulse = false }) => {
  const styles: Record<BadgeVariant, string> = {
    NOMINAL: 'bg-buram-success/15 text-buram-success border-buram-success/40',
    WARNING: 'bg-buram-warning/15 text-buram-warning border-buram-warning/40',
    CRITICAL: 'bg-buram-critical/15 text-buram-critical border-buram-critical/40',
    TECHNICAL: 'bg-buram-tech/15 text-buram-tech border-buram-tech/40',
    AMBER: 'bg-buram-amber/15 text-buram-gold border-buram-amber/40',
    MUTED: 'bg-buram-elevated text-buram-muted border-buram-border',
  };

  const Icon = {
    NOMINAL: CheckCircle2,
    WARNING: AlertTriangle,
    CRITICAL: XOctagon,
    TECHNICAL: Radio,
    AMBER: Clock,
    MUTED: Lock,
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono uppercase tracking-wider border ${styles[variant]}`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${pulse ? 'animate-pulse' : ''}`} />
      <span>{label}</span>
    </span>
  );
};

// 2. TABULAR KG DISPLAY (Standard 1 Drum = 290 kg conversion support)
export const KgDisplay: React.FC<{
  kg: number | null | undefined;
  showDrumEquivalent?: boolean;
  size?: 'sm' | 'md' | 'lg';
}> = ({ kg, showDrumEquivalent = false, size = 'md' }) => {
  if (kg === null || kg === undefined || Number.isNaN(kg)) {
    return <span className="font-mono text-buram-muted tabular-nums">— kg</span>;
  }

  const formattedKg = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(kg);

  const drums = (kg / 290).toFixed(1);

  const sizeClass = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-xl font-semibold',
  }[size];

  return (
    <span className={`inline-flex items-baseline gap-1.5 font-mono tabular-nums ${sizeClass}`}>
      <span className="text-buram-text">{formattedKg}</span>
      <span className="text-xs text-buram-muted uppercase">kg</span>
      {showDrumEquivalent && (
        <span className="text-xs text-buram-gold/90 ml-1">
          ({drums} drums @ 290kg)
        </span>
      )}
    </span>
  );
};

// 3. TEMPERATURE DISPLAY (Warm cabinets & filtration thermal telemetry)
export const TemperatureDisplay: React.FC<{
  celsius?: number | null;
  minSafe?: number;
  maxSafe?: number;
}> = ({ celsius, minSafe = 38, maxSafe = 45 }) => {
  if (celsius === undefined || celsius === null) {
    return <span className="font-mono text-xs text-buram-muted tabular-nums">— °C</span>;
  }

  const isOutOfBounds = celsius < minSafe || celsius > maxSafe;

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-xs tabular-nums px-1.5 py-0.5 rounded border ${
        isOutOfBounds
          ? 'bg-buram-critical/15 text-buram-critical border-buram-critical/40'
          : 'bg-buram-elevated text-buram-tech border-buram-border'
      }`}
      title={`Target thermal window: ${minSafe}°C – ${maxSafe}°C`}
    >
      <Thermometer className="w-3 h-3" />
      <span>{celsius.toFixed(1)} °C</span>
    </span>
  );
};

// 4. COUNTRY ORIGIN BADGE (Traceability & customer 1-3 allowed country enforcement)
export const CountryOriginBadge: React.FC<{
  countryIso: string;
  percentage?: number;
  restricted?: boolean;
}> = ({ countryIso, percentage, restricted = false }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border tabular-nums ${
      restricted
        ? 'bg-buram-critical/20 text-buram-critical border-buram-critical/50'
        : 'bg-buram-surface text-buram-pale border-buram-amber/30'
    }`}
  >
    <span className="font-bold">{countryIso.toUpperCase()}</span>
    {percentage !== undefined && (
      <span className="text-buram-muted">{percentage.toFixed(0)}%</span>
    )}
  </span>
);

// 5. MISSION-CONTROL KPI TILE
export const KpiCard: React.FC<{
  title: string;
  code: string;
  primaryValue: React.ReactNode;
  subtitle: string;
  statusVariant?: BadgeVariant;
  statusLabel?: string;
  pendingEndpointStep?: string;
  footerMetric?: React.ReactNode;
}> = ({
  title,
  code,
  primaryValue,
  subtitle,
  statusVariant = 'NOMINAL',
  statusLabel,
  pendingEndpointStep,
  footerMetric,
}) => (
  <div className="bg-buram-surface border border-buram-border rounded-lg p-4 shadow-panel flex flex-col justify-between relative overflow-hidden">
    <div className="flex items-start justify-between gap-2 mb-3">
      <div>
        <span className="text-[11px] font-mono uppercase tracking-widest text-buram-muted block">
          {code}
        </span>
        <h3 className="text-sm font-medium text-buram-text mt-0.5">{title}</h3>
      </div>
      {pendingEndpointStep ? (
        <StatusBadge label={`API ${pendingEndpointStep} PENDING`} variant="MUTED" />
      ) : (
        statusLabel && <StatusBadge label={statusLabel} variant={statusVariant} />
      )}
    </div>

    <div className="my-1">
      {pendingEndpointStep ? (
        <div className="py-2 px-3 rounded bg-buram-bg/70 border border-dashed border-buram-border text-xs font-mono text-buram-muted">
          Awaiting backend route mount ({pendingEndpointStep}). Zero fabricated values displayed.
        </div>
      ) : (
        <div className="text-2xl font-mono font-bold text-buram-text tabular-nums">
          {primaryValue}
        </div>
      )}
    </div>

    <div className="mt-3 pt-2.5 border-t border-buram-border/60 flex items-center justify-between text-xs text-buram-muted">
      <span>{subtitle}</span>
      {footerMetric && <span className="font-mono tabular-nums text-buram-gold">{footerMetric}</span>}
    </div>
  </div>
);

// 6. MASS BALANCE INDICATOR (Explicit R7 rule: inKg = outKg + lossKg + reworkOutKg)
export const MassBalanceIndicator: React.FC<{
  inputKg: number;
  outputKg: number;
  lossKg: number;
  reworkOutKg: number;
  toleranceKg?: number;
}> = ({ inputKg, outputKg, lossKg, reworkOutKg, toleranceKg = 0.05 }) => {
  const accountedKg = outputKg + lossKg + reworkOutKg;
  const deltaKg = inputKg - accountedKg;
  const isBalanced = Math.abs(deltaKg) <= toleranceKg && inputKg > 0;

  return (
    <div
      className={`p-3.5 rounded-lg border font-mono text-xs ${
        isBalanced
          ? 'bg-buram-success/10 border-buram-success/40 text-buram-text'
          : 'bg-buram-critical/10 border-buram-critical/50 text-buram-text'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-buram-amber" />
          <span className="uppercase tracking-wider font-semibold">
            Mass-Balance Contract Verification (R7)
          </span>
        </div>
        {isBalanced ? (
          <StatusBadge label="BALANCED • READY FOR SERVER COMMIT" variant="NOMINAL" />
        ) : (
          <StatusBadge label="IMBALANCE DETECTED • SUBMISSION BLOCKED" variant="CRITICAL" />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-buram-bg/80 p-2.5 rounded border border-buram-border tabular-nums">
        <div>
          <span className="text-[10px] text-buram-muted block">INPUT (IN)</span>
          <span className="text-sm font-bold text-buram-tech">{inputKg.toFixed(1)} kg</span>
        </div>
        <div>
          <span className="text-[10px] text-buram-muted block">OUTPUT (OUT)</span>
          <span className="text-sm font-bold text-buram-success">{outputKg.toFixed(1)} kg</span>
        </div>
        <div>
          <span className="text-[10px] text-buram-muted block">PROCESS LOSS</span>
          <span className="text-sm font-bold text-buram-warning">{lossKg.toFixed(1)} kg</span>
        </div>
        <div>
          <span className="text-[10px] text-buram-muted block">REWORK DRUM OUT</span>
          <span className="text-sm font-bold text-buram-gold">{reworkOutKg.toFixed(1)} kg</span>
        </div>
        <div>
          <span className="text-[10px] text-buram-muted block">VARIANCE (Δ)</span>
          <span
            className={`text-sm font-bold ${
              isBalanced ? 'text-buram-success' : 'text-buram-critical'
            }`}
          >
            {deltaKg > 0 ? `+${deltaKg.toFixed(2)}` : deltaKg.toFixed(2)} kg
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-buram-muted">
        Formula enforced: <code className="text-buram-pale">inputKg = outputKg + lossKg + reworkOutKg</code>. Authoritative validation and rework drum serialization occur on the server transaction.
      </p>
    </div>
  );
};

// 7. MANDATORY REASON DIALOG (Enforces R2, R3, R5, R6, R14 audit trail)
export const ReasonDialog: React.FC<{
  isOpen: boolean;
  title: string;
  actionSummary: string;
  confirmLabel?: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}> = ({
  isOpen,
  title,
  actionSummary,
  confirmLabel = 'Commit Audited Operation',
  isSubmitting = false,
  onCancel,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = reason.trim();
    if (cleaned.length < 5) {
      setError('Audit requirement: Please enter a specific operational reason (min 5 characters).');
      return;
    }
    setError(null);
    onConfirm(cleaned);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-dialog-title"
    >
      <div className="bg-buram-surface border border-buram-amber/50 rounded-lg max-w-lg w-full p-6 shadow-panel">
        <div className="flex items-center gap-2.5 text-buram-amber mb-2">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <h2 id="audit-dialog-title" className="text-base font-semibold text-buram-text">
            {title}
          </h2>
        </div>

        <p className="text-xs text-buram-muted mb-4 leading-relaxed">
          {actionSummary}
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="audit-reason-input"
            className="block text-xs font-mono uppercase text-buram-muted mb-1.5"
          >
            Mandatory Operational / Audit Reason *
          </label>
          <textarea
            id="audit-reason-input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Checked out Drum DR-2026-0412 from CAB-A-04 after 44h warming at 41.5°C for Batch B-2026-089 filtration..."
            className="w-full rounded bg-buram-bg border border-buram-border p-2.5 text-sm text-buram-text placeholder-buram-muted/50 focus:border-buram-amber"
            required
          />
          {error && <p className="text-xs text-buram-critical mt-1.5 font-mono">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded text-xs font-mono uppercase tracking-wider border border-buram-border text-buram-muted hover:text-buram-text hover:bg-buram-elevated"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded text-xs font-mono uppercase tracking-wider font-semibold bg-buram-amber text-buram-ink hover:bg-buram-gold disabled:opacity-50"
            >
              {isSubmitting ? 'Committing to Ledger...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 6. FEEDBACK MODAL (Tailwind centered modal for Success / Error / Warning confirmations)
export type FeedbackVariant = 'SUCCESS' | 'ERROR' | 'WARNING';

export interface FeedbackModalState {
  isOpen: boolean;
  variant: FeedbackVariant;
  title: string;
  message: string;
  detailBadge?: string;
  actionLabel?: string;
}

export const FeedbackModal: React.FC<{
  state: FeedbackModalState | null;
  onClose: () => void;
}> = ({ state, onClose }) => {
  if (!state || !state.isOpen) return null;

  const isSuccess = state.variant === 'SUCCESS';
  const isError = state.variant === 'ERROR';

  const iconBadgeClass = isSuccess
    ? 'bg-green-100 text-green-600 border border-green-500/30'
    : isError
      ? 'bg-red-100 text-red-600 border border-red-500/30'
      : 'bg-amber-100 text-amber-600 border border-amber-500/30';

  const buttonClass = isSuccess
    ? 'bg-green-600 hover:bg-green-700 text-white'
    : isError
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-amber-600 hover:bg-amber-700 text-white';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="bg-white dark:bg-buram-surface border border-buram-border p-6 rounded-lg shadow-xl max-w-sm w-full text-center animate-in fade-in zoom-in-95 duration-150">
        <div
          className={`mx-auto mb-4 w-12 h-12 flex items-center justify-center rounded-full ${iconBadgeClass}`}
        >
          {isSuccess ? (
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : isError ? (
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="w-6 h-6 text-amber-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008zm9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h-14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
              />
            </svg>
          )}
        </div>

        <h2 id="feedback-modal-title" className="text-xl font-semibold text-gray-800 dark:text-buram-text">
          {state.title}
        </h2>

        {state.detailBadge && (
          <div className="mt-2 inline-block px-2.5 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 text-gray-800 dark:bg-buram-elevated dark:text-buram-gold border border-gray-200 dark:border-buram-border">
            {state.detailBadge}
          </div>
        )}

        <p className="text-sm text-gray-600 dark:text-buram-muted mt-2 leading-relaxed">
          {state.message}
        </p>

        <button
          type="button"
          onClick={onClose}
          className={`mt-5 w-full px-4 py-2 rounded font-semibold text-sm transition-colors shadow-sm ${buttonClass}`}
        >
          {state.actionLabel ?? 'Close'}
        </button>
      </div>
    </div>
  );
};
