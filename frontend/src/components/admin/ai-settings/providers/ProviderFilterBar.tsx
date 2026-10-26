import { useMemo } from 'react';
import { Activity, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { getProviderTier } from '../utils/masking';

export function ProviderFilterBar() {
  const {
    providers,
    categoryFilter,
    statusFilter,
    searchQuery,
    providerFilter,
    updateUrlParams,
    checkingAll,
    handleCheckAll,
    configuredCount,
    healthyCount,
    issuesCount,
  } = useAiSettingsContext();

  const tierCounts = useMemo(() => {
    let frontier = 0;
    let mesh = 0;
    let search = 0;
    for (const p of providers) {
      const tier = getProviderTier(p);
      if (tier === 'frontier') frontier++;
      else if (tier === 'mesh') mesh++;
      else search++;
    }
    return { all: providers.length, frontier, mesh, search };
  }, [providers]);

  const disabledCount = useMemo(
    () => providers.filter((p) => p.disabled || !p.enabled).length,
    [providers]
  );

  const handleExportMetadata = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(providers, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `ai-providers-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Category Tier Tablist */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Provider categories"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              { id: 'all', label: `All providers (${tierCounts.all})` },
              { id: 'frontier', label: `Frontier Free Tier (${tierCounts.frontier})` },
              { id: 'mesh', label: `Fast Community Mesh (${tierCounts.mesh})` },
              { id: 'search', label: `Agent Search & Tools (${tierCounts.search})` },
            ] as const
          ).map((tab) => {
            const selected = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() =>
                  updateUrlParams((next) => {
                    if (tab.id === 'all') next.delete('category');
                    else next.set('category', tab.id);
                  }, true)
                }
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer',
                  selected
                    ? 'bg-ink text-white'
                    : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCheckAll()}
            disabled={checkingAll}
          >
            <Activity className={cn('size-3.5 mr-1.5', checkingAll && 'animate-spin')} />
            {checkingAll ? 'Checking...' : 'Check all'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportMetadata}>
            <Download className="size-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Search + Configured/Status Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md min-w-0">
          <Search className="size-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="provider-search-input"
            type="search"
            aria-label={`Search ${providers.length} providers`}
            placeholder={`Search ${providers.length} providers by name, ID, or model...`}
            value={searchQuery}
            onChange={(e) =>
              updateUrlParams((next) => {
                if (e.target.value) next.set('q', e.target.value);
                else next.delete('q');
              }, true)
            }
            className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by provider status"
        >
          {(
            [
              { id: 'all', label: `All ${providers.length}` },
              { id: 'configured', label: `Configured ${configuredCount}` },
              { id: 'healthy', label: `Healthy ${healthyCount}` },
              { id: 'issues', label: `Issues ${issuesCount}` },
              { id: 'disabled', label: `Disabled ${disabledCount}` },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() =>
                updateUrlParams((next) => {
                  if (pill.id === 'all') next.delete('status');
                  else next.set('status', pill.id);
                }, true)
              }
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                statusFilter === pill.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {providerFilter && (
        <div className="flex items-center gap-2 text-xs text-ink-secondary bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
          <span>
            Filtered to provider: <strong className="text-ink">{providerFilter}</strong>
          </span>
          <button
            type="button"
            onClick={() =>
              updateUrlParams((next) => {
                next.delete('provider');
              }, true)
            }
            className="font-bold text-brand-700 underline cursor-pointer"
          >
            Show all {providers.length} providers
          </button>
        </div>
      )}
    </div>
  );
}
