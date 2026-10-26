/**
 * Administrative audit trail (REC-008, INV-6).
 *
 * ## What this surface is for
 *
 * "Who changed what, when, and from what value to what value." Three consumers:
 * an auditor proving compliance, an operator reconstructing an incident, and a
 * subject asking what was done to their account. All three need the same three
 * things: the actor, the scope, and the **before/after diff** when one exists.
 *
 * ## What it deliberately does not do
 *
 * It does not synthesise rows, fill gaps with placeholders, or render a numeric
 * total when the fetch failed. A trail that is partly invented is worse than no
 * trail, because it is trusted.
 *
 * ## Data contract
 *
 * `GET /api/admin/audit-logs?limit&cursor&action&actorUid&outcome&from&to`
 * → `{ success, logs[], count, hasMore, nextCursor, source }`
 * (`backend/routes/adminAudit.js:14`, `services/…`, read-time redaction applied
 * server-side by `queryAdminAuditLogs`).
 *
 * @module components/admin/AdminAuditTab
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Filter, Search } from 'lucide-react';
import { get } from '@/lib/api-client';
import { AdminDataSurface } from '@/components/admin/shared/AdminDataSurface';

/** One audit row as the API returns it (metadata is already redacted server-side). */
interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  severity: 'INFO' | 'MEDIUM' | 'HIGH' | string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE' | string;
  method: string;
  pathname: string;
  statusCode: number;
  occurredAt: string;
  requestId: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

interface AuditResponse {
  success: boolean;
  logs: AuditLog[];
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  source: string;
}

const PAGE_SIZE = 50;

const SEVERITY_STYLE: Record<string, string> = {
  HIGH: 'bg-error-50 text-error-700 border-error-100',
  MEDIUM: 'bg-warning-50 text-warning-700 border-warning-100',
  INFO: 'bg-info-50 text-info-700 border-info-100',
};

const OUTCOME_STYLE: Record<string, string> = {
  SUCCESS: 'text-success-700',
  DENIED: 'text-warning-700',
  FAILURE: 'text-error-700',
};

/**
 * Render a metadata value without ever trusting it to be a string. The server
 * redacts secrets before storing, so nothing here needs to re-implement redaction —
 * but it must not crash on an object, an array or `null`.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(describeValue).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return '[unprintable]';
  }
}

/** The `before`/`after` diff, when the row carries one (authority changes do). */
function readDiff(metadata: Record<string, unknown> | undefined): { before: string[]; after: string[]; added: string[]; removed: string[] } | null {
  if (!metadata) return null;
  const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.map(describeValue) : []);
  const before = asStrings(metadata.before);
  const after = asStrings(metadata.after);
  if (before.length === 0 && after.length === 0) return null;
  return { before, after, added: asStrings(metadata.added), removed: asStrings(metadata.removed) };
}

