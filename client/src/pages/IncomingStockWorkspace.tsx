// client/src/pages/IncomingStockWorkspace.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  PackageCheck,
  Database,
  ShieldCheck,
  RotateCcw,
  PlusCircle,
  FlaskConical,
  Camera,
} from 'lucide-react';
import { IncomingLot } from '../types/erp';
import {
  StatusBadge,
  CountryOriginBadge,
  ReasonDialog,
} from '../components/ui/IndustrialPrimitives';
import { AttachmentsPanel, ExportMenu } from '../components/ui/CrossCuttingPanels';
import { apiClient } from '../lib/apiClient';
import { ScannedLabelData } from '../lib/labelOcr';
import { computePackageWeightDistribution } from '../../../shared/src/schemas/origin-blend.js';

interface SupplierOption {
  _id: string;
  code: string;
  name: string;
  country?: string;
  isActive: boolean;
}

interface MaterialOption {
  _id: string;
  code: string;
  name: string;
  kind: string;
  unit: 'kg' | 'l' | 'piece';
  defaultDrumKg?: number;
  defaultPackageType?: string;
  isActive: boolean;
}

interface ShippedContractOption {
  _id: string;
  contractNo: string;
  sourcingId: string;
  supplierId: string | { _id: string; name: string };
  materialId: string | { _id: string; name: string; unit?: string };
  country: string;
  contractedKg: number;
  contractedDrums: number;
  receivedKg?: number;
  receivedPackages?: number;
  packageType?: string;
  unitWeightKg?: number;
  unitPriceEurPerKg?: number;
}

interface ReceivedLotResponse {
  lot: {
    _id: string;
    lotNo: string;
    country: string;
    receivedDate: string | Date;
    packageCount?: number;
    packageType?: string;
    drumsCount: number;
    totalNetKg: number;
    unit: 'kg' | 'l' | 'piece';
    totalQuantity: number;
    status: string;
    sourceNameSnapshot?: string;
    materialCodeSnapshot?: string;
  };
  drumsCreated: number;
  packagesCreated?: number;
  packageCount?: number;
  packageType?: string;
  totalNetKg: number;
  unit: 'kg' | 'l' | 'piece';
  totalQuantity: number;
}

