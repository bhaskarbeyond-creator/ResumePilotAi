import type { ProviderCatalogEntry } from '../../freellmapi-catalog';
export type { ProviderCatalogEntry };

export interface CatalogModel {
  id: string;
  name?: string;
  providerId: string;
  contextWindow?: number | null;
  capabilities?: { vision?: boolean; tools?: boolean; json?: boolean };
  catalogStatus?: string;
  lastSuccessfulRefresh?: number | null;
}

export interface CooldownEntry {
  remainingSeconds: number;
  reason?: string | null;
  strikeCount?: number;
}

export interface QuotaConsumerRecord {
  uid: string;
  email: string;
  displayName?: string;
  membership?: string;
  count: number;
  limit: number;
  day?: string;
  lastUsed?: string | null;
}

export interface QuotaDashboardResponse {
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

export interface EngineMetricsResponse {
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

export interface EngineStatusResponse {
  version?: string;
  totalProvidersCount?: number;
  chatProvidersCount?: number;
  searchProvidersCount?: number;
  cacheEntries?: number;
  activeCooldowns?: Array<{ provider: string; remainingSeconds: number; reason?: string }>;
}

export interface AiSettingsApiResponse {
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

export type SelectionMode = 'auto' | 'quality' | 'speed' | 'balanced' | 'manual';

export type EngineViewSubtab =
  | 'providers'
  | 'key-pool'
  | 'metrics'
  | 'quotas'
  | 'unified-gateway'
  | 'claude'
  | 'discovery'
  | 'models'
  | 'playground';

export type DialogSlug =
  | 'configure-provider'
  | 'key-pool'
  | 'cooldowns'
  | 'discovery'
  | 'snippets'
  | 'confirm-clear-key'
  | 'confirm-reset-user-quota'
  | 'confirm-reset-all-quotas';

export interface AdminAiSettingsTabProps {
  viewerRole?: string;
}

export interface RevisionConflictState {
  message: string;
  currentRevision?: number;
  pendingPayload?: Record<string, any>;
}

export interface AiSettingsContextValue {
  // Roles & View
  effectiveRole: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isAuditorOrSupport: boolean;
  isReadOnly: boolean;

  // URL & Navigation
  searchParams: URLSearchParams;
  activeSubtab: EngineViewSubtab;
  activeDialog: DialogSlug | null;
  dialogTarget: string;
  providerFilter: string;
  categoryFilter: 'all' | 'frontier' | 'mesh' | 'search';
  statusFilter: 'all' | 'configured' | 'healthy' | 'issues' | 'disabled';
  searchQuery: string;
  updateUrlParams: (mutator: (next: URLSearchParams) => void, replace?: boolean) => void;
  openDialog: (slug: DialogSlug, target?: string) => void;
  closeDialog: () => void;
  selectSubtab: (nextSubtab: EngineViewSubtab) => void;

  // Core Engine & Config State
  loading: boolean;
  settingsError: string | null;
  v2Enabled: boolean;
  revision: number;
  revisionConflict: RevisionConflictState | null;
  setRevisionConflict: React.Dispatch<React.SetStateAction<RevisionConflictState | null>>;
  providers: ProviderCatalogEntry[];
  setProviders: React.Dispatch<React.SetStateAction<ProviderCatalogEntry[]>>;
  maskedKeys: Record<string, string>;
  cooldowns: Record<string, CooldownEntry>;
  discoveredModels: CatalogModel[];
  configuredCount: number;
  healthyCount: number;
  issuesCount: number;

  // Runtime Strip
  selectionMode: SelectionMode;
  setSelectionMode: React.Dispatch<React.SetStateAction<SelectionMode>>;
  primaryProvider: string;
  setPrimaryProvider: React.Dispatch<React.SetStateAction<string>>;
  pinnedModel: string;
  setPinnedModel: React.Dispatch<React.SetStateAction<string>>;
  temperature: number;
  setTemperature: React.Dispatch<React.SetStateAction<number>>;
  maxTokens: number;
  setMaxTokens: React.Dispatch<React.SetStateAction<number>>;
  enableFallback: boolean;
  setEnableFallback: React.Dispatch<React.SetStateAction<boolean>>;
  showTuning: boolean;
  setShowTuning: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions & Alerts
  saving: boolean;
  toastMsg: string | null;
  setToastMsg: React.Dispatch<React.SetStateAction<string | null>>;
  actionError: string | null;
  showToast: (msg: string) => void;
  setActionError: React.Dispatch<React.SetStateAction<string | null>>;

  // Row Drafts & Expansion
  expandedRowId: string | null;
  setExpandedRowId: React.Dispatch<React.SetStateAction<string | null>>;
  singleKeyDrafts: Record<string, string>;
  setSingleKeyDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  poolKeyDrafts: Record<string, string>;
  setPoolKeyDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showRowKey: Record<string, boolean>;
  setShowRowKey: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  modelDrafts: Record<string, string>;
  setModelDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  baseUrlDrafts: Record<string, string>;
  setBaseUrlDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  testingId: string | null;
  checkingAll: boolean;

