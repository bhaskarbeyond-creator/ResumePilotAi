'use strict';

// F-28 (P3): divergent generation defaults. aiRuntime's configuration
// builder fell back to temperature 0.7 / maxTokens 2048 while freellmConfig's
// mesh builder used 0.3 / 4096 — and aiRuntime's engine handoff plus
// freellmapi's router parameter defaults repeated 0.3 / 4096 — so the same
// tenant could get different sampling depending on which engine served the
// call. This spec pins the single frozen constants module
// (services/aiGenerationDefaults.js) as the source every fallback shares:
// product builder, mesh builder, and the engine-internal request path, with
// explicit admin config still winning in both builders.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const defaults = require('../services/aiGenerationDefaults');
const { DEFAULT_GENERATION_TEMPERATURE, DEFAULT_GENERATION_MAX_TOKENS } = defaults;
const { clearProviderConfigurationCache, loadProviderConfiguration } = require('../services/aiRuntime');
const { buildFreeLlmPlatformConfig } = require('../services/freellmConfig');
const freellm = require('../freellmapi');

const GROQ_KEY = 'k-groq-f28-12345678';

async function seedRuntimeSettings({ secrets = {}, publicAi = {}, legacyAi = {} } = {}) {
  const settings = {
    ai_providers: secrets,
    public_config: { ai: publicAi },
    system_settings: { ai: legacyAi },
  };
  require('../repositories').setRepositoryForTests({
    async getSetting(category) { return settings[category] || null; },
  });
  clearProviderConfigurationCache();
  freellm.resetCooldowns();
  freellm.clearCache();
}

test('F-28: the constants module is frozen and carries the documented values', () => {
  assert.equal(DEFAULT_GENERATION_TEMPERATURE, 0.7);
  assert.equal(DEFAULT_GENERATION_MAX_TOKENS, 2048);
  assert.ok(Object.isFrozen(defaults));
});

test('F-28: both configuration builders fall back to the SAME defaults when settings omit the fields', async () => {
  await seedRuntimeSettings({ secrets: { groq: { apiKey: GROQ_KEY } }, publicAi: {} });
  const product = await loadProviderConfiguration({});
  assert.equal(product.temperature, DEFAULT_GENERATION_TEMPERATURE);
  assert.equal(product.maxTokens, DEFAULT_GENERATION_MAX_TOKENS);

  const mesh = buildFreeLlmPlatformConfig({
    environment: {},
    secrets: { groq: { apiKey: GROQ_KEY } },
    publicConfig: { ai: {} },
    systemSettings: {},
  });
  assert.equal(mesh.temperature, DEFAULT_GENERATION_TEMPERATURE);
  assert.equal(mesh.maxTokens, DEFAULT_GENERATION_MAX_TOKENS);

  // The finding's core: no sampling split-brain between engines.
  assert.equal(product.temperature, mesh.temperature);
  assert.equal(product.maxTokens, mesh.maxTokens);
});

test('F-28: engine-internal parameter defaults share the source (actual request body)', async () => {
  await seedRuntimeSettings({});
  let captured = null;
  const fetchImpl = async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  await freellm.completeChat({
    prompt: 'F-28 engine default probe',
    platformConfig: { providers: { groq: { key: 'gsk-f28-mock-key', enabled: true, model: 'llama-3.3-70b-versatile' } } },
    fetchImpl,
    bypassCache: true,
  });
  assert.ok(captured, 'provider request was captured');
  assert.equal(captured.temperature, DEFAULT_GENERATION_TEMPERATURE, 'router param default converged (was 0.3)');
  assert.equal(captured.max_tokens, DEFAULT_GENERATION_MAX_TOKENS, 'router param default converged (was 4096)');
});

test('F-28: explicit configured values still win in both builders', async () => {
  await seedRuntimeSettings({ secrets: { groq: { apiKey: GROQ_KEY } }, publicAi: { temperature: 0.5, maxTokens: 999 } });
  const product = await loadProviderConfiguration({});
  assert.equal(product.temperature, 0.5);
  assert.equal(product.maxTokens, 999);

  const mesh = buildFreeLlmPlatformConfig({
    environment: {},
    secrets: { groq: { apiKey: GROQ_KEY } },
    publicConfig: { ai: { temperature: 0.5, maxTokens: 999 } },
    systemSettings: {},
  });
  assert.equal(mesh.temperature, 0.5);
  assert.equal(mesh.maxTokens, 999);
});
