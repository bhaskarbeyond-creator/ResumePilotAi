/**
 * AI provider registry — PRESENTATION METADATA ONLY.
 *
 * Everything here is either a constant of the product (which providers the
 * backend adapter layer supports, their canonical ids, the configuration seed
 * models the runtime falls back to) or a link a human can follow. It contains
 * NO telemetry: no latency, no success rate, no request count, no "score".
 *
 * Live facts (credential presence, enabled state, effective model, discovery
 * results, connectivity results) are fetched from the backend and rendered
 * only when a real response says so. See use-ai-engine.ts.
 */

export type ProviderId = 'nvidia' | 'gemini' | 'openai' | 'groq' | 'openrouter' | 'deepseek';

export interface SeedModel {
  id: string;
  label: string;
  note?: string;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  vendor: string;
  /** One-line description of the transport the runtime uses. */
  transport: string;
  /** Where an operator obtains a key. Documentation link only. */
  consoleUrl: string;
  docsUrl: string;
  /** Canonical model fields used by POST /api/admin/ai-settings. */
  enableField: string;
  modelField: string;
  secretField: string;
  /** True when the adapter exposes a live /models catalogue endpoint. */
  supportsDiscovery: boolean;
  /** True when the adapter honours an operator base-URL override. */
  supportsBaseUrl: boolean;
  /** Configuration SEEDS — not a claim about what the provider currently serves. */
  seeds: SeedModel[];
  /** Placeholder for the free-text model input, derived from this provider's ids. */
  modelPlaceholder: string;
  /** Presentation accent. Tailwind classes, never data. */
  accent: {
    ring: string;
    chip: string;
    text: string;
    dot: string;
  };
}

const ACCENT = {
  emerald: {
    ring: 'ring-emerald-200 dark:ring-emerald-900/60',
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  blue: {
    ring: 'ring-blue-200 dark:ring-blue-900/60',
    chip: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  violet: {
    ring: 'ring-violet-200 dark:ring-violet-900/60',
    chip: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-900',
    text: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  amber: {
    ring: 'ring-amber-200 dark:ring-amber-900/60',
    chip: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  rose: {
    ring: 'ring-rose-200 dark:ring-rose-900/60',
    chip: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900',
    text: 'text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  cyan: {
    ring: 'ring-cyan-200 dark:ring-cyan-900/60',
    chip: 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-200 dark:border-cyan-900',
    text: 'text-cyan-700 dark:text-cyan-300',
    dot: 'bg-cyan-500',
  },
} as const;

export const PROVIDER_REGISTRY: readonly ProviderMeta[] = Object.freeze([
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    vendor: 'NVIDIA',
    transport: 'OpenAI-compatible · /v1/chat/completions',
    consoleUrl: 'https://build.nvidia.com/',
    docsUrl: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
    enableField: 'enableNvidia',
    modelField: 'nvidiaModel',
    secretField: 'nvidiaApiKey',
    supportsDiscovery: true,
    supportsBaseUrl: true,
        modelPlaceholder: 'meta/llama-3.3-70b-instruct',
    seeds: [
      { id: 'meta/llama-3.2-11b-vision-instruct', label: 'Llama 3.2 11B Vision Instruct', note: 'Runtime default seed' },
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nemotron 70B Instruct', note: 'High-accuracy reasoning' },
      { id: 'openai/gpt-oss-20b', label: 'GPT OSS 20B', note: 'Low-latency' },
      { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B', note: 'Heavy reasoning' },
      { id: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2 Instruct' },
    ],
    accent: ACCENT.emerald,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    vendor: 'Google',
    transport: 'v1beta generateContent · /v1beta/models',
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    enableField: 'enableGemini',
    modelField: 'model',
    secretField: 'geminiApiKey',
    supportsDiscovery: true,
    supportsBaseUrl: true,
        modelPlaceholder: 'gemini-2.0-flash-preview',
    seeds: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Runtime default seed' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
    accent: ACCENT.blue,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    vendor: 'OpenAI',
    transport: 'OpenAI-compatible · /v1/chat/completions',
    consoleUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    enableField: 'enableOpenai',
    modelField: 'openaiModel',
    secretField: 'openaiApiKey',
    supportsDiscovery: true,
    supportsBaseUrl: true,
        modelPlaceholder: 'gpt-4.1-mini',
    seeds: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Runtime default seed' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
    accent: ACCENT.violet,
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    vendor: 'Groq',
    transport: 'OpenAI-compatible · /openai/v1/chat/completions',
    consoleUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/api-reference',
    enableField: 'enableGroq',
    modelField: 'groqModel',
    secretField: 'groqApiKey',
    supportsDiscovery: true,
    supportsBaseUrl: true,
        modelPlaceholder: 'llama-3.1-8b-instant',
    seeds: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', note: 'Runtime default seed' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B 32k' },
    ],
    accent: ACCENT.amber,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    vendor: 'OpenRouter',
    transport: 'Multi-gateway · /api/v1/chat/completions',
    consoleUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs/api-reference/overview',
    enableField: 'enableOpenrouter',
    modelField: 'openrouterModel',
    secretField: 'openrouterApiKey',
    supportsDiscovery: true,
    supportsBaseUrl: true,
        modelPlaceholder: 'qwen/qwen3-32b',
    seeds: [
      { id: 'openrouter/auto', label: 'OpenRouter Auto', note: 'Runtime default seed' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct' },
    ],
    accent: ACCENT.cyan,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: 'DeepSeek',
    transport: 'OpenAI-compatible · /chat/completions',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    enableField: 'enableDeepseek',
    modelField: 'deepseekModel',
    secretField: 'deepseekApiKey',
    supportsDiscovery: true,
    supportsBaseUrl: true,
        modelPlaceholder: 'deepseek-reasoner',
    seeds: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', note: 'Runtime default seed' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
    accent: ACCENT.rose,
  },
]);

export const PROVIDER_IDS: readonly ProviderId[] = PROVIDER_REGISTRY.map((p) => p.id);

export function providerMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

/** The canonical `/api/admin/ai-settings` payload field for a provider's model. */
export function modelFieldFor(id: ProviderId): string {
  return providerMeta(id)?.modelField ?? 'model';
}

export function secretFieldFor(id: ProviderId): string {
  return providerMeta(id)?.secretField ?? `${id}ApiKey`;
}

export const CREDENTIAL_SOURCE_LABEL: Record<string, string> = {
  environment: 'Deployment environment',
  'mariadb-secret-store': 'Server secret store',
  'mariadb-legacy-setting': 'Legacy settings row',
  none: 'Not configured',
};
