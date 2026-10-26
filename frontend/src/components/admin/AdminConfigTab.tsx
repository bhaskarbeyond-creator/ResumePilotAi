/**
 * Configuration registry editor (REC-012, INV-4, INV-6).
 *
 * ## What this screen is
 *
 * The census from `GET /api/admin/config`, grouped by scope, with the origin of every
 * value shown next to it (`database`, `env`, `default`). A value that is not editable
 * still appears, with its written justification and a disabled control — because the
 * question "can I change the step-up window?" deserves an answer in the UI, not a
 * missing row that sends the operator to grep the source.
 *
 * ## Why the save flow looks fussy
 *
 * Every row carries the `revision` it was read at and echoes it back. The server
 * refuses the write with `409 CONFIG_REVISION_CONFLICT` and the current revision when
 * another operator changed the same value meanwhile. That is the whole point of
 * REC-015: a settings form must not silently overwrite a concurrent edit. For the same
 * reason an `elevated` key cannot be saved without a typed reason, and the reason is
 * stored in the change log next to before/after.
 *
 * ## What it refuses to do
 *
 * - It does not optimistically apply a value. The server is the authority; a rejected
 *   write restores what the row shows and says why.
 * - It does not render a default as if it were configured. `source` is always shown, and
 *   a degraded read (store unreachable) is a banner, not silence.
 * - It does not offer a save control to a caller without `system.config.write`; the
 *   capability comes from `GET /api/me/capabilities`, not from the role name.
 *
 * @module components/admin/AdminConfigTab
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Lock, Save } from 'lucide-react';
import { get, put } from '@/lib/api-client';
import { AdminDataSurface } from '@/components/admin/shared/AdminDataSurface';
import { useCapabilities } from '@/hooks/use-capabilities';

/** One registry entry as the API describes it. */
interface ConfigEntry {
  id: string;
  key: string;
  label: string;
  description: string;
  scope: 'PLATFORM' | 'PLAN' | 'TENANT' | 'DEPLOYMENT';
  type: 'integer' | 'number' | 'boolean' | 'string' | 'string[]';
  defaultValue: unknown;
  unit: string | null;
  editable: boolean;
  readOnlyReason: string | null;
  restartRequired: boolean;
  audit: 'standard' | 'elevated';
  resolution: 'database' | 'env' | 'code';
  envVar: string | null;
  value: unknown;
  source: string;
  /** Revision the census was read at; echoed back on save so a concurrent edit is a 409. */
  revision: number | null;
  redacted: boolean;
  valid?: boolean;
}

interface CensusResponse {
  success: boolean;
  authority: { source: string; degraded: boolean; reason: string | null; privileged: boolean };
  count: number;
  scopes: string[];
  entries: ConfigEntry[];
}

interface HistoryRow {
  id: string;
  before: unknown;
  after: unknown;
  revisionBefore: number | null;
  revisionAfter: number;
  actor: { uid: string; email: string | null; role: string | null };
  reason: string | null;
  at: string;
}

/** Human label for where a value currently comes from. */
const SOURCE_LABEL: Record<string, string> = {
  database: 'Saved here',
  env: 'Deployment environment',
  code: 'Code',
  default: 'Declared default',
  'database-invalid': 'Stored value rejected — using default',
  'env-invalid': 'Environment value rejected — using default',
};

const SCOPE_LABEL: Record<ConfigEntry['scope'], string> = {
  PLATFORM: 'Platform',
  PLAN: 'Plans and quotas',
  TENANT: 'Tenants',
  DEPLOYMENT: 'Deployment (read-only)',
};

/**
 * Render a value for display without losing its type. Arrays are joined, booleans read
 * as on/off, and an empty list says so rather than rendering as an empty cell.
 */
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.join(', ');
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'string' && value.trim() === '') return 'empty';
  return String(value);
}

/**
 * Convert the control's text back into the type the registry declared. The server
 * validates again; this only avoids sending `"true"` where a boolean is expected.
 */
function coerce(entry: ConfigEntry, raw: string): unknown {
  if (entry.type === 'boolean') return raw === 'on';
  if (entry.type === 'integer') return raw.trim() === '' ? '' : Number(raw);
  if (entry.type === 'number') return raw.trim() === '' ? '' : Number(raw);
  if (entry.type === 'string[]') {
    return raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  }
  return raw;
}

/** Text the control should show for a value, kept separate from `displayValue`. */
function editValue(entry: ConfigEntry): string {
  if (entry.value === null || entry.value === undefined) return '';
  if (Array.isArray(entry.value)) return entry.value.join(', ');
  if (typeof entry.value === 'boolean') return entry.value ? 'on' : 'off';
  return String(entry.value);
}

