import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Truck, Users } from 'lucide-react';
import {
  SOURCING_GATES,
  SOURCING_GATE_PERMISSIONS,
  type SampleRoutingMode,
} from '../../../shared/src/schemas/purchase';
import { UserSession } from '../types/erp';
import {
  CountryOriginBadge,
  ReasonDialog,
  StatusBadge,
} from '../components/ui/IndustrialPrimitives';
import { AttachmentsPanel, ExportMenu } from '../components/ui/CrossCuttingPanels';
import { apiClient } from '../lib/apiClient';

type Supplier = {
  _id: string;
  code: string;
  name: string;
  country: string;
  regionCity?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  honeyVarieties: string[];
  certifications: string[];
  leadStatus: 'LEAD' | 'ACTIVE_PARTNER' | 'ON_HOLD';
  isActive: boolean;
  offersCount?: number;
  passedOffersCount?: number;
  rejectedOffersCount?: number;
  latestPriceEurPerKg?: number | null;
};

type Material = {
  _id: string;
  code: string;
  name: string;
  unit: 'kg' | 'l' | 'piece';
  isActive: boolean;
};

type SourcingRecord = {
  _id: string;
  sourcingNo: string;
  supplierId: string | { _id: string; name: string; code?: string };
  materialId: string | { _id: string; name: string; code?: string };
  country: string;
  offeredKg: number;
  offeredDrums: number;
  packageType?: string;
  stage: string;
  status: string;
  offer?: {
    unitWeightKg?: number;
    unitPriceEurPerKg?: number;
    landedUnitPriceEurPerKg?: number;
  };
  contract?: {
    _id: string;
    contractNo: string;
    status: string;
  } | null;
};

type PendingAction =
  | { type: 'lead' }
  | { type: 'offer' }
  | { type: 'lead-status'; supplierId: string; leadStatus: Supplier['leadStatus'] }
  | { type: 'gate'; sourcingId: string; decision: 'APPROVED' | 'REJECTED' }
  | { type: 'contract'; sourcingId: string }
  | { type: 'ship'; contractId: string };

const fieldClass =
  'w-full rounded border border-buram-border bg-buram-bg px-3 py-2 text-sm text-buram-text outline-none focus:border-buram-amber';
const labelClass = 'mb-1 block text-xs font-mono uppercase tracking-wide text-buram-muted';
const buttonClass =
  'rounded border border-buram-border px-3 py-2 text-xs font-mono uppercase text-buram-text hover:border-buram-amber disabled:cursor-not-allowed disabled:opacity-50';
const today = () => new Date().toISOString().slice(0, 10);
const splitList = (value: string) =>
  value.split(',').map((item) => item.trim()).filter(Boolean);

const recordName = (value: string | { name: string }) =>
  typeof value === 'string' ? value : value.name;

const currentGate = (record: SourcingRecord) =>
  record.stage === 'OFFER' ? 'PRICE_OFFER' : record.stage;

