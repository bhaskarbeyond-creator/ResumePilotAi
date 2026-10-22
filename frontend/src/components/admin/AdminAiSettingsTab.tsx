/**
 * FreeLLMAPI Unified AI Multi-Provider Engine & Governance Panel
 *
 * Full 100% reproduction of FreeLLMAPI 0.16.6 UI/UX:
 * - Tab 1 ("Keys"):
 *   - 74 provider catalog with live search, status pills (All/Healthy/Issues/Disabled),
 *     sub-pills (Providers/Quota signals/Unified API key/Anthropic/Agents),
 *     batch health checking, config export, and direct inline key editing.
 *   - Add Key Dialog matching FreeLLMAPI 0.16.6:
 *     - Pane 1: "Provider key" with searchable combobox over all 74 providers (grouped by
 *       Web Search vs Models, with hint badges and "Hide added providers" toggle).
 *     - Pane 2: "Import file" (.env / .json / raw keys).
 *     - Pane 3: "Custom endpoint" (custom OpenAI-compatible gateway + base URL).
 *     - Non-blocking save: saves credential immediately to server, updates state, and runs test.
 * - Tab 2 ("Models & Fallback Chains"):
 *   - Named chains (auto:default, auto:free-claude-code), context chips (Any, 32K+, 128K+, 1M+),
 *     Vision/Tools filters, multi-metric model table with colored progress bars for
 *     Reliability (green), Speed (blue), and Intelligence (purple), guardrails, composite score.
 * - Tab 3 ("Claude Code & Agents"):
 *   - Live wire setup for Claude Code CLI and Anthropic SDK via reverse proxy.
 * - Tab 4 ("Playground"):
 *   - Live prompt tester against any registered provider or fallback chain.
 *
 * INVARIANTS PRESERVED:
 * 1. ZERO PLAINTEXT SECRET LEAKAGE: Masked keys displayed, credentials stored server-side.
 * 2. POST-SAVE MASKING: Input cleared after save, displays "✓ Active on server".
 * 3. DYNAMIC MODEL IDS: Supports curated models AND arbitrary custom model IDs.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { get, post, normalizeError } from '@/lib/api-client';
import type { ProviderCatalogEntry } from './freellmapi-catalog';
import {
  Brain,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  Shield,
  Zap,
  Sliders,
  Check,
  Eye,
  EyeOff,
  Play,
  Sparkles,
  Search,
  Download,
  Plus,
  X,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Layers,
  Terminal,
  Copy,
  Info,
  Radio,
  Clock,
  Filter,
  CheckCheck,
  Upload,
  FileText,
  Activity,
} from 'lucide-react';

/**
 * Provider tiers used by the Keys screen category tabs.
 *
 * FRONTIER — paid-adjacent free tiers with flagship intelligence (Llama 3.3 70B,
 *            Gemini 2.0 Flash, Mistral Large, DeepSeek V3, GPT-4o-mini …).
 * MESH     — community/aggregator gateways with generous free quotas.
 * SEARCH   — agent web-search & extraction tools (never chat candidates).
 */
const FRONTIER_PROVIDER_IDS = new Set<string>([
  'groq', 'cerebras', 'gemini', 'mistral', 'nvidia', 'openrouter', 'deepseek',
  'openai', 'cloudflare', 'cohere', 'siliconflow', 'modelscope', 'huggingface',
]);

function isSearchProvider(provider: Pick<ProviderCatalogEntry, 'group' | 'type'>): boolean {
  return provider.group === 'search' || provider.type === 'search' || provider.type === 'media';
}

type ProviderTier = 'all' | 'frontier' | 'mesh' | 'search';

/**
 * Split a pasted credential blob into a de-duplicated key pool.
 * FreeLLMAPI accepts comma- or newline-delimited multi-key pools and
 * rotates them round-robin, benching only the key that is throttled.
 */
