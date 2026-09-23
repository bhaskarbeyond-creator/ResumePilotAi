'use strict';

const { PROVIDERS, clearProviderConfigurationCache, loadProviderConfiguration, requestProvider } = require('./aiRuntime');

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
    const isMasked = MASKED_PATTERN.test(rawKey);
    const explicitlyCleared = clearSecrets[provider] === true;
    const existingKey = existing[provider]?.apiKey || legacy[SECRET_FIELDS[provider]] || '';

    if (rawKey && !isMasked) {
      if (rawKey.length < 12 || rawKey.length > 512) {
        throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} API key format.`, 400);
      }
    }

    // Blank or masked fields preserve the current credential. Only the explicit
    // clearSecrets flag removes it; this prevents a reload/save from erasing a
    // working provider while still giving operators a deliberate revocation path.
    const finalKey = explicitlyCleared ? '' : ((!isMasked && rawKey) ? rawKey : existingKey);
    const model = String(input[MODEL_FIELDS[provider]] || '').trim();
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
    patch[provider] = {
      ...(existing[provider] || {}),
      ...(finalKey ? { apiKey: finalKey } : {}),
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    };
    if (explicitlyCleared) delete patch[provider].apiKey;
    if (!baseUrl) delete patch[provider].baseUrl;
  }
  return patch;
}

const { getRepository } = require('../repositories');
const { getPool } = require('../database/mysql');
const crypto = require('crypto');

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
  return {
    settings, configuredProviders, credentialSources, maskedKeys,
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
    if (expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
      throw errorWith('AI_SETTINGS_CONFLICT', 'AI settings changed after this panel loaded. Refresh before saving.', 409);
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
  const loaded = await loadAiAdminSettings();
  return { ...loaded, revision: nextRevision };
}

async function testAiProvider({ environment = process.env, provider, model, apiKey, fetchImpl = global.fetch, timeoutMs = 30000 }) {
  if (!PROVIDERS.includes(provider)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported AI provider.', 400);
  const configuration = await loadProviderConfiguration(environment);
  const base = configuration.providers[provider];
  const isMasked = MASKED_PATTERN.test(String(apiKey || ''));
  const key = String((!isMasked && apiKey) || base?.key || '').trim();
  const selectedModel = String(model || base?.model || '').trim();
  if (!key) throw errorWith('AI_PROVIDER_NOT_CONFIGURED', `${provider} has no server-side credential configured.`, 400);
  if (!modelPattern.test(selectedModel)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} model.`, 400);
  try {
    const outputResult = await requestProvider(provider, { ...base, key, model: selectedModel }, 'Reply with exactly OK.', { temperature: 0, maxTokens: 10 }, { fetchImpl, timeoutMs });
    const output = typeof outputResult === 'string' ? outputResult : outputResult?.content;
    if (!String(output || '').trim()) throw errorWith('AI_PROVIDER_UNAVAILABLE', `${provider} returned an empty response.`, 503);
    return { provider, model: selectedModel, message: `${provider} provider connection verified.` };
  } catch (error) {
    if (error.code && error.status) throw error;
    if (error.name === 'AbortError' || /timeout/i.test(error.message || '')) throw errorWith('AI_PROVIDER_TIMEOUT', `${provider} provider timed out (${timeoutMs}ms).`, 504);
    if ([401, 403].includes(Number(error.status))) throw errorWith('AI_PROVIDER_AUTHENTICATION_FAILED', `${provider} rejected the configured credential.`, 422);
    if (Number(error.status) === 400 || Number(error.status) === 404) throw errorWith('AI_PROVIDER_CONFIGURATION_ERROR', `${provider} rejected model "${selectedModel}" or payload.`, 422);
    throw errorWith('AI_PROVIDER_UNAVAILABLE', `${provider} provider is currently unavailable.`, error.status || 503);
  }
}

async function fetchProviderModels({ environment = process.env, provider, apiKey, fetchImpl = global.fetch, timeoutMs = 15000 }) {
  if (!PROVIDERS.includes(provider)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported AI provider.', 400);
  const configuration = await loadProviderConfiguration(environment);
  const base = configuration.providers[provider];
  const isMasked = MASKED_PATTERN.test(String(apiKey || ''));
  const key = String((!isMasked && apiKey) || base?.key || '').trim();
  if (!key) throw errorWith('AI_PROVIDER_NOT_CONFIGURED', `${provider} has no server-side credential configured.`, 400);

  if (provider === 'nvidia') {
    const response = await fetchImpl('https://integrate.api.nvidia.com/v1/models', {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
    });
    if (!response.ok) throw errorWith('AI_MODELS_FETCH_FAILED', `NVIDIA API returned HTTP ${response.status}`, response.status);
    const data = await response.json();
    const models = (data.data || []).map(m => ({ id: m.id, name: m.id, owned_by: m.owned_by || 'nvidia' })).sort((a, b) => a.id.localeCompare(b.id));
    return { provider: 'nvidia', count: models.length, models };
  }

  if (provider === 'openai' || provider === 'groq' || provider === 'openrouter' || provider === 'deepseek') {
    const urls = {
      openai: 'https://api.openai.com/v1/models',
      groq: 'https://api.groq.com/openai/v1/models',
      openrouter: 'https://openrouter.ai/api/v1/models',
      deepseek: 'https://api.deepseek.com/models'
    };
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = process.env.APP_URL || process.env.TARGET_URL || 'https://ime365.com';
      headers['X-Title'] = 'IME365';
    }
    const response = await fetchImpl(urls[provider], {
      headers,
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
    });
    if (!response.ok) throw errorWith('AI_MODELS_FETCH_FAILED', `${provider} API returned HTTP ${response.status}`, response.status);
    const data = await response.json();
    const models = (data.data || []).map(m => ({ id: m.id, name: m.id })).sort((a, b) => a.id.localeCompare(b.id));
    return { provider, count: models.length, models };
  }

  if (provider === 'gemini') {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
    });
    if (!response.ok) throw errorWith('AI_MODELS_FETCH_FAILED', `Gemini API returned HTTP ${response.status}`, response.status);
    const data = await response.json();
    const models = (data.models || []).map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name })).sort((a, b) => a.id.localeCompare(b.id));
    return { provider: 'gemini', count: models.length, models };
  }

  return { provider, count: 0, models: [] };
}

module.exports = {
  ENABLE_FIELDS, MODEL_FIELDS, SECRET_FIELDS, MASKED_PATTERN,
  maskApiKey, loadAiAdminSettings, publicAiSettings, saveAiAdminSettings,
  secretPatch, testAiProvider, fetchProviderModels
};
