/**
 * Platform health — the operator's view of `GET /api/platform/operational-status`.
 *
 * The backend already models the entire page: `services/platformHealth.js` probes every
 * subsystem and freezes a record per service (`state`, `reason`, `configuration`, `critical`,
 * `metrics`, `remediation`, `affectedApis`, `testable`, `checkedAt`), then summarises it
 * (`summary.overall`, per-state counts, `apiMatrix`). This component renders that snapshot.
 *
 * What it used to do instead: a hard-coded catalogue of 28 "subsystems" with invented
 * descriptions, invented metrics ("Active Tenants: 12", "Isolation Invariants: 100%
 * Enforced") and invented remediation text, into which the live payload was merged. The
 * consequences were worse than cosmetic — a service that was genuinely down but absent from
 * the catalogue could never appear on the page, and every catalogue entry the API did not
 * report looked healthy. The `Probe` action also faked success
 * (`.catch(() => ({success: true, latencyMs: 24, ...}))`), so a failing provider test rendered
 * as a pass.
 *
 * Now: the list is whatever the server sent; the modal loads
 * `GET /operational-status/:id` (detail + related endpoints + audit events); `Probe` calls
 * `POST /operational-status/:id/test` and reports the server's verdict, including the audit
 * refusal (`AUDIT_WRITE_FAILED`) when the trail could not be written.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, post } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';

/** Mirrors `STATE` in `backend/services/platformHealth.js:21`. */
type ServiceState =
  | 'OPERATIONAL'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'DISABLED'
  | 'NOT_CONFIGURED'
  | 'NOT_SUPPORTED'
  | 'UNKNOWN';

type ServiceGroup = 'core' | 'integrations' | 'workers';

export interface HealthService {
  id: string;
  name: string;
  group: ServiceGroup;
  state: ServiceState;
  support: string;
  enabled: boolean;
  configuration: string;
  critical: boolean;
  reason: string;
  dependency: string;
  retryable: boolean;
  errorCategory: string | null;
  remediation: string;
  affectedFeatures: string[];
  affectedApis: string[];
  affectedUiModules: string[];
  metrics: Record<string, string | number | boolean | null>;
  testable: boolean;
  checkedAt: string;
  docsHref: string | null;
}

export interface HealthSnapshot {
  checkedAt: string;
  cached?: boolean;
  cacheAgeMs?: number;
  elevated?: boolean;
  summary: {
    overall: 'OPERATIONAL' | 'DEGRADED' | 'CRITICAL' | 'PARTIAL';
    indicator: 'green' | 'amber' | 'red';
    counts: Partial<Record<ServiceState, number>>;
    total: number;
    worstState: ServiceState;
  };
  services: HealthService[];
  apiMatrix: {
    total: number;
    operationalOrExpected: number;
    degraded: number;
    unavailable: number;
    unknown: number;
    endpoints: Array<{ path: string; method: string; state: ServiceState; dependencyId: string }>;
  };
  groups: Record<ServiceGroup, string[]>;
  sources?: Record<string, string>;
}

interface ServiceDetailPayload {
  service: HealthService;
  checkedAt: string;
  relatedEndpoints: Array<{ path: string; method: string; state: ServiceState }>;
  auditEvents: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    severity: string;
    outcome: string | null;
    statusCode: number | null;
    pathname: string | null;
    createdAt: string | null;
  }>;
  auditSource: string;
  elevated: boolean;
}

interface ServiceTestResult {
  passed?: boolean;
  message?: string;
  latencyMs?: number;
  errorCategory?: string | null;
  checkedAt?: string;
}

const STATE_STYLES: Record<ServiceState, { dot: string; pill: string }> = {
  OPERATIONAL: { dot: 'bg-success-600 ring-success-100 dark:ring-success-950', pill: 'bg-success-50 text-success-700 border-success-100' },
  DEGRADED: { dot: 'bg-warning-500 ring-warning-100 dark:ring-warning-950', pill: 'bg-warning-50 text-warning-700 border-warning-100' },
  UNAVAILABLE: { dot: 'bg-error-600 ring-error-100 dark:ring-error-950', pill: 'bg-error-50 text-error-700 border-error-100' },
  UNKNOWN: { dot: 'bg-neutral-400 ring-neutral-100 dark:ring-neutral-800', pill: 'bg-neutral-100 text-ink-secondary border-border dark:bg-neutral-800' },
  DISABLED: { dot: 'bg-neutral-300 ring-neutral-100 dark:ring-neutral-800', pill: 'bg-neutral-100 text-ink-muted border-border dark:bg-neutral-800' },
  NOT_CONFIGURED: { dot: 'bg-neutral-300 ring-neutral-100 dark:ring-neutral-800', pill: 'bg-neutral-100 text-ink-muted border-border dark:bg-neutral-800' },
  NOT_SUPPORTED: { dot: 'bg-neutral-300 ring-neutral-100 dark:ring-neutral-800', pill: 'bg-neutral-100 text-ink-muted border-border dark:bg-neutral-800' },
};

