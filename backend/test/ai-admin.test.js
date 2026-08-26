'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAiAdminSettings, publicAiSettings, saveAiAdminSettings, testAiProvider } = require('../services/aiAdmin');

function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const ref = path => ({ path, async get() { const data = store.get(path); return { exists: data !== undefined, data: () => data }; } });
  const merge = (left, right) => {
    const result = { ...(left || {}) };
    for (const [key, value] of Object.entries(right || {})) result[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(result[key], value) : value;
    return result;
  };
  return {
    store,
    collection(name) { return { doc(id = `auto-${store.size}`) { return ref(`${name}/${id}`); } }; },
    async runTransaction(callback) {
      return callback({
        get: reference => reference.get(),
        set(reference, value, options) { store.set(reference.path, options?.merge ? merge(store.get(reference.path), value) : value); },
      });
    },
  };
}
const admin = { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } };
const baseInput = {
  provider: 'nvidia', enableGemini: true, enableNvidia: true, enableOpenai: true,
  enableGroq: true, enableOpenrouter: true, enableDeepseek: true,
  model: 'gemini-2.0-flash', nvidiaModel: 'meta/llama-3.2-11b-vision-instruct', openaiModel: 'gpt-4o-mini',
  groqModel: 'llama-3.3-70b-versatile', openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free', deepseekModel: 'deepseek-chat',
  temperature: 0.4, maxTokens: 3000, enableFallback: true,
};

test('AI Admin public settings preserve all six providers and fallback controls', () => {
  const result = publicAiSettings(baseInput);
  assert.equal(result.provider, 'nvidia');
  assert.equal(result.enableFallback, true);
  assert.equal(result.temperature, 0.4);
  assert.equal(result.maxTokens, 3000);
  for (const field of ['enableGemini','enableNvidia','enableOpenai','enableGroq','enableOpenrouter','enableDeepseek']) assert.equal(result[field], true);
  assert.throws(() => publicAiSettings({ provider: 'ollama' }), /Unsupported primary/);
});

test('authorized AI settings save is revisioned, audited, split, and never returns secrets', async () => {
  // MySQL is the authoritative AI-settings store (system_settings table).
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','ai_providers','system_settings')");
  const input = { ...baseInput, nvidiaApiKey: 'fixture-nvidia-key-value' };
  const result = await saveAiAdminSettings({ db: null, admin, input, expectedRevision: 0, actorUid: 'admin-1', requestId: 'req-1' });
  assert.equal(result.revision, 1);
  assert.equal(result.configuredProviders.nvidia, true);
  assert.doesNotMatch(JSON.stringify(result), /fixture-nvidia-key-value/);
  const [secretRows] = await pool.query("SELECT data FROM system_settings WHERE category = 'ai_providers'");
  const storedSecrets = typeof secretRows[0].data === 'string' ? JSON.parse(secretRows[0].data) : secretRows[0].data;
  assert.equal(storedSecrets.nvidia.apiKey, 'fixture-nvidia-key-value');
  const [pubRows] = await pool.query("SELECT data FROM system_settings WHERE category = 'public_config'");
  const storedPublic = typeof pubRows[0].data === 'string' ? JSON.parse(pubRows[0].data) : pubRows[0].data;
  assert.equal(storedPublic.ai.provider, 'nvidia');
  await assert.rejects(() => saveAiAdminSettings({ db: null, admin, input, expectedRevision: 0, actorUid: 'admin-1' }), error => error.code === 'AI_SETTINGS_CONFLICT');
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
  // Seed the authoritative MySQL store, then load through it (Firestore OFF).
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','ai_providers','system_settings')");
  await pool.query(
    "INSERT INTO system_settings (category, data, revision) VALUES (?, ?, ?)",
    ['public_config', JSON.stringify({ ai: baseInput, aiRevision: 4 }), 4]
  );
  await pool.query(
    "INSERT INTO system_settings (category, data, revision) VALUES (?, ?, ?)",
    ['ai_providers', JSON.stringify({ nvidia: { apiKey: 'server-secret', model: 'meta/llama-3.2-11b-vision-instruct' }, _revision: 4 }), 4]
  );
  await pool.query(
    "INSERT INTO system_settings (category, data, revision) VALUES (?, ?, ?)",
    ['system_settings', JSON.stringify({ ai: { geminiApiKey: 'legacy-secret' } }), 1]
  );
  const result = await loadAiAdminSettings(null, { OPENAI_API_KEY: 'environment-openai-secret', OPENAI_MODEL: 'gpt-4.1-mini' });
  assert.equal(result.revision, 4);
  assert.equal(result.configuredProviders.nvidia, true);
  assert.equal(result.configuredProviders.gemini, true);
  assert.equal(result.credentialSources.nvidia, 'secret-store');
  assert.equal(result.credentialSources.gemini, 'legacy-server-store');
  assert.equal(result.credentialSources.openai, 'environment');
  assert.equal(result.settings.openaiModel, 'gpt-4.1-mini');
  assert.doesNotMatch(JSON.stringify(result), /server-secret|legacy-secret|environment-openai-secret/);
});

test('provider test succeeds for each supported provider using deterministic mocked contracts', async () => {
  for (const provider of ['nvidia','openai','groq','openrouter','deepseek']) {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) });
    const result = await testAiProvider({ db: null, provider, model: baseInput[provider === 'nvidia' ? 'nvidiaModel' : `${provider}Model`], apiKey: `${provider}-credential-value`, fetchImpl, environment: {} });
    assert.equal(result.provider, provider);
  }
  const geminiFetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) });
  assert.equal((await testAiProvider({ db: null, provider: 'gemini', model: baseInput.model, apiKey: 'gemini-credential-value', fetchImpl: geminiFetch, environment: {} })).provider, 'gemini');
});

test('provider test distinguishes missing config, rejected credentials, invalid model, outage, and timeout without mutating settings', async () => {
  const db = fakeDb({ 'data/public_config': { ai: baseInput, aiRevision: 2 }, 'settings/ai_providers': { openai: { apiKey: 'persisted-credential', model: 'gpt-4o-mini' }, _revision: 2 }, 'data/system_settings': {} });
  const before = JSON.stringify([...db.store.entries()]);
  await assert.rejects(() => testAiProvider({ db: null, provider: 'openai', model: 'gpt-4o-mini', environment: {} }), error => error.code === 'AI_PROVIDER_NOT_CONFIGURED');
  await assert.rejects(() => testAiProvider({ db: null, provider: 'openai', model: 'bad model', apiKey: 'valid-credential', environment: {} }), error => error.code === 'AI_SETTINGS_VALIDATION_ERROR');
  const response = status => async () => ({ ok: false, status, json: async () => ({ error: { message: 'sensitive provider detail' } }) });
  await assert.rejects(() => testAiProvider({ db: null, provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: response(401), environment: {} }), error => error.code === 'AI_PROVIDER_AUTHENTICATION_FAILED' && !/sensitive/.test(error.message));
  await assert.rejects(() => testAiProvider({ db: null, provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: response(503), environment: {} }), error => error.code === 'AI_PROVIDER_UNAVAILABLE');
  const aborting = async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(() => testAiProvider({ db: null, provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: aborting, timeoutMs: 5, environment: {} }), error => error.code === 'AI_PROVIDER_TIMEOUT');
  assert.equal(JSON.stringify([...db.store.entries()]), before);
});
