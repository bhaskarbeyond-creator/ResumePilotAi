/**
 * Overview — engine posture, routing policy and the configured failover order.
 *
 * Data provenance:
 *   • posture + metrics  → GET /api/platform/operational-status/ai-providers
 *   • beacon fallback    → GET /api/service-availability
 *   • policy + revision  → GET /api/admin/ai-settings
 * Nothing on this page is estimated; when a source has not answered the value
 * reads "Not reported" and the panel explains which source it is waiting for.
 */

import { ArrowRight, Crown, Gauge, Layers, Network, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OperationalService, ProviderRuntimeState, ServiceAvailability } from '@/hooks/use-ai-engine';
import { engineStatusFrom } from '@/hooks/use-ai-engine';
import { PROVIDER_REGISTRY, providerMeta, type ProviderId } from './registry';
import { Field, InlineAlert, Metric, Panel, Spinner, StatusPill, formatTime, valueOrDash } from './primitives';
import { failoverChain, type EngineDraft, type SectionId } from './types';

export interface OverviewSectionProps {
  draft: EngineDraft;
  serverStates: Record<ProviderId, ProviderRuntimeState>;
  service?: OperationalService;
  serviceError?: string;
  serviceLoading: boolean;
  availability?: ServiceAvailability;
  revision: number;
  persistence?: string;
  canEdit: boolean;
  saving: boolean;
  onDraftChange: (patch: Partial<EngineDraft>) => void;
  onNavigate: (section: SectionId) => void;
}

