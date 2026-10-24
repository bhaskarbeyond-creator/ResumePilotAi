import type { EngineViewSubtab } from '../types/ai-settings.types';

export const FRONTIER_IDS = new Set([
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

export const VALID_SUBTABS = new Set<string>([
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

export const VALID_DIALOGS = new Set<string>([
  'configure-provider',
  'key-pool',
  'cooldowns',
  'discovery',
  'snippets',
  'confirm-clear-key',
  'confirm-reset-user-quota',
  'confirm-reset-all-quotas',
]);

export const SUBTAB_ITEMS: Array<{ id: EngineViewSubtab; label: string; superOnly?: boolean }> = [
  { id: 'providers', label: 'Providers' },
  { id: 'key-pool', label: 'Key Pools' },
  { id: 'discovery', label: 'Model Catalog' },
  { id: 'metrics', label: 'Quotas & Telemetry' },
  { id: 'unified-gateway', label: 'Unified Gateway' },
  { id: 'claude', label: 'Claude Code CLI' },
  { id: 'playground', label: 'Playground', superOnly: true },
];
