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
} from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import { UserSession } from '../types/erp';
import { InfoPopoverButton } from '../components/ui/FlowAndInfoPrimitives';
import { ReasonDialog, StatusBadge } from '../components/ui/IndustrialPrimitives';

type DirectoryUser = {
  _id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  roleId: { _id?: string; name: string } | string;
  createdAt: string;
};

const ROLES = ['Admin', 'Management', 'QA', 'Warehouse', 'Production', 'Inspector'] as const;
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

  const isAdmin = user.role === 'ADMIN';

  const getRoleName = (roleId: DirectoryUser['roleId']): string =>
    typeof roleId === 'string' ? roleId : roleId?.name ?? 'Unknown';

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
    if (!isAdmin) return;
    void apiClient
      .request<DirectoryUser[]>('/auth/users')
      .then(setUsers)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load the user directory.')
      );
  }, [isAdmin]);

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
        id: string;
        email: string;
        fullName: string;
        avatarAttachmentId?: string | null;
      }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName }),
      });
      onUserUpdated({
        ...user,
        id: updated.id,
        name: updated.fullName,
        avatarAttachmentId: updated.avatarAttachmentId ?? null,
      });
      setMessage('Profile saved.');
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
      formData.set('file', avatarFile);
      const result = await apiClient.request<{ avatarAttachmentId: string }>(
        '/auth/profile/avatar',
        { method: 'POST', body: formData }
      );
      onUserUpdated({ ...user, avatarAttachmentId: result.avatarAttachmentId });
      setAvatarFile(null);
      setMessage('Profile picture uploaded.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload the profile picture.');
    } finally {
      setIsSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
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
      setMessage('User created. They must change their temporary password at first sign-in.');
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
          <InfoPopoverButton
            ruleCode="R2 / R14"
            title="Identity, password and role"
            summary="You can update your own name and password. Administrators create and manage accounts with an audited reason; role permissions remain server-controlled."
            bullets={[
              'New accounts must change their temporary password before using the application.',
              'Password, role, and deactivation updates invalidate existing sessions.',
              'Profile pictures are private to the account owner and Admin.',
            ]}
          />
        </div>
        <div className="max-w-full">
          <StatusBadge label={`ACTIVE ROLE: ${user.role}`} variant="NOMINAL" />
        </div>
      </header>

      {user.mustChangePassword && (
        <div className="flex gap-2 rounded border border-buram-warning/40 bg-buram-warning/10 p-3 text-sm text-buram-text">
          <ShieldCheck className="h-4 w-4 shrink-0 text-buram-warning" />
          <span>Change your temporary password to finish setting up your account.</span>
        </div>
      )}
      <ReasonDialog
        isOpen={isReasonDialogOpen}
        title={`Create ${newUser.roleName} account`}
        actionSummary={`Create ${newUser.name || 'the new user'} (${newUser.email || 'email not entered'}) with a temporary password. They must change it at first sign-in.`}
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

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 space-y-5 rounded-lg border border-buram-border bg-buram-surface p-4 shadow-panel sm:p-5">
          <h2 className="font-mono text-sm uppercase tracking-wider text-buram-gold">
            Personal identity & permissions
          </h2>
          <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-buram-amber bg-buram-amber/15 font-semibold text-buram-gold">
              {avatarPreviewUrl ? (
                <img
                  src={avatarPreviewUrl}
                  alt="Selected profile picture preview"
                  className="h-full w-full object-cover"
                />
              ) : user.avatarAttachmentId ? (
                <img
                  src={`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/profile/avatar`}
                  alt={`${user.name}'s profile picture`}
                  className="h-full w-full object-cover"
                />
              ) : (
                user.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-buram-text">{user.name}</p>
              <p className="truncate text-xs text-buram-muted">{user.email}</p>
              <label className="mt-2 inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded border border-buram-border bg-buram-elevated px-3 py-1.5 text-xs text-buram-pale hover:border-buram-amber">
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
              Role and permissions are assigned by an administrator.
            </div>
            <div>
              <span className={labelClass}>Authorized module permissions ({user.permissions.length})</span>
              <div className="flex flex-wrap gap-1.5">
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
              <span className={labelClass}>New password (at least 10 characters)</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
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
                minLength={10}
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <button
              disabled={isSaving}
              className="min-h-11 w-full rounded border border-buram-amber px-4 py-2 text-sm text-buram-gold disabled:opacity-50 sm:w-auto"
            >
              Update password
            </button>
          </form>
        </section>
      </div>

      {isAdmin && (
        <section className="min-w-0 space-y-5 rounded-lg border border-buram-amber/50 bg-buram-surface p-4 shadow-panel sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
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
              <span className={labelClass}>Role</span>
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
                  Select a role
                </option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            {newUser.roleName === 'Inspector' && (
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
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={isSaving || !newUser.roleName}
                className="min-h-11 w-full rounded bg-buram-amber px-4 py-2 text-sm font-semibold text-buram-ink disabled:opacity-50 sm:w-auto"
              >
                Create {newUser.roleName} account
              </button>
            </div>
          </form>

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
                  <span className={labelClass}>Assigned Role</span>
                  <select
                    className={inputClass}
                    value={editingUser.roleName}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, roleName: e.target.value })
                    }
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
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
                <label className="sm:col-span-2 lg:col-span-2">
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
                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="min-h-10 rounded bg-buram-amber px-4 py-2 text-xs font-mono font-bold uppercase text-buram-ink hover:bg-buram-gold disabled:opacity-50"
                  >
                    Save Account Changes
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-buram-border text-xs uppercase text-buram-muted">
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Account & Password Policy</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry._id} className="border-b border-buram-border/60">
                    <td className="p-2 text-buram-text">{entry.fullName}</td>
                    <td className="p-2 text-buram-muted">{entry.email}</td>
                    <td className="p-2">
                      <StatusBadge
                        label={getRoleName(entry.roleId)}
                        variant={getRoleName(entry.roleId) === 'Admin' ? 'AMBER' : 'TECHNICAL'}
                      />
                    </td>
                    <td className="p-2">
                      <StatusBadge
                        label={
                          !entry.isActive
                            ? 'DEACTIVATED'
                            : entry.mustChangePassword
                              ? 'TEMP PASSWORD'
                              : 'ACTIVE'
                        }
                        variant={
                          !entry.isActive
                            ? 'CRITICAL'
                            : entry.mustChangePassword
                              ? 'WARNING'
                              : 'NOMINAL'
                        }
                      />
                    </td>
                    <td className="p-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditingUser(entry)}
                          className="inline-flex items-center gap-1 rounded border border-buram-border bg-buram-elevated px-2.5 py-1 text-xs font-mono text-buram-pale hover:border-buram-amber"
                        >
                          <Edit3 className="h-3 w-3" /> Manage
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditingUser(entry, !entry.isActive)}
                          className={`rounded border px-2.5 py-1 text-xs font-mono ${
                            entry.isActive
                              ? 'border-buram-critical/50 bg-buram-critical/10 text-buram-critical hover:bg-buram-critical/20'
                              : 'border-buram-success/50 bg-buram-success/10 text-buram-success hover:bg-buram-success/20'
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
