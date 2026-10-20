/**
 * Model catalogue — what each provider actually serves, as reported by its own
 * catalogue endpoint through POST /api/admin/ai/fetch-models.
 *
 * The reference implementation (freellmapi) leads with a discovered model table;
 * this is the equivalent surface for this deployment, except every row here
 * comes from a real provider response. Until discovery has run, the table shows
 * an explicit empty state — never a placeholder catalogue.
 */

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Database, Layers3, RefreshCw, Search, Sparkles, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ProviderCatalogState } from '@/hooks/use-ai-engine';
import { PROVIDER_REGISTRY, providerMeta, type ProviderId } from './registry';
import { EmptyState, Field, InlineAlert, Metric, Panel, Spinner, StatusPill, relativeTime } from './primitives';
import type { CatalogMap } from './types';

export interface CatalogSectionProps {
  catalog: CatalogMap;
  discovering: Partial<Record<ProviderId, boolean>>;
  canEdit: boolean;
  onDiscover: (id: ProviderId) => void;
  onDiscoverAll: () => void;
  onOpenModel: (model: { id: string; name?: string; owned_by?: string; provider: ProviderId; source: string; fetchedAt?: string }) => void;
}

interface Row {
  id: string;
  name?: string;
  owned_by?: string;
  provider: ProviderId;
  source: string;
  fetchedAt?: string;
}

