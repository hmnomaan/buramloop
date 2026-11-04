// client/src/components/ui/FlowAndInfoPrimitives.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Info,
  X,
  ChevronRight,
  Camera,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { canAccessModule, ModuleKey } from '../../lib/moduleAccess';
import { UserSession } from '../../types/erp';
import { extractLabelFields, ExtractedLabelFields, ScannedLabelData } from '../../lib/labelOcr';
import { StatusBadge } from './IndustrialPrimitives';

/**
 * 1. CONCISE CONTEXTUAL INFO BUTTON (ⓘ)
 * Keeps interfaces smooth and uncluttered while revealing rules/formulas on click.
 */
export const InfoPopoverButton: React.FC<{
  title: string;
  ruleCode: string;
  summary: string;
  bullets?: string[];
  formula?: string;
}> = ({ title, ruleCode, summary, bullets = [], formula }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-buram-elevated border border-buram-border text-[11px] font-mono text-buram-tech hover:border-buram-amber hover:text-buram-gold transition-colors"
        aria-expanded={open}
        title={`Info: ${title} (${ruleCode})`}
      >
        <Info className="w-3.5 h-3.5" />
        <span>{ruleCode}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 z-40 bg-buram-surface border border-buram-amber/60 rounded-lg p-4 shadow-panel text-left font-sans"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-buram-border">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-buram-amber block">
                OPERATIONAL SPECIFICATION • {ruleCode}
              </span>
              <h4 className="text-xs font-bold text-buram-text mt-0.5">{title}</h4>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-buram-muted hover:text-buram-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-buram-muted mt-2 leading-relaxed">{summary}</p>

          {formula && (
            <div className="mt-2 p-2 rounded bg-buram-bg border border-buram-border font-mono text-[11px] text-buram-pale">
              {formula}
            </div>
          )}

          {bullets.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-buram-text list-disc list-inside">
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 2. INTERACTIVE TASK-FLOW & PROCESS BREADCRUMB
 * Shows where the user is in the end-to-end BuramLoop lifecycle and enforces role visibility.
 */
interface WorkflowStepNode {
  module: ModuleKey;
  stepNum: number;
  label: string;
  taskSubLabel: string;
  allowedRoles: Array<UserSession['role']>;
}

const WORKFLOW_CHAIN: WorkflowStepNode[] = [
  {
    module: 'DASHBOARD',
    stepNum: 1,
    label: 'My Role Hub',
    taskSubLabel: 'KPIs & Assigned Queue',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'PLANT_OPERATOR', 'WAREHOUSE', 'INSPECTOR'],
  },
  {
    module: 'SOURCING',
    stepNum: 2,
    label: 'Sourcing Gates',
    taskSubLabel: 'Offer → Mgmt → QSI → Contract',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD'],
  },
  {
    module: 'INCOMING_QA',
    stepNum: 3,
    label: 'Warehouse Lot Intake',
    taskSubLabel: 'Any Material/Container + Barcode',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'WAREHOUSE'],
  },
  {
    module: 'WAREHOUSE_STOCK',
    stepNum: 4,
    label: 'Stock Ledger',
    taskSubLabel: 'Append-Only Balance',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'WAREHOUSE', 'PLANT_OPERATOR', 'INSPECTOR'],
  },
  {
    module: 'WARM_CABINETS',
    stepNum: 5,
    label: '2×17 Warm Room',
    taskSubLabel: '34 Slots • 24–48h Dwell',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'WAREHOUSE', 'PLANT_OPERATOR'],
  },
  {
    module: 'BATCH_PLANNING',
    stepNum: 6,
    label: 'Batch Feasibility',
    taskSubLabel: '6t→9.5t & Atomic Lock',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'PLANT_OPERATOR'],
  },
  {
    module: 'PROCESSING',
    stepNum: 7,
    label: '7-Stage Process',
    taskSubLabel: 'Filter → Blend → Fill → Rework',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'PLANT_OPERATOR'],
  },
  {
    module: 'SHIPMENTS',
    stepNum: 8,
    label: 'Shipment LOTs',
    taskSubLabel: '1–3 Country Gate & Release',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'PLANT_OPERATOR'],
  },
  {
    module: 'TRACEABILITY',
    stepNum: 9,
    label: 'Govt Trace',
    taskSubLabel: 'Forward / Backward Recall',
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'INSPECTOR'],
  },
  {
    module: 'MASTER_DATA',
    stepNum: 10,
    label: 'Master Data',
    taskSubLabel: 'Admin-controlled setup',
    allowedRoles: ['ADMIN'],
  },
];

