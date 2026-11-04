import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Lock,
  RefreshCw,
  Recycle,
} from 'lucide-react';
import { BatchPlan, IncomingLot } from '../types/erp';
import {
  CountryOriginBadge,
  FeedbackModal,
  FeedbackModalState,
  KgDisplay,
  ReasonDialog,
  StatusBadge,
} from '../components/ui/IndustrialPrimitives';
import { apiClient } from '../lib/apiClient';

interface CustomerOption {
  _id: string;
  code: string;
  name: string;
  country: string;
  allowedCountries: string[];
  blockedCountries?: string[];
  isActive: boolean;
}

interface HoneyMaterialOption {
  _id: string;
  code: string;
  name: string;
  kind: string;
  unit: 'kg' | 'l' | 'piece';
  isActive: boolean;
}

interface OriginSlice {
  country: string;
  incomingLotId: string;
  sourceDrumId?: string | null;
  sourcePackageId?: string | null;
  sourceReworkId?: string | null;
  kg: number;
  pct: number;
  unitPriceEurPerKg?: number;
  costValueEur?: number;
  costSharePct?: number;
}

interface AvailableReworkOption {
  _id: string;
  reworkNo: string;
  sourceProcessNo: string;
  materialId: string;
  remainingKg: number;
  origin: OriginSlice[];
}

interface FeasibilityResponse {
  canFulfill: boolean;
  shortfallKg: number;
  accumulatedKg: number;
  totalCostValueEur?: number;
  weightedAvgEurPerKg?: number;
  drumsToUse: Array<{
    unitKind: 'DRUM' | 'PACKAGE';
    unitId: string;
    code: string;
    netKg: number;
  }>;
  reworkToUse: Array<{
    reworkId: string;
    reworkNo: string;
    kgToConsume: number;
  }>;
  originComposition: OriginSlice[];
  message: string;
}

interface ReservedBatchResponse {
  _id: string;
  processNo: string;
  plannedKg: number;
  approvedKg: number;
  status: BatchPlan['status'];
  originComposition: OriginSlice[];
  updatedAt: string;
}

