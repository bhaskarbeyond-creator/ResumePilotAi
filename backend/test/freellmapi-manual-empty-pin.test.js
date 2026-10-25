'use strict';

// F-04 (P1): `selectionMode=manual` with an EMPTY model pin used to resolve
// the pin to the literal model "auto", which matches no catalog id — every
// request died with an opaque 503 (audit probe A.7). The corrected contract:
//   1. save-time: manual without an explicit pinned model is rejected 400
//      (AI_SETTINGS_VALIDATION_ERROR) — for legacy MODEL_FIELDS providers and
//      registry providers (nested per-provider model in ai_providers).
//   2. routing (defence in depth for already-saved configs): an empty/'auto'
//      pin means "provider default" — discovered catalog models stay eligible.
//   3. a REAL pin that matches nothing is still refused, but the 503 now
//      names the selection mode and primary instead of the generic wording.

process.env.FREELMAPI_METRICS_DB = ':memory:';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const { saveAiAdminSettings } = require('../services/aiAdmin');
const { installAiSettingsContract } = require('./helpers/aiSettingsContract');

const settingsContract = installAiSettingsContract();

function makeRouter(catalog) {
    const router = new FreeLlmRouter();
    router.cooldownManager = new CooldownManager();
    const calls = [];
    router.modelDiscovery = { getOrDiscover: async () => catalog.map(id => ({ id, capabilities: {} })) };
    const fetchImpl = async (_url, options) => {
        calls.push(String(JSON.parse(options.body || '{}').model));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'served by catalog model' } }] }));
    };
    return { router, calls, fetchImpl };
}

test('F-04 routing: manual with an empty model pin routes to the provider default instead of 503', async () => {
    const { router, calls, fetchImpl } = makeRouter(['local-model', 'local-model-small']);
    const result = await router.routeCompletion({
        prompt: 'empty pin fixture',
        bypassCache: true,
        fetchImpl,
        platformConfig: {
            selectionMode: 'manual',
            primary: 'llamacpp',
            providers: { llamacpp: { enabled: true } }, // no model configured
        },
    });
    assert.equal(result.provider, 'llamacpp');
    assert.ok(calls.includes(result.model), 'the executed model must come from the discovered catalog');
    assert.ok(['local-model', 'local-model-small'].includes(result.model));
});

test('F-04 routing: the literal "auto" pin is treated as an empty pin, not as a model id', async () => {
    const { router, calls, fetchImpl } = makeRouter(['local-model']);
    const result = await router.routeCompletion({
        prompt: 'literal auto pin fixture',
        bypassCache: true,
        fetchImpl,
        platformConfig: {
            selectionMode: 'manual',
            primary: 'llamacpp',
            providers: { llamacpp: { enabled: true, model: 'auto' } },
        },
    });
    assert.equal(result.model, 'local-model');
    assert.deepEqual(calls, ['local-model']);
});

test('F-04 routing: a real pin that matches no catalog model is refused with an honest, specific 503', async () => {
    const { router, calls, fetchImpl } = makeRouter(['local-model']);
    await assert.rejects(
        router.routeCompletion({
            prompt: 'dead pin fixture',
            bypassCache: true,
            fetchImpl,
            platformConfig: {
                selectionMode: 'manual',
                primary: 'llamacpp',
                providers: { llamacpp: { enabled: true, model: 'retired-pin' } },
            },
        }),
        (err) => {
            assert.equal(err.code, 'AI_PROVIDER_UNAVAILABLE');
            assert.equal(err.status, 503);
            assert.ok(err.message.includes('manual'), 'the 503 must name the selection mode');
            assert.ok(err.message.includes('llamacpp'), 'the 503 must name the pinned primary');
            return true;
        },
    );
    assert.deepEqual(calls, [], 'nothing may be dispatched when the pin matches no catalog model');
});

test('F-04 save: manual without an explicit pinned model is rejected 400', async () => {
    settingsContract.reset();
    await assert.rejects(
        saveAiAdminSettings({
            input: { provider: 'groq', selectionMode: 'manual' }, // no groqModel anywhere
            actorUid: 'super',
            expectedRevision: 0,
        }),
        (err) => {
            assert.equal(err.code, 'AI_SETTINGS_VALIDATION_ERROR');
            assert.equal(err.status, 400);
            assert.ok(err.message.includes('manual'));
            assert.ok(err.message.includes('groq'));
            return true;
        },
    );
});

test('F-04 save: manual with a flat MODEL_FIELDS pin saves, and a nested registry pin saves too', async () => {
    settingsContract.reset();
    const savedFlat = await saveAiAdminSettings({
        input: { provider: 'groq', selectionMode: 'manual', groqModel: 'llama-3.3-70b-versatile' },
        actorUid: 'super',
        expectedRevision: 0,
    });
    assert.equal(savedFlat.settings.selectionMode, 'manual');

    settingsContract.reset();
    const savedNested = await saveAiAdminSettings({
        input: { provider: 'llamacpp', selectionMode: 'manual', llamacpp: { model: '/models/local.gguf' } },
        actorUid: 'super',
        expectedRevision: 0,
    });
    assert.equal(savedNested.settings.selectionMode, 'manual');
    assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.model, '/models/local.gguf');
});

test('F-04 save: a previously stored pin satisfies the validation on credential-only saves', async () => {
    settingsContract.reset({
        public_config: { aiRevision: 1, ai: { provider: 'groq', selectionMode: 'manual', groqModel: 'llama-3.3-70b-versatile' } },
        ai_providers: { _revision: 1 },
    });
    const saved = await saveAiAdminSettings({
        input: { openaiApiKey: 'fixture-openai-secret-value' },
        actorUid: 'super',
        expectedRevision: 1,
    });
    assert.equal(saved.settings.selectionMode, 'manual');
});
