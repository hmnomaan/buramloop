import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, Truck } from 'lucide-react';
import {
  StatusBadge,
  KgDisplay,
  CountryOriginBadge,
  ReasonDialog,
} from '../components/ui/IndustrialPrimitives';
import { apiClient } from '../lib/apiClient';

type ShipmentStatus = 'DRAFT' | 'QA_HOLD' | 'RELEASED' | 'SHIPPED' | 'VOID';

interface ShipmentItem {
  skuCode: string;
  productName: string;
  packagingType: string;
  fillLine: string;
  unitWeightGrams: number;
  unitsCount: number;
  netKg: number;
  palletsCount: number;
}

export interface ShipmentLotRecord {
  _id: string;
  shipmentLotNo: string;
  processNo: string;
  customerId: { name?: string } | string;
  destinationCountry: string;
  allowedCountriesSnapshot: string[];
  originComposition: Array<{ country: string; pct: number }>;
  orderedKg: number;
  shippedKg: number;
  bestBeforeDate: string;
  carrierName?: string;
  deliveryNoteNo?: string;
  status: ShipmentStatus;
  items: ShipmentItem[];
}

interface CompletedBatch {
  _id: string;
  processNo: string;
  status: string;
  actualOutKg?: number;
  originComposition: Array<{ country: string; pct: number }>;
}

interface CustomerOption {
  _id: string;
  name: string;
  allowedCountries: string[];
  blockedCountries: string[];
  isActive: boolean;
}

