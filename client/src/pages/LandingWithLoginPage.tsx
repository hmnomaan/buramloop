// client/src/pages/LandingWithLoginPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Hexagon,
  Lock,
  ShieldCheck,
  Terminal,
  HardDrive,
  Flame,
  Cpu,
  GitBranch,
  PackageCheck,
  Search,
  Truck,
  CheckCircle2,
  Globe,
  ArrowRight,
  KeyRound,
  Building2,
  Eye,
  EyeOff,
  Activity,
} from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import { toUserSession } from '../lib/authSession';
import { UserSession } from '../types/erp';
import { StatusBadge } from '../components/ui/IndustrialPrimitives';
import { ThemeToggle } from '../components/ui/ThemeToggle';

type Lang = 'EN' | 'DE';

interface RolePreset {
  roleLabel: string;
  roleCode: UserSession['role'];
  email: string;
  badge: string;
  descriptionEn: string;
  descriptionDe: string;
}

const ROLE_PRESETS: RolePreset[] = [
  {
    roleLabel: 'System Admin',
    roleCode: 'ADMIN',
    email: 'admin@buram.de',
    badge: '*:* Full Authority + R9 Costs',
    descriptionEn: 'Full access including Master Data, Counter overrides, and R9 Cost/Margin reports.',
    descriptionDe: 'Vollzugriff inkl. Stammdaten, Nummernkreise und R9 Kosten-/Margenberichte.',
  },
  {
    roleLabel: 'Management',
    roleCode: 'MANAGEMENT',
    email: 'management@buram.de',
    badge: 'management:approve (Gate 2)',
    descriptionEn: 'Approves Purchase Gate 2 (External Analysis) and reviews batch cost reports.',
    descriptionDe: 'Freigabe Einkaufs-Gate 2 (Externer Laborbericht) & Management-Kostenberichte.',
  },
  {
    roleLabel: 'QA Lead (QSI Gate)',
    roleCode: 'QA_LEAD',
    email: 'qa@buram.de',
    badge: 'qa:approve (QSI & Release)',
    descriptionEn: 'In-house sensory + QSI Bremen lab release, lot pass/fail, and Shipment LOT release.',
    descriptionDe: 'Sensorik + QSI Bremen Laborfreigabe, Chargenprüfung und Versand-LOT-Freigabe.',
  },
  {
    roleLabel: 'Production Operator',
    roleCode: 'PLANT_OPERATOR',
    email: 'production@buram.de',
    badge: '2×17 Cabinets & 7-Stage Process',
    descriptionEn: 'Executes 2×17 warm cabinets, batch feasibility, filtration, blending, and filling.',
    descriptionDe: 'Steuert 2×17 Wärmekammern, Chargenplanung, Filtration, Mischung und Abfüllung.',
  },
  {
    roleLabel: 'Warehouse Intake',
    roleCode: 'WAREHOUSE',
    email: 'warehouse@buram.de',
    badge: '290kg Drum Ledger & Scan',
    descriptionEn: 'Receives incoming lots, generates 290kg drum barcodes, and routes warm room drums.',
    descriptionDe: 'Wareneingang, 290-kg-Fass-Serialisierung, Barcode-Scan und Wärmekammer-Buchung.',
  },
  {
    roleLabel: 'Gov. Inspector',
    roleCode: 'INSPECTOR',
    email: 'inspector@buram.de',
    badge: 'Read-Only (Prices Masked)',
    descriptionEn: 'Forward/backward traceability explorer with commercial prices and buyer PII masked.',
    descriptionDe: 'Vorwärts-/Rückwärts-Rückverfolgbarkeit (Preise & Kundendaten maskiert).',
  },
];

