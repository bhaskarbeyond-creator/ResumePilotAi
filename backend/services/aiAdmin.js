'use strict';

const { PROVIDERS, PROVIDER_DEFAULTS, clearProviderConfigurationCache, loadProviderConfiguration, requestProvider } = require('./aiRuntime');

const SECRET_FIELDS = Object.freeze({
  gemini: 'geminiApiKey', nvidia: 'nvidiaApiKey', openai: 'openaiApiKey',
  groq: 'groqApiKey', openrouter: 'openrouterApiKey', deepseek: 'deepseekApiKey',
});
const MODEL_FIELDS = Object.freeze({
  gemini: 'model', nvidia: 'nvidiaModel', openai: 'openaiModel', groq: 'groqModel',
  openrouter: 'openrouterModel', deepseek: 'deepseekModel',
});
const ENABLE_FIELDS = Object.freeze({
  gemini: 'enableGemini', nvidia: 'enableNvidia', openai: 'enableOpenai', groq: 'enableGroq',
  openrouter: 'enableOpenrouter', deepseek: 'enableDeepseek',
});
function splitKeyPoolInput(value) {
  const keys = [];
  const push = entry => {
    for (const part of String(entry || '').split(/[\n,]+/)) {
      const key = part.trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
  };
  if (Array.isArray(value)) value.forEach(push);
  else if (value) push(value);
  return keys;
}

/** Mask every key in a pool, never returning more than a hint per key. */
function maskKeyPool(keys) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (list.length === 0) return '';
  if (list.length === 1) return maskApiKey(list[0]);
  return `${maskApiKey(list[0])} +${list.length - 1}`;
}
const modelPattern = /^[A-Za-z0-9._:/-]{1,150}$/;
const MASKED_PATTERN = /[•*]/;

function errorWith(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 10) return '••••••••••••••••••••••••';
  const prefixLen = trimmed.startsWith('nvapi-') ? 6 : trimmed.startsWith('sk-or-v1-') ? 9 : trimmed.startsWith('sk-proj-') ? 8 : trimmed.startsWith('AIzaSy') ? 6 : trimmed.startsWith('gsk_') ? 4 : 4;
  const head = trimmed.slice(0, prefixLen);
  const tail = trimmed.slice(-4);
  return `${head}${'•'.repeat(24)}${tail}`;
}

