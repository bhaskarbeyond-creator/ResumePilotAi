'use strict';

// F-16 (P2): `configuredProviders` ignored `enabled`. The flat response map
// was built as `credentialSources[provider] !== 'none'` and then overwritten
// with the catalog's `configuredOnServer`, which for non-opt-in providers
// ignores the disable toggles — a disabled groq (enableGroq:false) with a
// stored key still reported configured:true, and the admin surface had no
// flat-map way to see the disable. The fix reports the two facts separately:
//   configuredProviders[pId] = hasCredential (credential source known, or keyless)
//   enabledProviders[pId]    = the catalog's effective enabled state
// Both stay booleans for every catalog id, so existing API consumers and the
// typeof-boolean contract assertions keep passing.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAiAdminSettings } = require('../services/aiAdmin');
const { installAiSettingsContract } = require('./helpers/aiSettingsContract');

const settingsContract = installAiSettingsContract();

function fixture(aiOverrides = {}, providerOverrides = {}) {
    settingsContract.reset({
        public_config: { ai: { provider: 'nvidia', ...aiOverrides }, aiRevision: 1 },
        ai_providers: {
            nvidia: { apiKey: 'test-nvidia-key-1234' },
            ...providerOverrides,
            _revision: 1,
        },
    });
}

test('F-16: a disabled provider with a credential reports configured:true but enabled:false', async () => {
    fixture({ enableGroq: false }, { groq: { apiKey: 'fixture-groq-key-12345', model: 'llama-3.3-70b-versatile' } });
    const result = await loadAiAdminSettings({});
    assert.equal(result.configuredProviders.groq, true, 'the credential fact stays true (hasCredential semantics)');
    assert.equal(result.enabledProviders.groq, false, 'the disable must be visible on the flat map');
    const item = result.catalog.find(p => p.id === 'groq');
    assert.equal(item.enabled, false);
    assert.equal(item.status, 'disabled');
    assert.equal(result.credentialSources.groq, 'mariadb-secret-store');
});

test('F-16: an enabled provider with a credential reports both true', async () => {
    fixture({}, { groq: { apiKey: 'fixture-groq-key-12345', model: 'llama-3.3-70b-versatile' } });
    const result = await loadAiAdminSettings({});
    assert.equal(result.configuredProviders.groq, true);
    assert.equal(result.enabledProviders.groq, true);
    const item = result.catalog.find(p => p.id === 'groq');
    assert.equal(item.enabled, true);
    assert.notEqual(item.status, 'disabled');
});

test('F-16: a provider without credentials reports configured:false', async () => {
    fixture({}, {});
    const result = await loadAiAdminSettings({});
    assert.equal(result.configuredProviders.groq, false, 'no key anywhere means no credential');
    assert.equal(result.enabledProviders.groq, false, 'no credential, no keyless access — not enabled');
});

test('F-16: both flat maps mirror the catalog for every provider id, as booleans', async () => {
    fixture({ enableGroq: false }, { groq: { apiKey: 'fixture-groq-key-12345' } });
    const result = await loadAiAdminSettings({});
    assert.ok(result.catalog.length > 10, 'the full platform catalog must be present');
    for (const item of result.catalog) {
        assert.equal(typeof result.configuredProviders[item.id], 'boolean', `configuredProviders.${item.id} must stay boolean`);
        assert.equal(typeof result.enabledProviders[item.id], 'boolean', `enabledProviders.${item.id} must stay boolean`);
        assert.equal(result.configuredProviders[item.id], item.credentialSource !== 'none', `configuredProviders.${item.id} must equal hasCredential`);
        assert.equal(result.enabledProviders[item.id], item.enabled, `enabledProviders.${item.id} must equal the catalog enabled state`);
        if (result.enabledProviders[item.id]) {
            assert.equal(item.status === 'disabled', false, 'an enabled provider must never carry the disabled status');
        }
    }
});
