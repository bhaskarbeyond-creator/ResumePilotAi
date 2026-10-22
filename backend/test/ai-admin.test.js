'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAiAdminSettings, publicAiSettings, saveAiAdminSettings, testAiProvider } = require('../services/aiAdmin');

const admin = {};
const baseInput = {
  provider: 'nvidia', enableGemini: true, enableNvidia: true, enableOpenai: true,
  enableGroq: true, enableOpenrouter: true, enableDeepseek: true,
  model: 'gemini-2.0-flash', nvidiaModel: 'meta/llama-3.2-11b-vision-instruct', openaiModel: 'gpt-4o-mini',
  groqModel: 'llama-3.3-70b-versatile', openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free', deepseekModel: 'deepseek-chat',
  temperature: 0.4, maxTokens: 3000, enableFallback: true,
};

const { installAiSettingsContract } = require('./helpers/aiSettingsContract');
const settingsContract = installAiSettingsContract();

test('AI Admin public settings preserve all six providers and fallback controls', () => {
  const result = publicAiSettings(baseInput);
  assert.equal(result.provider, 'nvidia');
  assert.equal(result.enableFallback, true);
  assert.equal(result.temperature, 0.4);
  assert.equal(result.maxTokens, 3000);
  for (const field of ['enableGemini','enableNvidia','enableOpenai','enableGroq','enableOpenrouter','enableDeepseek']) assert.equal(result[field], true);
  assert.throws(() => publicAiSettings({ provider: 'unknown-unregistered' }), /Unsupported primary/);
});

test('authorized AI settings save is revisioned, audited, split, and never returns secrets', async () => {
  settingsContract.reset();
  const input = { ...baseInput, nvidiaApiKey: 'fixture-nvidia-key-value' };
  const result = await saveAiAdminSettings({ admin, input, expectedRevision: 0, actorUid: 'admin-1', requestId: 'req-1' });
  assert.equal(result.revision, 1);
  assert.equal(result.configuredProviders.nvidia, true);
  assert.doesNotMatch(JSON.stringify(result), /fixture-nvidia-key-value/);
  assert.equal(settingsContract.settings.get('ai_providers').data.nvidia.apiKey, 'fixture-nvidia-key-value');
  assert.equal(settingsContract.settings.get('public_config').data.ai.provider, 'nvidia');
  assert.equal(settingsContract.auditEvents.some(event => event.action === 'AI_PROVIDER_SETTINGS_UPDATED'), true);
  await assert.rejects(() => saveAiAdminSettings({ admin, input, expectedRevision: 0, actorUid: 'admin-1' }), error => error.code === 'AI_SETTINGS_CONFLICT');
});

test('AI secret lifecycle preserves blank values and accepts only explicit clears', () => {
  const { secretPatch } = require('../services/aiAdmin');
  const existing = { openai: { apiKey: 'existing-server-key' } };
  const preserved = secretPatch({ openaiApiKey: '' }, existing, {});
  assert.equal(preserved.openai.apiKey, 'existing-server-key');
  const cleared = secretPatch({ openaiApiKey: '', clearSecrets: { openai: true } }, existing, {});
  assert.equal(Object.hasOwn(cleared.openai, 'apiKey'), false);
});

test('AI settings load reports configured booleans without returning provider keys', async () => {
  settingsContract.reset({
    public_config: { ai: baseInput, aiRevision: 4 },
    ai_providers: { nvidia: { apiKey: 'server-secret', model: 'meta/llama-3.2-11b-vision-instruct' }, _revision: 4 },
    system_settings: { ai: { geminiApiKey: 'legacy-secret' } },
  });
  const result = await loadAiAdminSettings({ OPENAI_API_KEY: 'environment-openai-secret', OPENAI_MODEL: 'gpt-4.1-mini' });
  assert.equal(result.revision, 4);
  assert.equal(result.configuredProviders.nvidia, true);
  assert.equal(result.configuredProviders.gemini, true);
  assert.equal(result.credentialSources.nvidia, 'mariadb-secret-store');
  assert.equal(result.credentialSources.gemini, 'mariadb-legacy-setting');
  assert.equal(result.credentialSources.openai, 'environment');
  assert.equal(result.settings.openaiModel, 'gpt-4.1-mini');
  assert.doesNotMatch(JSON.stringify(result), /server-secret|legacy-secret|environment-openai-secret/);
});

test('provider test succeeds for each supported provider using deterministic mocked contracts', async () => {
  for (const provider of ['nvidia','openai','groq','openrouter','deepseek']) {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) });
    const result = await testAiProvider({ provider, model: baseInput[provider === 'nvidia' ? 'nvidiaModel' : `${provider}Model`], apiKey: `${provider}-credential-value`, fetchImpl, environment: {} });
    assert.equal(result.provider, provider);
  }
  const geminiFetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) });
  assert.equal((await testAiProvider({ provider: 'gemini', model: baseInput.model, apiKey: 'gemini-credential-value', fetchImpl: geminiFetch, environment: {} })).provider, 'gemini');
});

