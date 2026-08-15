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

function errorWith(code, message, status) {
  return Object.assign(new Error(message), { code, status });
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
function secretPatch(input = {}, existing = {}) {
  const patch = {};
  for (const provider of PROVIDERS) {
    const key = String(input[SECRET_FIELDS[provider]] || '').trim();
    if (key && (key.length < 12 || key.length > 512)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} API key format.`, 400);
    const model = String(input[MODEL_FIELDS[provider]] || '').trim();
    patch[provider] = { ...(existing[provider] || {}), ...(key ? { apiKey: key } : {}), ...(model ? { model } : {}) };
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
  const settings = Object.fromEntries(Object.entries(publicAi).filter(([key]) => !/(?:apiKey|secret|token|password)$/i.test(key)));
  const runtime = await loadProviderConfiguration(db, environment);
  settings.provider = PROVIDERS.includes(settings.provider) ? settings.provider : runtime.primary;
  settings.temperature = settings.temperature ?? runtime.temperature;
  settings.maxTokens = settings.maxTokens ?? runtime.maxTokens;
  settings.enableFallback = settings.enableFallback ?? runtime.enableFallback;
  for (const provider of PROVIDERS) settings[MODEL_FIELDS[provider]] = runtime.providers[provider].model;
  return { settings, configuredProviders, credentialSources, revision: Number(stored.aiRevision || secrets._revision || 0) };
}

async function saveAiAdminSettings({ db, admin, input, expectedRevision = 0, actorUid, requestId }) {
  if (!db || !admin?.firestore?.FieldValue) throw errorWith('AI_SETTINGS_UNAVAILABLE', 'AI settings service is unavailable.', 503);
  const safePublic = publicAiSettings(input);
  const secretRef = db.collection('settings').doc('ai_providers');
  const publicRef = db.collection('data').doc('public_config');
  let nextRevision;
  await db.runTransaction(async transaction => {
    const [secretSnapshot, publicSnapshot] = await Promise.all([transaction.get(secretRef), transaction.get(publicRef)]);
    const currentSecrets = secretSnapshot.data() || {};
    const currentRevision = Number(publicSnapshot.data()?.aiRevision || currentSecrets._revision || 0);
    if (Number(expectedRevision) !== currentRevision) throw errorWith('AI_SETTINGS_CONFLICT', 'AI settings changed after this panel loaded. Refresh before saving.', 409);
    nextRevision = currentRevision + 1;
    transaction.set(secretRef, { ...secretPatch(input, currentSecrets), _revision: nextRevision }, { merge: true });
    transaction.set(publicRef, { ai: safePublic, aiRevision: nextRevision }, { merge: true });
    transaction.set(db.collection('security_audit_logs').doc(), {
      action: 'AI_PROVIDER_SETTINGS_UPDATED', actorUid, revision: nextRevision,
      changedFields: Object.keys(safePublic), requestId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  clearProviderConfigurationCache(db);
  const loaded = await loadAiAdminSettings(db);
  return { ...loaded, revision: nextRevision };
}

async function testAiProvider({ db, environment = process.env, provider, model, apiKey, fetchImpl = global.fetch, timeoutMs = 10000 }) {
  if (!PROVIDERS.includes(provider)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', 'Unsupported AI provider.', 400);
  const configuration = await loadProviderConfiguration(db, environment);
  const base = configuration.providers[provider];
  const key = String(apiKey || base?.key || '').trim();
  const selectedModel = String(model || base?.model || '').trim();
  if (!key) throw errorWith('AI_PROVIDER_NOT_CONFIGURED', `${provider} has no server-side credential configured.`, 400);
  if (!modelPattern.test(selectedModel)) throw errorWith('AI_SETTINGS_VALIDATION_ERROR', `Invalid ${provider} model.`, 400);
  try {
    const output = await requestProvider(provider, { ...base, key, model: selectedModel }, 'Reply with exactly OK.', { temperature: 0, maxTokens: 10 }, { fetchImpl, timeoutMs });
    if (!String(output || '').trim()) throw errorWith('AI_PROVIDER_UNAVAILABLE', `${provider} returned an empty response.`, 503);
    return { provider, model: selectedModel, message: `${provider} provider connection verified.` };
  } catch (error) {
    if (error.code && error.status) throw error;
    const detail = error.message ? `: ${error.message}` : '';
    if (error.name === 'AbortError' || /timeout/i.test(error.message || '')) throw errorWith('AI_PROVIDER_TIMEOUT', `${provider} provider timed out (${timeoutMs}ms).`, 504);
    if ([401, 403].includes(Number(error.status))) throw errorWith('AI_PROVIDER_AUTHENTICATION_FAILED', `${provider} rejected the configured credential${detail}.`, 422);
    if (Number(error.status) === 400 || Number(error.status) === 404) throw errorWith('AI_PROVIDER_CONFIGURATION_ERROR', `${provider} rejected model "${selectedModel}" or payload${detail}.`, 422);
    throw errorWith('AI_PROVIDER_UNAVAILABLE', `${provider} provider is currently unavailable${detail}.`, error.status || 503);
  }
}

module.exports = { ENABLE_FIELDS, MODEL_FIELDS, SECRET_FIELDS, loadAiAdminSettings, publicAiSettings, saveAiAdminSettings, secretPatch, testAiProvider };