interface PipelineStageSpec {
  code: string;
  reqRef: string;
  titleEn: string;
  titleDe: string;
  detailEn: string;
  detailDe: string;
  metric: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PIPELINE_SPECS: PipelineStageSpec[] = [
  {
    code: 'STAGE 01',
    reqRef: 'R1 / R12',
    titleEn: '4-Gate Sourcing & QSI Bremen',
    titleDe: '4-Stufen-Einkauf & QSI Bremen',
    detailEn:
      'Offer → External Analysis (checked by Management) → Sample → In-House Sensory + QSI Certificate → Contract → Shipped.',
    detailDe:
      'Angebot → Externe Analyse (Management-Freigabe) → Muster → Sensorik + QSI-Zertifikat → Vertrag → Versandt.',
    metric: 'management:approve Gate',
    icon: GitBranch,
  },
  {
    code: 'STAGE 02',
    reqRef: 'R3 / R4',
    titleEn: 'Incoming Lot & 290kg Drum Ledger',
    titleDe: 'Wareneingang & 290-kg-Fass-Ledger',
    detailEn:
      'Auto-serializes 290.0 kg quarantine drums with append-only stockMovements. Supports instant return-to-supplier on mismatch.',
    detailDe:
      'Erzeugt 290,0-kg-Quarantänefässer im unveränderlichen Bestandsbuch inkl. Lieferanten-Retoure bei Abweichung.',
    metric: '1 Drum = 290.0 kg',
    icon: PackageCheck,
  },
  {
    code: 'STAGE 03',
    reqRef: 'R5 / R6',
    titleEn: '2 × 17 Warm Cabinets & Feasibility',
    titleDe: '2 × 17 Wärmekammern & Machbarkeit',
    detailEn:
      '34 physical drum slots (9,860 kg capacity, 24–48h at 40–43°C). Non-mutating feasibility simulator & atomic drum locking.',
    detailDe:
      '34 Fass-Stellplätze (9.860 kg Kapazität, 24–48h Wärmung). Machbarkeitssimulator (6t → 9–9,5t) & atomare Reservierung.',
    metric: '34 Slots / 9,860 kg',
    icon: Flame,
  },
  {
    code: 'STAGE 04',
    reqRef: 'R7 / R14',
    titleEn: '7-Stage Processing & Rework Origin[]',
    titleDe: '7-Stufen-Prozess & Rework-Herkunft[]',
    detailEn:
      'WARMING → FILTERING → BLENDING → RESTING TANK → FILLING (Quiel PET / Carlo Jar / Hand). Leftover heels serialize into Rework drums.',
    detailDe:
      'Strikte Massenbilanz (inKg = outKg + lossKg + reworkOutKg). Restmengen erben exakt die Ursprungsländer-Prozente.',
    metric: 'in = out + loss + rework',
    icon: Cpu,
  },
  {
    code: 'STAGE 05',
    reqRef: 'R8 / R13',
    titleEn: 'Shipment LOT (1–3 Country Gate)',
    titleDe: 'Versand-LOT (1–3 Länder-Regel)',
    detailEn:
      '1 Batch splits into N Customer Shipment LOTs. Enforces customer 1–3 allowed origin countries before QA Release & dispatch.',
    detailDe:
      'Prüft 100% der Ursprungsländer gegen die 1–3 erlaubten Länder des Kunden vor QA-Freigabe und Versand.',
    metric: '1–3 Allowed Origins',
    icon: Truck,
  },
  {
    code: 'STAGE 06',
    reqRef: 'R11 / R16',
    titleEn: 'Govt Traceability & Nextcloud Vault',
    titleDe: 'Behörden-Traceability & Nextcloud',
    detailEn:
      'Snapshot-isolated forward/backward genealogy graph and SHA-256 Nextcloud WebDAV document vault.',
    detailDe:
      'Snapshot-isolierte Vorwärts-/Rückwärts-Verfolgung für Lebensmittelkontrolle inkl. SHA-256 Nextcloud-Archiv.',
    metric: 'Snapshot Isolation',
    icon: Search,
  },
];

export const LandingWithLoginPage: React.FC<{
  onAuthenticated: (session: UserSession) => void;
}> = ({ onAuthenticated }) => {
  const [lang, setLang] = useState<Lang>('EN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<RolePreset>(ROLE_PRESETS[0]);
  const [showPassword, setShowPassword] = useState(false);
  const [activeStageIdx, setActiveStageIdx] = useState(0);

  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [storageProviderName, setStorageProviderName] = useState<string>('nextcloud / local');
  const [clockText, setClockText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Plant Clock & Backend Health Probe
  useEffect(() => {
    const updateClock = () => {
      setClockText(
        new Date().toLocaleString('de-DE', {
          timeZone: 'Europe/Berlin',
          dateStyle: 'medium',
          timeStyle: 'medium',
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);

    void (async () => {
      try {
        const health = await apiClient.request<{
          ok: boolean;
          storageProvider?: string;
        }>('/health');
        setApiOnline(Boolean(health.ok));
        if (health.storageProvider) {
          setStorageProviderName(health.storageProvider.toUpperCase());
        }
      } catch {
        setApiOnline(false);
      }
    })();

    return () => clearInterval(timer);
  }, []);

  const handleSelectPreset = (preset: RolePreset) => {
    setSelectedPreset(preset);
    setEmail(preset.email);
    setPassword('');
    setErrorMessage(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.request<{
        token?: string;
        user: {
          id?: string;
          _id?: string;
          email: string;
          fullName?: string;
          role?: string;
          permissions?: string[];
          avatarAttachmentId?: string | null;
          mustChangePassword?: boolean;
        };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.token) {
        apiClient.setBearerToken(res.token);
      }

      onAuthenticated(toUserSession(res.user));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : lang === 'EN'
            ? 'Authentication failed. Check your credentials and try again.'
            : 'Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen und erneut versuchen.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStage = PIPELINE_SPECS[activeStageIdx];

  return (
    <div className="min-h-screen bg-buram-bg text-buram-text flex flex-col justify-between selection:bg-buram-amber selection:text-buram-ink">
      {/* 1. TOP MISSION-CONTROL TELEMETRY BAR */}
      <header className="border-b border-buram-border bg-buram-surface/95 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 rounded bg-buram-amber/15 border border-buram-amber flex items-center justify-center shadow-amberGlow">
              <Hexagon className="w-5 h-5 text-buram-amber fill-buram-amber/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold tracking-wider text-base text-buram-text">
                  BURAMLOOP
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-buram-amber/20 text-buram-gold border border-buram-amber/40">
                  ERP • CTX-V31
                </span>
              </div>
              <span className="text-[11px] font-mono text-buram-muted block">
                BURAM GMBH • FABRIKSTRASSE 9A • 16761 HENNIGSDORF
              </span>
            </div>
          </div>

          {/* Live System Telemetry + Language Switcher */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2.5 px-3 py-1 rounded bg-buram-bg border border-buram-border text-xs font-mono">
              <Terminal className="w-3.5 h-3.5 text-buram-tech" />
              <span className="text-buram-muted">REPLICA SET rs0:</span>
              <span className={apiOnline ? 'text-buram-success' : 'text-buram-gold'}>
                {apiOnline === null ? 'PROBING...' : apiOnline ? 'ONLINE' : 'STANDALONE READY'}
              </span>
              <span className="text-buram-border">|</span>
              <HardDrive className="w-3.5 h-3.5 text-buram-amber" />
              <span className="text-buram-muted">VAULT:</span>
              <span className="text-buram-pale">{storageProviderName}</span>
            </div>

            {clockText && (
              <span className="hidden xl:inline-block text-xs font-mono text-buram-muted tabular-nums">
                {clockText} CET
              </span>
            )}

            <ThemeToggle />

            <button
              type="button"
              onClick={() => setLang((l) => (l === 'EN' ? 'DE' : 'EN'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-buram-elevated border border-buram-border text-xs font-mono text-buram-gold hover:border-buram-amber"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'EN' ? 'EN | DE' : 'DE | EN'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN HERO + SPLIT LANDING & AUTHENTICATION GATEWAY */}
      <main className="max-w-7xl mx-auto w-full px-6 py-10 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT 7 COLUMNS: INDUSTRIAL MISSION CONTROL & TRACEABILITY ARCHITECTURE */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-buram-amber/15 border border-buram-amber/40 text-xs font-mono text-buram-gold">
              <Activity className="w-3.5 h-3.5 text-buram-amber" />
              <span>
                {lang === 'EN'
                  ? 'IFS FOOD V8 CERTIFIED FACILITY • QSI BREMEN LAB VERIFIED • HONIGV'
                  : 'IFS FOOD V8 ZERTIFIZIERTES WERK • QSI BREMEN LABOR • HONIGVERORDNUNG'}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-buram-text leading-tight">
                {lang === 'EN' ? (
                  <>
                    Honey Operations Intelligence &{' '}
                    <span className="text-buram-gold">End-to-End Government Traceability</span>
                  </>
                ) : (
                  <>
                    Honig-Produktionsintelligenz &{' '}
                    <span className="text-buram-gold">Lückenlose Behörden-Rückverfolgbarkeit</span>
                  </>
                )}
              </h1>
              <p className="text-sm text-buram-muted leading-relaxed max-w-2xl">
                {lang === 'EN'
                  ? 'Engineered for Buram GmbH in Hennigsdorf near Berlin. Every 290.0 kg steel drum, warm cabinet cycle (2 × 17 positions), 7-stage homogenizer batch, rework heel, and customer Shipment LOT is governed by ACID MongoDB replica-set transactions and immutable Nextcloud WebDAV certificates.'
                  : 'Entwickelt für die Buram GmbH in Hennigsdorf bei Berlin. Jedes 290,0-kg-Honigfass, jeder Wärmekammer-Zyklus (2 × 17 Stellplätze), jede 7-Stufen-Charge, jedes Rework-Fass und jedes Versand-LOT wird über ACID-Transaktionen und unveränderliche Nextcloud-Zertifikate gesichert.'}
              </p>
            </div>

            {/* LIVE PLANT TELEMETRY STRIP */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
              <div className="p-3.5 rounded-lg bg-buram-surface border border-buram-border shadow-panel">
                <span className="text-[10px] text-buram-muted uppercase block">
                  {lang === 'EN' ? 'STANDARD DRUM UNIT' : 'FASS-EINHEIT (R4)'}
                </span>
                <span className="text-lg font-bold text-buram-gold mt-0.5 block">290.0 kg</span>
                <span className="text-[11px] text-buram-success">Append-Only Ledger</span>
              </div>

              <div className="p-3.5 rounded-lg bg-buram-surface border border-buram-border shadow-panel">
                <span className="text-[10px] text-buram-muted uppercase block">
                  {lang === 'EN' ? 'WARM ROOM MATRIX' : 'WÄRMEKAMMER (R5)'}
                </span>
                <span className="text-lg font-bold text-buram-tech mt-0.5 block">2 × 17 Drums</span>
                <span className="text-[11px] text-buram-muted">34 Slots (9,860 kg)</span>
              </div>

              <div className="p-3.5 rounded-lg bg-buram-surface border border-buram-border shadow-panel">
                <span className="text-[10px] text-buram-muted uppercase block">
                  {lang === 'EN' ? 'BATCH BUFFER (R6)' : 'CHARGEN-PUFFER (R6)'}
                </span>
                <span className="text-lg font-bold text-buram-text mt-0.5 block">6t → 9–9.5t</span>
                <span className="text-[11px] text-buram-gold">100% Origin[] Math</span>
              </div>

              <div className="p-3.5 rounded-lg bg-buram-surface border border-buram-border shadow-panel">
                <span className="text-[10px] text-buram-muted uppercase block">
                  {lang === 'EN' ? 'COUNTRY RULE (R8)' : 'LÄNDER-REGEL (R8)'}
                </span>
                <span className="text-lg font-bold text-buram-success mt-0.5 block">1–3 Origins</span>
                <span className="text-[11px] text-buram-muted">0.0% Blocked Tol.</span>
              </div>
            </div>

            {/* INTERACTIVE 6-STAGE TRACEABILITY ARCHITECTURE EXPLORER */}
            <div className="bg-buram-surface border border-buram-border rounded-lg p-5 shadow-panel space-y-4">
              <div className="flex items-center justify-between border-b border-buram-border pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-buram-amber block">
                    {lang === 'EN'
                      ? 'INTERACTIVE ARCHITECTURE MAP (CLICK ANY STAGE)'
                      : 'INTERAKTIVE SYSTEMARCHITEKTUR (STUFE WÄHLEN)'}
                  </span>
                  <h2 className="text-sm font-semibold text-buram-text mt-0.5">
                    {lang === 'EN'
                      ? 'From QSI Bremen Lab Gate to Government Inspection Certificate'
                      : 'Vom QSI Bremen Labor-Gate bis zum amtlichen Ursprungszertifikat'}
                  </h2>
                </div>
                <StatusBadge label={activeStage.reqRef} variant="AMBER" />
              </div>

              {/* Stage Selector Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PIPELINE_SPECS.map((stage, idx) => {
                  const Icon = stage.icon;
                  const isSelected = idx === activeStageIdx;
                  return (
                    <button
                      key={stage.code}
                      type="button"
                      onClick={() => setActiveStageIdx(idx)}
                      className={`p-2.5 rounded border text-left font-mono transition-all ${
                        isSelected
                          ? 'bg-buram-amber/15 border-buram-amber text-buram-text ring-1 ring-buram-gold shadow-amberGlow'
                          : 'bg-buram-bg/70 border-buram-border text-buram-muted hover:text-buram-text hover:border-buram-amber/40'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-buram-gold font-bold">{stage.code}</span>
                        <Icon className="w-3.5 h-3.5 text-buram-amber" />
                      </div>
                      <div className="text-xs font-semibold truncate mt-1 font-sans">
                        {lang === 'EN' ? stage.titleEn : stage.titleDe}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Stage Inspector Box */}
              <div className="p-4 rounded bg-buram-bg/90 border border-buram-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="font-bold text-buram-gold">{activeStage.code}</span>
                    <span>•</span>
                    <span className="text-buram-tech font-semibold">
                      {lang === 'EN' ? activeStage.titleEn : activeStage.titleDe}
                    </span>
                  </div>
                  <p className="text-xs text-buram-muted leading-relaxed">
                    {lang === 'EN' ? activeStage.detailEn : activeStage.detailDe}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge label={activeStage.metric} variant="NOMINAL" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLUMNS: MISSION-CONTROL OPERATOR & INSPECTOR LOGIN TERMINAL */}
          <div className="lg:col-span-5">
            <div className="bg-buram-surface border border-buram-amber/60 rounded-xl p-6 shadow-panel relative overflow-hidden">
              <div className="bg-honeycomb-header -mx-6 -mt-6 px-6 py-4 border-b border-buram-border mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-5 h-5 text-buram-amber" />
                  <div>
                    <h2 className="text-base font-bold text-buram-text font-mono">
                      {lang === 'EN'
                        ? 'STATION AUTHENTICATION TERMINAL'
                        : 'WERK-ANMELDETERMINAL'}
                    </h2>
                    <span className="text-[11px] font-mono text-buram-muted block">
                      POST /api/v1/auth/login • RBAC JWT + httpOnly
                    </span>
                  </div>
                </div>
                <StatusBadge label="TLS / ARGON2ID" variant="NOMINAL" />
              </div>

              {/* 1-CLICK SEEDED ROLE PRESETS FOR IMMEDIATE TESTING */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-[11px] font-mono text-buram-muted uppercase mb-2">
                  <span>
                    {lang === 'EN'
                      ? '1-Click Role Presets (Seeded Accounts)'
                      : '1-Klick Rollen-Schnellwahl (Seed-Konten)'}
                  </span>
                  <span className="text-buram-gold">{selectedPreset.roleCode}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-xs">
                  {ROLE_PRESETS.map((preset) => {
                    const isSelected = selectedPreset.roleCode === preset.roleCode;
                    return (
                      <button
                        key={preset.roleCode}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`px-2.5 py-2 rounded border text-left transition-all ${
                          isSelected
                            ? 'bg-buram-amber text-buram-ink font-bold border-buram-gold shadow-amberGlow'
                            : 'bg-buram-bg text-buram-pale border-buram-border hover:border-buram-amber/50'
                        }`}
                      >
                        <div className="truncate text-[11px]">{preset.roleLabel}</div>
                        <div
                          className={`text-[9px] truncate ${
                            isSelected ? 'text-buram-ink/80' : 'text-buram-muted'
                          }`}
                        >
                          {preset.email}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 p-2.5 rounded bg-buram-bg/70 border border-buram-border text-[11px] text-buram-muted">
                  <span className="font-mono font-bold text-buram-gold">
                    [{selectedPreset.badge}]
                  </span>{' '}
                  {lang === 'EN' ? selectedPreset.descriptionEn : selectedPreset.descriptionDe}
                </div>
              </div>

              {/* LOGIN FORM */}
              <form onSubmit={handleLoginSubmit} className="space-y-4 font-mono text-xs">
                <div>
                  <label
                    htmlFor="buram-login-email"
                    className="block text-buram-muted uppercase mb-1"
                  >
                    {lang === 'EN' ? 'Operator / Inspector Email *' : 'E-Mail-Adresse *'}
                  </label>
                  <input
                    id="buram-login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-buram-bg border border-buram-border rounded px-3.5 py-2.5 text-sm text-buram-text focus:border-buram-amber"
                  />
                </div>

                <div>
                  <label
                    htmlFor="buram-login-password"
                    className="block text-buram-muted uppercase mb-1"
                  >
                    {lang === 'EN' ? 'Security Passkey *' : 'Sicherheitspasswort *'}
                  </label>
                  <div className="relative">
                    <input
                      id="buram-login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-buram-bg border border-buram-border rounded pl-3.5 pr-10 py-2.5 text-sm text-buram-text focus:border-buram-amber"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-buram-muted hover:text-buram-text"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3 rounded bg-buram-critical/15 border border-buram-critical/50 text-buram-critical text-xs">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded bg-buram-amber text-buram-ink font-bold uppercase tracking-wider hover:bg-buram-gold shadow-amberGlow flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? lang === 'EN'
                        ? 'Verifying Credentials & Role...'
                        : 'Authentifizierung läuft...'
                      : lang === 'EN'
                      ? `Launch Mission Control as ${selectedPreset.roleLabel}`
                      : `Mission Control starten (${selectedPreset.roleLabel})`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-buram-border/60 flex items-center justify-between text-[11px] font-mono text-buram-muted">
                <span className="inline-flex items-center gap-1 text-buram-success">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {lang === 'EN' ? 'Every login recorded in auditLogs' : 'Login wird in auditLogs protokolliert'}
                </span>
                <span>STATION: DE-BB-HND-01</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. VERIFIED GERMAN COMMERCIAL REGISTER FOOTER (IMPRESSUM — HRB 13289 NP) */}
      <footer className="border-t border-buram-border bg-buram-surface/80 py-6 px-6 text-xs text-buram-muted font-mono">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-buram-amber shrink-0" />
            <span>
              <strong className="text-buram-text">Buram GmbH</strong> • Fabrikstraße 9a, 16761
              Hennigsdorf, Germany • Tel: +49 3302 203380 • info@buram.de
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span>Geschäftsführer: Önder Cakirci, Cengiz Manav</span>
            <span>•</span>
            <span>Amtsgericht Neuruppin • HRB 13289 NP</span>
            <span>•</span>
            <span>USt-IdNr.: DE814486712</span>
          </div>
        </div>
      </footer>
    </div>
  );
};