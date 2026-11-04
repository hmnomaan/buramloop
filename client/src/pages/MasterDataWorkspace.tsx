import React, { useCallback, useEffect, useState } from 'react';
import { Database, Plus, RefreshCw, Globe, Sliders, Building2, Award } from 'lucide-react';
import { StatusBadge, ReasonDialog } from '../components/ui/IndustrialPrimitives';
import { apiClient } from '../lib/apiClient';

type Material = {
  _id: string;
  code: string;
  name: string;
  kind: 'HONEY' | 'POLLEN' | 'COMB' | 'FLAVOUR' | 'OTHER';
  category: string;
  unit: 'kg' | 'l' | 'piece';
  defaultDrumKg?: number;
  defaultPackageType?: string;
  isAllergen: boolean;
  countsTowardOrigin: boolean;
  isActive: boolean;
};

type Customer = {
  _id: string;
  code: string;
  name: string;
  country: string;
  allowedCountries: string[];
  blockedCountries: string[];
  allowReworkHoney: boolean;
  maxReworkSharePct: number;
  contactName?: string;
  contactEmail?: string;
  isActive: boolean;
};

type Supplier = {
  _id: string;
  code: string;
  name: string;
  country: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  isActive: boolean;
};

type QualityGrade = {
  _id: string;
  code: 'Quality1' | 'Quality2' | 'Quality3' | 'QUALITY_1' | 'QUALITY_2' | 'QUALITY_3';
  name: string;
  rank: number;
  description?: string;
  isActive: boolean;
};

type Counter = {
  _id: string;
  key: string;
  prefix: string;
  seq: number;
};

type MasterTab = 'MATERIALS' | 'CUSTOMERS' | 'SUPPLIERS' | 'QUALITY_GRADES' | 'COUNTERS';

const MATERIAL_KINDS: Material['kind'][] = ['HONEY', 'POLLEN', 'COMB', 'FLAVOUR', 'OTHER'];
const QUALITY_GRADE_OPTIONS: QualityGrade['code'][] = [
  'QUALITY_1',
  'QUALITY_2',
  'QUALITY_3',
  'Quality1',
  'Quality2',
  'Quality3',
];
const fieldClass =
  'w-full rounded border border-buram-border bg-buram-bg px-3 py-2 text-sm text-buram-text outline-none focus:border-buram-amber';
const labelClass = 'mb-1 block text-xs font-mono uppercase tracking-wide text-buram-muted';

