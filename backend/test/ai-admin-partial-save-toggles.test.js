'use strict';

// F-15 (P2): a partial save re-enabled legacy providers. publicAiSettings
// normalized every absent enable toggle with `!== false`, i.e. to true — so
// any save omitting those booleans wrote enableNvidia/enableGemini/... :true
// for providers nobody mentioned (audit probe: true for providers with no key
// configured at all). The fix preserves the previous stored value when the
// field is absent — including its absence — and only normalizes fields that
// are actually present. Consumers treat a missing field exactly like an
// enabled one (`=== false` checks), so omission is behaviorally inert while
// the stored config stops claiming toggles the operator never sent.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { publicAiSettings, saveAiAdminSettings } = require('../services/aiAdmin');
const { installAiSettingsContract } = require('./helpers/aiSettingsContract');

const settingsContract = installAiSettingsContract();

const TOGGLES = ['enableGemini', 'enableNvidia', 'enableOpenai', 'enableGroq', 'enableOpenrouter', 'enableDeepseek'];

test('F-15 unit: a fresh partial save fabricates no enable toggles', () => {
    const result = publicAiSettings({ provider: 'groq', temperature: 0.5 });
    for (const field of TOGGLES) {
        assert.equal(result[field], undefined, `${field} must stay absent when nobody sent it`);
    }
    const persisted = JSON.parse(JSON.stringify(result));
    for (const field of TOGGLES) {
        assert.equal(field in persisted, false, `${field} must not materialize through a JSON round-trip`);
    }
    assert.equal(persisted.provider, 'groq');
    assert.equal(persisted.temperature, 0.5);
});

test('F-15 unit: absent toggles preserve the previously stored value', () => {
    const result = publicAiSettings({ provider: 'groq' }, { enableNvidia: false, enableGroq: true });
    assert.equal(result.enableNvidia, false, 'a stored disable must survive a partial save');
    assert.equal(result.enableGroq, true, 'a stored enable must survive a partial save');
    assert.equal(result.enableGemini, undefined, 'fields absent from input AND prior state stay absent');
});

test('F-15 unit: present fields still win over the prior state', () => {
    const legacyField = publicAiSettings({ provider: 'groq', enableNvidia: false }, { enableNvidia: true });
    assert.equal(legacyField.enableNvidia, false, 'an explicit legacy-field false overrides the prior true');
    const viaMap = publicAiSettings({ provider: 'groq', enabledProviders: { nvidia: false } }, { enableNvidia: true });
    assert.equal(viaMap.enableNvidia, false, 'the enabledProviders map overrides the prior state');
    const presentTrue = publicAiSettings({ provider: 'groq', enableGemini: true }, {});
    assert.equal(presentTrue.enableGemini, true, 'a present true normalizes as before');
});

test('F-15 save path: a fresh partial save persists without fabricated toggles', async () => {
    settingsContract.reset();
    await saveAiAdminSettings({
        input: { provider: 'groq', groqApiKey: 'fixture-groq-key-12345', temperature: 0.3 },
        expectedRevision: 0,
        actorUid: 'f15-admin',
    });
    const stored = settingsContract.settings.get('public_config').data.ai;
    for (const field of TOGGLES) {
        assert.equal(field in stored, false, `public_config.ai.${field} must not be fabricated by a partial save`);
    }
    assert.equal(stored.provider, 'groq');
    assert.equal(stored.temperature, 0.3);
});

test('F-15 save path: a stored disable survives later partial saves; absence stays absence', async () => {
    settingsContract.reset();
    await saveAiAdminSettings({
        input: { provider: 'groq', groqApiKey: 'fixture-groq-key-12345', enableNvidia: false },
        expectedRevision: 0,
        actorUid: 'f15-admin',
    });
    const afterDisable = settingsContract.settings.get('public_config').data.ai;
    assert.equal(afterDisable.enableNvidia, false);

    // A later partial save that mentions no toggles must not re-enable nvidia
    // nor fabricate the other five.
    await saveAiAdminSettings({
        input: { provider: 'groq', temperature: 0.9 },
        expectedRevision: 1,
        actorUid: 'f15-admin',
    });
    const stored = settingsContract.settings.get('public_config').data.ai;
    assert.equal(stored.enableNvidia, false, 'the stored disable must survive the partial save');
    assert.equal(stored.temperature, 0.9, 'the partial save still applies its own fields');
    for (const field of TOGGLES.filter(f => f !== 'enableNvidia')) {
        assert.equal(field in stored, false, `${field} must never have been fabricated`);
    }
});
