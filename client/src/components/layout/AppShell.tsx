// client/src/components/layout/AppShell.tsx
import React, { useEffect, useState } from 'react';
import {
  Activity,
  GitBranch,
  PackageCheck,
  Database,
  Flame,
  Layers,
  Cpu,
  Truck,
  Lock,
  Search,
  FileSpreadsheet,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Hexagon,
  ShieldCheck,
  HardDrive,
  Terminal,
  LogOut,
  UserRound,
  Settings2,
  Camera,
} from 'lucide-react';
import { UserSession } from '../../types/erp';
import { StatusBadge } from '../ui/IndustrialPrimitives';
import { ProcessFlowBreadcrumb } from '../ui/FlowAndInfoPrimitives';
import { ThemeToggle } from '../ui/ThemeToggle';
import {
  canAccessModule,
  canReceiveIncomingLots,
  ModuleKey,
} from '../../lib/moduleAccess';

export type { ModuleKey } from '../../lib/moduleAccess';

interface NavItem {
  key: ModuleKey;
  label: string;
  shortCode: string;
  stepStatus: 'LIVE' | '5G' | '5H' | '5I' | '5J' | '5K';
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'DASHBOARD', label: 'Operations Mission Control', shortCode: 'OPS-00', stepStatus: 'LIVE', icon: Activity },
  { key: 'SOURCING', label: 'Gated Sourcing Pipeline', shortCode: 'SRC-5C', stepStatus: 'LIVE', icon: GitBranch },
  { key: 'INCOMING_QA', label: 'Lot Intake & QA', shortCode: 'LOT-5D', stepStatus: 'LIVE', icon: PackageCheck },
  { key: 'WAREHOUSE_STOCK', label: 'Stock & Ledger', shortCode: 'STK-5D', stepStatus: 'LIVE', icon: Database },
  { key: 'WARM_CABINETS', label: 'Warm Cabinets (2×17)', shortCode: 'CAB-5F', stepStatus: 'LIVE', icon: Flame },
  { key: 'BATCH_PLANNING', label: 'Batch Feasibility & Lock', shortCode: 'BAT-5F', stepStatus: 'LIVE', icon: Layers },
  { key: 'PROCESSING', label: 'Processing & Filling (7-Stage)', shortCode: 'PRC-5G', stepStatus: '5G', icon: Cpu },
  { key: 'SHIPMENTS', label: 'Customer & Shipment LOTs', shortCode: 'SHP-5H', stepStatus: '5H', icon: Truck },
  { key: 'ADMIN_COSTS', label: 'Costs, Margins & Reports', shortCode: 'FIN-5I', stepStatus: '5I', icon: Lock },
  { key: 'TRACEABILITY', label: 'Govt Inspection Trace', shortCode: 'TRC-5J', stepStatus: '5J', icon: Search },
  { key: 'AUDIT_DOCS', label: 'Audit, Nextcloud & Exports', shortCode: 'AUD-5E', stepStatus: 'LIVE', icon: FileSpreadsheet },
  { key: 'USER_PROFILE', label: 'My Profile & Password', shortCode: 'USR-01', stepStatus: 'LIVE', icon: UserRound },
  { key: 'MASTER_DATA', label: 'Master Data', shortCode: 'MST-5B', stepStatus: 'LIVE', icon: Settings2 },
];