export const MasterDataWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MasterTab>('MATERIALS');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [qualityGrades, setQualityGrades] = useState<QualityGrade[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);

  const [newMaterial, setNewMaterial] = useState({
    code: '',
    name: '',
    kind: 'HONEY' as Material['kind'],
    category: '',
    unit: 'kg' as Material['unit'],
    defaultDrumKg: '290',
    defaultPackageType: 'Drum',
    isAllergen: false,
  });

  const [newCustomer, setNewCustomer] = useState({
    code: '',
    name: '',
    country: 'DE',
    allowedCountriesCsv: 'DE, TR, RO',
    blockedCountriesCsv: '',
    allowReworkHoney: true,
    maxReworkSharePct: '30',
    contactName: '',
    contactEmail: '',
  });

  const [newSupplier, setNewSupplier] = useState({
    code: '',
    name: '',
    country: 'TR',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  });

  const [newGrade, setNewGrade] = useState({
    code: 'QUALITY_1' as QualityGrade['code'],
    name: '',
    rank: '1',
    description: '',
  });

  const [counterOverride, setCounterOverride] = useState({
    key: '',
    prefix: '',
    seq: '0',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<MasterTab | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadMasterData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [materialRows, customerRows, supplierRows, gradeRows, counterRows] = await Promise.all([
        apiClient.request<Material[]>('/master/materials'),
        apiClient.request<Customer[]>('/master/customers').catch(() => [] as Customer[]),
        apiClient.request<Supplier[]>('/master/suppliers').catch(() => [] as Supplier[]),
        apiClient.request<QualityGrade[]>('/master/quality-grades').catch(() => [] as QualityGrade[]),
        apiClient.request<Counter[]>('/master/counters').catch(() => [] as Counter[]),
      ]);
      setMaterials(materialRows);
      setCustomers(customerRows);
      setSuppliers(supplierRows);
      setQualityGrades(gradeRows);
      setCounters(counterRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load master data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMasterData();
  }, [loadMasterData]);

  const parseCountryList = (csv: string): string[] =>
    csv
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item.length === 2);

  const handleConfirmReason = async (reason: string) => {
    if (!pendingAction) return;
    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      if (pendingAction === 'MATERIALS') {
        const created = await apiClient.auditedMutation<Material, Record<string, unknown>>(
          '/master/materials',
          'POST',
          {
            body: {
              code: newMaterial.code,
              name: newMaterial.name,
              kind: newMaterial.kind,
              category: newMaterial.category,
              unit: newMaterial.unit,
              ...(newMaterial.unit === 'kg'
                ? { defaultDrumKg: Number(newMaterial.defaultDrumKg || 290) }
                : {}),
              defaultPackageType: newMaterial.defaultPackageType || undefined,
              isAllergen: newMaterial.isAllergen,
              countsTowardOrigin: newMaterial.kind === 'HONEY',
            },
            reason,
          }
        );
        setMaterials((previous) =>
          [...previous, created].sort(
            (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
          )
        );
        setNewMaterial({
          code: '',
          name: '',
          kind: 'HONEY',
          category: '',
          unit: 'kg',
          defaultDrumKg: '290',
          defaultPackageType: 'Drum',
          isAllergen: false,
        });
        setMessage(`Material ${created.code} was saved.`);
      } else if (pendingAction === 'CUSTOMERS') {
        const allowedCountries = parseCountryList(newCustomer.allowedCountriesCsv);
        const blockedCountries = parseCountryList(newCustomer.blockedCountriesCsv);
        const created = await apiClient.auditedMutation<Customer, Record<string, unknown>>(
          '/master/customers',
          'POST',
          {
            body: {
              code: newCustomer.code,
              name: newCustomer.name,
              country: newCustomer.country.toUpperCase(),
              allowedCountries,
              blockedCountries,
              allowReworkHoney: newCustomer.allowReworkHoney,
              maxReworkSharePct: Number(newCustomer.maxReworkSharePct || 30),
              contactName: newCustomer.contactName || undefined,
              contactEmail: newCustomer.contactEmail || undefined,
            },
            reason,
          }
        );
        setCustomers((previous) => [...previous, created]);
        setNewCustomer({
          code: '',
          name: '',
          country: 'DE',
          allowedCountriesCsv: 'DE, TR, RO',
          blockedCountriesCsv: '',
          allowReworkHoney: true,
          maxReworkSharePct: '30',
          contactName: '',
          contactEmail: '',
        });
        setMessage(`Customer ${created.code} was saved.`);
      } else if (pendingAction === 'SUPPLIERS') {
        const created = await apiClient.auditedMutation<Supplier, Record<string, unknown>>(
          '/master/suppliers',
          'POST',
          {
            body: {
              code: newSupplier.code,
              name: newSupplier.name,
              country: newSupplier.country.toUpperCase(),
              contactName: newSupplier.contactName || undefined,
              contactEmail: newSupplier.contactEmail || undefined,
              contactPhone: newSupplier.contactPhone || undefined,
            },
            reason,
          }
        );
        setSuppliers((previous) => [...previous, created]);
        setNewSupplier({
          code: '',
          name: '',
          country: 'TR',
          contactName: '',
          contactEmail: '',
          contactPhone: '',
        });
        setMessage(`Supplier ${created.code} was saved.`);
      } else if (pendingAction === 'QUALITY_GRADES') {
        const created = await apiClient.auditedMutation<QualityGrade, Record<string, unknown>>(
          '/master/quality-grades',
          'POST',
          {
            body: {
              code: newGrade.code,
              name: newGrade.name,
              rank: Number(newGrade.rank || 1),
              description: newGrade.description || undefined,
            },
            reason,
          }
        );
        setQualityGrades((previous) => [...previous, created].sort((a, b) => a.rank - b.rank));
        setNewGrade({
          code: 'QUALITY_1',
          name: '',
          rank: '1',
          description: '',
        });
        setMessage(`Quality grade ${created.code} was saved.`);
      } else if (pendingAction === 'COUNTERS') {
        const updated = await apiClient.auditedMutation<Counter, Record<string, unknown>>(
          '/master/counters/override',
          'POST',
          {
            body: {
              key: counterOverride.key.trim().toUpperCase(),
              seq: Number(counterOverride.seq || 0),
              ...(counterOverride.prefix.trim() ? { prefix: counterOverride.prefix.trim() } : {}),
            },
            reason,
          }
        );
        setCounters((previous) => {
          const exists = previous.some((item) => item.key === updated.key);
          return exists
            ? previous.map((item) => (item.key === updated.key ? updated : item))
            : [...previous, updated];
        });
        setCounterOverride({ key: '', prefix: '', seq: '0' });
        setMessage(`Counter ${updated.key} set to sequence ${updated.seq}.`);
      }

      setPendingAction(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save master data.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-buram-border pb-4">
        <div className="flex items-start gap-3">
          <Database className="mt-1 h-5 w-5 text-buram-amber" />
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-buram-amber">
              ADMINISTRATION
            </span>
            <h1 className="mt-1 text-xl font-bold text-buram-text">
              Master Data &amp; Sequence Governance
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadMasterData()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded border border-buram-border px-3 py-2 text-sm text-buram-text hover:border-buram-amber disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-buram-border pb-3">
        {(
          [
            { id: 'MATERIALS', label: `Materials (${materials.length})`, icon: Database },
            { id: 'CUSTOMERS', label: `Customers (${customers.length})`, icon: Globe },
            { id: 'SUPPLIERS', label: `Suppliers (${suppliers.length})`, icon: Building2 },
            { id: 'QUALITY_GRADES', label: `Quality Grades (${qualityGrades.length})`, icon: Award },
            { id: 'COUNTERS', label: `Counters (${counters.length})`, icon: Sliders },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
                setMessage('');
              }}
              className={`inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-mono uppercase transition ${
                active
                  ? 'bg-buram-amber text-buram-ink font-bold'
                  : 'border border-buram-border bg-buram-surface text-buram-muted hover:text-buram-text'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded border border-buram-critical/40 p-3 text-sm text-buram-critical">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded border border-buram-success/40 p-3 text-sm text-buram-success">
          {message}
        </p>
      )}

      {activeTab === 'MATERIALS' && (
        <>
          <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
                Register material
              </h2>
              <StatusBadge label="AUDIT REASON REQUIRED" variant="WARNING" />
            </div>
            <p className="text-xs text-buram-muted">
              Define each material’s stock unit before sourcing. kg, L, and pieces are tracked
              separately without automatic conversion.
            </p>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                setPendingAction('MATERIALS');
              }}
            >
              <label>
                <span className={labelClass}>Code</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={32}
                  value={newMaterial.code}
                  onChange={(event) =>
                    setNewMaterial({ ...newMaterial, code: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Name</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={120}
                  value={newMaterial.name}
                  onChange={(event) => setNewMaterial({ ...newMaterial, name: event.target.value })}
                />
              </label>
              <label>
                <span className={labelClass}>Kind</span>
                <select
                  className={fieldClass}
                  value={newMaterial.kind}
                  onChange={(event) =>
                    setNewMaterial({
                      ...newMaterial,
                      kind: event.target.value as Material['kind'],
                    })
                  }
                >
                  {MATERIAL_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Category</span>
                <input
                  className={fieldClass}
                  required
                  value={newMaterial.category}
                  onChange={(event) =>
                    setNewMaterial({ ...newMaterial, category: event.target.value })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Unit</span>
                <select
                  className={fieldClass}
                  value={newMaterial.unit}
                  onChange={(event) => {
                    const unit = event.target.value as Material['unit'];
                    setNewMaterial({
                      ...newMaterial,
                      unit,
                      defaultDrumKg: unit === 'kg' ? newMaterial.defaultDrumKg || '290' : '',
                      defaultPackageType: unit === 'kg' ? 'Drum' : '',
                    });
                  }}
                >
                  <option value="kg">kg</option>
                  <option value="l">l</option>
                  <option value="piece">piece</option>
                </select>
              </label>
              {newMaterial.unit === 'kg' && (
                <label>
                  <span className={labelClass}>Default drum weight (kg)</span>
                  <input
                    className={fieldClass}
                    type="number"
                    min="0.001"
                    max="1000"
                    step="0.1"
                    required
                    value={newMaterial.defaultDrumKg}
                    onChange={(event) =>
                      setNewMaterial({ ...newMaterial, defaultDrumKg: event.target.value })
                    }
                  />
                </label>
              )}
              <label>
                <span className={labelClass}>Default package type (optional)</span>
                <input
                  className={fieldClass}
                  maxLength={60}
                  placeholder="Drum, pail, IBC, carton…"
                  value={newMaterial.defaultPackageType}
                  onChange={(event) =>
                    setNewMaterial({ ...newMaterial, defaultPackageType: event.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-2 self-end rounded border border-buram-border p-3 text-sm text-buram-text">
                <input
                  type="checkbox"
                  checked={newMaterial.isAllergen}
                  onChange={(event) =>
                    setNewMaterial({ ...newMaterial, isAllergen: event.target.checked })
                  }
                />
                Allergen
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Add material
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-buram-border bg-buram-surface p-5">
            <h2 className="border-b border-buram-border pb-3 font-semibold text-buram-text">
              Registered materials
            </h2>
            {isLoading ? (
              <p className="py-4 text-sm text-buram-muted">Loading materials…</p>
            ) : materials.length === 0 ? (
              <p className="py-4 text-sm text-buram-muted">No materials are registered.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {materials.map((material) => (
                  <div
                    key={material._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-buram-border bg-buram-bg/80 p-3"
                  >
                    <div>
                      <span className="font-mono font-bold text-buram-gold">{material.code}</span>
                      <span className="ml-2 text-sm text-buram-text">{material.name}</span>
                      <span className="block text-xs text-buram-muted">
                        {material.category} · {material.unit}
                        {material.defaultPackageType ? ` · ${material.defaultPackageType}` : ''}
                      </span>
                    </div>
                    <StatusBadge
                      label={`${material.kind}${material.defaultDrumKg ? ` · ${material.defaultDrumKg} kg/drum` : ''}${material.isAllergen ? ' · ALLERGEN' : ''}${material.isActive ? '' : ' · INACTIVE'}`}
                      variant={material.isActive ? 'TECHNICAL' : 'MUTED'}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'CUSTOMERS' && (
        <>
          <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
                Register customer &amp; 1–3 allowed origin countries
              </h2>
              <StatusBadge label="AUDIT REASON REQUIRED" variant="WARNING" />
            </div>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                setPendingAction('CUSTOMERS');
              }}
            >
              <label>
                <span className={labelClass}>Customer Code</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={24}
                  placeholder="CUST-EDEKA"
                  value={newCustomer.code}
                  onChange={(event) =>
                    setNewCustomer({ ...newCustomer, code: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Customer Name</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={160}
                  value={newCustomer.name}
                  onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })}
                />
              </label>
              <label>
                <span className={labelClass}>Country (ISO-2)</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={2}
                  value={newCustomer.country}
                  onChange={(event) =>
                    setNewCustomer({ ...newCustomer, country: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Allowed Origin Countries (1–3 ISO-2, comma-separated)</span>
                <input
                  className={fieldClass}
                  required
                  placeholder="DE, TR, RO"
                  value={newCustomer.allowedCountriesCsv}
                  onChange={(event) =>
                    setNewCustomer({ ...newCustomer, allowedCountriesCsv: event.target.value })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Blocked Origin Countries (ISO-2, optional)</span>
                <input
                  className={fieldClass}
                  placeholder="CN, IN"
                  value={newCustomer.blockedCountriesCsv}
                  onChange={(event) =>
                    setNewCustomer({ ...newCustomer, blockedCountriesCsv: event.target.value })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Max Rework Share (%)</span>
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  max="100"
                  value={newCustomer.maxReworkSharePct}
                  onChange={(event) =>
                    setNewCustomer({ ...newCustomer, maxReworkSharePct: event.target.value })
                  }
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Save customer policy
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-buram-border bg-buram-surface p-5">
            <h2 className="border-b border-buram-border pb-3 font-semibold text-buram-text">
              Registered customers
            </h2>
            {customers.length === 0 ? (
              <p className="py-4 text-sm text-buram-muted">No customers registered.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {customers.map((customer) => (
                  <div
                    key={customer._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-buram-border bg-buram-bg/80 p-3"
                  >
                    <div>
                      <span className="font-mono font-bold text-buram-gold">{customer.code}</span>
                      <span className="ml-2 text-sm text-buram-text">{customer.name}</span>
                      <span className="block text-xs text-buram-muted">
                        Allowed: {customer.allowedCountries?.join(', ') || 'None'}
                        {customer.blockedCountries?.length
                          ? ` · Blocked: ${customer.blockedCountries.join(', ')}`
                          : ''}
                      </span>
                    </div>
                    <StatusBadge
                      label={`${customer.country} · Rework ≤${customer.maxReworkSharePct ?? 30}%`}
                      variant="TECHNICAL"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'SUPPLIERS' && (
        <>
          <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
                Register supplier
              </h2>
              <StatusBadge label="AUDIT REASON REQUIRED" variant="WARNING" />
            </div>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                setPendingAction('SUPPLIERS');
              }}
            >
              <label>
                <span className={labelClass}>Supplier Code</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={24}
                  placeholder="SUP-TR-01"
                  value={newSupplier.code}
                  onChange={(event) =>
                    setNewSupplier({ ...newSupplier, code: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Supplier Name</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={160}
                  value={newSupplier.name}
                  onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })}
                />
              </label>
              <label>
                <span className={labelClass}>Origin Country (ISO-2)</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={2}
                  value={newSupplier.country}
                  onChange={(event) =>
                    setNewSupplier({ ...newSupplier, country: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Contact Name</span>
                <input
                  className={fieldClass}
                  value={newSupplier.contactName}
                  onChange={(event) =>
                    setNewSupplier({ ...newSupplier, contactName: event.target.value })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Contact Email</span>
                <input
                  className={fieldClass}
                  type="email"
                  value={newSupplier.contactEmail}
                  onChange={(event) =>
                    setNewSupplier({ ...newSupplier, contactEmail: event.target.value })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Contact Phone</span>
                <input
                  className={fieldClass}
                  value={newSupplier.contactPhone}
                  onChange={(event) =>
                    setNewSupplier({ ...newSupplier, contactPhone: event.target.value })
                  }
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Save supplier
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-buram-border bg-buram-surface p-5">
            <h2 className="border-b border-buram-border pb-3 font-semibold text-buram-text">
              Registered suppliers
            </h2>
            {suppliers.length === 0 ? (
              <p className="py-4 text-sm text-buram-muted">No suppliers registered.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {suppliers.map((supplier) => (
                  <div
                    key={supplier._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-buram-border bg-buram-bg/80 p-3"
                  >
                    <div>
                      <span className="font-mono font-bold text-buram-gold">{supplier.code}</span>
                      <span className="ml-2 text-sm text-buram-text">{supplier.name}</span>
                      {supplier.contactName && (
                        <span className="block text-xs text-buram-muted">
                          {supplier.contactName}
                          {supplier.contactEmail ? ` · ${supplier.contactEmail}` : ''}
                        </span>
                      )}
                    </div>
                    <StatusBadge label={supplier.country} variant="TECHNICAL" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'QUALITY_GRADES' && (
        <>
          <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
                Register quality grade
              </h2>
              <StatusBadge label="AUDIT REASON REQUIRED" variant="WARNING" />
            </div>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                setPendingAction('QUALITY_GRADES');
              }}
            >
              <label>
                <span className={labelClass}>Grade Code</span>
                <select
                  className={fieldClass}
                  value={newGrade.code}
                  onChange={(event) =>
                    setNewGrade({ ...newGrade, code: event.target.value as QualityGrade['code'] })
                  }
                >
                  {QUALITY_GRADE_OPTIONS.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Display Name</span>
                <input
                  className={fieldClass}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Premium Export Grade 1"
                  value={newGrade.name}
                  onChange={(event) => setNewGrade({ ...newGrade, name: event.target.value })}
                />
              </label>
              <label>
                <span className={labelClass}>Rank (1–10)</span>
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={newGrade.rank}
                  onChange={(event) => setNewGrade({ ...newGrade, rank: event.target.value })}
                />
              </label>
              <label>
                <span className={labelClass}>Description</span>
                <input
                  className={fieldClass}
                  value={newGrade.description}
                  onChange={(event) =>
                    setNewGrade({ ...newGrade, description: event.target.value })
                  }
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Save quality grade
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-buram-border bg-buram-surface p-5">
            <h2 className="border-b border-buram-border pb-3 font-semibold text-buram-text">
              Registered quality grades
            </h2>
            {qualityGrades.length === 0 ? (
              <p className="py-4 text-sm text-buram-muted">No quality grades registered.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {qualityGrades.map((grade) => (
                  <div
                    key={grade._id}
                    className="flex items-center justify-between gap-2 rounded border border-buram-border bg-buram-bg/80 p-3"
                  >
                    <div>
                      <span className="font-mono font-bold text-buram-gold">{grade.code}</span>
                      <span className="ml-2 text-sm text-buram-text">{grade.name}</span>
                      {grade.description && (
                        <span className="block text-xs text-buram-muted">{grade.description}</span>
                      )}
                    </div>
                    <StatusBadge label={`Rank ${grade.rank}`} variant="TECHNICAL" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'COUNTERS' && (
        <>
          <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
                Override sequence counter
              </h2>
              <StatusBadge label="ADMIN ONLY · AUDIT REASON REQUIRED" variant="WARNING" />
            </div>
            <form
              className="grid gap-3 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                setPendingAction('COUNTERS');
              }}
            >
              <label>
                <span className={labelClass}>Counter Key</span>
                <input
                  className={fieldClass}
                  required
                  placeholder="BATCH_26, LOT_2026, DRUM_26…"
                  value={counterOverride.key}
                  onChange={(event) =>
                    setCounterOverride({
                      ...counterOverride,
                      key: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>Prefix (optional)</span>
                <input
                  className={fieldClass}
                  placeholder="B26-"
                  value={counterOverride.prefix}
                  onChange={(event) =>
                    setCounterOverride({ ...counterOverride, prefix: event.target.value })
                  }
                />
              </label>
              <label>
                <span className={labelClass}>New Current Sequence</span>
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  required
                  value={counterOverride.seq}
                  onChange={(event) =>
                    setCounterOverride({ ...counterOverride, seq: event.target.value })
                  }
                />
              </label>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50"
                >
                  <Sliders className="h-4 w-4" /> Override counter
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-buram-border bg-buram-surface p-5">
            <h2 className="border-b border-buram-border pb-3 font-semibold text-buram-text">
              Active sequence counters
            </h2>
            {counters.length === 0 ? (
              <p className="py-4 text-sm text-buram-muted">No sequence counters are registered.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {counters.map((counter) => (
                  <div
                    key={counter._id}
                    className="flex items-center justify-between gap-3 rounded border border-buram-border bg-buram-bg/80 p-3 font-mono text-xs"
                  >
                    <span className="text-buram-muted">{counter.key}</span>
                    <span className="font-bold text-buram-pale">
                      Current: {counter.seq} · Next: {counter.prefix}
                      {String(counter.seq + 1).padStart(4, '0')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ReasonDialog
        isOpen={pendingAction !== null}
        title={`Commit ${pendingAction?.toLowerCase().replace('_', ' ') ?? 'master data'} update`}
        actionSummary="Every master data or sequence counter change is permanently recorded in the audit log."
        confirmLabel="Confirm audited change"
        isSubmitting={isSaving}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmReason}
      />
    </div>
  );
};
