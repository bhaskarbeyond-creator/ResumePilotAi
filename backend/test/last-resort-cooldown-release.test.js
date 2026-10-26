'use strict';

// F-14 (P2): the live engine had no last-resort cooldown release. With one
// provider, any 429/5xx benched it for 60–300 s and every request returned a
// hard 503 — while the aiRouting selector deliberately releases the
// earliest-expiring cooldown when everything is benched
// (services/aiRouting/modelSelector.js). This spec pins the ported contract
// on BOTH paths — policy-mode deployments (applySelectionPolicy) and legacy
// pinned configurations with no selectionMode (the buildCandidateList
// tier-1 skip the finding cites):
//   1. all destinations benched on TRANSIENT cooldowns → the earliest-expiring
//      one is released, retried, and the deviation is visible as
//      routingDecision.lastResort === true.
//   2. credential rejections ('All pooled keys rejected') are NEVER released.
//   3. strict pins (manual mode without manualAllowFallback) keep the F-03
//      honest-503 contract — no silent unpinning.
//   4. rejections that were not cooldowns (tenant policy) trigger no release.

process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');

function makeRouter() {
    const router = new FreeLlmRouter();
    // The module-level cooldown manager is shared across router instances;
    // a fresh one per test keeps fixtures deterministic in one process.
    router.cooldownManager = new CooldownManager();
    const calls = [];
    router.modelDiscovery = {
        getOrDiscover: async ({ providerId }) => [{ id: `${providerId}-model`, capabilities: {} }],
    };
    const fetchImpl = async (_url, options) => {
        const body = JSON.parse(options.body || '{}');
        calls.push(String(body.model));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'served after last-resort release' } }] }));
    };
    return { router, calls, fetchImpl };
}

function platformConfig(overrides = {}) {
    return {
        selectionMode: 'speed',
        primary: 'groq',
        enableFallback: true,
        providers: {
            groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-model' },
            openai: { enabled: true, key: 'fixture-openai-key-123', model: 'openai-model' },
        },
        ...overrides,
    };
}

test('F-14 release: single benched provider is retried instead of a hard 503, marked lastResort', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    router.cooldownManager.setCooldown('groq', 'groq-model', 'HTTP 429 across all pooled keys', 200_000);
    const result = await router.routeCompletion({
        prompt: 'F-14 single-provider release fixture',
        bypassCache: true,
        platformConfig: platformConfig({ providers: { groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-model' } } }),
        fetchImpl,
    });
    assert.equal(result.provider, 'groq', 'the released destination must serve the request');
    assert.equal(result.content, 'served after last-resort release');
    assert.equal(result.routingDecision.lastResort, true, 'the release must be visible on the routing decision');
    assert.deepEqual(calls, ['groq-model'], 'exactly one attempt through the released cooldown');
    assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-model').onCooldown, false, 'release must clear the benched cooldown');
});

test('F-14 release: the earliest-expiring cooldown wins, the other stays benched', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    router.cooldownManager.setCooldown('groq', 'groq-model', 'HTTP 429 across all pooled keys', 200_000);
    router.cooldownManager.setCooldown('openai', 'openai-model', 'Provider unavailable', 50_000);
    const result = await router.routeCompletion({
        prompt: 'F-14 earliest-expiry release fixture',
        bypassCache: true,
        platformConfig: platformConfig(),
        fetchImpl,
    });
    assert.equal(result.provider, 'openai', 'the 50 s bench must be released before the 200 s bench');
    assert.equal(result.routingDecision.lastResort, true);
    assert.deepEqual(calls, ['openai-model']);
    const groqState = router.cooldownManager.isOnCooldown('groq', 'groq-model');
    assert.equal(groqState.onCooldown, true, 'the later-expiring bench must NOT be released');
    assert.ok(groqState.remainingMs > 100_000, 'groq keeps its remaining backoff window');
});

test('F-14 no release: credential rejections are never retried', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    router.cooldownManager.setCooldown('groq', 'groq-model', 'All pooled keys rejected', 120_000);
    router.cooldownManager.setCooldown('openai', 'openai-model', 'All pooled keys rejected', 90_000);
    await assert.rejects(
        router.routeCompletion({ prompt: 'F-14 auth-rejection fixture', bypassCache: true, platformConfig: platformConfig(), fetchImpl }),
        (err) => {
            assert.equal(err.code, 'AI_PROVIDER_UNAVAILABLE');
            assert.equal(err.status, 503);
            return true;
        },
    );
    assert.deepEqual(calls, [], 'rejected credentials must not be retried');
    assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-model').onCooldown, true, 'auth benches stay intact');
});

