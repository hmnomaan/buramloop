import React, { useEffect, useState } from 'react';
import {
  Camera,
  Edit3,
  KeyRound,
  ShieldCheck,
  Upload,
  UserPlus,
  UserRound,
  X,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Plus,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import { UserSession } from '../types/erp';
import { InfoPopoverButton } from '../components/ui/FlowAndInfoPrimitives';
import { ReasonDialog, StatusBadge } from '../components/ui/IndustrialPrimitives';

export type DirectoryUser = {
  _id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  roleId: { _id?: string; name: string; permissions?: string[] } | string;
  createdAt: string;
};

export interface RoleItem {
  _id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem?: boolean;
  isActive?: boolean;
  createdAt?: string;
}

export interface PermissionModuleGroup {
  moduleName: string;
  category: string;
  description: string;
  permissions: Array<{
    key: string;
    label: string;
    description: string;
  }>;
}

export const SYSTEM_PERMISSION_CATALOG: PermissionModuleGroup[] = [
  {
    moduleName: 'Traceability & Verification',
    category: 'TRACE',
    description: 'Product provenance, physical route inspection, and regulatory hold actions',
    permissions: [
      { key: 'trace:read', label: 'Traceability Explorer', description: 'Access product genealogy, lots, and origin certificates' },
      { key: 'trace:admin_route', label: 'Admin Route & Staff View', description: 'Unmask counterparties, plant telemetry, and machine route' },
      { key: 'trace:inspect', label: 'Regulatory Inspection', description: 'Perform official regulatory checks and IFS hold reviews' },
    ],
  },
  {
    moduleName: 'Warehouse & Receiving',
    category: 'WAREHOUSE',
    description: 'Dock receipt, barcode scanning, warm room, and append-only stock ledger',
    permissions: [
      { key: 'stock:read', label: 'Stock & Ledger Read', description: 'View real-time honey stock, drums, and movement logs' },
      { key: 'stock:write', label: 'Lot Intake & Barcodes', description: 'Receive incoming lots, assign barcodes, and record movement' },
      { key: 'warmroom:read', label: 'Warm Cabinets View', description: 'Monitor 2x17 warm room slots and temperature dwell times' },
      { key: 'warmroom:write', label: 'Warm Cabinet Check-In/Out', description: 'Check in drums to warming and transfer to filtration' },
    ],
  },
  {
    moduleName: 'Production & Quality Assurance',
    category: 'PRODUCTION',
    description: 'Blend recipes, 7-stage processing, rework heels, and sensory testing',
    permissions: [
      { key: 'batches:read', label: 'Batch Plans View', description: 'View 6,000 kg blend recipes and feasibility calculations' },
      { key: 'batches:write', label: 'Batch Planning & Lock', description: 'Select drums/rework, simulate feasibility, and lock recipes' },
      { key: 'batches:approve', label: 'Batch QA Approval', description: 'Approve batch recipes for production execution' },
      { key: 'processing:read', label: 'Process Steps View', description: 'Review 7-stage homogenization and filling line runs' },
      { key: 'processing:write', label: 'Execute 7-Stage Process', description: 'Advance filtration, mixing, resting, and packaging stages' },
      { key: 'rework:read', label: 'Rework Inventory View', description: 'Inspect rework stock heels and botanical composition' },
      { key: 'rework:write', label: 'Rework Heel Creation', description: 'Log process leftovers and drum rework allocations' },
      { key: 'qa:approve', label: 'QA In-House Sensory Release', description: 'Gate incoming lot testing and final shipment release' },
      { key: 'qa:inspect', label: 'QA Lab Inspection', description: 'Enter sensory scores and attach QSI lab certificates' },
    ],
  },
  {
    moduleName: 'Sourcing & Outbound Shipments',
    category: 'COMMERCIAL',
    description: 'Gated supplier offers, procurement contracts, and customer dispatch LOTs',
    permissions: [
      { key: 'sourcing:read', label: 'Sourcing Pipeline View', description: 'Inspect supplier offers and gated sourcing pipeline' },
      { key: 'sourcing:write', label: 'Create Offers & Lots', description: 'Submit supplier lots, pricing, and volume offers' },
      { key: 'management:approve', label: 'Commercial Approvals', description: 'Approve contracts and authorize price overrides' },
      { key: 'contracts:write', label: 'Contract Execution', description: 'Draft and finalize legal procurement contracts' },
      { key: 'shipments:read', label: 'Customer Shipments View', description: 'View dispatched customer orders and destination LOTs' },
      { key: 'shipments:write', label: 'Create & Dispatch LOTs', description: 'Generate customer shipment lots and dispatch orders' },
    ],
  },
  {
    moduleName: 'Audit, Compliance & Nextcloud',
    category: 'GOVERNANCE',
    description: 'GoBD mutation trail, CSV exports, and Nextcloud WebDAV document archives',
    permissions: [
      { key: 'audit:read', label: 'GoBD Audit Trail View', description: 'Inspect immutable before/after diffs and event history' },
      { key: 'exports:run', label: 'CSV & Ledger Exports', description: 'Export GoBD movement ledger and compliance data' },
      { key: 'attachments:read', label: 'Nextcloud Document Vault', description: 'Download lab reports, OCR labels, and certificates' },
      { key: 'attachments:write', label: 'Document Uploads', description: 'Upload lab certificates and scanned label assets' },
      { key: 'admin:compliance', label: 'Compliance Governance', description: 'Manage cross-module compliance and regulatory holds' },
    ],
  },
  {
    moduleName: 'Master Data & Administration',
    category: 'ADMIN',
    description: 'Master catalogs, costs & margins, roles, and universal wildcard control',
    permissions: [
      { key: 'master:read', label: 'Master Data Read', description: 'View suppliers, materials, and quality grades' },
      { key: 'master:write', label: 'Master Data Write', description: 'Create and edit suppliers, honey materials, and grades' },
      { key: 'admin:master_data', label: 'Admin Master Data Control', description: 'Master catalog administration and counter overrides' },
      { key: 'admin:costs', label: 'Costs & Margins Access', description: 'View EUR/kg pricing, margin metrics, and valuation' },
      { key: 'roles:read', label: 'Roles & Directory View', description: 'View user directory and system role definitions' },
      { key: '*:*', label: 'Super Administrator', description: 'Universal wildcard access across all platform modules' },
    ],
  },
];

const DEFAULT_FALLBACK_ROLES: RoleItem[] = [
  { _id: 'admin', name: 'Admin', description: 'Full system access including pricing and master overrides', permissions: ['*:*'], isSystem: true, isActive: true },
  { _id: 'management', name: 'Management', description: 'Approves external analysis, reviews batch feasibility and cost reports', permissions: ['management:approve', 'management:view', 'sourcing:read', 'stock:read', 'batches:read', 'batches:approve', 'shipments:read', 'reports:read', 'trace:read', 'exports:run'], isSystem: true, isActive: true },
  { _id: 'qa', name: 'QA', description: 'In-house sensory + QSI lab verification, lot PASS/FAIL gating', permissions: ['sourcing:read', 'qa:approve', 'stock:read', 'batches:read', 'shipments:read', 'attachments:write', 'attachments:read', 'trace:read', 'exports:run'], isSystem: true, isActive: true },
  { _id: 'warehouse', name: 'Warehouse', description: 'Incoming lot receipt, drum listing, warm cabinet check IN/OUT', permissions: ['stock:read', 'stock:write', 'warmroom:read', 'warmroom:write', 'attachments:read', 'attachments:write', 'exports:run'], isSystem: true, isActive: true },
  { _id: 'production', name: 'Production', description: 'Warm cabinet check OUT, filtration, blending, resting tank, filling, rework', permissions: ['warmroom:write', 'warmroom:read', 'batches:read', 'batches:write', 'processing:write', 'processing:read', 'rework:write', 'rework:read', 'attachments:write', 'attachments:read', 'exports:run'], isSystem: true, isActive: true },
  { _id: 'inspector', name: 'Inspector', description: 'Government inspection read-only access (masked commercial data)', permissions: ['trace:read', 'stock:read', 'batches:read', 'shipments:read', 'attachments:read', 'exports:run'], isSystem: true, isActive: true },
];

const inputClass =
  'w-full rounded border border-buram-border bg-buram-bg px-3 py-2 text-sm text-buram-text outline-none focus:border-buram-amber';
const labelClass = 'mb-1 block text-xs font-mono uppercase tracking-wide text-buram-muted';

export const UserAndProfileWorkspace: React.FC<{
  user: UserSession;
  onUserUpdated: (user: UserSession) => void;
  onPasswordChanged: () => void;
}> = ({ user, onUserUpdated, onPasswordChanged }) => {
  const [fullName, setFullName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>(DEFAULT_FALLBACK_ROLES);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReasonDialogOpen, setIsReasonDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    roleName: '',
    expiresAt: '',
  });
  const [editingUser, setEditingUser] = useState<{
    id: string;
    fullName: string;
    email: string;
    roleName: string;
    isActive: boolean;
    password: string;
  } | null>(null);
  const [isUpdateReasonDialogOpen, setIsUpdateReasonDialogOpen] = useState(false);

  // Dynamic Role Editing & Creation State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isCreatingNewRole, setIsCreatingNewRole] = useState(false);
  const [roleForm, setRoleForm] = useState<{
    id?: string;
    name: string;
    description: string;
    permissions: string[];
    isActive: boolean;
  }>({
    name: '',
    description: '',
    permissions: [],
    isActive: true,
  });
  const [isRoleReasonDialogOpen, setIsRoleReasonDialogOpen] = useState(false);
  const [expandedRolePermissionsId, setExpandedRolePermissionsId] = useState<string | null>(null);

  const isAdmin = user.role === 'ADMIN';

  const getRoleName = (roleId: DirectoryUser['roleId']): string =>
    typeof roleId === 'string' ? roleId : roleId?.name ?? 'Unknown';

  const loadRoles = async () => {
    if (!isAdmin) return;
    try {
      setIsLoadingRoles(true);
      const res = await apiClient.request<RoleItem[]>('/master/roles');
      if (Array.isArray(res) && res.length > 0) {
        setRoles(res);
      }
    } catch {
      // Keep default fallback roles if endpoint fails
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const loadUsers = () => {
    if (!isAdmin) return;
    void apiClient
      .request<DirectoryUser[]>('/auth/users')
      .then(setUsers)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load the user directory.')
      );
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      void loadRoles();
    }
  }, [isAdmin]);

  const selectAvatar = (file?: File) => {
    setError('');
    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarFile(null);
      setError('Choose a JPEG, PNG, or WebP profile picture.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarFile(null);
      setError('Profile pictures must be 5 MB or smaller.');
    } else {
      setAvatarFile(file);
    }
  };

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const updated = await apiClient.request<{
        userId: string;
        email: string;
        fullName: string;
        roleName: string;
        permissions: string[];
        avatarAttachmentId?: string | null;
        mustChangePassword?: boolean;
      }>('/auth/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: fullName.trim() }),
      });
      onUserUpdated({
        ...user,
        name: updated.fullName,
        permissions: updated.permissions,
        avatarAttachmentId: updated.avatarAttachmentId ?? null,
      });
      setMessage('Profile updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadAvatar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!avatarFile) return;

    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', avatarFile);
      const res = await apiClient.request<{ avatarAttachmentId: string }>('/auth/profile/avatar', {
        method: 'POST',
        body: formData,
      });
      onUserUpdated({
        ...user,
        avatarAttachmentId: res.avatarAttachmentId,
      });
      setAvatarFile(null);
      setMessage('Profile picture saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload profile picture.');
    } finally {
      setIsSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.request('/auth/change-password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed. Please sign in again with your new password.');
      window.setTimeout(onPasswordChanged, 900);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change your password.');
    } finally {
      setIsSaving(false);
    }
  };

  const createUser = async (reason: string) => {
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const created = await apiClient.auditedMutation<{
        id: string;
        email: string;
        fullName: string;
        roleName: string;
        mustChangePassword: boolean;
      }, Record<string, unknown>>(
        '/auth/users',
        'POST',
        {
          body: {
            name: newUser.name,
            email: newUser.email,
            password: newUser.password,
            roleName: newUser.roleName,
            ...(newUser.expiresAt
              ? { expiresAt: new Date(`${newUser.expiresAt}T23:59:59.999Z`).toISOString() }
              : {}),
          },
          reason,
        }
      );
      setUsers((previous) => [
        {
          _id: created.id,
          email: created.email,
          fullName: created.fullName,
          roleId: { name: created.roleName },
          isActive: true,
          mustChangePassword: created.mustChangePassword,
          createdAt: new Date().toISOString(),
        },
        ...previous,
      ]);
      setNewUser({
        name: '',
        email: '',
        password: '',
        roleName: '',
        expiresAt: '',
      });
      setIsReasonDialogOpen(false);
      setMessage(`User created with role ${created.roleName}. They must change their temporary password at first sign-in.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the user.');
      setIsReasonDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingUser = (entry: DirectoryUser, overrideIsActive?: boolean) => {
    setError('');
    setMessage('');
    setEditingUser({
      id: entry._id,
      fullName: entry.fullName,
      email: entry.email,
      roleName: getRoleName(entry.roleId),
      isActive: overrideIsActive !== undefined ? overrideIsActive : entry.isActive,
      password: '',
    });
    if (overrideIsActive !== undefined) {
      setIsUpdateReasonDialogOpen(true);
    }
  };

  const updateDirectoryUser = async (reason: string) => {
    if (!editingUser) return;
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const updated = await apiClient.auditedMutation<
        {
          id: string;
          email: string;
          fullName: string;
          isActive: boolean;
          mustChangePassword?: boolean;
          roleName?: string;
        },
        Record<string, unknown>
      >(`/master/users/${editingUser.id}`, 'PUT', {
        body: {
          email: editingUser.email.trim(),
          fullName: editingUser.fullName.trim(),
          roleId: editingUser.roleName,
          isActive: editingUser.isActive,
          ...(editingUser.password.trim() ? { password: editingUser.password.trim() } : {}),
        },
        reason,
      });

      setUsers((previous) =>
        previous.map((item) =>
          item._id === editingUser.id
            ? {
                ...item,
                email: updated.email,
                fullName: updated.fullName,
                isActive: updated.isActive,
                mustChangePassword:
                  updated.mustChangePassword ??
                  (editingUser.password.trim() ? true : item.mustChangePassword),
                roleId: { name: updated.roleName ?? editingUser.roleName },
              }
            : item
        )
      );
      setIsUpdateReasonDialogOpen(false);
      setEditingUser(null);
      setMessage(
        `Updated user ${updated.email} (${updated.isActive ? 'Active' : 'Deactivated'}, Role: ${
          updated.roleName ?? editingUser.roleName
        }). Active sessions are invalidated when role, password, or active state changes.`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the user account.');
      setIsUpdateReasonDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamic Role Management Actions
  const openCreateRoleModal = () => {
    setError('');
    setIsCreatingNewRole(true);
    setRoleForm({
      name: '',
      description: '',
      permissions: [],
      isActive: true,
    });
    setIsRoleModalOpen(true);
  };

  const openEditRoleModal = (role: RoleItem) => {
    setError('');
    setIsCreatingNewRole(false);
    setRoleForm({
      id: role._id,
      name: role.name,
      description: role.description || '',
      permissions: [...role.permissions],
      isActive: role.isActive ?? true,
    });
    setIsRoleModalOpen(true);
  };

  const togglePermission = (permKey: string) => {
    setRoleForm((prev) => {
      const exists = prev.permissions.includes(permKey);
      const newPerms = exists
        ? prev.permissions.filter((p) => p !== permKey)
        : [...prev.permissions, permKey];
      return { ...prev, permissions: newPerms };
    });
  };

  const toggleGroupPermissions = (groupKeys: string[]) => {
    setRoleForm((prev) => {
      const allSelected = groupKeys.every((k) => prev.permissions.includes(k));
      let newPerms: string[];
      if (allSelected) {
        newPerms = prev.permissions.filter((p) => !groupKeys.includes(p));
      } else {
        const toAdd = groupKeys.filter((k) => !prev.permissions.includes(k));
        newPerms = [...prev.permissions, ...toAdd];
      }
      return { ...prev, permissions: newPerms };
    });
  };

  const saveRolePermissions = async (reason: string) => {
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const endpoint = roleForm.id ? `/master/roles/${roleForm.id}` : '/master/roles';
      const method = roleForm.id ? 'PUT' : 'POST';

      await apiClient.auditedMutation<RoleItem, Record<string, unknown>>(endpoint, method, {
        body: {
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
          permissions: roleForm.permissions,
          isActive: roleForm.isActive,
        },
        reason,
      });

      await loadRoles();
      setIsRoleReasonDialogOpen(false);
      setIsRoleModalOpen(false);
      setMessage(
        `Role '${roleForm.name}' saved with ${roleForm.permissions.length} authorized module permissions.`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save role permissions.');
      setIsRoleReasonDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Find selected role's permissions for live form preview
  const selectedNewUserRole = roles.find(
    (r) => r.name.toLowerCase() === newUser.roleName.toLowerCase()
  );
  const selectedEditingUserRole = editingUser
    ? roles.find((r) => r.name.toLowerCase() === editingUser.roleName.toLowerCase())
    : null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 sm:space-y-6">
      <header className="flex flex-col items-start justify-between gap-3 border-b border-buram-border pb-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded border border-buram-amber/40 bg-buram-amber/10 p-2 text-buram-amber">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block text-[11px] font-mono uppercase tracking-widest text-buram-amber">
              Identity, profile & access
            </span>
            <h1 className="text-lg font-semibold text-buram-text sm:text-xl">Account & profile</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InfoPopoverButton
            title="Profile & Access Control"
            ruleCode="R2/R14"
            summary="You can update your own name and password. Administrators provision accounts, customize dynamic roles, and configure authorized module permissions with GoBD audit logs."
          />
          <StatusBadge label={`ACTIVE ROLE: ${user.role}`} variant="NOMINAL" />
        </div>
      </header>

      {user.mustChangePassword && (
        <div className="flex gap-2 rounded border border-buram-warning/40 bg-buram-warning/10 p-3 text-sm text-buram-text">
          <ShieldCheck className="h-4 w-4 shrink-0 text-buram-warning" />
          <span>Change your temporary password to finish setting up your account.</span>
        </div>
      )}

      {/* Reason Dialogs */}
      <ReasonDialog
        isOpen={isReasonDialogOpen}
        title={`Create ${newUser.roleName} account`}
        actionSummary={`Create ${newUser.name || 'the new user'} (${newUser.email || 'email not entered'}) with role ${newUser.roleName}. They must change temporary password at first sign-in.`}
        confirmLabel="Create audited account"
        isSubmitting={isSaving}
        onCancel={() => setIsReasonDialogOpen(false)}
        onConfirm={createUser}
      />
      <ReasonDialog
        isOpen={isUpdateReasonDialogOpen}
        title={`Update user account (${editingUser?.email ?? ''})`}
        actionSummary={
          editingUser
            ? `Save ${editingUser.fullName} (${editingUser.email}) with role ${editingUser.roleName}, status ${
                editingUser.isActive ? 'ACTIVE' : 'INACTIVE'
              }${editingUser.password.trim() ? ', and a new temporary password' : ''}.`
            : ''
        }
        confirmLabel="Commit audited user update"
        isSubmitting={isSaving}
        onCancel={() => setIsUpdateReasonDialogOpen(false)}
        onConfirm={updateDirectoryUser}
      />
      <ReasonDialog
        isOpen={isRoleReasonDialogOpen}
        title={`${isCreatingNewRole ? 'Create Dynamic Role' : 'Update Role Permissions'}: ${roleForm.name}`}
        actionSummary={`Commit ${roleForm.permissions.length} authorized module permission(s) for role '${roleForm.name}'. All users assigned this role will inherit updated permissions immediately.`}
        confirmLabel="Commit audited role permissions"
        isSubmitting={isSaving}
        onCancel={() => setIsRoleReasonDialogOpen(false)}
        onConfirm={saveRolePermissions}
      />

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

      {/* PERSONAL PROFILE SECTION */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="min-w-0 space-y-4 rounded-lg border border-buram-border bg-buram-surface p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-buram-text">Personal identity & permissions</h2>
            <StatusBadge label={user.role} variant="NOMINAL" />
          </div>
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-buram-border bg-buram-bg">
              {avatarPreviewUrl ? (
                <img src={avatarPreviewUrl} alt="Preview" className="h-full w-full object-cover" />
              ) : user.avatarAttachmentId ? (
                <img
                  src="/api/auth/profile/avatar"
                  alt={user.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-mono text-xl font-bold text-buram-amber">
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-buram-border bg-buram-bg px-3 py-1.5 text-xs text-buram-text hover:border-buram-amber">
                <Camera className="h-3.5 w-3.5 text-buram-amber" />
                Choose profile picture
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => selectAvatar(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          <form onSubmit={saveProfile} className="space-y-4">
            <label className="block">
              <span className={labelClass}>Full name</span>
              <input
                className={inputClass}
                value={fullName}
                minLength={2}
                maxLength={120}
                required
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Email</span>
              <input className={`${inputClass} opacity-70`} value={user.email} readOnly />
            </label>
            <div className="flex items-center gap-2 text-xs text-buram-muted">
              <ShieldCheck className="h-4 w-4 text-buram-success" />
              Role and permissions are assigned dynamically by the administrator.
            </div>
            <div>
              <span className={labelClass}>Authorized module permissions ({user.permissions.length})</span>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {user.permissions.map((permission) => (
                  <span
                    key={permission}
                    className="max-w-full break-all rounded border border-buram-border bg-buram-bg px-2 py-1 text-[10px] font-mono text-buram-tech"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            </div>
            <button
              disabled={isSaving}
              className="min-h-11 w-full rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50 sm:w-auto"
            >
              Save profile
            </button>
          </form>

          <form onSubmit={uploadAvatar} className="space-y-3 border-t border-buram-border pt-4">
            <p className="text-xs text-buram-muted">JPEG, PNG, or WebP; maximum file size 5 MB.</p>
            <button
              type="submit"
              disabled={!avatarFile || isSaving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded border border-buram-border px-3 py-2 text-sm text-buram-text disabled:opacity-50 sm:w-auto"
            >
              <Upload className="h-4 w-4" /> Upload picture
            </button>
          </form>
        </section>

        <section className="min-w-0 space-y-4 rounded-lg border border-buram-border bg-buram-surface p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-buram-amber" />
            <h2 className="font-semibold text-buram-text">Change password</h2>
          </div>
          <form onSubmit={changePassword} className="space-y-4">
            <label className="block">
              <span className={labelClass}>Current password</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>New password (min 10)</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Confirm new password</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <button
              disabled={isSaving}
              className="min-h-11 w-full rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50 sm:w-auto"
            >
              Update password
            </button>
          </form>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* ADMIN: DYNAMIC ROLES & AUTHORIZED MODULE PERMISSIONS MATRIX               */}
      {/* ========================================================================= */}
      {isAdmin && (
        <section className="min-w-0 space-y-4 rounded-lg border border-buram-amber/40 bg-buram-surface p-4 sm:p-5 shadow-panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-buram-border pb-3">
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5 text-buram-amber" />
              <div>
                <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold font-bold">
                  Dynamic Roles & Module Permissions Matrix
                </h2>
                <p className="text-xs text-buram-muted mt-0.5">
                  Server-authoritative RBAC: Customize authorized module permissions per role or create new dynamic roles.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openCreateRoleModal}
                className="inline-flex items-center gap-1.5 rounded bg-buram-amber px-3 py-1.5 text-xs font-semibold text-buram-ink hover:bg-buram-gold transition-colors shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" /> Create Dynamic Role
              </button>
            </div>
          </div>

          {/* Roles Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((r) => {
              const isExpanded = expandedRolePermissionsId === r._id;
              const userCount = users.filter((u) => getRoleName(u.roleId).toLowerCase() === r.name.toLowerCase()).length;

              return (
                <div
                  key={r._id || r.name}
                  className="rounded-lg border border-buram-border bg-buram-bg p-3.5 flex flex-col justify-between space-y-3 hover:border-buram-amber/60 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-buram-text font-mono">{r.name}</h3>
                          {r.isSystem ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-buram-elevated text-buram-muted border border-buram-border">
                              SYSTEM
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-buram-amber/20 text-buram-gold border border-buram-amber/40">
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-buram-muted mt-1 line-clamp-2">
                          {r.description || 'No description provided'}
                        </p>
                      </div>
                      <StatusBadge
                        label={r.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                        variant={r.isActive !== false ? 'NOMINAL' : 'TECHNICAL'}
                      />
                    </div>

                    <div className="pt-1">
                      <div className="flex items-center justify-between text-xs font-mono text-buram-muted">
                        <span>Assigned users:</span>
                        <span className="text-buram-text font-bold">{userCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono text-buram-muted mt-1">
                        <span>Module permissions:</span>
                        <span className="text-buram-tech font-bold">
                          {r.permissions.includes('*:*') ? 'All (*:*)' : `${r.permissions.length} granted`}
                        </span>
                      </div>
                    </div>

                    {/* Permissions preview */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-buram-border space-y-1.5 animate-in fade-in duration-150">
                        <span className={labelClass}>Authorized module permissions</span>
                        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                          {r.permissions.map((p) => (
                            <span
                              key={p}
                              className="rounded border border-buram-border bg-buram-elevated px-1.5 py-0.5 text-[9px] font-mono text-buram-tech"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-buram-border/60 pt-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRolePermissionsId(isExpanded ? null : r._id)
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-buram-muted hover:text-buram-gold"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Hide perms
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> View perms ({r.permissions.length})
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditRoleModal(r)}
                      className="inline-flex items-center gap-1 rounded border border-buram-border bg-buram-elevated px-2.5 py-1 text-xs font-mono font-bold text-buram-amber hover:border-buram-amber transition-colors"
                    >
                      <Edit3 className="h-3 w-3" /> Edit permissions
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* ROLE PERMISSION EDIT / CREATE MODAL                                       */}
      {/* ========================================================================= */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-mono text-xs">
          <div className="w-full max-w-4xl bg-buram-surface border border-buram-amber/60 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 bg-buram-bg border-b border-buram-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-buram-amber/20 border border-buram-amber/50 flex items-center justify-center text-buram-amber">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-buram-gold font-sans">
                    {isCreatingNewRole ? 'Create New Dynamic Role' : `Edit Authorized Permissions: ${roleForm.name}`}
                  </h3>
                  <p className="text-[11px] text-buram-muted">
                    Toggle authorized module permissions. Changes apply across all assigned users dynamically.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="p-1.5 rounded text-buram-muted hover:text-buram-text hover:bg-buram-elevated"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Role Name *</span>
                  <input
                    className={inputClass}
                    required
                    disabled={!isCreatingNewRole && roles.find((r) => r._id === roleForm.id)?.isSystem}
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="e.g. Senior Shift Supervisor"
                  />
                  {!isCreatingNewRole && roles.find((r) => r._id === roleForm.id)?.isSystem && (
                    <span className="text-[10px] text-buram-muted mt-0.5 block">
                      System role names are immutable, but their module permissions are fully dynamic.
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className={labelClass}>Role Description</span>
                  <input
                    className={inputClass}
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    placeholder="Operational responsibilities and scope"
                  />
                </label>
              </div>

              {/* Grouped Permission Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-buram-border pb-1.5">
                  <span className="font-bold text-buram-amber uppercase tracking-wider text-[11px]">
                    Authorized Module Permissions Matrix ({roleForm.permissions.length} selected)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allKeys = SYSTEM_PERMISSION_CATALOG.flatMap((g) =>
                          g.permissions.map((p) => p.key)
                        );
                        setRoleForm((prev) => ({ ...prev, permissions: allKeys }));
                      }}
                      className="text-[10px] font-mono text-buram-gold hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-buram-muted">|</span>
                    <button
                      type="button"
                      onClick={() => setRoleForm((prev) => ({ ...prev, permissions: [] }))}
                      className="text-[10px] font-mono text-buram-muted hover:text-buram-text"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {SYSTEM_PERMISSION_CATALOG.map((group) => {
                    const groupKeys = group.permissions.map((p) => p.key);
                    const selectedCount = groupKeys.filter((k) =>
                      roleForm.permissions.includes(k)
                    ).length;
                    const allSelected = selectedCount === groupKeys.length;

                    return (
                      <div
                        key={group.category}
                        className="rounded-lg border border-buram-border bg-buram-bg p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between border-b border-buram-border/60 pb-1.5">
                          <div>
                            <span className="font-bold text-buram-text text-xs block font-sans">
                              {group.moduleName}
                            </span>
                            <span className="text-[10px] text-buram-muted">
                              {group.description}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleGroupPermissions(groupKeys)}
                            className="text-[10px] font-mono text-buram-amber hover:underline shrink-0 ml-2"
                          >
                            {allSelected ? 'Clear' : 'All'} ({selectedCount}/{groupKeys.length})
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          {group.permissions.map((perm) => {
                            const isChecked = roleForm.permissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-buram-amber/10 border border-buram-amber/30 text-buram-text'
                                    : 'hover:bg-buram-elevated/60 text-buram-muted'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.key)}
                                />
                                <div className="mt-0.5 shrink-0">
                                  {isChecked ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-buram-amber" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-buram-muted" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`font-mono text-[11px] font-semibold ${
                                        isChecked ? 'text-buram-gold' : 'text-buram-text'
                                      }`}
                                    >
                                      {perm.key}
                                    </span>
                                    <span className="text-[10px] text-buram-muted truncate font-sans">
                                      · {perm.label}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-buram-muted font-sans line-clamp-1">
                                    {perm.description}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-buram-bg border-t border-buram-border flex items-center justify-between shrink-0">
              <span className="text-[11px] text-buram-muted">
                Mandatory GoBD reason will be requested upon confirmation.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-buram-border text-xs text-buram-muted hover:text-buram-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!roleForm.name.trim()}
                  onClick={() => setIsRoleReasonDialogOpen(true)}
                  className="px-4 py-1.5 rounded bg-buram-amber font-semibold text-buram-ink hover:bg-buram-gold transition-colors text-xs disabled:opacity-50"
                >
                  Save Role Permissions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADMIN: USER PROVISIONING & ACCOUNT MANAGEMENT                             */}
      {/* ========================================================================= */}
      {isAdmin && (
        <section className="min-w-0 space-y-4 rounded-lg border border-buram-border bg-buram-surface p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-buram-amber" />
            <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
              Admin user provisioning & account management
            </h2>
            <StatusBadge label="ADMIN CAN CREATE & MANAGE ACCOUNTS" variant="AMBER" />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!newUser.roleName) {
                setError('Select a role before creating the account.');
                return;
              }
              setIsReasonDialogOpen(true);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label>
              <span className={labelClass}>Full name</span>
              <input
                className={inputClass}
                required
                minLength={2}
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </label>
            <label>
              <span className={labelClass}>Email</span>
              <input
                className={inputClass}
                type="email"
                required
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </label>
            <label>
              <span className={labelClass}>Temporary password (min 10)</span>
              <input
                className={inputClass}
                type="password"
                required
                minLength={10}
                maxLength={128}
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </label>
            <label>
              <span className={labelClass}>Role (Any Dynamic Role)</span>
              <select
                className={inputClass}
                required
                aria-label="New user role"
                value={newUser.roleName}
                onChange={(e) => {
                  setError('');
                  setNewUser({ ...newUser, roleName: e.target.value });
                }}
              >
                <option value="" disabled>
                  Select a dynamic role
                </option>
                {roles.map((role) => (
                  <option key={role._id || role.name} value={role.name}>
                    {role.name} {!role.isSystem ? '(Custom)' : ''} ({role.permissions.length} perms)
                  </option>
                ))}
              </select>
            </label>

            {newUser.roleName.toLowerCase() === 'inspector' && (
              <label>
                <span className={labelClass}>Inspector account expires</span>
                <input
                  className={inputClass}
                  type="date"
                  required
                  value={newUser.expiresAt}
                  onChange={(e) => setNewUser({ ...newUser, expiresAt: e.target.value })}
                />
              </label>
            )}

            {/* Live preview of permissions granted by selected role */}
            {selectedNewUserRole && (
              <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-buram-border bg-buram-bg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={labelClass}>
                    Authorized module permissions for {selectedNewUserRole.name} ({selectedNewUserRole.permissions.length})
                  </span>
                  <span className="text-[10px] font-mono text-buram-muted">
                    {selectedNewUserRole.description || 'Dynamic Role'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedNewUserRole.permissions.map((p) => (
                    <span
                      key={p}
                      className="rounded border border-buram-border bg-buram-elevated px-2 py-0.5 text-[10px] font-mono text-buram-tech"
                    >
                      {p}
                    </span>
                  ))}
                  {selectedNewUserRole.permissions.length === 0 && (
                    <span className="text-xs text-buram-muted">No module permissions assigned yet.</span>
                  )}
                </div>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={isSaving || !newUser.roleName}
                className="min-h-11 w-full rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50 sm:w-auto"
              >
                Create {newUser.roleName || 'User'} account
              </button>
            </div>
          </form>

          {/* EDIT EXISTING USER FORM */}
          {editingUser && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (editingUser.password.trim() && editingUser.password.trim().length < 10) {
                  setError('Replacement temporary password must be at least 10 characters.');
                  return;
                }
                setIsUpdateReasonDialogOpen(true);
              }}
              className="space-y-4 rounded-lg border border-buram-amber/40 bg-buram-bg p-4"
            >
              <div className="flex items-center justify-between border-b border-buram-border pb-2">
                <span className="font-mono text-xs uppercase tracking-wider text-buram-amber">
                  Manage Account: {editingUser.email}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="inline-flex items-center gap-1 text-xs text-buram-muted hover:text-buram-text"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label>
                  <span className={labelClass}>Full name</span>
                  <input
                    className={inputClass}
                    required
                    minLength={2}
                    value={editingUser.fullName}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, fullName: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span className={labelClass}>Email</span>
                  <input
                    className={inputClass}
                    type="email"
                    required
                    value={editingUser.email}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span className={labelClass}>Assigned Role (Any Dynamic Role)</span>
                  <select
                    className={inputClass}
                    value={editingUser.roleName}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, roleName: e.target.value })
                    }
                  >
                    {roles.map((role) => (
                      <option key={role._id || role.name} value={role.name}>
                        {role.name} {!role.isSystem ? '(Custom)' : ''} ({role.permissions.length} perms)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Account Status</span>
                  <select
                    className={inputClass}
                    value={editingUser.isActive ? 'ACTIVE' : 'INACTIVE'}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        isActive: e.target.value === 'ACTIVE',
                      })
                    }
                  >
                    <option value="ACTIVE">Active (Sign-in Enabled)</option>
                    <option value="INACTIVE">Deactivated (Revoke Sessions)</option>
                  </select>
                </label>
                <label className="sm:col-span-2 lg:col-span-4">
                  <span className={labelClass}>
                    Reset Temporary Password (Optional, min 10 chars)
                  </span>
                  <input
                    className={inputClass}
                    type="password"
                    minLength={10}
                    maxLength={128}
                    placeholder="Leave blank to keep existing password"
                    value={editingUser.password}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, password: e.target.value })
                    }
                  />
                </label>

                {/* Live preview of permissions for editing user */}
                {selectedEditingUserRole && (
                  <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-buram-border bg-buram-surface p-3 space-y-1.5">
                    <span className={labelClass}>
                      Authorized module permissions for {selectedEditingUserRole.name} ({selectedEditingUserRole.permissions.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {selectedEditingUserRole.permissions.map((p) => (
                        <span
                          key={p}
                          className="rounded border border-buram-border bg-buram-bg px-2 py-0.5 text-[10px] font-mono text-buram-tech"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-10 rounded bg-buram-amber px-4 py-1.5 text-xs font-semibold text-buram-ink disabled:opacity-50"
                >
                  Save account changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="min-h-10 rounded border border-buram-border px-3 py-1.5 text-xs text-buram-muted hover:text-buram-text"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* User directory table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-buram-border text-buram-muted">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-buram-border/40 text-buram-text">
                {users.map((entry) => (
                  <tr key={entry._id} className="hover:bg-buram-bg/50">
                    <td className="p-3">
                      <div className="font-semibold">{entry.fullName}</div>
                      <div className="text-[11px] text-buram-muted">{entry.email}</div>
                    </td>
                    <td className="p-3">
                      <StatusBadge
                        label={getRoleName(entry.roleId)}
                        variant={getRoleName(entry.roleId) === 'Admin' ? 'AMBER' : 'TECHNICAL'}
                      />
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${
                          !entry.isActive
                            ? 'bg-buram-critical/20 text-buram-critical'
                            : entry.mustChangePassword
                              ? 'bg-buram-warning/20 text-buram-warning'
                              : 'bg-buram-success/20 text-buram-success'
                        }`}
                      >
                        {!entry.isActive
                          ? 'DEACTIVATED'
                          : entry.mustChangePassword
                            ? 'TEMP PWD'
                            : 'ACTIVE'}
                      </span>
                    </td>
                    <td className="p-3 text-buram-muted">
                      {new Date(entry.createdAt).toLocaleDateString('de-DE')}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditingUser(entry)}
                          className="inline-flex items-center gap-1 rounded border border-buram-border bg-buram-elevated px-2 py-1 text-xs text-buram-pale hover:border-buram-amber hover:text-buram-gold transition-colors"
                        >
                          <Edit3 className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditingUser(entry, !entry.isActive)}
                          className={`rounded border px-2 py-1 text-xs transition-colors ${
                            entry.isActive
                              ? 'border-buram-border text-buram-muted hover:border-buram-critical hover:text-buram-critical'
                              : 'border-buram-amber text-buram-amber hover:bg-buram-amber/10'
                          }`}
                        >
                          {entry.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td className="p-3 text-buram-muted" colSpan={5}>
                      No user accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {users.map((entry) => (
              <article
                key={entry._id}
                className="min-w-0 space-y-3 rounded border border-buram-border bg-buram-bg p-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold text-buram-text">
                      {entry.fullName}
                    </h3>
                    <p className="break-all text-xs text-buram-muted">{entry.email}</p>
                  </div>
                  <StatusBadge
                    label={getRoleName(entry.roleId)}
                    variant={getRoleName(entry.roleId) === 'Admin' ? 'AMBER' : 'TECHNICAL'}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-buram-muted">
                    Account status:{' '}
                    <span className="text-buram-text">
                      {!entry.isActive
                        ? 'Deactivated'
                        : entry.mustChangePassword
                          ? 'Temporary password'
                          : 'Active'}
                    </span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEditingUser(entry)}
                      className="inline-flex items-center gap-1 rounded border border-buram-border bg-buram-elevated px-2.5 py-1 text-xs font-mono text-buram-pale"
                    >
                      <Edit3 className="h-3 w-3" /> Manage
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditingUser(entry, !entry.isActive)}
                      className="rounded border border-buram-border px-2.5 py-1 text-xs font-mono text-buram-amber"
                    >
                      {entry.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {users.length === 0 && (
              <p className="rounded border border-buram-border p-3 text-sm text-buram-muted">
                No user accounts found.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
