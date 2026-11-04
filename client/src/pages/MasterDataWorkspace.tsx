import React, { useCallback, useEffect, useState } from 'react';
import { Database, Plus, RefreshCw } from 'lucide-react';
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

type Counter = {
  _id: string;
  key: string;
  prefix: string;
  seq: number;
};

const MATERIAL_KINDS: Material['kind'][] = ['HONEY', 'POLLEN', 'COMB', 'FLAVOUR', 'OTHER'];
const fieldClass =
  'w-full rounded border border-buram-border bg-buram-bg px-3 py-2 text-sm text-buram-text outline-none focus:border-buram-amber';
const labelClass = 'mb-1 block text-xs font-mono uppercase tracking-wide text-buram-muted';

export const MasterDataWorkspace: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadMasterData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [materialRows, counterRows] = await Promise.all([
        apiClient.request<Material[]>('/master/materials'),
        apiClient.request<Counter[]>('/master/counters'),
      ]);
      setMaterials(materialRows);
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

  const createMaterial = async (reason: string) => {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
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
        [...previous, created].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
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
      setIsReasonOpen(false);
      setMessage(`Material ${created.code} was created.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the material.');
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
              Materials &amp; Counters
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

      <section className="space-y-4 rounded-lg border border-buram-border bg-buram-surface p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
            Register material
          </h2>
          <StatusBadge label="AUDIT REASON REQUIRED" variant="WARNING" />
        </div>
        <p className="text-xs text-buram-muted">
          Define each material’s stock unit before sourcing. kg, L, and pieces are tracked
          separately without automatic conversion. This setup phase does not yet enable
          non-kg sourcing or receiving.
        </p>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            setIsReasonOpen(true);
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
              {MATERIAL_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          <label>
            <span className={labelClass}>Category</span>
            <input
              className={fieldClass}
              required
              value={newMaterial.category}
              onChange={(event) => setNewMaterial({ ...newMaterial, category: event.target.value })}
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

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-buram-border bg-buram-surface p-5">
          <h2 className="border-b border-buram-border pb-3 font-semibold text-buram-text">
            Registered materials
          </h2>
          {isLoading ? (
            <p className="py-4 text-sm text-buram-muted">Loading materials…</p>
          ) : materials.length === 0 ? (
            <p className="py-4 text-sm text-buram-muted">No materials are registered.</p>
          ) : (
            <div className="mt-3 space-y-2">
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

        <section className="rounded-lg border border-buram-border bg-buram-surface p-5">
          <h2 className="border-b border-buram-border pb-3 font-semibold text-buram-text">
            Sequence counters
          </h2>
          {isLoading ? (
            <p className="py-4 text-sm text-buram-muted">Loading counters…</p>
          ) : counters.length === 0 ? (
            <p className="py-4 text-sm text-buram-muted">No sequence counters are registered.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {counters.map((counter) => (
                <div
                  key={counter._id}
                  className="flex items-center justify-between gap-3 rounded border border-buram-border bg-buram-bg/80 p-3 font-mono text-xs"
                >
                  <span className="text-buram-muted">{counter.key}</span>
                  <span className="font-bold text-buram-pale">
                    Next: {counter.prefix}{String(counter.seq + 1).padStart(4, '0')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ReasonDialog
        isOpen={isReasonOpen}
        title={`Create material ${newMaterial.code}`}
        actionSummary={`Register ${newMaterial.name} (${newMaterial.kind}, ${newMaterial.category}) in master data.`}
        confirmLabel="Create audited material"
        isSubmitting={isSaving}
        onCancel={() => setIsReasonOpen(false)}
        onConfirm={createMaterial}
      />
    </div>
  );
};