export const ShipmentLotsWorkspace: React.FC<{
  shipmentLots: ShipmentLotRecord[];
  onDataLoaded: (lots: ShipmentLotRecord[]) => void;
}> = ({ shipmentLots, onDataLoaded }) => {
  const [lots, setLots] = useState(shipmentLots);
  const [batches, setBatches] = useState<CompletedBatch[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'create' }
    | { kind: 'transition'; lotId: string; lotNo: string; targetStatus: ShipmentStatus }
    | null
  >(null);

  const [batchId, setBatchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [orderedKg, setOrderedKg] = useState(0);
  const [skuCode, setSkuCode] = useState('');
  const [productName, setProductName] = useState('');
  const [packagingType, setPackagingType] = useState('PET_SQUEEZE');
  const [fillLine, setFillLine] = useState('QUIEL_PET');
  const [unitWeightGrams, setUnitWeightGrams] = useState(500);
  const [unitsCount, setUnitsCount] = useState(1);
  const [palletsCount, setPalletsCount] = useState(0);
  const [bestBeforeDate, setBestBeforeDate] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');

  const activeCustomer = customers.find((customer) => customer._id === customerId);
  const selectedBatch = batches.find((batch) => batch._id === batchId);
  const itemNetKg = useMemo(
    () => Number(((unitWeightGrams * unitsCount) / 1000).toFixed(3)),
    [unitWeightGrams, unitsCount]
  );
  const originViolation = Boolean(
    activeCustomer &&
      selectedBatch?.originComposition.some(
        (origin) =>
          !activeCustomer.allowedCountries.includes(origin.country) ||
          activeCustomer.blockedCountries.includes(origin.country)
      )
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [lotsData, processData, customerData] = await Promise.all([
        apiClient.request<ShipmentLotRecord[]>('/shipments'),
        apiClient.request<CompletedBatch[]>('/production/process'),
        apiClient.request<CustomerOption[]>('/master/customers'),
      ]);
      const nextLots = Array.isArray(lotsData) ? lotsData : [];
      setLots(nextLots);
      onDataLoaded(nextLots);
      setBatches(
        (Array.isArray(processData) ? processData : []).filter(
          (batch) => batch.status === 'DONE'
        )
      );
      setCustomers(
        (Array.isArray(customerData) ? customerData : []).filter(
          (customer) => customer.isActive
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load shipment, batch, and customer data.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [onDataLoaded]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setLots(shipmentLots);
  }, [shipmentLots]);

  const resetForm = () => {
    setBatchId('');
    setCustomerId('');
    setDestinationCountry('');
    setOrderedKg(0);
    setSkuCode('');
    setProductName('');
    setPackagingType('PET_SQUEEZE');
    setFillLine('QUIEL_PET');
    setUnitWeightGrams(500);
    setUnitsCount(1);
    setPalletsCount(0);
    setBestBeforeDate('');
    setCarrierName('');
    setDeliveryNoteNo('');
  };

  const handleConfirm = async (reason: string) => {
    if (!pendingAction) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      if (pendingAction.kind === 'create') {
        if (!selectedBatch || !activeCustomer) {
          throw new Error('Select a completed batch and an active customer before creating a shipment.');
        }
        await apiClient.auditedMutation('/shipments', 'POST', {
          body: {
            batchId: selectedBatch._id,
            processNo: selectedBatch.processNo,
            customerId: activeCustomer._id,
            destinationCountry,
            orderedKg,
            shippedKg: 0,
            items: [
              {
                skuCode,
                productName,
                packagingType,
                fillLine,
                unitWeightGrams,
                unitsCount,
                netKg: itemNetKg,
                palletsCount,
              },
            ],
            bestBeforeDate,
            carrierName: carrierName || undefined,
            deliveryNoteNo: deliveryNoteNo || undefined,
          },
          reason,
        });
        resetForm();
      } else {
        await apiClient.auditedMutation(
          `/shipments/${pendingAction.lotId}/status`,
          'POST',
          { body: { targetStatus: pendingAction.targetStatus }, reason }
        );
      }
      setPendingAction(null);
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The shipment operation was rejected by the server.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTransition = (
    lot: ShipmentLotRecord,
    targetStatus: ShipmentStatus
  ) => setPendingAction({ kind: 'transition', lotId: lot._id, lotNo: lot.shipmentLotNo, targetStatus });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-buram-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-buram-amber uppercase tracking-widest">
            <Truck className="w-4 h-4" />
            <span>OUTBOUND</span>
          </div>
          <h1 className="text-2xl font-bold text-buram-text mt-1">
            Shipment Lots
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={isLoading}
          aria-label="Refresh shipments"
          className="p-2 rounded border border-buram-border text-buram-text"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {errorMessage && (
        <div role="alert" className="flex items-center gap-2 rounded border border-buram-critical/50 bg-buram-critical/10 p-3 text-sm text-buram-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPendingAction({ kind: 'create' });
        }}
        className="rounded-lg border border-buram-border bg-buram-surface p-5 space-y-4"
      >
        <h2 className="font-semibold text-buram-text">Create shipment lot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <label className="flex flex-col gap-1">
            <span>Completed batch *</span>
            <select required value={batchId} onChange={(event) => setBatchId(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text">
              <option value="">Select batch</option>
              {batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.processNo} — {batch.actualOutKg ?? 0} kg</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Customer *</span>
            <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text">
              <option value="">Select customer</option>
              {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Destination country *</span>
            <input required minLength={2} maxLength={2} value={destinationCountry} onChange={(event) => setDestinationCountry(event.target.value.toUpperCase())} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Ordered kg *</span>
            <input required type="number" min="0.001" step="0.001" value={orderedKg || ''} onChange={(event) => setOrderedKg(Number(event.target.value))} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>SKU *</span>
            <input required value={skuCode} onChange={(event) => setSkuCode(event.target.value.toUpperCase())} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Product name *</span>
            <input required value={productName} onChange={(event) => setProductName(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Packaging *</span>
            <select value={packagingType} onChange={(event) => setPackagingType(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text">
              {['PET_SQUEEZE', 'GLASS_JAR', 'CLAMP_JAR', 'CLUB_BOTTLE', 'PAIL_BUCKET', 'BULK_DRUM_290KG', 'OTHER'].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Fill line *</span>
            <select value={fillLine} onChange={(event) => setFillLine(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text">
              {['QUIEL_PET', 'CARLO_JAR', 'HAND'].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Unit weight (g) *</span>
            <input required type="number" min="1" step="1" value={unitWeightGrams} onChange={(event) => setUnitWeightGrams(Number(event.target.value))} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Units *</span>
            <input required type="number" min="1" step="1" value={unitsCount} onChange={(event) => setUnitsCount(Number(event.target.value))} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Pallets</span>
            <input type="number" min="0" step="1" value={palletsCount} onChange={(event) => setPalletsCount(Number(event.target.value))} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Best before date *</span>
            <input required type="date" value={bestBeforeDate} onChange={(event) => setBestBeforeDate(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Carrier</span>
            <input value={carrierName} onChange={(event) => setCarrierName(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
          <label className="flex flex-col gap-1">
            <span>Delivery note</span>
            <input value={deliveryNoteNo} onChange={(event) => setDeliveryNoteNo(event.target.value)} className="bg-buram-bg border border-buram-border rounded px-2 py-2 text-buram-text" />
          </label>
        </div>
        <div className={`text-xs font-mono ${originViolation ? 'text-buram-critical' : 'text-buram-muted'}`}>
          Calculated packaged net weight: {itemNetKg} kg. Batch origins:{' '}
          {selectedBatch?.originComposition.map((origin) => `${origin.country} ${origin.pct}%`).join(', ') || 'select a batch'}.
          {originViolation && ' Customer country rules block this batch.'}
        </div>
        <button
          type="submit"
          disabled={isLoading || isSubmitting || originViolation || !selectedBatch || !activeCustomer || !bestBeforeDate || !orderedKg || !skuCode.trim() || !productName.trim() || itemNetKg <= 0}
          className="rounded bg-buram-amber px-4 py-2 text-xs font-bold uppercase text-buram-ink disabled:opacity-50"
        >
          Create shipment lot
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4">
        {lots.map((lot) => {
          const customerName = typeof lot.customerId === 'string' ? lot.customerId : lot.customerId?.name ?? 'Unknown customer';
          const allOriginsCompliant = lot.originComposition.every((origin) =>
            lot.allowedCountriesSnapshot.includes(origin.country)
          );
          return (
            <section key={lot._id} className="rounded-lg border border-buram-border bg-buram-surface p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 font-mono">
                  <strong className="text-buram-gold">{lot.shipmentLotNo}</strong>
                  <span className="text-buram-tech">Batch: {lot.processNo}</span>
                  <StatusBadge label={lot.status} variant={lot.status === 'RELEASED' || lot.status === 'SHIPPED' ? 'NOMINAL' : lot.status === 'QA_HOLD' ? 'WARNING' : 'AMBER'} />
                  <StatusBadge label={allOriginsCompliant ? `R8 PASS (${lot.allowedCountriesSnapshot.join(', ')})` : 'COUNTRY MISMATCH'} variant={allOriginsCompliant ? 'NOMINAL' : 'CRITICAL'} />
                </div>
                <div className="text-sm text-buram-text">Customer: <strong>{customerName}</strong> • Destination: {lot.destinationCountry}</div>
                <div className="flex flex-wrap gap-4 text-xs font-mono text-buram-muted">
                  <span>Ordered: <KgDisplay kg={lot.orderedKg} /></span>
                  <span>Shipped: <KgDisplay kg={lot.shippedKg} /></span>
                  <span>Best before: {new Date(lot.bestBeforeDate).toLocaleDateString()}</span>
                  {lot.items.map((item) => <span key={item.skuCode}>{item.skuCode}: {item.unitsCount} × {item.unitWeightGrams} g ({item.netKg} kg)</span>)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {lot.originComposition.map((origin, index) => (
                    <CountryOriginBadge key={`${origin.country}-${index}`} countryIso={origin.country} percentage={origin.pct} restricted={!lot.allowedCountriesSnapshot.includes(origin.country)} />
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {(lot.status === 'DRAFT' || lot.status === 'QA_HOLD') && (
                  <button type="button" onClick={() => openTransition(lot, 'RELEASED')} className="rounded bg-buram-success px-3 py-2 text-xs font-bold uppercase text-buram-ink">Release</button>
                )}
                {(lot.status === 'DRAFT' || lot.status === 'RELEASED') && (
                  <button type="button" onClick={() => openTransition(lot, 'QA_HOLD')} className="rounded border border-buram-warning/40 bg-buram-warning/10 px-3 py-2 text-xs uppercase text-buram-warning">QA hold</button>
                )}
                {lot.status === 'RELEASED' && (
                  <button type="button" onClick={() => openTransition(lot, 'SHIPPED')} className="rounded bg-buram-amber px-3 py-2 text-xs font-bold uppercase text-buram-ink">Mark shipped</button>
                )}
                {lot.status !== 'VOID' && (
                  <button type="button" onClick={() => openTransition(lot, 'VOID')} className="rounded border border-buram-critical/40 px-3 py-2 text-xs uppercase text-buram-critical">Void</button>
                )}
              </div>
            </section>
          );
        })}
        {!isLoading && lots.length === 0 && (
          <p className="rounded border border-buram-border p-6 text-center text-sm text-buram-muted">No shipment lots were returned by the server.</p>
        )}
      </div>

      <ReasonDialog
        isOpen={Boolean(pendingAction)}
        title={pendingAction?.kind === 'create' ? 'Create audited shipment lot' : `Transition ${pendingAction?.lotNo} to ${pendingAction?.targetStatus}`}
        actionSummary={pendingAction?.kind === 'create' ? 'Creates a shipment lot from the selected completed batch and customer.' : `Updates Shipment LOT ${pendingAction?.lotNo} using the server shipment state machine.`}
        isSubmitting={isSubmitting}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
};
