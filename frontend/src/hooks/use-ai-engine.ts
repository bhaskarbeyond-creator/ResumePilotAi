/**
 * AI Multi-Provider Engine — data layer.
 *
 * EVERY value rendered by the engine console comes through this file, and this
 * file only calls endpoints that already exist in the backend:
 *
 *   GET  /api/admin/ai-settings                configuration + credential state
 *   POST /api/admin/ai-settings                revisioned save (write-only secrets)
 *   POST /api/admin/ai/test-provider           single real provider round-trip
 *   POST /api/admin/ai/fetch-models            live model discovery per provider
 *   GET  /api/admin/ai/quota-stats             usage ledger (MariaDB)
 *   POST /api/admin/ai/quota-limits            tier limits (revisioned)
 *   POST /api/admin/ai/reset-quota             per-user / global reset
 *   GET  /api/platform/operational-status/ai-providers    authoritative health row
 *   GET  /api/service-availability             public boolean availability beacon
 *
 * HONESTY RULES enforced here:
 *   • no fallback value ever impersonates a measurement (no default latency,
 *     no synthesised provider "score", no invented request counts);
 *   • a failed request stays a failure and is surfaced with the server's own
 *     code/message;
 *   • client-side timings are clearly labelled as client-measured.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, normalizeError, post } from '@/lib/api-client';
import type { ProviderId } from '@/components/admin/ai-engine/registry';
import { PROVIDER_IDS, modelFieldFor, secretFieldFor } from '@/components/admin/ai-engine/registry';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface ProviderRuntimeState {
  id: ProviderId;
  enabled: boolean;
  model: string;
  baseUrl: string;
  credentialConfigured: boolean;
  credentialSource: string;
  environmentManaged: boolean;
  maskedKey: string;
}

export interface AiSettings {
  provider: ProviderId;
  temperature: number;
  maxTokens: number;
  enableFallback: boolean;
  enableImportModule: boolean;
  model: string;
  nvidiaModel: string;
  openaiModel: string;
  groqModel: string;
  openrouterModel: string;
  deepseekModel: string;
}

export interface AiSettingsResponse {
  success?: boolean;
  settings: Partial<AiSettings>;
  providers?: Partial<Record<ProviderId, ProviderRuntimeState>>;
  configuredProviders: Partial<Record<ProviderId, boolean>>;
  credentialSources: Partial<Record<ProviderId, string>>;
  maskedKeys: Partial<Record<ProviderId, string>>;
  environmentManaged?: Partial<Record<ProviderId, boolean>>;
  revision: number;
  source: string;
  /** 'mariadb' | 'in-memory-certification' — where a save would land. */
  persistence?: string;
}

export interface ProviderTestResult {
  provider: ProviderId;
  model?: string;
  message?: string;
  /** Milliseconds measured in THIS browser around the request. Never invented. */
  clientDurationMs: number;
  testedAt: string;
}

export interface CatalogModel {
  id: string;
  name?: string;
  owned_by?: string;
}

export interface CatalogResult {
  provider: ProviderId;
  count: number;
  models: CatalogModel[];
  fetchedAt: string;
  /** Milliseconds measured in THIS browser around the request. */
  clientDurationMs: number;
}

export interface ProviderCatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  result?: CatalogResult;
  error?: { code?: string; message: string };
}

export interface OperationalService {
  id: string;
  name: string;
  group: string;
  state: string;
  configuration: string;
  reason: string;
  critical: boolean;
  dependency?: string;
  errorCategory?: string | null;
  remediation?: string;
  affectedFeatures?: string[];
  affectedApis?: string[];
  affectedUiModules?: string[];
  metrics?: Record<string, number>;
  testable?: boolean;
  checkedAt?: string;
  docsHref?: string | null;
}

export interface RelatedEndpoint {
  method: string;
  path: string;
  module: string;
  authentication?: string;
  dependency?: string;
  dependencyId?: string;
  externalDependency?: boolean;
  state?: string;
  reason?: string;
}

export interface AiPlatformServiceResponse {
  service: OperationalService;
  checkedAt: string;
  relatedEndpoints?: RelatedEndpoint[];
}

export interface ServiceAvailability {
  success: boolean;
  checkedAt?: string;
  ai?: {
    providers?: boolean;
    available?: boolean;
    degraded?: boolean;
    configured?: number;
  };
}

export interface QuotaRecord {
  docId?: string;
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  membership?: string;
  count: number;
  limit: number;
}

export interface QuotaStats {
  limits: { basic: number; premium: number; enterprise?: number; admin: number };
  todayRecords: QuotaRecord[];
  today: string;
  totalHistoricalRecords: number;
  quotaRevision: number;
}

