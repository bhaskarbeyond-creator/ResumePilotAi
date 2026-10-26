/**
 * Security console — events, staff authority, the audit trail and platform broadcasts.
 *
 * Everything here is read from the endpoint that owns it, and every mutation is the server's
 * answer. What it used to be: four hard-coded arrays (`INITIAL_EVENTS`, `INITIAL_OPERATORS`,
 * `INITIAL_AUDITS`, `INITIAL_ANNOUNCEMENTS`) whose rows were indistinguishable from real
 * telemetry, plus actions that only changed local state and then reported success — "Active
 * tokens & refresh tokens revoked", "Edge IP block rule added for 203.0.113.44", "RBAC role
 * updated to AUDITOR". None of those calls existed. A security console that invents its own
 * incident list is worse than no console: it answers "are we breached?" with fiction.
 *
 * Endpoints used:
 *   GET    /api/platform/security-events?limit=          security_audit_logs
 *   GET    /api/admin/audit-logs?limit=&search=          administrative trail (audit.read)
 *   GET    /api/admin/audit-logs/stats                   high-severity / failure counts
 *   GET    /api/admin/users?limit=                       staff directory (role, suspended)
 *   PATCH  /api/admin/users/:uid                         role change, revision-guarded
 *   POST   /api/admin/users/:uid/revoke-sessions         real token revocation
 *   GET    /api/platform/announcements                   broadcasts
 *   POST   /api/platform/announcements                   create (audited)
 *   PATCH  /api/platform/announcements/:id               enable/disable, revision-guarded
 *   DELETE /api/platform/announcements/:id               remove (audited)
 *
 * There is no edge-proxy IP-block endpoint; the control that pretended to have one is gone
 * rather than left as a button that does nothing (`OI-SEC-1`).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Megaphone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { del, get, patch, post } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';
import { ASSIGNABLE_ROLES, readDirectory, type AdminDirectoryPayload, type AdminUserRecord } from './admin-users-model';

/* ── wire shapes ─────────────────────────────────────────────────────── */

interface SecurityEvent {
  id: string;
  action: string;
  actorUid: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  targetUid: string | null;
  targetType: string | null;
  targetId: string | null;
  tenantId: string | null;
  category: string | null;
  severity: string;
  outcome: string;
  method: string | null;
  pathname: string | null;
  statusCode: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  actorEmail: string | null;
  actorUid: string | null;
  category: string | null;
  severity: string;
  outcome: string | null;
  statusCode: number | null;
  pathname: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  severity: string;
  audience: string;
  enabled: boolean;
  revision: number;
  createdBy: string | null;
  updatedAt: string | null;
}

const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT']);

type SubTab = 'events' | 'staff' | 'audit' | 'broadcasts';

const SEVERITY_PILL: Record<string, string> = {
  CRITICAL: 'bg-error-50 text-error-700 border-error-100',
  HIGH: 'bg-error-50 text-error-700 border-error-100',
  MEDIUM: 'bg-warning-50 text-warning-700 border-warning-100',
  INFO: 'bg-info-50 text-info-700 border-info-100',
};

function severityPill(severity: string): string {
  return SEVERITY_PILL[severity] ?? 'bg-neutral-100 text-ink-secondary border-border dark:bg-neutral-800';
}

/* ── the tab ─────────────────────────────────────────────────────────── */

