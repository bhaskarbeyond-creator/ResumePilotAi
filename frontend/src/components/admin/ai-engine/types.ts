/**
 * Draft model for the AI Multi-Provider Engine editor.
 *
 * The draft is the ONLY editable client state. It is initialised from a real
 * GET /api/admin/ai-settings response and is never seeded with placeholder
 * telemetry, so an untouched panel shows exactly what the server holds.
 */

import type { AiSettingsResponse, ProviderCatalogState, ProviderRuntimeState } from '@/hooks/use-ai-engine';
import { PROVIDER_IDS, modelFieldFor, type ProviderId } from './registry';

export type SectionId = 'overview' | 'providers' | 'catalog' | 'usage' | 'telemetry';

export const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Routing posture, engine health and failover order' },
  { id: 'providers', label: 'Providers', hint: 'Credentials, models and per-provider reachability' },
  { id: 'catalog', label: 'Model catalogue', hint: 'Live discovery of the models each provider actually serves' },
  { id: 'usage', label: 'Quota & usage', hint: 'Tier limits, today’s ledger and resets' },
  { id: 'telemetry', label: 'Telemetry', hint: 'Platform health, availability beacon and endpoint matrix' },
];

export interface ProviderDraft {
  enabled: boolean;
  model: string;
  baseUrl: string;
}

export interface EngineDraft {
  primaryProvider: ProviderId;
  enableFallback: boolean;
  temperature: number;
  maxTokens: number;
  enableImportModule: boolean;
  providers: Record<ProviderId, ProviderDraft>;
}

export type CatalogMap = Partial<Record<ProviderId, ProviderCatalogState>>;

export interface ProviderTestState {
  status: 'running' | 'ok' | 'error';
  message: string;
  /** Measured in this browser around the HTTP request; absent while running. */
  clientDurationMs?: number;
  at: string;
  code?: string;
}

export type TestMap = Partial<Record<ProviderId, ProviderTestState>>;

export function draftFromSettings(response: AiSettingsResponse | undefined): EngineDraft {
  const settings = response?.settings ?? {};
  const providers = {} as Record<ProviderId, ProviderDraft>;
  for (const id of PROVIDER_IDS) {
    const remote: ProviderRuntimeState | undefined = response?.providers?.[id];
    providers[id] = {
      enabled: remote?.enabled === true,
      model: remote?.model || (settings[modelFieldFor(id) as keyof typeof settings] as string) || '',
      baseUrl: remote?.baseUrl || '',
    };
  }
  const primary = (settings.provider as ProviderId | undefined) ?? 'gemini';
  return {
    primaryProvider: PROVIDER_IDS.includes(primary) ? primary : 'gemini',
    enableFallback: settings.enableFallback !== false,
    temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.7,
    maxTokens: typeof settings.maxTokens === 'number' ? settings.maxTokens : 2048,
    enableImportModule: settings.enableImportModule === true,
    providers,
  };
}

export function draftEquals(a: EngineDraft, b: EngineDraft): boolean {
  if (
    a.primaryProvider !== b.primaryProvider ||
    a.enableFallback !== b.enableFallback ||
    a.temperature !== b.temperature ||
    a.maxTokens !== b.maxTokens ||
    a.enableImportModule !== b.enableImportModule
  ) {
    return false;
  }
  return PROVIDER_IDS.every(
    (id) =>
      a.providers[id].enabled === b.providers[id].enabled &&
      a.providers[id].model === b.providers[id].model &&
      a.providers[id].baseUrl === b.providers[id].baseUrl,
  );
}

/** Human-readable list of the fields that differ — used by the "unsaved" bar. */
export function changedFieldLabels(draft: EngineDraft, baseline: EngineDraft): string[] {
  const labels: string[] = [];
  if (draft.primaryProvider !== baseline.primaryProvider) labels.push('Primary provider');
  if (draft.enableFallback !== baseline.enableFallback) labels.push('Fallback circuit');
  if (draft.temperature !== baseline.temperature) labels.push('Temperature');
  if (draft.maxTokens !== baseline.maxTokens) labels.push('Max tokens');
  if (draft.enableImportModule !== baseline.enableImportModule) labels.push('Resume import module');
  for (const id of PROVIDER_IDS) {
    const a = draft.providers[id];
    const b = baseline.providers[id];
    if (a.enabled !== b.enabled) labels.push(`${id} enabled`);
    if (a.model !== b.model) labels.push(`${id} model`);
    if (a.baseUrl !== b.baseUrl) labels.push(`${id} base URL`);
  }
  return labels;
}

/** Ordered failover chain: the primary first, then the remaining providers. */
export function failoverChain(draft: EngineDraft): ProviderId[] {
  const rest = PROVIDER_IDS.filter((id) => id !== draft.primaryProvider);
  return draft.enableFallback ? [draft.primaryProvider, ...rest] : [draft.primaryProvider];
}