export const IncomingStockWorkspace: React.FC<{
  viewMode: 'intake' | 'stock';
  lots: IncomingLot[];
  onLotsUpdated: (nextLots: IncomingLot[]) => void;
  canReceiveLots: boolean;
  canApproveLots: boolean;
  canViewPrices: boolean;
  onOpenScanner: () => void;
  lotBarcode: string;
  onLotBarcodeChange: (barcode: string) => void;
  scannedLabelData: ScannedLabelData | null;
  onScannedLabelConsumed: () => void;
}> = ({
  viewMode,
  lots,
  onLotsUpdated,
  canReceiveLots,
  canApproveLots,
  canViewPrices,
  onOpenScanner,
  lotBarcode,
  onLotBarcodeChange,
  scannedLabelData,
  onScannedLabelConsumed,
}) => {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [shippedContracts, setShippedContracts] = useState<ShippedContractOption[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [originCountryIso, setOriginCountryIso] = useState('RO');
  const [exporter, setExporter] = useState('');
  const [labelDate, setLabelDate] = useState('');
  const [packageType, setPackageType] = useState('DRUM');
  const [labelQuantity, setLabelQuantity] = useState('');
  const [labelUnit, setLabelUnit] = useState('kg');
  const [drumNumber, setDrumNumber] = useState('');
  const [tareKg, setTareKg] = useState(17.5);
  const [packageCount, setPackageCount] = useState(20);
  const [netKgPerPackage, setNetKgPerPackage] = useState(290);
  const [massInputUnit, setMassInputUnit] = useState<'kg' | 'ton'>('kg');
  const [totalInputWeight, setTotalInputWeight] = useState('5800');
  const [unitPriceEurPerKg, setUnitPriceEurPerKg] = useState('');
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(true);
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);
  const [receiveError, setReceiveError] = useState('');
  const [receiveMessage, setReceiveMessage] = useState('');
  const [lotActionError, setLotActionError] = useState('');
  const [lotActionMessage, setLotActionMessage] = useState('');
  const [isSavingLotAction, setIsSavingLotAction] = useState(false);
  const [qaReportNumbers, setQaReportNumbers] = useState<Record<string, string>>({});
  const [mismatchDetailsByLot, setMismatchDetailsByLot] = useState<Record<string, string>>({});
  const [labelUploadRetry, setLabelUploadRetry] = useState<{
    lotId: string;
    lotNo: string;
    file: File;
  } | null>(null);
  const isStockView = viewMode === 'stock';

  const [integrityStatus, setIntegrityStatus] = useState<string>(
    'Ledger integrity has not been checked in this session.'
  );
  const [pendingLotAction, setPendingLotAction] = useState<{
    type: 'RECEIVE_LOT' | 'QA_PASS' | 'QA_FAIL' | 'RETURN_MISMATCH';
    lot?: IncomingLot;
    title: string;
    summary: string;
  } | null>(null);

  const supplierName = suppliers.find((supplier) => supplier._id === supplierId)?.name ?? '';
  const selectedMaterial = materials.find((material) => material._id === materialId);
  const selectedContract = shippedContracts.find(
    (contract) => contract._id === selectedContractId
  );
  const packageTypeOptions = Array.from(
    new Set([
      'IBC',
      'DRUM',
      'BUCKET_TRAY',
      'BUCKET',
      'TRAY',
      'CARTON',
      ...materials
        .map((material) => material.defaultPackageType?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value)),
      packageType,
    ])
  );
  const parsedTotalInputWeight = Number(totalInputWeight);
  const kgDistribution = useMemo(() => {
    if (
      selectedMaterial?.unit !== 'kg' ||
      !Number.isInteger(packageCount) ||
      packageCount < 1 ||
      !Number.isFinite(parsedTotalInputWeight) ||
      parsedTotalInputWeight <= 0 ||
      parsedTotalInputWeight > 500_000
    ) {
      return null;
    }
    return computePackageWeightDistribution({
      packagesCount: packageCount,
      inputMassUnit: massInputUnit,
      totalInputWeight: parsedTotalInputWeight,
    });
  }, [massInputUnit, packageCount, parsedTotalInputWeight, selectedMaterial?.unit]);
  const totalComputedQuantity =
    selectedMaterial?.unit === 'kg'
      ? kgDistribution?.totalNetKg ?? 0
      : packageCount * netKgPerPackage;
  const honeyType = selectedMaterial?.name ?? '';
  const canSubmitReceipt =
    !isLoadingMasterData &&
    Boolean(supplierId && selectedMaterial && /^[A-Z]{2}$/.test(originCountryIso)) &&
    Number.isInteger(packageCount) &&
    packageCount > 0 &&
    (selectedMaterial?.unit === 'kg'
      ? Boolean(kgDistribution) && Number.isFinite(tareKg) && tareKg >= 0
      : Number.isFinite(netKgPerPackage) &&
        netKgPerPackage > 0 &&
        (selectedMaterial?.unit !== 'piece' || Number.isInteger(netKgPerPackage))) &&
    (!canViewPrices ||
      unitPriceEurPerKg.trim() === '' ||
      (Number.isFinite(Number(unitPriceEurPerKg)) && Number(unitPriceEurPerKg) >= 0)) &&
    !(selectedMaterial?.unit !== 'kg' && packageType === 'DRUM');

  useEffect(() => {
    let active = true;
    setIsLoadingMasterData(true);
    void Promise.all([
      apiClient.request<SupplierOption[]>('/master/suppliers'),
      apiClient.request<MaterialOption[]>('/master/materials?activeOnly=true'),
      apiClient.request<ShippedContractOption[]>('/sourcings/contracts'),
    ])
      .then(([supplierRows, materialRows, contractRows]) => {
        if (!active) return;
        setSuppliers(supplierRows.filter((supplier) => supplier.isActive));
        setMaterials(materialRows.filter((material) => material.isActive));
        setShippedContracts(contractRows);
      })
      .catch((cause) => {
        if (active) {
          setReceiveError(
            cause instanceof Error ? cause.message : 'Could not load suppliers and materials.'
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingMasterData(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!scannedLabelData) return;
    const fields = scannedLabelData.fields;
    const supplier = suppliers.find(
      (row) => row.name.toLowerCase() === fields.supplierName.toLowerCase()
    );
    const material = materials.find(
      (row) =>
        row.name.toLowerCase() === fields.materialName.toLowerCase() ||
        row.code.toLowerCase() === fields.materialName.toLowerCase()
    );
    if (supplier) setSupplierId(supplier._id);
    if (fields.originCountry) setOriginCountryIso(fields.originCountry.toUpperCase());
    if (material) setMaterialId(material._id);
    if (fields.exporter) setExporter(fields.exporter);
    if (fields.labelDate) setLabelDate(fields.labelDate);
    if (fields.packageType) {
      const normalizedType = fields.packageType.trim().toUpperCase();
      if (['IBC', 'DRUM', 'BUCKET_TRAY', 'BUCKET', 'TRAY', 'CARTON'].includes(normalizedType)) {
        setPackageType(normalizedType);
      }
    }
    if (fields.quantity) setLabelQuantity(fields.quantity);
    if (fields.unit) setLabelUnit(fields.unit);
    if (fields.drumNumber) setDrumNumber(fields.drumNumber);
    if (fields.tareKg && Number.isFinite(Number(fields.tareKg))) {
      setTareKg(Number(fields.tareKg));
    }
    if (fields.packageCount) {
      const count = Number(fields.packageCount);
      if (Number.isInteger(count) && count > 0) setPackageCount(count);
    }
    const parsedPackageCount =
      fields.packageCount && Number.isInteger(Number(fields.packageCount)) && Number(fields.packageCount) > 0
        ? Number(fields.packageCount)
        : packageCount;
    if (fields.quantity && Number.isFinite(Number(fields.quantity))) {
      const quantity = Number(fields.quantity);
      if (quantity > 0) {
        setNetKgPerPackage(quantity);
        if (material?.unit === 'kg') {
          setTotalInputWeight(String(quantity * parsedPackageCount));
        }
      }
    }
    if (fields.unit) {
      const unit = fields.unit.trim().toLowerCase();
      if (unit === 't' || unit === 'ton' || unit === 'tonne' || unit === 'tons') {
        setMassInputUnit('ton');
      } else if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(unit)) {
        setMassInputUnit('kg');
      }
    }
    setReceiveMessage(
      'Label fields extracted. Review and correct every value; unmatched supplier/material must be selected manually.'
    );
  }, [materials, packageCount, scannedLabelData, suppliers]);

  const handleRunIntegrityCheck = async () => {
    try {
      const res = await apiClient.request<{
        healthy: boolean;
        checkedStockUnitsCount: number;
        discrepanciesCount: number;
      }>(
        '/stock/ledger/integrity-check'
      );
      setIntegrityStatus(
        res.healthy
          ? `SNAPSHOT INTEGRITY PASS: ${res.checkedStockUnitsCount} stock packages verified against the append-only ledger.`
          : `SNAPSHOT INTEGRITY FAILED: ${res.discrepanciesCount} stock package balance discrepancies found.`
      );
    } catch (cause) {
      setIntegrityStatus(
        cause instanceof Error
          ? `SNAPSHOT INTEGRITY CHECK FAILED: ${cause.message}`
          : 'SNAPSHOT INTEGRITY CHECK FAILED.'
      );
    }
  };

  const handleConfirmAction = async (reason: string) => {
    if (!pendingLotAction) return;

    if (pendingLotAction.type === 'RECEIVE_LOT') {
      setIsSavingReceipt(true);
      setReceiveError('');
      setReceiveMessage('');
      try {
        const labelFields = scannedLabelData?.fields;
        const response = await apiClient.auditedMutation<ReceivedLotResponse, Record<string, unknown>>(
          '/stock/lots/receive',
          'POST',
          {
          body: {
            supplierId,
            materialId,
            country: originCountryIso,
            packageType,
            packageCount,
            ...(selectedMaterial?.unit === 'kg'
              ? {
                  massInputUnit,
                  totalInputWeight: parsedTotalInputWeight,
                }
              : { quantityPerPackage: netKgPerPackage }),
            unit: selectedMaterial?.unit,
            quantityUnit: selectedMaterial?.unit,
            tareKgPerPackage: selectedMaterial?.unit === 'kg' ? tareKg : undefined,
            unitPriceEurPerKg:
              canViewPrices &&
              !selectedContractId &&
              selectedMaterial?.unit === 'kg' &&
              unitPriceEurPerKg.trim() !== ''
                ? Number(unitPriceEurPerKg)
                : undefined,
            contractId: selectedContractId || undefined,
            sourcingId: selectedContract?.sourcingId,
            notes: labelFields?.rawText || undefined,
            labelData: labelFields
              ? {
                  ...labelFields,
                  supplierName: labelFields.supplierName || supplierName,
                  originCountry: originCountryIso,
                  materialName: labelFields.materialName || honeyType,
                  exporter,
                  labelDate,
                  packageType,
                  quantity: labelQuantity,
                  unit: labelUnit,
                  drumNumber,
                  tareKg: String(tareKg),
                  barcode: lotBarcode.trim() || labelFields.barcode,
                }
              : lotBarcode.trim()
                ? { barcode: lotBarcode.trim() }
                : undefined,
          },
          reason,
        });
        const receivedLot = response.lot;
        const status =
          receivedLot.status === 'PASSED' || receivedLot.status === 'APPROVED'
            ? 'APPROVED'
            : receivedLot.status === 'FAILED'
              ? 'FAILED'
              : receivedLot.status === 'RETURNED_TO_SUPPLIER'
                ? 'RETURNED_TO_SUPPLIER'
                : 'UNDER_REVIEW';

        const newLot: IncomingLot = {
          id: receivedLot._id,
          lotNumber: receivedLot.lotNo,
          supplierName: receivedLot.sourceNameSnapshot ?? supplierName,
          originCountryIso: receivedLot.country,
          honeyType: selectedMaterial?.name ?? '',
          receivedAt: new Date(receivedLot.receivedDate).toISOString(),
          drumCount: receivedLot.packageCount ?? receivedLot.drumsCount,
          packageCount: receivedLot.packageCount ?? receivedLot.drumsCount,
          packageType: receivedLot.packageType ?? 'DRUM',
          unit: receivedLot.unit,
          totalQuantity: receivedLot.totalQuantity,
          availableQuantity: 0,
          totalNetKg: receivedLot.totalNetKg,
          availableNetKg: 0,
          qualityStatus: status,
          mismatchDetected: false,
        };
        onLotsUpdated([newLot, ...lots]);

        if (scannedLabelData?.image) {
          try {
            const formData = new FormData();
            formData.append('file', scannedLabelData.image);
            formData.append('entityType', 'INCOMING_LOT');
            formData.append('entityId', receivedLot._id);
            formData.append('entityCode', receivedLot.lotNo);
            formData.append('docType', 'OTHER');
            formData.append('notes', 'Supplier label image captured during warehouse intake.');
            await apiClient.request('/attachments/upload', {
              method: 'POST',
              body: formData,
            });
            setReceiveMessage(`Lot ${receivedLot.lotNo} received and label image attached.`);
            setLabelUploadRetry(null);
          } catch (error) {
            setLabelUploadRetry({
              lotId: receivedLot._id,
              lotNo: receivedLot.lotNo,
              file: scannedLabelData.image,
            });
            setReceiveMessage(`Lot ${receivedLot.lotNo} was received, but its label photo could not be uploaded. Retry the upload below.`);
            setReceiveError(
              error instanceof Error ? error.message : 'Label photo upload failed.'
            );
          }
        } else {
          setReceiveMessage(`Lot ${receivedLot.lotNo} received and saved.`);
        }

        onLotBarcodeChange('');
        onScannedLabelConsumed();
        setSelectedContractId('');
      } catch (error) {
        setReceiveError(
          error instanceof Error ? error.message : 'Could not receive the incoming lot.'
        );
        setPendingLotAction(null);
        setIsSavingReceipt(false);
        return;
      } finally {
        setIsSavingReceipt(false);
      }
    } else if (pendingLotAction.lot) {
      const target = pendingLotAction.lot;
      setIsSavingLotAction(true);
      setLotActionError('');
      setLotActionMessage('');
      try {
        if (pendingLotAction.type === 'QA_PASS' || pendingLotAction.type === 'QA_FAIL') {
          const reportNo = qaReportNumbers[target.id]?.trim();
          if (!reportNo || reportNo.length < 2) {
            throw new Error('Enter the QSI/lab report number before reviewing this lot.');
          }
          const passed = pendingLotAction.type === 'QA_PASS';
          await apiClient.auditedMutation<unknown, Record<string, unknown>>(
            `/stock/lots/${target.id}/review`,
            'POST',
            {
              body: {
                decision: passed ? 'PASSED' : 'FAILED',
                labReport: { reportNo },
              },
              reason,
            }
          );
          const nextStatus: IncomingLot['qualityStatus'] = passed ? 'APPROVED' : 'FAILED';
          onLotsUpdated(
            lots.map((lot) =>
              lot.id === target.id
                ? {
                    ...lot,
                    qualityStatus: nextStatus,
                    availableNetKg: passed ? lot.totalNetKg : 0,
                    availableQuantity: passed
                      ? lot.totalQuantity ?? lot.totalNetKg
                      : 0,
                  }
                : lot
            )
          );
          setLotActionMessage(
            passed
              ? `Lot ${target.lotNumber} QA approval saved. Approved stock remains in the Warehouse and is available for batch feasibility.`
              : `Lot ${target.lotNumber} QA failure saved. Stock remains unavailable.`
          );
          setQaReportNumbers((current) => {
            const next = { ...current };
            delete next[target.id];
            return next;
          });
        } else {
          const mismatchDetails = mismatchDetailsByLot[target.id]?.trim();
          if (!mismatchDetails || mismatchDetails.length < 5) {
            throw new Error('Enter mismatch details (at least 5 characters) before returning this lot.');
          }
          await apiClient.auditedMutation<unknown, Record<string, unknown>>(
            `/stock/lots/${target.id}/return-mismatch`,
            'POST',
            {
              body: { mismatchDetails },
              reason,
            }
          );
          onLotsUpdated(
            lots.map((lot) =>
              lot.id === target.id
                ? {
                    ...lot,
                    qualityStatus: 'RETURNED_TO_SUPPLIER',
                    availableNetKg: 0,
                    availableQuantity: 0,
                    mismatchDetected: true,
                  }
                : lot
            )
          );
          setLotActionMessage(`Lot ${target.lotNumber} mismatch return saved. Stock is unavailable.`);
          setMismatchDetailsByLot((current) => {
            const next = { ...current };
            delete next[target.id];
            return next;
          });
        }
      } catch (error) {
        setLotActionError(
          error instanceof Error ? error.message : 'Could not save the lot review.'
        );
        setPendingLotAction(null);
        return;
      } finally {
        setIsSavingLotAction(false);
      }
    }

    setPendingLotAction(null);
  };

  const retryLabelUpload = async () => {
    if (!labelUploadRetry) return;
    setReceiveError('');
    try {
      const formData = new FormData();
      formData.append('file', labelUploadRetry.file);
      formData.append('entityType', 'INCOMING_LOT');
      formData.append('entityId', labelUploadRetry.lotId);
      formData.append('entityCode', labelUploadRetry.lotNo);
      formData.append('docType', 'OTHER');
      formData.append('notes', 'Supplier label image captured during warehouse intake.');
      await apiClient.request('/attachments/upload', { method: 'POST', body: formData });
      setReceiveMessage(`Label photo for ${labelUploadRetry.lotNo} uploaded.`);
      setLabelUploadRetry(null);
    } catch (error) {
      setReceiveError(error instanceof Error ? error.message : 'Label photo upload failed.');
    }
  };

  const clearScannedLabel = () => {
    onScannedLabelConsumed();
    onLotBarcodeChange('');
    setLabelDate('');
    setPackageType('DRUM');
    setLabelQuantity('');
    setLabelUnit('kg');
    setExporter('');
    setDrumNumber('');
    setTareKg(17.5);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-buram-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-buram-amber uppercase tracking-widest">
            <span>
              {isStockView
                ? 'WAREHOUSE STOCK'
                : 'WAREHOUSE INTAKE'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-buram-text mt-1">
            {isStockView
              ? 'Warehouse Stock & Ledger'
              : 'Incoming Lots & QA'}
          </h1>
        </div>
        <ExportMenu dataset="INCOMING_LOTS" label="Export Incoming Lots" />
      </div>

      {/* LEDGER INTEGRITY BANNER */}
      <div className="p-3.5 rounded-lg bg-buram-success/10 border border-buram-success/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-2 text-buram-success">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{integrityStatus}</span>
        </div>
        <button
          type="button"
          onClick={handleRunIntegrityCheck}
          className="px-3 py-1 rounded bg-buram-surface border border-buram-success/50 text-buram-pale hover:bg-buram-elevated shrink-0"
        >
          Verify Ledger Snapshot Integrity
        </button>
      </div>

      {/* RECEIVE NEW INCOMING LOT */}
      {!isStockView && canReceiveLots && (
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel">
        <div className="flex items-center gap-2 mb-3">
          <PlusCircle className="w-4 h-4 text-buram-amber" />
          <h2 className="text-sm font-mono uppercase tracking-wider text-buram-gold">
            Receive Incoming Lot & Create Quarantine Package Stock
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 font-mono text-xs items-end">
          <label className="flex flex-col gap-1 xl:col-span-2">
            <span className="text-buram-muted">SHIPPED CONTRACT (OPTIONAL)</span>
            <select
              value={selectedContractId}
              onChange={(e) => {
                const nextContractId = e.target.value;
                setSelectedContractId(nextContractId);
                const contract = shippedContracts.find(
                  (row) => row._id === nextContractId
                );
                if (!contract) return;
                const nextSupplierId =
                  typeof contract.supplierId === 'string'
                    ? contract.supplierId
                    : contract.supplierId._id;
                const nextMaterialId =
                  typeof contract.materialId === 'string'
                    ? contract.materialId
                    : contract.materialId._id;
                const remainingKg = Math.max(
                  0,
                  contract.contractedKg - (contract.receivedKg ?? 0)
                );
                const remainingPackages = Math.max(
                  0,
                  contract.contractedDrums - (contract.receivedPackages ?? 0)
                );
                setSupplierId(nextSupplierId);
                setMaterialId(nextMaterialId);
                setOriginCountryIso(contract.country);
                setPackageType(contract.packageType ?? 'DRUM');
                setPackageCount(remainingPackages);
                setMassInputUnit('kg');
                setTotalInputWeight(String(remainingKg));
                setUnitPriceEurPerKg('');
              }}
              disabled={isLoadingMasterData}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
            >
              <option value="">Unlinked receipt</option>
              {shippedContracts.map((contract) => (
                <option
                  key={contract._id}
                  value={contract._id}
                  disabled={
                    (contract.receivedKg ?? 0) >= contract.contractedKg ||
                    (contract.receivedPackages ?? 0) >= contract.contractedDrums
                  }
                >
                  {contract.contractNo} · {Math.max(
                    0,
                    contract.contractedKg - (contract.receivedKg ?? 0)
                  )} kg remaining · SHIPPED
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">SUPPLIER</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={isLoadingMasterData || Boolean(selectedContractId)}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
            >
              <option value="">Select an active supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name} ({supplier.code})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">ORIGIN ISO-2</span>
            <input
              type="text"
              maxLength={2}
              value={originCountryIso}
              onChange={(e) => setOriginCountryIso(e.target.value.toUpperCase())}
              disabled={Boolean(selectedContractId)}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-pale font-bold"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">MATERIAL</span>
            <select
              value={materialId}
              onChange={(e) => {
                const material = materials.find((row) => row._id === e.target.value);
                setMaterialId(e.target.value);
                if (material) {
                  const configuredPackageType =
                    material.defaultPackageType?.trim().toUpperCase();
                  setPackageType(
                    material.unit === 'kg'
                      ? configuredPackageType || 'DRUM'
                      : configuredPackageType && configuredPackageType !== 'DRUM'
                        ? configuredPackageType
                        : 'CARTON'
                  );
                  setNetKgPerPackage(
                    material.unit === 'kg' ? material.defaultDrumKg ?? 290 : 1
                  );
                  setTareKg(material.unit === 'kg' ? 17.5 : 0);
                  setMassInputUnit('kg');
                  if (material.unit === 'kg') {
                    setTotalInputWeight(
                      String(packageCount * (material.defaultDrumKg ?? 290))
                    );
                  }
                }
              }}
              disabled={isLoadingMasterData || Boolean(selectedContractId)}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
            >
              <option value="">Select an active material</option>
              {materials.map((material) => (
                <option key={material._id} value={material._id}>
                  {material.name} ({material.code}) · {material.unit}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">SUPPLIER LOT BARCODE (OPTIONAL)</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={lotBarcode}
                onChange={(e) => onLotBarcodeChange(e.target.value.toUpperCase())}
                placeholder="Type barcode or focus here and scan"
                className="min-w-0 flex-1 bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              />
              <button
                type="button"
                onClick={onOpenScanner}
                aria-label="Open camera barcode scanner"
                title="Open camera scanner; handheld keyboard scanners can scan directly into the field"
                className="inline-flex shrink-0 items-center gap-1.5 rounded border border-buram-tech/50 bg-buram-tech/10 px-2.5 py-2 text-buram-tech hover:bg-buram-tech/20"
              >
                <Camera className="h-4 w-4" />
                <span className="hidden xl:inline">Camera</span>
              </button>
            </div>
            <span className="text-[10px] text-buram-warning">
              Enter manually, scan with a handheld reader, or use the camera. Barcode and reviewed OCR data are saved with the lot.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">PACKAGE TYPE</span>
            <select
              value={packageType}
              onChange={(e) => setPackageType(e.target.value)}
              disabled={Boolean(selectedContractId)}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
            >
              {packageTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'DRUM' ? 'Drum' : option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">PACKAGE COUNT</span>
            <input
              type="number"
              min={1}
              step={1}
              value={packageCount}
              onChange={(e) => setPackageCount(e.target.value === '' ? 0 : Number(e.target.value))}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-tech font-bold tabular-nums"
            />
          </label>
          {selectedMaterial?.unit === 'kg' ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-buram-muted">TOTAL NET WEIGHT</span>
                <input
                  type="number"
                  min={0.001}
                  max={500000}
                  step="any"
                  value={totalInputWeight}
                  onChange={(e) => setTotalInputWeight(e.target.value)}
                  className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-tech font-bold tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-buram-muted">TOTAL WEIGHT UNIT</span>
                <select
                  value={massInputUnit}
                  onChange={(e) => setMassInputUnit(e.target.value as 'kg' | 'ton')}
                  className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
                >
                  <option value="kg">kg</option>
                  <option value="ton">metric tonne</option>
                </select>
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-buram-muted">QUANTITY PER PACKAGE</span>
                <span className="rounded border border-buram-border bg-buram-bg px-3 py-2 text-buram-tech font-bold tabular-nums">
                  {kgDistribution
                    ? `${kgDistribution.unitWeightKg.toLocaleString('de-DE', {
                        minimumFractionDigits: 3,
                        maximumFractionDigits: 3,
                      })} kg average`
                    : 'Enter a valid package count and total weight'}
                </span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-buram-muted">TARE KG PER PACKAGE</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tareKg}
                  onChange={(e) => setTareKg(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text tabular-nums"
                />
              </label>
              {canViewPrices && (
                <label className="flex flex-col gap-1">
                  <span className="text-buram-muted">SOURCE PRICE (EUR / KG, OPTIONAL)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitPriceEurPerKg}
                    onChange={(e) => setUnitPriceEurPerKg(e.target.value)}
                    className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-tech font-bold tabular-nums"
                  />
                </label>
              )}
            </>
          ) : selectedMaterial ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-buram-muted">QUANTITY PER PACKAGE</span>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={netKgPerPackage}
                  onChange={(e) =>
                    setNetKgPerPackage(e.target.value === '' ? 0 : Number(e.target.value))
                  }
                  className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-tech font-bold tabular-nums"
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-buram-muted">INVENTORY UNIT</span>
                <span className="rounded border border-buram-border bg-buram-bg px-3 py-2 text-buram-text">
                  {selectedMaterial.unit} · no unit conversion
                </span>
              </div>
            </>
          ) : null}
          {selectedMaterial?.unit === 'kg' && (
            <div className="col-span-full rounded border border-buram-tech/30 bg-buram-tech/5 p-3 text-xs text-buram-pale">
              <p>
                Total received: {totalComputedQuantity.toLocaleString('de-DE')} kg across{' '}
                {packageCount} packages. The average package weight is{' '}
                {kgDistribution
                  ? `${kgDistribution.unitWeightKg.toLocaleString('de-DE', {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    })} kg`
                  : 'not available'}.
              </p>
              <p className="mt-1">
                Initial origin attribution: {originCountryIso || '—'} · 100% of package weight.
                {canViewPrices && (
                  <>
                    {' '}
                    Price attribution: 100% of entered source value
                    {unitPriceEurPerKg.trim() !== '' &&
                    Number.isFinite(Number(unitPriceEurPerKg)) &&
                    Number(unitPriceEurPerKg) >= 0
                      ? ` (€${Number(unitPriceEurPerKg).toFixed(2)}/kg; total €${(
                          totalComputedQuantity * Number(unitPriceEurPerKg)
                        ).toFixed(2)})`
                      : ' (blank price records €0.00/kg)'}
                    .
                  </>
                )}
              </p>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">LABEL QUANTITY / UNIT</span>
            <div className="flex gap-2">
              <input
                value={labelQuantity}
                onChange={(e) => setLabelQuantity(e.target.value)}
                placeholder="Not supplied"
                className="min-w-0 flex-1 bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
              />
              <input
                value={labelUnit}
                onChange={(e) => setLabelUnit(e.target.value)}
                aria-label="Label quantity unit"
                className="w-20 bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">EXPORTER</span>
            <input
              value={exporter}
              onChange={(e) => setExporter(e.target.value)}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">LABEL DATE</span>
            <input
              value={labelDate}
              onChange={(e) => setLabelDate(e.target.value)}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-buram-muted">LABEL DRUM NUMBER</span>
            <input
              value={drumNumber}
              onChange={(e) => setDrumNumber(e.target.value)}
              className="bg-buram-bg border border-buram-border rounded px-3 py-2 text-buram-text"
            />
          </label>
          <button
            type="button"
            disabled={!canSubmitReceipt || isSavingReceipt}
            onClick={() =>
              setPendingLotAction({
                type: 'RECEIVE_LOT',
                title: `Receive Incoming Lot (${packageCount} ${packageType} packages = ${totalComputedQuantity.toLocaleString('de-DE')} ${selectedMaterial?.unit ?? 'kg'})`,
                summary: `Creates an audited lot for ${supplierName} (${originCountryIso}), records ${packageCount} ${packageType} packages${selectedMaterial?.unit === 'kg' ? ` with ${kgDistribution?.unitWeightKg.toLocaleString('de-DE')} kg average weight each` : ` at ${netKgPerPackage} ${selectedMaterial?.unit ?? 'units'} each`}, and writes +${totalComputedQuantity.toLocaleString('de-DE')} ${selectedMaterial?.unit ?? 'kg'} to the unit-aware stock ledger. The lot remains under QA review.`,
              })
            }
            className="px-4 py-2 rounded bg-buram-amber text-buram-ink font-bold uppercase hover:bg-buram-gold shadow-amberGlow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingReceipt
              ? 'Saving…'
              : `Receive ${totalComputedQuantity.toLocaleString('de-DE')} ${selectedMaterial?.unit ?? 'units'}`}
          </button>
        </div>
        {isLoadingMasterData && (
          <p className="mt-3 text-xs text-buram-muted">Loading active suppliers and materials…</p>
        )}
        {scannedLabelData && (
          <div className="mt-4 rounded border border-buram-tech/40 bg-buram-tech/5 p-3 text-xs text-buram-pale">
            <p className="font-semibold text-buram-tech">REVIEWED LABEL ATTACHED TO THIS INTAKE</p>
            <p className="mt-1 break-words">
              Supplier lot: {scannedLabelData.fields.supplierLotReference || '—'} · Barcode: {lotBarcode || '—'} · Image: {scannedLabelData.image.name}
            </p>
            <button
              type="button"
              onClick={clearScannedLabel}
              className="mt-2 text-[10px] uppercase text-buram-warning hover:text-buram-gold"
            >
              Remove scanned label
            </button>
          </div>
        )}
        {receiveMessage && <p role="status" className="mt-3 text-xs text-buram-success">{receiveMessage}</p>}
        {receiveError && <p role="alert" className="mt-3 text-xs text-buram-critical">{receiveError}</p>}
        {labelUploadRetry && (
          <button
            type="button"
            onClick={() => void retryLabelUpload()}
            className="mt-2 rounded border border-buram-warning/50 px-3 py-1.5 text-xs text-buram-warning hover:bg-buram-warning/10"
          >
            Retry label photo upload for {labelUploadRetry.lotNo}
          </button>
        )}
      </section>
      )}

      {/* INCOMING LOT REGISTER OR STOCK BALANCES */}
      <section className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel overflow-x-auto">
        <h2 className="mb-3 text-sm font-mono uppercase tracking-wider text-buram-gold">
          {isStockView ? 'Stock balances by incoming lot' : 'Incoming lot register & QA review'}
        </h2>
        {!isStockView && (
          <p className="mb-3 text-xs text-buram-muted">
            Receipts remain in quarantine until QA saves a report-backed decision. Passed stock stays in the Warehouse; run batch feasibility before reserving it for a batch.
          </p>
        )}
        {lotActionMessage && <p role="status" className="mb-3 text-xs text-buram-success">{lotActionMessage}</p>}
        {lotActionError && <p role="alert" className="mb-3 text-xs text-buram-critical">{lotActionError}</p>}
        <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
          <thead>
            <tr className="border-b border-buram-border text-buram-muted uppercase text-[11px]">
              <th className="py-2.5 px-3">Lot #</th>
              {!isStockView && <th className="py-2.5 px-3">Origin</th>}
              <th className="py-2.5 px-3">{isStockView ? 'Supplier' : 'Supplier & Material'}</th>
              <th className="py-2.5 px-3 text-right">Packages</th>
              <th className="py-2.5 px-3 text-right">Total Net</th>
              <th className="py-2.5 px-3 text-right">Free Approved</th>
              <th className="py-2.5 px-3">{isStockView ? 'Availability' : 'QA Status'}</th>
              {!isStockView && (
                <th className="py-2.5 px-3 text-right">Audited QA / Mismatch Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-buram-border/50">
            {lots.length === 0 && (
              <tr>
                <td
                  colSpan={isStockView ? 6 : 8}
                  className="py-8 text-center text-xs text-buram-muted"
                >
                  No incoming lots are available from the server yet.
                </td>
              </tr>
            )}
            {lots.map((lot) => (
              <tr key={lot.id} className="hover:bg-buram-elevated/40">
                <td className="py-3 px-3 font-bold text-buram-gold">{lot.lotNumber}</td>
                {!isStockView && (
                  <td className="py-3 px-3">
                    <CountryOriginBadge countryIso={lot.originCountryIso} />
                  </td>
                )}
                <td className="py-3 px-3 font-sans">
                  <div className="font-medium text-buram-text">{lot.supplierName}</div>
                  {!isStockView && (
                    <div className="text-[11px] text-buram-muted">{lot.honeyType}</div>
                  )}
                </td>
                <td className="py-3 px-3 text-right font-bold text-buram-pale">
                  {lot.packageCount ?? lot.drumCount} {lot.packageType ?? 'DRUM'}
                </td>
                <td className="py-3 px-3 text-right">
                  {(lot.totalQuantity ?? lot.totalNetKg).toLocaleString('de-DE')} {lot.unit ?? 'kg'}
                </td>
                <td className="py-3 px-3 text-right">
                  {(lot.availableQuantity ?? lot.availableNetKg).toLocaleString('de-DE')} {lot.unit ?? 'kg'}
                </td>
                <td className="py-3 px-3">
                  <StatusBadge
                    label={
                      isStockView
                        ? (lot.availableQuantity ?? lot.availableNetKg) > 0
                          ? 'AVAILABLE'
                          : 'NO FREE STOCK'
                        : lot.qualityStatus
                    }
                    variant={
                      isStockView
                        ? (lot.availableQuantity ?? lot.availableNetKg) > 0
                          ? 'NOMINAL'
                          : 'AMBER'
                        : lot.qualityStatus === 'APPROVED'
                        ? 'NOMINAL'
                        : lot.qualityStatus === 'UNDER_REVIEW'
                        ? 'AMBER'
                        : 'CRITICAL'
                    }
                  />
                </td>
                {!isStockView && (
                  <td className="py-3 px-3">
                    <div className="ml-auto flex max-w-sm flex-col items-stretch gap-2">
                    {canApproveLots && lot.qualityStatus === 'UNDER_REVIEW' && (
                      <>
                      <label className="text-left text-[10px] uppercase tracking-wide text-buram-muted">
                        QSI / lab report no.
                        <input
                          className="mt-1 w-full rounded border border-buram-border bg-buram-bg px-2 py-1.5 text-xs text-buram-text"
                          value={qaReportNumbers[lot.id] ?? ''}
                          onChange={(event) =>
                            setQaReportNumbers((current) => ({
                              ...current,
                              [lot.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={(qaReportNumbers[lot.id]?.trim().length ?? 0) < 2}
                        onClick={() =>
                          setPendingLotAction({
                            type: 'QA_PASS',
                            lot,
                            title: `Approve QSI Review — ${lot.lotNumber}`,
                            summary: `Save the QSI report and release ${lot.packageCount ?? lot.drumCount} ${lot.packageType ?? 'DRUM'} packages (${lot.totalQuantity ?? lot.totalNetKg} ${lot.unit ?? 'kg'}) from quarantine to Approved stock in the Warehouse.`,
                          })
                        }
                        className="px-2.5 py-1 rounded bg-buram-success/20 text-buram-success border border-buram-success/40 hover:bg-buram-success/30 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        QA Pass
                      </button>
                      <button
                        type="button"
                        disabled={(qaReportNumbers[lot.id]?.trim().length ?? 0) < 2}
                        onClick={() =>
                          setPendingLotAction({
                            type: 'QA_FAIL',
                            lot,
                            title: `Reject Lot on Lab Review — ${lot.lotNumber}`,
                            summary: `Save the failed QSI report for ${lot.lotNumber} and reject its quarantined stock.`,
                          })
                        }
                        className="px-2.5 py-1 rounded bg-buram-warning/20 text-buram-warning border border-buram-warning/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        QA Fail
                      </button>
                      </div>
                      </>
                    )}
                    {lot.qualityStatus !== 'RETURNED_TO_SUPPLIER' && (
                      <>
                      <label className="text-left text-[10px] uppercase tracking-wide text-buram-muted">
                        Mismatch details
                        <input
                          className="mt-1 w-full rounded border border-buram-border bg-buram-bg px-2 py-1.5 text-xs text-buram-text"
                          value={mismatchDetailsByLot[lot.id] ?? ''}
                          onChange={(event) =>
                            setMismatchDetailsByLot((current) => ({
                              ...current,
                              [lot.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={(mismatchDetailsByLot[lot.id]?.trim().length ?? 0) < 5}
                        onClick={() =>
                          setPendingLotAction({
                            type: 'RETURN_MISMATCH',
                            lot,
                            title: `Mismatch Return to Supplier — ${lot.lotNumber}`,
                            summary: `Save the mismatch, block upstream sourcing, and reverse unconsumed stock balances for ${lot.lotNumber}.`,
                          })
                        }
                        className="px-2.5 py-1 rounded bg-buram-critical/15 text-buram-critical border border-buram-critical/40 inline-flex items-center justify-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Return Mismatch</span>
                      </button>
                      </>
                    )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!isStockView && (
        <AttachmentsPanel
          entityType="INCOMING_LOT"
          entityCode={lots[0]?.lotNumber || 'LOT-2026-104'}
          defaultDocType="QSI_CERTIFICATE"
        />
      )}

      <ReasonDialog
        isOpen={Boolean(pendingLotAction)}
        title={pendingLotAction?.title || ''}
        actionSummary={pendingLotAction?.summary || ''}
        isSubmitting={isSavingReceipt || isSavingLotAction}
        onCancel={() => setPendingLotAction(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
};