export interface ApiErrorShape {
  code?: string;
  message: string;
  status?: number;
  details?: unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Normalises anything thrown by the api-client into `{ code, message, status }`.
 *
 * The api-client rejects with the raw axios error, whose `.code` is a transport
 * string (ERR_BAD_RESPONSE) and whose message is generic. The backend's own
 * `{ error: { code, message } }` contract is what the operator needs to see —
 * `normalizeError` is the single place that already knows how to extract it, so
 * every AI console failure surfaces the server's code instead of axios's.
 */
export function toApiError(error: unknown): ApiErrorShape {
  if (error && typeof error === 'object' && ('isAxiosError' in error || 'response' in error || 'config' in error)) {
    const normalised = normalizeError(error);
    return {
      code: normalised.code,
      message: normalised.message,
      status: normalised.status || undefined,
      details: normalised.details,
    };
  }
  const value = error as { code?: string; message?: string; status?: number; details?: unknown } | null;
  return {
    code: typeof value?.code === 'string' ? value.code : undefined,
    message: typeof value?.message === 'string' && value.message ? value.message : 'The request failed.',
    status: typeof value?.status === 'number' ? value.status : undefined,
    details: value?.details,
  };
}

/** Every provider gets an explicit runtime row; absent data stays absent, not "healthy". */
export function normaliseProviderStates(response: AiSettingsResponse | undefined) {
  const result = {} as Record<ProviderId, ProviderRuntimeState>;
  for (const id of PROVIDER_IDS) {
    const remote = response?.providers?.[id];
    const configured = response?.configuredProviders?.[id] === true;
    const source = response?.credentialSources?.[id];
    result[id] = {
      id,
      enabled: remote?.enabled === true,
      model: remote?.model ?? (response?.settings?.[modelFieldFor(id) as keyof AiSettings] as string) ?? '',
      baseUrl: remote?.baseUrl ?? '',
      credentialConfigured: remote?.credentialConfigured ?? configured,
      credentialSource: remote?.credentialSource ?? (typeof source === 'string' ? source : 'none'),
      environmentManaged: remote?.environmentManaged ?? response?.environmentManaged?.[id] === true,
      maskedKey: remote?.maskedKey ?? response?.maskedKeys?.[id] ?? '',
    };
  }
  return result;
}

export function engineStatusFrom(service: OperationalService | undefined, availability: ServiceAvailability | undefined) {
  if (service) {
    if (service.state === 'OPERATIONAL') return { tone: 'ready' as const, label: 'Operational', detail: service.reason };
    if (service.state === 'DEGRADED' || service.state === 'UNKNOWN') return { tone: 'degraded' as const, label: service.state === 'UNKNOWN' ? 'Unknown' : 'Degraded', detail: service.reason };
    if (service.state === 'NOT_CONFIGURED') return { tone: 'unconfigured' as const, label: 'Not configured', detail: service.reason };
    if (service.state === 'DISABLED' || service.state === 'NOT_SUPPORTED') return { tone: 'unconfigured' as const, label: 'Disabled', detail: service.reason };
    return { tone: 'unavailable' as const, label: service.state === 'UNAVAILABLE' ? 'Unavailable' : 'Attention', detail: service.reason };
  }
  const ai = availability?.ai;
  if (ai && (typeof ai.providers === 'boolean' || typeof ai.degraded === 'boolean')) {
    if (ai.degraded === true) return { tone: 'degraded' as const, label: 'Degraded', detail: 'Configured providers could not be confirmed by the operational probe.' };
    if (ai.providers === true || ai.available === true) return { tone: 'ready' as const, label: 'Available', detail: 'The public availability beacon reports at least one reachable provider.' };
    return { tone: 'unconfigured' as const, label: 'Not available', detail: 'The public availability beacon reports no reachable AI provider.' };
  }
  return { tone: 'unknown' as const, label: 'Unknown', detail: 'No health measurement has been returned yet.' };
}

// ──────────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────────

export const aiEngineKeys = {
  settings: ['ai-engine', 'settings'] as const,
  platformService: ['ai-engine', 'platform-service'] as const,
  availability: ['ai-engine', 'availability'] as const,
  quota: ['ai-engine', 'quota'] as const,
};

export function useAiEngineSettings() {
  return useQuery({
    queryKey: aiEngineKeys.settings,
    queryFn: () => get<AiSettingsResponse>('/admin/ai-settings'),
    staleTime: 15_000,
    retry: false,
  });
}

export function useAiPlatformService() {
  return useQuery({
    queryKey: aiEngineKeys.platformService,
    queryFn: () => get<AiPlatformServiceResponse>('/platform/operational-status/ai-providers'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useAiAvailability() {
  return useQuery({
    queryKey: aiEngineKeys.availability,
    queryFn: async (): Promise<ServiceAvailability> => {
      const response = await fetch('/api/service-availability', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Availability beacon returned HTTP ${response.status}`);
      return response.json();
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useAiQuota() {
  return useQuery({
    queryKey: aiEngineKeys.quota,
    queryFn: () => get<QuotaStats & { success: boolean }>('/admin/ai/quota-stats'),
    staleTime: 30_000,
    retry: false,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────────

export interface SavePayload {
  primaryProvider: ProviderId;
  enableFallback: boolean;
  temperature: number;
  maxTokens: number;
  enableImportModule: boolean;
  providers: Record<ProviderId, { enabled: boolean; model: string; baseUrl: string }>;
  secrets: Partial<Record<ProviderId, string>>;
  clearSecrets: Partial<Record<ProviderId, boolean>>;
  expectedRevision: number;
}

/**
 * Builds the exact body POST /api/admin/ai-settings expects. Built here (once)
 * so the panel can never send a field the backend would silently ignore.
 */
export function buildSaveBody(payload: SavePayload) {
  const body: Record<string, unknown> = {
    provider: payload.primaryProvider,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
    enableFallback: payload.enableFallback,
    enableImportModule: payload.enableImportModule,
    expectedRevision: payload.expectedRevision,
  };
  for (const id of PROVIDER_IDS) {
    const state = payload.providers[id];
    if (!state) continue;
    body[`enable${id.charAt(0).toUpperCase()}${id.slice(1)}`] = state.enabled;
    if (state.model) body[modelFieldFor(id)] = state.model;
    // Blank preserves the stored override. `__clear__` is this console's UI
    // token for "reset to provider default"; the backend's explicit clear value
    // is the literal string "none", so the translation happens here and nowhere
    // near the input element.
    if (state.baseUrl === '__clear__') body[`${id}BaseUrl`] = 'none';
    else if (state.baseUrl) body[`${id}BaseUrl`] = state.baseUrl;
    const secret = payload.secrets[id];
    if (secret && secret.trim()) body[secretFieldFor(id)] = secret.trim();
  }
  const clear = Object.fromEntries(Object.entries(payload.clearSecrets).filter(([, value]) => value === true));
  if (Object.keys(clear).length > 0) body.clearSecrets = clear;
  return body;
}

export function useSaveAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SavePayload) => post<AiSettingsResponse>('/admin/ai-settings', buildSaveBody(payload)),
    onSuccess: (data) => {
      queryClient.setQueryData(aiEngineKeys.settings, data);
      queryClient.invalidateQueries({ queryKey: aiEngineKeys.platformService });
      queryClient.invalidateQueries({ queryKey: aiEngineKeys.availability });
    },
  });
}

export function useTestProvider() {
  return useMutation({
    mutationFn: async ({ provider, model, apiKey }: { provider: ProviderId; model?: string; apiKey?: string }) => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const response = await post<{ success?: boolean; provider?: ProviderId; model?: string; message?: string }>(
        '/admin/ai/test-provider',
        { provider, model: model || undefined, apiKey: apiKey && apiKey.trim() ? apiKey.trim() : undefined },
      );
      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        provider: response.provider ?? provider,
        model: response.model,
        message: response.message,
        clientDurationMs: Math.max(0, Math.round(finishedAt - startedAt)),
        testedAt: new Date().toISOString(),
      } satisfies ProviderTestResult;
    },
  });
}

export function useFetchModels() {
  return useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: ProviderId; apiKey?: string }) => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const response = await post<{ provider?: ProviderId; count?: number; models?: CatalogModel[] }>(
        '/admin/ai/fetch-models',
        { provider, apiKey: apiKey && apiKey.trim() ? apiKey.trim() : undefined },
      );
      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        provider: response.provider ?? provider,
        count: typeof response.count === 'number' ? response.count : (response.models?.length ?? 0),
        models: Array.isArray(response.models) ? response.models : [],
        fetchedAt: new Date().toISOString(),
        clientDurationMs: Math.max(0, Math.round(finishedAt - startedAt)),
      } satisfies CatalogResult;
    },
  });
}

export function useSaveQuotaLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { basicDailyLimit: number; premiumDailyLimit: number; adminDailyLimit: number; expectedRevision: number }) =>
      post<{ success: boolean; revision?: number; message?: string; remoteRevision?: number }>('/admin/ai/quota-limits', input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: aiEngineKeys.quota }),
  });
}

export function useResetQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { uid?: string; all?: boolean }) => post<{ success: boolean; deletedCount?: number; message?: string }>('/admin/ai/reset-quota', input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: aiEngineKeys.quota }),
  });
}