export function AdminConfigTab() {
  // `canDo` answers "may this caller perform this action on this surface", from the
  // same server response that decided the tab was visible. `false` for unknown data.
  const { canDo } = useCapabilities();
  const canSave = canDo('config', 'save');

  const [census, setCensus] = useState<CensusResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'empty' | 'live'>('loading');
  const [error, setError] = useState<string | null>(null);

  /** Draft text per key, so a half-typed number is not sent on every keystroke. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Mandatory justification per key for an `elevated` change. */
  const [reasons, setReasons] = useState<Record<string, string>>({});
  /** Per-row write state, so one row's failure does not blank the screen. */
  const [rowState, setRowState] = useState<Record<string, { saving?: boolean; error?: string; saved?: string }>>({});
  const [history, setHistory] = useState<{ key: string; rows: HistoryRow[] } | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const response = await get<CensusResponse>('/admin/config');
      setCensus(response);
      setStatus(response.entries.length === 0 ? 'empty' : 'live');
      setDrafts({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The configuration census could not be loaded.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const buckets = new Map<ConfigEntry['scope'], ConfigEntry[]>();
    for (const entry of census?.entries ?? []) {
      const list = buckets.get(entry.scope) ?? [];
      list.push(entry);
      buckets.set(entry.scope, list);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [census]);

  const save = useCallback(
    async (entry: ConfigEntry) => {
      const raw = drafts[entry.key] ?? editValue(entry);
      const value = coerce(entry, raw);
      const reason = (reasons[entry.key] ?? '').trim();

      if (entry.audit === 'elevated' && reason.length < 10) {
        setRowState((current) => ({
          ...current,
          [entry.key]: { error: 'This value needs a reason of at least 10 characters, because the change is audited.' },
        }));
        return;
      }

      setRowState((current) => ({ ...current, [entry.key]: { saving: true } }));
      try {
        const response = await put<{ success: boolean; value: unknown; revision: number; restartRequired: boolean }>(
          `/admin/config/${encodeURIComponent(entry.key)}`,
          // `expectedRevision` is the revision this row was rendered from, including the
          // explicit `null` that means "there is no stored row yet". Sending 0 would be a
          // silent create, which is the defect this parameter exists to prevent.
          { value, expectedRevision: entry.revision, reason: reason || undefined },
        );
        setCensus((current) => {
          if (!current) return current;
          return {
            ...current,
            entries: current.entries.map((row) =>
              row.key === entry.key
                ? { ...row, value: response.value, source: 'database', revision: response.revision }
                : row,
            ),
          };
        });
        setReasons((current) => ({ ...current, [entry.key]: '' }));
        setDrafts((current) => {
          const next = { ...current };
          delete next[entry.key];
          return next;
        });
        setRowState((current) => ({
          ...current,
          [entry.key]: {
            saved: response.restartRequired
              ? 'Saved. This value takes effect after the next restart.'
              : 'Saved.',
          },
        }));
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'The value could not be saved.';
        setRowState((current) => ({ ...current, [entry.key]: { error: message } }));
        // A rejected write must not leave the form showing the value as if it applied.
        setDrafts((current) => {
          const next = { ...current };
          delete next[entry.key];
          return next;
        });
      }
    },
    [drafts, reasons],
  );

  const showHistory = useCallback(async (entry: ConfigEntry) => {
    if (history?.key === entry.key) {
      setHistory(null);
      return;
    }
    setHistory({ key: entry.key, rows: [] });
    try {
      const response = await get<{ success: boolean; history: HistoryRow[] }>(
        `/admin/config/${encodeURIComponent(entry.key)}/history?limit=20`,
      );
      setHistory({ key: entry.key, rows: response.history });
    } catch {
      setHistory({ key: entry.key, rows: [] });
    }
  }, [history]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="config-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="config-heading" className="text-lg font-semibold text-ink">
            Configuration registry
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
            Every business value the platform reads, with the value in force, where it came from, and whether
            it can be changed here. Values that cannot be changed state why.
          </p>
        </div>
        {census && (
          <p className="text-xs text-ink-secondary" aria-live="polite">
            {census.count} values · {census.authority.degraded ? 'read degraded' : 'store reachable'}
          </p>
        )}
      </div>

      {census?.authority.degraded && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {census.authority.reason || 'The configuration store is unavailable.'} The values below are the
            declared defaults, not necessarily what the platform is running with.
          </p>
        </div>
      )}

      {!canSave && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-border bg-muted p-3 text-sm text-ink-secondary">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            You can read this registry but not change it. Editing needs the <code>system.config.write</code>{' '}
            permission on one of your roles.
          </p>
        </div>
      )}

      <AdminDataSurface
        status={status}
        label="Configuration registry"
        error={error}
        onRetry={load}
        emptyMessage="The registry is empty, which means no configuration value is registered. That is a deployment fault, not an empty state."
      >
        <div className="flex flex-col gap-6">
          {grouped.map(([scope, entries]) => (
            <div key={scope} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                {SCOPE_LABEL[scope]}
              </h3>
              <ul className="flex flex-col gap-2">
                {entries.map((entry) => {
                  const state = rowState[entry.key] ?? {};
                  const dirty = drafts[entry.key] !== undefined;
                  const isHistoryOpen = history?.key === entry.key;
                  return (
                    <li
                      key={entry.key}
                      className="rounded-2xl border border-border bg-surface p-3 sm:p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-ink">{entry.label}</h4>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-ink-secondary">
                              {entry.key}
                            </code>
                            {entry.restartRequired && (
                              <span className="rounded bg-warning-50 px-1.5 py-0.5 text-xs font-semibold text-warning-700">
                                restart required
                              </span>
                            )}
                            {entry.audit === 'elevated' && (
                              <span className="rounded bg-info-50 px-1.5 py-0.5 text-xs font-semibold text-info-700">
                                reason required
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-ink-secondary">{entry.description}</p>
                          <p className="mt-1 text-xs text-ink-subtle">
                            Currently <strong className="font-semibold text-ink">{displayValue(entry.value)}</strong>
                            {entry.unit ? ` ${entry.unit}` : ''} · from{' '}
                            {SOURCE_LABEL[entry.source] ?? entry.source}
                            {entry.envVar ? ` (${entry.envVar})` : ''} · default{' '}
                            {displayValue(entry.defaultValue)}
                          </p>
                          {!entry.editable && entry.readOnlyReason && (
                            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-secondary">
                              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                              <span>{entry.readOnlyReason}</span>
                            </p>
                          )}
                          {entry.redacted && (
                            <p className="mt-2 text-xs text-ink-secondary">
                              The value is hidden because your role may see that this setting exists but not what
                              it is set to.
                            </p>
                          )}
                        </div>

                        <div className="flex w-full flex-col gap-2 lg:w-80">
                          {entry.editable && !entry.redacted ? (
                            <>
                              <label className="text-xs font-semibold text-ink-secondary">
                                <span className="sr-only">{entry.label}</span>
                                {entry.type === 'boolean' ? (
                                  <span className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3">
                                    <input
                                      type="checkbox"
                                      className="size-4"
                                      checked={(drafts[entry.key] ?? editValue(entry)) === 'on'}
                                      disabled={!canSave || state.saving}
                                      onChange={(event) =>
                                        setDrafts((current) => ({
                                          ...current,
                                          [entry.key]: event.target.checked ? 'on' : 'off',
                                        }))
                                      }
                                    />
                                    <span className="text-sm text-ink">
                                      {(drafts[entry.key] ?? editValue(entry)) === 'on' ? 'Enabled' : 'Disabled'}
                                    </span>
                                  </span>
                                ) : (
                                  <input
                                    type={entry.type === 'integer' || entry.type === 'number' ? 'number' : 'text'}
                                    inputMode={entry.type === 'integer' || entry.type === 'number' ? 'numeric' : 'text'}
                                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                    value={drafts[entry.key] ?? editValue(entry)}
                                    disabled={!canSave || state.saving}
                                    onChange={(event) =>
                                      setDrafts((current) => ({ ...current, [entry.key]: event.target.value }))
                                    }
                                  />
                                )}
                              </label>

                              {entry.audit === 'elevated' && (
                                <label className="text-xs font-semibold text-ink-secondary">
                                  Reason for this change
                                  <input
                                    type="text"
                                    required
                                    minLength={10}
                                    maxLength={500}
                                    className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                    value={reasons[entry.key] ?? ''}
                                    disabled={!canSave || state.saving}
                                    onChange={(event) =>
                                      setReasons((current) => ({ ...current, [entry.key]: event.target.value }))
                                    }
                                  />
                                </label>
                              )}

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                                  onClick={() => void save(entry)}
                                  disabled={!canSave || state.saving || !dirty}
                                >
                                  <Save className="size-4" aria-hidden="true" />
                                  {state.saving ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                                  onClick={() => void showHistory(entry)}
                                  aria-expanded={isHistoryOpen}
                                >
                                  <History className="size-4" aria-hidden="true" />
                                  History
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-border px-3 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                              onClick={() => void showHistory(entry)}
                              aria-expanded={isHistoryOpen}
                            >
                              <History className="size-4" aria-hidden="true" />
                              History
                            </button>
                          )}

                          {state.error && (
                            <p role="alert" className="text-xs text-error-700">
                              {state.error}
                            </p>
                          )}
                          {state.saved && (
                            <p role="status" className="flex items-center gap-1.5 text-xs text-success-700">
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                              {state.saved}
                            </p>
                          )}

                          {isHistoryOpen && (
                            <div className="rounded-xl border border-border bg-canvas-soft p-2">
                              {history.rows.length === 0 ? (
                                <p className="text-xs text-ink-secondary">
                                  No change has been recorded for this value.
                                </p>
                              ) : (
                                <ol className="flex flex-col gap-2">
                                  {history.rows.map((row) => (
                                    <li key={row.id} className="text-xs text-ink-secondary">
                                      <p className="font-semibold text-ink">
                                        {displayValue(row.before)} → {displayValue(row.after)}
                                      </p>
                                      <p>
                                        {row.actor.email || row.actor.uid} ·{' '}
                                        <time dateTime={row.at}>{row.at}</time>
                                        {row.reason ? ` · ${row.reason}` : ''}
                                      </p>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </AdminDataSurface>
    </section>
  );
}