export function AdminAuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'empty' | 'live'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const [severity, setSeverity] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!append) setStatus('loading');
      setError(null);
      try {
        const params: Record<string, unknown> = { limit: PAGE_SIZE };
        if (cursor) params.cursor = cursor;
        if (search.trim()) params.search = search.trim();
        if (outcome) params.outcome = outcome;
        if (severity) params.severity = severity;
        const response = await get<AuditResponse>('/admin/audit-logs', params);

        // A response without `logs` is not an empty trail; it is a broken contract.
        if (!Array.isArray(response?.logs)) {
          throw new Error('The audit endpoint returned no log collection');
        }
        setLogs((previous) => (append ? [...previous, ...response.logs] : response.logs));
        setHasMore(Boolean(response.hasMore));
        setNextCursor(response.nextCursor ?? null);
        // Status is derived from the response in hand, never from state that is
        // updated asynchronously — reading `logs` here would report the previous
        // page's emptiness for one render.
        setStatus((append || response.logs.length > 0) ? 'live' : 'empty');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The audit trail could not be loaded');
        if (!append) setLogs([]);
        setStatus('error');
      }
    },
    [search, outcome, severity],
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const rows = useMemo(
    () => logs.filter((log) => {
      if (!search.trim()) return true;
      const needle = search.trim().toLowerCase();
      return [log.action, log.actorEmail, log.actorUid, log.pathname, log.category]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    }),
    [logs, search],
  );

  /** CSV export runs entirely in the browser on rows already on screen. */
  const exportCsv = () => {
    const header = ['occurredAt', 'actorEmail', 'actorUid', 'actorRole', 'action', 'category', 'severity', 'outcome', 'method', 'pathname', 'statusCode', 'requestId'];
    const escape = (value: unknown) => `"${describeValue(value).replace(/"/g, '""')}"`;
    const csv = [header.join(','), ...logs.map((log) => header.map((key) => escape(log[key as keyof AuditLog])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminDataSurface
      label="Audit trail"
      status={status}
      error={error}
      emptyMessage="No audit entries match these filters. Administrative actions are recorded here as they happen."
      onRetry={() => void fetchPage(null, false)}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search audit entries</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search actor, action, path"
              className="min-h-11 w-56 rounded-xl border border-border bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            aria-controls="audit-filters"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Filter className="size-4" aria-hidden="true" />
            Filters
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={logs.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Download className="size-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      }
    >
      {showFilters && (
        <div id="audit-filters" className="flex flex-wrap gap-3 rounded-2xl border border-border p-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-secondary">
            Outcome
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">Any</option>
              <option value="SUCCESS">Success</option>
              <option value="DENIED">Denied</option>
              <option value="FAILURE">Failure</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-secondary">
            Severity
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">Any</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="INFO">Info</option>
            </select>
          </label>
        </div>
      )}

      {rows.length === 0 && status === 'live' ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-secondary">
          No entry on this page matches “{search}”. Load more, or clear the search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <caption className="sr-only">Administrative audit entries, newest first</caption>
            <thead className="bg-muted text-xs uppercase tracking-wide text-ink-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">When</th>
                <th scope="col" className="px-3 py-2 font-bold">Actor</th>
                <th scope="col" className="px-3 py-2 font-bold">Action</th>
                <th scope="col" className="px-3 py-2 font-bold">Scope</th>
                <th scope="col" className="px-3 py-2 font-bold">Outcome</th>
                <th scope="col" className="px-3 py-2 font-bold"><span className="sr-only">Detail</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => {
                const diff = readDiff(log.metadata);
                const isOpen = expanded === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-secondary">
                        <time dateTime={log.occurredAt}>{new Date(log.occurredAt).toLocaleString()}</time>
                      </td>
                      <td className="px-3 py-2">
                        <span className="block font-semibold text-ink">{log.actorEmail || log.actorUid}</span>
                        <span className="block text-xs text-ink-muted">{log.actorRole || 'unknown role'}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-ink">{log.action}</span>
                        <span className={`ml-2 rounded-full border px-2 py-0.5 text-2xs font-bold ${SEVERITY_STYLE[log.severity] ?? SEVERITY_STYLE.INFO}`}>
                          {log.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-secondary">
                        <span className="font-mono">{log.method} {log.pathname}</span>
                      </td>
                      <td className={`px-3 py-2 text-xs font-bold ${OUTCOME_STYLE[log.outcome] ?? ''}`}>
                        {log.outcome} <span className="font-normal text-ink-muted">({log.statusCode})</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : log.id)}
                          aria-expanded={isOpen}
                          aria-controls={`audit-detail-${log.id}`}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                          <span className="sr-only">{isOpen ? 'Hide' : 'Show'} details for {log.action}</span>
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={`audit-detail-${log.id}`} className="border-t border-border bg-canvas-soft">
                        <td colSpan={6} className="px-3 py-3">
                          <dl className="grid gap-2 text-xs sm:grid-cols-2">
                            <div><dt className="font-bold text-ink">Category</dt><dd className="text-ink-secondary">{log.category}</dd></div>
                            <div><dt className="font-bold text-ink">Request ID</dt><dd className="font-mono text-ink-secondary">{log.requestId || '—'}</dd></div>
                            <div><dt className="font-bold text-ink">Source IP</dt><dd className="font-mono text-ink-secondary">{log.ipAddress || '—'}</dd></div>
                            <div><dt className="font-bold text-ink">Metadata</dt><dd className="break-words font-mono text-ink-secondary">{describeValue(log.metadata)}</dd></div>
                          </dl>
                          {diff && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div>
                                <p className="text-2xs font-bold uppercase text-ink-muted">Before</p>
                                <ul className="mt-1 space-y-0.5 font-mono text-xs text-ink-secondary">
                                  {diff.before.map((entry) => (
                                    <li key={`b-${entry}`} className={diff.removed.includes(entry) ? 'text-error-700 line-through' : ''}>{entry}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-2xs font-bold uppercase text-ink-muted">After</p>
                                <ul className="mt-1 space-y-0.5 font-mono text-xs text-ink-secondary">
                                  {diff.after.map((entry) => (
                                    <li key={`a-${entry}`} className={diff.added.includes(entry) ? 'font-bold text-success-700' : ''}>{entry}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && status === 'live' && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void fetchPage(nextCursor, true)}
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Load older entries
          </button>
        </div>
      )}
    </AdminDataSurface>
  );
}

export default AdminAuditTab;
