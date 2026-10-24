import { useAiSettingsContext } from '../context/AiSettingsContext';

export function useProviderFilters() {
  const {
    searchQuery,
    categoryFilter,
    statusFilter,
    providerFilter,
    updateUrlParams,
  } = useAiSettingsContext();

  const setSearchQuery = (q: string) => {
    updateUrlParams((next) => {
      if (q) next.set('q', q);
      else next.delete('q');
    });
  };

  const setCategoryFilter = (cat: 'all' | 'frontier' | 'mesh' | 'search') => {
    updateUrlParams((next) => {
      if (cat !== 'all') next.set('category', cat);
      else next.delete('category');
    });
  };

  const setStatusFilter = (st: 'all' | 'configured' | 'healthy' | 'issues' | 'disabled') => {
    updateUrlParams((next) => {
      if (st !== 'all') next.set('status', st);
      else next.delete('status');
    });
  };

  return {
    searchQuery,
    categoryFilter,
    statusFilter,
    providerFilter,
    setSearchQuery,
    setCategoryFilter,
    setStatusFilter,
  };
}