export const ProcessFlowBreadcrumb: React.FC<{
  user: UserSession;
  activeModule: ModuleKey;
  onSelectModule: (m: ModuleKey) => void;
}> = ({ user, activeModule, onSelectModule }) => {
  const currentIdx = WORKFLOW_CHAIN.findIndex((w) => w.module === activeModule);

  return (
    <nav
      aria-label="End-to-End Task Flow Breadcrumb"
      className="bg-buram-surface border-b border-buram-border px-6 py-2.5 overflow-x-auto"
    >
      <ol className="flex items-center gap-1.5 min-w-max font-mono text-xs">
        {WORKFLOW_CHAIN.map((node, idx) => {
          const isAllowed =
            node.allowedRoles.includes(user.role) && canAccessModule(user, node.module);
          const isActive = node.module === activeModule;
          const isCompletedStage = currentIdx > idx;

          return (
            <React.Fragment key={node.module}>
              <li>
                <button
                  type="button"
                  disabled={!isAllowed}
                  onClick={() => {
                    if (isAllowed) onSelectModule(node.module);
                  }}
                  className={`group flex items-center gap-2 px-2.5 py-1.5 rounded border transition-all text-left ${
                    isActive
                      ? 'bg-buram-amber/20 border-buram-amber text-buram-gold shadow-amberGlow'
                      : !isAllowed
                      ? 'bg-buram-bg/40 border-buram-border/40 text-buram-muted/40 cursor-not-allowed'
                      : isCompletedStage
                      ? 'bg-buram-success/10 border-buram-success/30 text-buram-text hover:border-buram-amber/50'
                      : 'bg-buram-bg/80 border-buram-border text-buram-muted hover:text-buram-text hover:border-buram-amber/40'
                  }`}
                  title={
                    isAllowed
                      ? `${node.label}: ${node.taskSubLabel}`
                      : `Restricted for role ${user.role}`
                  }
                >
                  <span
                    className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      isActive
                        ? 'bg-buram-amber text-buram-ink'
                        : isCompletedStage
                        ? 'bg-buram-success/20 text-buram-success'
                        : 'bg-buram-elevated text-buram-muted'
                    }`}
                  >
                    {!isAllowed ? <Lock className="w-2.5 h-2.5" /> : node.stepNum}
                  </span>
                  <div>
                    <div className="font-bold leading-none">{node.label}</div>
                    <div className="text-[9px] text-buram-muted leading-none mt-0.5">
                      {node.taskSubLabel}
                    </div>
                  </div>
                </button>
              </li>
              {idx < WORKFLOW_CHAIN.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-buram-border shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

/**
 * 3. MOBILE CAMERA & WAREHOUSE BARCODE CAPTURE MODAL (R3 / R15)
 * Activates rear smartphone/tablet camera for Warehouse Lot Intake.
 */
export const MobileCameraBarcodeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onBarcodeCaptured: (code: string) => void;
  onLabelExtracted: (data: ScannedLabelData) => void;
}> = ({ isOpen, onClose, onBarcodeCaptured, onLabelExtracted }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [detectedBarcode, setDetectedBarcode] = useState('');
  const [capturedImage, setCapturedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [extractedFields, setExtractedFields] = useState<ExtractedLabelFields | null>(null);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrError, setOcrError] = useState('');

  const readLabelImage = async (file: File, barcode = detectedBarcode || manualCode) => {
    setCapturedImage(file);
    setImagePreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setOcrError('');
    setOcrStatus('Reading label text locally in this browser…');

    try {
      const { default: tesseract } = await import('tesseract.js');
      const result = await tesseract.recognize(file, 'eng+deu');
      const fields = extractLabelFields(result.data.text, barcode);
      setExtractedFields(fields);
      setOcrStatus(fields.rawText.trim() ? 'Review the extracted values below before applying.' : '');
      if (!fields.rawText.trim()) {
        setOcrError('No readable label text was found. Retake the image or enter the fields manually.');
      }
    } catch (error) {
      setOcrStatus('');
      setOcrError(error instanceof Error ? error.message : 'Label text extraction failed.');
    }
  };

  const captureLabelFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setOcrError('Camera image is not ready yet. Wait for the preview or choose a label photo.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setOcrError('Could not capture a camera frame. Choose a label photo instead.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setOcrError('Could not create the label image. Please try again.');
        return;
      }
      const file = new File([blob], `incoming-label-${Date.now()}.jpg`, { type: 'image/jpeg' });
      void readLabelImage(file);
    }, 'image/jpeg', 0.92);
  };

  const updateExtractedField = (key: keyof Omit<ExtractedLabelFields, 'rawText'>, value: string) => {
    setExtractedFields((current) => current ? { ...current, [key]: value } : current);
  };

  useEffect(() => {
    if (!isOpen) return;
    setCameraActive(false);
    setCameraError(null);
    setDetectedBarcode('');
    setCapturedImage(null);
    setExtractedFields(null);
    setOcrStatus('');
    setOcrError('');
    let disposed = false;
    let captured = false;
    let stopScanning: (() => void) | undefined;

    const startRearCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('Camera access requires HTTPS or localhost. Use the manual field or a handheld scanner.');
          return;
        }
        const video = videoRef.current;
        if (!video) {
          setCameraError('Camera preview is unavailable. Use the manual field or a handheld scanner.');
          return;
        }

        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (disposed) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          {
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          },
          video,
          (result) => {
            if (!result || captured || disposed) return;
            captured = true;
            setDetectedBarcode(result.getText().trim().toUpperCase());
          }
        );

        if (disposed) {
          controls.stop();
          return;
        }

        stopScanning = () => controls.stop();
        setCameraActive(true);
      } catch (error) {
        if (disposed) return;
        const errorName = error instanceof Error ? error.name : '';
        const message =
          errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError'
            ? 'Camera permission was denied. Allow camera access or use the manual field / handheld scanner.'
            : errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError'
            ? 'No camera was found. Use the manual field or a handheld scanner.'
            : 'Could not start camera barcode scanning. Use the manual field or a handheld scanner.';
        setCameraError(message);
      }
    };

    void startRearCamera();

    return () => {
      disposed = true;
      stopScanning?.();
      setImagePreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return '';
      });
      setCameraActive(false);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-buram-surface border border-buram-amber rounded-xl max-w-md w-full p-5 shadow-panel space-y-4">
        <div className="flex items-center justify-between border-b border-buram-border pb-3">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-buram-amber" />
            <div>
              <h3 className="text-sm font-bold text-buram-text font-mono">SCAN BARCODE & READ LABEL</h3>
              <span className="text-[10px] font-mono text-buram-muted block">
                Camera barcode decode + local OCR • operator verifies all extracted data
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-buram-muted hover:text-buram-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Mobile Camera Viewport */}
        <div className="relative rounded-lg overflow-hidden bg-buram-bg border border-buram-border h-52 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {/* Target Reticle */}
          <div className="absolute inset-8 border-2 border-dashed border-buram-amber/70 rounded pointer-events-none flex items-center justify-center">
            <div className="w-full h-0.5 bg-buram-critical/70 animate-pulse" />
          </div>
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2 py-1 rounded bg-black/70 text-[10px] font-mono">
            <span className="text-buram-gold">
              {cameraActive ? 'LIVE REAR CAMERA ACTIVE' : cameraError || 'INITIALIZING CAMERA...'}
            </span>
            <StatusBadge
              label={cameraActive ? 'SCANNING' : cameraError ? 'MANUAL READY' : 'STARTING'}
              variant={cameraActive ? 'NOMINAL' : cameraError ? 'AMBER' : 'AMBER'}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!cameraActive}
            onClick={captureLabelFrame}
            className="rounded bg-buram-tech/15 border border-buram-tech/40 px-3 py-2 text-xs font-mono text-buram-tech disabled:opacity-50"
          >
            Capture label & extract text
          </button>
          <label className="cursor-pointer rounded border border-buram-border px-3 py-2 text-xs font-mono text-buram-pale">
            Use / take label photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readLabelImage(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>

        {detectedBarcode && (
          <div className="rounded border border-buram-success/40 bg-buram-success/10 p-2 text-xs font-mono text-buram-success">
            Barcode decoded: {detectedBarcode}
          </div>
        )}
        {ocrStatus && <p className="text-xs text-buram-tech">{ocrStatus}</p>}
        {ocrError && <p role="alert" className="text-xs text-buram-critical">{ocrError}</p>}

        {extractedFields && (
          <div className="max-h-64 space-y-3 overflow-y-auto rounded border border-buram-amber/40 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['supplierLotReference', 'Supplier lot / reference'],
                  ['supplierName', 'Supplier'],
                  ['exporter', 'Exporter'],
                  ['originCountry', 'Country / ISO code'],
                  ['materialName', 'Product / material'],
                  ['labelDate', 'Label date'],
                  ['packageCount', 'Package count'],
                  ['packageType', 'Package type'],
                  ['quantity', 'Quantity'],
                  ['unit', 'Unit'],
                  ['barcode', 'Barcode'],
                  ['drumNumber', 'Drum number'],
                  ['tareKg', 'Tare (kg)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-1 text-[10px] font-mono text-buram-muted">
                  <span>{label}</span>
                  <input
                    value={extractedFields[key]}
                    onChange={(event) => updateExtractedField(key, event.target.value)}
                    className="w-full rounded border border-buram-border bg-buram-bg px-2 py-1.5 text-xs text-buram-text"
                  />
                </label>
              ))}
            </div>
            <details>
              <summary className="cursor-pointer text-[10px] font-mono text-buram-muted">Review full OCR text</summary>
              <textarea
                readOnly
                value={extractedFields.rawText}
                className="mt-2 h-24 w-full rounded border border-buram-border bg-buram-bg p-2 text-xs text-buram-text"
              />
            </details>
            {imagePreviewUrl && (
              <img src={imagePreviewUrl} alt="Captured supplier label for review" className="max-h-40 rounded object-contain" />
            )}
          </div>
        )}

        {/* Manual entry also supports USB/Bluetooth scanners that emulate a keyboard. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualCode.trim()) return;
            setDetectedBarcode(manualCode.trim().toUpperCase());
          }}
          className="space-y-3 font-mono text-xs"
        >
          <input
            type="text"
            autoFocus
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Scan or type supplier lot barcode..."
            className="w-full bg-buram-bg border border-buram-amber/60 rounded px-3 py-2 text-buram-gold"
          />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-buram-border text-buram-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-buram-amber text-buram-ink font-bold uppercase"
            >
              Review barcode
            </button>
            {detectedBarcode && (
              <button
                type="button"
                onClick={() => {
                  onBarcodeCaptured(detectedBarcode);
                  onClose();
                }}
                className="px-4 py-1.5 rounded border border-buram-tech text-buram-tech font-bold uppercase"
              >
                Apply barcode only
              </button>
            )}
            {extractedFields && capturedImage && (
              <button
                type="button"
                onClick={() => {
                  const fields = {
                    ...extractedFields,
                    barcode: detectedBarcode || manualCode.trim().toUpperCase() || extractedFields.barcode,
                  };
                  onLabelExtracted({ fields, image: capturedImage });
                  onClose();
                }}
                className="px-4 py-1.5 rounded bg-buram-success text-white font-bold uppercase"
              >
                Apply reviewed label data
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};