export function CatalogSection({ catalog, discovering, canEdit, onDiscover, onDiscoverAll, onOpenModel }: CatalogSectionProps) {
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | ProviderId>('all');

  const discoveredProviders = PROVIDER_REGISTRY.filter((p) => catalog[p.id]?.status === 'ready');
  const failedProviders = PROVIDER_REGISTRY.filter((p) => catalog[p.id]?.status === 'error');
  const totalModels = discoveredProviders.reduce((sum, p) => sum + (catalog[p.id]?.result?.count ?? 0), 0);
  const latestFetch = discoveredProviders
    .map((p) => catalog[p.id]?.result?.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const rows = useMemo<Row[]>(() => {
    const collected: Row[] = [];
    for (const provider of discoveredProviders) {
      const result = catalog[provider.id]?.result;
      if (!result) continue;
      for (const model of result.models) {
        collected.push({
          id: model.id,
          name: model.name,
          owned_by: model.owned_by,
          provider: provider.id,
          source: 'Live provider catalogue',
          fetchedAt: result.fetchedAt,
        });
      }
    }
    const needle = query.trim().toLowerCase();
    return collected.filter((row) => {
      if (providerFilter !== 'all' && row.provider !== providerFilter) return false;
      if (!needle) return true;
      return `${row.id} ${row.name ?? ''} ${row.owned_by ?? ''}`.toLowerCase().includes(needle);
    });
  }, [catalog, discoveredProviders, providerFilter, query]);

  return (
    <div className="space-y-4" data-testid="ai-engine-section-catalog">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Providers discovered" value={`${discoveredProviders.length} / ${PROVIDER_REGISTRY.length}`} hint="A catalogue response was received." />
        <Metric label="Models discovered" value={totalModels.toLocaleString()} hint="Counted from real provider responses." />
        <Metric label="Discovery failures" value={failedProviders.length} hint="Providers whose catalogue call failed." tone={failedProviders.length ? 'degraded' : 'neutral'} />
        <Metric label="Last discovery" value={latestFetch ? relativeTime(latestFetch) : '—'} hint={latestFetch ? new Date(latestFetch).toLocaleTimeString() : 'No discovery has run yet.'} />
      </div>

      <Panel
        testId="ai-engine-catalog-panel"
        title={
          <span className="inline-flex items-center gap-2">
            <Database className="size-4 text-brand-600" aria-hidden="true" />
            Live model catalogue
          </span>
        }
        description="Each discovery call asks the provider's own /models endpoint through the backend adapter. Results are process-local until the next discovery."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {latestFetch && <span className="text-[11px] text-ink-muted">fetched {relativeTime(latestFetch)}</span>}
            <Button variant="outline" size="xs" disabled={!canEdit} onClick={onDiscoverAll} data-testid="ai-engine-discover-all">
              <RefreshCw className="size-3" aria-hidden="true" />
              Discover configured
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Search discovered models" htmlFor="ai-catalog-search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                id="ai-catalog-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by model id or owner…"
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500"
              />
            </div>
          </Field>
          <Field label="Provider" htmlFor="ai-catalog-provider">
            <select
              id="ai-catalog-provider"
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as 'all' | ProviderId)}
              className="h-9 w-full min-w-[11rem] rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <option value="all">All providers</option>
              {PROVIDER_REGISTRY.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3">
          {discoveredProviders.length === 0 ? (
            <EmptyState
              icon={<Database className="size-7" />}
              title="No catalogue has been discovered yet"
              description="Run discovery for a configured provider. The console never invents a model list — an empty panel means nothing has been fetched, not that a provider serves nothing."
              action={
                <Button variant="primary" size="sm" disabled={!canEdit} onClick={onDiscoverAll}>
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Discover configured providers
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Search className="size-7" />}
              title="No model matches this filter"
              description="Clear the search or pick a different provider."
              action={
                <Button variant="outline" size="sm" onClick={() => { setQuery(''); setProviderFilter('all'); }}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_9rem_9rem_2rem] gap-2 border-b border-border bg-canvas-soft px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted sm:grid">
                <span>Model id</span>
                <span>Provider</span>
                <span>Owner</span>
                <span className="sr-only">Details</span>
              </div>
              <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto" data-testid="ai-engine-catalog-rows">
                {rows.map((row) => {
                  const meta = providerMeta(row.provider);
                  return (
                    <li key={`${row.provider}:${row.id}`}>
                      <button
                        type="button"
                        onClick={() => onOpenModel(row)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-brand-50/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 dark:hover:bg-brand-950/30 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_2rem]"
                        data-testid={`ai-engine-catalog-row-${row.provider}-${row.id}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs font-semibold text-ink">{row.id}</span>
                          {row.name && row.name !== row.id && (
                            <span className="block truncate text-[11px] text-ink-muted">{row.name}</span>
                          )}
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-muted sm:hidden">
                            <span className={cn('size-1.5 rounded-full', meta?.accent.dot)} aria-hidden="true" />
                            {meta?.name ?? row.provider}
                            {row.owned_by ? ` · ${row.owned_by}` : ''}
                          </span>
                        </span>
                        <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-ink-secondary sm:flex">
                          <span className={cn('size-1.5 rounded-full', meta?.accent.dot)} aria-hidden="true" />
                          {meta?.name ?? row.provider}
                        </span>
                        <span className="hidden truncate text-[11px] text-ink-muted sm:block">{row.owned_by || '—'}</span>
                        <ChevronRight className="size-4 text-ink-subtle" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Layers3 className="size-4 text-brand-600" aria-hidden="true" />
            Discovery status by provider
          </span>
        }
        description="A provider without a credential cannot be discovered. That is a configuration fact, not an error."
      >
        <ul className="space-y-2">
          {PROVIDER_REGISTRY.map((provider) => {
            const state: ProviderCatalogState | undefined = catalog[provider.id];
            const meta = providerMeta(provider.id)!;
            const isLoading = discovering[provider.id] === true || state?.status === 'loading';
            return (
              <li
                key={provider.id}
                className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`ai-engine-discovery-status-${provider.id}`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn('size-2 shrink-0 rounded-full', meta.accent.dot)} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{meta.name}</p>
                    <p className="text-[11px] text-ink-muted">
                      {state?.status === 'ready'
                        ? `${state.result?.count ?? 0} models · ${state.result?.clientDurationMs ?? '—'} ms round-trip · ${relativeTime(state.result?.fetchedAt)}`
                        : state?.status === 'error'
                          ? state.error?.message ?? 'Discovery failed.'
                          : 'Not discovered in this session.'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-4 sm:pl-0">
                  {isLoading ? (
                    <Spinner label="Discovering" />
                  ) : state?.status === 'ready' ? (
                    <StatusPill tone={(state.result?.count ?? 0) > 0 ? 'ready' : 'degraded'} showDot={false}>
                      <CheckCircle2 className="mr-0.5 size-3" aria-hidden="true" />
                      {state.result?.count ?? 0} models
                    </StatusPill>
                  ) : state?.status === 'error' ? (
                    <StatusPill tone="unavailable" showDot={false}>
                      <XCircle className="mr-0.5 size-3" aria-hidden="true" />
                      {state.error?.code ?? 'Failed'}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="unknown">Not run</StatusPill>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={!canEdit || isLoading}
                    onClick={() => onDiscover(provider.id)}
                    data-testid={`ai-engine-discovery-run-${provider.id}`}
                  >
                    <RefreshCw className="size-3" aria-hidden="true" />
                    Discover
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {failedProviders.length > 0 && (
          <InlineAlert tone="warning" className="mt-3" title={`${failedProviders.length} provider catalogue call(s) failed`}>
            {failedProviders.map((p) => `${providerMeta(p.id)?.name}: ${catalog[p.id]?.error?.code ?? 'error'}`).join(' · ')}
          </InlineAlert>
        )}
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-4 text-brand-600" aria-hidden="true" />
            Configuration seeds
          </span>
        }
        description="Static seeds compiled into the adapters. They are offered as model choices and are NOT presented as a live catalogue — discovery above is the authority on what a provider currently serves."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROVIDER_REGISTRY.map((provider) => (
            <div key={provider.id} className="rounded-xl border border-border bg-canvas-soft/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <span className={cn('size-1.5 rounded-full', provider.accent.dot)} aria-hidden="true" />
                {provider.name}
              </p>
              <ul className="mt-1.5 space-y-1">
                {provider.seeds.map((seed) => (
                  <li key={seed.id} className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-ink-secondary" title={seed.id}>{seed.id}</p>
                    {seed.note && <p className="text-[10px] text-ink-muted">{seed.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default CatalogSection;
