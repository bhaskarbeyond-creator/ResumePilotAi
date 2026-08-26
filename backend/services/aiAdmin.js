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
    patch[provider] = {
      ...(existing[provider] || {}),
      ...(finalKey ? { apiKey: finalKey } : {}),
      ...(model ? { model } : {}),
    };
    if (explicitlyCleared) delete patch[provider].apiKey;
  }
  return patch;
}

const { getRepository } = require('../repositories');

async function loadAiAdminSettings(db, environment = process.env) {
  let stored = {};
  let secrets = {};
  let legacyAi = {};

  // 1. Primary: MariaDB system_settings
  try {
    const repo = getRepository(db);
    if (repo && typeof repo.getSetting === 'function') {
      const [pubSetting, secSetting, legSetting] = await Promise.all([
        repo.getSetting('public_config').catch(() => null),
        repo.getSetting('ai_providers').catch(() => null),
        repo.getSetting('system_settings').catch(() => null),
      ]);
      if (pubSetting) stored = pubSetting;
      if (secSetting) secrets = secSetting;
      if (legSetting?.ai) legacyAi = legSetting.ai;
    }
  } catch (_) {}

  // 2. Standby Fallback: Firestore ONLY when the standby data plane is
  // explicitly enabled by an operator (FIREBASE_DATA_PLANE=on|standby).
  // Default OFF: MySQL is the only synchronous store and Firestore is never
  // consulted, even when a Firestore handle happens to be available.
  const dataPlane = String(process.env.FIREBASE_DATA_PLANE || process.env.ENABLE_FIRESTORE_DATA_PLANE || 'off').toLowerCase();
  const standbyEnabled = ['on', 'true', '1', 'firestore-standby', 'standby'].includes(dataPlane);
  if (standbyEnabled && Object.keys(stored).length === 0 && Object.keys(secrets).length === 0 && db && typeof db.collection === 'function') {
    try {
      const [publicDoc, secretDoc, legacyDoc] = await Promise.allSettled([
        db.collection('data').doc('public_config').get(),
        db.collection('settings').doc('ai_providers').get(),
        db.collection('data').doc('system_settings').get(),
      ]);
      if (publicDoc.status === 'fulfilled' && publicDoc.value.exists) stored = publicDoc.value.data() || {};
      if (secretDoc.status === 'fulfilled' && secretDoc.value.exists) secrets = secretDoc.value.data() || {};
      if (legacyDoc.status === 'fulfilled' && legacyDoc.value.exists) legacyAi = legacyDoc.value.data()?.ai || {};
    } catch (_) {}
  }

  const publicAi = stored.ai || {};
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

  const publicFields = new Set([
    'provider', 'temperature', 'maxTokens', 'enableFallback', 'enableImportModule',
    ...Object.values(ENABLE_FIELDS), ...Object.values(MODEL_FIELDS),
  ]);
  const settings = Object.fromEntries(Object.entries(publicAi).filter(([key, value]) => publicFields.has(key)
    && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')));
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
  const safePublic = publicAiSettings(input);
  const repo = getRepository(db);
  let currentSecrets = {};
  let currentPublic = {};
  let legacyAi = {};

  // 1. Primary: MariaDB system_settings
  if (repo && typeof repo.getSetting === 'function') {
    try {
      const [secSetting, pubSetting, legSetting] = await Promise.all([
        repo.getSetting('ai_providers').catch(() => null),
        repo.getSetting('public_config').catch(() => null),
        repo.getSetting('system_settings').catch(() => null),
      ]);
      if (secSetting) currentSecrets = secSetting;
      if (pubSetting) currentPublic = pubSetting;
      if (legSetting?.ai) legacyAi = legSetting.ai;
    } catch (_) {}
  }

  // 2. Standby Fallback: Firestore (if currentSecrets and currentPublic not loaded from MariaDB)
  if (Object.keys(currentSecrets).length === 0 && Object.keys(currentPublic).length === 0 && db && typeof db.collection === 'function') {
    try {
      const [secretDoc, publicDoc, legacyDoc] = await Promise.allSettled([
        db.collection('settings').doc('ai_providers').get(),
        db.collection('data').doc('public_config').get(),
        db.collection('data').doc('system_settings').get(),
      ]);
      if (secretDoc.status === 'fulfilled' && secretDoc.value.exists) currentSecrets = secretDoc.value.data() || {};
      if (publicDoc.status === 'fulfilled' && publicDoc.value.exists) currentPublic = publicDoc.value.data() || {};
      if (legacyDoc.status === 'fulfilled' && legacyDoc.value.exists) legacyAi = legacyDoc.value.data()?.ai || {};
    } catch (_) {}
  }

  const currentRevision = Number(currentPublic.aiRevision || currentSecrets._revision || 0);
  if (expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
    throw errorWith('AI_SETTINGS_CONFLICT', 'AI settings changed after this panel loaded. Refresh before saving.', 409);
  }
  const nextRevision = currentRevision + 1;
  const providerPatch = secretPatch(input, currentSecrets, legacyAi);
  const clearSecrets = input.clearSecrets && typeof input.clearSecrets === 'object' ? input.clearSecrets : {};
  const envKeyNames = { gemini: 'GEMINI_API_KEY', nvidia: 'NVIDIA_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
  
  for (const provider of PROVIDERS) {
    if (clearSecrets[provider] === true && String(process.env[envKeyNames[provider]] || '').trim()) {
      throw errorWith('INFRASTRUCTURE_SECRET_CANNOT_CLEAR', `${provider} is deployment-managed and cannot be cleared from the Admin UI.`, 409);
    }
    if (clearSecrets[provider] === true) {
      delete providerPatch[provider].apiKey;
    }
  }

  const mergedSecrets = { ...currentSecrets, ...providerPatch, _revision: nextRevision };
  const mergedPublic = { ...currentPublic, ai: safePublic, aiRevision: nextRevision };

  // 1. Save to MariaDB Primary
  if (repo && typeof repo.saveSetting === 'function') {
    await Promise.all([
      repo.saveSetting('ai_providers', mergedSecrets, nextRevision),
      repo.saveSetting('public_config', mergedPublic, nextRevision),
    ]);
    if (typeof repo.recordAdminAuditLog === 'function') {
      await repo.recordAdminAuditLog({
        actorUid: actorUid || 'system',
        action: 'AI_PROVIDER_SETTINGS_UPDATED',
        category: 'ai_governance',
        severity: 'MEDIUM',
        outcome: 'SUCCESS',
        metadata: { revision: nextRevision, changedFields: Object.keys(safePublic) },
        requestId: requestId || null,
      }).catch(() => {});
    }
  }

  // 2. Replicate to Firestore Standby / Save to db (mock or real)
  if (db) {
    try {
      if (typeof db.batch === 'function') {
        const secretRef = db.collection('settings').doc('ai_providers');
        const publicRef = db.collection('data').doc('public_config');
        const batch = db.batch();
        batch.set(secretRef, mergedSecrets, { merge: true });
        batch.set(publicRef, mergedPublic, { merge: true });
        if (admin?.firestore?.FieldValue) {
          batch.set(db.collection('security_audit_logs').doc(), {
            action: 'AI_PROVIDER_SETTINGS_UPDATED',
            actorUid: actorUid || 'system',
            revision: nextRevision,
            changedFields: Object.keys(safePublic),
            requestId: requestId || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        // Standby replication is non-blocking: the user request must never wait
        // on the secondary system (MySQL is authoritative and already committed).
        Promise.resolve(batch.commit()).catch(() => {});
      } else if (typeof db.runTransaction === 'function') {
        Promise.resolve(db.runTransaction(async tx => {
          const secretRef = db.collection('settings').doc('ai_providers');
          const publicRef = db.collection('data').doc('public_config');
          tx.set(secretRef, mergedSecrets, { merge: true });
          tx.set(publicRef, mergedPublic, { merge: true });
          tx.set(db.collection('security_audit_logs').doc(), {
            action: 'AI_PROVIDER_SETTINGS_UPDATED',
            actorUid: actorUid || 'system',
            revision: nextRevision,
            changedFields: Object.keys(safePublic),
            requestId: requestId || null,
            createdAt: admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString(),
          });
        })).catch(() => {});
      }
    } catch (_) {}
  }

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
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://airesume.projectdemo.guru';
      headers['X-Title'] = 'ResumePilot AI';
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
