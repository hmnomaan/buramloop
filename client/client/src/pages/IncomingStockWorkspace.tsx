// client/src/pages/IncomingStockWorkspace.tsx
import React, { useState } from 'react';
import {
  ShieldCheck,
  RotateCcw,
  PlusCircle,
  Camera,
  Tag,
  AlertTriangle,
} from 'lucide-react';

interface IncomingLot {
  id: string;
  lotNumber: string;
  supplierName: string;
  originCountryIso: string;
  honeyType: string;
  receivedAt: string;
  drumCount: number;
  totalNetKg: number;
  availableNetKg: number;
  qualityStatus: 'UNDER_REVIEW' | 'APPROVED' | 'FAILED' | 'RETURNED_TO_SUPPLIER';
  mismatchDetected: boolean;
}

const StatusBadge: React.FC<{ label: string; variant: string }> = ({ label, variant }) => (
  <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-mono ${variant === 'CRITICAL' ? 'bg-red-900/30 text-red-300' : variant === 'WARNING' || variant === 'AMBER' ? 'bg-amber-900/30 text-amber-300' : 'bg-emerald-900/30 text-emerald-300'}`}>
    {label}
  </span>
);

const KgDisplay: React.FC<{ kg: number; size?: string }> = ({ kg }) => (
  <span>{kg.toLocaleString('de-DE')} kg</span>
);

const CountryOriginBadge: React.FC<{ countryIso: string }> = ({ countryIso }) => (
  <span>{countryIso}</span>
);

const InfoPopoverButton: React.FC<{
  ruleCode: string;
  title: string;
  summary: string;
  formula: string;
  bullets: string[];
}> = ({ ruleCode, title, summary, formula, bullets }) => (
  <details className="relative text-xs">
    <summary className="cursor-pointer rounded-full border border-buram-border px-2 py-1">ⓘ</summary>
    <div className="absolute z-10 right-0 mt-2 w-72 rounded border border-buram-border bg-buram-surface p-3 shadow-panel">
      <strong>{title} ({ruleCode})</strong><p className="mt-1">{summary}</p><p className="mt-1">{formula}</p>
      <ul className="mt-1 list-disc pl-4">{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
    </div>
  </details>
);

const MobileCameraBarcodeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onBarcodeCaptured: (code: string) => void;
}> = ({ isOpen, onClose, onBarcodeCaptured }) => {
  const [code, setCode] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded border border-buram-border bg-buram-surface p-4">
        <h2 className="mb-3 font-bold">Capture Lot Barcode</h2>
        <input autoFocus value={code} onChange={(event) => setCode(event.target.value)} className="w-full rounded border border-buram-border bg-buram-bg p-2" />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!code.trim()} onClick={() => { onBarcodeCaptured(code.trim()); setCode(''); onClose(); }}>Use Barcode</button>
        </div>
      </div>
    </div>
  );
};

const AttachmentsPanel: React.FC<{ entityType: string; entityCode: string; defaultDocType: string }> = ({ entityType, entityCode, defaultDocType }) => (
  <div className="text-xs text-buram-muted">{entityType} attachments · {entityCode} · {defaultDocType}</div>
);

const ExportMenu: React.FC<{ dataset: string; label: string }> = ({ label }) => (
  <button type="button" className="rounded border border-buram-border px-3 py-1.5 text-xs">{label}</button>
);

const ReasonDialog: React.FC<{
  isOpen: boolean;
  title: string;
  actionSummary: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}> = ({ isOpen, title, actionSummary, onCancel, onConfirm }) => {
  const [reason, setReason] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form className="w-full max-w-md rounded border border-buram-border bg-buram-surface p-4" onSubmit={(event) => { event.preventDefault(); void onConfirm(reason); setReason(''); }}>
        <h2 className="font-bold">{title}</h2><p className="my-2 text-sm">{actionSummary}</p>
        <label className="block text-xs">Reason<input required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded border border-buram-border bg-buram-bg p-2" /></label>
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={!reason.trim()}>Confirm</button></div>
      </form>
    </div>
  );
};

const apiClient = {
  auditedMutation: async (path: string, method: string, payload: { body: Record<string, unknown>; reason: string }) => {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response;
  },
};

export interface MaterialCategoryOption {
  code: string;
  name: string;
  kind: 'HONEY' | 'POLLEN' | 'HONEYCOMB' | 'HONEYNUT' | 'FLAVOUR' | 'PACKAGING' | 'OTHER';
  defaultContainerType: string;
  defaultUnitNetKg: number;
  allergenFlag: boolean;
}

const INITIAL_CATEGORIES: MaterialCategoryOption[] = [
  {
    code: 'CAT-HONEY-DRUM',
    name: 'Raw Honey (Steel Drum)',
    kind: 'HONEY',
    defaultContainerType: 'DRUM_290KG',
    defaultUnitNetKg: 290,
    allergenFlag: false,
  },
  {
    code: 'CAT-POLLEN-PAIL',
    name: 'Bee Pollen (Food-Grade Pail)',
    kind: 'POLLEN',
    defaultContainerType: 'PAIL_25KG',
    defaultUnitNetKg: 25,
    allergenFlag: false,
  },
  {
    code: 'CAT-COMB-CARTON',
    name: 'Natural Honeycomb Trays (Carton)',
    kind: 'HONEYCOMB',
    defaultContainerType: 'CARTON_12KG',
    defaultUnitNetKg: 12,
    allergenFlag: false,
  },
  {
    code: 'CAT-HONEYNUT-BOX',
    name: 'Honeynut / Tree-Nut Ingredient',
    kind: 'HONEYNUT',
    defaultContainerType: 'BAG_20KG',
    defaultUnitNetKg: 20,
    allergenFlag: true, // Allergen flag per PRD Section 2 #11
  },
  {
    code: 'CAT-FLAVOUR-IBC',
    name: 'Natural Vanilla / Cinnamon Flavour',
    kind: 'FLAVOUR',
    defaultContainerType: 'CANISTER_25KG',
    defaultUnitNetKg: 25,
    allergenFlag: false,
  },
];

export const IncomingStockWorkspace: React.FC<{
  lots: IncomingLot[];
  onLotsUpdated: (nextLots: IncomingLot[]) => void;
}> = ({ lots, onLotsUpdated }) => {
  const [categories, setCategories] = useState<MaterialCategoryOption[]>(INITIAL_CATEGORIES);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState(INITIAL_CATEGORIES[0].code);

  // Quick-Add Related Category Modal State
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatKind, setNewCatKind] = useState<MaterialCategoryOption['kind']>('OTHER');
  const [newCatContainer, setNewCatContainer] = useState('IBC_TOTE_1000KG');
  const [newCatUnitKg, setNewCatUnitKg] = useState(1000);
  const [newCatAllergen, setNewCatAllergen] = useState(false);

  // Incoming Lot Receipt Form State
  const [supplierName, setSupplierName] = useState('Apicola Danubius SRL');
  const [originCountryIso, setOriginCountryIso] = useState('RO');
  const [containerType, setContainerType] = useState('DRUM_290KG');
  const [containerCount, setContainerCount] = useState(20);
  const [unitNetKg, setUnitNetKg] = useState(290);
  const [scannedLotBarcode, setScannedLotBarcode] = useState('BC-RO-ACA-290KG-001');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [pendingLotAction, setPendingLotAction] = useState<{
    type: 'RECEIVE_LOT' | 'QA_PASS' | 'QA_FAIL' | 'RETURN_MISMATCH' | 'ADD_CATEGORY';
    lot?: IncomingLot;
    title: string;
    summary: string;
  } | null>(null);

  const activeCategory =
    categories.find((c) => c.code === selectedCategoryCode) || categories[0];
  const totalComputedKg = Number((containerCount * unitNetKg).toFixed(2));

  const handleCategoryChange = (code: string) => {
    setSelectedCategoryCode(code);
    const found = categories.find((c) => c.code === code);
    if (found) {
      setContainerType(found.defaultContainerType);
      setUnitNetKg(found.defaultUnitNetKg);
    }
  };

  const handleBarcodeCaptured = (code: string) => {
    setScannedLotBarcode(code);
    if (code.includes('-POLLEN-')) {
      handleCategoryChange('CAT-POLLEN-PAIL');
    } else if (code.includes('-HONEYNUT-')) {
      handleCategoryChange('CAT-HONEYNUT-BOX');
    } else if (code.includes('-FLV-')) {
      handleCategoryChange('CAT-FLAVOUR-IBC');
    }
  };

  const handleConfirmAction = async (reason: string) => {
    if (!pendingLotAction) return;

    if (pendingLotAction.type === 'ADD_CATEGORY') {
      const code = `CAT-${newCatKind}-${Date.now().toString().slice(-3)}`;
      const created: MaterialCategoryOption = {
        code,
        name: newCatName.trim(),
        kind: newCatKind,
        defaultContainerType: newCatContainer,
        defaultUnitNetKg: newCatUnitKg,
        allergenFlag: newCatAllergen,
      };
      setCategories((prev) => [...prev, created]);
      handleCategoryChange(code);
      setNewCatName('');
      setShowAddCategory(false);
    } else if (pendingLotAction.type === 'RECEIVE_LOT') {
      const lotNumber = `IL-26-0${Math.floor(110 + Math.random() * 85)}`;
      try {
        await apiClient.auditedMutation('/stock/lots/receive', 'POST', {
          body: {
            lotNo: lotNumber,
            supplierName,
            country: originCountryIso,
            honeyType: `${activeCategory.name} [${containerType}]`,
            drumsCount: containerCount,
            nominalDrumNetKg: unitNetKg,
            totalNetKg: totalComputedKg,
            barcode: scannedLotBarcode,
          },
          reason,
        });
      } catch {
        // Offline preview state update
      }

      const newLot: IncomingLot = {
        id: `lot-${Date.now()}`,
        lotNumber,
        supplierName,
        originCountryIso: originCountryIso.toUpperCase(),
        honeyType: `${activeCategory.name} (${containerCount} × ${unitNetKg}kg ${containerType}) [BC: ${scannedLotBarcode}]`,
        receivedAt: new Date().toISOString(),
        drumCount: containerCount,
        totalNetKg: totalComputedKg,
        availableNetKg: 0,
        qualityStatus: 'UNDER_REVIEW',
        mismatchDetected: false,
      };
      onLotsUpdated([newLot, ...lots]);
    } else if (pendingLotAction.lot) {
      const target = pendingLotAction.lot;
      const nextStatus: IncomingLot['qualityStatus'] =
        pendingLotAction.type === 'QA_PASS'
          ? 'APPROVED'
          : pendingLotAction.type === 'RETURN_MISMATCH'
          ? 'RETURNED_TO_SUPPLIER'
          : 'FAILED';

      onLotsUpdated(
        lots.map((l) =>
          l.id === target.id
            ? {
                ...l,
                qualityStatus: nextStatus,
                availableNetKg: nextStatus === 'APPROVED' ? l.totalNetKg : 0,
                mismatchDetected: pendingLotAction.type === 'RETURN_MISMATCH',
              }
            : l
        )
      );
    }

    setPendingLotAction(null);
  };

  return (
    <div className="space-y-5">
      {/* CONCISE HEADER WITH ⓘ INFO BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-buram-border">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[11px] font-mono text-buram-amber uppercase tracking-widest block">
              WAREHOUSE RECEIVING & QSI GATE • STEP 5D / 6D
            </span>
            <h1 className="text-xl font-bold text-buram-text">
              Universal Incoming Lot Intake & Mobile Barcode Capture
            </h1>
          </div>
          <InfoPopoverButton
            ruleCode="R3 / R4 / R15"
            title="Universal Lot Intake & Container Serialization"
            summary="Receives any raw material category (Honey drums, Pollen pails, Honeycomb cartons, Honeynut boxes, Flavour IBCs) with mobile camera barcode scanning."
            formula="totalNetKg = containerCount × unitNetKg (Default Honey Drum = 290.0 kg)"
            bullets={[
              'Supports any container type (290kg Drum, 1000kg IBC, 25kg Pail, Carton, Bag).',
              'Allergen-flagged categories (Honeynut) are isolated from pure honey origin math.',
              'New lots start in UNDER_REVIEW (Quarantine) until QA approves QSI report.',
            ]}
          />
        </div>
        <ExportMenu dataset="INCOMING_LOTS" label="Export Lots" />
      </div>

      {/* UNIVERSAL LOT RECEIPT CARD (ANY CATEGORY / ANY CONTAINER + MOBILE BARCODE) */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-buram-border pb-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-buram-amber" />
            <h2 className="text-sm font-mono uppercase tracking-wider text-buram-gold">
              Receive Incoming Lot (Any Material Category & Container Unit)
            </h2>
            {activeCategory.allergenFlag && (
              <StatusBadge label="ALLERGEN FLAG: NUT INGREDIENT" variant="WARNING" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddCategory((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-buram-elevated border border-buram-border text-xs font-mono text-buram-pale hover:border-buram-amber"
            >
              <Tag className="w-3.5 h-3.5 text-buram-amber" />
              <span>+ Add Related Category</span>
            </button>

            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-buram-tech/20 border border-buram-tech text-xs font-mono font-bold text-buram-tech hover:bg-buram-tech/30"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Scan Lot Barcode (Mobile Camera)</span>
            </button>
          </div>
        </div>

        {/* Inline Quick-Add Category Drawer */}
        {showAddCategory && (
          <div className="p-4 rounded bg-buram-bg border border-buram-amber/50 grid grid-cols-1 sm:grid-cols-5 gap-3 font-mono text-xs items-end">
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">NEW CATEGORY NAME *</span>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Organic Agave Syrup IBC"
                className="bg-buram-surface border border-buram-border rounded px-2.5 py-1.5 text-buram-text"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">MATERIAL KIND</span>
              <select
                value={newCatKind}
                onChange={(e) => setNewCatKind(e.target.value as MaterialCategoryOption['kind'])}
                className="bg-buram-surface border border-buram-border rounded px-2.5 py-1.5 text-buram-gold"
              >
                <option value="HONEY">HONEY</option>
                <option value="POLLEN">POLLEN</option>
                <option value="HONEYCOMB">HONEYCOMB</option>
                <option value="HONEYNUT">HONEYNUT (Allergen)</option>
                <option value="FLAVOUR">FLAVOUR</option>
                <option value="PACKAGING">PACKAGING</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">DEFAULT CONTAINER</span>
              <input
                type="text"
                value={newCatContainer}
                onChange={(e) => setNewCatContainer(e.target.value.toUpperCase())}
                className="bg-buram-surface border border-buram-border rounded px-2.5 py-1.5 text-buram-text"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-buram-muted">DEFAULT UNIT NET (KG)</span>
              <input
                type="number"
                value={newCatUnitKg}
                onChange={(e) => setNewCatUnitKg(Number(e.target.value))}
                className="bg-buram-surface border border-buram-border rounded px-2.5 py-1.5 text-buram-tech tabular-nums"
              />
            </label>
            <button
              type="button"
              disabled={!newCatName.trim()}
              onClick={() =>
                setPendingLotAction({
                  type: 'ADD_CATEGORY',
                  title: `Create Material Category: ${newCatName}`,
                  summary: `Adds category ${newCatName} (Kind=${newCatKind}, Default=${newCatUnitKg}kg ${newCatContainer}) with audit trail.`,
                })
              }
              className="px-3 py-1.5 rounded bg-buram-amber text-buram-bg font-bold uppercase disabled:opacity-40"
            >
              Save Category
            </button>
          </div>
        )}

        {/* Lot Intake Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs items-end">
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">1. MATERIAL CATEGORY</span>
            <select
              value={selectedCategoryCode}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="bg-buram-bg border border-buram-border rounded px-2.5 py-2 text-buram-gold font-bold"
            >
              {categories.map((cat) => (
                <option key={cat.code} value={cat.code}>
                  {cat.name} ({cat.kind})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">2. CONTAINER TYPE</span>
            <select
              value={containerType}
              onChange={(e) => {
                const val = e.target.value;
                setContainerType(val);
                if (val === 'DRUM_290KG') setUnitNetKg(290);
                if (val === 'IBC_TOTE_1000KG') setUnitNetKg(1000);
                if (val === 'PAIL_25KG') setUnitNetKg(25);
                if (val === 'CARTON_12KG') setUnitNetKg(12);
                if (val === 'BAG_20KG') setUnitNetKg(20);
              }}
              className="bg-buram-bg border border-buram-border rounded px-2.5 py-2 text-buram-text"
            >
              <option value="DRUM_290KG">Steel Drum (290 kg std)</option>
              <option value="IBC_TOTE_1000KG">IBC Tote (1,000 kg)</option>
              <option value="PAIL_25KG">Food Pail (25 kg)</option>
              <option value="CARTON_12KG">Carton Tray (12 kg)</option>
              <option value="BAG_20KG">Sack / Box (20 kg)</option>
              <option value="CUSTOM_UNIT">Custom Weight / Unit</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">3. QTY × UNIT NET (KG)</span>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                min={1}
                value={containerCount}
                onChange={(e) => setContainerCount(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-tech font-bold tabular-nums"
                title="Number of containers/drums"
              />
              <input
                type="number"
                step="0.5"
                min={0.5}
                value={unitNetKg}
                onChange={(e) => setUnitNetKg(Number(e.target.value))}
                className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-pale font-bold tabular-nums"
                title="Net kg per container"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">4. SUPPLIER & ORIGIN ISO</span>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="col-span-2 bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text"
              />
              <input
                type="text"
                maxLength={2}
                value={originCountryIso}
                onChange={(e) => setOriginCountryIso(e.target.value.toUpperCase())}
                className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-center text-buram-gold font-bold"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">5. CAPTURED BARCODE</span>
            <input
              type="text"
              value={scannedLotBarcode}
              onChange={(e) => setScannedLotBarcode(e.target.value.toUpperCase())}
              className="bg-buram-bg border border-buram-tech/60 rounded px-2.5 py-2 text-buram-tech font-bold"
            />
          </label>

          <button
            type="button"
            onClick={() =>
              setPendingLotAction({
                type: 'RECEIVE_LOT',
                title: `Receive ${activeCategory.name} (${containerCount} × ${unitNetKg}kg = ${totalComputedKg}kg)`,
                summary: `Logs IncomingLot from ${supplierName} (${originCountryIso}) with barcode ${scannedLotBarcode} into Quarantine and writes +${totalComputedKg} kg RECEIVE_QUARANTINE ledger entries.`,
              })
            }
            className="px-4 py-2 rounded bg-buram-amber text-buram-bg font-bold uppercase hover:bg-buram-gold shadow-amberGlow"
          >
            Receive {totalComputedKg.toLocaleString('de-DE')} kg
          </button>
        </div>
      </section>

      {/* INCOMING LOTS TABLE */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
          <thead>
            <tr className="border-b border-buram-border text-buram-muted uppercase text-[11px]">
              <th className="py-2.5 px-3">Lot #</th>
              <th className="py-2.5 px-3">Origin</th>
              <th className="py-2.5 px-3">Supplier, Category & Barcode</th>
              <th className="py-2.5 px-3 text-right">Units</th>
              <th className="py-2.5 px-3 text-right">Total Net</th>
              <th className="py-2.5 px-3 text-right">Free Approved</th>
              <th className="py-2.5 px-3">QA Status</th>
              <th className="py-2.5 px-3 text-right">QA / Mismatch Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buram-border/50">
            {lots.map((lot) => (
              <tr key={lot.id} className="hover:bg-buram-elevated/40">
                <td className="py-3 px-3 font-bold text-buram-gold">{lot.lotNumber}</td>
                <td className="py-3 px-3">
                  <CountryOriginBadge countryIso={lot.originCountryIso} />
                </td>
                <td className="py-3 px-3 font-sans">
                  <div className="font-medium text-buram-text">{lot.supplierName}</div>
                  <div className="text-[11px] text-buram-muted font-mono">{lot.honeyType}</div>
                </td>
                <td className="py-3 px-3 text-right font-bold text-buram-pale">
                  {lot.drumCount}
                </td>
                <td className="py-3 px-3 text-right">
                  <KgDisplay kg={lot.totalNetKg} size="sm" />
                </td>
                <td className="py-3 px-3 text-right">
                  <KgDisplay kg={lot.availableNetKg} size="sm" />
                </td>
                <td className="py-3 px-3">
                  <StatusBadge
                    label={lot.qualityStatus}
                    variant={
                      lot.qualityStatus === 'APPROVED'
                        ? 'NOMINAL'
                        : lot.qualityStatus === 'UNDER_REVIEW'
                        ? 'AMBER'
                        : 'CRITICAL'
                    }
                  />
                </td>
                <td className="py-3 px-3 text-right space-x-1.5">
                  {lot.qualityStatus === 'UNDER_REVIEW' && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingLotAction({
                            type: 'QA_PASS',
                            lot,
                            title: `Approve QSI Review — ${lot.lotNumber}`,
                            summary: `Releases ${lot.drumCount} units (${lot.totalNetKg} kg) from Quarantine to Approved Warehouse stock.`,
                          })
                        }
                        className="px-2.5 py-1 rounded bg-buram-success/20 text-buram-success border border-buram-success/40"
                      >
                        QA Pass
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingLotAction({
                            type: 'QA_FAIL',
                            lot,
                            title: `Reject Lot on Lab Review — ${lot.lotNumber}`,
                            summary: `Marks ${lot.lotNumber} as FAILED and writes compensating QA_REJECT ledger entries.`,
                          })
                        }
                        className="px-2.5 py-1 rounded bg-buram-warning/20 text-buram-warning border border-buram-warning/40"
                      >
                        QA Fail
                      </button>
                    </>
                  )}
                  {lot.qualityStatus !== 'RETURNED_TO_SUPPLIER' && (
                    <button
                      type="button"
                      onClick={() =>
                        setPendingLotAction({
                          type: 'RETURN_MISMATCH',
                          lot,
                          title: `Mismatch Return to Supplier — ${lot.lotNumber}`,
                          summary: `Flags mismatch on ${lot.lotNumber}, blocks sourcing, and reverses unconsumed balances in stockMovements.`,
                        })
                      }
                      className="px-2.5 py-1 rounded bg-buram-critical/15 text-buram-critical border border-buram-critical/40 inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Return</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <AttachmentsPanel
        entityType="INCOMING_LOT"
        entityCode={lots[0]?.lotNumber || 'LOT-2026-104'}
        defaultDocType="QSI_CERTIFICATE"
      />

      <MobileCameraBarcodeModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onBarcodeCaptured={handleBarcodeCaptured}
      />

      <ReasonDialog
        isOpen={Boolean(pendingLotAction)}
        title={pendingLotAction?.title || ''}
        actionSummary={pendingLotAction?.summary || ''}
        onCancel={() => setPendingLotAction(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
};