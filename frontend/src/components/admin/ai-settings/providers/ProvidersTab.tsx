import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import type { ProviderCatalogEntry } from '../types/ai-settings.types';
import { getProviderTier } from '../utils/masking';
import { ProviderFilterBar } from './ProviderFilterBar';
import { ProviderRow } from './ProviderRow';

export function ProvidersTab() {
  const {
    providers,
    primaryProvider,
    cooldowns,
    searchQuery,
    providerFilter,
    categoryFilter,
    statusFilter,
    updateUrlParams,
  } = useAiSettingsContext();

  const sortedFilteredProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = providers.filter((p) => {
      if (
        providerFilter &&
        p.id.toLowerCase() !== providerFilter &&
        !p.name.toLowerCase().includes(providerFilter)
      ) {
        return false;
      }
      if (categoryFilter !== 'all' && getProviderTier(p) !== categoryFilter) {
        return false;
      }
      if (statusFilter === 'configured' && !(p.configuredOnServer || p.hasKey)) {
        return false;
      }
      if (statusFilter === 'healthy' && !(p.enabled && p.status === 'healthy')) {
        return false;
      }
      if (
        statusFilter === 'issues' &&
        p.status !== 'issues' &&
        p.status !== 'cooldown' &&
        !cooldowns[p.id]
      ) {
        return false;
      }
      if (statusFilter === 'disabled' && p.enabled && p.status !== 'disabled') {
        return false;
      }
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.id.toLowerCase().includes(q) &&
        !(p.defaultModel || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const rank = (item: ProviderCatalogEntry): number => {
        if (item.id === primaryProvider) return 0;
        if (item.status === 'issues' || item.status === 'cooldown' || cooldowns[item.id]) return 1;
        if (item.enabled && (item.configuredOnServer || item.hasKey)) return 2;
        if (item.configuredOnServer || item.hasKey) return 3;
        return 4;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [categoryFilter, cooldowns, primaryProvider, providerFilter, providers, searchQuery, statusFilter]);

  return (
    <div className="space-y-4 min-w-0">
      <ProviderFilterBar />

      {/* Provider List */}
      {sortedFilteredProviders.length === 0 ? (
        <Card className="border-border bg-surface">
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-ink">No matching providers found</p>
            <p className="text-xs text-ink-muted">
              Clear active filters or search across all {providers.length} supported platforms.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateUrlParams((next) => {
                  next.delete('provider');
                  next.delete('category');
                  next.delete('status');
                  next.delete('q');
                }, true)
              }
            >
              Reset Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedFilteredProviders.map((p) => (
            <ProviderRow key={p.id} provider={p} />
          ))}
        </div>
      )}
    </div>
  );
}