test('F-14 no release: a strict manual pin keeps the honest 503 contract', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    router.cooldownManager.setCooldown('groq', 'groq-model', 'HTTP 429 across all pooled keys', 120_000);
    await assert.rejects(
        router.routeCompletion({
            prompt: 'F-14 strict pin fixture',
            bypassCache: true,
            platformConfig: platformConfig({ selectionMode: 'manual' }),
            fetchImpl,
        }),
        (err) => {
            assert.equal(err.code, 'AI_PROVIDER_UNAVAILABLE');
            assert.equal(err.status, 503);
            assert.ok(err.message.includes('excluded every destination'), 'the F-04 diagnostic message must survive');
            return true;
        },
    );
    assert.deepEqual(calls, [], 'a strict pin must never be silently unbenched');
    assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-model').onCooldown, true, 'the pinned bench stays for F-03 Retry-After honesty');
});

test('F-14 release: legacy pinned config (no selectionMode) recovers via the same release', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    router.cooldownManager.setCooldown('groq', 'groq-model', 'HTTP 429 across all pooled keys', 200_000);
    const result = await router.routeCompletion({
        prompt: 'F-14 legacy release fixture',
        bypassCache: true,
        platformConfig: {
            enableFallback: false,
            providers: { groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-model' } },
        },
        fetchImpl,
    });
    assert.equal(result.provider, 'groq', 'the legacy single-provider bench must be released, not a hard 503');
    assert.equal(result.routingDecision.lastResort, true, 'the release must be visible on the routing decision');
    assert.deepEqual(calls, ['groq-model'], 'exactly one attempt through the released cooldown');
    assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-model').onCooldown, false, 'release must clear the benched cooldown');
});

test('F-14 no release: legacy credential rejections stay benched', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    router.cooldownManager.setCooldown('groq', 'groq-model', 'All pooled keys rejected', 120_000);
    await assert.rejects(
        router.routeCompletion({
            prompt: 'F-14 legacy auth-rejection fixture',
            bypassCache: true,
            platformConfig: {
                enableFallback: false,
                providers: { groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-model' } },
            },
            fetchImpl,
        }),
        (err) => {
            assert.equal(err.code, 'AI_PROVIDER_UNAVAILABLE');
            assert.equal(err.status, 503);
            return true;
        },
    );
    assert.deepEqual(calls, [], 'rejected credentials must not be retried on the legacy path either');
    assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-model').onCooldown, true);
});

test('F-14 no release: policy rejections (not cooldowns) do not trigger the release', async () => {
    const { router, calls, fetchImpl } = makeRouter();
    router.cooldownManager.setCooldown('groq', 'groq-model', 'HTTP 429 across all pooled keys', 120_000);
    await assert.rejects(
        router.routeCompletion({
            prompt: 'F-14 restricted-model fixture',
            bypassCache: true,
            platformConfig: platformConfig({ providers: { groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-model' } } }),
            tenantContext: { restrictedModels: ['groq-model'] },
            fetchImpl,
        }),
        (err) => {
            assert.equal(err.code, 'AI_PROVIDER_UNAVAILABLE');
            assert.equal(err.status, 503);
            return true;
        },
    );
    assert.deepEqual(calls, [], 'a tenant-restricted model must stay restricted even while benched');
    assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-model').onCooldown, true, 'policy rejections must not clear cooldowns');
});