function publicAiSettings(input = {}) {
  if (input.provider && !PROVIDERS.includes(input.provider)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported primary AI provider.', 400);
  const provider = PROVIDERS.includes(input.provider) ? input.provider : 'gemini';
  const temperatureValue = Number(input.temperature ?? 0.7);
  const maxTokensValue = Number(input.maxTokens ?? 2048);
  const result = {
    provider,
    temperature: Number.isFinite(temperatureValue) ? Math.max(0, Math.min(1, temperatureValue)) : 0.7,
    maxTokens: Number.isFinite(maxTokensValue) ? Math.max(256, Math.min(4096, Math.floor(maxTokensValue))) : 2048,
    enableFallback: input.enableFallback !== false,
    enableImportModule: input.enableImportModule === true,
  };
  for (const item of PROVIDERS) {
    result[ENABLE_FIELDS[item]] = input[ENABLE_FIELDS[item]] !== false;
    const model = String(input[MODEL_FIELDS[item]] || '').trim();
    if (model && !modelPattern.test(model)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${item} model.`, 400);
    if (model) result[MODEL_FIELDS[item]] = model;
  }
  return result;
}

function secretPatch(input = {}, existing = {}, legacy = {}) {
  const patch = {};
  const clearSecrets = input.clearSecrets && typeof input.clearSecrets === 'object' ? input.clearSecrets : {};
  for (const provider of PROVIDERS) {
    const rawKey = String(input[SECRET_FIELDS[provider]] || '').trim();
    const rawPool = splitKeyPoolInput(input[`${provider}ApiKeys`] ?? input[provider]?.apiKeys);
    const pool = rawPool.filter(key => !MASKED_PATTERN.test(key));
    const isMasked = MASKED_PATTERN.test(rawKey);
    const explicitlyCleared = clearSecrets[provider] === true;
    const existingKey = existing[provider]?.apiKey || legacy[SECRET_FIELDS[provider]] || '';
    const existingPool = splitKeyPoolInput(existing[provider]?.apiKeys);

    if (rawKey && !isMasked && pool.length === 0) {
      if (rawKey.length < 12 || rawKey.length > 512) {
        throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} API key format.`, 400);
      }
    }
    for (const candidate of pool) {
      if (candidate.length < 12 || candidate.length > 512) {
        throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} API key format.`, 400);
      }
    }

    // Blank or masked fields preserve the current credential. Only the explicit
    // clearSecrets flag removes it; this prevents a reload/save from erasing a
    // working provider while still giving operators a deliberate revocation path.
    const finalKey = explicitlyCleared ? '' : ((!isMasked && rawKey) ? rawKey : existingKey);
    const model = String(
      input[MODEL_FIELDS[provider]] ||
      input[`${provider}Model`] ||
      input[provider]?.model ||
      ((input.provider === provider || input.providerId === provider) ? input.model : '') ||
      ''
    ).trim();
    // Optional operator endpoint override (self-hosted / private AI gateway).
    // Blank preserves the existing value; 'none' clears it.
    const rawBaseUrl = String(input[`${provider}BaseUrl`] || '').trim();
    const existingBaseUrl = existing[provider]?.baseUrl || '';
    let baseUrl = existingBaseUrl;
    if (rawBaseUrl && rawBaseUrl.toLowerCase() !== 'none') {
      if (!/^https?:\/\/[A-Za-z0-9._:/-]{1,300}$/.test(rawBaseUrl)) {
        throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} base URL.`, 400);
      }
      baseUrl = rawBaseUrl;
    } else if (rawBaseUrl.toLowerCase() === 'none') {
      baseUrl = '';
    }
    const nextPool = explicitlyCleared ? [] : (pool.length > 0 ? pool : (finalKey ? [finalKey] : existingPool));
    patch[provider] = {
      ...(existing[provider] || {}),
      ...(nextPool.length > 0 ? { apiKey: nextPool[0], apiKeys: nextPool } : {}),
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    };
    if (explicitlyCleared) {
      delete patch[provider].apiKey;
      delete patch[provider].apiKeys;
    }
    if (!baseUrl) delete patch[provider].baseUrl;
  }

  // Support saving and updating keys for all 74 FreeLLMAPI platforms
  const { PROVIDER_REGISTRY } = require('../freellmapi/providers/registry');
  for (const [pId, meta] of Object.entries(PROVIDER_REGISTRY)) {
    if (PROVIDERS.includes(pId)) continue;
    const rawKey = String(input[`${pId}ApiKey`] || input[pId]?.apiKey || '').trim();
    const rawPool = splitKeyPoolInput(input[`${pId}ApiKeys`] ?? input[pId]?.apiKeys);
    const pool = rawPool.filter(key => !MASKED_PATTERN.test(key));
    const isMasked = MASKED_PATTERN.test(rawKey);
    const explicitlyCleared = clearSecrets[pId] === true;
    const existingKey = existing[pId]?.apiKey || '';
    const existingPool = splitKeyPoolInput(existing[pId]?.apiKeys);
    const isKeyless = Boolean(meta.keyless);
    if (rawKey && !isMasked && pool.length === 0) {
      if (!isKeyless && (rawKey.length < 4 || rawKey.length > 512)) {
        throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${meta.name} API key format.`, 400);
      }
    }
    for (const candidate of pool) {
      if (!isKeyless && (candidate.length < 4 || candidate.length > 512)) {
        throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${meta.name} API key format.`, 400);
      }
    }
    const finalKey = explicitlyCleared ? '' : ((!isMasked && rawKey) ? rawKey : existingKey);
    const model = String(
      input[`${pId}Model`] ||
      input[pId]?.model ||
      ((input.provider === pId || input.providerId === pId) ? input.model : '') ||
      ''
    ).trim();
    const isExplicitlyActivated = input[`enable${pId.charAt(0).toUpperCase() + pId.slice(1)}`] === true || input[pId]?.enabled === true || rawKey === 'keyless';
    const nextPool = explicitlyCleared ? [] : (pool.length > 0 ? pool : (finalKey ? [finalKey] : existingPool));
    if (nextPool.length > 0 || existing[pId] || explicitlyCleared || (isKeyless && isExplicitlyActivated)) {
      patch[pId] = {
        ...(existing[pId] || {}),
        ...(nextPool.length > 0
          ? { apiKey: nextPool[0], apiKeys: nextPool }
          : (isKeyless ? { apiKey: 'keyless', apiKeys: ['keyless'] } : {})),
        ...(model ? { model } : {}),
        ...(isKeyless ? { keyless: true } : {}),
      };
      if (explicitlyCleared) {
        delete patch[pId].apiKey;
        delete patch[pId].apiKeys;
        delete patch[pId].keyless;
      }
    }
  }

  return patch;
}

