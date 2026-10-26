'use strict';

// F-19 (P2): platform AI provider keys were stored verbatim in
// system_settings.ai_providers (audit probe A.12: a SQL read returned
// 'sk-deepseek-audit-123456') while tenant BYOK credentials already used
// AES-256-GCM envelope encryption. This spec pins the corrected contract:
//   1. with ENTERPRISE_ENCRYPTION_KEY(S) configured, saves seal apiKey/
//      apiKeys into envelopes — the serialized store never contains the
//      plaintext; legacy plaintext rows migrate on the next authorized save.
//   2. reads decrypt in memory only: masking shows the TRUE last-4 of the
//      real key, runtime configuration and the engine builder receive
//      plaintext, and the API response never carries the secret.
//   3. a stored envelope without a usable key fails closed
//      (AI_SECRET_ENCRYPTION_UNAVAILABLE, 503) — ciphertext is never served
//      as a credential.
//   4. keyless deployments keep the legacy plaintext contract (no breaking
//      change), surfaced honestly as secretEncryption:'unavailable'.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadAiAdminSettings, saveAiAdminSettings } = require('../services/aiAdmin');
const { loadProviderConfiguration, clearProviderConfigurationCache } = require('../services/aiRuntime');
const { buildFreeLlmPlatformConfig } = require('../services/freellmConfig');
const { isEncryptedEnvelope } = require('../enterprise/encryptionProvider');
const { installAiSettingsContract } = require('./helpers/aiSettingsContract');

const settingsContract = installAiSettingsContract();

const TEST_KEY = crypto.createHash('sha256').update('f19-spec-master-key').digest('base64');
const PLAINTEXT_KEY = 'fixture-nvidia-key-value';

