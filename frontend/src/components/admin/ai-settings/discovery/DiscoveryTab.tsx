import { RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { ModelDiscoveryDialog } from './ModelDiscoveryDialog';

export function DiscoveryTab() {
  const {
    providers,
    discoveryProvider,
    setDiscoveryProvider,
    discoveryLoading,
    discoveryError,
    discoveryModels,
    discoveredModels,
    hasStaleDiscovery,
    modelsCapFilter,
    setModelsCapFilter,
    modelsSearch,
    setModelsSearch,
    handleDiscoveryFetch,
  } = useAiSettingsContext();

  return (
    <div className="space-y-4 min-w-0">
      <Card className="border-border bg-surface">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Sparkles className="size-4 text-brand-600" />
              Live Model Discovery &amp; Reconciliation
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Query upstream provider catalogs directly; static unverified model guesses are never synthesized.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 max-w-sm">
              <label
                htmlFor="discovery-provider-select"
                className="block text-xs font-semibold text-ink mb-1"
              >
                Discovery provider
              </label>
              <select
                id="discovery-provider-select"
                aria-label="Discovery provider"
                value={discoveryProvider}
                onChange={(e) => setDiscoveryProvider(e.target.value)}
                className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-xs font-semibold text-ink"
              >
                <option value="">Select provider...</option>
                {providers
                  .filter((p) => p.group !== 'search')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
              </select>
            </div>

            <Button
              type="button"
              disabled={!discoveryProvider || discoveryLoading}
              onClick={() => void handleDiscoveryFetch(discoveryProvider)}
            >
              <RefreshCw className={cn('size-3.5 mr-1.5', discoveryLoading && 'animate-spin')} />
              Fetch Models
            </Button>
          </div>

          {discoveryError && (
            <div
              role="alert"
              className="rounded-xl border border-error-100 bg-error-50 p-3 text-xs font-semibold text-error-700"
            >
              {discoveryError}
            </div>
          )}

          {hasStaleDiscovery && (
            <div
              role="status"
              className="rounded-xl border border-warning-100 bg-warning-50 p-3 text-xs font-semibold text-warning-700"
            >
              Some catalog entries are marked stale or unverified following upstream refresh.
            </div>
          )}

          {discoveryModels.length > 0 && (
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-ink-secondary">
                    <th className="py-2 pr-3 font-semibold">Model ID</th>
                    <th className="py-2 px-3 font-semibold">Provider</th>
                    <th className="py-2 px-3 font-semibold">Context</th>
                    <th className="py-2 pl-3 font-semibold">Catalog Status</th>
                  </tr>
                </thead>
                <tbody>
                  {discoveryModels.map((m) => (
                    <tr key={`${m.providerId}:${m.id}`} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-mono font-semibold text-ink">{m.id}</td>
                      <td className="py-2 px-3 text-ink-secondary">{m.providerId}</td>
                      <td className="py-2 px-3 text-ink-secondary">
                        {m.contextWindow ? `${m.contextWindow.toLocaleString()} tok` : 'Unknown'}
                      </td>
                      <td className="py-2 pl-3">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-semibold',
                            m.catalogStatus === 'fresh'
                              ? 'bg-success-50 text-success-700'
                              : 'bg-warning-50 text-warning-700'
                          )}
                        >
                          {m.catalogStatus || 'unverified'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-surface">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink">
                Cached Runtime Catalog ({discoveredModels.length} models)
              </h3>
              <p className="text-xs text-ink-muted">
                Models currently eligible for automatic selection and failover chains.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                aria-label="Filter discovered models"
                placeholder="Filter models..."
                value={modelsSearch}
                onChange={(e) => setModelsSearch(e.target.value)}
                className="rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs text-ink"
              />
              <select
                aria-label="Filter by model capability"
                value={modelsCapFilter}
                onChange={(e) => setModelsCapFilter(e.target.value as any)}
                className="rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink"
              >
                <option value="all">All Capabilities</option>
                <option value="vision">Vision</option>
                <option value="tools">Tool Calling</option>
                <option value="json">JSON Mode</option>
              </select>
            </div>
          </div>

          {discoveredModels.filter(
            (m) => !(discoveryModels.length > 0 && m.providerId === discoveryProvider)
          ).length === 0 ? (
            <p className="text-xs text-ink-muted py-3">
              {discoveryModels.length > 0
                ? 'All cached models for the selected provider are shown in the live discovery table above.'
                : 'No cached models yet. Select a provider above and click “Fetch Models”.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {discoveredModels
                .filter((m) => {
                  if (discoveryModels.length > 0 && m.providerId === discoveryProvider) {
                    return false;
                  }
                  if (modelsCapFilter === 'vision' && !m.capabilities?.vision) return false;
                  if (modelsCapFilter === 'tools' && !m.capabilities?.tools) return false;
                  if (modelsCapFilter === 'json' && !m.capabilities?.json) return false;
                  if (
                    modelsSearch &&
                    !m.id.toLowerCase().includes(modelsSearch.toLowerCase()) &&
                    !m.providerId.toLowerCase().includes(modelsSearch.toLowerCase())
                  ) {
                    return false;
                  }
                  return true;
                })
                .map((m) => (
                  <div
                    key={`${m.providerId}-${m.id}`}
                    className="rounded-xl border border-border bg-canvas p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-bold text-ink truncate">
                        {m.id}
                      </div>
                      <div className="text-xs text-ink-muted">{m.providerId}</div>
                    </div>
                    <span className="text-xs font-semibold text-ink-secondary shrink-0">
                      {m.catalogStatus || 'cached'}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ModelDiscoveryDialog />
    </div>
  );
}
