/**
 * User directory and User 360.
 *
 * Everything on this surface comes from the API or is visibly absent:
 *
 *   - the directory is `GET /api/admin/users` through the adapter in `admin-users-model.ts`;
 *     the table used to be seeded with five sample accounts, so an operator could suspend,
 *     export or "reset the password" of people who did not exist;
 *   - every action calls the endpoint that owns it and reports what the server said. The
 *     previous implementation swallowed the error and announced success anyway
 *     (`await post(...).catch(() => {})` followed by "User … marked as SUSPENDED"), and its
 *     password-reset fallback synthesised a link (`?reset_token=sec_rst_<timestamp>`) that no
 *     server had issued;
 *   - fields the directory endpoint does not return are `null` and render as "—"; the drawer
 *     loads `GET /api/admin/users/:uid/details` for quota usage, memberships and documents;
 *   - a role the API refuses (`SUPER_ADMIN`) is not offered in the picker, and a provisioning
 *     form no longer asks for values the API rejects (password, tenant association).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Building2,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { del, get, patch, post, put } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';
import {
  ASSIGNABLE_ROLES,
  downloadJson,
  readDirectory,
  readTenantOptions,
  readUser360,
  type AdminDirectoryPayload,
  type AdminUserRecord,
  type PlatformRole,
  type TenantOption,
  type User360Payload,
} from './admin-users-model';

export type { AdminUserRecord, PlatformRole } from './admin-users-model';

type DrawerTab = 'identity' | 'tenants' | 'ai' | 'documents';

/** One organization membership, as User 360 reports it. */
interface MembershipView {
  id: string;
  displayName: string;
  slug: string;
  roles: string[];
}
type Flash = { tone: 'success' | 'error'; text: string };

const ROLE_LABELS: Record<PlatformRole, string> = {
  USER: 'USER — candidate',
  EMPLOYER: 'EMPLOYER — hiring manager',
  RECRUITER: 'RECRUITER — agency recruiter',
  SUPPORT: 'SUPPORT — help desk',
  AUDITOR: 'AUDITOR — compliance',
  ENTERPRISE_ADMIN: 'ENTERPRISE_ADMIN — tenant administrator',
  ENTERPRISE_MEMBER: 'ENTERPRISE_MEMBER — workspaces member',
  ADMIN: 'ADMIN — platform operator',
  SUPER_ADMIN: 'SUPER_ADMIN — claim-only, not assignable',
};

/** Status pill colours, per theme, from the palette tokens only. */
const STATUS_STYLES: Record<AdminUserRecord['status'], string> = {
  active: 'bg-success-50 text-success-700 border border-success-100',
  suspended: 'bg-error-50 text-error-700 border border-error-100',
  pending: 'bg-warning-50 text-warning-700 border border-warning-100',
};

