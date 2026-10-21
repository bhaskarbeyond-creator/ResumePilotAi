'use strict';

/**
 * FreeLLMAPI Platform Configuration Loader
 *
 * Bridges the durable, Super-Admin-managed credential store (`system_settings`
 * category `ai_providers`) and the deployment environment to the pure engine in
 * `backend/freellmapi/`.
 *
 * Kept outside the engine on purpose: the engine stays 100% pure JavaScript with
 * no repository/database dependency, so it can be unit-tested with a fake fetch
 * and embedded in any process.
 *
 * Credential precedence (highest first):
 *   1. environment variable registered on the provider (`envKey`)
 *   2. `ai_providers[<id>].apiKeys[]`  (multi-key pool)
 *   3. `ai_providers[<id>].apiKey`     (single key / comma-separated pool)
 *   4. legacy `system_settings.ai.<provider>ApiKey`
 *
 * Search and media providers are included: the engine's chat router filters them
 * out, while `/v1/search` consumes them.
 */

const { PROVIDER_REGISTRY } = require('../freellmapi/providers/registry');

const LEGACY_SECRET_FIELDS = Object.freeze({
  gemini: 'geminiApiKey', nvidia: 'nvidiaApiKey', openai: 'openaiApiKey',
  groq: 'groqApiKey', openrouter: 'openrouterApiKey', deepseek: 'deepseekApiKey',
});

const CONFIG_CACHE_MS = 10_000;
let configCache = null;

function clearFreeLlmConfigCache() {
  configCache = null;
}

function splitKeyPool(value) {
  const pieces = [];
  const push = entry => {
    for (const part of String(entry || '').split(/[\n,]+/)) {
      const key = part.trim();
      if (key && !pieces.includes(key)) pieces.push(key);
    }
  };
  if (Array.isArray(value)) value.forEach(push);
  else if (value) push(value);
  return pieces;
}

/**
 * Build the `{ primary, enableFallback, providers }` object the engine expects.
 * Never returns raw key material to a caller that logs it — callers must treat
 * this object as secret.
 */
async function loadFreeLlmPlatformConfig({ environment = process.env, repository = null, repositoryGetter = null, bypassCache = false } = {}) {
  if (!bypassCache && configCache && configCache.expiresAt > Date.now()) {
    return configCache.value;
  }
  let repo = repository;
  if (!repo && repositoryGetter) repo = repositoryGetter();
  if (!repo) {
    repo = require('../repositories').getRepository();
  }

  const [secrets, publicConfig, systemSettings] = await Promise.all([
    repo.getSetting('ai_providers').catch(() => null),
    repo.getSetting('public_config').catch(() => null),
    repo.getSetting('system_settings').catch(() => null),
  ]);

  const providerSecrets = secrets || {};
  const publicAi = publicConfig?.ai || {};
  const legacyAi = systemSettings?.ai || {};
  const providers = {};

  for (const [id, meta] of Object.entries(PROVIDER_REGISTRY)) {
    const stored = providerSecrets[id] || {};
    let keys = splitKeyPool(stored.apiKeys);
    if (keys.length === 0) keys = splitKeyPool(stored.apiKey);
    if (keys.length === 0) keys = splitKeyPool(environment[meta.envKey || `${id.toUpperCase()}_API_KEY`]);
    if (keys.length === 0) keys = splitKeyPool(legacyAi[LEGACY_SECRET_FIELDS[id]]);
    if (keys.length === 0 && meta.keyless) keys = ['keyless'];
    if (keys.length === 0) continue;

    const model = String(stored.model || '').trim();
    const baseUrl = String(stored.baseUrl || '').trim();
    const enabled = stored.disabled !== true && stored.enabled !== false;
    if (!enabled) continue;

    providers[id] = {
      key: keys.length === 1 ? keys[0] : keys,
      apiKeys: keys,
      enabled: true,
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    };
  }

  const primary = publicAi.provider && providers[publicAi.provider]
    ? publicAi.provider
    : (providers.groq ? 'groq' : Object.keys(providers)[0] || 'groq');

  const configuration = {
    primary,
    enableFallback: publicAi.enableFallback !== false,
    temperature: Number.isFinite(Number(publicAi.temperature)) ? Number(publicAi.temperature) : 0.3,
    maxTokens: Number.isFinite(Number(publicAi.maxTokens)) ? Number(publicAi.maxTokens) : 4096,
    promptTokenBudget: Number(environment.FREELMAPI_PROMPT_TOKEN_BUDGET || publicAi.promptTokenBudget || 0) || null,
    providers,
    source: 'MARIADB_AND_DEPLOYMENT_ENVIRONMENT',
  };
  configCache = { value: configuration, expiresAt: Date.now() + CONFIG_CACHE_MS };
  return configuration;
}

/** Platform API keys accepted by the public `/v1/*` gateway. */
function platformApiKeys(environment = process.env) {
  return splitKeyPool(environment.FREELMAPI_API_KEYS || environment.IME365_V1_API_KEYS || '');
}

module.exports = {
  loadFreeLlmPlatformConfig,
  clearFreeLlmConfigCache,
  platformApiKeys,
  splitKeyPool,
};
