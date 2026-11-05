// client/src/components/ui/DetailModal.tsx
import React, { useEffect } from 'react';
import { X, Layers } from 'lucide-react';
import { StatusBadge } from './IndustrialPrimitives';

export interface ModalField {
  label: string;
  value: React.ReactNode;
  isMono?: boolean;
}

export interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badgeLabel?: string;
  badgeVariant?: 'NOMINAL' | 'WARNING' | 'CRITICAL' | 'TECHNICAL' | 'AMBER' | 'MUTED';
  fields?: ModalField[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badgeLabel,
  badgeVariant = 'NOMINAL',
  fields = [],
  actions,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-buram-surface border border-buram-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-buram-border bg-buram-elevated/40">
          <div className="min-w-0 pr-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-buram-amber font-bold">
                {subtitle || 'Record Details'}
              </span>
              {badgeLabel && <StatusBadge label={badgeLabel} variant={badgeVariant} />}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-buram-text mt-1 truncate">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-buram-border bg-buram-bg text-buram-muted hover:text-buram-text hover:border-buram-amber transition-colors shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-buram-bg/70 border border-buram-border">
              {fields.map((f, idx) => (
                <div key={idx} className="space-y-0.5 min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wide text-buram-muted">
                    {f.label}
                  </div>
                  <div
                    className={`text-xs font-semibold text-buram-text truncate ${
                      f.isMono ? 'font-mono' : ''
                    }`}
                  >
                    {f.value ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {children}
        </div>

        {/* Footer Actions */}
        {actions && (
          <div className="flex items-center justify-end gap-2 p-3 sm:p-4 border-t border-buram-border bg-buram-elevated/30">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

