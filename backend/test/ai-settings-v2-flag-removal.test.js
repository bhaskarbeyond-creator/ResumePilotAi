'use strict';

// F-24 (P2): the ai_settings_v2_enabled flag did nothing. No engine code
// consulted it — it was read only to be echoed in the admin payload, and the
// frontend used it to swap the settings UI into a cosmetic "rollback" banner.
// No v1 settings schema exists to translate to or roll back to, so the
// finding's honest option is removal: a dead switch is worse than none.
// This spec pins the removal contract: the flag is unregistered, resolves to
// undefined (never a silent default), the admin payload no longer carries a
// featureFlags field, and the generic flag mechanism still serves the living
// flags. Wire-level behaviour is pinned by the F-24 live probe.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installAiSettingsContract } = require('./helpers/aiSettingsContract');
const settingsContract = installAiSettingsContract();

const { FLAG_DEFINITIONS, getFlagValue } = require('../services/featureFlagService');
const { loadAiAdminSettings } = require('../services/aiAdmin');

test('F-24: the dead ai_settings_v2_enabled switch is unregistered and unresolvable', async () => {
    assert.equal(Object.prototype.hasOwnProperty.call(FLAG_DEFINITIONS, 'ai_settings_v2_enabled'), false);
    assert.equal(await getFlagValue('ai_settings_v2_enabled'), undefined,
        'unknown flags resolve to undefined — no silent default resurrects the dead switch');
});

test('F-24: admin ai-settings payload carries no featureFlags field; the rest of the contract is intact', async () => {
    settingsContract.reset();
    const result = await loadAiAdminSettings({});
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'featureFlags'), false);
    assert.ok(Array.isArray(result.catalog) && result.catalog.length > 0);
    assert.ok(result.settings && typeof result.settings === 'object');
    assert.ok(result.secretEncryption, 'F-19 honest encryption status still reported');
    assert.ok(result.engine && result.engine.version, 'engine block still reported');
});

test('F-24: the generic feature-flag mechanism still serves living flags', async () => {
    assert.ok(FLAG_DEFINITIONS.ENTERPRISE_TENANCY_ENABLED, 'registry keeps flags that gate real behaviour');
    assert.ok(Object.keys(FLAG_DEFINITIONS).length >= 2);
});
