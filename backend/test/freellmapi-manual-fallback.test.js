'use strict';

// F-03 (P1): `manual` selection mode had no honest failure story. When the
// pinned provider went down the engine reported 502 ALL_PROVIDERS_FAILED —
// implying every provider was tried, while healthy alternatives were
// deliberately skipped. This spec pins the corrected contract:
//   1. strict manual (default): pinned-provider outage → 503
//      `provider_unavailable` + retryAfterSeconds, alternatives NOT tried.
//   2. opt-in `manualAllowFallback: true` (and enableFallback !== false):
//      the pin is tried first; on failure the ranked alternatives serve the
//      request and the deviation is visible as
//      routingDecision.fallbackFrom === 'manual'.
//   3. request-level explicit provider pins stay strict regardless of the
//      opt-in flag.
//   4. the flag round-trips through admin validation and the platform-config
//      builder (setting or MANUAL_ALLOW_FALLBACK env).

process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const { publicAiSettings } = require('../services/aiAdmin');
const { buildFreeLlmPlatformConfig } = require('../services/freellmConfig');

function makeRouter(downPrefix = 'llamacpp') {
    const router = new FreeLlmRouter();
    // The module-level cooldown manager is shared across router instances;
    // a fresh one per test keeps fixtures deterministic in one process.
    router.cooldownManager = new CooldownManager();
    const calls = [];
    router.modelDiscovery = {
        getOrDiscover: async ({ providerId }) => [{ id: `${providerId}-model`, capabilities: {} }],
    };
    // By default llamacpp (the pin) is down with HTTP 500 and groq (the
    // alternative) is healthy; `downPrefix` flips the fixture for tests that
    // pin groq explicitly.
    const fetchImpl = async (_url, options) => {
        const body = JSON.parse(options.body || '{}');
        calls.push(String(body.model));
        if (String(body.model).startsWith(downPrefix)) {
            return new Response(JSON.stringify({ error: { message: 'pinned provider down' } }), { status: 500 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: 'served by fallback' } }] }));
    };
    return { router, calls, fetchImpl };
}

function platformConfig(overrides = {}) {
    return {
        selectionMode: 'manual',
        primary: 'llamacpp',
        enableFallback: true,
        providers: {
            llamacpp: { enabled: true, model: 'llamacpp-model' },
            groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-model' },
        },
        ...overrides,
    };
}

test('F-03 strict manual: pinned-provider outage is an honest 503 provider_unavailable with Retry-After', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    await assert.rejects(
        router.routeCompletion({ prompt: 'pinned outage fixture', bypassCache: true, platformConfig: platformConfig(), fetchImpl }),
        (err) => {
            assert.equal(err.code, 'provider_unavailable');
            assert.equal(err.status, 503);
            assert.ok(Number(err.retryAfterSeconds) >= 1, 'retryAfterSeconds must be a positive backoff hint');
            assert.equal(err.provider, 'llamacpp');
            assert.ok(err.message.includes('llamacpp'), 'message must name the pinned provider');
            assert.ok(!err.message.includes('All AI providers failed'), 'must not claim every provider failed');
            return true;
        },
    );
    // The healthy alternative was deliberately NOT attempted — manual means manual.
    assert.deepEqual(calls, ['llamacpp-model']);
});

test('F-03 opt-in manualAllowFallback: pin is tried first, fallback serves, deviation is marked', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    const result = await router.routeCompletion({
        prompt: 'graceful manual fallback fixture',
        bypassCache: true,
        platformConfig: platformConfig({ manualAllowFallback: true }),
        fetchImpl,
    });
    assert.equal(result.provider, 'groq');
    assert.equal(result.content, 'served by fallback');
    assert.equal(result.routingDecision.fallbackFrom, 'manual', 'the deviation from the pin must be visible');
    assert.deepEqual(calls, ['llamacpp-model', 'groq-model'], 'pin must be attempted before any alternative');
    assert.equal(result.fallbacksAttempted[0].provider, 'llamacpp');
});

test('F-03 enableFallback:false vetoes the opt-in: strict pin semantics hold', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    await assert.rejects(
        router.routeCompletion({
            prompt: 'veto fixture',
            bypassCache: true,
            platformConfig: platformConfig({ manualAllowFallback: true, enableFallback: false }),
            fetchImpl,
        }),
        { code: 'provider_unavailable', status: 503 },
    );
    assert.deepEqual(calls, ['llamacpp-model']);
});

test('F-03 explicit provider pin in the request stays strict even with manualAllowFallback', async () => {
    // Fixture flipped: groq (the explicitly requested provider) is DOWN and
    // llamacpp is healthy — a silent substitution would serve llamacpp.
    const { router, calls, fetchImpl } = makeRouter('groq');
    await assert.rejects(
        router.routeCompletion({
            prompt: 'explicit pin fixture',
            bypassCache: true,
            model: 'groq', // request names a provider: strict pin, healthy llamacpp must not substitute
            platformConfig: platformConfig({ selectionMode: 'auto', manualAllowFallback: true }),
            fetchImpl,
        }),
        (err) => {
            assert.equal(err.code, 'provider_unavailable');
            assert.equal(err.status, 503);
            assert.equal(err.provider, 'groq');
            return true;
        },
    );
    assert.deepEqual(calls, ['groq-model'], 'only the explicitly pinned provider may be attempted');
});

test('F-03 config plumbing: manualAllowFallback round-trips admin validation and the platform builder', () => {
    assert.equal(publicAiSettings({ provider: 'groq', selectionMode: 'manual', manualAllowFallback: true }).manualAllowFallback, true);
    assert.equal(publicAiSettings({ provider: 'groq', selectionMode: 'manual' }).manualAllowFallback, false, 'default stays strict');
    assert.equal(publicAiSettings({ provider: 'groq', manualAllowFallback: 'yes' }).manualAllowFallback, false, 'only literal true opts in');

    const fromSetting = buildFreeLlmPlatformConfig({
        environment: {},
        secrets: {},
        publicConfig: { ai: { provider: 'groq', selectionMode: 'manual', manualAllowFallback: true } },
        systemSettings: {},
    });
    assert.equal(fromSetting.manualAllowFallback, true);

    const fromEnv = buildFreeLlmPlatformConfig({
        environment: { MANUAL_ALLOW_FALLBACK: 'true' },
        secrets: {},
        publicConfig: { ai: { provider: 'groq' } },
        systemSettings: {},
    });
    assert.equal(fromEnv.manualAllowFallback, true);

    const off = buildFreeLlmPlatformConfig({
        environment: {},
        secrets: {},
        publicConfig: { ai: { provider: 'groq' } },
        systemSettings: {},
    });
    assert.equal(off.manualAllowFallback, false);
});