const GROUP_LABELS: Record<ServiceGroup, string> = {
  core: 'Core',
  integrations: 'Integrations',
  workers: 'Workers',
};

export function AdminHealthTab() {
  const loadSnapshot = useCallback(
    (signal: AbortSignal) =>
      get<HealthSnapshot>('/platform/operational-status', undefined, { signal }),
    [],
  );
  const snapshot = useAdminResource(loadSnapshot);
  const services = useMemo(() => snapshot.data?.services ?? [], [snapshot.data]);

  const [group, setGroup] = useState<ServiceGroup | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const visible = services.filter((service) => {
    if (group !== 'all' && service.group !== group) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${service.name} ${service.id} ${service.reason}`.toLowerCase().includes(needle);
  });

  const revalidate = async (action: string, work: () => Promise<string>) => {
    setBusy(action);
    setNotice(null);
    try {
      const message = await work();
      setNotice({ tone: 'success', text: message });
      snapshot.reload();
    } catch (error) {
      const failure = describeAdminFailure(error);
      setNotice({
        tone: 'error',
        text: `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`,
      });
    } finally {
      setBusy(null);
    }
  };

  /** Re-probes every subsystem. The server audits this, so it needs a typed permission. */
  const probeAll = () =>
    revalidate('refresh', async () => {
      const result = await post<{ overall?: string; checkedAt?: string }>(
        '/platform/operational-status/refresh',
        {},
      );
      return `Snapshot re-collected: overall ${result?.overall ?? 'unknown'} at ${
        result?.checkedAt ?? new Date().toISOString()
      }.`;
    });

  const testService = (serviceId: string) =>
    revalidate(`test-${serviceId}`, async () => {
      const result = await post<ServiceTestResult>(
        `/platform/operational-status/${encodeURIComponent(serviceId)}/test`,
        {},
      );
      const verdict = result?.passed ? 'passed' : 'failed';
      const latency = typeof result?.latencyMs === 'number' ? ` in ${result.latencyMs}ms` : '';
      const reason = result?.message ? ` — ${result.message}` : '';
      return `Provider test for ${serviceId} ${verdict}${latency}${reason}`;
    });

  const overall = snapshot.data?.summary.overall;
  const counts = snapshot.data?.summary.counts ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Platform health &amp; telemetry</h2>
          <p className="text-xs text-ink-muted">
            Every service below is probed by the backend and reported with its own state and
            reason. Services the platform does not probe are absent, not assumed healthy.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={probeAll} loading={busy === 'refresh'}>
          <RefreshCw className="mr-1 size-3.5" />
          Re-probe all
        </Button>
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
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {snapshot.status === 'loading' && snapshot.data === null && (
        <AdminLoadingPanel label="Collecting the operational snapshot…" />
      )}

      {snapshot.status === 'failed' && snapshot.error && (
        <AdminErrorPanel
          title="Operational status could not be collected"
          error={snapshot.error}
          onRetry={snapshot.reload}
        />
      )}

      {snapshot.status === 'ready' && snapshot.data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryTile label="Overall" value={String(overall)} tone={overall === 'OPERATIONAL' ? 'good' : overall === 'CRITICAL' ? 'bad' : 'warn'} />
            <SummaryTile label="Operational" value={String(counts.OPERATIONAL ?? 0)} />
            <SummaryTile label="Degraded" value={String(counts.DEGRADED ?? 0)} tone={(counts.DEGRADED ?? 0) > 0 ? 'warn' : undefined} />
            <SummaryTile label="Unavailable" value={String(counts.UNAVAILABLE ?? 0)} tone={(counts.UNAVAILABLE ?? 0) > 0 ? 'bad' : undefined} />
            <SummaryTile label="Not configured / disabled" value={String((counts.NOT_CONFIGURED ?? 0) + (counts.DISABLED ?? 0) + (counts.NOT_SUPPORTED ?? 0))} />
            <SummaryTile label="API endpoints" value={`${snapshot.data.apiMatrix.operationalOrExpected}/${snapshot.data.apiMatrix.total}`} />
          </div>

          <p className="text-2xs text-ink-muted">
            Collected {snapshot.data.checkedAt}
            {snapshot.data.cached ? ` (cached, ${Math.round((snapshot.data.cacheAgeMs ?? 0) / 1000)}s old)` : ''}
            {snapshot.data.elevated === false
              ? ' · host-level diagnostics are hidden for your role'
              : ''}
          </p>

          {services.length === 0 ? (
            <AdminEmptyPanel
              title="No probed services"
              description="The collector returned an empty service list. That is reported as-is rather than filled in."
            />
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by group">
                  {(['all', 'core', 'integrations', 'workers'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={group === option}
                      onClick={() => setGroup(option)}
                      className={cn(
                        'min-h-11 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors',
                        group === option
                          ? 'bg-brand-600 text-white'
                          : 'bg-neutral-100 text-ink-muted hover:bg-neutral-200 dark:bg-neutral-800',
                      )}
                    >
                      {option === 'all' ? 'All' : GROUP_LABELS[option]}
                    </button>
                  ))}
                </div>
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filter by name, id or reason…"
                    aria-label="Filter services"
                    className="h-11 pl-9 text-xs sm:h-9"
                  />
                </div>
              </div>

              {visible.length === 0 ? (
                <p className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-ink-muted">
                  No service matches this filter. {services.length} services are reported.
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {visible.map((service) => (
                    <li key={service.id}>
                      <Card className="h-full border-border transition-colors hover:border-brand-200">
                        <CardContent className="flex h-full flex-col justify-between gap-3 p-3.5">
                          <button
                            type="button"
                            onClick={() => setSelectedId(service.id)}
                            className="min-h-11 w-full cursor-pointer text-left"
                            aria-label={`Inspect ${service.name}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="font-mono text-2xs uppercase tracking-wider text-ink-muted">
                                  {GROUP_LABELS[service.group] ?? service.group}
                                  {service.critical ? ' · critical' : ''}
                                </span>
                                <h3 className="mt-0.5 truncate text-xs font-bold text-ink">{service.name}</h3>
                              </div>
                              <span
                                className={cn('mt-1 size-2.5 shrink-0 rounded-full ring-4', STATE_STYLES[service.state].dot)}
                                title={service.state}
                                aria-hidden="true"
                              />
                            </div>
                            <p className="mt-1 line-clamp-2 text-2xs text-ink-secondary">{service.reason}</p>
                          </button>

                          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-2xs font-bold uppercase tracking-wide',
                                STATE_STYLES[service.state].pill,
                              )}
                            >
                              {service.state}
                            </span>
                            {service.testable ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => testService(service.id)}
                                loading={busy === `test-${service.id}`}
                                className="min-h-11"
                              >
                                <Activity className="mr-1 size-3" />
                                Probe
                              </Button>
                            ) : (
                              <span className="text-2xs text-ink-muted">no safe probe</span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {selectedId && (
        <ServiceDetailDialog
          key={selectedId}
          serviceId={selectedId}
          onClose={() => setSelectedId(null)}
          onNotice={(tone, text) => setNotice({ tone, text })}
        />
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-sm font-bold',
          tone === 'good' ? 'text-success-700' : tone === 'warn' ? 'text-warning-700' : tone === 'bad' ? 'text-error-700' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ServiceDetailDialog({
  serviceId,
  onClose,
  onNotice,
}: {
  serviceId: string;
  onClose: () => void;
  onNotice: (tone: 'success' | 'error', text: string) => void;
}) {
  const loadDetail = useCallback(
    (signal: AbortSignal) =>
      get<ServiceDetailPayload>(
        `/platform/operational-status/${encodeURIComponent(serviceId)}`,
        undefined,
        { signal },
      ),
    [serviceId],
  );
  const detail = useAdminResource(loadDetail);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const service = detail.data?.service ?? null;
  const metrics = Object.entries(service?.metrics ?? {});

  const probe = async () => {
    setProbing(true);
    try {
      const result = await post<ServiceTestResult>(
        `/platform/operational-status/${encodeURIComponent(serviceId)}/test`,
        {},
      );
      onNotice(
        result?.passed ? 'success' : 'error',
        `Provider test for ${serviceId} ${result?.passed ? 'passed' : 'failed'}${
          result?.message ? ` — ${result.message}` : ''
        }`,
      );
      detail.reload();
    } catch (error) {
      const failure = describeAdminFailure(error);
      onNotice('error', `${failure.message} (${failure.code})`);
    } finally {
      setProbing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-detail-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-canvas p-4 sm:p-5">
          <div className="min-w-0">
            <p className="font-mono text-2xs uppercase tracking-widest text-ink-muted">
              {serviceId}
              {service ? ` · ${GROUP_LABELS[service.group] ?? service.group}` : ''}
            </p>
            <h3 id="service-detail-title" className="mt-1 truncate text-lg font-bold text-ink">
              {service?.name ?? 'Service detail'}
            </h3>
            {service && (
              <p className="mt-0.5 text-xs text-ink-secondary">
                {service.state} · configuration {service.configuration}
                {service.critical ? ' · critical dependency' : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {service?.testable && (
              <Button variant="outline" size="sm" onClick={probe} loading={probing}>
                <Activity className="mr-1 size-3.5" />
                Probe
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs sm:p-5">
          {detail.status === 'loading' && detail.data === null && (
            <AdminLoadingPanel label="Reading service detail…" />
          )}
          {detail.status === 'failed' && detail.error && (
            <AdminErrorPanel
              title="Service detail could not be read"
              error={detail.error}
              onRetry={detail.reload}
            />
          )}

          {service && (
            <>
              <section className="space-y-1">
                <h4 className="text-2xs font-bold uppercase tracking-wide text-ink-muted">Why this state</h4>
                <p className="text-xs text-ink-secondary">{service.reason}</p>
                {service.remediation && (
                  <p className="text-2xs text-ink-muted">Remediation: {service.remediation}</p>
                )}
              </section>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DetailStat label="Dependency" value={service.dependency} />
                <DetailStat label="Retryable" value={service.retryable ? 'yes' : 'no'} />
                <DetailStat label="Error class" value={service.errorCategory ?? 'none'} />
                <DetailStat label="Checked" value={service.checkedAt} />
              </dl>

              {metrics.length > 0 && (
                <section>
                  <h4 className="mb-1 text-2xs font-bold uppercase tracking-wide text-ink-muted">
                    Metrics reported by the probe
                  </h4>
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {metrics.map(([key, value]) => (
                      <li key={key} className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-2.5 py-1.5">
                        <span className="text-2xs text-ink-muted">{key}</span>
                        <span className="truncate font-mono text-2xs text-ink">{String(value)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {service.affectedFeatures.length > 0 && (
                <section>
                  <h4 className="mb-1 text-2xs font-bold uppercase tracking-wide text-ink-muted">What breaks when this does</h4>
                  <ul className="flex flex-wrap gap-1.5">
                    {service.affectedFeatures.map((feature) => (
                      <li key={feature} className="rounded-full border border-border bg-neutral-100 px-2 py-0.5 text-2xs text-ink-secondary dark:bg-neutral-800">
                        {feature}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.data && detail.data.relatedEndpoints.length > 0 && (
                <section>
                  <h4 className="mb-1 text-2xs font-bold uppercase tracking-wide text-ink-muted">
                    Endpoints depending on it ({detail.data.relatedEndpoints.length})
                  </h4>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {detail.data.relatedEndpoints.slice(0, 8).map((endpoint) => (
                      <li key={`${endpoint.method} ${endpoint.path}`} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                        <span className="truncate font-mono text-2xs text-ink-secondary">
                          {endpoint.method} {endpoint.path}
                        </span>
                        <span className="text-2xs text-ink-muted">{endpoint.state}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.data && detail.data.auditEvents.length > 0 && (
                <section>
                  <h4 className="mb-1 text-2xs font-bold uppercase tracking-wide text-ink-muted">
                    Recent audit events ({detail.data.auditSource})
                  </h4>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {detail.data.auditEvents.map((event) => (
                      <li key={event.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                        <span className="truncate font-mono text-2xs text-ink-secondary">{event.action}</span>
                        <span className="text-2xs text-ink-muted">{event.createdAt ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {service.docsHref && (
                <a
                  href={service.docsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-2xs font-bold text-brand-700 hover:underline"
                >
                  Operator documentation
                  <ExternalLink className="size-3" />
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-1.5">
      <dt className="text-2xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="truncate font-mono text-2xs text-ink">{value}</dd>
    </div>
  );
}