  // Configure Modal
  modalTab: 'single' | 'pool' | 'endpoint';
  setModalTab: React.Dispatch<React.SetStateAction<'single' | 'pool' | 'endpoint'>>;
  modalSelectedId: string;
  setModalSelectedId: React.Dispatch<React.SetStateAction<string>>;
  platformDropdownOpen: boolean;
  setPlatformDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  modalPlatformQuery: string;
  setModalPlatformQuery: React.Dispatch<React.SetStateAction<string>>;
  modalApiKey: string;
  setModalApiKey: React.Dispatch<React.SetStateAction<string>>;
  modalShowKey: boolean;
  setModalShowKey: React.Dispatch<React.SetStateAction<boolean>>;
  modalPoolText: string;
  setModalPoolText: React.Dispatch<React.SetStateAction<string>>;
  modalCustomBaseUrl: string;
  setModalCustomBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  modalCustomModel: string;
  setModalCustomModel: React.Dispatch<React.SetStateAction<string>>;
  modalTesting: boolean;
  modalTestStatus: { ok: boolean; msg: string } | null;
  setModalTestStatus: React.Dispatch<React.SetStateAction<{ ok: boolean; msg: string } | null>>;
  modalError: string | null;
  setModalError: React.Dispatch<React.SetStateAction<string | null>>;
  modalKeyInputRef: React.RefObject<HTMLInputElement | null>;
  resetModalDrafts: () => void;
  modalSelectedPlatform: ProviderCatalogEntry | null;
  modalFilteredPlatforms: ProviderCatalogEntry[];
  canProbeInModal: boolean;

  // Discovery
  discoveryProvider: string;
  setDiscoveryProvider: React.Dispatch<React.SetStateAction<string>>;
  discoveryModels: CatalogModel[];
  discoveryLoading: boolean;
  discoveryError: string | null;
  modelsCapFilter: 'all' | 'vision' | 'tools' | 'json';
  setModelsCapFilter: React.Dispatch<React.SetStateAction<'all' | 'vision' | 'tools' | 'json'>>;
  modelsSearch: string;
  setModelsSearch: React.Dispatch<React.SetStateAction<string>>;
  hasStaleDiscovery: boolean;

  // Quotas & Telemetry
  quotaData: QuotaDashboardResponse | null;
  quotaLoading: boolean;
  quotaError: string | null;
  quotaRequiresReauth: boolean;
  basicLimitDraft: string;
  setBasicLimitDraft: React.Dispatch<React.SetStateAction<string>>;
  premiumLimitDraft: string;
  setPremiumLimitDraft: React.Dispatch<React.SetStateAction<string>>;
  enterpriseLimitDraft: string;
  setEnterpriseLimitDraft: React.Dispatch<React.SetStateAction<string>>;
  adminLimitDraft: string;
  setAdminLimitDraft: React.Dispatch<React.SetStateAction<string>>;
  quotaSaving: boolean;
  engineStatus: EngineStatusResponse | null;
  engineMetrics: EngineMetricsResponse | null;

  // Playground & Gateway
  playgroundModel: string;
  setPlaygroundModel: React.Dispatch<React.SetStateAction<string>>;
  playgroundPrompt: string;
  setPlaygroundPrompt: React.Dispatch<React.SetStateAction<string>>;
  playgroundOutput: string;
  playgroundMeta: string;
  playgroundRunning: boolean;
  snippetLang: 'curl' | 'python' | 'typescript' | 'claude';
  setSnippetLang: React.Dispatch<React.SetStateAction<'curl' | 'python' | 'typescript' | 'claude'>>;
  copiedId: string | null;
  gatewayOrigin: string;
  handleCopy: (text: string, id: string) => void;

  // Core Mutation Handlers
  commitSettingsPatch: (
    payload: Record<string, any>,
    successMessage: string,
    options?: { force?: boolean }
  ) => Promise<AiSettingsApiResponse | null>;
  probeStoredProvider: (providerId: string) => Promise<void>;
  handleCheckAll: () => Promise<void>;
  handleToggleProvider: (p: ProviderCatalogEntry, nextEnabled: boolean) => Promise<void>;
  handleSaveRowSingleKey: (p: ProviderCatalogEntry) => Promise<void>;
  handleSaveRowPool: (p: ProviderCatalogEntry) => Promise<void>;
  handleSaveRowConfig: (p: ProviderCatalogEntry) => Promise<void>;
  handleSetPrimaryImmediate: (p: ProviderCatalogEntry) => Promise<void>;
  handleConfirmClearKey: () => Promise<void>;
  handleModalProbeBeforeSave: () => Promise<void>;
  handleModalSaveAndActivate: () => Promise<void>;
  handleSaveQuotaLimits: (e: React.FormEvent) => Promise<void>;
  handleConfirmQuotaReset: (globalAll?: boolean) => Promise<void>;
  handleDiscoveryFetch: (providerId: string) => Promise<void>;
  handleRunPlayground: () => Promise<void>;
  handleRestoreV2Flag: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadQuotaAndTelemetry: () => Promise<void>;
  redirectOn401: (err: unknown) => boolean;
}