interface MaterialStockAvailability {
  materialId: string;
  code: string;
  name: string;
  unit: 'kg';
  availableKg: number;
  availableUnitCount: number;
  quarantineKg: number;
  quarantineUnitCount: number;
  reservedKg: number;
  reservedUnitCount: number;
  shippedKg?: number;
  shippedUnitCount?: number;
  countries: Array<{
    country: string;
    availableKg: number;
    unitCount: number;
  }>;
  lots: Array<{
    incomingLotId: string;
    lotNo: string;
    supplierName: string;
    country: string;
    status: string;
    availableKg: number;
    availableUnitCount: number;
    quarantineKg: number;
    quarantineUnitCount: number;
    shippedKg?: number;
    shippedUnitCount?: number;
  }>;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const BatchPlanningWorkspace: React.FC<{
  lots: IncomingLot[];
  batches: BatchPlan[];
  onBatchReserved: (newBatch: BatchPlan) => void;
}> = ({ lots, batches, onBatchReserved }) => {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [materials, setMaterials] = useState<HoneyMaterialOption[]>([]);
  const [stockByMaterialId, setStockByMaterialId] = useState<
    Record<string, MaterialStockAvailability>
  >({});
  const [availableReworks, setAvailableReworks] = useState<AvailableReworkOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [selectedReworkIds, setSelectedReworkIds] = useState<string[]>([]);
  const [plannedInputKg, setPlannedInputKg] = useState(6000);
  const [targetBufferOutputKg, setTargetBufferOutputKg] = useState(9250);
  const [simulation, setSimulation] = useState<FeasibilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState | null>(null);

  const loadMasterAndRework = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [customerRows, materialRows, reworkRows, stockRowsResult] = await Promise.all([
        apiClient.request<CustomerOption[]>('/master/customers'),
        apiClient.request<HoneyMaterialOption[]>('/master/materials?activeOnly=true&kind=HONEY'),
        apiClient.request<AvailableReworkOption[]>('/batches/rework-available'),
        apiClient
          .request<MaterialStockAvailability[]>('/batches/stock-availability')
          .catch(() => [] as MaterialStockAvailability[]),
      ]);

      const stockMap: Record<string, MaterialStockAvailability> = {};
      for (const row of stockRowsResult) {
        stockMap[row.materialId] = row;
      }

      const activeCustomers = customerRows.filter((item) => item.isActive !== false);
      const activeHoney = materialRows
        .filter((item) => item.isActive !== false && item.kind === 'HONEY' && item.unit === 'kg')
        .sort((a, b) => {
          const aStock = stockMap[a._id]?.availableKg ?? 0;
          const bStock = stockMap[b._id]?.availableKg ?? 0;
          if (bStock !== aStock) return bStock - aStock;
          const aTotal =
            aStock +
            (stockMap[a._id]?.quarantineKg ?? 0) +
            (stockMap[a._id]?.shippedKg ?? 0);
          const bTotal =
            bStock +
            (stockMap[b._id]?.quarantineKg ?? 0) +
            (stockMap[b._id]?.shippedKg ?? 0);
          if (bTotal !== aTotal) return bTotal - aTotal;
          return a.code.localeCompare(b.code);
        });

      setCustomers(activeCustomers);
      setMaterials(activeHoney);
      setStockByMaterialId(stockMap);
      setAvailableReworks(reworkRows);
      setSelectedCustomerId((current) =>
        activeCustomers.some((item) => item._id === current)
          ? current
          : activeCustomers[0]?._id ?? ''
      );
      setSelectedMaterialId((current) => {
        if (activeHoney.some((item) => item._id === current)) {
          return current;
        }
        const firstInStock = activeHoney.find((item) => {
          const s = stockMap[item._id];
          return (
            (s?.availableKg ?? 0) +
              (s?.quarantineKg ?? 0) +
              (s?.shippedKg ?? 0) >
            0
          );
        });
        return firstInStock?._id ?? activeHoney[0]?._id ?? '';
      });
      setSelectedReworkIds((current) =>
        current.filter((id) => reworkRows.some((item) => item._id === id))
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, 'Failed to load customers, kg honey materials, and available rework.')
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMasterAndRework();
  }, [loadMasterAndRework]);

  const selectedCustomer = customers.find((item) => item._id === selectedCustomerId);
  const selectedMaterial = materials.find((item) => item._id === selectedMaterialId);
  const selectedMaterialStock = useMemo<MaterialStockAvailability | null>(() => {
    if (!selectedMaterial) return null;
    const fromServer = stockByMaterialId[selectedMaterial._id];
    if (fromServer) return fromServer;

    // Fallback from incoming lots prop if server stock-availability was empty
    const matchingLots = lots.filter(
      (lot) =>
        (lot.unit ?? 'kg') === 'kg' &&
        (lot.honeyType === selectedMaterial.name || lot.honeyType === selectedMaterial.code)
    );
    let availableKg = 0;
    let availableUnitCount = 0;
    let quarantineKg = 0;
    let quarantineUnitCount = 0;
    const countryMap = new Map<string, { country: string; availableKg: number; unitCount: number }>();
    const lotItems = matchingLots.map((lot) => {
      const isApproved = lot.qualityStatus === 'APPROVED';
      const avail = isApproved ? lot.availableNetKg || lot.totalNetKg : 0;
      const quar = lot.qualityStatus === 'UNDER_REVIEW' ? lot.totalNetKg : 0;
      availableKg += avail;
      if (isApproved && avail > 0) {
        availableUnitCount += lot.packageCount ?? lot.drumCount;
        const prev = countryMap.get(lot.originCountryIso) ?? {
          country: lot.originCountryIso,
          availableKg: 0,
          unitCount: 0,
        };
        prev.availableKg += avail;
        prev.unitCount += lot.packageCount ?? lot.drumCount;
        countryMap.set(lot.originCountryIso, prev);
      }
      if (quar > 0) {
        quarantineKg += quar;
        quarantineUnitCount += lot.packageCount ?? lot.drumCount;
      }
      return {
        incomingLotId: lot.id,
        lotNo: lot.lotNumber,
        supplierName: lot.supplierName,
        country: lot.originCountryIso,
        status: isApproved ? 'PASSED' : lot.qualityStatus,
        availableKg: avail,
        availableUnitCount: isApproved ? lot.packageCount ?? lot.drumCount : 0,
        quarantineKg: quar,
        quarantineUnitCount: quar > 0 ? lot.packageCount ?? lot.drumCount : 0,
      };
    });

    return {
      materialId: selectedMaterial._id,
      code: selectedMaterial.code,
      name: selectedMaterial.name,
      unit: 'kg',
      availableKg,
      availableUnitCount,
      quarantineKg,
      quarantineUnitCount,
      reservedKg: 0,
      reservedUnitCount: 0,
      shippedKg: 0,
      shippedUnitCount: 0,
      countries: [...countryMap.values()],
      lots: lotItems.filter((l) => l.availableKg > 0 || l.quarantineKg > 0),
    };
  }, [lots, selectedMaterial, stockByMaterialId]);

  const matchingReworks = useMemo(
    () => availableReworks.filter((item) => item.materialId === selectedMaterialId),
    [availableReworks, selectedMaterialId]
  );

  const selectedReworkKg = useMemo(
    () =>
      matchingReworks
        .filter((item) => selectedReworkIds.includes(item._id))
        .reduce((sum, item) => sum + item.remainingKg, 0),
    [matchingReworks, selectedReworkIds]
  );

  const totalMaterialAllocatableKg = useMemo(() => {
    if (!selectedMaterialStock) return selectedReworkKg;
    return Number(
      (
        selectedMaterialStock.availableKg +
        selectedMaterialStock.quarantineKg +
        (selectedMaterialStock.shippedKg ?? 0) +
        selectedReworkKg
      ).toFixed(3)
    );
  }, [selectedMaterialStock, selectedReworkKg]);

  useEffect(() => {
    if (totalMaterialAllocatableKg > 0 && plannedInputKg > totalMaterialAllocatableKg) {
      setPlannedInputKg(totalMaterialAllocatableKg);
    }
  }, [selectedMaterialId, totalMaterialAllocatableKg, plannedInputKg]);

  const customerCompatibleStock = useMemo(() => {
    if (!selectedMaterialStock) {
      return { compatibleKg: 0, compatibleUnits: 0 };
    }
    if (!selectedCustomer) {
      return {
        compatibleKg: selectedMaterialStock.availableKg,
        compatibleUnits: selectedMaterialStock.availableUnitCount,
      };
    }
    const allowed = new Set(
      (selectedCustomer.allowedCountries ?? []).map((c) => c.toUpperCase())
    );
    const blocked = new Set(
      (selectedCustomer.blockedCountries ?? []).map((c) => c.toUpperCase())
    );
    let compatibleKg = 0;
    let compatibleUnits = 0;
    for (const c of selectedMaterialStock.countries) {
      const iso = c.country.toUpperCase();
      if ((allowed.size === 0 || allowed.has(iso)) && !blocked.has(iso)) {
        compatibleKg += c.availableKg;
        compatibleUnits += c.unitCount;
      }
    }
    return {
      compatibleKg: Number(compatibleKg.toFixed(3)),
      compatibleUnits,
    };
  }, [selectedCustomer, selectedMaterialStock]);

  const runSimulation = useCallback(async () => {
    if (!selectedCustomerId || !selectedMaterialId || plannedInputKg <= 0) {
      setErrorMessage('Select an active customer and kg honey material and enter a positive target kg.');
      return;
    }
    setIsSimulating(true);
    setErrorMessage(null);
    try {
      const result = await apiClient.request<FeasibilityResponse>(
        '/batches/simulate-feasibility',
        {
          method: 'POST',
          body: JSON.stringify({
            customerId: selectedCustomerId,
            materialId: selectedMaterialId,
            targetKg: plannedInputKg,
            includeReworkIds: selectedReworkIds,
          }),
        }
      );
      setSimulation(result);
    } catch (error) {
      setSimulation(null);
      setErrorMessage(getErrorMessage(error, 'Batch feasibility simulation failed.'));
    } finally {
      setIsSimulating(false);
    }
  }, [plannedInputKg, selectedCustomerId, selectedMaterialId, selectedReworkIds]);

  const toggleRework = (reworkId: string) => {
    setSelectedReworkIds((current) =>
      current.includes(reworkId)
        ? current.filter((id) => id !== reworkId)
        : [...current, reworkId]
    );
    setSimulation(null);
  };

  const handleConfirmReserve = async (reason: string) => {
    if (!simulation?.canFulfill || !selectedCustomer || !selectedMaterialId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const effectiveKg = Number((simulation.accumulatedKg || plannedInputKg).toFixed(3));
      const created = await apiClient.auditedMutation<
        ReservedBatchResponse,
        Record<string, unknown>
      >('/batches/reserve', 'POST', {
        body: {
          customerId: selectedCustomerId,
          materialId: selectedMaterialId,
          plannedKg: effectiveKg,
          includeReworkIds: selectedReworkIds,
        },
        reason,
      });

      onBatchReserved({
        id: created._id,
        batchNumber: created.processNo,
        customerName: selectedCustomer.name,
        allowedOriginCountries: selectedCustomer.allowedCountries,
        plannedInputKg: created.plannedKg,
        targetOutputKg: targetBufferOutputKg,
        selectedDrumCount: simulation.drumsToUse.length,
        originBreakdown: created.originComposition.map((slice) => ({
          countryIso: slice.country,
          kg: slice.kg,
          percentage: slice.pct,
        })),
        flavourProfile: 'Standard Batch Allocation',
        status: created.status,
        createdBy: 'Authenticated Operator',
        updatedAt: created.updatedAt,
      });
      setIsReasonOpen(false);
      setSimulation(null);
      setFeedbackModal({
        isOpen: true,
        variant: 'SUCCESS',
        title: 'Batch Reserved!',
        detailBadge: `${created.processNo} · ${created.plannedKg.toLocaleString()} kg`,
        message: `Batch ${created.processNo} for ${selectedCustomer.name} has been reserved (${simulation.drumsToUse.length} package(s)${simulation.reworkToUse.length > 0 ? ` + ${simulation.reworkToUse.length} rework` : ''}). Ready for Warm Cabinet check-in.`,
      });
      await loadMasterAndRework();
    } catch (error) {
      const errMsg = getErrorMessage(error, 'Atomic batch reservation failed on the server.');
      setErrorMessage(errMsg);
      setFeedbackModal({
        isOpen: true,
        variant: 'ERROR',
        title: 'Batch Reservation Failed',
        message: errMsg,
      });
      setIsReasonOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-buram-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6 text-buram-amber" />
          <div>
            <span className="block text-[11px] font-mono uppercase tracking-widest text-buram-amber">
              BATCH PLANNING
            </span>
            <h1 className="text-xl font-bold text-buram-text">
              Batch Feasibility &amp; Blending
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadMasterAndRework()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded border border-buram-border bg-buram-elevated px-3 py-2 text-xs font-mono text-buram-text hover:border-buram-amber disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Sync Stock &amp; Rework
        </button>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded border border-buram-critical/50 bg-buram-critical/15 p-3 text-xs font-mono text-buram-critical"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel">
        <div className="grid grid-cols-1 items-end gap-3 font-mono text-xs md:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="uppercase text-buram-muted">Customer / Country Policy</span>
            <select
              value={selectedCustomerId}
              onChange={(event) => {
                setSelectedCustomerId(event.target.value);
                setSimulation(null);
              }}
              disabled={isLoading}
              className="rounded border border-buram-border bg-buram-bg px-3 py-2 text-buram-text"
            >
              <option value="">Select customer...</option>
              {customers.map((customer) => (
                <option key={customer._id} value={customer._id}>
                  {customer.name} [{customer.allowedCountries.join(', ')}]
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="uppercase text-buram-muted">
              Honey Material (kg)
            </span>
            <select
              value={selectedMaterialId}
              onChange={(event) => {
                setSelectedMaterialId(event.target.value);
                setSelectedReworkIds([]);
                setSimulation(null);
              }}
              disabled={isLoading}
              className="rounded border border-buram-border bg-buram-bg px-3 py-2 font-bold text-buram-gold"
            >
              <option value="">Select kg honey material...</option>
              {materials.map((material) => {
                const stock = stockByMaterialId[material._id];
                const availKg = stock?.availableKg ?? 0;
                const quarKg = stock?.quarantineKg ?? 0;
                const shipKg = stock?.shippedKg ?? 0;
                const origins =
                  stock?.countries.map((c) => c.country).join(', ') || '';
                const stockLabel =
                  availKg > 0
                    ? `${availKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg (${stock?.availableUnitCount ?? 0} pkg${origins ? ` · ${origins}` : ''})`
                    : quarKg > 0
                      ? `${quarKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg in QA Quarantine (${stock?.quarantineUnitCount ?? 0} pkg)`
                      : shipKg > 0
                        ? `${shipKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg Shipped (${stock?.shippedUnitCount ?? 0} pkg)`
                        : '0 kg in stock';
                return (
                  <option key={material._id} value={material._id}>
                    {material.code} — {material.name} [{stockLabel}]
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="uppercase text-buram-muted">Planned Input (kg)</span>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={plannedInputKg}
              onChange={(event) => {
                setPlannedInputKg(Number(event.target.value));
                setSimulation(null);
              }}
              className="rounded border border-buram-border bg-buram-bg px-3 py-2 font-bold tabular-nums text-buram-tech"
            />
          </label>

          <button
            type="button"
            disabled={isLoading || isSimulating || !selectedCustomerId || !selectedMaterialId}
            onClick={() => void runSimulation()}
            className="rounded bg-buram-tech px-4 py-2 font-bold uppercase text-buram-bg hover:opacity-90 disabled:opacity-40"
          >
            {isSimulating ? 'Simulating...' : 'Run Server Feasibility'}
          </button>
        </div>

        {selectedMaterial && selectedMaterialStock && (
          <div className="rounded border border-buram-border bg-buram-bg/70 p-3.5 font-mono text-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-buram-border/60 pb-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase text-[11px] tracking-wider text-buram-amber font-bold">
                  Available Stock · {selectedMaterial.code} ({selectedMaterial.name})
                </span>
                <StatusBadge
                  label={
                    selectedMaterialStock.availableKg > 0
                      ? `${selectedMaterialStock.availableKg.toFixed(3)} KG APPROVED (${selectedMaterialStock.availableUnitCount} UNITS)`
                      : '0 KG APPROVED IN WAREHOUSE'
                  }
                  variant={selectedMaterialStock.availableKg > 0 ? 'NOMINAL' : 'AMBER'}
                />
                {selectedCustomer && (
                  <StatusBadge
                    label={`CUSTOMER COMPATIBLE: ${customerCompatibleStock.compatibleKg.toFixed(3)} KG (${customerCompatibleStock.compatibleUnits} UNITS)`}
                    variant={customerCompatibleStock.compatibleKg > 0 ? 'TECHNICAL' : 'AMBER'}
                  />
                )}
                {selectedMaterialStock.quarantineKg > 0 && (
                  <StatusBadge
                    label={`QA QUARANTINE: ${selectedMaterialStock.quarantineKg.toFixed(3)} KG (${selectedMaterialStock.quarantineUnitCount} UNITS)`}
                    variant="AMBER"
                  />
                )}
                {(selectedMaterialStock.shippedKg ?? 0) > 0 && (
                  <StatusBadge
                    label={`SHIPPED CONTRACT: ${(selectedMaterialStock.shippedKg ?? 0).toFixed(3)} KG (${selectedMaterialStock.shippedUnitCount ?? 0} UNITS)`}
                    variant="TECHNICAL"
                  />
                )}
              </div>
              {totalMaterialAllocatableKg > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPlannedInputKg(totalMaterialAllocatableKg);
                    setSimulation(null);
                  }}
                  className="rounded border border-buram-tech/60 bg-buram-tech/15 px-2.5 py-1 text-[11px] font-bold text-buram-tech hover:bg-buram-tech/25"
                >
                  Use Available Stock ({totalMaterialAllocatableKg.toFixed(3)} kg)
                </button>
              )}
            </div>

            {selectedMaterialStock.lots.length === 0 ? (
              <p className="text-buram-muted text-[11px]">
                No shipped/received lots in Warehouse or Quarantine for {selectedMaterial.code}. Receive a shipped contract lot in Incoming &amp; QA and pass QA review to allocate stock here.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectedMaterialStock.lots.map((lot) => {
                  const lotKg =
                    lot.availableKg > 0
                      ? lot.availableKg
                      : lot.quarantineKg > 0
                        ? lot.quarantineKg
                        : lot.shippedKg ?? 0;
                  const lotUnits =
                    lot.availableKg > 0
                      ? lot.availableUnitCount
                      : lot.quarantineKg > 0
                        ? lot.quarantineUnitCount
                        : lot.shippedUnitCount ?? 0;
                  const badgeLabel =
                    lot.availableKg > 0
                      ? 'APPROVED'
                      : lot.quarantineKg > 0
                        ? 'QUARANTINE'
                        : 'SHIPPED';
                  const badgeVariant =
                    lot.availableKg > 0
                      ? 'NOMINAL'
                      : lot.quarantineKg > 0
                        ? 'AMBER'
                        : 'TECHNICAL';
                  return (
                    <div
                      key={lot.incomingLotId}
                      className="flex items-center justify-between gap-2 rounded border border-buram-border bg-buram-surface px-3 py-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-buram-gold">{lot.lotNo}</strong>
                          <CountryOriginBadge countryIso={lot.country} />
                          <StatusBadge label={badgeLabel} variant={badgeVariant} />
                        </div>
                        <span className="block text-[10px] text-buram-muted">
                          {lot.supplierName} · {lotUnits} units
                        </span>
                      </div>
                      <div className="text-right">
                        <KgDisplay kg={lotKg} size="sm" />
                        {lotKg > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPlannedInputKg(Number(lotKg.toFixed(3)));
                              setSimulation(null);
                            }}
                            className="mt-1 block ml-auto text-[10px] text-buram-tech hover:underline"
                          >
                            Use lot kg
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <label className="block max-w-xs font-mono text-xs">
          <span className="mb-1 block uppercase text-buram-muted">Target Output Buffer (kg)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={targetBufferOutputKg}
            onChange={(event) => setTargetBufferOutputKg(Number(event.target.value))}
            className="w-full rounded border border-buram-border bg-buram-bg px-3 py-2 font-bold text-buram-gold"
          />
        </label>

        <div className="border-t border-buram-border pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-mono uppercase text-buram-gold">
              <Recycle className="h-4 w-4 text-buram-amber" />
              Optional available rework to blend first
            </span>
            <span className="text-[11px] font-mono text-buram-muted">
              {selectedReworkIds.length} selected
            </span>
          </div>
          {matchingReworks.length === 0 ? (
            <p className="text-xs font-mono text-buram-muted">
              {isLoading ? 'Loading available rework...' : 'No available rework for this material.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {matchingReworks.map((rework) => (
                <label
                  key={rework._id}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded border p-3 font-mono text-xs ${
                    selectedReworkIds.includes(rework._id)
                      ? 'border-buram-amber bg-buram-amber/15 text-buram-text'
                      : 'border-buram-border bg-buram-bg/80 text-buram-muted hover:border-buram-amber/40'
                  }`}
                >
                  <div className="space-y-1">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedReworkIds.includes(rework._id)}
                        onChange={() => toggleRework(rework._id)}
                      />
                      <strong className="text-buram-gold">{rework.reworkNo}</strong>
                      <span>from {rework.sourceProcessNo}</span>
                    </span>
                    <span className="block text-[10px]">
                      {rework.origin.map((slice) => `${slice.country} ${slice.pct.toFixed(3)}%`).join(' · ')}
                    </span>
                  </div>
                  <KgDisplay kg={rework.remainingKg} size="sm" />
                </label>
              ))}
            </div>
          )}
        </div>
      </section>

      {simulation && (
        <section
          className={`space-y-4 rounded-lg border p-5 font-mono text-xs shadow-panel ${
            simulation.canFulfill
              ? 'border-buram-success/60 bg-buram-surface'
              : 'border-buram-critical/60 bg-buram-surface'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-buram-border pb-3">
            <div className="flex items-center gap-2">
              {simulation.canFulfill ? (
                <CheckCircle2 className="h-4 w-4 text-buram-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-buram-critical" />
              )}
              <strong className="text-sm text-buram-text">{simulation.message}</strong>
            </div>
            <div className="flex items-center gap-3">
              {selectedCustomer && (
                <span className="text-buram-muted">
                  Allowed: [{selectedCustomer.allowedCountries.join(', ')}]
                </span>
              )}
              {simulation.weightedAvgEurPerKg !== undefined && (
                <StatusBadge
                  label={`BLENDED COST €${simulation.weightedAvgEurPerKg.toFixed(2)}/KG · TOTAL €${(
                    simulation.totalCostValueEur ?? 0
                  ).toFixed(2)}`}
                  variant="AMBER"
                />
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-buram-border text-[11px] uppercase text-buram-muted">
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Origin</th>
                  <th className="px-3 py-2 text-right">Weight (kg)</th>
                  <th className="px-3 py-2 text-right">Weight Share (%)</th>
                  {simulation.originComposition.some((slice) => slice.unitPriceEurPerKg !== undefined) && (
                    <>
                      <th className="px-3 py-2 text-right">Price (€/kg)</th>
                      <th className="px-3 py-2 text-right">Value (€)</th>
                      <th className="px-3 py-2 text-right">Cost Share (%)</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-buram-border/40">
                {simulation.originComposition.map((slice, index) => (
                  <tr key={`${slice.incomingLotId}-${slice.sourceReworkId ?? index}`}>
                    <td className="px-3 py-2">
                      <StatusBadge
                        label={slice.sourceReworkId ? 'REWORK' : slice.sourcePackageId ? 'PACKAGE' : 'DRUM'}
                        variant={slice.sourceReworkId ? 'AMBER' : 'TECHNICAL'}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <CountryOriginBadge countryIso={slice.country} />
                    </td>
                    <td className="px-3 py-2 text-right">{slice.kg.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-bold text-buram-gold">
                      {slice.pct.toFixed(3)}%
                    </td>
                    {slice.unitPriceEurPerKg !== undefined && (
                      <>
                        <td className="px-3 py-2 text-right">€{slice.unitPriceEurPerKg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-buram-success">
                          €{(slice.costValueEur ?? 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-buram-tech">
                          {(slice.costSharePct ?? 0).toFixed(3)}%
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!simulation.canFulfill || isSubmitting}
              onClick={() => setIsReasonOpen(true)}
              className="inline-flex items-center gap-2 rounded bg-buram-amber px-4 py-2 font-bold uppercase text-buram-bg hover:bg-buram-gold disabled:opacity-40"
            >
              <Lock className="h-3.5 w-3.5" />
              Reserve {simulation.drumsToUse.length} packages + {simulation.reworkToUse.length} rework
            </button>
          </div>
        </section>
      )}

      <ReasonDialog
        isOpen={isReasonOpen}
        title="Approve and Reserve Blended Batch"
        actionSummary={`Consume ${simulation?.reworkToUse.length ?? 0} selected rework lot(s) and reserve ${simulation?.drumsToUse.length ?? 0} stock package(s) for ${simulation?.accumulatedKg ?? plannedInputKg} kg.`}
        isSubmitting={isSubmitting}
        onCancel={() => setIsReasonOpen(false)}
        onConfirm={handleConfirmReserve}
      />
      <FeedbackModal
        state={feedbackModal}
        onClose={() => setFeedbackModal(null)}
      />
      <span className="sr-only">{batches.length} existing batches</span>
    </div>
  );
};
