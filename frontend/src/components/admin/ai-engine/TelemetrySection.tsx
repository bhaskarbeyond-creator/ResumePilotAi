/**
 * Telemetry — the real observability surfaces around the AI engine.
 *
 * Three independent, authoritative sources are shown side by side so an operator
 * can see when they disagree:
 *   1. the 28-service health collector's `ai-providers` row
 *      (GET /api/platform/operational-status/ai-providers),
 *   2. the public boolean availability beacon
 *      (GET /api/service-availability),
 *   3. this browser session's own provider round-trips, measured locally.
 *
 * Nothing here is synthesised. A missing measurement reads "Not reported".
 */

import { Activity, ArrowUpRight, Gauge, Radio, RefreshCw, ServerCog, ShieldCheck, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { OperationalService, ProviderRuntimeState, RelatedEndpoint, ServiceAvailability } from '@/hooks/use-ai-engine';
import { PROVIDER_REGISTRY, providerMeta, type ProviderId } from './registry';
import { EmptyState, InlineAlert, Metric, Panel, Spinner, StatusPill, formatTime, relativeTime, valueOrDash } from './primitives';
import type { ProviderTestState } from './types';

export interface TelemetrySectionProps {
  service?: OperationalService;
  relatedEndpoints: RelatedEndpoint[];
  availability?: ServiceAvailability;
  loading: boolean;
  error?: string;
  availabilityError?: string;
  sessionTests: Partial<Record<ProviderId, ProviderTestState>>;
  serverStates: Record<ProviderId, ProviderRuntimeState>;
  onRefresh: () => void;
}

function stateTone(state?: string) {
  if (state === 'OPERATIONAL') return 'ready' as const;
  if (state === 'DEGRADED' || state === 'UNKNOWN') return 'degraded' as const;
  if (state === 'UNAVAILABLE') return 'unavailable' as const;
  if (state === 'NOT_CONFIGURED' || state === 'DISABLED' || state === 'NOT_SUPPORTED') return 'unconfigured' as const;
  return 'unknown' as const;
}

export function TelemetrySection({
  service,
  relatedEndpoints,
  availability,
  loading,
  error,
  availabilityError,
  sessionTests,
  serverStates,
  onRefresh,
}: TelemetrySectionProps) {
  const sessionEntries = PROVIDER_REGISTRY.filter((p) => sessionTests[p.id]);
  const beacon = availability?.ai;

  return (
    <div className="space-y-4" data-testid="ai-engine-section-telemetry">
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Activity className="size-4 text-brand-600" aria-hidden="true" />
            Platform health · ai-providers
          </span>
        }
        description="Produced by the same 28-service health collector that powers the Admin Platform Health console. AI credentials are only ever probed through non-billable model-catalogue metadata."
        actions={
          <Button variant="outline" size="xs" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        }
        testId="ai-engine-telemetry-health"
      >
        {loading && !service ? (
          <Spinner label="Reading health row…" />
        ) : error && !service ? (
          <InlineAlert tone="error" title="Health row unavailable" onRetry={onRefresh}>
            {error}
          </InlineAlert>
        ) : service ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={stateTone(service.state)}>{service.state}</StatusPill>
              <StatusPill tone={service.configuration === 'CONFIGURED' ? 'ready' : 'unconfigured'} showDot={false}>
                {service.configuration}
              </StatusPill>
              {service.critical && <StatusPill tone="degraded" showDot={false}>critical path</StatusPill>}
              {service.errorCategory && <StatusPill tone="unknown" showDot={false}>{service.errorCategory}</StatusPill>}
              <span className="text-[11px] text-ink-muted">checked {formatTime(service.checkedAt || undefined)}</span>
            </div>
            <p className="text-xs leading-relaxed text-ink-secondary">{service.reason}</p>
            {service.remediation && (
              <p className="rounded-lg border border-border bg-canvas-soft/60 px-3 py-2 text-[11px] leading-relaxed text-ink-secondary">
                <span className="font-bold text-ink">Remediation · </span>
                {service.remediation}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Configured providers" value={valueOrDash(service.metrics?.configuredProviders)} hint="Credential sources resolved." />
              <Metric label="Probe-confirmed" value={valueOrDash(service.metrics?.reachableProviders)} hint="Providers that answered the catalogue probe." />
              <Metric label="Dependency" value={service.dependency || '—'} hint="Declared external dependency." />
              <Metric label="Testable" value={service.testable ? 'Yes' : 'No'} hint="Whether the console can run a live test." />
            </div>
            {(service.affectedFeatures?.length || service.affectedApis?.length || service.affectedUiModules?.length) ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([
                  ['Affected features', service.affectedFeatures],
                  ['Affected APIs', service.affectedApis],
                  ['Affected UI modules', service.affectedUiModules],
                ] as const).map(([label, values]) => (
                  <div key={label} className="rounded-lg border border-border px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
                    {values && values.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {values.map((value) => (
                          <li key={value} className="truncate font-mono text-[11px] text-ink-secondary" title={value}>{value}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink-muted">Not reported</p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            {service.docsHref && (
              <a
                href={service.docsHref}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:underline dark:text-brand-300"
              >
                Operator runbook <ArrowUpRight className="size-3" aria-hidden="true" />
              </a>
            )}
          </div>
        ) : (
          <EmptyState icon={<ServerCog className="size-7" />} title="No health row returned" description="The collector has not answered yet." />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Radio className="size-4 text-brand-600" aria-hidden="true" />
              Availability beacon
            </span>
          }
          description="GET /api/service-availability — the public, secret-free projection. Booleans only; no latency and no percentage exist in this contract."
          testId="ai-engine-telemetry-beacon"
        >
          {availabilityError ? (
            <InlineAlert tone="warning" title="Beacon unavailable">{availabilityError}</InlineAlert>
          ) : availability ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={beacon?.degraded ? 'degraded' : beacon?.providers || beacon?.available ? 'ready' : 'unconfigured'}>
                  {beacon?.degraded ? 'Degraded' : beacon?.providers || beacon?.available ? 'Providers available' : 'No provider available'}
                </StatusPill>
                <span className="text-[11px] text-ink-muted">checked {formatTime(availability.checkedAt)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[11px]">
                {([
                  ['ai.providers', beacon?.providers],
                  ['ai.available', beacon?.available],
                  ['ai.degraded', beacon?.degraded],
                  ['ai.configured', beacon?.configured],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5">
                    <dt className="font-mono text-ink-muted">{label}</dt>
                    <dd className="font-bold tabular-nums text-ink">
                      {typeof value === 'boolean' ? (value ? 'true' : 'false') : typeof value === 'number' ? value : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                The beacon is a fold of per-provider catalogue probes. “Degraded” means configured but unconfirmed — it is never upgraded to “ready”.
              </p>
            </div>
          ) : (
            <Spinner label="Reading beacon…" />
          )}
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Gauge className="size-4 text-brand-600" aria-hidden="true" />
              Session measurements
            </span>
          }
          description="Connectivity round-trips triggered from this browser during this session. Durations are client-measured wall clock and are not provider benchmarks."
          testId="ai-engine-telemetry-session"
        >
          {sessionEntries.length === 0 ? (
            <EmptyState
              icon={<Wifi className="size-7" />}
              title="No connectivity test has run in this session"
              description="Use “Test connectivity” on a provider card. Results appear here with the duration this browser measured."
            />
          ) : (
            <ul className="space-y-2">
              {sessionEntries.map((provider) => {
                const test = sessionTests[provider.id]!;
                return (
                  <li key={provider.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink">{provider.name}</p>
                      <p className="truncate text-[11px] text-ink-muted" title={test.message}>{test.message}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusPill tone={test.status === 'ok' ? 'ready' : test.status === 'error' ? 'unavailable' : 'unknown'} showDot={false}>
                        {test.status === 'ok' ? 'ok' : test.status === 'error' ? 'failed' : 'running'}
                      </StatusPill>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                        {typeof test.clientDurationMs === 'number' ? `${test.clientDurationMs} ms · ${relativeTime(test.at)}` : relativeTime(test.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand-600" aria-hidden="true" />
            Related AI endpoints
          </span>
        }
        description="Routes the collector reports as depending on this service, with their own state and reason. Server-reported, not inferred by this console."
        testId="ai-engine-telemetry-endpoints"
      >
        {relatedEndpoints.length === 0 ? (
          <EmptyState icon={<ServerCog className="size-7" />} title="No related endpoints reported" description="The collector did not return an endpoint matrix for this service." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
              <caption className="sr-only">AI endpoints and their reported dependency state</caption>
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-bold">Method</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Path</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Auth</th>
                  <th scope="col" className="py-2 pr-3 font-bold">State</th>
                  <th scope="col" className="py-2 font-bold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {relatedEndpoints.map((endpoint) => (
                  <tr key={`${endpoint.method}:${endpoint.path}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-mono text-[11px] font-bold text-ink-secondary">{endpoint.method}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-ink">{endpoint.path}</td>
                    <td className="py-2 pr-3 text-[11px] text-ink-muted">{endpoint.authentication || '—'}</td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={stateTone(endpoint.state)} showDot={false}>{endpoint.state || 'UNKNOWN'}</StatusPill>
                    </td>
                    <td className="max-w-[24rem] py-2 text-[11px] text-ink-muted" title={endpoint.reason}>{endpoint.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Runtime credential matrix"
        description="Effective credential source and runtime enablement per adapter, exactly as the server resolved them for this request."
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDER_REGISTRY.map((provider) => {
            const state = serverStates[provider.id];
            const meta = providerMeta(provider.id)!;
            return (
              <li key={provider.id} className="min-w-0 rounded-xl border border-border px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  <span className={cn('size-1.5 rounded-full', state?.enabled ? meta.accent.dot : 'bg-neutral-300 dark:bg-neutral-600')} aria-hidden="true" />
                  {meta.name}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-ink-secondary" title={state?.model}>{valueOrDash(state?.model)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1">
                  <StatusPill tone={state?.credentialConfigured ? 'ready' : 'unconfigured'} showDot={false}>
                    {state?.credentialConfigured ? 'credential' : 'no credential'}
                  </StatusPill>
                  <StatusPill tone={state?.enabled ? 'ready' : 'unconfigured'} showDot={false}>
                    {state?.enabled ? 'enabled' : 'disabled'}
                  </StatusPill>
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">source: {state?.credentialSource ?? 'none'}</p>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

export default TelemetrySection;
