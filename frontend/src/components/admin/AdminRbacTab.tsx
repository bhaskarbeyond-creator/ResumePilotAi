/**
 * Roles, permission bundles and grants (REC-005, INV-3, INV-6).
 *
 * ## Why this screen matters more than it looks
 *
 * Until now, changing what an ADMIN could do required a deploy, and granting a role
 * to a person required a migration. That made the answer to "can we let the on-call
 * engineer refund a payment for the next six hours?" *no*. This screen is where the
 * database-backed authority model becomes usable by a human.
 *
 * ## The three safety rules the API enforces, surfaced here first
 *
 * 1. **Editing requires `system.config.manage`** — in practice only a super-admin.
 *    The controls are disabled with a reason rather than hidden, because a disabled
 *    control teaches the model and a missing one teaches nothing.
 * 2. **SUPER_ADMIN cannot lose the wildcard** — the checkbox is locked with an
 *    explanation, because the server would reject it anyway (`BREAK_GLASS_REMOVAL_BLOCKED`).
 * 3. **A reason is mandatory** — the save button stays disabled until the reason is
 *    long enough, so the audit row can never record an unexplained change.
 *
 * ## Data contract
 *
 * `GET  /api/admin/rbac/roles`                    → roles with `storedPermissionCount`
 * `GET  /api/admin/rbac/roles/:role/permissions`  → stored `{resource, action}` list
 * `PUT  /api/admin/rbac/roles/:role/permissions`  → `{ permissions, reason }`
 * `GET  /api/admin/rbac/grants`                   → grants
 * `POST /api/admin/rbac/grants`                   → `{ uid, role, reason, expiresAt }`
 * `DELETE /api/admin/rbac/grants/:uid/:role`      → `{ reason }`
 *
 * @module components/admin/AdminRbacTab
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { del, get, post, put } from '@/lib/api-client';
import { AdminDataSurface } from '@/components/admin/shared/AdminDataSurface';
import { useCapabilities, useInvalidateCapabilities } from '@/hooks/use-capabilities';

interface RoleSummary {
  name: string;
  rank: number;
  isSystem: boolean;
  editable: boolean;
  storedPermissionCount: number;
}

interface RolesResponse {
  success: boolean;
  roles: RoleSummary[];
  source: { source: string; degraded: boolean };
}

interface Permission {
  resource: string;
  action: string;
}

interface RolePermissionsResponse {
  success: boolean;
  role: string;
  permissions: Permission[];
  editable: boolean;
}

interface Grant {
  uid: string;
  role: string;
  grantedBy: string;
  reason: string;
  expiresAt: string | null;
  grantedAt: string | null;
}

interface GrantsResponse {
  success: boolean;
  grants: Grant[];
}

/**
 * The actions an operator can grant. The server validates against its own
 * vocabulary (`KNOWN_ACTIONS`); this list exists so the UI cannot offer a value the
 * API will reject, and the vocabulary test keeps the two in step.
 */
const ACTIONS = ['read', 'write', 'manage', 'create', 'delete', 'view', 'execute', 'policy', 'send', 'roles', 'review', 'contact', 'self', 'consume'] as const;

/** Resources the console offers as a starting point, grouped by domain. */
const SUGGESTED_RESOURCES = [
  'users', 'users.roles', 'tenants', 'payments', 'subscriptions', 'audit', 'security',
  'system.config', 'secrets', 'messages', 'tickets', 'email.template', 'email.logs',
  'notifications', 'ai.entitlements', 'ai.usage', 'blog', 'content', 'workspace',
] as const;

const MIN_REASON = 12;