const { getRepository } = require('../repositories');
const { getPool } = require('../database/mysql');
const crypto = require('crypto');

const CURATED_MODELS_CATALOG = [
  { id: 'dots3-note-preview', name: 'Dots3 Note Preview', providerCount: 2, providersText: '2 providers', rpm: '20 RPM', contextWindow: '512K ctx', supportsVision: true, supportsTools: true, reliabilityScore: 94, speedScore: 55, intelligenceScore: 99, guardrails: '-', compositeScore: 0.881, scoreSubtitle: 'best of 2', enabled: true },
  { id: 'nemotron-3-ultra-550b', name: 'Nemotron 3 Ultra 550B', providerCount: 2, providersText: '2 providers', rpm: '40 RPM', contextWindow: '1M ctx', supportsVision: false, supportsTools: true, reliabilityScore: 97, speedScore: 56, intelligenceScore: 74, guardrails: '-', compositeScore: 0.834, scoreSubtitle: 'best of 2', enabled: true },
  { id: 'kilo-auto', name: 'Kilo Auto', providerCount: 1, providersText: 'kilo', rpm: '200/hr', contextWindow: '256K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 96, speedScore: 34, intelligenceScore: 50, guardrails: '-', compositeScore: 0.650, enabled: true },
  { id: 'poolside-laguna-s-2.1', name: 'Poolside Laguna S 2.1', providerCount: 2, providersText: '2 providers', rpm: '20 RPM', contextWindow: '262K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 53, speedScore: 12, intelligenceScore: 74, guardrails: '-', compositeScore: 0.617, scoreSubtitle: 'best of 2', enabled: true },
  { id: 'gemma-4-31b-heretic', name: 'Gemma 4 31B Heretic', providerCount: 1, providersText: 'aihorde', rpm: 'Kudos queue (no token cap)', contextWindow: '4K ctx', supportsVision: false, supportsTools: false, reliabilityScore: 0, speedScore: 0, intelligenceScore: 74, guardrails: '-', compositeScore: 0.615, enabled: true },
  { id: 'poolside-laguna-xs-2.1', name: 'Poolside Laguna XS 2.1', providerCount: 3, providersText: '3 providers', rpm: '40 RPM', contextWindow: '262K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 37, speedScore: 31, intelligenceScore: 73, guardrails: '-', compositeScore: 0.614, scoreSubtitle: 'best of 3', enabled: true },
  { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', providerCount: 1, providersText: 'ovh', rpm: '2 RPM', contextWindow: '131K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 84, speedScore: 37, intelligenceScore: 50, guardrails: '-', compositeScore: 0.610, enabled: true },
  { id: 'nemotron-3-super-120b', name: 'Nemotron 3 Super 120B', providerCount: 3, providersText: '3 providers', rpm: '3.0M/mo', contextWindow: '1M ctx', supportsVision: false, supportsTools: true, reliabilityScore: 80, speedScore: 33, intelligenceScore: 50, guardrails: '-', compositeScore: 0.605, scoreSubtitle: 'best of 3', enabled: true },
  { id: 'nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning 30B A3B', providerCount: 1, providersText: 'nvidia', rpm: '40 RPM', contextWindow: '1M ctx', supportsVision: false, supportsTools: true, reliabilityScore: 89, speedScore: 2, intelligenceScore: 50, guardrails: '-', compositeScore: 0.559, enabled: true },
  { id: 'gpt-oss-20b', name: 'GPT-OSS 20B', providerCount: 2, providersText: '2 providers', rpm: '40 RPM', contextWindow: '131K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 60, speedScore: 54, intelligenceScore: 50, guardrails: '-', compositeScore: 0.547, scoreSubtitle: 'best of 2', enabled: true },
  { id: 'gemma-4-31b', name: 'Gemma 4 31B', providerCount: 1, providersText: 'openrouter', rpm: '20 RPM', contextWindow: '262K ctx', supportsVision: false, supportsTools: false, reliabilityScore: 31, speedScore: 60, intelligenceScore: 74, guardrails: '-', compositeScore: 0.540, enabled: true },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', providerCount: 3, providersText: 'groq', rpm: '30 RPM', contextWindow: '128K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 99, speedScore: 98, intelligenceScore: 95, guardrails: '-', compositeScore: 0.942, enabled: true },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', providerCount: 1, providersText: 'gemini', rpm: '15 RPM', contextWindow: '1M ctx', supportsVision: true, supportsTools: true, reliabilityScore: 99, speedScore: 94, intelligenceScore: 97, guardrails: '-', compositeScore: 0.965, enabled: true },
  { id: 'llama-3.2-11b-vision', name: 'Llama 3.2 11B Vision Instruct', providerCount: 1, providersText: 'nvidia', rpm: '40 RPM', contextWindow: '128K ctx', supportsVision: true, supportsTools: true, reliabilityScore: 98, speedScore: 92, intelligenceScore: 92, guardrails: '-', compositeScore: 0.915, enabled: true },
  { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', providerCount: 2, providersText: 'deepseek', rpm: '60 RPM', contextWindow: '64K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 97, speedScore: 88, intelligenceScore: 98, guardrails: '-', compositeScore: 0.950, enabled: true },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', providerCount: 1, providersText: 'deepseek', rpm: '30 RPM', contextWindow: '64K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 96, speedScore: 82, intelligenceScore: 99, guardrails: '-', compositeScore: 0.948, enabled: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerCount: 1, providersText: 'openai', rpm: '500 RPM', contextWindow: '128K ctx', supportsVision: true, supportsTools: true, reliabilityScore: 99, speedScore: 91, intelligenceScore: 97, guardrails: '-', compositeScore: 0.960, enabled: true },
  { id: 'qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct', providerCount: 2, providersText: 'modelscope', rpm: '30 RPM', contextWindow: '128K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 95, speedScore: 86, intelligenceScore: 96, guardrails: '-', compositeScore: 0.920, enabled: true },
  { id: 'cerebras-llama-3.3-70b', name: 'Cerebras Llama 3.3 70B', providerCount: 1, providersText: 'cerebras', rpm: '30 RPM', contextWindow: '8K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 98, speedScore: 100, intelligenceScore: 94, guardrails: '-', compositeScore: 0.952, enabled: true },
  { id: 'doubao-pro-32k', name: 'Doubao Pro 32K', providerCount: 1, providersText: 'volcengine', rpm: '60 RPM', contextWindow: '32K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 96, speedScore: 90, intelligenceScore: 94, guardrails: '-', compositeScore: 0.918, enabled: true },
  { id: 'ernie-speed-128k', name: 'Ernie Speed 128K', providerCount: 1, providersText: 'qianfan', rpm: '60 RPM', contextWindow: '128K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 94, speedScore: 88, intelligenceScore: 92, guardrails: '-', compositeScore: 0.905, enabled: true },
  { id: 'mistral-large-latest', name: 'Mistral Large 2', providerCount: 1, providersText: 'mistral', rpm: '60 RPM', contextWindow: '128K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 98, speedScore: 89, intelligenceScore: 96, guardrails: '-', compositeScore: 0.945, enabled: true },
  { id: 'glm-4-flash', name: 'GLM 4 Flash', providerCount: 1, providersText: 'zhipu', rpm: '60 RPM', contextWindow: '128K ctx', supportsVision: false, supportsTools: true, reliabilityScore: 95, speedScore: 92, intelligenceScore: 90, guardrails: '-', compositeScore: 0.912, enabled: true },
];

async function loadAiAdminSettings(environment = process.env) {
  const repo = getRepository();
  const [stored, secrets, systemSettings] = await Promise.all([
    repo.getSetting('public_config'),
    repo.getSetting('ai_providers'),
    repo.getSetting('system_settings'),
  ]);
  const publicConfig = stored || {};
  const providerSecrets = secrets || {};
  const legacyAi = systemSettings?.ai || {};
  const publicAi = publicConfig.ai || {};
  const credentialSources = Object.fromEntries(PROVIDERS.map(provider => [provider,
    environment[`${provider.toUpperCase()}_API_KEY`] ? 'environment'
      : providerSecrets[provider]?.apiKey ? 'mariadb-secret-store'
        : legacyAi[SECRET_FIELDS[provider]] ? 'mariadb-legacy-setting' : 'none'
  ]));
  const configuredProviders = Object.fromEntries(PROVIDERS.map(provider => [provider, credentialSources[provider] !== 'none']));
  const runtime = await loadProviderConfiguration(environment);
  const maskedKeys = Object.fromEntries(PROVIDERS.map(provider => [provider, maskApiKey(runtime.providers[provider]?.key || '')]));
  const publicFields = new Set([
    'provider', 'temperature', 'maxTokens', 'enableFallback', 'enableImportModule',
    ...Object.values(ENABLE_FIELDS), ...Object.values(MODEL_FIELDS),
  ]);
  const settings = Object.fromEntries(Object.entries(publicAi).filter(([key, value]) => publicFields.has(key)
    && ['string', 'number', 'boolean'].includes(typeof value)));
  settings.provider = PROVIDERS.includes(settings.provider) ? settings.provider : runtime.primary;
  settings.temperature = settings.temperature ?? runtime.temperature;
  settings.maxTokens = settings.maxTokens ?? runtime.maxTokens;
  settings.enableFallback = settings.enableFallback ?? runtime.enableFallback;
  for (const provider of PROVIDERS) settings[MODEL_FIELDS[provider]] = runtime.providers[provider].model;

  // Build complete 74-platform provider catalog for the FreeLLMAPI-grade executive UI
  const { listSupportedProviders } = require('../freellmapi/providers/registry');
  const allProvidersList = listSupportedProviders();
  // Durable cooldown ledger: a benched provider must render as such, not as a
  // healthy one. The engine is the single source of truth for this state.
  const freellmEngine = require('../freellmapi');
  const activeCooldowns = freellmEngine.cooldownManager.getStatus();
  const cooldowns = {};
  for (const entry of activeCooldowns) {
    cooldowns[entry.provider] = {
      remainingSeconds: entry.remainingSeconds,
      reason: entry.reason,
      strikeCount: entry.strikeCount,
    };
  }

  const catalog = allProvidersList.map(meta => {
    const envKeyName = meta.envKey || `${meta.id.toUpperCase()}_API_KEY`;
    const stored = providerSecrets[meta.id] || {};
    const storedPool = splitKeyPoolInput(stored.apiKeys);
    if (storedPool.length === 0 && stored.apiKey) storedPool.push(String(stored.apiKey));
    const envPool = splitKeyPoolInput(environment[envKeyName]);
    const legacyKey = splitKeyPoolInput(legacyAi[SECRET_FIELDS[meta.id]]);
    const poolSize = Math.max(storedPool.length, envPool.length, legacyKey.length);
    const hasKey = poolSize > 0;
    const isConfigured = Boolean(meta.keyless || hasKey || configuredProviders[meta.id]);
    const cooldown = cooldowns[meta.id];
    const isSearch = meta.type === 'search';
    const status = cooldown ? 'cooldown' : (hasKey || meta.keyless) ? 'healthy' : 'disabled';
    return {
      id: meta.id,
      name: meta.name,
      label: meta.label,
      type: meta.type || 'openai-compat',
      group: isSearch || meta.type === 'media' ? 'search' : 'models',
      keyless: Boolean(meta.keyless),
      configuredOnServer: isConfigured,
      hasKey,
      keysCount: meta.keyless ? 1 : poolSize,
      status,
      cooldownRemainingSeconds: cooldown?.remainingSeconds || 0,
      cooldownReason: cooldown?.reason || null,
      credentialSource: envPool.length > 0 ? 'environment'
        : storedPool.length > 0 ? 'mariadb-secret-store'
          : legacyKey.length > 0 ? 'mariadb-legacy-setting' : (meta.keyless ? 'keyless' : 'none'),
      docUrl: meta.docUrl || '',
      baseUrl: meta.baseUrl || '',
      defaultModel: providerSecrets[meta.id]?.model || publicAi[MODEL_FIELDS[meta.id]] || legacyAi[MODEL_FIELDS[meta.id]] || meta.defaultModel || '',
      recommendedModels: meta.recommendedModels || [meta.defaultModel || 'default'],
      intelligenceScore: meta.intelligenceScore || 85,
      speedScore: meta.speedScore || 85,
      reliabilityScore: meta.reliabilityScore || 95,
      latencyMs: meta.speedScore ? Math.round(1000 - meta.speedScore * 8) : 220,
    };
  });

  for (const item of catalog) {
    configuredProviders[item.id] = item.configuredOnServer;
    if (item.hasKey) {
      const sourcePool = splitKeyPoolInput(providerSecrets[item.id]?.apiKeys);
      if (sourcePool.length === 0 && providerSecrets[item.id]?.apiKey) sourcePool.push(providerSecrets[item.id].apiKey);
      if (sourcePool.length > 0) {
        maskedKeys[item.id] = maskKeyPool(sourcePool);
      }
    }
  }

  const fallbackChains = [
    {
      id: 'default',
      name: 'Default',
      alias: 'auto:default',
      isDefault: true,
      isActive: settings.provider !== 'free-claude-code',
      modelsCount: CURATED_MODELS_CATALOG.length,
    },
    {
      id: 'free-claude-code',
      name: 'free-claude-code',
      alias: 'auto:free-claude-code',
      isCurated: true,
      isActive: true,
      modelsCount: CURATED_MODELS_CATALOG.length,
    },
  ];

  return {
    settings, configuredProviders, credentialSources, maskedKeys,
    catalog,
    cooldowns,
    engine: {
      version: freellmEngine.ENGINE_VERSION,
      capabilities: freellmEngine.getEngineStatus().capabilities,
      persistence: freellmEngine.getEngineStatus().persistence,
    },
    fallbackChains,
    curatedModels: CURATED_MODELS_CATALOG,
    revision: Number(publicConfig.aiRevision || providerSecrets._revision || 0),
    source: 'MARIADB_AND_DEPLOYMENT_ENVIRONMENT',
  };
}

async function saveAiAdminSettings({ input, expectedRevision = 0, actorUid, requestId }) {
  const safePublic = publicAiSettings(input);
  const pool = getPool();
  const connection = await pool.getConnection();
  let nextRevision;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT category, data, revision FROM system_settings WHERE category IN ('ai_providers','public_config','system_settings') FOR UPDATE"
    );
    const byCategory = Object.fromEntries(rows.map(row => [row.category, {
      data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}),
      revision: Number(row.revision || 0),
    }]));
    const currentSecrets = byCategory.ai_providers?.data || {};
    const currentPublic = byCategory.public_config?.data || {};
    const legacyAi = byCategory.system_settings?.data?.ai || {};
    const currentRevision = Math.max(
      Number(currentPublic.aiRevision || 0), Number(currentSecrets._revision || 0),
    );
    const isBypass = expectedRevision === undefined || expectedRevision === null || expectedRevision === -1 || input.force === true;
    if (!isBypass && Number(expectedRevision) !== currentRevision) {
      const conflictErr = errorWith('AI_SETTINGS_CONFLICT', 'AI settings changed after this panel loaded. Refresh before saving.', 409);
      conflictErr.currentRevision = currentRevision;
      throw conflictErr;
    }
    const providerPatch = secretPatch(input, currentSecrets, legacyAi);
    const clearSecrets = input.clearSecrets && typeof input.clearSecrets === 'object' ? input.clearSecrets : {};
    const envKeyNames = {
      gemini: 'GEMINI_API_KEY', nvidia: 'NVIDIA_API_KEY', openai: 'OPENAI_API_KEY',
      groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
    };
    for (const provider of PROVIDERS) {
      if (clearSecrets[provider] === true && String(process.env[envKeyNames[provider]] || '').trim()) {
        throw errorWith('INFRASTRUCTURE_SECRET_CANNOT_CLEAR', `${provider} is deployment-managed and cannot be cleared from the Admin UI.`, 409);
      }
      if (clearSecrets[provider] === true) delete providerPatch[provider].apiKey;
    }
    nextRevision = currentRevision + 1;
    const mergedSecrets = { ...currentSecrets, ...providerPatch, _revision: nextRevision };
    const mergedPublic = { ...currentPublic, ai: safePublic, aiRevision: nextRevision };
    for (const [category, data] of [['ai_providers', mergedSecrets], ['public_config', mergedPublic]]) {
      await connection.query(
        `INSERT INTO system_settings (category, data, revision, updated_at) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
        [category, JSON.stringify(data), nextRevision]
      );
    }
    await connection.query(
      `INSERT INTO admin_audit_logs
       (id, actor_uid, actor_role, action, category, severity, outcome, method, pathname,
        status_code, resource_type, resource_id, metadata, request_id, created_at)
       VALUES (?, ?, 'SUPER_ADMIN', 'AI_PROVIDER_SETTINGS_UPDATED', 'ai.governance', 'HIGH',
               'SUCCESS', 'POST', '/api/admin/ai-settings', 200, 'system_settings',
               'ai_providers', ?, ?, NOW())`,
      [crypto.randomUUID(), actorUid || 'system', JSON.stringify({ revision: nextRevision, changedFields: Object.keys(safePublic) }), requestId || null]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  clearProviderConfigurationCache();
  try { require('./freellmConfig').clearFreeLlmConfigCache(); } catch { /* optional */ }
  const loaded = await loadAiAdminSettings();
  return { ...loaded, revision: nextRevision };
}

async function testAiProvider({ environment = process.env, provider, model, apiKey, fetchImpl = global.fetch, timeoutMs = 30000 }) {
  const normProvider = String(provider || '').toLowerCase().trim();
  const isLegacy = PROVIDERS.includes(normProvider);
  const { getProviderMeta } = require('../freellmapi/providers/registry');
  const registryMeta = getProviderMeta(normProvider);

  if (!isLegacy && !registryMeta) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported AI provider.', 400);

  if (!isLegacy && registryMeta) {
    const isMasked = MASKED_PATTERN.test(String(apiKey || ''));
    let key = (!isMasked && apiKey) ? String(apiKey).trim() : '';
    if (!key) {
      const repo = getRepository();
      const secrets = await repo.getSetting('ai_providers').catch(() => null);
      key = secrets?.[normProvider]?.apiKey || environment[registryMeta.envKey || `${normProvider.toUpperCase()}_API_KEY`] || '';
    }
    if (registryMeta.keyless && !key) {
      key = 'keyless';
    }
    if (!key && !registryMeta.keyless) {
      throw errorWith('AI_PROVIDER_NOT_CONFIGURED', `${registryMeta.name} has no server-side credential configured.`, 400);
    }
    const selectedModel = model || registryMeta.defaultModel || 'default';
    const freellm = require('../freellmapi');
    const result = await freellm.testProvider({
      providerId: normProvider,
      apiKey: key,
      model: selectedModel,
      timeoutMs,
      fetchImpl,
    });
    if (!result.ok) {
      const status = result.status || 503;
      if (status === 401 || status === 403) {
        throw errorWith('AI_PROVIDER_AUTHENTICATION_FAILED', `${registryMeta.name} rejected the configured credential.`, 422);
      }
      throw errorWith('AI_PROVIDER_UNAVAILABLE', result.error || `${registryMeta.name} connection test failed.`, status);
    }
    return {
      provider: normProvider,
      model: selectedModel,
      latencyMs: result.latencyMs || 220,
      message: `${registryMeta.name} provider connection verified (${result.latencyMs || 220}ms).`,
    };
  }

  const configuration = await loadProviderConfiguration(environment);
  const base = configuration.providers[normProvider];
  const isMasked = MASKED_PATTERN.test(String(apiKey || ''));
  const key = String((!isMasked && apiKey) || base?.key || '').trim();
  const rawModel = String(model || base?.model || '').trim();
  const isAuto = !rawModel || rawModel.toLowerCase() === 'auto' || rawModel.toLowerCase() === 'dynamic';
  const selectedModel = isAuto ? (PROVIDER_DEFAULTS[normProvider]?.model || 'default') : rawModel;
  if (!key) throw errorWith('AI_PROVIDER_NOT_CONFIGURED', `${normProvider} has no server-side credential configured.`, 400);
  if (!modelPattern.test(selectedModel)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${normProvider} model.`, 400);
  try {
    const startTime = Date.now();
    const outputResult = await requestProvider(normProvider, { ...base, key, model: selectedModel }, 'Reply with exactly OK.', { temperature: 0, maxTokens: 10 }, { fetchImpl, timeoutMs });
    const output = typeof outputResult === 'string' ? outputResult : outputResult?.content;
    if (!String(output || '').trim()) throw errorWith('AI_PROVIDER_UNAVAILABLE', `${normProvider} returned an empty response.`, 503);
    const latencyMs = Math.max(1, Date.now() - startTime);
    return { provider: normProvider, model: selectedModel, latencyMs, message: `${normProvider} provider connection verified (${latencyMs}ms).` };
  } catch (error) {
    if (error.code && error.status) throw error;
    if (error.name === 'AbortError' || /timeout/i.test(error.message || '')) throw errorWith('AI_PROVIDER_TIMEOUT', `${normProvider} provider timed out (${timeoutMs}ms).`, 504);
    if ([401, 403].includes(Number(error.status))) throw errorWith('AI_PROVIDER_AUTHENTICATION_FAILED', `${normProvider} rejected the configured credential.`, 422);
    if (Number(error.status) === 400 || Number(error.status) === 404) throw errorWith('AI_PROVIDER_CONFIGURATION_ERROR', `${normProvider} rejected model "${selectedModel}" or payload.`, 422);
    throw errorWith('AI_PROVIDER_UNAVAILABLE', `${normProvider} provider is currently unavailable.`, error.status || 503);
  }
}

async function fetchProviderModels({ environment = process.env, provider, apiKey, fetchImpl = global.fetch, timeoutMs = 15000 }) {
  const normProvider = String(provider || '').toLowerCase().trim();
  const isLegacy = PROVIDERS.includes(normProvider);
  const { getProviderMeta } = require('../freellmapi/providers/registry');
  const registryMeta = getProviderMeta(normProvider);

  if (!isLegacy && !registryMeta) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported AI provider.', 400);

  let key = '';
  let baseUrl = '';
  let base = null;
  if (isLegacy) {
    const configuration = await loadProviderConfiguration(environment);
    base = configuration.providers[normProvider];
    const isMasked = MASKED_PATTERN.test(String(apiKey || ''));
    key = String((!isMasked && apiKey) || base?.key || '').trim();
    baseUrl = base?.baseUrl;
  } else {
    const isMasked = MASKED_PATTERN.test(String(apiKey || ''));
    key = (!isMasked && apiKey) ? String(apiKey).trim() : '';
    if (!key) {
      const repo = getRepository();
      const secrets = await repo.getSetting('ai_providers').catch(() => null);
      key = secrets?.[normProvider]?.apiKey || environment[registryMeta.envKey || `${normProvider.toUpperCase()}_API_KEY`] || '';
    }
    if (registryMeta.keyless && !key) key = 'keyless';
    baseUrl = registryMeta.baseUrl;
  }

  if (!key && !registryMeta?.keyless) throw errorWith('AI_PROVIDER_NOT_CONFIGURED', `${normProvider} has no server-side credential configured.`, 400);

  // Prefer FreeLLMAPI dynamic discovery (supports live upstream models, tier tagging, and noise filtering)
  try {
    const freellm = require('../freellmapi');
    const discovery = await freellm.discoverModels({
      providerId: normProvider,
      apiKey: key,
      baseUrl,
      forceRefresh: true,
      fetchImpl,
      timeoutMs,
    });
    const rawList = Array.isArray(discovery) ? discovery : (discovery?.models || []);
    if (rawList.length > 0) {
      const models = rawList.map(m => ({
        id: m.id,
        name: m.name || m.id,
        tier: m.intelligenceTier || m.tier || 'Unknown',
        contextWindow: m.contextWindow ?? null,
        catalogStatus: m.catalogStatus || 'unverified',
        catalogSource: m.catalogSource || 'unknown',
        lastSuccessfulRefresh: m.lastSuccessfulRefresh || null,
        catalogRefreshFailed: Boolean(m.catalogRefreshFailed),
        supportsVision: Boolean(m.vision || m.supportsVision),
        pricing: m.pricing || null,
      })).sort((a, b) => a.id.localeCompare(b.id));
      return { provider: normProvider, count: models.length, models };
    }
  } catch (err) {
    console.warn(`[AI Admin] FreeLLMAPI discovery for ${normProvider} notice:`, err.message);
  }

  if (registryMeta && Array.isArray(registryMeta.recommendedModels)) {
    const models = registryMeta.recommendedModels.map(id => ({ id, name: id, catalogStatus: 'unverified', catalogSource: 'registry', lastSuccessfulRefresh: null }));
    return { provider: normProvider, count: models.length, models };
  }

    // Discovery fallback via legacy provider adapter
    const { getAdapter, fetchWithDeadline } = require('./aiRouting');
    const adapter = getAdapter(provider);
    if (!adapter || !adapter.discovery?.supported) return { provider, count: 0, models: [] };
    const request = adapter.buildDiscoveryRequest({ providerConfig: { ...base, key, baseUrl: base?.baseUrl } });
    const response = await fetchWithDeadline(fetchImpl, request.url, { method: request.method, headers: request.headers }, timeoutMs);
    if (!response.ok) throw errorWith('AI_MODELS_FETCH_FAILED', `${adapter.name} API returned HTTP ${response.status}`, response.status);
    const data = await response.json();
    let entries;
    try {
      entries = adapter.normalizeDiscoveryResponse(data);
    } catch {
      return { provider, count: 0, models: [] };
    }
    const models = entries.map(entry => {
        const raw = entry.raw || {};
        if (provider === 'nvidia') return { id: entry.modelId, name: entry.modelId, owned_by: raw.owned_by || 'nvidia' };
        if (provider === 'gemini') return { id: entry.modelId, name: raw.displayName || entry.modelId };
        return { id: entry.modelId, name: entry.modelId };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return { provider, count: models.length, models };
}

module.exports = {
  ENABLE_FIELDS, MODEL_FIELDS, SECRET_FIELDS, MASKED_PATTERN,
  maskApiKey, loadAiAdminSettings, publicAiSettings, saveAiAdminSettings,
  secretPatch, testAiProvider, fetchProviderModels
};
