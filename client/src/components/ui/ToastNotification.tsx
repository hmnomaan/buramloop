// client/src/components/ui/ToastNotification.tsx
import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { NotificationItem } from '../../types/erp';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  durationMs?: number;
}

export const ToastNotificationPopup: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
  onOpenNotification?: (notificationId: string) => void;
}> = ({ toasts, onDismiss, onOpenNotification }) => {
  if (toasts.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      aria-label="Notification alerts"
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    >
      {toasts.map((toast) => (
        <SingleToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onOpen={onOpenNotification}
        />
      ))}
    </aside>
  );
};

const SingleToastItem: React.FC<{
  toast: ToastMessage;
  onDismiss: (id: string) => void;
  onOpen?: (id: string) => void;
}> = ({ toast, onDismiss, onOpen }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const duration = toast.durationMs ?? 2000; // 2-second default per user request

  useEffect(() => {
    // Start fade-out 300ms before duration expires
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, Math.max(100, duration - 300));

    // Full dismiss after duration
    const dismissTimer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast.id, duration, onDismiss]);

  const severity = toast.severity ?? 'INFO';

  const styles = {
    CRITICAL: 'bg-buram-critical/95 text-white border-buram-critical shadow-lg shadow-buram-critical/20',
    WARNING: 'bg-buram-amber/95 text-buram-ink border-buram-gold shadow-lg shadow-buram-amber/20',
    INFO: 'bg-buram-elevated/95 text-buram-text border-buram-border shadow-lg shadow-black/40',
  }[severity];

  const Icon = {
    CRITICAL: AlertCircle,
    WARNING: AlertTriangle,
    INFO: Info,
  }[severity];

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border backdrop-blur-md transition-all duration-300 transform ${
        isFadingOut ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'
      } ${styles}`}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onOpen?.(toast.id)}
      >
        <div className="font-semibold text-xs truncate leading-tight">{toast.title}</div>
        <p className="text-[11px] mt-0.5 line-clamp-2 opacity-90 leading-snug">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        aria-label="Close notification"
        className="shrink-0 p-1 rounded hover:bg-black/10 transition-colors opacity-70 hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