export const AppShell: React.FC<{
  user: UserSession;
  activeModule: ModuleKey;
  onSelectModule: (m: ModuleKey) => void;
  apiOnline: boolean;
  nextcloudOnline: boolean;
  lastSyncIso: string | null;
  unreadNotificationsCount: number;
  onLogout: () => void;
  onOpenMobileScanner: () => void;
  children: React.ReactNode;
}> = ({
  user,
  activeModule,
  onSelectModule,
  apiOnline,
  nextcloudOnline,
  lastSyncIso,
  unreadNotificationsCount,
  onLogout,
  onOpenMobileScanner,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [warehouseExpanded, setWarehouseExpanded] = useState(
    activeModule === 'INCOMING_QA' || activeModule === 'WAREHOUSE_STOCK'
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (activeModule === 'INCOMING_QA' || activeModule === 'WAREHOUSE_STOCK') {
      setWarehouseExpanded(true);
    }
  }, [activeModule]);

  const selectModule = (module: ModuleKey) => {
    if (!canAccessModule(user, module)) return;
    onSelectModule(module);
    setMobileMenuOpen(false);
  };

  const visibleNavItems = NAV_ITEMS.filter((item) => canAccessModule(user, item.key));
  const warehouseItems = visibleNavItems.filter(
    (item) => item.key === 'INCOMING_QA' || item.key === 'WAREHOUSE_STOCK'
  );
  const firstWarehouseItem = warehouseItems[0];

  const renderNavItem = (item: NavItem, nested = false) => {
    const Icon = item.icon;
    const isActive = activeModule === item.key;

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => selectModule(item.key)}
        className={`w-full flex items-center justify-between rounded text-left text-xs font-medium transition-colors ${
          nested
            ? collapsed
              ? 'px-3 py-2.5 justify-center'
              : 'px-3 py-2.5 pl-8'
            : 'px-3 py-2.5'
        } ${
          isActive
            ? 'bg-buram-elevated text-buram-gold border-l-2 border-buram-amber shadow-panel'
            : 'text-buram-muted hover:bg-buram-elevated/60 hover:text-buram-text'
        }`}
        title={`${item.label} (${item.shortCode})`}
        aria-label={collapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4 h-4 shrink-0 ${
              isActive ? 'text-buram-amber' : 'text-buram-muted'
            }`}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen flex bg-buram-bg text-buram-text selection:bg-buram-amber selection:text-buram-ink">
      {/* LEFT MISSION-CONTROL SIDEBAR */}
      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        id="primary-erp-navigation"
        className={`${
          mobileMenuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        } fixed inset-y-0 left-0 z-50 h-screen w-72 transition-all duration-200 bg-buram-surface border-r border-buram-border flex flex-col justify-between md:visible md:sticky md:top-0 md:z-auto md:translate-x-0 ${
          collapsed ? 'md:w-20' : 'md:w-72'
        } md:shrink-0`}
        aria-label="Primary ERP Module Navigation"
      >
        <div>
          {/* Brand Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-buram-border bg-honeycomb-header">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded bg-buram-amber/15 border border-buram-amber flex items-center justify-center shrink-0 shadow-amberGlow">
                <Hexagon className="w-5 h-5 text-buram-amber fill-buram-amber/20" />
              </div>
              {!collapsed && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold tracking-wider text-sm text-buram-text">
                      BURAMLOOP
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-buram-amber/20 text-buram-gold rounded">
                      v20
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-buram-muted block truncate">
                    HENNIGSDORF • ERP-OPS
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="hidden p-1.5 rounded text-buram-muted hover:text-buram-text hover:bg-buram-elevated md:block"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-2.5 space-y-1">
            {visibleNavItems.map((item) => {
              if (item.key === 'INCOMING_QA' || item.key === 'WAREHOUSE_STOCK') {
                if (item.key !== firstWarehouseItem?.key) return null;
                const warehouseActive =
                  activeModule === 'INCOMING_QA' || activeModule === 'WAREHOUSE_STOCK';

                return (
                  <section key="WAREHOUSE" aria-label="Warehouse navigation">
                    <button
                      type="button"
                      onClick={() => setWarehouseExpanded((expanded) => !expanded)}
                      className={`w-full flex items-center justify-between rounded px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                        warehouseActive
                          ? 'text-buram-gold'
                          : 'text-buram-muted hover:bg-buram-elevated/60 hover:text-buram-text'
                      }`}
                      title="Show or hide Warehouse workspaces"
                      aria-label={collapsed ? 'Toggle Warehouse navigation' : undefined}
                      aria-expanded={warehouseExpanded}
                      aria-controls="warehouse-subnavigation"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Database className={`h-4 w-4 shrink-0 ${warehouseActive ? 'text-buram-amber' : ''}`} />
                        {!collapsed && <span className="truncate">Warehouse</span>}
                      </span>
                      {!collapsed && (
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            warehouseExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </button>
                    <div
                      id="warehouse-subnavigation"
                      className="mt-1 space-y-1"
                      hidden={!warehouseExpanded}
                    >
                      {warehouseItems.map((warehouseItem) => renderNavItem(warehouseItem, true))}
                    </div>
                  </section>
                );
              }

              return renderNavItem(item);
            })}
          </nav>
        </div>

        {/* Footer Station Telemetry */}
        <div className="p-3 border-t border-buram-border bg-buram-bg/50 text-xs font-mono">
          {!collapsed ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-buram-muted">
                <span>STATION</span>
                <span className="text-buram-text">{user.stationId}</span>
              </div>
              <div className="flex items-center justify-between text-buram-muted">
                <span>ROLE</span>
                <span className="text-buram-success">{user.role}</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title={`Station: ${user.stationId}`}>
              <ShieldCheck className="w-4 h-4 text-buram-success" />
            </div>
          )}
        </div>
      </aside>

      {/* MAIN OPERATIONS COLUMN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP COMMAND BAR */}
        <header className="min-h-16 bg-buram-surface border-b border-buram-border px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          {/* Global Entity Lookup (Lots, Drums, Batches) */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3 flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-buram-border bg-buram-elevated text-buram-text hover:border-buram-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-buram-amber md:hidden"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="primary-erp-navigation"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="relative flex min-w-0 flex-1 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="w-4 h-4 text-buram-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search LOT, drum, batch, supplier..."
                  aria-label="Global entity traceability lookup"
                  className="w-full bg-buram-bg border border-buram-border rounded pl-9 pr-2 sm:pr-16 py-2 sm:py-1.5 text-xs text-buram-text placeholder-buram-muted/60 focus:border-buram-amber font-mono"
                />
                <kbd className="hidden sm:block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 bg-buram-elevated text-buram-muted rounded border border-buram-border">
                  ⌘K
                </kbd>
              </div>
              {canReceiveIncomingLots(user) && (
                <button
                  type="button"
                  onClick={onOpenMobileScanner}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded border border-buram-tech/50 bg-buram-tech/10 px-2.5 text-xs font-mono text-buram-tech hover:bg-buram-tech/20 sm:px-3"
                  aria-label="Scan a supplier lot barcode for warehouse intake"
                  title="Scan a supplier lot barcode and place it in the receiving form"
                >
                  <Camera className="h-4 w-4" />
                  <span className="hidden sm:inline">Scan for intake</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Telemetry & Role Controls */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-4">
            <ThemeToggle />
            {/* Real Connection Status */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded bg-buram-bg border border-buram-border text-xs font-mono">
              <Terminal className="w-3.5 h-3.5 text-buram-tech" />
              <span className="text-buram-muted">API:</span>
              <span className={apiOnline ? 'text-buram-success' : 'text-buram-warning'}>
                {apiOnline ? 'CONNECTED' : 'FALLBACK SNAPSHOT'}
              </span>
              <span className="text-buram-border">|</span>
              <HardDrive className="w-3.5 h-3.5 text-buram-amber" />
              <span className="text-buram-muted">NEXTCLOUD:</span>
              <span className={nextcloudOnline ? 'text-buram-success' : 'text-buram-warning'}>
                {nextcloudOnline ? 'WEBDAV OK' : 'DEGRADED'}
              </span>
            </div>

            {/* Last Synced Timestamp */}
            {lastSyncIso && (
              <div className="hidden xl:block text-[11px] font-mono text-buram-muted tabular-nums">
                SYNC: {new Date(lastSyncIso).toLocaleTimeString('de-DE')} CET
              </div>
            )}

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => selectModule('AUDIT_DOCS')}
              className="relative p-2 rounded bg-buram-elevated border border-buram-border text-buram-text hover:border-buram-amber"
              aria-label={`Notifications (${unreadNotificationsCount} unread)`}
            >
              <Bell className="w-4 h-4 text-buram-gold" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-buram-critical text-white tabular-nums">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Authenticated user actions */}
            <div className="flex items-center gap-2 pl-2 border-l border-buram-border">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-medium text-buram-text">{user.name}</div>
                <div className="text-[10px] font-mono text-buram-amber">{user.role}</div>
              </div>
              <button
                type="button"
                onClick={() => selectModule('USER_PROFILE')}
                className="p-2 rounded bg-buram-elevated border border-buram-border text-buram-text hover:border-buram-amber"
                aria-label="Open profile and password settings"
                title="Profile and password"
              >
                {user.avatarAttachmentId ? (
                  <img
                    className="h-5 w-5 rounded-full object-cover"
                    src={`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/profile/avatar`}
                    alt=""
                  />
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-2 bg-buram-elevated border border-buram-border rounded px-2 py-1.5 text-xs font-mono text-buram-pale hover:border-buram-amber"
                aria-label="Lock station and sign out"
                title="Lock the station and sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline">LOCK / EXIT</span>
              </button>
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {activeModule !== 'USER_PROFILE' && (
            <ProcessFlowBreadcrumb
              user={user}
              activeModule={activeModule}
              onSelectModule={selectModule}
            />
          )}
          <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
};