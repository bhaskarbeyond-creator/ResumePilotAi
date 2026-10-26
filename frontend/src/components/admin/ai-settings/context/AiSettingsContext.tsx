import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { type ApiError, get, normalizeError, post } from '@/lib/api-client';
import { readPreviewSession } from '@/lib/preview-session';
import type {
  AdminAiSettingsTabProps,
  AiSettingsApiResponse,
  AiSettingsContextValue,
  CatalogModel,
  CooldownEntry,
  DialogSlug,
  EngineViewSubtab,
  ProviderCatalogEntry,
  RevisionConflictState,
  SelectionMode,
} from '../types/ai-settings.types';
import { VALID_DIALOGS, VALID_SUBTABS } from '../utils/constants';
import { useDiscoveryPlayground } from '../hooks/useDiscoveryPlayground';
import { useQuotaGovernance } from '../hooks/useQuotaGovernance';
import { useProviderMutations } from '../hooks/useProviderMutations';

export type { AiSettingsContextValue };

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

export function useAiSettingsContext(): AiSettingsContextValue {
  const ctx = useContext(AiSettingsContext);
  if (!ctx) {
    throw new Error('useAiSettingsContext must be used within an AiSettingsProvider');
  }
  return ctx;
}

export function AiSettingsProvider({
  viewerRole,
  children,
}: AdminAiSettingsTabProps & { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const effectiveRole = useMemo(() => {
    if (viewerRole) return viewerRole.toUpperCase();
    const preview = readPreviewSession();
    return (preview?.role || 'SUPER_ADMIN').toUpperCase();
  }, [viewerRole]);

  const isSuperAdmin = effectiveRole === 'SUPER_ADMIN';
  const isAdmin = effectiveRole === 'ADMIN';
  const isAuditorOrSupport = effectiveRole === 'AUDITOR' || effectiveRole === 'SUPPORT';
  const isReadOnly = isAuditorOrSupport;

  // URL State
  const rawSubtab = (searchParams.get('subtab') || '').toLowerCase().trim();
  const activeSubtab: EngineViewSubtab = VALID_SUBTABS.has(rawSubtab)
    ? (rawSubtab as EngineViewSubtab)
    : 'providers';

  const rawDialog = (searchParams.get('dialog') || '').toLowerCase().trim();
  const activeDialog: DialogSlug | null = VALID_DIALOGS.has(rawDialog)
    ? (rawDialog as DialogSlug)
    : null;
  const dialogTarget = searchParams.get('target') || '';

  const providerFilter = (searchParams.get('provider') || '').trim().toLowerCase();
  const rawCategory = (searchParams.get('category') || '').toLowerCase().trim();
  const categoryFilter: 'all' | 'frontier' | 'mesh' | 'search' =
    rawCategory === 'frontier' || rawCategory === 'mesh' || rawCategory === 'search'
      ? rawCategory
      : 'all';

  const rawStatus = (searchParams.get('status') || '').toLowerCase().trim();
  const statusFilter: 'all' | 'configured' | 'healthy' | 'issues' | 'disabled' =
    rawStatus === 'configured' ||
    rawStatus === 'healthy' ||
    rawStatus === 'issues' ||
    rawStatus === 'disabled'
      ? rawStatus
      : 'all';

  const searchQuery = searchParams.get('q') || '';

  const updateUrlParams = useCallback(
    (mutator: (next: URLSearchParams) => void, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutator(next);
          return next;
        },
        { replace }
      );
    },
    [setSearchParams]
  );

  const openDialog = useCallback(
    (slug: DialogSlug, target?: string) => {
      updateUrlParams((next) => {
        next.set('dialog', slug);
        if (target) next.set('target', target);
        else next.delete('target');
      });
    },
    [updateUrlParams]
  );

  const closeDialog = useCallback(() => {
    updateUrlParams((next) => {
      next.delete('dialog');
      next.delete('target');
    });
  }, [updateUrlParams]);

  const selectSubtab = useCallback(
    (nextSubtab: EngineViewSubtab) => {
      updateUrlParams((next) => {
        next.set('subtab', nextSubtab);
      });
    },
    [updateUrlParams]
  );

  // Core Engine & Config State
  const [loading, setLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [revision, setRevision] = useState<number>(1);
  const [revisionConflict, setRevisionConflict] = useState<RevisionConflictState | null>(null);

  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>({});
  const [cooldowns, setCooldowns] = useState<Record<string, CooldownEntry>>({});
  const [discoveredModels, setDiscoveredModels] = useState<CatalogModel[]>([]);

  // Runtime Strip State
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('balanced');
  const [primaryProvider, setPrimaryProvider] = useState<string>('gemini');
  const [pinnedModel, setPinnedModel] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(2048);
  const [enableFallback, setEnableFallback] = useState<boolean>(true);
  const [showTuning, setShowTuning] = useState<boolean>(false);

  // Actions & Alerts State
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  const redirectOn401 = useCallback(
    (err: unknown) => {
      const apiErr = err as ApiError;
      if (apiErr && (apiErr.status === 401 || apiErr.code === 'UNAUTHORIZED' || apiErr.code === 'INVALID_AUTH_TOKEN')) {
        const nextUrl = `${location.pathname}${location.search}`;
        navigate(`/login?next=${encodeURIComponent(nextUrl)}`, { replace: true });
        return true;
      }
      return false;
    },
    [location.pathname, location.search, navigate]
  );

  // Sub-Hooks for Decomposition
  const discoveryPlayground = useDiscoveryPlayground({
    discoveredModels,
    setDiscoveredModels,
    primaryProvider,
    maxTokens,
    temperature,
    redirectOn401,
    showToast,
  });

  const quotaGovernance = useQuotaGovernance({
    isSuperAdmin,
    dialogTarget,
    closeDialog,
    showToast,
    redirectOn401,
  });

  // Hydrate State Helper
  const hydrateFromResponse = useCallback((res: AiSettingsApiResponse) => {
    if (res.revision !== undefined) setRevision(res.revision);
    if (res.settings) {
      if (res.settings.selectionMode) setSelectionMode(res.settings.selectionMode as SelectionMode);
      if (res.settings.provider) setPrimaryProvider(res.settings.provider);
      if (typeof res.settings.temperature === 'number') setTemperature(res.settings.temperature);
      if (typeof res.settings.maxTokens === 'number') setMaxTokens(res.settings.maxTokens);
      if (typeof res.settings.enableFallback === 'boolean') setEnableFallback(res.settings.enableFallback);
    }
    if (Array.isArray(res.catalog)) {
      setProviders(res.catalog);
    }
    if (res.maskedKeys) setMaskedKeys(res.maskedKeys);
    if (res.cooldowns) setCooldowns(res.cooldowns);
    if (Array.isArray(res.discoveredModels)) {
      setDiscoveredModels(res.discoveredModels);
      if (res.settings?.provider) {
        const pMod = res.discoveredModels.find((m) => m.providerId === res.settings?.provider);
        if (pMod) setPinnedModel(pMod.id);
      }
    }
  }, []);

  // CAS-Guarded Mutation Helper
  const commitSettingsPatch = useCallback(
    async (
      payload: Record<string, any>,
      successMessage: string,
      options?: { force?: boolean }
    ): Promise<AiSettingsApiResponse | null> => {
      setSaving(true);
      setActionError(null);
      const body: Record<string, any> = {
        ...payload,
        expectedRevision: revision,
        ...(options?.force ? { force: true } : {}),
      };
      try {
        const res = await post<AiSettingsApiResponse>('/admin/ai-settings', body);
        if (typeof res.revision === 'number' && !res.catalog) {
          setRevision(res.revision);
        } else {
          hydrateFromResponse(res);
        }
        setRevisionConflict(null);
        showToast(successMessage);
        return res;
      } catch (err: any) {
        if (redirectOn401(err)) return null;
        const norm = normalizeError(err);
        const rawDetails = norm.details as Record<string, any> | undefined;
        if (
          norm.status === 409 ||
          // F-29: REVISION_CONFLICT is the platform-wide CAS spelling the wire
          // sends; the legacy AI_SETTINGS_CONFLICT stays matched through the
          // transition.
          norm.code === 'REVISION_CONFLICT' ||
          rawDetails?.code === 'REVISION_CONFLICT' ||
          norm.code === 'AI_SETTINGS_CONFLICT' ||
          rawDetails?.code === 'AI_SETTINGS_CONFLICT'
        ) {
          const currentRev = Number(
            (err as any)?.currentRevision ||
              rawDetails?.currentRevision ||
              (norm as any)?.currentRevision ||
              revision + 1
          );
          setRevisionConflict({
            message: norm.message || 'AI settings were modified by another administrator. Reload or overwrite.',
            currentRevision: currentRev,
            pendingPayload: payload,
          });
          setActionError('AI settings were modified by another administrator. Reload or overwrite.');
          return null;
        }
        setActionError(norm.message || 'Unable to save settings.');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [hydrateFromResponse, redirectOn401, revision, showToast]
  );

  const providerMutations = useProviderMutations({
    providers,
    setProviders,
    primaryProvider,
    setPrimaryProvider,
    commitSettingsPatch,
    dialogTarget,
    openDialog,
    closeDialog,
    showToast,
    setActionError,
    redirectOn401,
  });

  const { loadQuotaAndTelemetry } = quotaGovernance;
  const { setExpandedRowId, setModalSelectedId, setModalError, setModalTestStatus } = providerMutations;

  // Load Settings
  const loadSettings = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      void loadQuotaAndTelemetry();
      return;
    }
    setLoading(true);
    setSettingsError(null);
    try {
      const res = await get<AiSettingsApiResponse>('/admin/ai-settings');
      hydrateFromResponse(res);
      setRevisionConflict(null);
      void loadQuotaAndTelemetry();
    } catch (err: unknown) {
      if (redirectOn401(err)) return;
      const norm = normalizeError(err);
      setSettingsError(`Engine configuration could not be loaded: ${norm.message || 'Service unavailable'}`);
    } finally {
      setLoading(false);
    }
  }, [hydrateFromResponse, isSuperAdmin, loadQuotaAndTelemetry, redirectOn401]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Sync expanded row from ?provider= query
  useEffect(() => {
    if (providerFilter && providers.some((p) => p.id.toLowerCase() === providerFilter)) {
      setExpandedRowId(providerFilter);
    }
  }, [providerFilter, providers, setExpandedRowId]);

  // Pre-select target provider when opening Configure Provider with ?target=<id>
  useEffect(() => {
    if (activeDialog === 'configure-provider' && dialogTarget) {
      setModalSelectedId(dialogTarget);
      setModalError(null);
      setModalTestStatus(null);
    }
  }, [activeDialog, dialogTarget, setModalSelectedId, setModalError, setModalTestStatus]);

  const configuredCount = useMemo(
    () => providers.filter((p) => p.configuredOnServer || p.hasKey).length,
    [providers]
  );
  const healthyCount = useMemo(
    () => providers.filter((p) => p.enabled && p.status === 'healthy').length,
    [providers]
  );
  const issuesCount = useMemo(
    () => providers.filter((p) => p.status === 'issues' || p.status === 'cooldown' || cooldowns[p.id]).length,
    [cooldowns, providers]
  );

  const value = useMemo<AiSettingsContextValue>(
    () => ({
      effectiveRole,
      isSuperAdmin,
      isAdmin,
      isAuditorOrSupport,
      isReadOnly,
      searchParams,
      activeSubtab,
      activeDialog,
      dialogTarget,
      providerFilter,
      categoryFilter,
      statusFilter,
      searchQuery,
      updateUrlParams,
      openDialog,
      closeDialog,
      selectSubtab,

      loading,
      settingsError,
      revision,
      revisionConflict,
      setRevisionConflict,
      providers,
      setProviders,
      maskedKeys,
      cooldowns,
      discoveredModels,
      configuredCount,
      healthyCount,
      issuesCount,

      selectionMode,
      setSelectionMode,
      primaryProvider,
      setPrimaryProvider,
      pinnedModel,
      setPinnedModel,
      temperature,
      setTemperature,
      maxTokens,
      setMaxTokens,
      enableFallback,
      setEnableFallback,
      showTuning,
      setShowTuning,

      saving,
      toastMsg,
      setToastMsg,
      actionError,
      showToast,
      setActionError,

      ...providerMutations,
      ...quotaGovernance,
      ...discoveryPlayground,

      commitSettingsPatch,
      loadSettings,
      redirectOn401,
    }),
    [
      effectiveRole,
      isSuperAdmin,
      isAdmin,
      isAuditorOrSupport,
      isReadOnly,
      searchParams,
      activeSubtab,
      activeDialog,
      dialogTarget,
      providerFilter,
      categoryFilter,
      statusFilter,
      searchQuery,
      updateUrlParams,
      openDialog,
      closeDialog,
      selectSubtab,
      loading,
      settingsError,
      revision,
      revisionConflict,
      providers,
      maskedKeys,
      cooldowns,
      discoveredModels,
      configuredCount,
      healthyCount,
      issuesCount,
      selectionMode,
      primaryProvider,
      pinnedModel,
      temperature,
      maxTokens,
      enableFallback,
      showTuning,
      saving,
      toastMsg,
      actionError,
      showToast,
      providerMutations,
      quotaGovernance,
      discoveryPlayground,
      commitSettingsPatch,
      loadSettings,
      redirectOn401,
    ]
  );

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>;
}

export default AiSettingsContext;