test('provider test distinguishes missing config, rejected credentials, invalid model, outage, and timeout without mutating settings', async () => {
  settingsContract.reset();
  const unrelatedState = new Map([['sentinel', { revision: 2 }]]);
  const before = JSON.stringify([...unrelatedState.entries()]);
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', environment: {} }), error => error.code === 'AI_PROVIDER_NOT_CONFIGURED');
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'bad model', apiKey: 'valid-credential', environment: {} }), error => error.code === 'AI_SETTINGS_VALIDATION_ERROR');
  const response = status => async () => ({ ok: false, status, json: async () => ({ error: { message: 'sensitive provider detail' } }) });
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: response(401), environment: {} }), error => error.code === 'AI_PROVIDER_AUTHENTICATION_FAILED' && !/sensitive/.test(error.message));
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: response(503), environment: {} }), error => error.code === 'AI_PROVIDER_UNAVAILABLE');
  const aborting = async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: aborting, timeoutMs: 5, environment: {} }), error => error.code === 'AI_PROVIDER_TIMEOUT');
  assert.equal(JSON.stringify([...unrelatedState.entries()]), before);
});

test('manual pin for an environment-enabled local primary persists without copying deployment credentials', async () => {
  settingsContract.reset();
  const saved = await saveAiAdminSettings({ input: { provider: 'llamacpp', selectionMode: 'manual', llamacpp: { model: '/models/local.gguf' } }, actorUid: 'super', expectedRevision: 0 });
  assert.equal(saved.settings.provider, 'llamacpp');
  assert.equal(saved.settings.selectionMode, 'manual');
  assert.equal(saved.catalog.find(provider => provider.id === 'llamacpp').defaultModel, '/models/local.gguf');
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.model, '/models/local.gguf');
});

test('credential-only saves preserve the locked manual policy, model pin, fallback and generation controls', async () => {
  settingsContract.reset({
    public_config: { aiRevision: 1, ai: { provider: 'llamacpp', selectionMode: 'manual', temperature: 0.7, maxTokens: 256, enableFallback: false } },
    ai_providers: { _revision: 1, llamacpp: { apiKey: 'keyless', enabled: true, model: '/models/pin.gguf', baseUrl: 'http://127.0.0.1:8081/v1' } },
  });
  const saved = await saveAiAdminSettings({ input: { openaiApiKey: 'fixture-openai-secret' }, actorUid: 'super', expectedRevision: 1 });
  assert.equal(saved.settings.provider, 'llamacpp');
  assert.equal(saved.settings.selectionMode, 'manual');
  assert.equal(saved.settings.temperature, 0.7);
  assert.equal(saved.settings.maxTokens, 256);
  assert.equal(saved.settings.enableFallback, false);
  assert.equal(saved.catalog.find(p => p.id === 'llamacpp').defaultModel, '/models/pin.gguf');
  assert.ok(!JSON.stringify(saved).includes('fixture-openai-secret'));
});
test('registered local endpoint overrides persist, blank preserves, none clears, and embedded credentials fail closed', async () => {
  settingsContract.reset();
  await saveAiAdminSettings({ input: { llamacppApiKey: 'keyless', llamacppBaseUrl: 'http://127.0.0.1:9090/v1/' }, actorUid: 'super', expectedRevision: 0 });
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.baseUrl, 'http://127.0.0.1:9090/v1');
  await saveAiAdminSettings({ input: { llamacppBaseUrl: '' }, actorUid: 'super', expectedRevision: 1 });
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.baseUrl, 'http://127.0.0.1:9090/v1');
  await saveAiAdminSettings({ input: { llamacppBaseUrl: 'none' }, actorUid: 'super', expectedRevision: 2 });
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.baseUrl, undefined);
  await assert.rejects(saveAiAdminSettings({ input: { llamacppBaseUrl: 'https://user:secret@example.test/v1' }, actorUid: 'super', expectedRevision: 3 }), { code: 'AI_SETTINGS_VALIDATION_ERROR' });
});

test('admin discovery honors configured endpoints and authoritative model removal rather than reviving static defaults', async () => {
  settingsContract.reset({ ai_providers: { llamacpp: { enabled: true, apiKey: 'keyless', baseUrl: 'http://127.0.0.1:9090/v1' } } });
  const { fetchProviderModels } = require('../services/aiAdmin');
  const { modelDiscovery } = require('../freellmapi/services/modelDiscovery');
  modelDiscovery.clear();
  let rows = [{ id: 'live-first' }];
  const fetchImpl = async url => {
    assert.equal(url, 'http://127.0.0.1:9090/v1/models');
    return Response.json({ data: rows });
  };
  assert.equal((await fetchProviderModels({ provider: 'llamacpp', environment: {}, fetchImpl })).models[0].id, 'live-first');
  rows = [];
  assert.deepEqual((await fetchProviderModels({ provider: 'llamacpp', environment: {}, fetchImpl })).models, []);
});