function splitKeyPool(value: string): string[] {
  const seen = new Set<string>();
  return String(value || '')
    .split(/[\n,]+/)
    .map((key) => key.trim())
    .filter((key) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export interface ProviderItem extends ProviderCatalogEntry {}

export interface FallbackChain {
  id: string;
  name: string;
  alias: string;
  isDefault?: boolean;
  isCurated?: boolean;
  isActive: boolean;
  modelsCount: number;
}

/** Valid deep-link subtabs for the AI Multi-Provider Engine surface. */
const AI_ENGINE_SUBTABS = ['providers', 'key-pool', 'metrics', 'unified-gateway', 'discovery'] as const;
type AiEngineSubtab = (typeof AI_ENGINE_SUBTABS)[number];

export interface CatalogModel {
  id: string; name?: string; providerId: string;
  contextWindow?: number; capabilities?: { vision?: boolean; tools?: boolean; json?: boolean };
  catalogStatus?: string; lastSuccessfulRefresh?: number;
}

export function AdminAiSettingsTab() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'keys' | 'models' | 'claude' | 'playground'>('keys');

  // Deep link / URL state: subtab under ai-settings.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSubtab = searchParams.get('subtab');
  const subtab: AiEngineSubtab = (AI_ENGINE_SUBTABS as readonly string[]).includes(rawSubtab || '')
    ? (rawSubtab as AiEngineSubtab)
    : 'providers';

  // Filter deep-links: ?provider=<id> & ?category=<fast|frontier|mesh|search>
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'' | 'fast' | 'frontier' | 'mesh' | 'search'>('');

  // Sync filter state from URL query params on mount
  useEffect(() => {
    const rawProvider = searchParams.get('provider');
    const rawCategory = searchParams.get('category');
    if (rawProvider) setProviderFilter(rawProvider);
    if (['fast', 'frontier', 'mesh', 'search'].includes(rawCategory || '')) {
      setCategoryFilter(rawCategory as '' | 'fast' | 'frontier' | 'mesh' | 'search');
    }
  }, [searchParams]);

  // Sync filter query params when state changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (providerFilter) {
      params.set('provider', providerFilter);
    } else {
      params.delete('provider');
    }
    if (categoryFilter) {
      params.set('category', categoryFilter);
    } else {
      params.delete('category');
    }
    if (JSON.stringify(params) !== JSON.stringify(searchParams)) {
      setSearchParams(params, { replace: false });
    }
  }, [providerFilter, categoryFilter, searchParams, setSearchParams]);

  // Provider catalog is loaded from the authoritative server registry.
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [subPill, setSubPill] = useState<'providers' | 'quota' | 'unified' | 'anthropic' | 'agents'>('providers');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'issues' | 'disabled'>('all');
  const [tierFilter, setTierFilter] = useState<ProviderTier>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, { remainingSeconds: number; reason: string }>>({});
  const [keyPoolDrafts, setKeyPoolDrafts] = useState<Record<string, string>>({});
  const modalRef = useRef<HTMLDivElement>(null);

  // Global settings
  const [primaryProvider, setPrimaryProvider] = useState('nvidia');
  const [selectionMode, setSelectionMode] = useState('balanced');
  const [manualModel, setManualModel] = useState('');
  const [enableFallback, setEnableFallback] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [revision, setRevision] = useState(0);

  // Fallback chains & models state
  const [chains, setChains] = useState<FallbackChain[]>([
    { id: 'default', name: 'Default', alias: 'auto:default', isDefault: true, isActive: true, modelsCount: 22 },
    { id: 'free-claude-code', name: 'free-claude-code', alias: 'auto:free-claude-code', isCurated: true, isActive: true, modelsCount: 22 },
  ]);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [filterVision, setFilterVision] = useState(false);
  const [filterTools, setFilterTools] = useState(false);
  const [contextFilter, setContextFilter] = useState<'any' | '32k' | '128k' | '1m'>('any');

  // Secret management & testing
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [showSecretField, setShowSecretField] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  // Add Key Modal state
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false);
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [modalPlatformSearch, setModalPlatformSearch] = useState('');
  const [modalCategoryFilter, setModalCategoryFilter] = useState<'all' | 'models' | 'search'>('all');
  const [modalSelectedPlatform, setModalSelectedPlatform] = useState<ProviderItem | null>(null);
  const [modalHideAdded, setModalHideAdded] = useState(false);
  const [modalApiKey, setModalApiKey] = useState('');
  const [modalAccountId, setModalAccountId] = useState('');
  const [modalSeveral, setModalSeveral] = useState(false);
  const [modalTab, setModalTab] = useState<'key' | 'import' | 'endpoint'>('key');
  const [modalCustomEndpoint, setModalCustomEndpoint] = useState('');
  const [modalCustomModel, setModalCustomModel] = useState('');
  const [modalImportRaw, setModalImportRaw] = useState('');
  const [modalTesting, setModalTesting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalShowKey, setModalShowKey] = useState(false);

  // Section 5: Additional modal states (Key Pool Manager, Cooldown Flush,
  // Model Discovery, Code Snippets).
  const [isKeyPoolOpen, setIsKeyPoolOpen] = useState(false);
  const [isCooldownOpen, setIsCooldownOpen] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isCodeSnippetsOpen, setIsCodeSnippetsOpen] = useState(false);

  const keyPoolRef = useRef<HTMLDivElement>(null);
  const cooldownRef = useRef<HTMLDivElement>(null);
  const discoveryRef = useRef<HTMLDivElement>(null);
  const codeSnippetsRef = useRef<HTMLDivElement>(null);

  // Discovery tab state (Section 5 / DIR-013 Section 5 item 4)
  const [discoveryResults, setDiscoveryResults] = useState<Record<string, any>>({});
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  // Operations state
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingClearProvider, setPendingClearProvider] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Modal state (Section 5 / DIR-013 Section 5 items 1-5)
  const [cooldownFocus, setCooldownFocus] = useState<string | null>(null);

  // Playground state
  const [playgroundPrompt, setPlaygroundPrompt] = useState('Explain the difference between a process and a thread in 2 sentences.');
  const [playgroundModel, setPlaygroundModel] = useState('auto');
  const [playgroundOutput, setPlaygroundOutput] = useState('');
  const [playgroundLoading, setPlaygroundLoading] = useState(false);

  // Combobox click-outside ref
  const comboboxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsComboboxOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reusable WCAG 2.1 AA modal focus trap hook (Section 5 / DIR-013)
  // Used by all 5 modals: Add Key, Key Pool Manager, Cooldown Flush,
  // Model Discovery, Code Snippets.
  const useModalFocus = (isOpen: boolean, modalRef: React.RefObject<HTMLDivElement>, setOpen: (open: boolean) => void) => {
    useEffect(() => {
      if (!isOpen) return;
      const node = modalRef.current;
      const focusables = () => Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      const initial = focusables()[0];
      initial?.focus();

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const list = focusables();
        if (list.length === 0) return;
        const firstEl = list[0];
        const lastEl = list[list.length - 1];
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }

      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, modalRef, setOpen]);
  };

  // Apply focus trap to all modals
  useModalFocus(isAddKeyOpen, modalRef, setIsAddKeyOpen);
  useModalFocus(isKeyPoolOpen, keyPoolRef, setIsKeyPoolOpen);
  useModalFocus(isCooldownOpen, cooldownRef, setIsCooldownOpen);
  useModalFocus(isDiscoveryOpen, discoveryRef, setIsDiscoveryOpen);
  useModalFocus(isCodeSnippetsOpen, codeSnippetsRef, setIsCodeSnippetsOpen);

  // Load configuration on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    setLoading(true);
    setSettingsError(null);
    get<{
      settings?: Record<string, any>;
      revision?: number;
      catalog?: ProviderItem[];
      fallbackChains?: FallbackChain[];
      discoveredModels?: CatalogModel[];
      configuredProviders?: Record<string, boolean>;
      maskedKeys?: Record<string, string>;
      cooldowns?: Record<string, { remainingSeconds: number; reason: string }>;
    }>('/admin/ai-settings')
      .then((res) => {
        if (res.revision) setRevision(res.revision);
        setCooldowns(res.cooldowns || {});
        if (res.fallbackChains && Array.isArray(res.fallbackChains)) {
          setChains(res.fallbackChains);
        }
        setCatalogModels(res.discoveredModels || []);
        if (res.settings) {
          const cfg = res.settings;
          setPrimaryProvider(cfg.provider || 'nvidia');
          setSelectionMode(cfg.selectionMode || 'balanced');
          setEnableFallback(cfg.enableFallback !== false);
          if (cfg.temperature !== undefined) setTemperature(Number(cfg.temperature));
          if (cfg.maxTokens !== undefined) setMaxTokens(Number(cfg.maxTokens));
        }

        setManualModel(res.catalog?.find(p => p.id === res.settings?.provider)?.defaultModel || '');
        // Server registry is authoritative; new providers require no frontend release.
        setProviders((res.catalog || []).map((p) => ({
          ...p,
          configuredOnServer: Boolean(p.configuredOnServer),
          keysCount: p.keyless ? 0 : (p.keysCount || 0),
          enabled: p.configuredOnServer,
          status: res.cooldowns?.[p.id] ? 'issues' : p.configuredOnServer ? 'unverified' : 'disabled',
        })));

      })
      .catch((err) => {
        setSettingsError(normalizeError(err).message);
      })
      .finally(() => setLoading(false));
  };

  // Filtered providers for Keys Screen
  const filteredProviders = useMemo(() => {
    return providers.filter((p) => {
      // Sub-pill filter
      if (subPill === 'providers' && p.group !== 'models' && p.group !== 'search') return false;

      // Provider tier filter (Frontier / Community Mesh / Agent Search)
      if (tierFilter === 'frontier' && !FRONTIER_PROVIDER_IDS.has(p.id)) return false;
      if (tierFilter === 'mesh' && (isSearchProvider(p) || FRONTIER_PROVIDER_IDS.has(p.id))) return false;
      if (tierFilter === 'search' && !isSearchProvider(p)) return false;

      // Filter deep-link: ?category=fast|frontier|mesh|search (DIR-013 Section 4)
      if (categoryFilter === 'fast' || categoryFilter === 'frontier') {
        if (!FRONTIER_PROVIDER_IDS.has(p.id)) return false;
      }
      if (categoryFilter === 'mesh') {
        if (isSearchProvider(p) || FRONTIER_PROVIDER_IDS.has(p.id)) return false;
      }
      if (categoryFilter === 'search') {
        if (!isSearchProvider(p)) return false;
      }

      // Status filter
      if (statusFilter === 'healthy' && p.status !== 'healthy') return false;
      if (statusFilter === 'issues' && p.status !== 'issues') return false;
      if (statusFilter === 'disabled' && p.status !== 'disabled') return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          p.label.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.defaultModel && p.defaultModel.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [providers, statusFilter, searchQuery, subPill, tierFilter]);

  // Providers list for Add Key Modal Combobox
  const filteredModalPlatforms = useMemo(() => {
    return providers.filter((p) => {
      // Category filter
      if (modalCategoryFilter === 'models' && p.group !== 'models') return false;
      if (modalCategoryFilter === 'search' && p.group !== 'search') return false;

      // Hide added filter
      if (modalHideAdded && (p.configuredOnServer || p.hasKey)) return false;

      // Search query
      if (modalPlatformSearch.trim()) {
        const q = modalPlatformSearch.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          p.label.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.hint && p.hint.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [providers, modalCategoryFilter, modalHideAdded, modalPlatformSearch]);

  // Statistics
  const configuredCount = useMemo(() => {
    return providers.filter((p) => p.configuredOnServer).length;
  }, [providers]);

  const healthyCount = useMemo(() => {
    return providers.filter((p) => testStatus[p.id]?.ok === true && !cooldowns[p.id]).length;
  }, [providers, testStatus, cooldowns]);

  const totalKeysCount = useMemo(() => {
    return providers.reduce((acc, p) => acc + (p.keyless ? 0 : p.keysCount || 0), 0);
  }, [providers]);

  const tierCounts = useMemo(() => {
    const frontier = providers.filter((p) => FRONTIER_PROVIDER_IDS.has(p.id)).length;
    const search = providers.filter((p) => isSearchProvider(p)).length;
    const mesh = providers.length - frontier - search;
    return { all: providers.length, frontier, mesh, search };
  }, [providers]);

  /**
   * The four operational states mandated by the FreeLLMAPI parity audit.
   * Exact strings are part of the UI contract (Playwright asserts them).
   */
  const providerStatePill = (p: ProviderItem) => {
    const cooling = cooldowns[p.id];
    if (cooling) {
      return {
        label: '⊘ Rate-Limited Cooldown',
        tone: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
        detail: `${cooling.remainingSeconds}s · ${cooling.reason}`,
        state: 'cooldown',
      };
    }
    const check = testStatus[p.id];
    if (check?.ok) {
      return {
        label: '● Inference Verified',
        tone: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        detail: check.latencyMs ? `${check.latencyMs}ms` : 'Inference succeeded this session',
        state: 'healthy',
      };
    }
    if (p.configuredOnServer) {
      return {
        label: check?.ok === false ? '⊘ Check Failed' : '○ Not Yet Verified',
        tone: 'bg-sky-50 text-sky-800 border-sky-200',
        detail: check?.message || (p.keyless ? 'No credential required; inference not checked' : 'Credential configured; inference not checked'),
        state: check?.ok === false ? 'issues' : 'unverified',
      };
    }
    return {
      label: '— Not Configured',
      tone: 'bg-surface-secondary text-ink-muted border-border',
      detail: 'add a key to activate',
      state: 'disabled',
    };
  };

  // Test Provider Reachability
  const handleTestProvider = async (providerId: string, customKey?: string) => {
    setTestingId(providerId);
    setTestStatus((prev) => ({ ...prev, [providerId]: undefined as any }));
    try {
      const p = providers.find((item) => item.id === providerId);
      // Resolves to /api/admin/ai/test-provider through the shared axios baseURL.
      const res = await post<{ success?: boolean; latencyMs?: number; message?: string }>(
        '/admin/ai/test-provider',
        {
          provider: providerId,
          model: p?.defaultModel,
          apiKey: customKey || secretInputs[providerId] || undefined,
        }
      );


      // Never invent a latency: the badge must reflect a real probe or the
      // server's own message. `latencyMs` stays undefined when unreported.
      const lat = Number(res.latencyMs) > 0 ? Number(res.latencyMs) : undefined;
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: {
          ok: res.success === true,
          ...(lat ? { latencyMs: lat } : {}),
          message: res.message || (lat ? `Connected in ${lat}ms` : 'Connection verified'),
        },
      }));

      // Update provider status in local view
      setProviders((prev) =>
        prev.map((item) =>
          item.id === providerId
            ? { ...item, status: res.success === true ? 'healthy' : 'issues', ...(lat ? { latencyMs: lat } : {}) }
            : item
        )
      );
    } catch (err: any) {
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: {
          ok: false,
          message: err.message || 'Connection test failed',
        },
      }));
      setProviders((prev) =>
        prev.map((item) => (item.id === providerId ? { ...item, status: 'issues' } : item))
      );
    } finally {
      setTestingId(null);
    }
  };

  // Section 5: Modal handlers for Key Pool Manager, Cooldown Flush, Model Discovery, Code Snippets

  // Key Pool Manager Modal
  const handleOpenKeyPool = () => {
    setIsKeyPoolOpen(true);
  };

  const handleKeyPoolSave = async (providerId: string) => {
    const pool = splitKeyPool(keyPoolDrafts[providerId] || '');
    if (pool.length === 0) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        expectedRevision: revision,
        [`${providerId}ApiKeys`]: pool,
        [`${providerId}ApiKey`]: pool[0],
      };
      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, configuredOnServer: true, hasKey: true, status: 'unverified', keysCount: pool.length }
            : p
        )
      );
      setKeyPoolDrafts((prev) => ({ ...prev, [providerId]: '' }));
      setIsKeyPoolOpen(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setActionError(`Key Pool save failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Cooldown Flush Modal
  const handleOpenCooldown = (_providerId: string) => {
    setIsCooldownOpen(true);
  };

  // Model Discovery Modal
  const handleOpenDiscovery = () => {
    setIsDiscoveryOpen(true);
  };

  const handleDiscoveryFetch = async (selectedProviderId?: string) => {
    if (!selectedProviderId && !modalSelectedPlatform) {
      setModalError('Please select a platform first.');
      return;
    }
    setDiscoveryLoading(true);
    setModalError(null);
    try {
      const providerId = selectedProviderId || modalSelectedPlatform!.id;
      const res = await post<{ models?: any[] }>('/admin/ai/fetch-models', {
        provider: providerId,
        ...(selectedProviderId ? {} : { apiKey: modalApiKey }),
      });
      setCatalogModels(prev => [...prev.filter(m => m.providerId !== providerId), ...(res.models || []).map(m => ({ ...m, providerId }))]);
      setDiscoveryResults((prev) => ({
        ...prev,
        [providerId]: res.models || [],
      }));
    } catch (err: any) {
      setModalError(`Model discovery failed: ${normalizeError(err).message}`);
      const providerId = selectedProviderId || modalSelectedPlatform?.id;
      if (providerId) setDiscoveryResults(prev => ({
        ...prev,
        ...(prev[providerId] ? { [providerId]: prev[providerId].map((model: any) => ({ ...model, catalogStatus: 'stale' })) } : {}),
      }));
    } finally {
      setDiscoveryLoading(false);
    }
  };

  // Code Snippets Modal
  const handleOpenCodeSnippets = () => {
    setIsCodeSnippetsOpen(true);
  };

  // Handle Check All (Batch reachability)
  const handleCheckAll = async () => {
    setCheckingAll(true);
    const toCheck = providers.filter((p) => p.configuredOnServer || p.keyless);
    for (const p of toCheck) {
      try {
        await handleTestProvider(p.id);
      } catch {
        // continue batch
      }
    }
    setCheckingAll(false);
  };

  // Direct Save Key for a Single Provider (from expanded row)
  const handleSaveSingleKey = async (providerId: string) => {
    const key = (secretInputs[providerId] || '').trim();
    if (!key) return;
    const pool = splitKeyPool(key);
    if (pool.length === 0) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = { expectedRevision: revision };
      payload[`${providerId}ApiKey`] = pool[0];
      if (pool.length > 1) payload[`${providerId}ApiKeys`] = pool;
      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);

      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, configuredOnServer: true, hasKey: true, status: 'unverified', keysCount: pool.length }
            : p
        )
      );
      setSecretInputs((prev) => ({ ...prev, [providerId]: '' }));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      handleTestProvider(providerId, key).catch(() => {});
    } catch (err: any) {
      setActionError(`Save failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Save a pooled set of keys for a high-volume provider (Groq/Cerebras/Gemini)
  const handleSaveKeyPool = async (providerId: string) => {
    const pool = splitKeyPool(keyPoolDrafts[providerId] || '');
    if (pool.length === 0) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        expectedRevision: revision,
        [`${providerId}ApiKeys`]: pool,
        [`${providerId}ApiKey`]: pool[0],
      };
      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, configuredOnServer: true, hasKey: true, status: 'unverified', keysCount: pool.length }
            : p
        )
      );
      setKeyPoolDrafts((prev) => ({ ...prev, [providerId]: '' }));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      handleTestProvider(providerId, pool[0]).catch(() => {});
    } catch (err: any) {
      setActionError(`Key pool save failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Clear Key for a Single Provider (from expanded row)
  // Native window.confirm() blocked the main thread and exposed no busy state,
  // so clearing a stored credential could be triggered twice. An accessible
  // dialog now owns the confirmation and the in-flight indicator.
  const handleClearSingleKey = (providerId: string) => {
    setPendingClearProvider(providerId);
  };

  const confirmClearSingleKey = async () => {
    const providerId = pendingClearProvider;
    if (!providerId) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        expectedRevision: revision,
        clearSecrets: { [providerId]: true },
      };
      payload[`${providerId}ApiKey`] = '';
      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);

      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, configuredOnServer: false, hasKey: false, status: 'disabled', keysCount: 0 }
            : p
        )
      );
      setSecretInputs((prev) => ({ ...prev, [providerId]: '' }));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setActionError(`Clear failed: ${err.message || 'Unknown error'}`);
    } finally {
      setPendingClearProvider(null);
      setSaving(false);
    }
  };

  // Toggle Provider Activation
  const handleToggleProvider = async (providerId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId
          ? {
              ...p,
              enabled: nextEnabled,
              status: nextEnabled ? (p.configuredOnServer ? 'healthy' : 'disabled') : 'disabled',
            }
          : p
      )
    );
    try {
      const fieldName = `enable${providerId.charAt(0).toUpperCase() + providerId.slice(1)}`;
      const payload: Record<string, any> = {
        expectedRevision: revision,
        [fieldName]: nextEnabled,
      };
      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);
    } catch (err: any) {
      console.warn('Toggle sync notice:', err);
    }
  };

  // Open Add Key Dialog pre-selected with a specific provider
  const handleOpenAddKeyForProvider = (provider: ProviderItem) => {
    setModalSelectedPlatform(provider);
    setModalPlatformSearch(provider.name);
    setIsAddKeyOpen(true);
    setIsComboboxOpen(false);
    setModalError(null);
  };

  // Add Key Modal Submit (Non-blocking & Robust)
  const handleModalAddKey = async () => {
    if (!modalSelectedPlatform) {
      setModalError('Please select a platform first.');
      return;
    }

    const providerId = modalSelectedPlatform.id;
    const isKeyless = Boolean(modalSelectedPlatform.keyless);
    const key = modalApiKey.trim();

    if (!isKeyless && !key && modalTab === 'key') {
      setModalError('Please enter an API key for this provider.');
      return;
    }

    setModalTesting(true);
    setModalError(null);

    try {
      let currentRev = revision;
      if (!currentRev) {
        try {
          const fresh = await get<{ revision?: number }>('/admin/ai-settings');
          if (fresh?.revision) {
            currentRev = fresh.revision;
            setRevision(fresh.revision);
          }
        } catch (_) {}
      }

      const payload: Record<string, any> = {
        expectedRevision: currentRev,
      };

      const pool = splitKeyPool(key);
      if (providerId === 'cloudflare' && modalAccountId.trim()) {
        payload[`${providerId}ApiKey`] = `${modalAccountId.trim()}:${key}`;
      } else if (pool.length > 1) {
        // Multi-key pooling: the server stores the whole pool and rotates it
        // round-robin, benching only a key that is throttled.
        payload[`${providerId}ApiKeys`] = pool;
        payload[`${providerId}ApiKey`] = pool[0];
      } else {
        payload[`${providerId}ApiKey`] = key || (isKeyless ? 'keyless' : '');
      }

      if (modalCustomEndpoint.trim()) {
        payload[`${providerId}BaseUrl`] = modalCustomEndpoint.trim();
      }

      // Save directly to backend
      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);

      // Mark provider configured immediately in UI
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? {
                ...p,
                configuredOnServer: true,
                hasKey: true,
                status: 'unverified',
                keysCount: Math.max(pool.length, (p.keysCount || 0) + (pool.length > 0 ? 0 : 1), 1),
              }
            : p
        )
      );

      // Asynchronously trigger non-blocking probe to verify latency
      handleTestProvider(providerId, key).catch(() => {});

      // Clean up modal
      setIsAddKeyOpen(false);
      setModalApiKey('');
      setModalAccountId('');
      setModalSelectedPlatform(null);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to save provider key. Please retry.';
      setModalError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    } finally {
      setModalTesting(false);
    }
  };

  // Import raw keys handler
  const handleImportRawKeys = async () => {
    if (!modalImportRaw.trim()) {
      setModalError('Please paste configuration content to import.');
      return;
    }
    setModalTesting(true);
    setModalError(null);
    try {
      const lines = modalImportRaw.split('\n');
      const payload: Record<string, any> = { expectedRevision: revision };
      let detectedCount = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Za-z0-9_]+)[=:]\s*(.+)$/);
        if (match) {
          const varName = match[1].toLowerCase();
          const varVal = match[2].trim().replace(/^['"]|['"]$/g, '');
          const matchedP = providers.find(
            (p) =>
              varName.includes(p.id) ||
              varName.includes(`${p.id}_api_key`) ||
              varName === `${p.id}apikey`
          );
          if (matchedP && varVal) {
            payload[`${matchedP.id}ApiKey`] = varVal;
            detectedCount++;
          }
        }
      }

      if (detectedCount === 0) {
        throw new Error('No matching provider API keys detected in pasted text.');
      }

      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);

      setIsAddKeyOpen(false);
      setModalImportRaw('');
      setSavedSuccess(true);
      loadSettings();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setModalError(err.message || 'Import failed.');
    } finally {
      setModalTesting(false);
    }
  };

  // Handle Save All
  const handleSaveAll = async () => {
    if (selectionMode === 'manual' && !manualModel) { setActionError('Refresh the catalog and select a pinned model before saving.'); return; }
    setSaving(true);
    setSavedSuccess(false);
    try {
      const payload: Record<string, any> = {
        provider: primaryProvider,
        enableFallback,
        selectionMode,
        ...(selectionMode === 'manual' && manualModel ? { [primaryProvider]: { model: manualModel }, [`${primaryProvider}Model`]: manualModel } : {}),
        temperature,
        maxTokens,
        expectedRevision: revision,
      };

      Object.entries(secretInputs).forEach(([pId, keyVal]) => {
        if (keyVal && keyVal.trim()) {
          payload[`${pId}ApiKey`] = keyVal.trim();
        }
      });

      const res = await post<{ revision?: number }>('/admin/ai-settings', payload);
      if (res?.revision) setRevision(res.revision);

      setSecretInputs({});
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
      loadSettings();
    } catch (err: any) {
      setActionError(`Save failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Export configuration bundle
  const handleExportConfig = () => {
    const exportBundle = {
      version: 'freellmapi-0.16.6-ime365',
      exportedAt: new Date().toISOString(),
      primaryProvider,
      enableFallback,
      temperature,
      maxTokens,
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        group: p.group,
        configured: p.configuredOnServer,
        keyless: p.keyless || false,
        model: p.defaultModel,
      })),
      fallbackChains: chains,
    };
    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freellmapi-providers-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Filtered models for Screen 2
  const filteredModels = useMemo(() => {
    return catalogModels.filter((m) => {
      if (filterVision && m.capabilities?.vision !== true) return false;
      if (filterTools && m.capabilities?.tools !== true) return false;
      const minContext = contextFilter === '32k' ? 32768 : contextFilter === '128k' ? 131072 : contextFilter === '1m' ? 1048576 : 0;
      if (minContext && (!m.contextWindow || m.contextWindow < minContext)) return false;

      if (modelSearch.trim()) {
        const q = modelSearch.toLowerCase().trim();
        return (
          (m.name || m.id).toLowerCase().includes(q) ||
          m.providerId.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalogModels, filterVision, filterTools, contextFilter, modelSearch]);

  // Handle Playground Run
  const handleRunPlayground = async () => {
    if (!playgroundPrompt.trim()) return;
    setPlaygroundLoading(true);
    setPlaygroundOutput('');
    try {
      const res = await post<{
        choices?: Array<{ message?: { content?: string } }>;
        content?: string;
      }>('/v1/chat/completions', {
        model: playgroundModel,
        messages: [{ role: 'user', content: playgroundPrompt }],
        max_tokens: 500,
        temperature: 0.7,
      });

      const text =
        res.choices?.[0]?.message?.content ||
        res.content ||
        JSON.stringify(res, null, 2);
      setPlaygroundOutput(text);
    } catch (err: any) {
      setPlaygroundOutput(`[Error]: ${err.message || 'Execution failed'}`);
    } finally {
      setPlaygroundLoading(false);
    }
  };

  if (loading) return <p role="status" className="p-5 text-sm text-ink-muted">Loading engine configuration…</p>;
  if (settingsError) return (
    <div role="alert" className="space-y-3 p-5">
      <p>Engine configuration could not be loaded: {settingsError}</p>
      <Button onClick={loadSettings}>Retry configuration</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {actionError && <div role="alert" className="rounded border border-rose-300 p-3 text-sm">{actionError}<Button variant="ghost" onClick={() => setActionError(null)}>Dismiss</Button></div>}
      <Card><CardContent className="p-4 space-y-3">
        <h2 className="text-sm font-bold">Runtime model selection</h2>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs">Selection mode
            <select aria-label="Selection mode" value={selectionMode} onChange={e => setSelectionMode(e.target.value)} className="block border rounded p-2 bg-surface">
              <option value="auto">Auto / Recommended</option><option value="quality">Quality First</option>
              <option value="speed">Speed First</option><option value="balanced">Balanced</option><option value="manual">Manual</option>
            </select>
          </label>
          {selectionMode === 'manual' && <>
            <label className="text-xs">Pinned provider
              <select aria-label="Pinned provider" value={primaryProvider} onChange={e => { setPrimaryProvider(e.target.value); setManualModel(''); }} className="block border rounded p-2 bg-surface">
                <option value="">Select provider</option>{providers.filter(p => p.group === 'models').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <Button onClick={() => handleDiscoveryFetch(primaryProvider)} disabled={!primaryProvider || discoveryLoading}>Refresh selectable models</Button>
            <label className="text-xs">Pinned model
              <select aria-label="Pinned model" value={manualModel} onChange={e => setManualModel(e.target.value)} className="block border rounded p-2 bg-surface max-w-full">
                <option value="">Choose from live catalog</option>{manualModel && !(discoveryResults[primaryProvider] || []).some((m: any) => m.id === manualModel && m.catalogStatus === 'fresh') && <option value={manualModel} disabled>{manualModel} (saved — refresh to verify)</option>}{(discoveryResults[primaryProvider] || []).filter((m: any) => m.catalogStatus === 'fresh').map((m: any) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
              </select>
            </label>
          </>}
        </div>
        <p className="text-xs text-ink-muted">Automatic modes use current catalog capabilities and recent service observations. Quality First prioritizes documented capability fit; no response-quality benchmark is available. Manual pins never silently fall back.</p>
      </CardContent></Card>
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ─── MASTER TOP TAB BAR ─── */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto p-1 rounded-xl bg-surface-secondary/70">
          <button
            type="button"
            onClick={() => setActiveTab('keys')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0',
              activeTab === 'keys'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-surface-secondary'
            )}
          >
            <Key className="size-3.5" />
            Keys ({providers.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('models')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0',
              activeTab === 'models'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-surface-secondary'
            )}
          >
            <Layers className="size-3.5" />
            Models & Fallback Chains
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('claude')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0',
              activeTab === 'claude'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-surface-secondary'
            )}
          >
            <Terminal className="size-3.5" />
            Claude Code & Agents
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('playground')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0',
              activeTab === 'playground'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-surface-secondary'
            )}
          >
            <Sparkles className="size-3.5" />
            Playground
          </button>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <Check className="size-3 text-emerald-600" />
              Settings Saved
            </span>
          )}
          <Button variant="primary" size="sm" onClick={handleSaveAll} loading={saving} className="h-8 text-xs font-bold">
            Save All Changes
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Engine tools">
        <Button size="sm" onClick={handleOpenKeyPool}>Manage key pools</Button>
        <Button size="sm" onClick={() => handleOpenCooldown('')}>Manage cooldowns</Button>
        <Button size="sm" onClick={handleOpenDiscovery}>Discover models</Button>
        <Button size="sm" onClick={handleOpenCodeSnippets}>Integration snippets</Button>
      </div>
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ─── TAB 1: KEYS (Matching FreeLLMAPI Screen 1) ─── */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-ink tracking-tight">Keys</h1>
              <p className="text-xs text-ink-muted mt-0.5">
                Provider credentials and the unified API key your apps connect with.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckAll}
                loading={checkingAll}
                className="h-8 text-xs font-semibold"
              >
                <RefreshCw className={cn('size-3.5 mr-1.5', checkingAll && 'animate-spin')} />
                Check all
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportConfig}
                className="h-8 text-xs font-semibold"
              >
                <Download className="size-3.5 mr-1.5" />
                Export
              </Button>

              <Button
                variant="primary"
                size="sm"
                data-testid="configure-provider"
                onClick={() => {
                  setModalSelectedPlatform(null);
                  setModalPlatformSearch('');
                  setIsAddKeyOpen(true);
                  setIsComboboxOpen(false);
                  setModalError(null);
                }}
                className="h-8 text-xs font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800"
              >
                <Plus className="size-3.5 mr-1" />
                Configure Provider
              </Button>
            </div>
          </div>

          {/* Sub-Pills Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/40 text-xs">
            {(
              [
                { id: 'providers', label: `Providers (${configuredCount}/${providers.length})` },
                { id: 'quota', label: 'Quota signals' },
                { id: 'unified', label: 'Unified API key' },
                { id: 'anthropic', label: 'Anthropic' },
                { id: 'agents', label: 'Agents' },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setSubPill(pill.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap',
                  subPill === pill.id
                    ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Provider Category Tabs (Frontier / Community Mesh / Agent Search) */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs"
            role="tablist"
            aria-label="Provider categories"
            data-testid="provider-category-tabs"
          >
            {[
              { id: 'all' as const, label: 'All providers', count: tierCounts.all },
              { id: 'frontier' as const, label: 'Frontier Free Tier', count: tierCounts.frontier },
              { id: 'mesh' as const, label: 'Fast Community Mesh', count: tierCounts.mesh },
              { id: 'search' as const, label: 'Agent Search & Extraction Tools', count: tierCounts.search },
            ].map((tier) => (
              <button
                key={tier.id}
                type="button"
                role="tab"
                aria-selected={tierFilter === tier.id}
                aria-pressed={tierFilter === tier.id}
                data-testid={`provider-tier-${tier.id}`}
                onClick={() => setTierFilter(tier.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap border',
                  tierFilter === tier.id
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white shadow-xs'
                    : 'bg-surface text-ink-muted border-border/60 hover:text-ink hover:border-border'
                )}
              >
                {tier.label}
                <span
                  className={cn(
                    'ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                    tierFilter === tier.id
                      ? 'bg-white/20 text-white dark:bg-neutral-900/10 dark:text-neutral-900'
                      : 'bg-surface-secondary text-ink-muted'
                  )}
                >
                  {tier.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Status Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="size-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search platforms, models, keys..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            {/* Status Pills */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-secondary/70">
              {(
                [
                  { id: 'all', label: `All ${totalKeysCount}` },
                  { id: 'healthy', label: `Healthy ${healthyCount}` },
                  { id: 'issues', label: 'Issues 0' },
                  { id: 'disabled', label: `Disabled ${providers.length - configuredCount}` },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-semibold transition-all',
                    statusFilter === st.id
                      ? 'bg-white dark:bg-neutral-900 text-ink shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider Rows List */}
          <div className="space-y-2">
            {filteredProviders.length === 0 ? (
              <Card className="border-dashed p-8 text-center">
                <p className="text-xs text-ink-muted">No providers match the current search or status filter.</p>
              </Card>
            ) : (
              filteredProviders.map((p) => {
                const isExpanded = expandedProvider === p.id;
                const isPrimary = primaryProvider === p.id;
                const status = testStatus[p.id];
                const isConfigured = Boolean(p.configuredOnServer || p.keyless);

                return (
                  <div
                    key={p.id}
                    data-testid={`provider-row-${p.id}`}
                    className={cn(
                      'rounded-xl border transition-all overflow-hidden',
                      isExpanded
                        ? 'border-border bg-surface shadow-sm ring-1 ring-border/50'
                        : 'border-border/60 bg-surface/80 hover:bg-surface'
                    )}
                  >
                    {/* Main Row — stacks into two tidy bands below lg, where a
                        single line would crush the provider name against the
                        key count and status pill. */}
                    <div className="p-3.5 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                      {/* Left: Switch, Title, Badges */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {/* On/Off Switch */}
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={p.enabled !== false && isConfigured}
                            onChange={() => handleToggleProvider(p.id, p.enabled !== false)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-neutral-200 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900 dark:peer-checked:bg-emerald-600"></div>
                        </label>

                        {/* Title and Badges */}
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-bold text-ink">{p.name}</span>
                            {p.hint && (
                              <span className="whitespace-nowrap text-[10px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-md font-medium border border-sky-200 dark:border-sky-800">
                                {p.hint}
                              </span>
                            )}
                            {isPrimary && (
                              <span className="text-[10px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-md font-black tracking-wide border border-purple-200 dark:border-purple-800 uppercase">
                                PRIMARY
                              </span>
                            )}
                            {p.group === 'search' && (
                              <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md font-medium border border-amber-200 dark:border-amber-800">
                                web search
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Key Count, Health Status, Actions */}
                      <div className="flex flex-wrap items-center gap-2 pl-12 lg:pl-0 lg:gap-3">
                        {/* Key Count Badge */}
                        <span className="whitespace-nowrap text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-surface-secondary text-ink-muted">
                          {p.keysCount || (p.keyless ? 1 : 0)} {p.keysCount === 1 ? 'key' : 'keys'}
                        </span>

                        {/* Operational status pill (4 exact states) */}
                        <span
                          data-testid={`provider-status-${p.id}`}
                          data-provider-state={providerStatePill(p).state}
                          data-credential-source={p.configuredOnServer ? 'server' : p.hasKey ? 'draft' : 'none'}
                          aria-label={`${p.name}: ${providerStatePill(p).label}${
                            p.configuredOnServer ? ' — Configured on Server' : ''
                          }`}
                          title={providerStatePill(p).detail}
                          className={cn(
                            'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                            providerStatePill(p).tone
                          )}
                        >
                          {providerStatePill(p).label}
                          {providerStatePill(p).state === 'healthy' && p.latencyMs ? (
                            <span className="font-mono text-[10px] opacity-80">{p.latencyMs}ms</span>
                          ) : null}
                        </span>

                        {/* Quick + Add Key Button on Row */}
                        {!isConfigured && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleOpenAddKeyForProvider(p)}
                            className="h-7 text-xs font-semibold hidden lg:inline-flex"
                          >
                            <Plus className="size-3 mr-1" />
                            Add key
                          </Button>
                        )}

                        {/* Live reachability probe */}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleTestProvider(p.id)}
                          loading={testingId === p.id}
                          data-testid={`test-connection-${p.id}`}
                          aria-label={`Test ${p.name} connection`}
                          className="h-7 text-xs text-ink-muted hover:text-ink hidden lg:inline-flex"
                        >
                          <Zap className="size-3 mr-1" />
                          Test Connection
                        </Button>

                        {/* Expand Accordion Toggle */}
                        <button
                          type="button"
                          data-testid={`expand-provider-${p.id}`}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${p.name} settings`}
                          onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
                          className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-surface-secondary transition-transform"
                        >
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Settings & Direct Inline Key Configuration */}
                    {isExpanded && (
                      <div className="p-4 bg-surface-secondary/40 border-t border-border/50 space-y-4 animate-[fade-in_150ms_ease-out]">
                        {p.privacy && <p role="note" className="text-xs text-amber-700">Privacy: {p.privacy}</p>}
                        {p.quota && <p className="text-xs text-ink-muted">Access limits: {p.quota}</p>}
                        {/* Reachability Result */}
                        {status && (
                          <div
                            className={cn(
                              'p-2.5 rounded-lg text-xs flex items-center gap-2',
                              status.ok
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                            )}
                          >
                            {status.ok ? (
                              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
                            )}
                            <span className="font-mono">{status.message}</span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleTestProvider(p.id)}
                            loading={testingId === p.id}
                            data-testid={`test-connection-inline-${p.id}`}
                            className="h-7 text-xs font-semibold"
                          >
                            <Zap className="size-3 mr-1 text-amber-500" />
                            Test Connection
                          </Button>
                          {testStatus[p.id]?.latencyMs ? (
                            <span
                              data-testid={`latency-badge-${p.id}`}
                              className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                            >
                              ⚡ {testStatus[p.id]?.latencyMs}ms
                            </span>
                          ) : null}
                          {cooldowns[p.id] ? (
                            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
                              ⊘ {cooldowns[p.id].remainingSeconds}s remaining
                            </span>
                          ) : null}
                        </div>

                        {/* Multi-key pool: chips + paste-more editor */}
                        {!isSearchProvider(p) && (
                          <div className="space-y-2" data-testid={`key-pool-${p.id}`}>
                            <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
                              <Layers className="size-3 text-purple-500" />
                              Key Pool
                              <span className="text-[10px] font-normal text-ink-muted">
                                rotate automatically on 429
                              </span>
                            </label>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {Array.from({ length: p.keyless ? 1 : Math.max(0, p.keysCount || 0) }).map((_unused, index) => (
                                <span
                                  key={index}
                                  data-testid={`key-chip-${p.id}-${index}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                                >
                                  <Shield className="size-2.5" />
                                  {p.keyless ? 'keyless' : `key ${index + 1}`}
                                </span>
                              ))}
                              {!p.keyless && (p.keysCount || 0) === 0 ? (
                                <span className="text-[11px] text-ink-muted">No keys yet — paste up to 10 to build a pool.</span>
                              ) : null}
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <Input
                                value={keyPoolDrafts[p.id] ?? ''}
                                onChange={(e) =>
                                  setKeyPoolDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                                }
                                placeholder="Paste additional keys (comma or newline separated)…"
                                aria-label={`${p.name} key pool`}
                                className="h-8 flex-1 text-xs font-mono"
                              />
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => handleSaveKeyPool(p.id)}
                                loading={saving}
                                disabled={splitKeyPool(keyPoolDrafts[p.id] || '').length === 0}
                                className="h-8 text-xs font-semibold"
                              >
                                <Plus className="size-3 mr-1" />
                                Add to pool
                              </Button>
                            </div>
                            {splitKeyPool(keyPoolDrafts[p.id] || '').length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {splitKeyPool(keyPoolDrafts[p.id] || '').map((key, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-mono text-ink-muted"
                                  >
                                    {key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-3)}` : '••••'}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* Direct Key Configuration */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="font-semibold text-ink flex items-center gap-1.5">
                                <Key className="size-3 text-amber-500" />
                                Provider API Key
                              </label>
                              {p.docUrl && (
                                <a
                                  href={p.docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-brand-600 hover:underline flex items-center gap-0.5 font-medium"
                                >
                                  Get API key <ExternalLink className="size-2.5" />
                                </a>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <Input
                                  type={showSecretField[p.id] ? 'text' : 'password'}
                                  value={secretInputs[p.id] ?? ''}
                                  onChange={(e) =>
                                    setSecretInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                                  }
                                  placeholder={
                                    p.configuredOnServer
                                      ? '•••••••••••••••••••••••••••• (Active on server)'
                                      : p.keyless
                                      ? 'Keyless gateway (no key required)'
                                      : 'Paste API Key here…'
                                  }
                                  className="h-8 text-xs font-mono pr-8"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowSecretField((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs"
                                >
                                  {showSecretField[p.id] ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                                </button>
                              </div>

                              <Button
                                variant="primary"
                                size="xs"
                                onClick={() => handleSaveSingleKey(p.id)}
                                loading={saving}
                                disabled={!secretInputs[p.id]?.trim()}
                                className="h-8 text-xs font-bold whitespace-nowrap"
                              >
                                Save Key
                              </Button>

                              {p.configuredOnServer && !p.keyless && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => handleClearSingleKey(p.id)}
                                  className="h-8 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                            <p className="text-[10px] text-ink-muted">
                              Encrypted in MariaDB. Zero client-side leakage.
                            </p>
                          </div>

                          {/* Default Model & Quick Actions */}
                          <div>
                            <label className="font-semibold text-ink mb-1 block">Default Model Target</label>
                            <Input
                              value={p.defaultModel}
                              readOnly
                              className="h-8 text-xs font-mono bg-surface-secondary text-ink-muted"
                            />
                            <div className="mt-2.5 flex items-center gap-2">
                              {primaryProvider !== p.id && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => setPrimaryProvider(p.id)}
                                  className="h-7 text-xs font-semibold"
                                >
                                  Set as Primary
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleTestProvider(p.id)}
                                loading={testingId === p.id}
                                className="h-7 text-xs font-semibold"
                              >
                                Reachability Test
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ─── DEEP-LINK SUBTABS (Section 4) — real data-bound content for each      */}
      {/*     of the 5 engine subtab surfaces. Only rendered when the deep-link     */}
      {/*   URL ( ?subtab=... ) is active.                                        */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {subtab === 'key-pool' && activeTab === 'keys' && (
        <KeyPoolTab
          providers={providers}
          cooldowns={cooldowns}
          keyPoolDrafts={keyPoolDrafts}
          setKeyPoolDrafts={setKeyPoolDrafts}
          saving={saving}
          handleSaveKeyPool={handleSaveKeyPool}
          providerStatePill={providerStatePill}
        />
      )}

      {subtab === 'metrics' && activeTab === 'keys' && (
        <MetricsTab
          cooldowns={cooldowns}
          tierCounts={tierCounts}
          configuredCount={configuredCount}
          healthyCount={healthyCount}
        />
      )}

      {subtab === 'unified-gateway' && activeTab === 'keys' && (
        <UnifiedGatewayTab
          providers={providers}
          primaryProvider={primaryProvider}
          enableFallback={enableFallback}
          temperature={temperature}
          maxTokens={maxTokens}
        />
      )}

      {subtab === 'discovery' && activeTab === 'keys' && (
        <DiscoveryTab
          providers={providers}
          discoveryResults={discoveryResults}
          discoveryLoading={discoveryLoading}
          handleDiscoveryFetch={handleDiscoveryFetch}
          error={modalError}
        />
      )}

      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ─── TAB 2: MODELS & FALLBACK CHAINS (Matching FreeLLMAPI Screen 2) ─── */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'models' && (
        <div className="space-y-6">
          {/* Fallback Chains Card */}
          <Card className="border-border/70">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Layers className="size-4 text-brand-600" />
                    Fallback Chains
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Ordered cascade of models. If a provider hits 429 quota or times out, requests automatically failover.
                  </p>
                </div>
              </div>

              <p className="text-xs">Policy: {selectionMode}. Discovered models: {catalogModels.length}. Configure model selection above; this catalog is read-only.</p>
            </CardContent>
          </Card>

          {/* Model Filter Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative w-full sm:w-80">
              <Search className="size-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Search models, providers, context..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            {/* Context Chips & Capabilities */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-secondary/70">
                {(
                  [
                    { id: 'any', label: 'Any context' },
                    { id: '32k', label: '32K+' },
                    { id: '128k', label: '128K+' },
                    { id: '1m', label: '1M+' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setContextFilter(c.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-semibold transition-all',
                      contextFilter === c.id
                        ? 'bg-white dark:bg-neutral-900 text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setFilterVision(!filterVision)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold border transition-all',
                  filterVision
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                    : 'border-border text-ink-muted hover:text-ink'
                )}
              >
                Vision
              </button>

              <button
                type="button"
                onClick={() => setFilterTools(!filterTools)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold border transition-all',
                  filterTools
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                    : 'border-border text-ink-muted hover:text-ink'
                )}
              >
                Tools
              </button>

              <div className="h-4 w-px bg-border mx-1" />


            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr>{['Model', 'Provider', 'Context', 'Capabilities', 'Catalog', 'Quality'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
              <tbody>{filteredModels.map(m => <tr key={`${m.providerId}:${m.id}`} className="border-t border-border">
                <td className="p-3">{m.name || m.id}</td><td className="p-3">{m.providerId}</td>
                <td className="p-3">{m.contextWindow ? `${m.contextWindow.toLocaleString()} tokens` : 'Unknown'}</td>
                <td className="p-3">{Object.entries(m.capabilities || {}).filter(([, supported]) => supported === true).map(([name]) => name).join(', ') || 'Unknown'}</td>
                <td className="p-3">{m.catalogStatus || 'Unknown'}{m.lastSuccessfulRefresh && <span className="block text-ink-muted">{new Date(m.lastSuccessfulRefresh).toLocaleString()}</span>}</td>
                <td className="p-3">Unknown — no benchmark</td>
              </tr>)}</tbody>
            </table>
            {!filteredModels.length && <p className="p-4 text-xs text-ink-muted">No matching discovered models. Refresh a configured provider’s catalog; registry hints are not proof of model availability.</p>}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ─── TAB 3: CLAUDE CODE & AGENTS ─── */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'claude' && (
        <div className="space-y-6">
          <Card className="border-border/70">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Terminal className="size-4 text-brand-600" />
                Claude Code CLI & Agent Proxy Configuration
              </h3>
              <p className="text-xs text-ink-muted">
                Run Claude Code and Anthropic SDK agents against all 74 free and high-permeability providers using the FreeLLMAPI wire proxy.
              </p>

              <div className="space-y-3 pt-2">
                <div className="text-xs font-semibold text-ink">
                  1. Set Environment Variables in Terminal:
                </div>
                <div className="relative p-3 rounded-lg bg-neutral-950 text-white font-mono text-xs overflow-x-auto">
                  <pre>
                    export ANTHROPIC_BASE_URL="http://localhost:8080/v1"{'\n'}
                    export ANTHROPIC_API_KEY="free-ime365-unified-key"
                  </pre>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        'export ANTHROPIC_BASE_URL="http://localhost:8080/v1"\nexport ANTHROPIC_API_KEY="free-ime365-unified-key"',
                        'cli-env'
                      )
                    }
                    className="absolute right-3 top-3 p-1.5 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                  >
                    {copiedText === 'cli-env' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  </button>
                </div>

                <div className="text-xs font-semibold text-ink mt-4">
                  2. Launch Claude Code CLI:
                </div>
                <div className="relative p-3 rounded-lg bg-neutral-950 text-white font-mono text-xs overflow-x-auto">
                  <pre>claude --model auto:free-claude-code</pre>
                  <button
                    type="button"
                    onClick={() => handleCopy('claude --model auto:free-claude-code', 'cli-launch')}
                    className="absolute right-3 top-3 p-1.5 rounded bg-neutral-800 text-neutral-300 hover:text-white"
                  >
                    {copiedText === 'cli-launch' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ─── TAB 4: PLAYGROUND ─── */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'playground' && (
        <div className="space-y-6">
          <Card className="border-border/70">
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-600" />
                    AI Multi-Provider Playground
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Test live completions against any registered provider or fallback chain.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-ink">Target Model / Chain:</label>
                  <select
                    value={playgroundModel}
                    onChange={(e) => setPlaygroundModel(e.target.value)}
                    className="h-8 text-xs font-semibold rounded-lg border border-border bg-surface px-2.5 text-ink"
                  >
                    <option value="auto">Auto (saved runtime policy)</option>

                    {providers
                      .filter((p) => p.configuredOnServer || p.keyless)
                      .map((p) => (
                        <option key={p.id} value={p.defaultModel}>
                          {p.name} ({p.defaultModel})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block mb-1">Prompt</label>
                <textarea
                  value={playgroundPrompt}
                  onChange={(e) => setPlaygroundPrompt(e.target.value)}
                  rows={4}
                  className="w-full text-xs font-mono p-3 rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Enter prompt here..."
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunPlayground}
                  loading={playgroundLoading}
                  className="h-8 text-xs font-bold"
                >
                  <Play className="size-3 mr-1.5" />
                  Run Completion
                </Button>
              </div>

              {playgroundOutput && (
                <div className="pt-2">
                  <label className="text-xs font-semibold text-ink block mb-1">Response Output</label>
                  <div className="p-4 rounded-lg bg-surface-secondary border border-border/80 font-mono text-xs text-ink whitespace-pre-wrap">
                    {playgroundOutput}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {/* ─── ADD KEY MODAL (Matching FreeLLMAPI Screen 3 Exactly) ─── */}
      {/* ═════════════════════════════════════════════════════════════════════════════ */}
      {isKeyPoolOpen && <EngineDialog title="Key Pool Manager" rootRef={keyPoolRef} onClose={() => setIsKeyPoolOpen(false)}>
        <KeyPoolTab providers={providers} cooldowns={cooldowns} keyPoolDrafts={keyPoolDrafts} setKeyPoolDrafts={setKeyPoolDrafts} saving={saving} handleSaveKeyPool={handleKeyPoolSave} providerStatePill={providerStatePill} />
      </EngineDialog>}
      {isCooldownOpen && <EngineDialog title="Provider cooldowns" rootRef={cooldownRef} onClose={() => setIsCooldownOpen(false)}>
        <p className="text-xs">Upstream quota and Retry-After restrictions cannot be reset here. Cooldowns expire automatically; refreshing reads current server state.</p>
        {Object.entries(cooldowns).map(([provider, state]) => <p key={provider} className="text-xs">{provider}: {state.remainingSeconds}s — {state.reason}</p>)}
        {!Object.keys(cooldowns).length && <p className="text-xs">No active platform cooldowns.</p>}
        <Button onClick={loadSettings}>Refresh cooldown state</Button>
      </EngineDialog>}
      {isDiscoveryOpen && <EngineDialog title="Model Discovery" rootRef={discoveryRef} onClose={() => setIsDiscoveryOpen(false)}>
        <DiscoveryTab providers={providers} discoveryResults={discoveryResults} discoveryLoading={discoveryLoading} handleDiscoveryFetch={handleDiscoveryFetch} error={modalError} />
      </EngineDialog>}
      {isCodeSnippetsOpen && <EngineDialog title="Integration snippets" rootRef={codeSnippetsRef} onClose={() => setIsCodeSnippetsOpen(false)}>
        <p className="text-xs">Use your own authenticated token; credentials are never included in exports or examples.</p>
        <pre className="text-xs overflow-auto p-3 bg-surface-secondary"><code>{`fetch('/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer YOUR_TOKEN' },
  body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'Hello' }] })
})`}</code></pre>
      </EngineDialog>}
      {isAddKeyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-[fade-in_150ms_ease-out]">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-key-dialog-title"
            data-testid="add-key-dialog"
            className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl bg-surface border border-border shadow-2xl p-6 space-y-4 overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h2 id="add-key-dialog-title" className="text-lg font-bold text-ink">Add key</h2>
              <button
                type="button"
                data-testid="modal-close"
                aria-label="Close add key dialog"
                onClick={() => {
                  setIsAddKeyOpen(false);
                  setIsComboboxOpen(false);
                }}
                className="p-1 rounded-md text-ink-muted hover:text-ink transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Segmented Control (Provider key / Import file / Custom endpoint) */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-secondary">
              {(
                [
                  { id: 'key', label: 'Provider key' },
                  { id: 'import', label: 'Import file' },
                  { id: 'endpoint', label: 'Custom endpoint' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalTab(tab.id)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-center',
                    modalTab === tab.id
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: PROVIDER KEY */}
            {modalTab === 'key' && (
              <div className="space-y-3.5">
                {/* Platform Selector Combobox */}
                <div className="space-y-1.5" ref={comboboxRef}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink">Platform</label>
                    <span className="text-[11px] text-ink-muted">74 platforms supported</span>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      data-testid="platform-selector"
                      aria-haspopup="listbox"
                      aria-expanded={isComboboxOpen}
                      aria-label="Select provider platform"
                      onClick={() => setIsComboboxOpen(!isComboboxOpen)}
                      className={cn(
                        'flex h-9 w-full items-center justify-between rounded-lg border bg-surface px-3 text-xs outline-none transition-colors hover:bg-surface-secondary focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white',
                        modalSelectedPlatform ? 'border-neutral-900 dark:border-white font-bold' : 'border-border text-ink-muted'
                      )}
                    >
                      <span className={modalSelectedPlatform ? 'text-ink font-bold' : 'text-ink-muted'}>
                        {modalSelectedPlatform ? modalSelectedPlatform.label : 'Select a platform…'}
                      </span>
                      <ChevronsUpDown className="size-3.5 text-ink-muted" />
                    </button>

                    {/* Popover Dropdown Menu */}
                    {isComboboxOpen && (
                      <div
                        data-testid="platform-listbox-panel"
                        className="mt-1 w-full rounded-xl border border-border bg-surface shadow-sm overflow-hidden animate-[fade-in_100ms_ease-out]"
                      >
                        {/* Search Input */}
                        <div className="p-2 border-b border-border/60 bg-surface-secondary/40 flex items-center gap-2">
                          <Search className="size-3.5 text-ink-muted shrink-0" />
                          <input
                            type="text"
                            data-testid="platform-search"
                            value={modalPlatformSearch}
                            onChange={(e) => setModalPlatformSearch(e.target.value)}
                            placeholder="Search 74 platforms (e.g. 'groq', 'nvidia', 'free')..."
                            className="w-full text-xs bg-transparent border-none outline-none text-ink placeholder:text-ink-muted"
                            autoFocus
                          />
                          {modalPlatformSearch && (
                            <button
                              type="button"
                              onClick={() => setModalPlatformSearch('')}
                              className="p-0.5 text-ink-muted hover:text-ink"
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>

                        {/* Filter Tabs & Hide Added Checkbox */}
                        <div className="px-3 py-1.5 border-b border-border/40 bg-surface-secondary/20 flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setModalCategoryFilter('all')}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-semibold',
                                modalCategoryFilter === 'all'
                                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                                  : 'text-ink-muted hover:text-ink'
                              )}
                            >
                              All ({providers.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setModalCategoryFilter('models')}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-semibold',
                                modalCategoryFilter === 'models'
                                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                                  : 'text-ink-muted hover:text-ink'
                              )}
                            >
                              Models ({providers.filter((entry) => !isSearchProvider(entry)).length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setModalCategoryFilter('search')}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-semibold',
                                modalCategoryFilter === 'search'
                                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                                  : 'text-ink-muted hover:text-ink'
                              )}
                            >
                              Web Search ({providers.filter((entry) => isSearchProvider(entry)).length})
                            </button>
                          </div>

                          <label className="flex items-center gap-1 cursor-pointer text-ink-muted hover:text-ink">
                            <input
                              type="checkbox"
                              checked={modalHideAdded}
                              onChange={(e) => setModalHideAdded(e.target.checked)}
                              className="size-3 rounded text-neutral-900"
                            />
                            <span>Hide added</span>
                          </label>
                        </div>

                        {/* Items List */}
                        <div role="listbox" aria-label="Provider platforms" className="max-h-48 overflow-y-auto divide-y divide-border/30">
                          {filteredModalPlatforms.length === 0 ? (
                            <div className="p-4 text-center text-xs text-ink-muted">
                              No platform matches "{modalPlatformSearch}"
                            </div>
                          ) : (
                            filteredModalPlatforms.map((p) => {
                              const isSelected = modalSelectedPlatform?.id === p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  data-testid={`platform-option-${p.id}`}
                                  onClick={() => {
                                    setModalSelectedPlatform(p);
                                    setIsComboboxOpen(false);
                                    setModalPlatformSearch('');
                                    setModalError(null);
                                  }}
                                  className={cn(
                                    'w-full text-left p-2.5 px-3 text-xs flex items-center justify-between cursor-pointer transition-colors',
                                    isSelected
                                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                                      : 'hover:bg-surface-secondary text-ink'
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <span>{p.label || p.name}</span>
                                    {p.hint && (
                                      <span
                                        className={cn(
                                          'text-[10px] px-1.5 py-0.2 rounded font-medium',
                                          isSelected
                                            ? 'bg-white/20 text-white'
                                            : 'bg-surface-secondary text-ink-muted'
                                        )}
                                      >
                                        {p.hint}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {p.configuredOnServer && (
                                      <span
                                        className={cn(
                                          'text-[10px] font-semibold flex items-center gap-1',
                                          isSelected ? 'text-emerald-300' : 'text-emerald-600'
                                        )}
                                      >
                                        <span className="size-1.5 rounded-full bg-emerald-500" />
                                        active
                                      </span>
                                    )}
                                    {isSelected && <Check className="size-3.5" />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cloudflare Account ID (if applicable) */}
                {modalSelectedPlatform?.id === 'cloudflare' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-ink">Cloudflare Account ID</label>
                    <Input
                      type="text"
                      value={modalAccountId}
                      onChange={(e) => setModalAccountId(e.target.value)}
                      placeholder="e.g. 9b73648a1... (found in Cloudflare dashboard URL)"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                )}

                {/* Keyless Notice Banner */}
                {modalSelectedPlatform?.keyless && (
                  <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 text-xs flex items-center gap-2">
                    <Zap className="size-4 shrink-0 text-sky-600" />
                    <span>
                      <strong>Keyless Gateway:</strong> {modalSelectedPlatform.name} requires no API key. Click <strong>Add key & Activate</strong> to route completions anonymously.
                    </span>
                  </div>
                )}

                {/* API Key Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink">
                      {modalSelectedPlatform?.id === 'cloudflare' ? 'API Token' : 'API key'}
                    </label>
                    <div className="flex items-center gap-2">
                      {!modalSelectedPlatform?.keyless && (
                        <button
                          type="button"
                          onClick={() => setModalSeveral(!modalSeveral)}
                          className="text-[11px] text-ink-muted hover:underline"
                        >
                          {modalSeveral ? 'Single key' : 'Paste several'}
                        </button>
                      )}
                      {modalSelectedPlatform?.docUrl && (
                        <a
                          href={modalSelectedPlatform.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-brand-600 hover:underline flex items-center gap-0.5"
                        >
                          Get API key ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {modalSeveral ? (
                    <textarea
                      value={modalApiKey}
                      onChange={(e) => setModalApiKey(e.target.value)}
                      rows={3}
                      placeholder="Paste keys (one per line)..."
                      className="w-full text-xs font-mono p-2.5 rounded-lg border border-border bg-surface text-ink"
                    />
                  ) : (
                    <div className="relative">
                      <Input
                        type={modalShowKey ? 'text' : 'password'}
                        data-testid="modal-api-key"
                        value={modalApiKey}
                        onChange={(e) => setModalApiKey(e.target.value)}
                        placeholder={
                          modalSelectedPlatform?.keyless
                            ? 'Optional custom token (or leave blank)'
                            : 'Paste API key here...'
                        }
                        className="h-9 text-xs font-mono pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setModalShowKey(!modalShowKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs"
                      >
                        {modalShowKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: IMPORT FILE */}
            {modalTab === 'import' && (
              <div className="space-y-3">
                <p className="text-xs text-ink-muted">
                  Paste keys in <code>KEY_NAME=value</code> format or raw JSON configuration:
                </p>
                <textarea
                  value={modalImportRaw}
                  onChange={(e) => setModalImportRaw(e.target.value)}
                  rows={5}
                  placeholder="GROQ_API_KEY=gsk_...&#10;GEMINI_API_KEY=AIzaSy...&#10;NVIDIA_API_KEY=nvapi-..."
                  className="w-full text-xs font-mono p-3 rounded-lg border border-border bg-surface text-ink"
                />
              </div>
            )}

            {/* TAB 3: CUSTOM ENDPOINT */}
            {modalTab === 'endpoint' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink">Custom Gateway Base URL</label>
                  <Input
                    type="text"
                    value={modalCustomEndpoint}
                    onChange={(e) => setModalCustomEndpoint(e.target.value)}
                    placeholder="https://my-openai-gateway.com/v1"
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink">Custom Model Target</label>
                  <Input
                    type="text"
                    value={modalCustomModel}
                    onChange={(e) => setModalCustomModel(e.target.value)}
                    placeholder="e.g. meta-llama/Llama-3-70b-chat"
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink">API Key (Optional)</label>
                  <Input
                    type="password"
                    value={modalApiKey}
                    onChange={(e) => setModalApiKey(e.target.value)}
                    placeholder="Leave blank for local/open endpoints"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {/* Error Notice */}
            {modalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAddKeyOpen(false);
                  setIsComboboxOpen(false);
                }}
                className="h-8 text-xs font-semibold"
              >
                Cancel
              </Button>

              {/* Test Key Before Saving: real reachability probe, server-side masked */}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (modalTab !== 'key' || modalCustomEndpoint.trim() || !modalSelectedPlatform || (!modalSelectedPlatform.keyless && !modalApiKey.trim())) return;
                  setModalTesting(true);
                  setModalError(null);
                  try {
                    const firstKey = splitKeyPool(modalApiKey)[0] || '';
                    const apiKey = modalSelectedPlatform.keyless ? ''
                      : modalSelectedPlatform.id === 'cloudflare' && modalAccountId.trim()
                        ? `${modalAccountId.trim()}:${firstKey}` : firstKey;
                    const res = await post<{ ok?: boolean; latencyMs?: number; message?: string }>(
                      '/admin/ai/test-provider',
                      { provider: modalSelectedPlatform.id, model: modalSelectedPlatform.defaultModel, apiKey }
                    );
                    if (res.ok) setModalError(`✓ Connection verified${res.latencyMs ? ` (${res.latencyMs}ms)` : ''}`);
                    else setModalError(`✗ Test failed: ${res.message || 'Connection test failed'}`);
                  } catch (err: any) {
                    setModalError(`✗ Test failed: ${err.message || 'Connection test failed'}`);
                  } finally {
                    setModalTesting(false);
                  }
                }}
                loading={modalTesting}
                disabled={modalTab !== 'key' || Boolean(modalCustomEndpoint.trim()) || !modalSelectedPlatform || (!modalSelectedPlatform.keyless && !modalApiKey.trim())}
                title="Tests the first entered key at the saved provider endpoint. Save endpoint changes before testing them."
                className="h-8 text-xs font-semibold text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/20"
              >
                {modalTesting ? <Activity className="size-3.5 mr-1.5 animate-spin" /> : <Zap className="size-3 mr-1" />}
                Test Key Before Saving
              </Button>

              {modalTab === 'import' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleImportRawKeys}
                  loading={modalTesting}
                  className="h-8 text-xs font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                >
                  Import Keys
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  data-testid="modal-add-key"
                  onClick={handleModalAddKey}
                  loading={modalTesting}
                  disabled={
                    modalTab === 'key' &&
                    (!modalSelectedPlatform ||
                      (!modalSelectedPlatform.keyless && !modalApiKey.trim()))
                  }
                  className="h-8 text-xs font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800"
                >
                  Add key & Activate
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingClearProvider !== null}
        onOpenChange={(open) => {
          if (!open) setPendingClearProvider(null);
        }}
        title="Clear stored credential?"
        description={
          pendingClearProvider
            ? `The stored API credential for ${pendingClearProvider} will be removed from the server. Routing falls back to the remaining healthy providers.`
            : undefined
        }
        confirmLabel="Clear credential"
        destructive
        busy={saving}
        onConfirm={() => void confirmClearSingleKey()}
      />
    </div>
  );
}

function EngineDialog({ title, rootRef, onClose, children }: {
  title: string; rootRef: React.RefObject<HTMLDivElement>; onClose: () => void; children: React.ReactNode;
}) {
  return <div className="fixed inset-0 z-50 bg-black/40 p-3 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-xl bg-surface border border-border p-4 space-y-4 shadow-xl">
      <div className="flex items-center justify-between gap-2"><h2 className="font-bold">{title}</h2><Button onClick={onClose} aria-label={`Close ${title}`}>Close</Button></div>
      {children}
    </div>
  </div>;
}

// ═════════════════════════════════════════════════════════════════════════════
// KEY POOL SUBTAB (DIR-013 Section 4: ?subtab=key-pool)
// ═════════════════════════════════════════════════════════════════════════════
const KeyPoolTab = ({ providers, cooldowns, keyPoolDrafts, setKeyPoolDrafts, saving, handleSaveKeyPool, providerStatePill }: {
  providers: ProviderItem[];
  cooldowns: Record<string, { remainingSeconds: number; reason: string }>;
  keyPoolDrafts: Record<string, string>;
  setKeyPoolDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: boolean;
  handleSaveKeyPool: (providerId: string) => Promise<void>;
  providerStatePill: (p: ProviderItem) => { label: string; tone: string; detail: string; state: string };
}) => {
  const activeKeys = providers.filter((p) => (p.configuredOnServer || p.keyless) && p.hasKey);
  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Layers className="size-4 text-purple-500" />
            Key Pool Manager
          </h3>
          <p className="text-xs text-ink-muted">
            Multi-key pooling with automatic rotation on 429 cooldowns. Keys are encrypted at rest in MariaDB.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.filter((p) => !isSearchProvider(p)).map((p) => {
              const keys = Array.from({ length: p.keyless ? 1 : Math.max(0, p.keysCount || 0) });
              const cooldown = cooldowns[p.id];
              const state = providerStatePill(p);
              return (
                <div
                  key={p.id}
                  data-testid={`key-pool-${p.id}`}
                  className="p-4 rounded-xl border border-border/60 bg-surface/80 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">{p.name}</span>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-md border', state.tone)}>
                      {state.label}
                    </span>
                  </div>
                  {cooldown ? (
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      Cooldown: {cooldown.remainingSeconds}s remaining — {cooldown.reason}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {keys.map((_unused, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      >
                        <Shield className="size-2.5" />
                        {p.keyless ? 'keyless' : `key ${index + 1}`}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Input
                      value={keyPoolDrafts[p.id] ?? ''}
                      onChange={(e) => setKeyPoolDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="Paste additional keys (comma or newline separated)…"
                      aria-label={`${p.name} key pool`}
                      className="h-8 flex-1 text-xs font-mono"
                    />
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleSaveKeyPool(p.id)}
                      loading={saving}
                      disabled={splitKeyPool(keyPoolDrafts[p.id] || '').length === 0}
                      className="h-8 text-xs font-semibold"
                    >
                      <Plus className="size-3 mr-1" />
                      Add to pool
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// METRICS SUBTAB (DIR-013 Section 4: ?subtab=metrics)
// ═════════════════════════════════════════════════════════════════════════════
const MetricsTab = ({ cooldowns, tierCounts, configuredCount, healthyCount }: {
  cooldowns: Record<string, { remainingSeconds: number; reason: string }>;
  tierCounts: { all: number; frontier: number; mesh: number; search: number };
  configuredCount: number;
  healthyCount: number;
}) => {
  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Activity className="size-4 text-brand-600" />
            Engine Metrics
          </h3>
          <p className="text-xs text-ink-muted">
            Configuration summary and cooldown snapshot. Verified counts reflect inference checks performed in this browser session.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-border/60 bg-surface/80 text-center">
              <div className="text-2xl font-black text-ink">{tierCounts.all}</div>
              <div className="text-[11px] font-semibold text-ink-muted uppercase">Total Providers</div>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-surface/80 text-center">
              <div className="text-2xl font-black text-ink">{configuredCount}</div>
              <div className="text-[11px] font-semibold text-ink-muted uppercase">Configured</div>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-surface/80 text-center">
              <div className="text-2xl font-black text-ink">{healthyCount}</div>
              <div className="text-[11px] font-semibold text-ink-muted uppercase">Verified this session</div>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-surface/80 text-center">
              <div className="text-2xl font-black text-ink">{Object.keys(cooldowns).length}</div>
              <div className="text-[11px] font-semibold text-ink-muted uppercase">Active Cooldowns</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// UNIFIED GATEWAY SUBTAB (DIR-013 Section 4: ?subtab=unified-gateway)
// ═════════════════════════════════════════════════════════════════════════════
const UnifiedGatewayTab = ({ providers, primaryProvider, enableFallback, temperature, maxTokens }: {
  providers: ProviderItem[];
  primaryProvider: string;
  enableFallback: boolean;
  temperature: number;
  maxTokens: number;
}) => {
  const gatewayProviders = providers.filter((p) => p.baseUrl || p.keyless);
  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Zap className="size-4 text-brand-600" />
            Unified Gateway
          </h3>
          <p className="text-xs text-ink-muted">
            OpenAI &amp; Anthropic compatible /v1/* endpoints with unified model routing.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/60 bg-surface/80">
              <div className="text-xs font-bold text-ink">OpenAI Compatible</div>
              <div className="text-[11px] font-mono text-ink-muted mt-1">/v1/chat/completions</div>
              <div className="text-[11px] font-mono text-ink-muted">/v1/models</div>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-surface/80">
              <div className="text-xs font-bold text-ink">Anthropic Compatible</div>
              <div className="text-[11px] font-mono text-ink-muted mt-1">/v1/messages</div>
              <div className="text-[11px] font-mono text-ink-muted">/v1/models</div>
            </div>
          </div>
          <div className="text-xs text-ink-muted">
            Primary: {primaryProvider} · Fallback: {enableFallback ? 'enabled' : 'disabled'} · Temp: {temperature} · Max tokens: {maxTokens}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// DISCOVERY SUBTAB (DIR-013 Section 4: ?subtab=discovery)
// ═════════════════════════════════════════════════════════════════════════════
const DiscoveryTab = ({ providers, discoveryResults, discoveryLoading, handleDiscoveryFetch, error }: {
  providers: ProviderItem[];
  discoveryResults: Record<string, any>;
  discoveryLoading: boolean;
  handleDiscoveryFetch: (providerId: string) => Promise<void>;
  error: string | null;
}) => {
  const [selectedId, setSelectedId] = React.useState<string>('');
  const results = discoveryResults[selectedId];
  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Sparkles className="size-4 text-brand-600" />
            Dynamic Model Discovery
          </h3>
          <p className="text-xs text-ink-muted">
            Live query of provider /models endpoints to sync available models into the catalog.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Discovery provider"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-xs text-ink"
            >
              <option value="">Select a provider…</option>
              {providers.filter((p) => !isSearchProvider(p)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleDiscoveryFetch(selectedId)}
              disabled={!selectedId || discoveryLoading}
              loading={discoveryLoading}
              className="h-9 text-xs font-bold"
            >
              Fetch Models
            </Button>
          </div>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          {results ? (
            <div className="space-y-2" aria-live="polite">
              {results.some((m: any) => m.catalogStatus !== "fresh") && (
                <p role="status" className="text-xs text-amber-600">Catalog is stale or unverified. Model availability must be confirmed by inference.</p>
              )}
              <div className="text-xs font-bold text-ink">Discovered Models ({results.length})</div>
              {results.map((m: any) => (
                <div key={m.id} className="p-3 rounded-lg border border-border/60 bg-surface/80 text-xs">
                  <div className="font-mono font-semibold text-ink break-all">{m.id}</div>
                  {m.contextWindow ? <div className="text-ink-muted mt-0.5">{m.contextWindow} context</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