function withEncryption(run) {
    const previous = process.env.ENTERPRISE_ENCRYPTION_KEY;
    process.env.ENTERPRISE_ENCRYPTION_KEY = TEST_KEY;
    return Promise.resolve()
        .then(run)
        .finally(() => {
            if (previous === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY;
            else process.env.ENTERPRISE_ENCRYPTION_KEY = previous;
        });
}

function withoutEncryption(run) {
    const previousKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
    const previousKeys = process.env.ENTERPRISE_ENCRYPTION_KEYS;
    delete process.env.ENTERPRISE_ENCRYPTION_KEY;
    delete process.env.ENTERPRISE_ENCRYPTION_KEYS;
    return Promise.resolve()
        .then(run)
        .finally(() => {
            if (previousKey !== undefined) process.env.ENTERPRISE_ENCRYPTION_KEY = previousKey;
            if (previousKeys !== undefined) process.env.ENTERPRISE_ENCRYPTION_KEYS = previousKeys;
        });
}

test('F-19 save: with encryption configured the store holds envelopes, never plaintext', async () => {
    await withEncryption(async () => {
        settingsContract.reset();
        await saveAiAdminSettings({
            input: { provider: 'nvidia', nvidiaApiKey: PLAINTEXT_KEY, nvidiaModel: 'meta/llama-3.2-11b-vision-instruct' },
            expectedRevision: 0,
            actorUid: 'f19-admin',
        });
        const stored = settingsContract.settings.get('ai_providers').data;
        assert.equal(isEncryptedEnvelope(stored.nvidia.apiKey), true, 'apiKey must be sealed in an envelope');
        assert.equal(stored.nvidia.apiKey.alg, 'AES-256-GCM');
        assert.equal(JSON.stringify(stored).includes(PLAINTEXT_KEY), false, 'the serialized store must not contain the plaintext');
        assert.equal(stored.nvidia.model, 'meta/llama-3.2-11b-vision-instruct', 'non-secret fields stay readable');
    });
});

test('F-19 load: decryption is in-memory only — mask shows the true last-4, response carries no secret', async () => {
    await withEncryption(async () => {
        settingsContract.reset();
        await saveAiAdminSettings({
            input: { provider: 'nvidia', nvidiaApiKey: PLAINTEXT_KEY },
            expectedRevision: 0,
            actorUid: 'f19-admin',
        });
        const result = await loadAiAdminSettings({});
        assert.equal(result.secretEncryption, 'active');
        assert.equal(result.credentialSources.nvidia, 'mariadb-secret-store');
        assert.equal(result.maskedKeys.nvidia, `••••••••${PLAINTEXT_KEY.slice(-4)}`, 'the mask must reflect the real key, not the ciphertext');
        assert.equal(result.settings.nvidiaApiKey, undefined, 'the secret must never appear in the settings response');
        assert.equal(JSON.stringify(result).includes(PLAINTEXT_KEY), false);
        // The runtime configuration (engine-facing) decrypts in memory.
        clearProviderConfigurationCache();
        const runtime = await loadProviderConfiguration({});
        assert.equal(runtime.providers.nvidia.key, PLAINTEXT_KEY);
    });
});

test('F-19 fail-closed: a stored envelope without a usable key is never served as a credential', async () => {
    await withEncryption(async () => {
        settingsContract.reset();
        await saveAiAdminSettings({
            input: { provider: 'nvidia', nvidiaApiKey: PLAINTEXT_KEY },
            expectedRevision: 0,
            actorUid: 'f19-admin',
        });
    });
    await withoutEncryption(async () => {
        await assert.rejects(
            async () => loadAiAdminSettings({}),
            (err) => {
                assert.equal(err.code, 'AI_SECRET_ENCRYPTION_UNAVAILABLE');
                assert.equal(err.status, 503);
                return true;
            },
        );
        clearProviderConfigurationCache();
        await assert.rejects(
            async () => loadProviderConfiguration({}),
            (err) => err.code === 'AI_SECRET_ENCRYPTION_UNAVAILABLE',
        );
    });
});

test('F-19 keyless deployment: legacy plaintext contract keeps working, status says unavailable', async () => {
    await withoutEncryption(async () => {
        settingsContract.reset();
        await saveAiAdminSettings({
            input: { provider: 'nvidia', nvidiaApiKey: PLAINTEXT_KEY },
            expectedRevision: 0,
            actorUid: 'f19-admin',
        });
        const stored = settingsContract.settings.get('ai_providers').data;
        assert.equal(stored.nvidia.apiKey, PLAINTEXT_KEY, 'with no key configured the legacy plaintext store is preserved (no breaking change)');
        const result = await loadAiAdminSettings({});
        assert.equal(result.secretEncryption, 'unavailable');
        assert.equal(result.maskedKeys.nvidia, `••••••••${PLAINTEXT_KEY.slice(-4)}`);
    });
});

test('F-19 migration: a legacy plaintext row is sealed by the next authorized save', async () => {
    await withEncryption(async () => {
        settingsContract.reset({
            public_config: { ai: { provider: 'nvidia' }, aiRevision: 1 },
            ai_providers: { nvidia: { apiKey: PLAINTEXT_KEY }, _revision: 1 },
        });
        // A save that does not touch the nvidia secret at all.
        await saveAiAdminSettings({
            input: { provider: 'nvidia', temperature: 0.4 },
            expectedRevision: 1,
            actorUid: 'f19-admin',
        });
        const stored = settingsContract.settings.get('ai_providers').data;
        assert.equal(isEncryptedEnvelope(stored.nvidia.apiKey), true, 'the legacy plaintext must migrate to an envelope');
        assert.equal(JSON.stringify(stored).includes(PLAINTEXT_KEY), false);
        // And the migrated store still round-trips for the engine.
        clearProviderConfigurationCache();
        const runtime = await loadProviderConfiguration({});
        assert.equal(runtime.providers.nvidia.key, PLAINTEXT_KEY);
    });
});

test('F-19 engine builder: buildFreeLlmPlatformConfig consumes the decrypted pool', async () => {
    await withEncryption(async () => {
        settingsContract.reset();
        await saveAiAdminSettings({
            input: { provider: 'nvidia', nvidiaApiKey: PLAINTEXT_KEY, nvidiaApiKeys: ['gsk-f19-pool-key-one', 'gsk-f19-pool-key-two'] },
            expectedRevision: 0,
            actorUid: 'f19-admin',
        });
        const stored = settingsContract.settings.get('ai_providers').data;
        assert.equal(isEncryptedEnvelope(stored.nvidia.apiKeys), true, 'the whole pool is sealed as one envelope');
        const configuration = buildFreeLlmPlatformConfig({
            environment: {},
            secrets: stored,
            publicConfig: { ai: { provider: 'nvidia' } },
            systemSettings: {},
        });
        const keys = configuration.providers.nvidia.apiKeys;
        assert.deepEqual(keys, ['gsk-f19-pool-key-one', 'gsk-f19-pool-key-two'], 'the engine must receive the plaintext pool');
    });
});