export function OverviewSection({
  draft,
  serverStates,
  service,
  serviceError,
  serviceLoading,
  availability,
  revision,
  persistence,
  canEdit,
  saving,
  onDraftChange,
  onNavigate,
}: OverviewSectionProps) {
  const status = engineStatusFrom(service, availability);
  const configuredCount = Object.values(serverStates).filter((p) => p.credentialConfigured).length;
  const enabledCount = Object.values(serverStates).filter((p) => p.enabled).length;
  const reachable = service?.metrics?.reachableProviders;
  const chain = failoverChain(draft);
  const primaryMeta = providerMeta(draft.primaryProvider);

  return (
    <div className="space-y-4" data-testid="ai-engine-section-overview">
      {/* ── Posture ─────────────────────────────────────────────────────── */}
      <section
        className="overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white shadow-md dark:border-brand-800"
        data-testid="ai-engine-posture"
      >
        <div className="relative px-4 py-5 sm:px-6 sm:py-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-24 size-56 rounded-full bg-white/10 blur-3xl"
          />
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">Engine posture</p>
                <h3 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight sm:text-xl">
                  {status.label}
                  <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    {service ? 'platform health' : availability?.ai ? 'availability beacon' : 'unmeasured'}
                  </span>
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-brand-100">{status.detail}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold">
                  Revision <span className="font-mono tabular-nums">{revision}</span>
                </span>
                {persistence && (
                  <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold">
                    {persistence === 'in-memory-certification' ? 'Certification store' : 'MariaDB'}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-200">Credentials configured</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums">{configuredCount}<span className="text-xs font-semibold text-brand-200"> / {PROVIDER_REGISTRY.length}</span></p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-200">Runtime enabled</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums">{enabledCount}<span className="text-xs font-semibold text-brand-200"> / {PROVIDER_REGISTRY.length}</span></p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-200">Probe-confirmed reachable</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums">
                  {typeof reachable === 'number' ? reachable : '—'}
                  <span className="text-xs font-semibold text-brand-200"> / {typeof service?.metrics?.configuredProviders === 'number' ? service.metrics.configuredProviders : configuredCount}</span>
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-200">Failover chain</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums">{chain.length}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-brand-100">
              <span>Health row checked {formatTime(service?.checkedAt)}</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('providers')}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1 font-bold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Manage providers <ArrowRight className="size-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('telemetry')}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1 font-bold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Telemetry <ArrowRight className="size-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {serviceLoading && !service && (
        <div className="flex justify-center rounded-xl border border-border bg-surface px-4 py-3">
          <Spinner label="Reading platform health…" />
        </div>
      )}

      {serviceError && !service && (
        <InlineAlert tone="warning" title="Platform health is unavailable">
          {serviceError}
        </InlineAlert>
      )}

      {/* ── Routing policy ──────────────────────────────────────────────── */}
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Network className="size-4 text-brand-600" aria-hidden="true" />
            Routing policy
          </span>
        }
        description="Saved through POST /api/admin/ai-settings with optimistic revision control. Values apply to the shared runtime resolver immediately after save."
        testId="ai-engine-routing-policy"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Primary provider"
            htmlFor="ai-primary-provider"
            hint={
              draft.enableFallback
                ? 'First-flight provider for generation, then the chain below.'
                : 'Fallback is off — every request uses only this provider.'
            }
          >
            <select
              id="ai-primary-provider"
              value={draft.primaryProvider}
              disabled={!canEdit || saving}
              onChange={(event) => onDraftChange({ primaryProvider: event.target.value as ProviderId })}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {PROVIDER_REGISTRY.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                  {serverStates[provider.id]?.credentialConfigured ? ' ✓' : ' (no key)'}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={`Creativity temperature · ${draft.temperature.toFixed(2)}`}
            htmlFor="ai-temperature"
            hint="0.00 deterministic · 1.00 exploratory. Server clamps to 0–1."
          >
            <input
              id="ai-temperature"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.temperature}
              disabled={!canEdit || saving}
              onChange={(event) => onDraftChange({ temperature: Number(event.target.value) })}
              className="mt-1 h-9 w-full cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
            />
          </Field>

          <Field label="Max output tokens" htmlFor="ai-max-tokens" hint="Server clamps to 256–4096.">
            <input
              id="ai-max-tokens"
              type="number"
              min={256}
              max={4096}
              step={64}
              value={draft.maxTokens}
              disabled={!canEdit || saving}
              onChange={(event) => {
                const next = Number(event.target.value);
                onDraftChange({ maxTokens: Number.isFinite(next) ? next : draft.maxTokens });
              }}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm font-medium tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </Field>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-canvas-soft/60 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Autonomous fallback</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">Move to the next healthy provider on timeout, rate limit or provider error.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.enableFallback}
                aria-label="Autonomous fallback"
                disabled={!canEdit || saving}
                onClick={() => onDraftChange({ enableFallback: !draft.enableFallback })}
                className={cn(
                  'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
                  draft.enableFallback ? 'border-brand-600 bg-brand-600' : 'border-neutral-300 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700',
                )}
              >
                <span className={cn('pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform', draft.enableFallback ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-canvas-soft/60 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Resume import module</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">AI PDF/DOCX parsing for candidates. Off by default.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.enableImportModule}
                aria-label="Resume import module"
                disabled={!canEdit || saving}
                onClick={() => onDraftChange({ enableImportModule: !draft.enableImportModule })}
                className={cn(
                  'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
                  draft.enableImportModule ? 'border-brand-600 bg-brand-600' : 'border-neutral-300 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700',
                )}
              >
                <span className={cn('pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform', draft.enableImportModule ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Failover order ──────────────────────────────────────────────── */}
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Layers className="size-4 text-brand-600" aria-hidden="true" />
            Configured failover order
          </span>
        }
        description={
          draft.enableFallback
            ? 'Requests walk this chain top to bottom until one provider answers. Order is derived from the saved primary provider and the runtime provider registry.'
            : 'Fallback is disabled, so only the primary provider is used. Enable the fallback circuit above to add the remaining providers.'
        }
        actions={
          <span className="text-[11px] font-semibold text-ink-muted">
            {draft.enableFallback ? `${chain.length} providers in chain` : '1 provider in chain'}
          </span>
        }
        testId="ai-engine-failover-order"
      >
        <ol className="space-y-2">
          {chain.map((id, index) => {
            const meta = providerMeta(id);
            const state = serverStates[id];
            const isPrimary = index === 0;
            return (
              <li
                key={id}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
                  isPrimary ? 'border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30' : 'border-border bg-surface',
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tabular-nums',
                      isPrimary ? 'bg-brand-600 text-white' : 'bg-canvas-soft text-ink-secondary',
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                      {meta?.name ?? id}
                      {isPrimary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                          <Crown className="size-2.5" aria-hidden="true" /> primary
                        </span>
                      )}
                    </p>
                    <p className="truncate font-mono text-[11px] text-ink-muted" title={state?.model || meta?.seeds[0]?.id}>
                      {valueOrDash(state?.model || meta?.seeds[0]?.id)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
                  <StatusPill tone={state?.enabled ? 'ready' : 'unconfigured'}>{state?.enabled ? 'Runtime enabled' : 'Disabled'}</StatusPill>
                  <StatusPill tone={state?.credentialConfigured ? 'ready' : 'degraded'} showDot={false}>
                    {state?.credentialConfigured ? 'Credential present' : 'No credential'}
                  </StatusPill>
                  {state?.environmentManaged && <StatusPill tone="neutral" showDot={false}>Deployment-managed</StatusPill>}
                </div>
              </li>
            );
          })}
        </ol>

        {!draft.enableFallback && (
          <InlineAlert tone="info" className="mt-3">
            Requests are single-provider. A timeout or rate limit surfaces to the caller instead of failing over.
          </InlineAlert>
        )}
      </Panel>

      {/* ── Governance invariants (documented product behaviour) ────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label={<span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" aria-hidden="true" /> Secret handling</span>}
          value="Write-only"
          hint="Keys are never returned to the browser; only a server-generated mask is shown."
        />
        <Metric
          label={<span className="inline-flex items-center gap-1"><Gauge className="size-3" aria-hidden="true" /> Save model</span>}
          value="Revision CAS"
          hint="A stale panel is rejected with AI_SETTINGS_CONFLICT instead of overwriting newer changes."
        />
        <Metric
          label={<span className="inline-flex items-center gap-1"><Sparkles className="size-3" aria-hidden="true" /> Active model</span>}
          value={draft.providers[draft.primaryProvider]?.model || primaryMeta?.seeds[0]?.id || '—'}
          hint="Effective model resolved by the runtime for the primary provider."
        />
      </div>
    </div>
  );
}

export default OverviewSection;
