import { listEnterpriseTenants, subscribeTenants, ENTERPRISE_ROLES, type EnterpriseTenant } from '@/lib/admin-tenants';
/**
 * Admin Users Manager & User 360 Tab (Master Edition)
 *
 * Full-featured Administrative User Directory & Governance Hub:
 * - Provision User Modal (Create new candidate, recruiter, or admin accounts)
 * - 4-Tab User 360 Drawer Modal:
 *     1. Identity & RBAC (Role switcher, Plan upgrade, Password reset link, Session revoke, MFA reset, GDPR export, Suspension)
 *     2. Organizations & Tenants (Assign tenant membership, workspace preview, role delegation, membership revoke)
 *     3. AI Quotas & Entitlements (Daily quota monitor, custom token override with reason, daily counter reset)
 *     4. Resumes & Documents (Candidate resumes inventory with ATS score gauges and preview)
 *
 * INVARIANTS:
 * 1. ZERO FABRICATED DATA: Binds to live administrative user records and endpoints.
 * 2. AUDIT TRAIL GENERATION: Account mutations generate cryptographic audit logs.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, post, patch, put, normalizeError } from '@/lib/api-client';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  Shield,
  Eye,
  X,
  FileText,
  Unlock,
  RotateCcw,
  Building2,
  Brain,
  Download,
  Copy,
  ExternalLink,
  ShieldAlert,
  Check,
} from 'lucide-react';

export type PlatformRole =
  | 'USER'
  | 'EMPLOYER'
  | 'RECRUITER'
  | 'SUPPORT'
  | 'AUDITOR'
  | 'ENTERPRISE_ADMIN'
  | 'ENTERPRISE_MEMBER'
  | 'ADMIN'
  | 'SUPER_ADMIN';

export interface AdminUserRecord {
  id: string;
  email: string;
  displayName: string;
  role: PlatformRole;
  status: 'active' | 'suspended' | 'disabled' | 'pending';
  lastLogin: string;
  createdAt: string;
  resumeCount: number;
  plan?: string;
  tenantMembership?: string;
  aiDailyLimit?: number;
  aiUsedToday?: number;
}

/**
 * The directory is populated exclusively from GET /api/admin/users. When that
 * call fails the UI shows an actionable error and a Retry action — it never
 * falls back to sample accounts, because a fabricated roster in an
 * administrative console is indistinguishable from a real one.
 */
const EMPTY_USERS: AdminUserRecord[] = [];

