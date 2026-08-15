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
  const result = {
    provider,
    temperature: Math.max(0, Math.min(1, Number(input.temperature ?? 0.7))),
    maxTokens: Math.max(256, Math.min(4096, Math.floor(Number(input.maxTokens) || 2048))),
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
  for (const provider of PROVIDERS) {
    const rawKey = String(input[SECRET_FIELDS[provider]] || '').trim();
    const isMasked = MASKED_PATTERN.test(rawKey);
    const existingKey = existing[provider]?.apiKey || legacy[SECRET_FIELDS[provider]] || '';
    
    if (rawKey && !isMasked) {
      if (rawKey.length < 12 || rawKey.length > 512) {
        throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} API key format.`, 400);
      }
    }
    
    const finalKey = (!isMasked && rawKey) ? rawKey : existingKey;
    const model = String(input[MODEL_FIELDS[provider]] || '').trim();
    patch[provider] = {
      ...(existing[provider] || {}),
      ...(finalKey ? { apiKey: finalKey } : {}),
      ...(model ? { model } : {}),
    };
  }
  return patch;
}

async function loadAiAdminSettings(db, environment = process.env) {
  if (!db) throw errorWith('AI_SETTINGS_UNAVAILABLE', 'AI settings service is unavailable.', 503);
  const [publicDoc, secretDoc, legacyDoc] = await Promise.all([
    db.collection('data').doc('public_config').get(),
    db.collection('settings').doc('ai_providers').get(),
    db.collection('data').doc('system_settings').get(),
  ]);
  const stored = publicDoc.data() || {};
  const publicAi = stored.ai || {};
  const secrets = secretDoc.data() || {};
  const legacyAi = legacyDoc.data()?.ai || {};
  const credentialSources = Object.fromEntries(PROVIDERS.map(provider => [provider,
    environment[`${provider.toUpperCase()}_API_KEY`] ? 'environment' : secrets[provider]?.apiKey ? 'secret-store' : legacyAi[SECRET_FIELDS[provider]] ? 'legacy-server-store' : 'none'
  ]));
  const configuredProviders = Object.fromEntries(PROVIDERS.map(provider => [provider, credentialSources[provider] !== 'none']));
  const runtime = await loadProviderConfiguration(db, environment);

  const maskedKeys = {};
  for (const provider of PROVIDERS) {
    const rawKey = runtime.providers[provider]?.key || '';
    maskedKeys[provider] = maskApiKey(rawKey);
  }

  const settings = Object.fromEntries(Object.entries(publicAi).filter(([key]) => !/(?:apiKey|secret|token|password)$/i.test(key)));
  settings.provider = PROVIDERS.includes(settings.provider) ? settings.provider : runtime.primary;
  settings.temperature = settings.temperature ?? runtime.temperature;
  settings.maxTokens = settings.maxTokens ?? runtime.maxTokens;
  settings.enableFallback = settings.enableFallback ?? runtime.enableFallback;
  for (const provider of PROVIDERS) {
    settings[MODEL_FIELDS[provider]] = runtime.providers[provider].model;
  }
  return { settings, configuredProviders, credentialSources, maskedKeys, revision: Number(stored.aiRevision || secrets._revision || 0) };
}

async function saveAiAdminSettings({ db, admin, input, expectedRevision = 0, actorUid, requestId }) {
  if (!db || !admin?.firestore?.FieldValue) throw errorWith('AI_SETTINGS_UNAVAILABLE', 'AI settings service is unavailable.', 503);
  const safePublic = publicAiSettings(input);
  const secretRef = db.collection('settings').doc('ai_providers');
  const publicRef = db.collection('data').doc('public_config');
  const legacyRef = db.collection('data').doc('system_settings');
  let nextRevision;
  await db.runTransaction(async transaction => {
    const [secretSnapshot, publicSnapshot, legacySnapshot] = await Promise.all([
      transaction.get(secretRef),
      transaction.get(publicRef),
      transaction.get(legacyRef),
    ]);
    const currentSecrets = secretSnapshot.data() || {};
    const legacyAi = legacySnapshot.data()?.ai || {};
    const currentRevision = Number(publicSnapshot.data()?.aiRevision || currentSecrets._revision || 0);
    if (Number(expectedRevision) !== currentRevision) throw errorWith('AI_SETTINGS_CONFLICT', 'AI settings changed after this panel loaded. Refresh before saving.', 409);
    nextRevision = currentRevision + 1;
    transaction.set(secretRef, { ...secretPatch(input, currentSecrets, legacyAi), _revision: nextRevision }, { merge: true });
    transaction.set(publicRef, { ai: safePublic, aiRevision: nextRevision }, { merge: true });
    transaction.set(db.collection('security_audit_logs').doc(), {
      action: 'AI_PROVIDER_SETTINGS_UPDATED',
      actorUid: actorUid || 'system',
      revision: nextRevision,
      changedFields: Object.keys(safePublic),
      requestId: requestId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  clearProviderConfigurationCache(db);
  const loaded = await loadAiAdminSettings(db);
  return { ...loaded, revision: nextRevision };
}

async function testAiProvider({ db, environment = process.env, provider, model, apiKey, fetchImpl = global.fetch, timeoutMs = 30000 }) {
  if (!PROVIDERS.includes(provider)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported AI provider.', 400);
  const configuration = await loadProviderConfiguration(db, environment);
  const base = configuration.providers[provider];
  const isMasked = MASKED_PATTERN.test(String(apiKey || ''));
  const key = String((!isMasked && apiKey) || base?.key || '').trim();
  const selectedModel = String(model || base?.model || '').trim();
  if (!key) throw errorWith('AI_PROVIDER_NOT_CONFIGURED', `${provider} has no server-side credential configured.`, 400);
  if (!modelPattern.test(selectedModel)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} model.`, 400);
  try {
    const output = await requestProvider(provider, { ...base, key, model: selectedModel }, 'Reply with exactly OK.', { temperature: 0, maxTokens: 10 }, { fetchImpl, timeoutMs });
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

async function fetchProviderModels({ db, environment = process.env, provider, apiKey, fetchImpl = global.fetch, timeoutMs = 15000 }) {
  if (!PROVIDERS.includes(provider)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported AI provider.', 400);
  const configuration = await loadProviderConfiguration(db, environment);
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
    const response = await fetchImpl(urls[provider], {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
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
