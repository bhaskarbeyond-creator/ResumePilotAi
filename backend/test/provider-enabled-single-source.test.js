'use strict';

// F-23 (P2): two enabled flags, split-brained engines. `ai_providers[p].
// enabled/disabled` gated the /v1 mesh (freellmConfig) while
// `public_config.ai.enable<P>` gated the product engine (aiRuntime) — each
// reader ignored the other store, so one admin intent could leave one engine
// serving a disabled provider (audit: enableGroq:false, ai_providers.groq
// untouched → /v1 kept using groq). Fix: ai_providers[p].enabled/disabled is
// the single source of truth; the legacy boolean remains a compatibility
// input; a provider disabled in EITHER store is disabled in BOTH engines.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clearProviderConfigurationCache,
  loadProviderConfiguration,
} = require('../services/aiRuntime');
const { buildFreeLlmPlatformConfig } = require('../services/freellmConfig');

const GROQ_KEY = 'k-groq-f23-12345678';

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
  require('../freellmapi').resetCooldowns();
  require('../freellmapi').clearCache();
}

// Pure mesh read for the same stores (environment:{} keeps env keys out).
function meshIncludesProvider(secrets, publicAi, id) {
  const configuration = buildFreeLlmPlatformConfig({
    environment: {},
    secrets,
    publicConfig: { ai: publicAi },
    systemSettings: {},
  });
  return Object.prototype.hasOwnProperty.call(configuration.providers, id);
}

test('F-23: ai_providers.groq.enabled=false disables the provider in the PRODUCT engine too (legacy boolean absent)', async () => {
  await seedRuntimeSettings({ secrets: { groq: { apiKey: GROQ_KEY, enabled: false } }, publicAi: {} });
  const configuration = await loadProviderConfiguration({});
  // Before the fix this was true: the product gate read only public_config.
  assert.equal(configuration.providers.groq.enabled, false);
  assert.equal(meshIncludesProvider({ groq: { apiKey: GROQ_KEY, enabled: false } }, {}, 'groq'), false);
});

test('F-23: disabled=true in ai_providers disables in both engines', async () => {
  await seedRuntimeSettings({ secrets: { groq: { apiKey: GROQ_KEY, disabled: true } }, publicAi: {} });
  const configuration = await loadProviderConfiguration({});
  assert.equal(configuration.providers.groq.enabled, false);
  assert.equal(meshIncludesProvider({ groq: { apiKey: GROQ_KEY, disabled: true } }, {}, 'groq'), false);
});

test('F-23: legacy enableGroq=false now disables in the /v1 MESH as well (audit repro direction)', async () => {
  // The audit observation: public_config disabled, ai_providers untouched →
  // the mesh kept serving groq. The legacy boolean is a compat input: an
  // explicit false disables in both engines.
  const secrets = { groq: { apiKey: GROQ_KEY } };
  assert.equal(meshIncludesProvider(secrets, { enableGroq: false }, 'groq'), false);
  await seedRuntimeSettings({ secrets, publicAi: { enableGroq: false } });
  const configuration = await loadProviderConfiguration({});
  assert.equal(configuration.providers.groq.enabled, false);
});

test('F-23: both engines agree across the full flag matrix', async () => {
  const storedVariants = [
    ['absent', {}],
    ['enabled-true', { enabled: true }],
    ['enabled-false', { enabled: false }],
    ['disabled-true', { disabled: true }],
  ];
  const legacyVariants = [
    ['absent', {}],
    ['true', { enableGroq: true }],
    ['false', { enableGroq: false }],
  ];
  for (const [storedName, storedFlags] of storedVariants) {
    for (const [legacyName, legacyFlags] of legacyVariants) {
      const secrets = { groq: { apiKey: GROQ_KEY, ...storedFlags } };
      const expected = storedFlags.enabled !== false && storedFlags.disabled !== true
        && legacyFlags.enableGroq !== false;
      const where = `stored=${storedName} legacy=${legacyName}`;
      assert.equal(meshIncludesProvider(secrets, legacyFlags, 'groq'), expected, `mesh disagrees (${where})`);
      await seedRuntimeSettings({ secrets, publicAi: legacyFlags });
      const configuration = await loadProviderConfiguration({});
      assert.equal(configuration.providers.groq.enabled, expected, `product engine disagrees (${where})`);
    }
  }
});

test('F-23: flags never enable a keyless provider (Boolean(key) still gates)', async () => {
  await seedRuntimeSettings({ secrets: { groq: { enabled: true } }, publicAi: { enableGroq: true } });
  const configuration = await loadProviderConfiguration({});
  assert.equal(configuration.providers.groq.enabled, false, 'no key anywhere → not enabled');
  assert.equal(meshIncludesProvider({ groq: { enabled: true } }, { enableGroq: true }, 'groq'), false);
});