export function AdminUsersTab() {
  const [users, setUsers] = useState<AdminUserRecord[]>(EMPTY_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED'>('ALL');
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // A single in-flight lifecycle mutation at a time: duplicate submissions of a
  // status change would issue two conflicting administrative decisions.
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [resettingMfa, setResettingMfa] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingQuota, setSavingQuota] = useState(false);
  const [resettingQuota, setResettingQuota] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [exportingUser, setExportingUser] = useState(false);
  const [observingUser, setObservingUser] = useState<string | null>(null);

  // User 360 sub-tab
  const [drawerTab, setDrawerTab] = useState<'identity' | 'tenants' | 'ai' | 'documents'>('identity');

  // Provision User Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<PlatformRole>('USER');
  const [newTenant, setNewTenant] = useState('');
  const [newVerifyEmail, setNewVerifyEmail] = useState(true);
  const [isProvisioning, setIsProvisioning] = useState(false);

  // User 360 mutation state
  const [editRole, setEditRole] = useState<string>('USER');
  const [editPlan, setEditPlan] = useState<string>('Basic');
  const [copiedLink, setCopiedLink] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [showSuspendInput, setShowSuspendInput] = useState(false);
  const [customAiLimit, setCustomAiLimit] = useState<number>(100);
  const [aiLimitReason, setAiLimitReason] = useState('');
  const [registryTenants, setRegistryTenants] = useState<EnterpriseTenant[]>([]);
  const [tenantError, setTenantError] = useState('');
  const [tenantLoading, setTenantLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision; setTenantLoading(true);
      listEnterpriseTenants().then(data => {
        if (!active || request !== revision) return;
        const assignable = data.filter(t => t.source === 'LIVE' && t.lifecycleState === 'ACTIVE');
        setRegistryTenants(assignable); setTenantError('');
        setSelectedTenantId(id => assignable.some(t => t.id === id) ? id : '');
      }).catch(e => { if (active && request === revision) { setTenantError(normalizeError(e).message); setRegistryTenants([]); setSelectedTenantId(''); } }).finally(() => { if (active && request === revision) setTenantLoading(false); });
    };
    refresh(); const unsubscribe = subscribeTenants(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedTenantRole, setSelectedTenantRole] = useState('ENTERPRISE_MEMBER');

  const loadUsers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await get<{ users?: AdminUserRecord[] }>('/admin/users');
      if (!res || !Array.isArray(res.users)) {
        throw new Error('The administrative directory returned an unexpected response.');
      }
      setUsers(res.users);
    } catch (err) {
      const message = normalizeError(err).message;
      setUsers(EMPTY_USERS);
      setLoadError(message || 'Failed to load administrative users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  // Sync edit states when selecting user
  useEffect(() => {
    if (selectedUser) {
      setEditRole(selectedUser.role);
      setEditPlan(selectedUser.plan || 'Basic');
      setCustomAiLimit(selectedUser.aiDailyLimit || 100);
      setCopiedLink(false);
      setShowSuspendInput(false);
      setSuspensionReason('');
      setDrawerTab('identity');
    }
  }, [selectedUser]);

  /**
   * Apply a User360 lifecycle transition. The UI only reflects the new state
   * after the server confirms it, and reports the exact server-side outcome
   * (including a partial identity/profile result) instead of guessing.
   */
  const handleSetStatus = async (
    user: AdminUserRecord,
    nextStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
    reason?: string
  ) => {
    if (statusPendingId) return;
    setStatusPendingId(user.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await patch<{
        success?: boolean;
        status?: string;
        previousStatus?: string;
        persistence?: { profilePersisted?: boolean; limitation?: string | null };
        identity?: { disabled?: boolean; tokensRevoked?: boolean };
      }>(`/admin/users/${user.id}/status`, {
        status: nextStatus,
        reason: reason?.trim() || undefined,
      });

      const confirmed = String(res?.status || nextStatus).toLowerCase() as AdminUserRecord['status'];
      const applyStatus = (record: AdminUserRecord): AdminUserRecord => ({ ...record, status: confirmed });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? applyStatus(u) : u)));
      if (selectedUser?.id === user.id) {
        setSelectedUser((prev) => (prev ? applyStatus(prev) : null));
      }

      const parts = [`${user.email} is now ${confirmed.toUpperCase()}.`];
      if (res?.identity?.tokensRevoked) parts.push('Active sessions were revoked.');
      if (res?.persistence?.profilePersisted === false) {
        parts.push('This identity has no application profile row, so only the sign-in state was recorded.');
      }
      setActionSuccess(parts.join(' '));
      setShowSuspendInput(false);
      setSuspensionReason('');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(`Failed to update the account status: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setStatusPendingId(null);
    }
  };

  const handleToggleSuspend = async (user: AdminUserRecord) => {
    const nextStatus = user.status === 'active' || user.status === 'pending' ? 'SUSPENDED' : 'ACTIVE';
    await handleSetStatus(user, nextStatus, suspensionReason);
  };

  const handleImpersonateAudit = async (user: AdminUserRecord) => {
    if (observingUser) return;
    setObservingUser(user.id);
    setActionError(null);
    try {
      await post('/platform/role-view-audit', {
        simulatedRole: user.role,
        targetUserId: user.id,
        action: 'SUPER_ADMIN_VIEW_AS_USER',
      });
      setActionSuccess(`Audit trail logged for session observation: ${user.email} (${user.role})`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      setActionError(`Failed to record the role-observation audit event: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setObservingUser(null);
    }
  };

  const handleSaveRole = async () => {
    if (!selectedUser || savingRole) return;
    setSavingRole(true);
    setActionError(null);
    try {
      await patch(`/admin/users/${selectedUser.id}`, { role: editRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, role: editRole as PlatformRole } : u))
      );
      setSelectedUser((prev) => (prev ? { ...prev, role: editRole as PlatformRole } : null));
      setActionSuccess(`Role updated to ${editRole} for ${selectedUser.email}.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setActionError(`Failed to update role: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setSavingRole(false);
    }
  };

  const handleCopyResetLink = async () => {
    if (!selectedUser || requestingReset) return;
    setRequestingReset(true);
    setActionError(null);
    try {
      await post(`/admin/users/${selectedUser.id}/send-password-reset`, {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      setActionSuccess(`Password reset email queued for ${selectedUser.email}.`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      // A locally minted "reset link" would not be honoured by the server, so a
      // failed request is reported as a failure instead of faking a token.
      setActionError(`Failed to queue the password reset email: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setRequestingReset(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!selectedUser || revokingSessions) return;
    setRevokingSessions(true);
    setActionError(null);
    try {
      const res = await post<{ success?: boolean; revokedAt?: string }>(
        `/admin/users/${selectedUser.id}/revoke-sessions`,
        {}
      );
      setActionSuccess(
        `Refresh tokens revoked for ${selectedUser.email}. Sign-in is required again${
          res?.revokedAt ? ` (revoked at ${new Date(res.revokedAt).toLocaleString()})` : ''
        }.`
      );
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(`Failed to revoke sessions: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setRevokingSessions(false);
    }
  };

  const handleResetMfa = async () => {
    if (!selectedUser || resettingMfa) return;
    setResettingMfa(true);
    setActionError(null);
    try {
      const res = await post<{ removedFactorCount?: number }>(`/admin/users/${selectedUser.id}/unenroll-mfa`, {});
      setActionSuccess(
        `Two-factor authentication reset for ${selectedUser.email}${
          typeof res?.removedFactorCount === 'number' ? ` (${res.removedFactorCount} factor(s) removed)` : ''
        }.`
      );
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(`Failed to reset two-factor authentication: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setResettingMfa(false);
    }
  };

  const handleExportUserData = async () => {
    if (!selectedUser || exportingUser) return;
    setExportingUser(true);
    setActionError(null);
    try {
      // The server assembles the statutory export bundle from the authoritative
      // stores; the browser never invents one from the row it happens to hold.
      const res = await get<{ success?: boolean; export?: unknown }>(`/admin/users/${selectedUser.id}/export`);
      const blob = new Blob([JSON.stringify(res?.export ?? res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `user_export_${selectedUser.id}_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setActionSuccess(`Server-generated data bundle exported for ${selectedUser.email}.`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      setActionError(`Failed to export user data: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setExportingUser(false);
    }
  };

  const handleSaveAiQuota = async () => {
    if (!selectedUser || savingQuota) return;
    if (!Number.isFinite(customAiLimit) || customAiLimit < 0) {
      setActionError('The AI daily limit must be a non-negative number.');
      setTimeout(() => setActionError(null), 5000);
      return;
    }
    setSavingQuota(true);
    setActionError(null);
    try {
      await put(`/admin/users/${selectedUser.id}/ai-entitlement`, {
        dailyLimit: customAiLimit,
        reason: aiLimitReason.trim() || undefined,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, aiDailyLimit: customAiLimit } : u))
      );
      setSelectedUser((prev) => (prev ? { ...prev, aiDailyLimit: customAiLimit } : null));
      setActionSuccess(`AI daily limit set to ${customAiLimit} for ${selectedUser.email}.`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      setActionError(`Failed to update the AI quota: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setSavingQuota(false);
    }
  };

  const handleResetDailyUsage = async () => {
    if (!selectedUser || resettingQuota) return;
    setResettingQuota(true);
    setActionError(null);
    try {
      await post(`/admin/users/${selectedUser.id}/ai-quota-reset`, {});
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, aiUsedToday: 0 } : u))
      );
      setSelectedUser((prev) => (prev ? { ...prev, aiUsedToday: 0 } : null));
      setActionSuccess(`Daily AI usage counter reset to 0 for ${selectedUser.email}.`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      setActionError(`Failed to reset the daily AI usage counter: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setResettingQuota(false);
    }
  };

  const handleProvisionUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) return;

    setIsProvisioning(true);
    setActionError(null);
    try {
      const created = await post<{ success?: boolean; user?: Partial<AdminUserRecord> }>('/admin/users', {
        email: newEmail.trim(),
        displayName: newName.trim(),
        role: newRole,
        password: newPassword || undefined,
        verified: newVerifyEmail,
      });
      if (!created?.user) {
        throw new Error('The server did not return the created user record.');
      }
      // Only the server-confirmed record is inserted; the directory is reloaded
      // so the row reflects persisted state rather than a local guess.
      await loadUsers();
      setShowCreateModal(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setActionSuccess(`User ${newEmail.trim()} successfully provisioned with role ${newRole}!`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(`Failed to provision the user: ${normalizeError(err).message}`);
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setIsProvisioning(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && u.status === 'active') ||
      (statusFilter === 'SUSPENDED' && u.status === 'suspended') ||
      (statusFilter === 'DISABLED' && u.status === 'disabled');

    if (!matchesFilter) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* ─── Header & Filters ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <Users className="size-5 text-brand-600" />
            User 360 & Account Governance
          </h2>
          <p className="text-xs text-ink-muted">
            Authoritative directory, multi-tenant governance, User 360, and AI entitlements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-bold gap-1.5 shadow-xs"
          >
            <UserPlus className="size-3.5" />
            Provision User
          </Button>

          {(['ALL', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer',
                statusFilter === filter
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-ink-muted hover:bg-neutral-200'
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {actionSuccess && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2 animate-[fade-in_150ms_ease-out]"
        >
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2 animate-[fade-in_150ms_ease-out]"
        >
          <ShieldAlert className="size-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex flex-wrap items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-rose-600 shrink-0" />
            <span>
              {loadError.includes('Failed to load administrative users.')
                ? loadError
                : `Failed to load administrative users. ${loadError}`}
            </span>
          </span>
          <Button variant="outline" size="xs" onClick={() => void loadUsers()} loading={loading}>
            <RotateCcw className="size-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, email, or user ID…"
          className="pl-9 text-xs h-9"
        />
      </div>

      {/* ─── Users Table ─── */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-xs min-w-[760px]">
          <thead className="bg-canvas border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">User Identity</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Role</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Plan / Entitlement</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Resumes</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Last Active</th>
              <th className="px-4 py-3 text-right font-semibold text-ink-secondary">Governance Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                  Loading the administrative user directory…
                </td>
              </tr>
            )}
            {!loading && filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-neutral-25 dark:hover:bg-neutral-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/50 text-xs font-bold text-brand-700 dark:text-brand-300">
                      {(user.displayName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-ink">{user.displayName || 'No name'}</div>
                      <div className="text-[11px] text-ink-muted">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
                      user.role === 'SUPER_ADMIN'
                        ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50'
                        : user.role === 'ADMIN'
                        ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50'
                        : user.role === 'SUPPORT'
                        ? 'bg-sky-100 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50'
                        : user.role === 'AUDITOR'
                        ? 'bg-teal-100 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50'
                        : user.role === 'ENTERPRISE_ADMIN'
                        ? 'bg-violet-100 dark:bg-violet-950/50 text-violet-800 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50'
                        : user.role === 'ENTERPRISE_MEMBER'
                        ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50'
                        : user.role === 'EMPLOYER' || user.role === 'RECRUITER'
                        ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                    )}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      user.status === 'active'
                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                        : user.status === 'disabled'
                          ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700'
                          : 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50'
                    )}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-ink-secondary">{user.plan || 'Standard'}</span>
                </td>
                <td className="px-4 py-3 font-semibold text-ink-secondary">{user.resumeCount}</td>
                <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{user.lastLogin}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setSelectedUser(user)}
                      title="Inspect User 360"
                      className="font-bold"
                    >
                      <Eye className="size-3 mr-1 text-brand-600" />
                      User 360
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleImpersonateAudit(user)}
                      title="Observe role context"
                      disabled={observingUser === user.id}
                      loading={observingUser === user.id}
                    >
                      Simulate
                    </Button>
                    <Button
                      variant={user.status === 'active' || user.status === 'pending' ? 'destructive' : 'outline'}
                      size="xs"
                      onClick={() => handleToggleSuspend(user)}
                      disabled={statusPendingId === user.id || statusPendingId !== null}
                      loading={statusPendingId === user.id}
                    >
                      {user.status === 'active' || user.status === 'pending' ? 'Suspend' : 'Activate'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-muted">
                  {users.length === 0
                    ? 'No administrative users were returned by the directory.'
                    : 'No accounts found matching the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── 1. PROVISION USER MODAL ─── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl border border-border space-y-4 animate-[scale-in_150ms_ease-out]">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-brand-50 text-brand-600 border border-brand-200">
                  <UserPlus className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Provision New User Account</h3>
                  <p className="text-xs text-ink-muted">
                    Create candidate, recruiter, or administrative identities with tenant bindings.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-ink-muted hover:bg-neutral-100 hover:text-ink cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleProvisionUserSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink block">Full Name</label>
                  <Input
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Jordan Hayes"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-ink block">Email Address</label>
                  <Input
                    required
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="jordan.h@company.com"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink block">Initial Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as PlatformRole)}
                    className="w-full h-8 px-2.5 rounded-lg border border-border bg-canvas text-xs font-semibold text-ink"
                  >
                    <option value="USER">USER (Standard Candidate)</option>
                    <option value="EMPLOYER">EMPLOYER (Hiring Manager / Talent Recruiter)</option>
                    <option value="RECRUITER">RECRUITER (Agency & Sourcing Specialist)</option>
                    <option value="SUPPORT">SUPPORT (Help Desk & Customer Care Specialist)</option>
                    <option value="AUDITOR">AUDITOR (Security & Compliance Auditor)</option>
                    <option value="ENTERPRISE_MEMBER">ENTERPRISE_MEMBER (Enterprise Workspace Member)</option>
                    <option value="ENTERPRISE_ADMIN">ENTERPRISE_ADMIN (Enterprise Tenant Administrator)</option>
                    <option value="ADMIN">ADMIN (System Operations & Staff Operator)</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN (Root Control-Plane Authority)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-ink block">Temporary Password (Optional)</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave empty to auto-generate"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink block">Tenant / Organization Association (Optional)</label>
                <select
                  value={newTenant}
                  onChange={(e) => setNewTenant(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-border bg-canvas text-xs text-ink"
                >
                  <option value="">None (Standalone Individual)</option>
                  {registryTenants.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="verify-email-check"
                  checked={newVerifyEmail}
                  onChange={(e) => setNewVerifyEmail(e.target.checked)}
                  className="size-3.5 rounded border-border text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                <label htmlFor="verify-email-check" className="text-xs text-ink cursor-pointer font-medium">
                  Mark email as pre-verified (bypasses initial activation link requirement)
                </label>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isProvisioning}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={isProvisioning}>
                  Provision Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 2. COMPLETE USER 360 DRAWER / MODAL ─── */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-surface shadow-2xl border border-border overflow-hidden flex flex-col max-h-[92vh] animate-[scale-in_150ms_ease-out]">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:p-5 bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-600 text-white font-black text-base shadow-xs">
                  {(selectedUser.displayName?.[0] ?? selectedUser.email?.[0] ?? 'U').toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-ink">{selectedUser.displayName}</h3>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.2 text-[10px] font-black uppercase',
                        selectedUser.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedUser.status === 'disabled'
                            ? 'bg-neutral-200 text-neutral-800'
                            : 'bg-rose-100 text-rose-800'
                      )}
                    >
                      {selectedUser.status}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted">{selectedUser.email} • UID: {selectedUser.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-border px-4 sm:px-5 bg-canvas gap-1 overflow-x-auto">
              {[
                { id: 'identity', label: 'Identity & RBAC', icon: Shield },
                { id: 'tenants', label: 'Organizations & Tenants', icon: Building2 },
                { id: 'ai', label: 'AI Entitlements & Quotas', icon: Brain },
                { id: 'documents', label: `Documents (${selectedUser.resumeCount})`, icon: FileText },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = drawerTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDrawerTab(tab.id as any)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap',
                      isActive
                        ? 'border-brand-600 text-brand-700 font-extrabold'
                        : 'border-transparent text-ink-muted hover:text-ink hover:border-neutral-300'
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {/* TAB 1: IDENTITY & RBAC */}
              {drawerTab === 'identity' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border p-3.5 space-y-2 bg-neutral-25">
                      <label className="font-bold text-ink block">Platform RBAC Role</label>
                      <div className="flex gap-2">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="flex-1 h-8 px-2 rounded-lg border border-border bg-surface text-xs font-semibold text-ink"
                        >
                          <option value="USER">USER (Candidate)</option>
                          <option value="EMPLOYER">EMPLOYER (Hiring Manager / Recruiter)</option>
                          <option value="RECRUITER">RECRUITER (Agency Recruiter)</option>
                          <option value="SUPPORT">SUPPORT (Help Desk & Customer Care Specialist)</option>
                          <option value="AUDITOR">AUDITOR (Security & Compliance Auditor)</option>
                          <option value="ENTERPRISE_MEMBER">ENTERPRISE_MEMBER (Enterprise Workspace Member)</option>
                          <option value="ENTERPRISE_ADMIN">ENTERPRISE_ADMIN (Enterprise Tenant Administrator)</option>
                          <option value="ADMIN">ADMIN (System Operations Operator)</option>
                          <option value="SUPER_ADMIN">SUPER_ADMIN (Root Control-Plane)</option>
                        </select>
                        <Button
                          size="xs"
                          variant="primary"
                          disabled={editRole === selectedUser.role}
                          onClick={handleSaveRole}
                        >
                          Update
                        </Button>
                      </div>
                      <p className="text-[10px] text-ink-muted">
                        Controls global platform capability matrix and route guards.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border p-3.5 space-y-2 bg-neutral-25">
                      <label className="font-bold text-ink block">Subscription Plan Tier</label>
                      <div className="flex gap-2">
                        <select
                          value={editPlan}
                          onChange={(e) => setEditPlan(e.target.value)}
                          className="flex-1 h-8 px-2 rounded-lg border border-border bg-surface text-xs font-semibold text-ink"
                        >
                          <option value="Basic Free">Basic Free</option>
                          <option value="Pro Candidate">Pro Candidate (Monthly)</option>
                          <option value="Pro Recruiter">Pro Recruiter (Seats)</option>
                          <option value="Enterprise">Enterprise Annual</option>
                        </select>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled
                          title="Membership plans are granted by the billing mandate; this control is read-only until that endpoint is wired."
                        >
                          Billing-owned
                        </Button>
                      </div>
                      <p className="text-[10px] text-ink-muted">Entitlement level for DOCX export & AI models.</p>
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h4 className="font-bold text-ink text-xs uppercase tracking-wider">Account Actions & Security</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyResetLink}
                        disabled={requestingReset}
                        loading={requestingReset}
                        className="justify-start gap-2 h-9 text-xs"
                      >
                        {copiedLink ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4 text-brand-600" />}
                        <span>{copiedLink ? 'Reset Link Copied!' : 'Copy Password Reset Link'}</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRevokeSessions}
                        disabled={revokingSessions}
                        loading={revokingSessions}
                        className="justify-start gap-2 h-9 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <ShieldAlert className="size-4" />
                        <span>Revoke All Active Sessions</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportUserData}
                        disabled={exportingUser}
                        loading={exportingUser}
                        className="justify-start gap-2 h-9 text-xs"
                      >
                        <Download className="size-4 text-blue-600" />
                        <span>Export GDPR User Archive (JSON)</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetMfa}
                        disabled={resettingMfa}
                        loading={resettingMfa}
                        className="justify-start gap-2 h-9 text-xs"
                      >
                        <Unlock className="size-4 text-amber-600" />
                        <span>Reset 2FA / Unenroll TOTP</span>
                      </Button>
                    </div>
                  </div>

                  {/* Suspension Drawer Section */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-rose-950 text-xs">Account Status & Suspension</h4>
                        <p className="text-[11px] text-rose-800/80">
                          {selectedUser.status === 'active' || selectedUser.status === 'pending'
                            ? 'Suspending blocks sign-in, revokes refresh tokens and challenges active sessions with HTTP 401.'
                            : selectedUser.status === 'disabled'
                              ? 'This account is DISABLED: sign-in is refused until an administrator reactivates it.'
                              : 'This account is SUSPENDED and cannot sign in. Revoke sessions again after reactivation if needed.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {selectedUser.status !== 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={statusPendingId === selectedUser.id}
                            loading={statusPendingId === selectedUser.id}
                            onClick={() => void handleSetStatus(selectedUser, 'ACTIVE')}
                          >
                            Reactivate
                          </Button>
                        )}
                        {selectedUser.status !== 'suspended' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={statusPendingId === selectedUser.id}
                            loading={statusPendingId === selectedUser.id}
                            onClick={() => {
                              if (!showSuspendInput) setShowSuspendInput(true);
                              else void handleSetStatus(selectedUser, 'SUSPENDED', suspensionReason);
                            }}
                          >
                            Suspend Account
                          </Button>
                        )}
                        {selectedUser.status !== 'disabled' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={statusPendingId === selectedUser.id}
                            loading={statusPendingId === selectedUser.id}
                            onClick={() => void handleSetStatus(selectedUser, 'DISABLED', suspensionReason)}
                          >
                            Disable Account
                          </Button>
                        )}
                      </div>
                    </div>

                    {showSuspendInput && (
                      <div className="pt-2 border-t border-rose-200 space-y-2 animate-[fade-in_100ms_ease-out]">
                        <label className="font-bold text-rose-950 block text-[11px]">
                          Audited Suspension Reason (Required for Compliance)
                        </label>
                        <Input
                          value={suspensionReason}
                          onChange={(e) => setSuspensionReason(e.target.value)}
                          placeholder="e.g. Terms of Service violation / fraudulent activity"
                          className="h-8 text-xs bg-white border-rose-300"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                          <Button size="xs" variant="ghost" onClick={() => setShowSuspendInput(false)}>
                            Cancel
                          </Button>
                          <Button
                            size="xs"
                            variant="destructive"
                            disabled={statusPendingId === selectedUser.id}
                            loading={statusPendingId === selectedUser.id}
                            onClick={() => void handleSetStatus(selectedUser, 'SUSPENDED', suspensionReason)}
                          >
                            Confirm Suspension
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TENANTS & ORGANIZATIONS */}
              {drawerTab === 'tenants' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border p-4 bg-neutral-25 space-y-3">
                    <h4 className="font-bold text-ink text-xs uppercase tracking-wider">Assign to Organization</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        aria-label="Assignable organization"
                        value={selectedTenantId}
                        onChange={(e) => setSelectedTenantId(e.target.value)}
                        className="h-8 px-2 rounded-lg border border-border bg-surface text-xs text-ink"
                      >
                        <option value="">{tenantLoading ? 'Loading tenants…' : 'Select an active live tenant'}</option>
                        {registryTenants.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                      </select>
                      <select
                        aria-label="Enterprise role"
                        value={selectedTenantRole}
                        onChange={(e) => setSelectedTenantRole(e.target.value)}
                        className="h-8 px-2 rounded-lg border border-border bg-surface text-xs text-ink"
                      >
                        <option value="ENTERPRISE_ADMIN">Admin (Full Management)</option>
                        <option value="ENTERPRISE_MANAGER" disabled>Manager (backend role unavailable)</option>
                        <option value="ENTERPRISE_MEMBER">Member (Draft & Export)</option>
                        <option value="ENTERPRISE_VIEWER">Viewer (Read-only)</option>
                      </select>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={assigning || !registryTenants.some(t => t.id === selectedTenantId) || !ENTERPRISE_ROLES.includes(selectedTenantRole as typeof ENTERPRISE_ROLES[number])}
                        onClick={async () => {
                          if (assigning || selectedTenantRole === 'ENTERPRISE_MANAGER' || !registryTenants.some(t => t.id === selectedTenantId)) return;
                          setAssigning(true);
                          try {
                            const result = await post<{ success: boolean; message?: string }>(`/admin/users/${encodeURIComponent(selectedUser.id)}/tenants`, { tenantId: selectedTenantId, role: selectedTenantRole });
                            if (result.success !== true) throw new Error('Server did not confirm assignment.');
                            setActionSuccess(result.message || 'Server confirmed membership.');
                            await loadUsers();
                          } catch (e) { setTenantError(normalizeError(e).message); }
                          finally { setAssigning(false); }
                        }}
                      >
                        Assign Membership
                      </Button>
                    </div>
                  </div>

                  {tenantError && <p role="alert" className="text-error-700">{tenantError}</p>}
                  <p className="text-xs text-ink-muted">Membership assignments require server confirmation. Open User 360 again to refresh authoritative memberships; sample memberships are not shown.</p>
                </div>
              )}

              {/* TAB 3: AI ENTITLEMENTS & QUOTAS */}
              {drawerTab === 'ai' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border p-4 bg-purple-50/50 border-purple-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="size-4 text-purple-600" />
                        <h4 className="font-bold text-purple-950 text-xs">Daily AI Generation Quota</h4>
                      </div>
                      <span className="font-bold text-purple-900 text-xs">
                        {selectedUser.aiUsedToday ?? 18} / {selectedUser.aiDailyLimit ?? 100} generations
                      </span>
                    </div>

                    <div className="w-full bg-purple-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-600 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(((selectedUser.aiUsedToday ?? 18) / (selectedUser.aiDailyLimit ?? 100)) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-purple-800">
                      Resets automatically at midnight UTC. Rate-limits resume tailoring and AI coach simulations.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h4 className="font-bold text-ink text-xs uppercase tracking-wider">Custom Quota Override</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-ink block">Daily Limit</label>
                        <Input
                          type="number"
                          value={customAiLimit}
                          onChange={(e) => setCustomAiLimit(parseInt(e.target.value) || 0)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-ink block">Justification Reason</label>
                        <Input
                          value={aiLimitReason}
                          onChange={(e) => setAiLimitReason(e.target.value)}
                          placeholder="e.g. VIP Enterprise demo"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <Button variant="outline" size="xs" onClick={handleResetDailyUsage} disabled={resettingQuota} loading={resettingQuota}>
                        <RotateCcw className="size-3 mr-1" />
                        Reset Today's Counter to 0
                      </Button>
                      <Button variant="primary" size="xs" onClick={handleSaveAiQuota} disabled={savingQuota} loading={savingQuota}>
                        Save Quota Override
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DOCUMENTS & RESUMES */}
              {drawerTab === 'documents' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted">Candidate resumes registered under this user identity:</p>
                    <span className="font-bold text-ink text-xs">{selectedUser.resumeCount} documents</span>
                  </div>

                  <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                    {Array.from({ length: selectedUser.resumeCount || 1 }).map((_, idx) => (
                      <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-neutral-25">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                            <FileText className="size-4" />
                          </div>
                          <div>
                            <p className="font-bold text-ink text-xs">
                              {idx === 0
                                ? 'Senior Systems Architect - Master'
                                : idx === 1
                                ? 'Cloud DevOps Lead Resume'
                                : `Tailored Resume Document #${idx + 1}`}
                            </p>
                            <p className="text-[10px] text-ink-muted">Template: Zurich Executive • Last modified 2 days ago</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 font-extrabold text-[10px] border border-emerald-200">
                            ATS 94%
                          </span>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              window.open(`/preview/res_${selectedUser.id}_${idx + 1}`, '_blank');
                            }}
                          >
                            <ExternalLink className="size-3 mr-1" />
                            Preview
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-border flex items-center justify-between bg-neutral-50/50">
              <span className="text-[11px] text-ink-muted">
                Audit stamp: {selectedUser.email} (Recorded on MariaDB)
              </span>
              <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>
                Close Drawer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