export function AdminRbacTab() {
  const { canDo, refetch: refetchCapabilities } = useCapabilities();
  const invalidateCapabilities = useInvalidateCapabilities();
  const canEdit = canDo('rbac', 'editRole');

  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'empty' | 'live' | 'partial'>('loading');
  const [error, setError] = useState<string | null>(null);

  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [draft, setDraft] = useState<Permission[]>([]);
  const [original, setOriginal] = useState<Permission[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [grantUid, setGrantUid] = useState('');
  const [grantRole, setGrantRole] = useState('ADMIN');
  const [grantReason, setGrantReason] = useState('');
  const [grantExpiry, setGrantExpiry] = useState('');
  const [grantError, setGrantError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    // Two independent reads: a failure in one must not blank the other, so they are
    // awaited separately and composed into `partial` rather than collapsing to error.
    const [rolesResult, grantsResult] = await Promise.allSettled([
      get<RolesResponse>('/admin/rbac/roles'),
      get<GrantsResponse>('/admin/rbac/grants'),
    ]);

    const failed: string[] = [];
    if (rolesResult.status === 'fulfilled' && Array.isArray(rolesResult.value?.roles)) {
      setRoles(rolesResult.value.roles);
    } else {
      failed.push('roles');
      setError(rolesResult.status === 'rejected' && rolesResult.reason instanceof Error ? rolesResult.reason.message : 'Roles could not be loaded');
    }
    if (grantsResult.status === 'fulfilled' && Array.isArray(grantsResult.value?.grants)) {
      setGrants(grantsResult.value.grants);
    } else {
      failed.push('grants');
    }

    if (failed.length === 2) setStatus('error');
    else if (failed.length === 1) setStatus('partial');
    else setStatus((rolesResult.status === 'fulfilled' && rolesResult.value.roles.length === 0) ? 'empty' : 'live');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openRole = useCallback(async (role: string) => {
    setSelectedRole(role);
    setSaveError(null);
    setSaveNotice(null);
    setReason('');
    try {
      const response = await get<RolePermissionsResponse>(`/admin/rbac/roles/${encodeURIComponent(role)}/permissions`);
      const permissions = Array.isArray(response?.permissions) ? response.permissions : [];
      setDraft(permissions);
      setOriginal(permissions);
    } catch (caught) {
      setDraft([]);
      setOriginal([]);
      setSaveError(caught instanceof Error ? caught.message : 'The bundle could not be loaded');
    }
  }, []);

  const key = (permission: Permission) => `${permission.resource}:${permission.action}`;
  const draftKeys = useMemo(() => new Set(draft.map(key)), [draft]);
  const originalKeys = useMemo(() => new Set(original.map(key)), [original]);
  const added = [...draftKeys].filter((entry) => !originalKeys.has(entry));
  const removed = [...originalKeys].filter((entry) => !draftKeys.has(entry));
  const changed = added.length + removed.length > 0;
  const reasonReady = reason.trim().length >= MIN_REASON;
  const isBreakGlass = selectedRole === 'SUPER_ADMIN';
  const wildcardPinned = isBreakGlass && originalKeys.has('*:*');

  const toggle = (permission: Permission) => {
    if (!canEdit) return;
    const permissionKey = key(permission);
    // The wildcard is the break-glass guarantee (INV-2). The server rejects its
    // removal; the UI refuses to offer the gesture at all.
    if (wildcardPinned && permissionKey === '*:*') return;
    setDraft((previous) => (previous.some((entry) => key(entry) === permissionKey)
      ? previous.filter((entry) => key(entry) !== permissionKey)
      : [...previous, permission]));
  };

  const resources = useMemo(() => {
    const union = new Set<string>(SUGGESTED_RESOURCES);
    for (const permission of [...draft, ...original]) union.add(permission.resource);
    return [...union].sort();
  }, [draft, original]);

  const save = async () => {
    if (!selectedRole || !changed || !reasonReady) return;
    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const response = await put<{ success: boolean; changed: boolean; added: string[]; removed: string[]; auditRecorded: boolean }>(
        `/admin/rbac/roles/${encodeURIComponent(selectedRole)}/permissions`,
        { permissions: draft, reason: reason.trim() },
      );
      setOriginal(draft);
      setReason('');
      setSaveNotice(
        response.changed
          ? `Saved. +${response.added.length} / −${response.removed.length}, ${response.auditRecorded ? 'audit row written' : 'AUDIT ROW MISSING'}.`
          : 'No change: the bundle already matched, so nothing was written or audited.',
      );
      await Promise.all([load(), refetchCapabilities(), invalidateCapabilities()]);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'The bundle could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const grant = async () => {
    setGrantError(null);
    if (grantReason.trim().length < MIN_REASON) {
      setGrantError(`Give a reason of at least ${MIN_REASON} characters — it is stored in the audit trail.`);
      return;
    }
    try {
      await post('/admin/rbac/grants', {
        uid: grantUid.trim(),
        role: grantRole,
        reason: grantReason.trim(),
        expiresAt: grantExpiry ? new Date(grantExpiry).toISOString() : null,
      });
      setGrantUid('');
      setGrantReason('');
      setGrantExpiry('');
      await load();
    } catch (caught) {
      setGrantError(caught instanceof Error ? caught.message : 'The grant could not be created');
    }
  };

  const revoke = async (row: Grant) => {
    // A revoke without a reason is refused by the API; ask here so the operator
    // writes the sentence once rather than discovering the rule after a failed call.
    const supplied = window.prompt(`Reason for revoking ${row.role} from ${row.uid}? (min ${MIN_REASON} characters)`);
    if (!supplied) return;
    try {
      await del(`/admin/rbac/grants/${encodeURIComponent(row.uid)}/${encodeURIComponent(row.role)}`, { reason: supplied.trim() });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The grant could not be revoked');
    }
  };

  return (
    <AdminDataSurface
      label="Roles and access"
      status={status}
      error={error}
      failedPanels={status === 'partial' ? ['one of roles or grants'] : []}
      emptyMessage="No roles are defined. Migration 028 seeds the built-in roles; an empty table means the store was not provisioned."
      onRetry={() => void load()}
      toolbar={
        canEdit ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success-700">
            <ShieldCheck className="size-4" aria-hidden="true" /> You may edit authority
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Lock className="size-4" aria-hidden="true" /> Read-only for your role
          </span>
        )
      }
    >
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* roles */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-ink">Roles</h2>
          <ul className="space-y-1" aria-label="Roles">
            {roles.map((role) => (
              <li key={role.name}>
                <button
                  type="button"
                  onClick={() => void openRole(role.name)}
                  aria-current={selectedRole === role.name ? 'true' : undefined}
                  className={[
                    'flex w-full min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                    selectedRole === role.name
                      ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200'
                      : 'border-border bg-surface text-ink hover:bg-muted',
                  ].join(' ')}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{role.name}</span>
                    <span className="text-2xs text-ink-muted">
                      rank {role.rank} · {role.storedPermissionCount} permission{role.storedPermissionCount === 1 ? '' : 's'}
                      {role.editable ? '' : ' · managed elsewhere'}
                    </span>
                  </span>
                  {role.name === 'SUPER_ADMIN' && <KeyRound className="size-4 shrink-0 text-warning-600" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* bundle editor */}
        <div className="space-y-3">
          {!selectedRole ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-secondary">
              Select a role to see its permission bundle.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">
                  {selectedRole} bundle <span className="font-normal text-ink-muted">({draft.length} permissions)</span>
                </h2>
                {changed && (
                  <span className="text-xs font-semibold text-ink-secondary" data-testid="rbac-diff">
                    +{added.length} / −{removed.length} pending
                  </span>
                )}
              </div>

              {roles.find((role) => role.name === selectedRole)?.editable === false && (
                <p className="rounded-xl border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700">
                  This role is owned by the enterprise module and is read-only here. Editing it would create a
                  second source of truth for tenant authority.
                </p>
              )}
              {wildcardPinned && (
                <p className="rounded-xl border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700">
                  The wildcard cannot be removed from SUPER_ADMIN: it is the break-glass guarantee that a
                  deployment can always recover itself.
                </p>
              )}

              <div className="max-h-[28rem] overflow-auto rounded-2xl border border-border">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <caption className="sr-only">Permission matrix for {selectedRole}: resource rows, action columns</caption>
                  <thead className="sticky top-0 z-10 bg-muted text-2xs uppercase tracking-wide text-ink-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-bold">Resource</th>
                      {ACTIONS.map((action) => (
                        <th key={action} scope="col" className="px-1 py-2 text-center font-bold">{action}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((resource) => (
                      <tr key={resource} className="border-t border-border">
                        <th scope="row" className="px-3 py-1 text-left font-mono text-xs font-normal text-ink">{resource}</th>
                        {ACTIONS.map((action) => {
                          const permission = { resource, action };
                          const checked = draftKeys.has(key(permission));
                          const changedHere = checked !== originalKeys.has(key(permission));
                          const locked = !canEdit || (wildcardPinned && key(permission) === '*:*');
                          return (
                            <td key={action} className={`px-1 py-1 text-center ${changedHere ? 'bg-brand-50' : ''}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={locked}
                                onChange={() => toggle(permission)}
                                aria-label={`${resource} ${action} for ${selectedRole}`}
                                className="size-5 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 rounded-2xl border border-border p-3">
                <label htmlFor="rbac-reason" className="block text-xs font-bold text-ink">
                  Reason (required, stored in the audit trail)
                </label>
                <textarea
                  id="rbac-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  placeholder="Why is this authority change needed? An auditor will read this."
                  className="w-full rounded-xl border border-border bg-surface p-2 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!canEdit || !changed || !reasonReady || saving}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    {saving ? 'Saving…' : 'Save bundle'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDraft(original); setReason(''); setSaveError(null); setSaveNotice(null); }}
                    disabled={!changed}
                    className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    Discard changes
                  </button>
                  {!reasonReady && <span className="text-2xs text-ink-muted">At least {MIN_REASON} characters ({reason.trim().length})</span>}
                </div>
                {saveError && <p role="alert" className="text-xs font-semibold text-error-700">{saveError}</p>}
                {saveNotice && <p role="status" className="text-xs font-semibold text-success-700">{saveNotice}</p>}
              </div>
            </>
          )}

          {/* grants */}
          <section className="space-y-2 rounded-2xl border border-border p-3" aria-label="Temporary role grants">
            <h2 className="text-sm font-bold text-ink">Temporary grants</h2>
            <p className="text-xs text-ink-muted">
              A grant adds a role to a person for a while. It expires on its own, and every grant is audited
              with the reason you type here.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-2xs font-bold uppercase text-ink-muted">
                Firebase uid
                <input
                  value={grantUid}
                  onChange={(event) => setGrantUid(event.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm font-normal normal-case text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-2xs font-bold uppercase text-ink-muted">
                Role
                <select
                  value={grantRole}
                  onChange={(event) => setGrantRole(event.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm font-normal normal-case text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {roles.filter((role) => role.editable).map((role) => (
                    <option key={role.name} value={role.name}>{role.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-2xs font-bold uppercase text-ink-muted">
                Expires (optional)
                <input
                  type="datetime-local"
                  value={grantExpiry}
                  onChange={(event) => setGrantExpiry(event.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm font-normal normal-case text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-2xs font-bold uppercase text-ink-muted">
                Reason
                <input
                  value={grantReason}
                  onChange={(event) => setGrantReason(event.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm font-normal normal-case text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
              </label>
            </div>
            {grantError && <p role="alert" className="text-xs font-semibold text-error-700">{grantError}</p>}
            <button
              type="button"
              onClick={() => void grant()}
              disabled={!canEdit || !grantUid.trim() || grantReason.trim().length < MIN_REASON}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Plus className="size-4" aria-hidden="true" /> Create grant
            </button>

            {grants.length === 0 ? (
              <p className="text-xs text-ink-muted">No temporary grants are active.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
                  <caption className="sr-only">Active temporary role grants</caption>
                  <thead className="text-2xs uppercase text-ink-muted">
                    <tr>
                      <th scope="col" className="py-1 pr-2 font-bold">Uid</th>
                      <th scope="col" className="py-1 pr-2 font-bold">Role</th>
                      <th scope="col" className="py-1 pr-2 font-bold">Expires</th>
                      <th scope="col" className="py-1 pr-2 font-bold">Reason</th>
                      <th scope="col" className="py-1 font-bold"><span className="sr-only">Revoke</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((row) => (
                      <tr key={`${row.uid}-${row.role}`} className="border-t border-border">
                        <td className="py-1 pr-2 font-mono">{row.uid}</td>
                        <td className="py-1 pr-2 font-semibold">{row.role}</td>
                        <td className="py-1 pr-2">{row.expiresAt ? new Date(row.expiresAt).toLocaleString() : 'never'}</td>
                        <td className="py-1 pr-2 text-ink-secondary">{row.reason}</td>
                        <td className="py-1 text-right">
                          <button
                            type="button"
                            onClick={() => void revoke(row)}
                            disabled={!canEdit}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-error-700 hover:bg-error-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            <span className="sr-only">Revoke {row.role} from {row.uid}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminDataSurface>
  );
}

export default AdminRbacTab;
