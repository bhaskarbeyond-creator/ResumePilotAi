/**
 * Admin AI Multi-Provider Engine (Rebuilt & Simplified v2)
 *
 * Implements:
 * - Simplification #1: 2–3 click Add & Activate Provider flow (row-level + header CTA)
 * - Simplification #2: Unified URL-backed navigation preserving all ?subtab=* & ?tab=* aliases
 * - Simplification #3: Shared Radix Dialog (@/components/ui/dialog) across all 5 tools + confirmations
 * - Simplification #4: Configured-first provider sort + "Configured" filter + live Issues count
 * - Simplification #5: Compact Runtime Model Selection strip (Temp 0–2, Max Tokens 256–8192)
 * - Simplification #6: Self-persisting inline provider drawer (key, pool, model, baseUrl, primary, CAS)
 * - Simplification #7: Unified Quotas & Telemetry (ADMIN + SUPER_ADMIN quota governance + SQLite metrics)
 * - Simplification #8: Consolidated Unified Gateway, Claude Code & multi-language snippets (dynamic origin)
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type ApiError, get, normalizeError, post, put } from '@/lib/api-client';
import { readPreviewSession } from '@/lib/preview-session';
import type { ProviderCatalogEntry } from './freellmapi-catalog';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  Globe,
  Key,
  Layers,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';

export interface CatalogModel {
  id: string;
  name?: string;
  providerId: string;
  contextWindow?: number | null;
  capabilities?: { vision?: boolean; tools?: boolean; json?: boolean };
  catalogStatus?: string;
  lastSuccessfulRefresh?: number | null;
}

interface CooldownEntry {
  remainingSeconds: number;
  reason?: string | null;
  strikeCount?: number;
}

interface QuotaConsumerRecord {
  uid: string;
  email: string;
  displayName?: string;
  membership?: string;
  count: number;
  limit: number;
  day?: string;
  lastUsed?: string | null;
}

interface QuotaDashboardResponse {
  todayDate?: string;
  totalTodayRequests: number;
  activeUsersToday: number;
  totalHistoricalRecords: number;
  topConsumers: QuotaConsumerRecord[];
  limits: {
    basic: number;
    premium: number;
    admin: number;
    enterprise: number;
  };
  quotaRevision: number;
}

interface EngineMetricsResponse {
  summary?: {
    totalRequests?: number;
    successCount?: number;
    errorCount?: number;
    totalTokens?: number;
    avgLatencyMs?: number | null;
    backend?: string;
  } | null;
  providers?: Array<{
    provider: string;
    requests?: number;
    errors?: number;
    avgLatencyMs?: number | null;
    totalTokens?: number;
  }>;
}

interface EngineStatusResponse {
  version?: string;
  totalProvidersCount?: number;
  chatProvidersCount?: number;
  searchProvidersCount?: number;
  cacheEntries?: number;
  activeCooldowns?: Array<{ provider: string; remainingSeconds: number; reason?: string }>;
}

interface AiSettingsApiResponse {
  revision?: number;
  settings?: Record<string, any>;
  configuredProviders?: Record<string, boolean>;
  credentialSources?: Record<string, string>;
  maskedKeys?: Record<string, string>;
  catalog?: ProviderCatalogEntry[];
  cooldowns?: Record<string, CooldownEntry>;
  discoveredModels?: CatalogModel[];
  featureFlags?: { ai_settings_v2_enabled?: boolean };
}

type SelectionMode = 'auto' | 'quality' | 'speed' | 'balanced' | 'manual';
type EngineViewSubtab =
  | 'providers'
  | 'key-pool'
  | 'metrics'
  | 'quotas'
  | 'unified-gateway'
  | 'claude'
  | 'discovery'
  | 'models'
  | 'playground';

type DialogSlug =
  | 'configure-provider'
  | 'key-pool'
  | 'cooldowns'
  | 'discovery'
  | 'snippets'
  | 'confirm-clear-key'
  | 'confirm-reset-user-quota'
  | 'confirm-reset-all-quotas';

const FRONTIER_IDS = new Set([
  'groq',
  'cerebras',
  'gemini',
  'mistral',
  'nvidia',
  'openrouter',
  'cloudflare',
  'cohere',
  'deepseek',
  'openai',
  'kilo',
  'ovh',
  'sambanova',
]);

const VALID_SUBTABS = new Set<string>([
  'providers',
  'key-pool',
  'metrics',
  'quotas',
  'unified-gateway',
  'claude',
  'discovery',
  'models',
  'playground',
]);

const VALID_DIALOGS = new Set<string>([
  'configure-provider',
  'key-pool',
  'cooldowns',
  'discovery',
  'snippets',
  'confirm-clear-key',
  'confirm-reset-user-quota',
  'confirm-reset-all-quotas',
]);

function splitKeys(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const trimmed = part.trim();
    if (trimmed && !/[•*]/.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

function getProviderTier(p: ProviderCatalogEntry): 'frontier' | 'mesh' | 'search' {
  if (p.group === 'search' || p.type === 'search' || p.type === 'media') return 'search';
  if (FRONTIER_IDS.has(p.id)) return 'frontier';
  return 'mesh';
}

function formatCredentialSource(source?: string, keyless?: boolean): string {
  if (source === 'mariadb-secret-store') return 'MariaDB Vault';
  if (source === 'environment') return 'Environment (.env)';
  if (source === 'mariadb-legacy-setting') return 'Legacy Store';
  if (source === 'keyless' || keyless) return 'Keyless / Local';
  return 'Not Configured';
}

export interface AdminAiSettingsTabProps {
  viewerRole?: string;
}

export function AdminAiSettingsTab({ viewerRole }: AdminAiSettingsTabProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const effectiveRole = useMemo(() => {
    if (viewerRole) return viewerRole.toUpperCase();
    const preview = readPreviewSession();
    return (preview?.role || 'SUPER_ADMIN').toUpperCase();
  }, [viewerRole]);

  const isSuperAdmin = effectiveRole === 'SUPER_ADMIN';

  // ─── URL-Derived Deep-Link State (Single Source of Truth) ───
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
    rawCategory === 'frontier'
      ? 'frontier'
      : rawCategory === 'mesh' || rawCategory === 'fast'
        ? 'mesh'
        : rawCategory === 'search'
          ? 'search'
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
    (mutator: (next: URLSearchParams) => void, replace = true) => {
      const next = new URLSearchParams(searchParams);
      mutator(next);
      if (next.toString() !== searchParams.toString()) {
        setSearchParams(next, { replace });
      }
    },
    [searchParams, setSearchParams]
  );

  const openDialog = useCallback(
    (slug: DialogSlug, target?: string) => {
      updateUrlParams((next) => {
        next.set('dialog', slug);
        if (target) next.set('target', target);
        else next.delete('target');
      }, true);
    },
    [updateUrlParams]
  );

  const closeDialog = useCallback(() => {
    updateUrlParams((next) => {
      next.delete('dialog');
      next.delete('target');
    }, true);
  }, [updateUrlParams]);

  const selectSubtab = useCallback(
    (nextSubtab: EngineViewSubtab) => {
      updateUrlParams((next) => {
        next.set('subtab', nextSubtab);
      }, true);
    },
    [updateUrlParams]
  );

  // ─── Core Engine & Feature Flag State ───
  const [loading, setLoading] = useState<boolean>(isSuperAdmin);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [v2Enabled, setV2Enabled] = useState<boolean>(true);
  const [revision, setRevision] = useState<number>(0);
  const [revisionConflict, setRevisionConflict] = useState<{
    message: string;
    currentRevision?: number;
    pendingPayload?: Record<string, any>;
  } | null>(null);

  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>({});
  const [cooldowns, setCooldowns] = useState<Record<string, CooldownEntry>>({});
  const [discoveredModels, setDiscoveredModels] = useState<CatalogModel[]>([]);

  // Runtime Selection Strip Controls
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('balanced');
  const [primaryProvider, setPrimaryProvider] = useState<string>('groq');
  const [pinnedModel, setPinnedModel] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(2048);
  const [enableFallback, setEnableFallback] = useState<boolean>(true);
  const [showTuning, setShowTuning] = useState<boolean>(false);

  // Inline Feedback Banners
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Provider Row Expansion & Scoped Write-Only Drafts
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [singleKeyDrafts, setSingleKeyDrafts] = useState<Record<string, string>>({});
  const [poolKeyDrafts, setPoolKeyDrafts] = useState<Record<string, string>>({});
  const [showRowKey, setShowRowKey] = useState<Record<string, boolean>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});
  const [baseUrlDrafts, setBaseUrlDrafts] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState<boolean>(false);

  // Configure Provider Modal State
  const [modalTab, setModalTab] = useState<'single' | 'pool' | 'endpoint'>('single');
  const [modalSelectedId, setModalSelectedId] = useState<string>('');
  const [platformDropdownOpen, setPlatformDropdownOpen] = useState<boolean>(false);
  const [modalPlatformQuery, setModalPlatformQuery] = useState<string>('');
  const [modalApiKey, setModalApiKey] = useState<string>('');
  const [modalShowKey, setModalShowKey] = useState<boolean>(false);
  const [modalPoolText, setModalPoolText] = useState<string>('');
  const [modalCustomBaseUrl, setModalCustomBaseUrl] = useState<string>('');
  const [modalCustomModel, setModalCustomModel] = useState<string>('');
  const [modalTesting, setModalTesting] = useState<boolean>(false);
  const [modalTestStatus, setModalTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const modalKeyInputRef = useRef<HTMLInputElement | null>(null);

  // Discovery State (Shared by ?subtab=discovery, Models view, and Discovery Dialog)
  const [discoveryProvider, setDiscoveryProvider] = useState<string>('');
  const [discoveryModels, setDiscoveryModels] = useState<CatalogModel[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState<boolean>(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [modelsCapFilter, setModelsCapFilter] = useState<'all' | 'vision' | 'tools' | 'json'>('all');
  const [modelsSearch, setModelsSearch] = useState<string>('');

  // Quotas & Telemetry State
  const [quotaData, setQuotaData] = useState<QuotaDashboardResponse | null>(null);
  const [quotaLoading, setQuotaLoading] = useState<boolean>(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaRequiresReauth, setQuotaRequiresReauth] = useState<boolean>(false);
  const [basicLimitDraft, setBasicLimitDraft] = useState<string>('10');
  const [premiumLimitDraft, setPremiumLimitDraft] = useState<string>('100');
  const [enterpriseLimitDraft, setEnterpriseLimitDraft] = useState<string>('5000');
  const [adminLimitDraft, setAdminLimitDraft] = useState<string>('10000');
  const [quotaSaving, setQuotaSaving] = useState<boolean>(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatusResponse | null>(null);
  const [engineMetrics, setEngineMetrics] = useState<EngineMetricsResponse | null>(null);

  // Playground & Snippets State
  const [playgroundModel, setPlaygroundModel] = useState<string>('auto');
  const [playgroundPrompt, setPlaygroundPrompt] = useState<string>(
    'Summarize three concrete engineering strengths for a senior backend resume in two concise sentences.'
  );
  const [playgroundOutput, setPlaygroundOutput] = useState<string>('');
  const [playgroundMeta, setPlaygroundMeta] = useState<string>('');
  const [playgroundRunning, setPlaygroundRunning] = useState<boolean>(false);
  const [snippetLang, setSnippetLang] = useState<'curl' | 'python' | 'typescript' | 'claude'>('curl');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const gatewayOrigin = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/v1`;
    }
    return '/v1';
  }, []);

  const redirectOn401 = useCallback(
    (err: unknown): boolean => {
      const apiErr = err as Partial<ApiError> & { response?: { status?: number } };
      const status = apiErr?.status || apiErr?.response?.status;
      if (status === 401) {
        const nextUrl = `${location.pathname}${location.search}`;
        navigate(`/login?next=${encodeURIComponent(nextUrl)}`, { replace: true });
        return true;
      }
      return false;
    },
    [location.pathname, location.search, navigate]
  );

  const showToast = useCallback((message: string) => {
    setToastMsg(message);
    setActionError(null);
  }, []);

  // Apply server payload to state consistently on load & save
  const hydrateFromResponse = useCallback((res: AiSettingsApiResponse) => {
    if (typeof res.revision === 'number') {
      setRevision(res.revision);
    }
    if (typeof res.featureFlags?.ai_settings_v2_enabled === 'boolean') {
      setV2Enabled(res.featureFlags.ai_settings_v2_enabled);
    }
    const serverMasks = res.maskedKeys || {};
    const serverSources = res.credentialSources || {};
    const serverCooldowns = res.cooldowns || {};
    setMaskedKeys(serverMasks);
    setCooldowns(serverCooldowns);

    const s = res.settings || {};
    if (s.selectionMode && ['auto', 'quality', 'speed', 'balanced', 'manual'].includes(s.selectionMode)) {
      setSelectionMode(s.selectionMode as SelectionMode);
    }
    if (s.provider) {
      setPrimaryProvider(String(s.provider));
    }
    if (typeof s.temperature === 'number') {
      setTemperature(s.temperature);
    }
    if (typeof s.maxTokens === 'number') {
      setMaxTokens(s.maxTokens);
    }
    if (typeof s.enableFallback === 'boolean') {
      setEnableFallback(s.enableFallback);
    }

    if (Array.isArray(res.catalog)) {
      const mapped: ProviderCatalogEntry[] = res.catalog.map((p) => {
        const hasCooldown = Boolean(serverCooldowns[p.id]);
        const isEnabled =
          typeof p.enabled === 'boolean'
            ? p.enabled
            : Boolean(p.configuredOnServer) && !p.disabled;
        const normalizedStatus: ProviderCatalogEntry['status'] = !isEnabled
          ? 'disabled'
          : hasCooldown || p.status === 'cooldown' || p.status === 'issues'
            ? 'issues'
            : p.status === 'healthy'
              ? 'healthy'
              : 'unverified';
        return {
          ...p,
          configuredOnServer: Boolean(p.configuredOnServer),
          enabled: isEnabled,
          disabled: Boolean(p.disabled),
          status: normalizedStatus,
          maskedKey: serverMasks[p.id] || '',
          credentialSource: p.credentialSource || serverSources[p.id] || 'none',
          customBaseUrl: p.customBaseUrl || '',
        };
      });
      setProviders(mapped);

      const nextModels: Record<string, string> = {};
      const nextUrls: Record<string, string> = {};
      for (const item of mapped) {
        nextModels[item.id] = item.defaultModel || '';
        nextUrls[item.id] = item.customBaseUrl || '';
      }
      setModelDrafts(nextModels);
      setBaseUrlDrafts(nextUrls);

      const targetPrimary = String(s.provider || mapped[0]?.id || 'groq');
      const primaryCatalogEntry = mapped.find((item) => item.id === targetPrimary);
      if (primaryCatalogEntry?.defaultModel) {
        setPinnedModel(primaryCatalogEntry.defaultModel);
      }
    }

    if (Array.isArray(res.discoveredModels)) {
      setDiscoveredModels(res.discoveredModels);
    }
  }, []);

  const loadQuotaAndTelemetry = useCallback(async () => {
    setQuotaLoading(true);
    setQuotaError(null);
    try {
      const requests: Promise<any>[] = [
        get<QuotaDashboardResponse>('/admin/ai/quota-stats').catch((err) => ({ __err: err })),
        get<EngineStatusResponse>('/freellmapi/status').catch(() => null),
      ];
      if (isSuperAdmin) {
        requests.push(get<EngineMetricsResponse>('/freellmapi/metrics').catch(() => null));
      } else {
        requests.push(
          get<{ value?: boolean }>('/admin/operations/feature-flags/ai_settings_v2_enabled').catch(
            () => null
          )
        );
      }
      const [qRes, statusRes, thirdRes] = await Promise.all(requests);
      if (qRes && qRes.__err) {
        if (redirectOn401(qRes.__err)) return;
        setQuotaError(qRes.__err.message || 'Unable to load AI quota statistics.');
      } else if (qRes && qRes.limits) {
        setQuotaData(qRes);
        setBasicLimitDraft(String(qRes.limits.basic ?? 10));
        setPremiumLimitDraft(String(qRes.limits.premium ?? 100));
        setEnterpriseLimitDraft(String(qRes.limits.enterprise ?? 5000));
        setAdminLimitDraft(String(qRes.limits.admin ?? 10000));
      }
      if (statusRes) setEngineStatus(statusRes);
      if (isSuperAdmin && thirdRes) {
        setEngineMetrics(thirdRes);
      } else if (!isSuperAdmin && thirdRes && typeof thirdRes.value === 'boolean') {
        setV2Enabled(thirdRes.value);
      }
    } finally {
      setQuotaLoading(false);
    }
  }, [isSuperAdmin, redirectOn401]);

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

  // Auto-expand provider when ?provider=<exactId> matches a catalog entry
  useEffect(() => {
    if (providerFilter && providers.some((p) => p.id.toLowerCase() === providerFilter)) {
      setExpandedRowId(providerFilter);
    }
  }, [providerFilter, providers]);

  // Pre-select target provider when opening Configure Provider with ?target=<id>
  useEffect(() => {
    if (activeDialog === 'configure-provider' && dialogTarget) {
      setModalSelectedId(dialogTarget);
      setModalError(null);
      setModalTestStatus(null);
    }
  }, [activeDialog, dialogTarget]);

  // ─── Central CAS-Guarded Settings Mutation Helper ───
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
        if (norm.status === 409 && (norm.code === 'REVISION_CONFLICT' || norm.code === 'AI_SETTINGS_CONFLICT')) {
          const safeRetryPayload = Object.fromEntries(
            Object.entries(payload).filter(([k]) => !/ApiKey|ApiKeys/i.test(k))
          );
          setRevisionConflict({
            message:
              norm.message ||
              'Configuration was modified in another session. Reload server state or overwrite.',
            currentRevision: rawDetails?.currentRevision,
            pendingPayload: safeRetryPayload,
          });
          return null;
        }
        setActionError(norm.message || 'Unable to save AI settings.');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [hydrateFromResponse, redirectOn401, revision, showToast]
  );

  // ─── Derived Provider Counts & Configured-First Sort (Simplification #4) ───
  const configuredCount = useMemo(
    () => providers.filter((p) => p.configuredOnServer || p.hasKey).length,
    [providers]
  );
  const healthyCount = useMemo(
    () => providers.filter((p) => p.enabled && p.status === 'healthy').length,
    [providers]
  );
  const issuesCount = useMemo(
    () =>
      providers.filter(
        (p) => p.status === 'issues' || p.status === 'cooldown' || Boolean(cooldowns[p.id])
      ).length,
    [cooldowns, providers]
  );
  const disabledCount = useMemo(
    () => providers.filter((p) => !p.enabled || p.status === 'disabled').length,
    [providers]
  );

  const tierCounts = useMemo(() => {
    let frontier = 0;
    let mesh = 0;
    let search = 0;
    for (const p of providers) {
      const t = getProviderTier(p);
      if (t === 'frontier') frontier++;
      else if (t === 'search') search++;
      else mesh++;
    }
    return { all: providers.length, frontier, mesh, search };
  }, [providers]);

  const sortedFilteredProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = providers.filter((p) => {
      if (providerFilter && p.id.toLowerCase() !== providerFilter && !p.name.toLowerCase().includes(providerFilter)) {
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
      if (statusFilter === 'issues' && p.status !== 'issues' && p.status !== 'cooldown' && !cooldowns[p.id]) {
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

  const pinnedProviderModels = useMemo(
    () => discoveredModels.filter((m) => m.providerId === primaryProvider),
    [discoveredModels, primaryProvider]
  );

  // ─── Actions: Global Save, Discovery, Provider Probe, Key Save/Clear, Toggle ───
  const handleSaveGlobalSettings = async () => {
    const payload: Record<string, any> = {
      selectionMode,
      provider: primaryProvider,
      temperature,
      maxTokens,
      enableFallback,
    };
    if (selectionMode === 'manual' && primaryProvider && pinnedModel) {
      payload[primaryProvider] = {
        ...payload[primaryProvider],
        model: pinnedModel,
        ...(providers.find((p) => p.id === primaryProvider)?.keyless ? { enabled: true } : {}),
      };
    }
    try {
      await commitSettingsPatch(payload, 'Runtime routing and generation parameters saved.');
    } catch {
      /* error banner set in commitSettingsPatch */
    }
  };

  const handleRefreshPinnedModels = async () => {
    if (!primaryProvider) return;
    setActionError(null);
    try {
      const res = await post<{ models?: Array<{ id: string; name?: string; catalogStatus?: string }> }>(
        '/admin/ai/fetch-models',
        { provider: primaryProvider }
      );
      const fetched: CatalogModel[] = (res.models || []).map((m) => ({
        id: m.id,
        name: m.name || m.id,
        providerId: primaryProvider,
        catalogStatus: m.catalogStatus || 'fresh',
      }));
      setDiscoveredModels((prev) => [
        ...prev.filter((item) => item.providerId !== primaryProvider),
        ...fetched,
      ]);
      if (fetched.length > 0 && !fetched.some((m) => m.id === pinnedModel)) {
        setPinnedModel(fetched[0].id);
      }
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setActionError(err?.message || 'Unable to discover models for pinned provider.');
    }
  };

  const handleDiscoveryFetch = async (providerId: string) => {
    if (!providerId) return;
    setDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      const res = await post<{
        models?: Array<{
          id: string;
          name?: string;
          contextWindow?: number | null;
          capabilities?: { vision?: boolean; tools?: boolean; json?: boolean };
          catalogStatus?: string;
        }>;
      }>('/admin/ai/fetch-models', { provider: providerId });
      const rows: CatalogModel[] = (res.models || []).map((m) => ({
        id: m.id,
        name: m.name || m.id,
        providerId,
        contextWindow: m.contextWindow ?? null,
        capabilities: m.capabilities || {},
        catalogStatus: m.catalogStatus || 'fresh',
      }));
      setDiscoveryModels(rows);
      setDiscoveredModels((prev) => [
        ...prev.filter((item) => item.providerId !== providerId),
        ...rows,
      ]);
    } catch (err: unknown) {
      if (redirectOn401(err)) return;
      const norm = normalizeError(err);
      setDiscoveryError(norm.message || 'Catalog discovery failed');
    } finally {
      setDiscoveryLoading(false);
    }
  };

  // Probes server-stored credential ONLY (never re-transmits saved plaintext secrets)
  const probeStoredProvider = async (providerId: string) => {
    setTestingId(providerId);
    setActionError(null);
    try {
      const res = await post<{
        success?: boolean;
        latencyMs?: number | null;
        message?: string;
        model?: string;
      }>('/admin/ai/test-provider', { provider: providerId });
      if (res.success === false) {
        throw new Error(res.message || 'Connection check failed');
      }
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, status: 'healthy', latencyMs: res.latencyMs ?? p.latencyMs ?? null }
            : p
        )
      );
      showToast(res.message || `${providerId} verified.`);
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setProviders((prev) =>
        prev.map((p) => (p.id === providerId ? { ...p, status: 'issues' } : p))
      );
      setActionError(err?.message || `Verification failed for ${providerId}.`);
    } finally {
      setTestingId(null);
    }
  };

  const handleCheckAll = async () => {
    const candidates = providers.filter((p) => p.enabled && (p.configuredOnServer || p.keyless));
    if (candidates.length === 0) {
      showToast('No enabled providers to verify.');
      return;
    }
    setCheckingAll(true);
    for (const candidate of candidates) {
      await probeStoredProvider(candidate.id);
    }
    setCheckingAll(false);
  };

  const handleToggleProvider = async (p: ProviderCatalogEntry, nextEnabled: boolean) => {
    if (!nextEnabled && p.id === primaryProvider) {
      setActionError(
        `Cannot disable ${p.name} because it is currently the active primary provider. Switch primary provider first.`
      );
      return;
    }
    if (nextEnabled && !p.keyless && !p.hasKey && !p.configuredOnServer) {
      setModalSelectedId(p.id);
      setModalTab('single');
      openDialog('configure-provider', p.id);
      return;
    }
    const previous = providers;
    setProviders((curr) =>
      curr.map((item) =>
        item.id === p.id
          ? {
              ...item,
              enabled: nextEnabled,
              disabled: !nextEnabled,
              status: nextEnabled ? 'unverified' : 'disabled',
            }
          : item
      )
    );
    try {
      await commitSettingsPatch(
        { enabledProviders: { [p.id]: nextEnabled } },
        `${p.name} ${nextEnabled ? 'enabled' : 'disabled'}.`
      );
    } catch {
      setProviders(previous);
    }
  };

  const handleSaveRowSingleKey = async (p: ProviderCatalogEntry) => {
    const draft = (singleKeyDrafts[p.id] || '').trim();
    if (!draft) return;
    try {
      await commitSettingsPatch(
        {
          [`${p.id}ApiKey`]: draft,
          enabledProviders: { [p.id]: true },
        },
        `${p.name} API key saved and masked.`
      );
      // Immediately purge plaintext draft from React state before probing server key
      setSingleKeyDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setShowRowKey((prev) => ({ ...prev, [p.id]: false }));
      await probeStoredProvider(p.id);
    } catch {
      /* error surfaced by commitSettingsPatch */
    }
  };

  const handleSaveRowPool = async (p: ProviderCatalogEntry) => {
    const keys = splitKeys(poolKeyDrafts[p.id] || '');
    if (keys.length === 0) return;
    try {
      await commitSettingsPatch(
        {
          [`${p.id}ApiKeys`]: keys,
          enabledProviders: { [p.id]: true },
        },
        `${p.name} rotation pool (${keys.length} keys) saved.`
      );
      setPoolKeyDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      await probeStoredProvider(p.id);
    } catch {
      /* error surfaced */
    }
  };

  const handleSaveRowConfig = async (p: ProviderCatalogEntry) => {
    const nextModel = (modelDrafts[p.id] || '').trim();
    const nextBaseUrl = (baseUrlDrafts[p.id] || '').trim();
    try {
      await commitSettingsPatch(
        {
          [`${p.id}Model`]: nextModel,
          [`${p.id}BaseUrl`]: nextBaseUrl || 'none',
        },
        `${p.name} model and endpoint settings saved.`
      );
    } catch {
      /* error surfaced */
    }
  };

  const handleSetPrimaryImmediate = async (p: ProviderCatalogEntry) => {
    setPrimaryProvider(p.id);
    try {
      await commitSettingsPatch(
        {
          provider: p.id,
          enabledProviders: { [p.id]: true },
        },
        `${p.name} set as primary provider.`
      );
    } catch {
      /* error surfaced */
    }
  };

  const handleConfirmClearKey = async () => {
    if (!dialogTarget) return;
    const targetProvider = providers.find((p) => p.id === dialogTarget);
    try {
      await commitSettingsPatch(
        { clearSecrets: { [dialogTarget]: true } },
        `Stored credential removed for ${targetProvider?.name || dialogTarget}.`
      );
      closeDialog();
    } catch {
      closeDialog();
    }
  };

  // ─── Configure Provider Modal Handlers (Simplification #1) ───
  const modalSelectedPlatform = useMemo(
    () => providers.find((p) => p.id === modalSelectedId) || null,
    [modalSelectedId, providers]
  );

  const modalFilteredPlatforms = useMemo(() => {
    const q = modalPlatformQuery.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [modalPlatformQuery, providers]);

  const canProbeInModal = Boolean(
    modalSelectedPlatform &&
      modalTab !== 'endpoint' &&
      !modalCustomBaseUrl.trim() &&
      (modalSelectedPlatform.keyless ||
        (modalTab === 'single' && modalApiKey.trim().length > 0) ||
        (modalTab === 'pool' && splitKeys(modalPoolText).length > 0))
  );

  const resetModalDrafts = useCallback(() => {
    setModalApiKey('');
    setModalShowKey(false);
    setModalPoolText('');
    setModalCustomBaseUrl('');
    setModalCustomModel('');
    setModalTestStatus(null);
    setModalError(null);
    setPlatformDropdownOpen(false);
    setModalPlatformQuery('');
  }, []);

  const openQuickAddForProvider = (p: ProviderCatalogEntry) => {
    resetModalDrafts();
    setModalSelectedId(p.id);
    setModalTab('single');
    openDialog('configure-provider', p.id);
    requestAnimationFrame(() => {
      modalKeyInputRef.current?.focus();
    });
  };

  const handleModalProbeBeforeSave = async () => {
    if (!modalSelectedPlatform || !canProbeInModal) return;
    setModalTesting(true);
    setModalTestStatus(null);
    setModalError(null);
    try {
      const candidateKey =
        modalTab === 'pool'
          ? splitKeys(modalPoolText)[0]
          : modalApiKey.trim() || undefined;
      const res = await post<{ success?: boolean; message?: string; latencyMs?: number }>(
        '/admin/ai/test-provider',
        {
          provider: modalSelectedPlatform.id,
          ...(candidateKey ? { apiKey: candidateKey } : {}),
          ...(modalCustomModel.trim() ? { model: modalCustomModel.trim() } : {}),
        }
      );
      if (res.success === false) {
        setModalTestStatus({ ok: false, msg: res.message || 'Provider rejected key.' });
      } else {
        setModalTestStatus({
          ok: true,
          msg: res.message || `Verified (${res.latencyMs ?? 1}ms).`,
        });
      }
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setModalTestStatus({
        ok: false,
        msg: err?.message || 'Connection test failed.',
      });
    } finally {
      setModalTesting(false);
    }
  };

  const handleModalSaveAndActivate = async () => {
    if (!modalSelectedPlatform) {
      setModalError('Select a provider platform first.');
      return;
    }
    const pId = modalSelectedPlatform.id;
    const payload: Record<string, any> = {
      enabledProviders: { [pId]: true },
    };

    if (modalTab === 'pool') {
      const pool = splitKeys(modalPoolText);
      if (pool.length === 0 && !modalSelectedPlatform.keyless) {
        setModalError('Enter at least one API key for the rotation pool.');
        return;
      }
      if (pool.length > 0) payload[`${pId}ApiKeys`] = pool;
    } else {
      const single = modalApiKey.trim();
      if (!single && !modalSelectedPlatform.keyless && !modalSelectedPlatform.hasKey) {
        setModalError('Enter an API key to activate this provider.');
        return;
      }
      if (single) payload[`${pId}ApiKey`] = single;
      else if (modalSelectedPlatform.keyless) payload[`${pId}ApiKey`] = 'keyless';
    }

    if (modalCustomBaseUrl.trim()) {
      payload[`${pId}BaseUrl`] = modalCustomBaseUrl.trim();
    }
    if (modalCustomModel.trim()) {
      payload[`${pId}Model`] = modalCustomModel.trim();
    }

    setModalError(null);
    try {
      await commitSettingsPatch(payload, `${modalSelectedPlatform.name} configured and activated.`);
      // Immediately clear plaintext secret inputs upon save before any follow-up probe
      resetModalDrafts();
      closeDialog();
      await probeStoredProvider(pId);
    } catch (err: any) {
      setModalError(err?.message || 'Unable to save provider configuration.');
    }
  };

  // ─── AI Quota Governance Handlers (Simplification #7) ───
  const handleSaveQuotaLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuotaSaving(true);
    setQuotaError(null);
    setQuotaRequiresReauth(false);
    try {
      const res = await post<{
        revision: number;
        limits: { basic: number; premium: number; admin: number };
        message?: string;
      }>('/admin/ai/quota-limits', {
        basicDailyLimit: Number(basicLimitDraft),
        premiumDailyLimit: Number(premiumLimitDraft),
        enterpriseDailyLimit: Number(enterpriseLimitDraft),
        adminDailyLimit: Number(adminLimitDraft),
        expectedRevision: quotaData?.quotaRevision ?? 0,
      });
      showToast(res.message || 'AI daily quota limits saved.');
      await loadQuotaAndTelemetry();
    } catch (err: any) {
      if (redirectOn401(err)) return;
      if (err?.code === 'RECENT_AUTH_REQUIRED') {
        setQuotaRequiresReauth(true);
      }
      setQuotaError(err?.message || 'Unable to save AI quota limits.');
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleConfirmQuotaReset = async (resetAll: boolean) => {
    setQuotaSaving(true);
    setQuotaError(null);
    setQuotaRequiresReauth(false);
    try {
      const body = resetAll ? { all: true } : { uid: dialogTarget };
      const res = await post<{ message?: string }>('/admin/ai/reset-quota', body);
      closeDialog();
      showToast(res.message || 'Daily AI quota reset completed.');
      await loadQuotaAndTelemetry();
    } catch (err: any) {
      closeDialog();
      if (redirectOn401(err)) return;
      if (err?.code === 'RECENT_AUTH_REQUIRED') {
        setQuotaRequiresReauth(true);
      }
      setQuotaError(err?.message || 'Unable to reset AI usage quota.');
    } finally {
      setQuotaSaving(false);
    }
  };

  // ─── Export & Copy & Playground ───
  const handleExportMetadata = () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      selectionMode,
      primaryProvider,
      temperature,
      maxTokens,
      enableFallback,
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        enabled: p.enabled,
        configuredOnServer: p.configuredOnServer,
        credentialSource: p.credentialSource || 'none',
        defaultModel: p.defaultModel,
      })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ime365-ai-routing-metadata-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (value: string, id: string) => {
    void navigator.clipboard?.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
  };

  const handleRunPlayground = async () => {
    if (!playgroundPrompt.trim()) return;
    setPlaygroundRunning(true);
    setPlaygroundOutput('');
    setPlaygroundMeta('');
    try {
      const started = performance.now();
      const res = await post<{
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
        content?: string;
        _freellmapi?: { provider?: string; actual_model?: string };
      }>('/v1/chat/completions', {
        model: playgroundModel,
        messages: [{ role: 'user', content: playgroundPrompt }],
        max_tokens: Math.min(maxTokens, 512),
        temperature,
      });
      const elapsed = Math.round(performance.now() - started);
      const content = res.choices?.[0]?.message?.content || res.content || '';
      setPlaygroundOutput(content || '(Empty completion)');
      setPlaygroundMeta(
        `Provider: ${res._freellmapi?.provider || primaryProvider} · Model: ${res._freellmapi?.actual_model || res.model || playgroundModel} · ${elapsed}ms`
      );
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setPlaygroundOutput(`Error: ${err?.message || 'Inference request failed.'}`);
    } finally {
      setPlaygroundRunning(false);
    }
  };

  const handleRestoreV2Flag = async () => {
    try {
      await put('/admin/operations/feature-flags/ai_settings_v2_enabled', { value: true });
      setV2Enabled(true);
      showToast('AI Multi-Provider Engine v2 UI re-enabled.');
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setActionError(err?.message || 'Unable to toggle feature flag.');
    }
  };

  const snippetCode = useMemo(() => {
    if (snippetLang === 'claude') {
      return `export ANTHROPIC_BASE_URL="${gatewayOrigin}"\nexport ANTHROPIC_API_KEY="$IME365_API_TOKEN"\nclaude`;
    }
    if (snippetLang === 'python') {
      return `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${gatewayOrigin}",\n    api_key=os.environ["IME365_API_TOKEN"],\n)\nres = client.chat.completions.create(\n    model="auto",\n    messages=[{"role": "user", "content": "Hello from IME365 router"}],\n)\nprint(res.choices[0].message.content)`;
    }
    if (snippetLang === 'typescript') {
      return `const response = await fetch('${gatewayOrigin}/chat/completions', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    Authorization: \`Bearer \${process.env.IME365_API_TOKEN}\`,\n  },\n  body: JSON.stringify({\n    model: 'auto',\n    messages: [{ role: 'user', content: 'Hello from IME365 router' }],\n  }),\n});\nconst data = await response.json();`;
    }
    return `curl -X POST "${gatewayOrigin}/chat/completions" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $IME365_API_TOKEN" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Ping"}]}'`;
  }, [gatewayOrigin, snippetLang]);

  // ─── Reusable AI Quota Governance Section (Used by ADMIN view & SUPER_ADMIN Quotas/Metrics view) ───
  const renderQuotaGovernancePanel = () => (
    <Card className="border-border bg-surface">
      <CardContent className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Gauge className="size-4 text-brand-600 shrink-0" />
              AI Quota Governance &amp; Daily Usage
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Enforce tier daily request caps in MariaDB and reset exhausted individual or global daily counters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadQuotaAndTelemetry()}
              disabled={quotaLoading}
            >
              <RefreshCw className={cn('size-3.5 mr-1.5', quotaLoading && 'animate-spin')} />
              Refresh Quotas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openDialog('confirm-reset-all-quotas')}
              disabled={quotaSaving}
              className="text-error-700 border-error-100 hover:bg-error-50"
            >
              <RotateCcw className="size-3.5 mr-1.5" />
              Reset All Daily Quotas
            </Button>
          </div>
        </div>

        {quotaError && (
          <div
            role="alert"
            className="rounded-xl border border-error-100 bg-error-50 p-3 text-xs text-error-700 flex flex-wrap items-center justify-between gap-2"
          >
            <span>{quotaError}</span>
            {quotaRequiresReauth && (
              <Link
                to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
                className="font-bold underline text-error-700"
              >
                Reauthenticate Session
              </Link>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-canvas p-3.5">
            <div className="text-xs font-medium text-ink-muted">Today&apos;s AI Requests</div>
            <div className="text-xl font-extrabold text-ink mt-1">
              {quotaData?.totalTodayRequests ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-canvas p-3.5">
            <div className="text-xs font-medium text-ink-muted">Active Users Today</div>
            <div className="text-xl font-extrabold text-ink mt-1">
              {quotaData?.activeUsersToday ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-canvas p-3.5">
            <div className="text-xs font-medium text-ink-muted">Historical Usage Rows</div>
            <div className="text-xl font-extrabold text-ink mt-1">
              {quotaData?.totalHistoricalRecords ?? 0}
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveQuotaLimits} className="space-y-4 pt-2 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="quota-basic-limit" className="block text-xs font-semibold text-ink mb-1">
                Basic Daily Limit
              </label>
              <Input
                id="quota-basic-limit"
                type="number"
                min={1}
                max={100000}
                value={basicLimitDraft}
                onChange={(e) => setBasicLimitDraft(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="quota-premium-limit" className="block text-xs font-semibold text-ink mb-1">
                Premium Daily Limit
              </label>
              <Input
                id="quota-premium-limit"
                type="number"
                min={1}
                max={100000}
                value={premiumLimitDraft}
                onChange={(e) => setPremiumLimitDraft(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="quota-enterprise-limit" className="block text-xs font-semibold text-ink mb-1">
                Enterprise Daily Limit
              </label>
              <Input
                id="quota-enterprise-limit"
                type="number"
                min={100}
                max={1000000}
                value={enterpriseLimitDraft}
                onChange={(e) => setEnterpriseLimitDraft(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="quota-admin-limit" className="block text-xs font-semibold text-ink mb-1">
                Admin Daily Limit
              </label>
              <Input
                id="quota-admin-limit"
                type="number"
                min={1}
                max={1000000}
                value={adminLimitDraft}
                onChange={(e) => setAdminLimitDraft(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-muted">
              Quota policy revision: #{quotaData?.quotaRevision ?? 0}
            </span>
            <Button type="submit" size="sm" disabled={quotaSaving}>
              {quotaSaving ? 'Saving Quotas...' : 'Save Quota Limits'}
            </Button>
          </div>
        </form>

        <div className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
            Top Consumers Today
          </h4>
          {!quotaData?.topConsumers?.length ? (
            <p className="text-xs text-ink-muted py-3">
              No AI quota consumption recorded for today ({quotaData?.todayDate || 'UTC'}).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-ink-secondary">
                    <th className="py-2 pr-3 font-semibold">User</th>
                    <th className="py-2 px-3 font-semibold">Tier</th>
                    <th className="py-2 px-3 font-semibold">Used / Limit</th>
                    <th className="py-2 pl-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quotaData.topConsumers.map((consumer) => (
                    <tr key={consumer.uid} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium text-ink">
                        {consumer.email || consumer.uid}
                      </td>
                      <td className="py-2 px-3 text-ink-secondary">
                        {consumer.membership || 'Basic'}
                      </td>
                      <td className="py-2 px-3 font-mono text-ink">
                        {consumer.count} / {consumer.limit || '—'}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openDialog('confirm-reset-user-quota', consumer.uid)}
                        >
                          Reset Quota
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // ─── Loading & Fatal Configuration Error States ───
  if (loading) {
    return (
      <div className="space-y-4 py-6" role="status" aria-label="Loading AI Multi-Provider Engine">
        <div className="h-24 rounded-2xl bg-canvas-soft animate-pulse border border-border" />
        <div className="h-12 rounded-xl bg-canvas-soft animate-pulse border border-border" />
        <div className="h-64 rounded-2xl bg-canvas-soft animate-pulse border border-border" />
      </div>
    );
  }

  if (isSuperAdmin && settingsError) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-error-100 bg-error-50 p-6 space-y-4 text-ink"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-error-700 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <h2 className="text-base font-bold text-error-700">AI Engine Configuration Error</h2>
            <p className="text-sm text-ink-secondary break-words">{settingsError}</p>
          </div>
        </div>
        <Button type="button" onClick={() => void loadSettings()}>
          <RefreshCw className="size-4 mr-2" />
          Retry configuration
        </Button>
      </div>
    );
  }

  // ─── Runtime Feature-Flag Rollback View (Decision #2: ai_settings_v2_enabled = false) ───
  if (!v2Enabled) {
    return (
      <div
        data-testid="ai-settings-rollback-view"
        className="space-y-4"
      >
        <div
          role="status"
          className="rounded-2xl border border-warning-100 bg-warning-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-warning-700">
              Runtime Rollback Active (ai_settings_v2_enabled = false)
            </h2>
            <p className="text-xs text-ink-secondary">
              The v2 AI Multi-Provider Engine interface is currently disabled via runtime feature flag.
              Active primary provider: <strong className="text-ink">{primaryProvider}</strong> ·
              Fallback: <strong className="text-ink">{enableFallback ? 'Enabled' : 'Disabled'}</strong>.
            </p>
          </div>
          {isSuperAdmin && (
            <Button type="button" size="sm" onClick={() => void handleRestoreV2Flag()}>
              Restore v2 Engine UI
            </Button>
          )}
        </div>
        {renderQuotaGovernancePanel()}
      </div>
    );
  }

  // ─── ADMIN (Non-Super-Admin) Scoped Governance View (Decision #1.7, DEF-05) ───
  if (!isSuperAdmin) {
    return (
      <div className="space-y-5 min-w-0" data-testid="admin-ai-quota-only-view">
        {toastMsg && (
          <div
            role="status"
            className="rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-xs font-semibold text-success-700 flex items-center justify-between gap-2"
          >
            <span>{toastMsg}</span>
            <button
              type="button"
              onClick={() => setToastMsg(null)}
              className="underline font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <section
          data-testid="super-admin-restriction-notice"
          aria-label="Super-Admin credential restriction notice"
          className="rounded-2xl border border-brand-200 bg-brand-50/70 p-5 space-y-2"
        >
          <div className="flex items-center gap-2 text-brand-800 font-bold text-sm">
            <Lock className="size-4 shrink-0" />
            <h2>Provider Credentials Require Super-Admin Authorization</h2>
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed">
            API keys, multi-key rotation pools, custom provider endpoints, and live model routing
            policies are restricted to <strong>SUPER_ADMIN</strong> operators. As a{' '}
            <strong>System Admin</strong>, you have full operational authority over platform-wide AI
            daily request quotas and user usage resets below. For general module toggles (such as
            Resume Import), visit{' '}
            <Link to="/admin/settings" className="font-bold text-brand-700 underline">
              Platform Settings &amp; Modules
            </Link>
            .
          </p>
        </section>

        {renderQuotaGovernancePanel()}

        {/* Accessible Radix Confirmation Dialogs for ADMIN Quota Resets */}
        <Dialog
          open={activeDialog === 'confirm-reset-user-quota'}
          onOpenChange={(open) => !open && closeDialog()}
        >
          <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset User Daily AI Quota</DialogTitle>
              <DialogDescription>
                Clear today&apos;s AI request count for UID <span className="font-mono">{dialogTarget}</span>?
                This action is recorded in the security audit log.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmQuotaReset(false)}
                disabled={quotaSaving}
              >
                Confirm Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={activeDialog === 'confirm-reset-all-quotas'}
          onOpenChange={(open) => !open && closeDialog()}
        >
          <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset All Daily AI Quotas</DialogTitle>
              <DialogDescription>
                Reset daily AI usage counters for every user across the platform? This operation
                cannot be undone and is logged in the security audit trail.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmQuotaReset(true)}
                disabled={quotaSaving}
                className="bg-error-600 hover:bg-error-700 text-white"
              >
                Reset All Counters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── SUPER_ADMIN Full Rebuilt v2 Surface ───
  const isDiscoveryOrModelsView = activeSubtab === 'discovery' || activeSubtab === 'models';
  const isMetricsOrQuotasView = activeSubtab === 'metrics' || activeSubtab === 'quotas';
  const isGatewayOrClaudeView = activeSubtab === 'unified-gateway' || activeSubtab === 'claude';

  const hasStaleDiscovery = discoveryModels.some(
    (m) => m.catalogStatus && m.catalogStatus !== 'fresh'
  );

  return (
    <div className="space-y-5 min-w-0" data-testid="ai-multi-provider-engine">
      {/* Status & Error Banners */}
      {toastMsg && (
        <div
          role="status"
          className="rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-xs font-semibold text-success-700 flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="truncate">{toastMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="underline font-bold shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-error-100 bg-error-50 px-4 py-3 text-xs font-semibold text-error-700 flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 min-w-0">
            <AlertCircle className="size-4 shrink-0" />
            <span className="break-words">{actionError}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="underline font-bold shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {revisionConflict && (
        <div
          role="alert"
          data-testid="revision-conflict-banner"
          className="rounded-xl border border-warning-100 bg-warning-50 p-4 space-y-2 text-ink"
        >
          <div className="flex items-center gap-2 text-warning-700 font-bold text-xs">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Concurrent Edit Detected (Server Revision #{revisionConflict.currentRevision ?? '?'})
            </span>
          </div>
          <p className="text-xs text-ink-secondary">{revisionConflict.message}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadSettings()}>
              Reload Server Settings
            </Button>
            {revisionConflict.pendingPayload && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  void commitSettingsPatch(
                    revisionConflict.pendingPayload!,
                    'Configuration saved (overwrote prior revision).',
                    { force: true }
                  )
                }
              >
                Overwrite Server Version
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ─── Simplification #5: Compact Runtime Model Selection Strip ─── */}
      <Card className="border-border bg-surface">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Brain className="size-4 text-brand-600 shrink-0" />
                <h2 className="text-base font-extrabold text-ink tracking-tight">
                  Runtime model selection
                </h2>
                <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                  Primary: {primaryProvider}
                </span>
                <span className="text-xs text-ink-muted">Rev #{revision}</span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Dispatch mode across {providers.length} registered providers. Resume Import toggle
                lives in{' '}
                <Link to="/admin/settings" className="font-semibold text-brand-700 underline">
                  Platform Settings
                </Link>
                .
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
              <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                <label htmlFor="ai-selection-mode" className="text-xs font-bold text-ink shrink-0">
                  Selection mode
                </label>
                <select
                  id="ai-selection-mode"
                  aria-label="Selection mode"
                  value={selectionMode}
                  onChange={(e) => setSelectionMode(e.target.value as SelectionMode)}
                  className="max-w-full min-w-0 rounded-xl border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="auto">Auto / Recommended</option>
                  <option value="quality">Quality First</option>
                  <option value="speed">Speed First</option>
                  <option value="balanced">Balanced</option>
                  <option value="manual">Manual Pin</option>
                </select>
              </div>

              <label
                htmlFor="ai-enable-fallback"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink cursor-pointer"
              >
                <input
                  id="ai-enable-fallback"
                  type="checkbox"
                  checked={enableFallback}
                  onChange={(e) => setEnableFallback(e.target.checked)}
                  className="rounded border-border text-brand-600 focus:ring-brand-500"
                />
                <span>Failover Mesh</span>
              </label>

              <button
                type="button"
                aria-expanded={showTuning}
                onClick={() => setShowTuning((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
              >
                <Sliders className="size-3.5 shrink-0" />
                <span>
                  Tuning ({temperature.toFixed(2)} · {maxTokens} tok)
                </span>
                <ChevronDown
                  className={cn('size-3.5 transition-transform', showTuning && 'rotate-180')}
                />
              </button>

              <Button
                type="button"
                size="sm"
                onClick={() => void handleSaveGlobalSettings()}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save All Changes'}
              </Button>
            </div>
          </div>

          {/* Manual Pin Row */}
          {selectionMode === 'manual' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border">
              <div>
                <label
                  htmlFor="ai-pinned-provider"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Pinned provider
                </label>
                <select
                  id="ai-pinned-provider"
                  aria-label="Pinned provider"
                  value={primaryProvider}
                  onChange={(e) => {
                    setPrimaryProvider(e.target.value);
                    setPinnedModel('');
                  }}
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  {providers
                    .filter((p) => p.group !== 'search')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ai-pinned-model"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Pinned model
                </label>
                <select
                  id="ai-pinned-model"
                  aria-label="Pinned model"
                  value={pinnedModel}
                  onChange={(e) => setPinnedModel(e.target.value)}
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  <option value="">Select discovered model...</option>
                  {pinnedProviderModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRefreshPinnedModels()}
                  className="w-full sm:w-auto"
                >
                  <RefreshCw className="size-3.5 mr-1.5" />
                  Refresh selectable models
                </Button>
              </div>
            </div>
          )}

          {/* Expandable Generation Parameters (0–2 Temperature, 256–8192 Max Tokens) */}
          {showTuning && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="ai-temperature-slider" className="font-semibold text-ink">
                    Temperature (0.0 – 2.0)
                  </label>
                  <span className="font-mono font-bold text-ink">{temperature.toFixed(2)}</span>
                </div>
                <input
                  id="ai-temperature-slider"
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>0.0 Deterministic</span>
                  <span>1.0 Balanced</span>
                  <span>2.0 High Variance</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="ai-max-tokens-slider" className="font-semibold text-ink">
                    Max Output Tokens (256 – 8192)
                  </label>
                  <span className="font-mono font-bold text-ink">{maxTokens} tok</span>
                </div>
                <input
                  id="ai-max-tokens-slider"
                  type="range"
                  min={256}
                  max={8192}
                  step={128}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between text-[11px] text-ink-muted">
                  <span>256</span>
                  <span>4096</span>
                  <span>8192</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Simplification #2: Unified URL-Backed Navigation & Tool Bar ─── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="AI Engine Views">
          <button
            type="button"
            onClick={() => selectSubtab('providers')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
              activeSubtab === 'providers'
                ? 'bg-brand-600 text-white'
                : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
            )}
          >
            Providers &amp; Keys ({configuredCount}/{providers.length})
          </button>
          <button
            type="button"
            onClick={() => selectSubtab('discovery')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
              isDiscoveryOrModelsView
                ? 'bg-brand-600 text-white'
                : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
            )}
          >
            Models &amp; Fallback Chains
          </button>
          <button
            type="button"
            onClick={() => selectSubtab('metrics')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
              isMetricsOrQuotasView
                ? 'bg-brand-600 text-white'
                : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
            )}
          >
            Quotas &amp; Telemetry
          </button>
          <button
            type="button"
            onClick={() => selectSubtab('unified-gateway')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
              isGatewayOrClaudeView
                ? 'bg-brand-600 text-white'
                : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
            )}
          >
            Claude Code &amp; Agents
          </button>
          <button
            type="button"
            onClick={() => selectSubtab('playground')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
              activeSubtab === 'playground'
                ? 'bg-brand-600 text-white'
                : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
            )}
          >
            Playground
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              resetModalDrafts();
              setModalSelectedId('');
              setModalTab('single');
              openDialog('configure-provider');
            }}
          >
            <Plus className="size-3.5 mr-1" />
            Configure Provider
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openDialog('key-pool')}
          >
            Manage key pools
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openDialog('cooldowns')}
          >
            Manage cooldowns
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openDialog('discovery')}
          >
            Discover models
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openDialog('snippets')}
          >
            Integration snippets
          </Button>
        </div>
      </div>

      {/* ─── VIEW 1: Providers & Keys (subtab=providers) ─── */}
      {activeSubtab === 'providers' && (
        <div className="space-y-4 min-w-0">
          {/* Category Tier Tablist (Zero aria-pressed on role=tab — fixes DEF-19) */}
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

          {/* Search + Configured/Status Filter Pills (Simplification #4) */}
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

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by provider status">
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
              {sortedFilteredProviders.map((p) => {
                const isExpanded = expandedRowId === p.id;
                const isPrimary = p.id === primaryProvider;
                const cooldown = cooldowns[p.id];
                const serverMask = maskedKeys[p.id] || p.maskedKey || '';
                const poolDraftCount = splitKeys(poolKeyDrafts[p.id] || '').length;

                return (
                  <div
                    key={p.id}
                    data-testid={`provider-row-${p.id}`}
                    className={cn(
                      'rounded-2xl border transition-colors bg-surface',
                      isPrimary ? 'border-brand-300' : 'border-border'
                    )}
                  >
                    <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <input
                          id={`toggle-provider-${p.id}`}
                          type="checkbox"
                          aria-label={`Enable ${p.name}`}
                          checked={Boolean(p.enabled)}
                          onChange={(e) => void handleToggleProvider(p, e.target.checked)}
                          className="mt-1 sm:mt-0 size-4 rounded border-border text-brand-600 focus:ring-brand-500 shrink-0 cursor-pointer"
                        />

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-ink">{p.name}</span>
                            {isPrimary && (
                              <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white">
                                Primary
                              </span>
                            )}
                            {p.group === 'search' && (
                              <span className="rounded-md bg-canvas-soft border border-border px-1.5 py-0.5 text-[10px] font-semibold text-ink-secondary">
                                web search
                              </span>
                            )}
                            <span className="text-xs text-ink-muted">
                              {p.keyless
                                ? 'Keyless'
                                : `${p.keysCount || 0} ${p.keysCount === 1 ? 'key' : 'keys'}`}
                            </span>
                            {serverMask && (
                              <span
                                data-testid={`masked-key-${p.id}`}
                                className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-secondary border border-border"
                              >
                                {serverMask}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {cooldown || p.status === 'issues' || p.status === 'cooldown' ? (
                              <span className="font-semibold text-error-700">
                                {cooldown
                                  ? `Cooldown (${cooldown.remainingSeconds}s)`
                                  : 'Connection Issue'}
                              </span>
                            ) : p.status === 'healthy' ? (
                              <span className="font-semibold text-success-700">
                                Verified{p.latencyMs ? ` (${p.latencyMs}ms)` : ''}
                              </span>
                            ) : p.enabled && (p.configuredOnServer || p.keyless) ? (
                              <span className="font-medium text-ink-secondary">
                                Configured ({formatCredentialSource(p.credentialSource, p.keyless)})
                              </span>
                            ) : p.hasKey ? (
                              <span className="font-medium text-warning-700">
                                Disabled (Key Stored)
                              </span>
                            ) : (
                              <span className="text-ink-muted">Not Configured</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {!p.keyless && !p.hasKey && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => openQuickAddForProvider(p)}
                          >
                            <Key className="size-3.5 mr-1" />
                            Add key
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Test Connection for ${p.name}`}
                          disabled={
                            testingId === p.id || (!p.keyless && !p.hasKey && !p.configuredOnServer)
                          }
                          onClick={() => void probeStoredProvider(p.id)}
                        >
                          {testingId === p.id ? (
                            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                          ) : null}
                          Test Connection
                        </Button>
                        <button
                          type="button"
                          data-testid={`expand-provider-${p.id}`}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${p.name} settings`}
                          onClick={() =>
                            setExpandedRowId((curr) => (curr === p.id ? null : p.id))
                          }
                          className="rounded-xl border border-border bg-canvas p-2 text-ink-secondary hover:text-ink cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* ─── Simplification #6: Self-Persisting Inline Provider Row Drawer ─── */}
                    {isExpanded && (
                      <div className="border-t border-border bg-canvas p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4 rounded-b-2xl">
                        {/* Credentials Column */}
                        <div className="space-y-3 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                              Server Credential Vault
                            </h3>
                            <span className="text-xs font-semibold text-ink-secondary">
                              Source: {formatCredentialSource(p.credentialSource, p.keyless)}
                            </span>
                          </div>

                          {serverMask && (
                            <div className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center justify-between gap-2 text-xs">
                              <span className="text-ink-muted">Active Server Key:</span>
                              <span className="font-mono font-bold text-ink">{serverMask}</span>
                            </div>
                          )}

                          {!p.keyless && (
                            <div className="space-y-2">
                              <label
                                htmlFor={`row-key-input-${p.id}`}
                                className="block text-xs font-semibold text-ink"
                              >
                                {p.hasKey ? 'Replace API Key (write-only)' : 'Enter API Key'}
                              </label>
                              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                  <input
                                    id={`row-key-input-${p.id}`}
                                    type={showRowKey[p.id] ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    spellCheck={false}
                                    placeholder={
                                      p.hasKey
                                        ? `${serverMask || '••••••••'} (Leave blank to keep)`
                                        : `Paste API Key for ${p.name}...`
                                    }
                                    value={singleKeyDrafts[p.id] || ''}
                                    onChange={(e) =>
                                      setSingleKeyDrafts((prev) => ({
                                        ...prev,
                                        [p.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 pr-9 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  />
                                  <button
                                    type="button"
                                    aria-label={
                                      showRowKey[p.id]
                                        ? `Hide API key for ${p.name}`
                                        : `Show API key for ${p.name}`
                                    }
                                    onClick={() =>
                                      setShowRowKey((prev) => ({
                                        ...prev,
                                        [p.id]: !prev[p.id],
                                      }))
                                    }
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                                  >
                                    {showRowKey[p.id] ? (
                                      <EyeOff className="size-3.5" />
                                    ) : (
                                      <Eye className="size-3.5" />
                                    )}
                                  </button>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!singleKeyDrafts[p.id]?.trim() || saving}
                                  onClick={() => void handleSaveRowSingleKey(p)}
                                >
                                  Save Key
                                </Button>
                              </div>

                              {p.hasKey && p.credentialSource !== 'environment' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDialog('confirm-clear-key', p.id)}
                                  className="text-error-700 border-error-100 hover:bg-error-50"
                                >
                                  <Trash2 className="size-3.5 mr-1.5" />
                                  Remove Stored Key
                                </Button>
                              )}

                              <div className="pt-2 space-y-1.5">
                                <label
                                  htmlFor={`row-pool-input-${p.id}`}
                                  className="block text-xs font-semibold text-ink"
                                >
                                  Multi-Key Rotation Pool (one key per line or comma-separated)
                                </label>
                                <textarea
                                  id={`row-pool-input-${p.id}`}
                                  rows={2}
                                  spellCheck={false}
                                  placeholder="Enter multiple keys for automatic 429 rotation..."
                                  value={poolKeyDrafts[p.id] || ''}
                                  onChange={(e) =>
                                    setPoolKeyDrafts((prev) => ({
                                      ...prev,
                                      [p.id]: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-ink-muted">
                                    {poolDraftCount > 0
                                      ? `${poolDraftCount} key(s) staged for server vault`
                                      : 'Keys are never echoed in plaintext after save.'}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={poolDraftCount === 0 || saving}
                                    onClick={() => void handleSaveRowPool(p)}
                                  >
                                    Save Key Pool
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Routing, Model & Custom Endpoint Column */}
                        <div className="space-y-3 min-w-0">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                            Model &amp; Endpoint Override
                          </h3>

                          <div>
                            <label
                              htmlFor={`row-model-input-${p.id}`}
                              className="block text-xs font-semibold text-ink mb-1"
                            >
                              Default Model Target
                            </label>
                            <Input
                              id={`row-model-input-${p.id}`}
                              value={modelDrafts[p.id] ?? p.defaultModel ?? ''}
                              onChange={(e) =>
                                setModelDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder={p.defaultModel || 'auto'}
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`row-baseurl-input-${p.id}`}
                              className="block text-xs font-semibold text-ink mb-1"
                            >
                              Custom Endpoint Base URL (optional)
                            </label>
                            <Input
                              id={`row-baseurl-input-${p.id}`}
                              value={baseUrlDrafts[p.id] ?? ''}
                              onChange={(e) =>
                                setBaseUrlDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder={p.baseUrl || 'https://api.example.com/v1'}
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              disabled={saving}
                              onClick={() => void handleSaveRowConfig(p)}
                            >
                              Save Provider Config
                            </Button>
                            {p.group !== 'search' && !isPrimary && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                onClick={() => void handleSetPrimaryImmediate(p)}
                              >
                                Set as Primary
                              </Button>
                            )}
                            {p.docUrl && (
                              <a
                                href={p.docUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline ml-auto"
                              >
                                Provider Docs
                                <ExternalLink className="size-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── VIEW 2: Key Pool Subtab (?subtab=key-pool) ─── */}
      {activeSubtab === 'key-pool' && (
        <Card className="border-border bg-surface">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Layers className="size-4 text-brand-600" />
                  Key Pool Manager
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Round-robin credential pools with automatic 429 cooldown isolation per key.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  resetModalDrafts();
                  setModalTab('pool');
                  openDialog('configure-provider');
                }}
              >
                <Plus className="size-3.5 mr-1" />
                Add Rotation Pool
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {providers.filter((p) => p.hasKey && !p.keyless).length === 0 ? (
                <p className="text-xs text-ink-muted py-4 col-span-2">
                  No credential pools configured yet. Click &ldquo;Add Rotation Pool&rdquo; to add keys.
                </p>
              ) : (
                providers
                  .filter((p) => p.hasKey && !p.keyless)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-border bg-canvas p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-ink">{p.name}</div>
                        <div className="text-[11px] font-mono text-ink-secondary mt-0.5">
                          {maskedKeys[p.id] || '••••••••'} ({p.keysCount} key
                          {p.keysCount === 1 ? '' : 's'})
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setExpandedRowId(p.id);
                          selectSubtab('providers');
                        }}
                      >
                        Edit Pool
                      </Button>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── VIEW 3: Models & Discovery (?subtab=discovery | ?subtab=models) ─── */}
      {isDiscoveryOrModelsView && (
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
                                'rounded-md px-2 py-0.5 text-[11px] font-semibold',
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
                          <div className="text-[11px] text-ink-muted">{m.providerId}</div>
                        </div>
                        <span className="text-[11px] font-semibold text-ink-secondary shrink-0">
                          {m.catalogStatus || 'cached'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── VIEW 4: Quotas & Telemetry (?subtab=metrics | ?subtab=quotas) (Simplification #7) ─── */}
      {isMetricsOrQuotasView && (
        <div className="space-y-4 min-w-0">
          <Card className="border-border bg-surface">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Activity className="size-4 text-brand-600" />
                    Engine Metrics
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Live provider router inventory and durable SQLite execution counters.
                  </p>
                </div>
                <span className="text-xs text-ink-muted">
                  {engineStatus?.version || 'in-process router'}
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-canvas p-3.5">
                  <div className="text-xs font-medium text-ink-muted">Total Providers</div>
                  <div className="text-xl font-extrabold text-ink mt-1">{providers.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-canvas p-3.5">
                  <div className="text-xs font-medium text-ink-muted">Configured</div>
                  <div className="text-xl font-extrabold text-ink mt-1">{configuredCount}</div>
                </div>
                <div className="rounded-xl border border-border bg-canvas p-3.5">
                  <div className="text-xs font-medium text-ink-muted">Multi-Key Pools</div>
                  <div className="text-xl font-extrabold text-ink mt-1">
                    {providers.filter((p) => p.keysCount > 1).length}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-canvas p-3.5">
                  <div className="text-xs font-medium text-ink-muted">Active Cooldowns</div>
                  <div className="text-xl font-extrabold text-ink mt-1">
                    {Object.keys(cooldowns).length}
                  </div>
                </div>
              </div>

              {engineMetrics?.summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border">
                  <div className="rounded-xl border border-border bg-canvas p-3">
                    <div className="text-xs text-ink-muted">Router Requests</div>
                    <div className="text-base font-bold text-ink mt-0.5">
                      {engineMetrics.summary.totalRequests ?? 0}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-canvas p-3">
                    <div className="text-xs text-ink-muted">Total Tokens</div>
                    <div className="text-base font-bold text-ink mt-0.5">
                      {(engineMetrics.summary.totalTokens ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-canvas p-3">
                    <div className="text-xs text-ink-muted">Avg Latency</div>
                    <div className="text-base font-bold text-ink mt-0.5">
                      {engineMetrics.summary.avgLatencyMs
                        ? `${Math.round(engineMetrics.summary.avgLatencyMs)}ms`
                        : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-canvas p-3">
                    <div className="text-xs text-ink-muted">Upstream Errors</div>
                    <div className="text-base font-bold text-ink mt-0.5">
                      {engineMetrics.summary.errorCount ?? 0}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {renderQuotaGovernancePanel()}
        </div>
      )}

      {/* ─── VIEW 5: Unified Gateway & Claude Code (?subtab=unified-gateway | ?subtab=claude) (Simplification #8) ─── */}
      {isGatewayOrClaudeView && (
        <Card className="border-border bg-surface">
          <CardContent className="p-5 space-y-5">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Globe className="size-4 text-brand-600" />
                Unified Gateway
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                OpenAI- and Anthropic-compatible endpoints served from{' '}
                <code className="font-mono text-ink">{gatewayOrigin}</code> using your authenticated
                Bearer token (never static embedded secrets).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { title: 'OpenAI Chat', path: '/v1/chat/completions' },
                { title: 'Anthropic Messages', path: '/v1/messages' },
                { title: 'Model Catalog', path: '/v1/models' },
                { title: 'Engine Status', path: '/v1/status' },
              ].map((ep) => (
                <div key={ep.path} className="rounded-xl border border-border bg-canvas p-3.5">
                  <div className="text-xs font-bold text-ink">{ep.title}</div>
                  <div className="text-[11px] font-mono text-ink-secondary mt-1 break-all">
                    {ep.path}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'curl', label: 'cURL' },
                      { id: 'claude', label: 'Claude Code CLI' },
                      { id: 'typescript', label: 'TypeScript' },
                      { id: 'python', label: 'Python' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSnippetLang(item.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer',
                        snippetLang === item.id
                          ? 'bg-brand-600 text-white'
                          : 'bg-canvas text-ink-secondary border border-border'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(snippetCode, 'gateway-snippet')}
                >
                  {copiedId === 'gateway-snippet' ? (
                    <Check className="size-3.5 mr-1.5 text-success-700" />
                  ) : (
                    <Copy className="size-3.5 mr-1.5" />
                  )}
                  {copiedId === 'gateway-snippet' ? 'Copied' : 'Copy Snippet'}
                </Button>
              </div>

              <pre
                tabIndex={0}
                role="region"
                aria-label="Gateway integration code snippet"
                className="rounded-xl border border-border bg-canvas p-4 text-xs font-mono text-ink overflow-x-auto focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <code>{snippetCode}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── VIEW 6: Interactive Playground (?subtab=playground) ─── */}
      {activeSubtab === 'playground' && (
        <Card className="border-border bg-surface">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Terminal className="size-4 text-brand-600" />
                  Live Router Playground
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Execute an authenticated test completion against `/api/v1/chat/completions`.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="playground-model-select" className="text-xs font-semibold text-ink">
                  Model
                </label>
                <select
                  id="playground-model-select"
                  value={playgroundModel}
                  onChange={(e) => setPlaygroundModel(e.target.value)}
                  className="rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  <option value="auto">auto (Live Router Policy)</option>
                  {discoveredModels.map((m) => (
                    <option key={`${m.providerId}:${m.id}`} value={m.id}>
                      {m.providerId}: {m.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="playground-prompt-input" className="block text-xs font-semibold text-ink mb-1">
                Prompt
              </label>
              <textarea
                id="playground-prompt-input"
                rows={3}
                value={playgroundPrompt}
                onChange={(e) => setPlaygroundPrompt(e.target.value)}
                className="w-full rounded-xl border border-border bg-canvas p-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-muted">{playgroundMeta}</span>
              <Button
                type="button"
                onClick={() => void handleRunPlayground()}
                disabled={playgroundRunning || !playgroundPrompt.trim()}
              >
                {playgroundRunning ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="size-3.5 mr-1.5" />
                )}
                {playgroundRunning ? 'Running...' : 'Execute Inference'}
              </Button>
            </div>

            {playgroundOutput && (
              <pre className="rounded-xl border border-border bg-canvas p-4 text-xs font-mono text-ink whitespace-pre-wrap break-words">
                {playgroundOutput}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
       *  Simplification #3: Shared Radix Dialogs (@/components/ui/dialog)
       *  Focus trap, Escape, Backdrop click, Scroll lock, Focus return, URL sync
       * ═══════════════════════════════════════════════════════════════════════ */}

      {/* 1. Configure Provider Dialog */}
      <Dialog
        open={activeDialog === 'configure-provider'}
        onOpenChange={(open) => {
          if (!open) {
            resetModalDrafts();
            closeDialog();
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Provider</DialogTitle>
            <DialogDescription>
              {providers.length} platforms supported. Keys are write-only, encrypted at rest, and
              never returned in plaintext after save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 min-w-0">
            {/* Mode Switcher */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'single', label: 'Provider key' },
                  { id: 'pool', label: 'Multi-key pool' },
                  { id: 'endpoint', label: 'Custom endpoint' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setModalTab(t.id);
                    setModalTestStatus(null);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer',
                    modalTab === t.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-canvas text-ink-secondary border border-border'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Platform Selector (Available across ALL 3 modal tabs — fixes DEF-09) */}
            <div className="space-y-1.5 relative">
              <span className="block text-xs font-semibold text-ink">Target Platform</span>
              <button
                type="button"
                data-testid="platform-selector"
                aria-expanded={platformDropdownOpen}
                onClick={() => setPlatformDropdownOpen((v) => !v)}
                className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-left text-xs font-semibold text-ink flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="truncate">
                  {modalSelectedPlatform
                    ? `${modalSelectedPlatform.name} (${modalSelectedPlatform.id})`
                    : `Select from ${providers.length} platforms...`}
                </span>
                <ChevronDown className="size-4 text-ink-muted shrink-0" />
              </button>

              {platformDropdownOpen && (
                <div className="rounded-xl border border-border bg-surface shadow-lg p-2 space-y-2 max-h-56 overflow-y-auto z-10">
                  <input
                    type="search"
                    aria-label={`Search ${providers.length} platforms`}
                    placeholder={`Search ${providers.length} platforms...`}
                    value={modalPlatformQuery}
                    onChange={(e) => setModalPlatformQuery(e.target.value)}
                    className="w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-xs text-ink"
                  />
                  <div className="space-y-0.5">
                    {modalFilteredPlatforms.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        data-testid={`platform-option-${p.id}`}
                        onClick={() => {
                          setModalSelectedId(p.id);
                          setPlatformDropdownOpen(false);
                          setModalError(null);
                          setModalTestStatus(null);
                        }}
                        className={cn(
                          'w-full rounded-lg px-2.5 py-1.5 text-left text-xs flex items-center justify-between gap-2 cursor-pointer',
                          modalSelectedId === p.id
                            ? 'bg-brand-50 text-brand-700 font-bold'
                            : 'text-ink hover:bg-canvas'
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-[11px] text-ink-muted shrink-0">
                          {p.keyless ? 'keyless' : p.hasKey ? 'configured' : p.id}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {modalTab === 'single' && (
              <div className="space-y-1.5">
                <label htmlFor="modal-api-key-input" className="block text-xs font-semibold text-ink">
                  API Key {modalSelectedPlatform?.keyless ? '(Optional for keyless provider)' : ''}
                </label>
                <div className="relative">
                  <input
                    ref={modalKeyInputRef}
                    id="modal-api-key-input"
                    type={modalShowKey ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={
                      modalSelectedPlatform?.keyless
                        ? 'Keyless local/public endpoint — no key required'
                        : 'Paste provider API key...'
                    }
                    value={modalApiKey}
                    onChange={(e) => setModalApiKey(e.target.value)}
                    className="w-full rounded-xl border border-border bg-canvas px-3 py-2 pr-9 text-xs font-mono text-ink"
                  />
                  <button
                    type="button"
                    aria-label={modalShowKey ? 'Hide API key' : 'Show API key'}
                    onClick={() => setModalShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                  >
                    {modalShowKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {modalTab === 'pool' && (
              <div className="space-y-1.5">
                <label htmlFor="modal-pool-textarea" className="block text-xs font-semibold text-ink">
                  API Key Pool (one key per line)
                </label>
                <textarea
                  id="modal-pool-textarea"
                  rows={4}
                  spellCheck={false}
                  placeholder="Paste one API key per line..."
                  value={modalPoolText}
                  onChange={(e) => setModalPoolText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-canvas p-2.5 text-xs font-mono text-ink"
                />
                <p className="text-[11px] text-ink-muted">
                  {splitKeys(modalPoolText).length} key(s) ready for server vault.
                </p>
              </div>
            )}

            {modalTab === 'endpoint' && (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="modal-custom-endpoint"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Base URL Override
                  </label>
                  <Input
                    id="modal-custom-endpoint"
                    placeholder="https://my-openai-gateway.com/v1"
                    value={modalCustomBaseUrl}
                    onChange={(e) => setModalCustomBaseUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="modal-custom-model"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Default Model Target (optional)
                  </label>
                  <Input
                    id="modal-custom-model"
                    placeholder="e.g. llama-3.3-70b-instruct"
                    value={modalCustomModel}
                    onChange={(e) => setModalCustomModel(e.target.value)}
                  />
                </div>
              </div>
            )}

            {modalError && (
              <div
                role="alert"
                className="rounded-xl border border-error-100 bg-error-50 p-2.5 text-xs font-semibold text-error-700"
              >
                {modalError}
              </div>
            )}

            {modalTestStatus && (
              <div
                role={modalTestStatus.ok ? 'status' : 'alert'}
                className={cn(
                  'rounded-xl border p-2.5 text-xs font-semibold',
                  modalTestStatus.ok
                    ? 'border-success-100 bg-success-50 text-success-700'
                    : 'border-error-100 bg-error-50 text-error-700'
                )}
              >
                {modalTestStatus.msg}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2 flex-wrap sm:flex-nowrap">
            {modalSelectedPlatform && (modalSelectedPlatform.hasKey || modalSelectedPlatform.keyless) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={async () => {
                  if (modalSelectedPlatform) {
                    await handleToggleProvider(modalSelectedPlatform, !modalSelectedPlatform.enabled);
                    closeDialog();
                  }
                }}
                className={cn(
                  'cursor-pointer',
                  modalSelectedPlatform.enabled
                    ? 'text-warning-700 border-warning-200 hover:bg-warning-50'
                    : 'text-brand-700 border-brand-200 hover:bg-brand-50'
                )}
              >
                {modalSelectedPlatform.enabled ? 'Deactivate Provider' : 'Activate Provider'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canProbeInModal || modalTesting}
              onClick={() => void handleModalProbeBeforeSave()}
            >
              {modalTesting ? 'Testing...' : 'Test Key Before Saving'}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void handleModalSaveAndActivate()}
            >
              {saving ? 'Saving...' : 'Add key & Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Key Pool Manager Dialog */}
      <Dialog open={activeDialog === 'key-pool'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Key Pool Manager</DialogTitle>
            <DialogDescription>
              Configured server key pools across all {providers.length} providers. Secrets are
              masked to last-4 characters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {providers.filter((p) => p.hasKey && !p.keyless).length === 0 ? (
              <p className="text-xs text-ink-muted py-3">
                No multi-key pools configured on server yet.
              </p>
            ) : (
              providers
                .filter((p) => p.hasKey && !p.keyless)
                .map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-border bg-canvas px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-ink">{p.name}</div>
                      <div className="font-mono text-ink-secondary">
                        {maskedKeys[p.id] || '••••••••'} · {p.keysCount} key(s)
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        closeDialog();
                        setExpandedRowId(p.id);
                        selectSubtab('providers');
                      }}
                    >
                      Manage
                    </Button>
                  </div>
                ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={closeDialog}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Cooldowns & Rate Limits Dialog */}
      <Dialog open={activeDialog === 'cooldowns'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cooldowns &amp; Rate-Limit Ledger</DialogTitle>
            <DialogDescription>
              Providers temporarily benched due to upstream 429 Retry-After or 5xx responses expire
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.keys(cooldowns).length === 0 ? (
              <p className="text-xs text-ink-secondary py-3 flex items-center gap-2">
                <ShieldCheck className="size-4 text-success-700" />
                No active platform cooldowns. All enabled providers are eligible for routing.
              </p>
            ) : (
              Object.entries(cooldowns).map(([id, state]) => (
                <div
                  key={id}
                  className="rounded-xl border border-warning-100 bg-warning-50 p-3 text-xs flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-ink">{id}</span>
                    <span className="text-ink-secondary ml-2">{state.reason || 'Rate limit'}</span>
                  </div>
                  <span className="font-mono font-bold text-warning-700 flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {state.remainingSeconds}s
                  </span>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadSettings()}>
              Refresh Cooldowns
            </Button>
            <Button type="button" size="sm" onClick={closeDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Model Discovery Dialog */}
      <Dialog open={activeDialog === 'discovery'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Model Discovery</DialogTitle>
            <DialogDescription>
              Refresh live models directly from an upstream provider endpoint.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="dialog-discovery-provider"
                className="block text-xs font-semibold text-ink mb-1"
              >
                Provider
              </label>
              <select
                id="dialog-discovery-provider"
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
              size="sm"
              disabled={!discoveryProvider || discoveryLoading}
              onClick={() => void handleDiscoveryFetch(discoveryProvider)}
            >
              {discoveryLoading ? 'Fetching...' : 'Fetch Live Models'}
            </Button>
            {discoveryError && (
              <p role="alert" className="text-xs font-semibold text-error-700">
                {discoveryError}
              </p>
            )}
            {discoveryModels.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 border-t border-border pt-2">
                {discoveryModels.map((m) => (
                  <div
                    key={`dlg-${m.providerId}-${m.id}`}
                    className="text-xs font-mono text-ink flex items-center justify-between py-1"
                  >
                    <span className="truncate">{m.id}</span>
                    <span className="text-ink-muted ml-2 shrink-0">
                      {m.catalogStatus || 'fresh'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={closeDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Integration Snippets Dialog */}
      <Dialog open={activeDialog === 'snippets'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Integration Snippets</DialogTitle>
            <DialogDescription>
              Connect internal services or CLI agents to <code className="font-mono">{gatewayOrigin}</code>.
              Credentials are never embedded in code examples.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'curl', label: 'cURL' },
                  { id: 'typescript', label: 'JavaScript / TS' },
                  { id: 'python', label: 'Python' },
                  { id: 'claude', label: 'Claude Code' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSnippetLang(item.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer',
                    snippetLang === item.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-canvas text-ink-secondary border border-border'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <pre
              tabIndex={0}
              role="region"
              aria-label="Dialog integration code snippet"
              className="rounded-xl border border-border bg-canvas p-3 text-xs font-mono text-ink overflow-x-auto focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <code>{snippetCode}</code>
            </pre>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCopy(snippetCode, 'dialog-snippet')}
            >
              <Code2 className="size-3.5 mr-1.5" />
              {copiedId === 'dialog-snippet' ? 'Copied' : 'Copy Code'}
            </Button>
            <Button type="button" size="sm" onClick={closeDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Confirm Clear Stored Provider Key Dialog */}
      <Dialog
        open={activeDialog === 'confirm-clear-key'}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Stored API Key</DialogTitle>
            <DialogDescription>
              Permanently delete the server-stored API key for{' '}
              <strong className="text-ink">{dialogTarget}</strong> from MariaDB? Any active requests
              will fail over to secondary providers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleConfirmClearKey()}
              className="bg-error-600 hover:bg-error-700 text-white"
            >
              Remove Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Confirm Per-User Quota Reset Dialog */}
      <Dialog
        open={activeDialog === 'confirm-reset-user-quota'}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset User Daily AI Quota</DialogTitle>
            <DialogDescription>
              Clear today&apos;s AI usage count for user <span className="font-mono">{dialogTarget}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={quotaSaving}
              onClick={() => void handleConfirmQuotaReset(false)}
            >
              Confirm Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. Confirm Global Quota Reset Dialog */}
      <Dialog
        open={activeDialog === 'confirm-reset-all-quotas'}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset All Daily AI Quotas</DialogTitle>
            <DialogDescription>
              Clear daily AI usage counters for every user across the platform? This operation is
              audited in MariaDB.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={quotaSaving}
              onClick={() => void handleConfirmQuotaReset(true)}
              className="bg-error-600 hover:bg-error-700 text-white"
            >
              Reset All Counters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminAiSettingsTab;