export const SourcingWorkspace: React.FC<{ user: UserSession }> = ({ user }) => {
  const [leads, setLeads] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [records, setRecords] = useState<SourcingRecord[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [leadForm, setLeadForm] = useState({
    code: '',
    name: '',
    country: '',
    regionCity: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    honeyVarieties: '',
    certifications: '',
    leadStatus: 'LEAD' as Supplier['leadStatus'],
    notes: '',
  });
  const [offerForm, setOfferForm] = useState({
    supplierId: '',
    materialId: '',
    country: '',
    packageType: 'DRUM',
    massInputUnit: 'ton' as 'kg' | 'ton',
    offeredInputWeight: '',
    offeredPackages: '',
    priceBasis: 'PER_KG' as 'PER_KG' | 'PER_TON' | 'TOTAL_OFFER',
    inputPriceEur: '',
    transportCostEur: '',
    offerRef: '',
    offerNotes: '',
  });
  const [externalForm, setExternalForm] = useState({
    labName: '',
    reportNo: '',
    reportDate: today(),
    locationAcceptable: true,
    priceAcceptable: true,
    marketDemandFit: 'HIGH' as 'HIGH' | 'MEDIUM' | 'LOW',
    transportCostEur: '',
    qualityAcceptable: true,
    parametersSummary: '',
    managementNotes: '',
  });
  const [sampleForm, setSampleForm] = useState({
    sampleCode: '',
    routingMode: 'REQUESTED_FROM_SUPPLIER' as SampleRoutingMode,
    qsiTrackingRef: '',
    receivedAt: today(),
    weightGrams: '',
    notes: '',
  });
  const [qsiForm, setQsiForm] = useState({
    inhouseSensoryPass: true,
    sensoryNotes: '',
    qsiReportNo: '',
    qsiReportPublishedAt: today(),
    qsiPass: true,
  });

  const canViewPrices = user.role === 'ADMIN' || user.role === 'MANAGEMENT';
  const canWriteSourcing =
    canViewPrices || user.permissions.includes('sourcing:write');
  const canManageLeads =
    canWriteSourcing || user.permissions.includes('master:write');
  const canCreateContracts =
    canWriteSourcing ||
    user.permissions.includes('contracts:write') ||
    user.permissions.includes('management:approve');

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [leadRows, sourcingRows, materialRows] = await Promise.all([
        apiClient.request<Supplier[]>('/sourcings/leads'),
        apiClient.request<SourcingRecord[]>('/sourcings'),
        apiClient.request<Material[]>('/master/materials'),
      ]);
      setLeads(leadRows);
      setRecords(sourcingRows);
      setMaterials(materialRows.filter((material) => material.isActive));
      setSelectedId((previous) =>
        sourcingRows.some((record) => record._id === previous)
          ? previous
          : sourcingRows[0]?._id ?? ''
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sourcing data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const filteredLeads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return leads;
    return leads.filter((lead) =>
      [lead.name, lead.code, lead.country, lead.regionCity ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [leads, search]);

  const selectedRecord = records.find((record) => record._id === selectedId);
  const gate = selectedRecord ? currentGate(selectedRecord) : '';
  const isKnownGate = SOURCING_GATES.some((item) => item === gate);
  const canApproveGate =
    user.role === 'ADMIN' ||
    (isKnownGate &&
      user.permissions.includes(
        SOURCING_GATE_PERMISSIONS[gate as (typeof SOURCING_GATES)[number]]
      ));

  const submitPendingAction = async (reason: string) => {
    if (!pendingAction) return;
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      switch (pendingAction.type) {
        case 'lead':
          await apiClient.auditedMutation<Supplier, Record<string, unknown>>(
            '/sourcings/leads',
            'POST',
            {
              body: {
                ...leadForm,
                code: leadForm.code.trim() || undefined,
                honeyVarieties: splitList(leadForm.honeyVarieties),
                certifications: splitList(leadForm.certifications),
              },
              reason,
            }
          );
          setMessage('Supplier lead saved.');
          break;
        case 'offer': {
          const selectedSupplier = leads.find(
            (supplier) => supplier._id === offerForm.supplierId
          );
          await apiClient.auditedMutation<SourcingRecord, Record<string, unknown>>(
            '/sourcings',
            'POST',
            {
              body: {
                supplierId: offerForm.supplierId,
                materialId: offerForm.materialId,
                country: offerForm.country.toUpperCase(),
                packageType: offerForm.packageType,
                massInputUnit: offerForm.massInputUnit,
                offeredInputWeight: Number(offerForm.offeredInputWeight),
                offeredDrums: Number(offerForm.offeredPackages),
                priceBasis: offerForm.priceBasis,
                ...(canViewPrices
                  ? {
                      inputPriceEur: Number(offerForm.inputPriceEur || 0),
                      transportCostEur: Number(offerForm.transportCostEur || 0),
                    }
                  : {}),
                offerRef: offerForm.offerRef,
                offerNotes: offerForm.offerNotes,
                saveAsFutureLead: true,
              },
              reason,
            }
          );
          setMessage(
            `Offer recorded${selectedSupplier ? ` for ${selectedSupplier.name}` : ''}.`
          );
          break;
        }
        case 'lead-status':
          await apiClient.auditedMutation<Supplier, Record<string, unknown>>(
            `/sourcings/leads/${pendingAction.supplierId}/status`,
            'PATCH',
            { body: { leadStatus: pendingAction.leadStatus }, reason }
          );
          setMessage('Supplier lead status updated.');
          break;
        case 'gate': {
          const record = records.find(
            (item) => item._id === pendingAction.sourcingId
          );
          if (!record) throw new Error('The sourcing record is no longer available.');
          const payload: Record<string, unknown> = {
            gate: currentGate(record),
            decision: pendingAction.decision,
          };
          if (pendingAction.decision === 'APPROVED') {
            if (currentGate(record) === 'EXTERNAL_ANALYSIS') {
              payload.externalAnalysis = {
                ...externalForm,
                reportDate: new Date(`${externalForm.reportDate}T00:00:00.000Z`).toISOString(),
                transportCostEur: Number(externalForm.transportCostEur),
              };
            } else if (currentGate(record) === 'SAMPLE') {
              const { weightGrams, ...sampleDetails } = sampleForm;
              payload.sample = {
                ...sampleDetails,
                receivedAt: new Date(`${sampleForm.receivedAt}T00:00:00.000Z`).toISOString(),
                ...(weightGrams.trim()
                  ? { weightGrams: Number(weightGrams) }
                  : {}),
              };
            } else if (currentGate(record) === 'INHOUSE_QSI') {
              payload.inhouseQsi = {
                ...qsiForm,
                qsiReportPublishedAt: new Date(
                  `${qsiForm.qsiReportPublishedAt}T00:00:00.000Z`
                ).toISOString(),
              };
            }
          }
          await apiClient.auditedMutation<SourcingRecord, Record<string, unknown>>(
            `/sourcings/${record._id}/gates`,
            'POST',
            { body: payload, reason }
          );
          setMessage(`Gate ${currentGate(record)} ${pendingAction.decision.toLowerCase()}.`);
          break;
        }
        case 'contract':
          await apiClient.auditedMutation<unknown, Record<string, unknown>>(
            `/sourcings/${pendingAction.sourcingId}/contracts`,
            'POST',
            { body: { deliveryTerms: 'DAP Hennigsdorf' }, reason }
          );
          setMessage('Purchase contract created.');
          break;
        case 'ship':
          await apiClient.auditedMutation<unknown, Record<string, unknown>>(
            `/sourcings/contracts/${pendingAction.contractId}/ship`,
            'POST',
            { body: {}, reason }
          );
          setMessage('Contract marked as shipped.');
          break;
      }
      setPendingAction(null);
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The sourcing action failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateLeadStatus = (
    supplierId: string,
    leadStatus: Supplier['leadStatus']
  ) => setPendingAction({ type: 'lead-status', supplierId, leadStatus });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-buram-border pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-buram-amber">
            PROCUREMENT
          </div>
          <h1 className="mt-1 text-xl font-bold text-buram-text">
            Sourcing &amp; Contracts
          </h1>
        </div>
        <button type="button" className={buttonClass} onClick={() => void loadWorkspace()} disabled={isLoading}>
          <span className="inline-flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </span>
        </button>
        <ExportMenu dataset="INCOMING_LOTS" label="Export Sourcing & Lots" />
      </header>

      {error && <p role="alert" className="rounded border border-buram-critical/40 p-3 text-sm text-buram-critical">{error}</p>}
      {message && <p role="status" className="rounded border border-buram-success/40 p-3 text-sm text-buram-success">{message}</p>}

      <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-buram-amber" />
          <h2 className="font-bold text-buram-text">Permanent supplier lead directory</h2>
        </div>
        {canManageLeads && (
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              setPendingAction({ type: 'lead' });
            }}
          >
            <label><span className={labelClass}>Supplier name</span><input required minLength={2} className={fieldClass} value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} /></label>
            <label><span className={labelClass}>Country (ISO-2)</span><input required minLength={2} maxLength={2} className={fieldClass} value={leadForm.country} onChange={(event) => setLeadForm({ ...leadForm, country: event.target.value.toUpperCase() })} /></label>
            <label><span className={labelClass}>Supplier code (optional)</span><input className={fieldClass} value={leadForm.code} onChange={(event) => setLeadForm({ ...leadForm, code: event.target.value.toUpperCase() })} /></label>
            <label><span className={labelClass}>City / region</span><input className={fieldClass} value={leadForm.regionCity} onChange={(event) => setLeadForm({ ...leadForm, regionCity: event.target.value })} /></label>
            <label><span className={labelClass}>Contact person</span><input className={fieldClass} value={leadForm.contactPerson} onChange={(event) => setLeadForm({ ...leadForm, contactPerson: event.target.value })} /></label>
            <label><span className={labelClass}>Email</span><input type="email" className={fieldClass} value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} /></label>
            <label><span className={labelClass}>Phone</span><input className={fieldClass} value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} /></label>
            <label><span className={labelClass}>Varieties (comma-separated)</span><input className={fieldClass} value={leadForm.honeyVarieties} onChange={(event) => setLeadForm({ ...leadForm, honeyVarieties: event.target.value })} /></label>
            <label><span className={labelClass}>Certifications (comma-separated)</span><input className={fieldClass} value={leadForm.certifications} onChange={(event) => setLeadForm({ ...leadForm, certifications: event.target.value })} /></label>
            <label className="md:col-span-2"><span className={labelClass}>Address / notes</span><input className={fieldClass} value={leadForm.address} onChange={(event) => setLeadForm({ ...leadForm, address: event.target.value })} /></label>
            <button type="submit" className={`${buttonClass} self-end`} disabled={isSaving}>Save supplier lead</button>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-buram-muted" />
            <input aria-label="Search supplier leads" className={`${fieldClass} pl-9`} placeholder="Search supplier, code, country, region" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs uppercase text-buram-muted"><tr><th className="p-2">Supplier</th><th className="p-2">Origin</th><th className="p-2">Lead status</th><th className="p-2">Offers</th><th className="p-2">Latest landed price</th><th className="p-2">Update</th></tr></thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead._id} className="border-t border-buram-border">
                  <td className="p-2"><strong>{lead.name}</strong><div className="text-xs text-buram-muted">{lead.code} {lead.regionCity ? `• ${lead.regionCity}` : ''}</div></td>
                  <td className="p-2"><CountryOriginBadge countryIso={lead.country} /></td>
                  <td className="p-2"><StatusBadge label={lead.leadStatus} variant={lead.leadStatus === 'ACTIVE_PARTNER' ? 'NOMINAL' : lead.leadStatus === 'ON_HOLD' ? 'WARNING' : 'TECHNICAL'} /></td>
                  <td className="p-2">{lead.offersCount ?? 0} ({lead.passedOffersCount ?? 0} passed, {lead.rejectedOffersCount ?? 0} rejected)</td>
                  <td className="p-2">{canViewPrices && lead.latestPriceEurPerKg != null ? `€${lead.latestPriceEurPerKg.toFixed(2)} / kg` : canViewPrices ? '—' : 'Restricted'}</td>
                  <td className="p-2">
                    {canManageLeads && <select aria-label={`Update status for ${lead.name}`} className={fieldClass} value={lead.leadStatus} onChange={(event) => updateLeadStatus(lead._id, event.target.value as Supplier['leadStatus'])}>
                      <option value="LEAD">LEAD</option><option value="ACTIVE_PARTNER">ACTIVE_PARTNER</option><option value="ON_HOLD">ON_HOLD</option>
                    </select>}
                  </td>
                </tr>
              ))}
              {!isLoading && filteredLeads.length === 0 && <tr><td className="p-3 text-buram-muted" colSpan={6}>No supplier leads found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {canWriteSourcing && (
        <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-4">
          <h2 className="font-bold text-buram-text">Record a supplier offer</h2>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPendingAction({ type: 'offer' });
            }}
          >
            <label><span className={labelClass}>Supplier lead</span><select required className={fieldClass} value={offerForm.supplierId} onChange={(event) => {
              const supplier = leads.find((item) => item._id === event.target.value);
              setOfferForm({ ...offerForm, supplierId: event.target.value, country: supplier?.country ?? offerForm.country });
            }}><option value="">Select supplier</option>{leads.filter((lead) => lead.isActive).map((lead) => <option key={lead._id} value={lead._id}>{lead.name} ({lead.code})</option>)}</select></label>
            <label><span className={labelClass}>Material</span><select required className={fieldClass} value={offerForm.materialId} onChange={(event) => setOfferForm({ ...offerForm, materialId: event.target.value })}><option value="">Select material</option>{materials.filter((material) => material.unit === 'kg').map((material) => <option key={material._id} value={material._id}>{material.code} — {material.name}</option>)}</select></label>
            <label><span className={labelClass}>Origin country</span><input required minLength={2} maxLength={2} className={fieldClass} value={offerForm.country} onChange={(event) => setOfferForm({ ...offerForm, country: event.target.value.toUpperCase() })} /></label>
            <label><span className={labelClass}>Package type</span><select className={fieldClass} value={offerForm.packageType} onChange={(event) => setOfferForm({ ...offerForm, packageType: event.target.value })}>{['IBC', 'DRUM', 'BUCKET_TRAY', 'PAIL', 'CARTON', 'BAG', 'PALLET', 'BOTTLE', 'PIECE'].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label><span className={labelClass}>Offer weight unit</span><select className={fieldClass} value={offerForm.massInputUnit} onChange={(event) => setOfferForm({ ...offerForm, massInputUnit: event.target.value as 'kg' | 'ton' })}><option value="ton">Tonnes</option><option value="kg">Kilograms</option></select></label>
            <label><span className={labelClass}>Total offered weight</span><input required type="number" min="0.001" step="any" className={fieldClass} value={offerForm.offeredInputWeight} onChange={(event) => setOfferForm({ ...offerForm, offeredInputWeight: event.target.value })} /></label>
            <label><span className={labelClass}>Package count</span><input required type="number" min="1" step="1" className={fieldClass} value={offerForm.offeredPackages} onChange={(event) => setOfferForm({ ...offerForm, offeredPackages: event.target.value })} /></label>
            {canViewPrices && <>
              <label><span className={labelClass}>Price basis</span><select className={fieldClass} value={offerForm.priceBasis} onChange={(event) => setOfferForm({ ...offerForm, priceBasis: event.target.value as typeof offerForm.priceBasis })}><option value="PER_KG">EUR / kg</option><option value="PER_TON">EUR / ton</option><option value="TOTAL_OFFER">Total EUR offer</option></select></label>
              <label><span className={labelClass}>Offer price (EUR)</span><input type="number" min="0" step="any" className={fieldClass} value={offerForm.inputPriceEur} onChange={(event) => setOfferForm({ ...offerForm, inputPriceEur: event.target.value })} /></label>
              <label><span className={labelClass}>Transport cost (EUR)</span><input type="number" min="0" step="any" className={fieldClass} value={offerForm.transportCostEur} onChange={(event) => setOfferForm({ ...offerForm, transportCostEur: event.target.value })} /></label>
            </>}
            <label><span className={labelClass}>Offer reference</span><input className={fieldClass} value={offerForm.offerRef} onChange={(event) => setOfferForm({ ...offerForm, offerRef: event.target.value })} /></label>
            <label className="md:col-span-2"><span className={labelClass}>Offer notes</span><input className={fieldClass} value={offerForm.offerNotes} onChange={(event) => setOfferForm({ ...offerForm, offerNotes: event.target.value })} /></label>
            <button type="submit" className={`${buttonClass} self-end`} disabled={isSaving || leads.length === 0 || materials.length === 0}>Save normalized offer</button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-buram-text">Sourcing decisions and contracts</h2>
          {isLoading && <span className="text-xs text-buram-muted">Loading…</span>}
        </div>
        <p className="text-xs text-buram-muted">
          Price offer → Management external analysis → sample → QA/QSI review → contract → shipment.
        </p>
        {records.map((record) => {
          const recordGate = currentGate(record);
          const actionableGate = SOURCING_GATES.some((item) => item === recordGate);
          const canHandleThisGate =
            user.role === 'ADMIN' ||
            (actionableGate &&
              user.permissions.includes(
                SOURCING_GATE_PERMISSIONS[
                  recordGate as (typeof SOURCING_GATES)[number]
                ]
              ));
          const expanded = selectedId === record._id;
          return (
            <article key={record._id} className={`rounded-lg border bg-buram-surface p-4 ${expanded ? 'border-buram-amber' : 'border-buram-border'}`}>
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-3 text-left" onClick={() => setSelectedId(record._id)}>
                <span><strong className="font-mono text-buram-gold">{record.sourcingNo}</strong><span className="ml-3">{recordName(record.supplierId)} — {recordName(record.materialId)}</span></span>
                <span className="flex items-center gap-2"><CountryOriginBadge countryIso={record.country} /><StatusBadge label={`${record.stage} • ${record.status}`} variant={record.status === 'REJECTED' ? 'CRITICAL' : record.status === 'PASSED' ? 'NOMINAL' : 'TECHNICAL'} /></span>
              </button>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-buram-muted">
                <span>{record.offeredKg.toLocaleString()} kg / {record.offeredDrums} {record.packageType ?? 'packages'}</span>
                {record.offer?.unitWeightKg != null && <span>{record.offer.unitWeightKg} kg/package</span>}
                {canViewPrices && record.offer?.landedUnitPriceEurPerKg != null && <span className="text-buram-success">Landed €{record.offer.landedUnitPriceEurPerKg.toFixed(2)} / kg</span>}
                {record.contract && <span>Contract {record.contract.contractNo} ({record.contract.status})</span>}
              </div>
              {expanded && (
                <div className="mt-4 space-y-4 border-t border-buram-border pt-4">
                  {actionableGate && canHandleThisGate && record.status !== 'REJECTED' && (
                    <>
                      {recordGate === 'EXTERNAL_ANALYSIS' && <div className="grid gap-3 md:grid-cols-4">
                        <label><span className={labelClass}>External lab</span><input className={fieldClass} value={externalForm.labName} onChange={(event) => setExternalForm({ ...externalForm, labName: event.target.value })} /></label>
                        <label><span className={labelClass}>Report number</span><input className={fieldClass} value={externalForm.reportNo} onChange={(event) => setExternalForm({ ...externalForm, reportNo: event.target.value })} /></label>
                        <label><span className={labelClass}>Report date</span><input type="date" className={fieldClass} value={externalForm.reportDate} onChange={(event) => setExternalForm({ ...externalForm, reportDate: event.target.value })} /></label>
                        <label><span className={labelClass}>Transport (EUR)</span><input type="number" min="0" step="any" className={fieldClass} value={externalForm.transportCostEur} onChange={(event) => setExternalForm({ ...externalForm, transportCostEur: event.target.value })} /></label>
                        <label><span className={labelClass}>Market demand</span><select className={fieldClass} value={externalForm.marketDemandFit} onChange={(event) => setExternalForm({ ...externalForm, marketDemandFit: event.target.value as typeof externalForm.marketDemandFit })}><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label>
                        <label><span className={labelClass}>Location acceptable</span><select className={fieldClass} value={String(externalForm.locationAcceptable)} onChange={(event) => setExternalForm({ ...externalForm, locationAcceptable: event.target.value === 'true' })}><option value="true">Yes</option><option value="false">No</option></select></label>
                        <label><span className={labelClass}>Price acceptable</span><select className={fieldClass} value={String(externalForm.priceAcceptable)} onChange={(event) => setExternalForm({ ...externalForm, priceAcceptable: event.target.value === 'true' })}><option value="true">Yes</option><option value="false">No</option></select></label>
                        <label><span className={labelClass}>Quality acceptable</span><select className={fieldClass} value={String(externalForm.qualityAcceptable)} onChange={(event) => setExternalForm({ ...externalForm, qualityAcceptable: event.target.value === 'true' })}><option value="true">Yes</option><option value="false">No</option></select></label>
                        <label className="md:col-span-2"><span className={labelClass}>Management notes</span><input className={fieldClass} value={externalForm.managementNotes} onChange={(event) => setExternalForm({ ...externalForm, managementNotes: event.target.value })} /></label>
                      </div>}
                      {recordGate === 'SAMPLE' && <div className="grid gap-3 md:grid-cols-5">
                        <label><span className={labelClass}>Sample reference</span><input className={fieldClass} value={sampleForm.sampleCode} onChange={(event) => setSampleForm({ ...sampleForm, sampleCode: event.target.value })} /></label>
                        <label><span className={labelClass}>Routing</span><select className={fieldClass} value={sampleForm.routingMode} onChange={(event) => setSampleForm({ ...sampleForm, routingMode: event.target.value as SampleRoutingMode })}><option value="REQUESTED_FROM_SUPPLIER">Requested from supplier</option><option value="SENT_DIRECT_TO_QSI">Sent direct to QSI</option><option value="RECEIVED_AT_BURAM">Received at Buram</option></select></label>
                        <label><span className={labelClass}>QSI tracking reference</span><input className={fieldClass} value={sampleForm.qsiTrackingRef} onChange={(event) => setSampleForm({ ...sampleForm, qsiTrackingRef: event.target.value })} /></label>
                        <label><span className={labelClass}>Received date</span><input type="date" className={fieldClass} value={sampleForm.receivedAt} onChange={(event) => setSampleForm({ ...sampleForm, receivedAt: event.target.value })} /></label>
                        <label><span className={labelClass}>Sample weight (grams, optional)</span><input type="number" min="0.001" max="100000" step="any" className={fieldClass} value={sampleForm.weightGrams} onChange={(event) => setSampleForm({ ...sampleForm, weightGrams: event.target.value })} /></label>
                      </div>}
                      {recordGate === 'INHOUSE_QSI' && <div className="grid gap-3 md:grid-cols-3">
                        <label><span className={labelClass}>QSI report number</span><input className={fieldClass} value={qsiForm.qsiReportNo} onChange={(event) => setQsiForm({ ...qsiForm, qsiReportNo: event.target.value })} /></label>
                        <label><span className={labelClass}>Published date</span><input type="date" className={fieldClass} value={qsiForm.qsiReportPublishedAt} onChange={(event) => setQsiForm({ ...qsiForm, qsiReportPublishedAt: event.target.value })} /></label>
                        <label><span className={labelClass}>In-house sensory pass</span><select className={fieldClass} value={String(qsiForm.inhouseSensoryPass)} onChange={(event) => setQsiForm({ ...qsiForm, inhouseSensoryPass: event.target.value === 'true' })}><option value="true">Pass</option><option value="false">Fail</option></select></label>
                        <label><span className={labelClass}>QSI report pass</span><select className={fieldClass} value={String(qsiForm.qsiPass)} onChange={(event) => setQsiForm({ ...qsiForm, qsiPass: event.target.value === 'true' })}><option value="true">Pass</option><option value="false">Fail</option></select></label>
                      </div>}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass} disabled={isSaving} onClick={() => setPendingAction({ type: 'gate', sourcingId: record._id, decision: 'APPROVED' })}>Approve {recordGate}</button>
                        <button type="button" className={`${buttonClass} border-buram-critical/50 text-buram-critical`} disabled={isSaving} onClick={() => setPendingAction({ type: 'gate', sourcingId: record._id, decision: 'REJECTED' })}>Reject and retain lead</button>
                      </div>
                    </>
                  )}
                  {record.status === 'PASSED' && canCreateContracts && <button type="button" className={buttonClass} disabled={isSaving} onClick={() => setPendingAction({ type: 'contract', sourcingId: record._id })}>Create purchase contract</button>}
                  {record.contract?.status === 'SIGNED' && canCreateContracts && <button type="button" className={buttonClass} disabled={isSaving} onClick={() => setPendingAction({ type: 'ship', contractId: record.contract!._id })}><span className="inline-flex items-center gap-2"><Truck className="h-4 w-4" />Mark contract shipped</span></button>}
                  {!actionableGate && record.status !== 'PASSED' && !record.contract && <p className="text-sm text-buram-muted">No action is available at this stage for your role.</p>}
                </div>
              )}
            </article>
          );
        })}
        {!isLoading && records.length === 0 && <p className="rounded border border-buram-border p-4 text-sm text-buram-muted">No sourcing offers recorded yet.</p>}
      </section>

      {selectedRecord && (
        <AttachmentsPanel
          entityType="SOURCING"
          entityCode={selectedRecord.sourcingNo}
          defaultDocType="EXTERNAL_ANALYSIS_REPORT"
        />
      )}

      <ReasonDialog
        isOpen={Boolean(pendingAction)}
        title={pendingAction ? `Confirm ${pendingAction.type.replace('-', ' ')}` : ''}
        actionSummary="This sourcing or supplier change will be stored with an audit reason."
        onCancel={() => setPendingAction(null)}
        onConfirm={submitPendingAction}
      />
    </div>
  );
};