function FlashBanner({ flash, onDismiss }: { flash: Flash; onDismiss: () => void }) {
  const success = flash.tone === 'success';
  return (
    <div
      role={success ? 'status' : 'alert'}
      aria-live={success ? 'polite' : 'assertive'}
      className={cn(
        'flex items-start gap-2 rounded-xl border p-3 text-xs',
        success
          ? 'border-success-100 bg-success-50 text-success-700'
          : 'border-error-100 bg-error-50 text-error-700',
      )}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      )}
      <span className="flex-1">{flash.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function AdminUsersTab() {
  const loadDirectory = useCallback(
    (signal: AbortSignal) =>
      get<AdminDirectoryPayload>('/admin/users', { limit: 100 }, { signal }),
    [],
  );
  const directory = useAdminResource(loadDirectory);
  const users = useMemo(() => readDirectory(directory.data), [directory.data]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<AdminUserRecord | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find((user) => user.id === selectedUserId) ?? selectedFallback;
  }, [selectedUserId, users, selectedFallback]);

  /** One place where a mutation's outcome becomes a message, so no handler can invent one. */
  const runMutation = async (key: string, work: () => Promise<string>) => {
    setBusyKey(key);
    try {
      const message = await work();
      setFlash({ tone: 'success', text: message });
      directory.reload();
      return true;
    } catch (error) {
      const failure = describeAdminFailure(error);
      setFlash({
        tone: 'error',
        text: `${failure.message} (${failure.code}${
          failure.requestId ? ` · request ${failure.requestId}` : ''
        })`,
      });
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && user.status === 'active') ||
      (statusFilter === 'SUSPENDED' && user.status === 'suspended');
    if (!matchesFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      user.email.toLowerCase().includes(query) ||
      user.displayName.toLowerCase().includes(query) ||
      user.id.toLowerCase().includes(query)
    );
  });

  const openUser = (user: AdminUserRecord) => {
    setSelectedFallback(user);
    setSelectedUserId(user.id);
  };

  const recordViewAs = (user: AdminUserRecord) =>
    runMutation(`role-view-${user.id}`, async () => {
      const response = await post<{ message?: string }>('/platform/role-view-audit', {
        targetRole: user.role,
      });
      return response?.message || `View-as ${user.role} recorded in the platform audit trail.`;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Users className="size-5 text-brand-600" />
            User 360 &amp; Account Governance
          </h2>
          <p className="text-xs text-ink-muted">
            Authoritative directory read from the identity provider and MariaDB, with User 360,
            tenancy and AI entitlements.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="gap-1.5 text-xs font-bold"
          onClick={() => setShowCreateModal(true)}
        >
          <UserPlus className="size-3.5" />
          Provision User
        </Button>
      </div>

      {flash && <FlashBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            aria-pressed={statusFilter === filter}
            className={cn(
              'cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
              statusFilter === filter
                ? 'bg-brand-600 text-white'
                : 'bg-neutral-100 text-ink-muted hover:bg-neutral-200 dark:bg-neutral-800',
            )}
          >
            {filter}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={directory.reload}
          disabled={directory.status === 'loading'}
          className="ml-auto"
        >
          <RotateCcw className={cn('mr-1.5 size-3.5', directory.status === 'loading' && 'animate-spin')} />
          Reload directory
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by name, email, or user ID…"
          aria-label="Search the user directory"
          className="h-9 pl-9 text-xs"
        />
      </div>

      {directory.status === 'loading' && directory.data === null && (
        <AdminLoadingPanel label="Reading the identity directory…" />
      )}

      {directory.status === 'failed' && directory.error && (
        <AdminErrorPanel
          title="The user directory could not be read"
          error={directory.error}
          onRetry={directory.reload}
        />
      )}

      {directory.status === 'ready' && users.length === 0 && (
        <AdminEmptyPanel
          title="No identities yet"
          description="The identity directory answered and holds no accounts. Provision the first one to get started."
        />
      )}

      {directory.status === 'ready' && users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[820px] text-xs">
            <caption className="sr-only">
              User directory: {users.length} identities, filtered to {filteredUsers.length}.
            </caption>
            <thead className="border-b border-border bg-canvas">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-ink-secondary">User identity</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-ink-secondary">Role</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-ink-secondary">Status</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-ink-secondary">Plan / entitlement</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-ink-secondary">Organization</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-ink-secondary">Last sign-in</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-ink-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-ink-muted">
                    No account matches this filter. {users.length} identities exist.
                  </td>
                </tr>
              )}
              {filteredUsers.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-neutral-25 dark:hover:bg-neutral-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                        {(user.displayName[0] ?? user.email[0] ?? 'U').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-ink">{user.displayName}</div>
                        <div className="truncate text-xs text-ink-muted">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-border bg-neutral-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-ink-secondary dark:bg-neutral-800">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', STATUS_STYLES[user.status])}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-secondary">
                    {user.membership}
                    {user.membershipEnds && (
                      <span className="ml-1 text-2xs text-ink-muted">until {user.membershipEnds.slice(0, 10)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{user.tenantMembership}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{user.lastLogin}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="outline" size="xs" onClick={() => openUser(user)} className="font-bold">
                        <Eye className="mr-1 size-3 text-brand-600" />
                        User 360
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => recordViewAs(user)}
                        loading={busyKey === `role-view-${user.id}`}
                        title="Record a view-as audit entry for this role"
                      >
                        Log view-as
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <ProvisionUserModal
          onClose={() => setShowCreateModal(false)}
          onProvisioned={(message) => {
            setFlash({ tone: 'success', text: message });
            setShowCreateModal(false);
            directory.reload();
          }}
          onFailed={(message) => setFlash({ tone: 'error', text: message })}
        />
      )}

      {selectedUser && (
        <UserDrawer
          key={selectedUser.id}
          userId={selectedUser.id}
          fallback={selectedUser}
          onClose={() => {
            setSelectedUserId(null);
            setSelectedFallback(null);
          }}
          onChanged={(message) => {
            setFlash({ tone: 'success', text: message });
            directory.reload();
          }}
          onFailed={(message) => setFlash({ tone: 'error', text: message })}
        />
      )}
    </div>
  );
}

function ProvisionUserModal({
  onClose,
  onProvisioned,
  onFailed,
}: {
  onClose: () => void;
  onProvisioned: (message: string) => void;
  onFailed: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRole>('USER');
  const [emailVerified, setEmailVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await post<{ message?: string }>('/admin/users', {
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        emailVerified,
      });
      onProvisioned(
        response?.message || `Identity ${email.trim()} provisioned with role ${role}.`,
      );
    } catch (error) {
      const failure = describeAdminFailure(error);
      onFailed(`${failure.message} (${failure.code})`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provision-user-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3.5 rounded-2xl border border-border bg-surface p-5 text-xs shadow-2xl"
      >
        <h3 id="provision-user-title" className="text-base font-bold text-ink">
          Provision a new account
        </h3>
        <p className="text-2xs text-ink-muted">
          Creates the identity and profile. Tenancy and paid membership are granted afterwards,
          from User 360, because the provisioning endpoint accepts neither.
        </p>
        <div className="space-y-1">
          <label htmlFor="provision-name" className="block font-bold text-ink">Display name</label>
          <Input
            id="provision-name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Jordan Hayes"
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="provision-email" className="block font-bold text-ink">Email address</label>
          <Input
            id="provision-email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="jordan.h@company.com"
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="provision-role" className="block font-bold text-ink">Initial role</label>
          <select
            id="provision-role"
            value={role}
            onChange={(event) => {
              const next = event.target.value;
              if (isPlatformRole(next)) setRole(next);
            }}
            className="h-9 w-full rounded-lg border border-border bg-canvas px-2.5 text-xs font-semibold text-ink"
          >
            {ASSIGNABLE_ROLES.map((option) => (
              <option key={option} value={option}>{ROLE_LABELS[option]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="provision-verified"
            type="checkbox"
            checked={emailVerified}
            onChange={(event) => setEmailVerified(event.target.checked)}
            className="mt-0.5 size-3.5 cursor-pointer rounded border-border text-brand-600"
          />
          <label htmlFor="provision-verified" className="cursor-pointer text-xs font-medium text-ink">
            Mark the address as verified (skips the activation link)
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={submitting}>
            Provision account
          </Button>
        </div>
      </form>
    </div>
  );
}

function isPlatformRole(value: string): value is PlatformRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

function UserDrawer({
  userId,
  fallback,
  onClose,
  onChanged,
  onFailed,
}: {
  userId: string;
  fallback: AdminUserRecord;
  onClose: () => void;
  onChanged: (message: string) => void;
  onFailed: (message: string) => void;
}) {
  const loadDetails = useCallback(
    (signal: AbortSignal) => get<User360Payload>(`/admin/users/${userId}/details`, undefined, { signal }),
    [userId],
  );
  const details = useAdminResource(loadDetails);
  const view = useMemo(() => readUser360(details.data), [details.data]);
  const profile = view.profile ?? fallback;

  const [tab, setTab] = useState<DrawerTab>('identity');
  const [role, setRole] = useState<PlatformRole>(fallback.role);
  const [membership, setMembership] = useState(fallback.membership === 'Premium' ? 'Premium' : 'Basic');
  const [suspensionReason, setSuspensionReason] = useState('');
  const [quotaLimit, setQuotaLimit] = useState('');
  const [quotaReason, setQuotaReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setRole(profile.role);
    setMembership(profile.membership === 'Premium' ? 'Premium' : 'Basic');
    setQuotaLimit(view.ai.customLimit !== null ? String(view.ai.customLimit) : '');
  }, [profile.role, profile.membership, view.ai.customLimit]);

  const mutate = async (key: string, work: () => Promise<string>) => {
    setBusy(key);
    try {
      const message = await work();
      onChanged(message);
      details.reload();
    } catch (error) {
      const failure = describeAdminFailure(error);
      onFailed(
        `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`,
      );
    } finally {
      setBusy(null);
    }
  };

  const updateRole = () =>
    mutate('role', async () => {
      await patch(`/admin/users/${userId}`, { role, expectedRole: profile.role });
      return `Role changed from ${profile.role} to ${role}.`;
    });

  const updateMembership = () =>
    mutate('membership', async () => {
      await patch(`/admin/users/${userId}`, {
        membership,
        ...(membership === 'Premium' ? { durationMonths: 12 } : {}),
      });
      return `Plan set to ${membership}.`;
    });

  const setSuspended = (suspended: boolean) =>
    mutate('suspend', async () => {
      await patch(`/admin/users/${userId}`, {
        suspended,
        ...(suspensionReason.trim() ? { reason: suspensionReason.trim() } : {}),
      });
      setSuspensionReason('');
      return suspended ? 'Account suspended and refresh tokens revoked.' : 'Suspension lifted.';
    });

  const sendPasswordReset = () =>
    mutate('reset', async () => {
      const response = await post<{ message?: string }>(
        `/admin/users/${userId}/send-password-reset`,
        {},
      );
      return response?.message || 'Password reset email queued by the identity provider.';
    });

  const revokeSessions = () =>
    mutate('revoke', async () => {
      const response = await post<{ message?: string }>(`/admin/users/${userId}/revoke-sessions`, {});
      return response?.message || 'All refresh tokens revoked for this identity.';
    });

  const unenrollMfa = () =>
    mutate('mfa', async () => {
      const response = await post<{ message?: string }>(`/admin/users/${userId}/unenroll-mfa`, {});
      return response?.message || 'MFA factors removed for this identity.';
    });

  const exportArchive = () =>
    mutate('export', async () => {
      const bundle = await get<Record<string, unknown>>(`/admin/users/${userId}/export`);
      downloadJson(`user_export_${userId}_${Date.now()}.json`, bundle);
      return 'Server-side export bundle downloaded.';
    });

  const saveQuota = () =>
    mutate('quota', async () => {
      const dailyLimit = Number(quotaLimit);
      if (!Number.isFinite(dailyLimit) || dailyLimit < 1) {
        throw new Error('Enter a daily limit of at least 1.');
      }
      if (quotaReason.trim().length < 3) {
        throw new Error('A justification of at least 3 characters is required for a quota override.');
      }
      await put(`/admin/users/${userId}/ai-entitlement`, {
        dailyLimit,
        reason: quotaReason.trim(),
      });
      setQuotaReason('');
      return `Daily AI quota override set to ${dailyLimit}.`;
    });

  const resetUsage = () =>
    mutate('quota-reset', async () => {
      const response = await post<{ message?: string }>(`/admin/users/${userId}/ai-quota-reset`, {});
      return response?.message || "Today's AI usage counter reset to zero.";
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-drawer-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-neutral-50/50 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-600 text-base font-black text-white">
              {(profile.displayName[0] ?? profile.email[0] ?? 'U').toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="user-drawer-title" className="text-base font-extrabold text-ink">
                  {profile.displayName}
                </h3>
                <span className={cn('rounded-full px-2 py-0.5 text-2xs font-black uppercase', STATUS_STYLES[profile.status])}>
                  {profile.status}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                {profile.email} • UID <span className="font-mono">{profile.id}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close User 360"
            className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div role="tablist" aria-label="User 360 sections" className="flex gap-1 overflow-x-auto border-b border-border bg-canvas px-4 sm:px-5">
          {(
            [
              { id: 'identity', label: 'Identity & RBAC', icon: Shield },
              { id: 'tenants', label: 'Organizations', icon: Building2 },
              { id: 'ai', label: 'AI entitlements', icon: Brain },
              { id: 'documents', label: `Documents (${view.content.resumeCount})`, icon: FileText },
            ] as const
          ).map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`user-panel-${entry.id}`}
                onClick={() => setTab(entry.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold transition-colors',
                  active
                    ? 'border-brand-600 font-extrabold text-brand-700'
                    : 'border-transparent text-ink-muted hover:border-neutral-300 hover:text-ink',
                )}
              >
                <Icon className="size-3.5" />
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs sm:p-6">
          {details.status === 'loading' && details.data === null && (
            <AdminLoadingPanel label="Reading User 360…" />
          )}
          {details.status === 'failed' && details.error && (
            <AdminErrorPanel
              title="User 360 could not be read"
              error={details.error}
              onRetry={details.reload}
            />
          )}

          {tab === 'identity' && (
            <div id="user-panel-identity" role="tabpanel" className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-border bg-neutral-25 p-3.5">
                  <label htmlFor="drawer-role" className="block font-bold text-ink">Platform role</label>
                  <div className="flex gap-2">
                    <select
                      id="drawer-role"
                      value={role}
                      onChange={(event) => {
                        if (isPlatformRole(event.target.value)) setRole(event.target.value);
                      }}
                      className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-ink"
                    >
                      {ASSIGNABLE_ROLES.map((option) => (
                        <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                      ))}
                    </select>
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={role === profile.role}
                      loading={busy === 'role'}
                      onClick={updateRole}
                    >
                      Update
                    </Button>
                  </div>
                  <p className="text-2xs text-ink-muted">
                    Writes custom claims and revokes refresh tokens. SUPER_ADMIN cannot be granted
                    through the API, so it is not offered.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-neutral-25 p-3.5">
                  <label htmlFor="drawer-membership" className="block font-bold text-ink">Subscription plan</label>
                  <div className="flex gap-2">
                    <select
                      id="drawer-membership"
                      value={membership}
                      onChange={(event) => setMembership(event.target.value)}
                      className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-ink"
                    >
                      <option value="Basic">Basic</option>
                      <option value="Premium">Premium (12 months)</option>
                    </select>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={membership === profile.membership}
                      loading={busy === 'membership'}
                      onClick={updateMembership}
                    >
                      Apply
                    </Button>
                  </div>
                  <p className="text-2xs text-ink-muted">
                    Recorded as an administrative grant; payment status is set to ADMIN_GRANTED.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 rounded-xl border border-border p-4 sm:grid-cols-2">
                <Button variant="outline" size="sm" onClick={sendPasswordReset} loading={busy === 'reset'} className="justify-start gap-2 text-xs">
                  <Copy className="size-4 text-brand-600" />
                  Send password reset email
                </Button>
                <Button variant="outline" size="sm" onClick={revokeSessions} loading={busy === 'revoke'} className="justify-start gap-2 text-xs text-error-700 hover:bg-error-50">
                  <ShieldAlert className="size-4" />
                  Revoke all sessions
                </Button>
                <Button variant="outline" size="sm" onClick={exportArchive} loading={busy === 'export'} className="justify-start gap-2 text-xs">
                  <Download className="size-4 text-info-600" />
                  Download GDPR export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={unenrollMfa}
                  loading={busy === 'mfa'}
                  disabled={!view.mfaEnabled}
                  title={view.mfaEnabled ? 'Remove enrolled MFA factors' : 'No MFA factor is enrolled'}
                  className="justify-start gap-2 text-xs"
                >
                  <Unlock className="size-4 text-warning-600" />
                  {view.mfaEnabled ? 'Reset 2FA / unenroll' : 'No 2FA enrolled'}
                </Button>
              </div>

              <div className="space-y-3 rounded-xl border border-error-100 bg-error-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-error-700">Account status</h4>
                    <p className="text-2xs text-error-700/90">
                      {profile.status === 'suspended'
                        ? 'Sign-in and API access are blocked for this identity.'
                        : 'Suspending blocks sign-in and revokes refresh tokens immediately.'}
                    </p>
                  </div>
                  <Button
                    variant={profile.status === 'suspended' ? 'outline' : 'destructive'}
                    size="sm"
                    loading={busy === 'suspend'}
                    disabled={profile.status !== 'suspended' && suspensionReason.trim().length < 3}
                    onClick={() => setSuspended(profile.status !== 'suspended')}
                  >
                    {profile.status === 'suspended' ? 'Lift suspension' : 'Suspend account'}
                  </Button>
                </div>
                {profile.status !== 'suspended' && (
                  <div className="space-y-1">
                    <label htmlFor="suspend-reason" className="block text-2xs font-bold text-error-700">
                      Suspension reason (recorded in the audit entry)
                    </label>
                    <Input
                      id="suspend-reason"
                      value={suspensionReason}
                      onChange={(event) => setSuspensionReason(event.target.value)}
                      placeholder="Terms of Service violation / fraudulent activity"
                      className="h-8 border-error-100 bg-surface text-xs"
                    />
                  </div>
                )}
              </div>

              {view.timeline.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink">Recent audit entries</h4>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {view.timeline.slice(0, 8).map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 p-3">
                        <span className="font-mono text-2xs text-ink-secondary">{entry.action}</span>
                        <span className="text-2xs text-ink-muted">{entry.createdAt || 'unknown time'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'tenants' && (
            <div id="user-panel-tenants" role="tabpanel" className="space-y-4">
              <TenantPanel
                userId={userId}
                memberships={view.memberships}
                onChanged={(message) => {
                  onChanged(message);
                  details.reload();
                }}
                onFailed={onFailed}
              />
            </div>
          )}

          {tab === 'ai' && (
            <div id="user-panel-ai" role="tabpanel" className="space-y-4">
              <div className="space-y-3 rounded-xl border border-border bg-neutral-25 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-ink">
                    <Brain className="size-4 text-brand-600" />
                    Daily AI quota
                  </h4>
                  <span className="text-xs font-bold text-ink">
                    {view.ai.usedToday ?? '—'} / {view.ai.effectiveLimit ?? '—'} generations
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={view.ai.effectiveLimit ?? 100}
                  aria-valuenow={view.ai.usedToday ?? 0}
                  aria-label="Daily AI quota used"
                  className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
                >
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        view.ai.effectiveLimit && view.ai.usedToday !== null
                          ? Math.round((view.ai.usedToday / view.ai.effectiveLimit) * 100)
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-2xs text-ink-muted">
                  Plan {view.ai.plan}
                  {view.ai.customLimit !== null ? ` · override ${view.ai.customLimit}/day` : ' · no override'}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-border p-4">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink">Quota override</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="quota-limit" className="block font-bold text-ink">Daily limit</label>
                    <Input
                      id="quota-limit"
                      type="number"
                      min={1}
                      value={quotaLimit}
                      onChange={(event) => setQuotaLimit(event.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="quota-reason" className="block font-bold text-ink">Justification (required)</label>
                    <Input
                      id="quota-reason"
                      value={quotaReason}
                      onChange={(event) => setQuotaReason(event.target.value)}
                      placeholder="Support case #1234"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Button variant="outline" size="xs" onClick={resetUsage} loading={busy === 'quota-reset'}>
                    <RotateCcw className="mr-1 size-3" />
                    Reset today&apos;s counter
                  </Button>
                  <Button variant="primary" size="xs" onClick={saveQuota} loading={busy === 'quota'}>
                    Save override
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div id="user-panel-documents" role="tabpanel" className="space-y-3">
              <p className="text-xs text-ink-muted">
                {view.content.resumeCount} resume(s), {view.content.portfolioCount} portfolio(s),{' '}
                {view.content.coverCount} cover letter(s) recorded for this identity.
              </p>
              {view.content.resumes.length === 0 ? (
                <AdminEmptyPanel
                  title="No documents"
                  description="This account has not created a resume yet. Nothing is hidden here."
                />
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {view.content.resumes.map((resume) => (
                    <li key={resume.id} className="flex items-center justify-between gap-3 p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg border border-info-100 bg-info-50 text-info-600">
                          <FileText className="size-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink">{resume.title}</p>
                          <p className="text-2xs text-ink-muted">
                            Template {resume.template}
                            {resume.updatedAt ? ` · updated ${resume.updatedAt.slice(0, 10)}` : ''}
                          </p>
                        </div>
                      </div>
                      <a
                        href={`/preview/${resume.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-2xs font-bold text-brand-700 hover:underline"
                      >
                        Preview
                        <ExternalLink className="size-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-neutral-50/50 p-4">
          <span className="text-xs text-ink-muted">
            Revision {profile.revision} · {profile.email}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function TenantPanel({
  userId,
  memberships,
  onChanged,
  onFailed,
}: {
  userId: string;
  memberships: MembershipView[];
  onChanged: (message: string) => void;
  onFailed: (message: string) => void;
}) {
  const loadTenants = useCallback(
    (signal: AbortSignal) => get<unknown>('/enterprise/tenants', undefined, { signal }).then(readTenantOptions),
    [],
  );
  const tenants = useAdminResource<TenantOption[]>(loadTenants);
  const options = tenants.data ?? [];

  const [tenantId, setTenantId] = useState('');
  const [role, setRole] = useState('ENTERPRISE_MEMBER');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) return;
    const [first] = options;
    if (first) setTenantId(first.id);
  }, [options, tenantId]);

  const assign = async () => {
    setBusy('assign');
    try {
      const response = await post<{ message?: string }>(`/admin/users/${userId}/tenants`, {
        tenantId,
        role,
      });
      onChanged(response?.message || 'Membership granted.');
    } catch (error) {
      const failure = describeAdminFailure(error);
      onFailed(`${failure.message} (${failure.code})`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (membershipId: string) => {
    setBusy(membershipId);
    try {
      const response = await del<{ message?: string }>(
        `/admin/users/${userId}/tenants/${encodeURIComponent(membershipId)}`,
      );
      onChanged(response?.message || 'Membership removed.');
    } catch (error) {
      const failure = describeAdminFailure(error);
      onFailed(`${failure.message} (${failure.code})`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="space-y-3 rounded-xl border border-border bg-neutral-25 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink">Assign membership</h4>
        {tenants.status === 'failed' && tenants.error && (
          <AdminErrorPanel
            title="Organizations could not be listed"
            error={tenants.error}
            onRetry={tenants.reload}
          />
        )}
        {options.length === 0 && tenants.status === 'ready' && (
          <p className="text-2xs text-ink-muted">
            You are not a member of any organization, so there is nothing to assign this account to.
          </p>
        )}
        {options.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              aria-label="Organization"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-ink"
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName}
                  {option.lifecycleState !== 'ACTIVE' ? ` (${option.lifecycleState})` : ''}
                </option>
              ))}
            </select>
            <select
              aria-label="Organization role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-ink"
            >
              <option value="ENTERPRISE_ADMIN">Admin</option>
              <option value="ENTERPRISE_MANAGER">Manager</option>
              <option value="ENTERPRISE_MEMBER">Member</option>
              <option value="ENTERPRISE_VIEWER">Viewer</option>
            </select>
            <Button
              size="sm"
              variant="primary"
              onClick={assign}
              loading={busy === 'assign'}
              disabled={!tenantId}
            >
              Assign
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border bg-neutral-50 p-3 text-xs font-bold text-ink">
          Active memberships
        </div>
        {memberships.length === 0 ? (
          <p className="p-3.5 text-2xs text-ink-muted">This identity belongs to no organization.</p>
        ) : (
          <ul className="divide-y divide-border">
            {memberships.map((membership) => (
              <li key={membership.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="flex items-center gap-2.5">
                  <Building2 className="size-4 text-brand-600" />
                  <div>
                    <p className="text-xs font-bold text-ink">{membership.displayName}</p>
                    <p className="text-2xs text-ink-muted">Slug {membership.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {membership.roles.map((membershipRole) => (
                    <span key={membershipRole} className="rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-bold text-brand-700">
                      {membershipRole}
                    </span>
                  ))}
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-error-700 hover:text-error-700"
                    loading={busy === membership.id}
                    onClick={() => remove(membership.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
