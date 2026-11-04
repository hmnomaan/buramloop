// client/src/components/ui/BarcodeScannerModal.tsx
import React, { useState } from 'react';
import { QrCode, X, ArrowRight } from 'lucide-react';
import { StatusBadge } from './IndustrialPrimitives';

export const BarcodeScannerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onScanResolved: (barcode: string) => void;
}> = ({ isOpen, onClose, onScanResolved }) => {
    const [barcodeInput, setBarcodeInput] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned = barcodeInput.trim().toUpperCase();
        if (!cleaned) return;
        onScanResolved(cleaned);
        setBarcodeInput('');
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scanner-modal-title"
        >
            <div className="bg-buram-surface border border-buram-amber rounded-lg max-w-md w-full p-6 shadow-panel">
                <div className="flex items-center justify-between pb-3 border-b border-buram-border">
                    <div className="flex items-center gap-2">
                        <QrCode className="w-5 h-5 text-buram-amber" />
                        <h2 id="scanner-modal-title" className="text-base font-bold text-buram-text">
                            Industrial Barcode / Zebra Wedge Lookup (R15)
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-buram-muted hover:text-buram-text"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-buram-muted">
                            Scan Drum, Rework, or Lot Barcode
                        </span>
                        <StatusBadge label="USB / BLUETOOTH HID READY" variant="NOMINAL" />
                    </div>

                    <input
                        type="text"
                        autoFocus
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        placeholder="e.g., DR-2026-401, RW-26-0012, SHP-26-0001"
                        className="w-full bg-buram-bg border border-buram-amber/60 rounded px-3.5 py-2.5 font-mono text-sm text-buram-gold placeholder-buram-muted/50"
                    />
                    {/* Sample Barcodes  */}
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                        {['DR-2026-401', 'RW-26-0012', 'B-2026-089', 'SHP-26-0001'].map((sample) => (
                            <button
                                key={sample}
                                type="button"
                                onClick={() => setBarcodeInput(sample)}
                                className="px-2 py-1 rounded bg-buram-elevated border border-buram-border text-buram-pale hover:border-buram-amber"
                            >
                                {sample}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3.5 py-2 rounded border border-buram-border font-mono text-xs text-buram-muted"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-buram-amber text-buram-ink font-mono text-xs font-bold uppercase hover:bg-buram-gold"
                        >
                            <span>Resolve & Trace Barcode</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};