export function AdminSecurityTab() {
  const [subTab, setSubTab] = useState<SubTab>('events');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const announce = (tone: 'success' | 'error', text: string) => setNotice({ tone, text });
  const report = (error: unknown) => {
    const failure = describeAdminFailure(error);
    announce('error', `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Security &amp; audit</h2>
        <p className="text-xs text-ink-muted">
          Live security telemetry, staff authority, the administrative trail and platform-wide
          broadcasts. Every row is a stored record; nothing here is sampled or generated.
        </p>
      </div>

      {notice && (
        <div
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={cn(
            'flex items-start gap-2 rounded-xl border p-3 text-xs',
            notice.tone === 'success'
              ? 'border-success-100 bg-success-50 text-success-700'
              : 'border-error-100 bg-error-50 text-error-700',
          )}
        >
          {notice.tone === 'success' ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="min-h-11 cursor-pointer px-2 text-2xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-9">
            Dismiss
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Security sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {(
          [
            { id: 'events', label: 'Security events', icon: ShieldAlert },
            { id: 'staff', label: 'Staff authority', icon: Users },
            { id: 'audit', label: 'Audit trail', icon: ShieldCheck },
            { id: 'broadcasts', label: 'Broadcasts', icon: Megaphone },
          ] as const
        ).map((entry) => {
          const Icon = entry.icon;
          const active = subTab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`security-panel-${entry.id}`}
              onClick={() => setSubTab(entry.id)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 text-xs font-bold transition-colors',
                active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="size-3.5" />
              {entry.label}
            </button>
          );
        })}
      </div>

      {subTab === 'events' && <EventsPanel />}
      {subTab === 'staff' && <StaffPanel announce={announce} report={report} />}
      {subTab === 'audit' && <AuditPanel />}
      {subTab === 'broadcasts' && <BroadcastsPanel announce={announce} report={report} />}
    </div>
  );
}

/* ── events ──────────────────────────────────────────────────────────── */

function EventsPanel() {
  const load = useCallback(
    (signal: AbortSignal) =>
      get<{ events?: SecurityEvent[]; count?: number; source?: string }>(
        '/platform/security-events',
        { limit: 100 },
        { signal },
      ),
    [],
  );
  const resource = useAdminResource(load);
  const events = resource.data?.events ?? [];
  const [severity, setSeverity] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = events.filter((event) => {
    if (severity !== 'ALL' && event.severity !== severity) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${event.action} ${event.actorEmail ?? ''} ${event.pathname ?? ''} ${event.ipAddress ?? ''}`
      .toLowerCase()
      .includes(needle);
  });

  return (
    <section id="security-panel-events" role="tabpanel" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'INFO'].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={severity === option}
            onClick={() => setSeverity(option)}
            className={cn(
              'min-h-11 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors',
              severity === option ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-muted dark:bg-neutral-800',
            )}
          >
            {option}
          </button>
        ))}
        <div className="relative ml-auto max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter action, actor, path, IP…"
            aria-label="Filter security events"
            className="h-11 pl-9 text-xs sm:h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={resource.reload} disabled={resource.status === 'loading'}>
          <RefreshCw className={cn('mr-1 size-3.5', resource.status === 'loading' && 'animate-spin')} />
          Reload
        </Button>
      </div>

      {resource.status === 'loading' && resource.data === null && <AdminLoadingPanel label="Reading security events…" />}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel title="Security events could not be read" error={resource.error} onRetry={resource.reload} />
      )}
      {resource.status === 'ready' && events.length === 0 && (
        <AdminEmptyPanel
          title="No security event recorded"
          description="security_audit_logs is empty. That is an empty table, not a clean bill of health — the API said so."
        />
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-xs">
            <caption className="sr-only">Security events, newest first</caption>
            <thead className="border-b border-border bg-canvas">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">When</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Severity</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Action</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Actor</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Path</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((event) => (
                <tr key={event.id} className="align-top hover:bg-neutral-25 dark:hover:bg-neutral-800/30">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{event.createdAt ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-bold uppercase', severityPill(event.severity))}>
                      {event.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                      aria-expanded={expanded === event.id}
                      className="cursor-pointer text-left font-mono text-2xs text-brand-700 hover:underline"
                    >
                      {event.action}
                    </button>
                    {expanded === event.id && (
                      <pre className="mt-1 max-w-md overflow-x-auto rounded-lg bg-canvas p-2 text-2xs text-ink-secondary">
                        {JSON.stringify(
                          {
                            outcome: event.outcome,
                            statusCode: event.statusCode,
                            requestId: event.requestId,
                            targetType: event.targetType,
                            targetId: event.targetId,
                            userAgent: event.userAgent,
                            metadata: event.metadata,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">{event.actorEmail ?? event.actorUid ?? 'system'}</td>
                  <td className="px-3 py-2 font-mono text-2xs text-ink-muted">{event.pathname ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-2xs text-ink-muted">{event.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-2xs text-ink-muted">
        {visible.length} of {events.length} events shown · source {resource.data?.source ?? 'unknown'} · newest first
      </p>
    </section>
  );
}

/* ── staff authority ─────────────────────────────────────────────────── */

function StaffPanel({
  announce,
  report,
}: {
  announce: (tone: 'success' | 'error', text: string) => void;
  report: (error: unknown) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => get<AdminDirectoryPayload>('/admin/users', { limit: 200 }, { signal }),
    [],
  );
  const resource = useAdminResource(load);
  const staff = useMemo(
    () => readDirectory(resource.data).filter((user) => STAFF_ROLES.has(user.role)),
    [resource.data],
  );
  const [busy, setBusy] = useState<string | null>(null);

  const changeRole = async (user: AdminUserRecord, role: string) => {
    setBusy(`role-${user.id}`);
    try {
      await patch(`/admin/users/${user.id}`, { role, expectedRole: user.role });
      announce('success', `${user.email}: role ${user.role} → ${role}. Refresh tokens revoked by the server.`);
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (user: AdminUserRecord) => {
    setBusy(`revoke-${user.id}`);
    try {
      const response = await post<{ message?: string }>(`/admin/users/${user.id}/revoke-sessions`, {});
      announce('success', response?.message || `Refresh tokens revoked for ${user.email}.`);
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="security-panel-staff" role="tabpanel" className="space-y-3">
      {resource.status === 'loading' && resource.data === null && <AdminLoadingPanel label="Reading the staff directory…" />}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel title="The staff directory could not be read" error={resource.error} onRetry={resource.reload} />
      )}
      {resource.status === 'ready' && staff.length === 0 && (
        <AdminEmptyPanel
          title="No administrative identities"
          description="No account in the directory holds ADMIN, SUPER_ADMIN, AUDITOR or SUPPORT."
        />
      )}

      {staff.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {staff.map((user) => (
            <li key={user.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-ink">{user.displayName}</p>
                <p className="truncate text-2xs text-ink-muted">
                  {user.email} · {user.id} · last sign-in {user.lastLogin}
                  {user.mfaEnabled ? ' · MFA enrolled' : ' · no MFA'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.email}</label>
                <select
                  id={`role-${user.id}`}
                  value={user.role}
                  onChange={(event) => changeRole(user, event.target.value)}
                  disabled={busy !== null}
                  className="h-11 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-ink sm:h-9"
                >
                  {/* SUPER_ADMIN is shown when it is the current value — removing it from the
                      list would misreport the account's authority — but it is not assignable. */}
                  {user.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">SUPER_ADMIN (claim-only)</option>}
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revoke(user)}
                  loading={busy === `revoke-${user.id}`}
                  className="min-h-11 sm:min-h-9"
                >
                  Revoke sessions
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── audit trail ─────────────────────────────────────────────────────── */

function AuditPanel() {
  const [search, setSearch] = useState('');
  const load = useCallback(
    (signal: AbortSignal) =>
      get<{ logs?: AuditLog[]; count?: number; hasMore?: boolean; source?: string }>(
        '/admin/audit-logs',
        { limit: 100, ...(search.trim() ? { search: search.trim() } : {}) },
        { signal },
      ),
    [search],
  );
  const resource = useAdminResource(load);
  const logs = resource.data?.logs ?? [];

  const loadStats = useCallback(
    (signal: AbortSignal) =>
      get<{ highSeverityCount?: number; failureCount?: number; categoryCounts?: Record<string, number> }>(
        '/admin/audit-logs/stats',
        undefined,
        { signal },
      ),
    [],
  );
  const stats = useAdminResource(loadStats);

  /**
   * Formula-neutralised CSV. A cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed
   * with an apostrophe so a spreadsheet treats it as text instead of executing it. Exported
   * from the rows the server returned, not from anything the component invented.
   */
  const exportCsv = () => {
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const header = ['id', 'createdAt', 'action', 'category', 'severity', 'outcome', 'actorEmail', 'pathname', 'statusCode'];
    const body = logs.map((log) =>
      [log.id, log.createdAt, log.action, log.category, log.severity, log.outcome, log.actorEmail, log.pathname, log.statusCode]
        .map(cell)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="security-panel-audit" role="tabpanel" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action, actor, resource…"
            aria-label="Search the audit trail"
            className="h-11 pl-9 text-xs sm:h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={resource.reload} disabled={resource.status === 'loading'}>
          <RefreshCw className={cn('mr-1 size-3.5', resource.status === 'loading' && 'animate-spin')} />
          Reload
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={logs.length === 0}>
          <Download className="mr-1 size-3.5" />
          Export CSV
        </Button>
      </div>

      {stats.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Rows returned" value={String(logs.length)} />
          <StatTile label="High severity" value={String(stats.data.highSeverityCount ?? 0)} tone={(stats.data.highSeverityCount ?? 0) > 0 ? 'warn' : undefined} />
          <StatTile label="Failures" value={String(stats.data.failureCount ?? 0)} tone={(stats.data.failureCount ?? 0) > 0 ? 'warn' : undefined} />
          <StatTile label="Categories" value={String(Object.keys(stats.data.categoryCounts ?? {}).length)} />
        </div>
      )}

      {resource.status === 'loading' && resource.data === null && <AdminLoadingPanel label="Reading the audit trail…" />}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel title="The audit trail could not be read" error={resource.error} onRetry={resource.reload} />
      )}
      {resource.status === 'ready' && logs.length === 0 && (
        <AdminEmptyPanel
          title="No audit rows match"
          description={
            search.trim()
              ? `No administrative action matches “${search.trim()}”.`
              : 'The administrative trail is empty. That is unusual — check that the audit middleware is mounted before reading it as "nothing happened".'
          }
        />
      )}

      {logs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[900px] text-xs">
            <caption className="sr-only">Administrative audit trail, newest first</caption>
            <thead className="border-b border-border bg-canvas">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">When</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Action</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Category</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Severity</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Actor</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Resource</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-25 dark:hover:bg-neutral-800/30">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{log.createdAt ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-2xs text-ink">{log.action}</td>
                  <td className="px-3 py-2 text-ink-secondary">{log.category ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-bold uppercase', severityPill(log.severity))}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">{log.actorEmail ?? log.actorUid ?? 'system'}</td>
                  <td className="px-3 py-2 text-2xs text-ink-muted">
                    {log.resourceType ? `${log.resourceType}:${log.resourceId ?? '—'}` : log.pathname ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-2xs text-ink-muted">
        {logs.length} rows · source {resource.data?.source ?? 'unknown'}
        {resource.data?.hasMore ? ' · more rows exist; narrow the search' : ''}
      </p>
    </section>
  );
}

/* ── broadcasts ──────────────────────────────────────────────────────── */

function BroadcastsPanel({
  announce,
  report,
}: {
  announce: (tone: 'success' | 'error', text: string) => void;
  report: (error: unknown) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      get<{ announcements?: Announcement[]; source?: string }>('/platform/announcements', undefined, { signal }),
    [],
  );
  const resource = useAdminResource(load);
  const rows = resource.data?.announcements ?? [];

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'INFO' | 'MEDIUM' | 'HIGH'>('INFO');
  const [audience, setAudience] = useState('ALL');
  const [busy, setBusy] = useState<string | null>(null);

  const createAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('create');
    try {
      await post('/platform/announcements', { title: title.trim(), message: message.trim(), severity, audience });
      announce('success', `Broadcast “${title.trim()}” published for ${audience}.`);
      setTitle('');
      setMessage('');
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (row: Announcement) => {
    setBusy(row.id);
    try {
      await patch(`/platform/announcements/${encodeURIComponent(row.id)}`, {
        enabled: !row.enabled,
        expectedRevision: row.revision,
      });
      announce('success', `Broadcast “${row.title}” ${row.enabled ? 'withdrawn' : 'enabled'}.`);
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: Announcement) => {
    setBusy(`del-${row.id}`);
    try {
      await del(`/platform/announcements/${encodeURIComponent(row.id)}`);
      announce('success', `Broadcast “${row.title}” deleted.`);
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="security-panel-broadcasts" role="tabpanel" className="space-y-4">
      <form onSubmit={createAnnouncement} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink">New broadcast</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="ann-title" className="block text-2xs font-bold text-ink">Title</label>
            <Input
              id="ann-title"
              required
              minLength={3}
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 text-xs sm:h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="ann-severity" className="block text-2xs font-bold text-ink">Severity</label>
              <select
                id="ann-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as 'INFO' | 'MEDIUM' | 'HIGH')}
                className="h-11 w-full rounded-lg border border-border bg-surface px-2 text-xs sm:h-9"
              >
                <option value="INFO">INFO</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="ann-audience" className="block text-2xs font-bold text-ink">Audience</label>
              <select
                id="ann-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-surface px-2 text-xs sm:h-9"
              >
                <option value="ALL">ALL</option>
                <option value="ADMIN">ADMIN</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
                <option value="EMPLOYER">EMPLOYER</option>
              </select>
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="ann-message" className="block text-2xs font-bold text-ink">Message</label>
          <Input
            id="ann-message"
            required
            minLength={3}
            maxLength={1000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="h-11 text-xs sm:h-9"
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" loading={busy === 'create'} className="min-h-11 sm:min-h-9">
            Publish broadcast
          </Button>
        </div>
      </form>

      {resource.status === 'loading' && resource.data === null && <AdminLoadingPanel label="Reading broadcasts…" />}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel title="Broadcasts could not be read" error={resource.error} onRetry={resource.reload} />
      )}
      {resource.status === 'ready' && rows.length === 0 && (
        <AdminEmptyPanel title="No broadcast published" description="platform_announcements returned no rows." tone="neutral" />
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-bold text-ink">
                  {row.title}
                  <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-bold uppercase', severityPill(row.severity))}>
                    {row.severity}
                  </span>
                  {!row.enabled && (
                    <span className="rounded-full border border-border bg-neutral-100 px-2 py-0.5 text-2xs font-bold uppercase text-ink-muted dark:bg-neutral-800">
                      withdrawn
                    </span>
                  )}
                </p>
                <p className="line-clamp-2 text-2xs text-ink-secondary">{row.message}</p>
                <p className="text-2xs text-ink-muted">
                  {row.audience} · revision {row.revision} · {row.createdBy ?? 'unknown'} · updated {row.updatedAt ?? '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggle(row)}
                  loading={busy === row.id}
                  className="min-h-11 sm:min-h-9"
                >
                  {row.enabled ? 'Withdraw' : 'Enable'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row)}
                  loading={busy === `del-${row.id}`}
                  className="min-h-11 text-error-700 sm:min-h-9"
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={cn('mt-1 text-sm font-bold', tone === 'warn' ? 'text-warning-700' : 'text-ink')}>{value}</dd>
    </div>
  );
}
