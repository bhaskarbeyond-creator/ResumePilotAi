'use strict';

// F-02 (P1): the engine prompt cache must never replay one principal's
// completion to another. Before the fix the cache identity covered tenant
// policy, candidates and request semantics only — two different platform API
// keys (or two different users) posting byte-identical messages shared a
// single entry, and the second caller received the first caller's cached
// answer with `cached: true` and zero provider invocations.
//
// These tests pin the contract at both layers:
//   1. engine   — `routeCompletion({ cacheScope })` binds entries per scope.
//   2. agent    — `handleAnthropicMessages` forwards `options.cacheScope`.
//   3. runtime  — `generateWithProviders` derives the scope from `principalId`
//                 (explicit argument or the stamped configuration).

// Keep the suite hermetic: the durable metrics store must not write inside the
// repository during tests.
process.env.FREELMAPI_METRICS_DB = process.env.FREELMAPI_METRICS_DB || ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const freellm = require('../freellmapi');

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(payload),
    };
}

function makeCountingFetch(tag) {
    const state = { calls: 0 };
    state.fetch = async () => {
        state.calls += 1;
        return jsonResponse({
            id: 'chatcmpl-cache-scope',
            choices: [{ index: 0, message: { role: 'assistant', content: `${tag} answer #${state.calls}` }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
        });
    };
    return state;
}

const platformConfig = {
    providers: {
        groq: { key: 'gsk-mock-cache-scope', enabled: true, model: 'llama-3.3-70b-versatile' },
    },
    enableFallback: false,
};

test('F-02 engine: identical messages under different cacheScope never share a cache entry', async () => {
    freellm.resetCooldowns();
    freellm.clearCache();
    const stub = makeCountingFetch('engine');
    const base = {
        messages: [{ role: 'user', content: 'Identical prompt submitted by two principals' }],
        platformConfig,
        fetchImpl: stub.fetch,
        temperature: 0.3,
    };

    const alice1 = await freellm.completeChat({ ...base, cacheScope: 'user:alice' });
    assert.equal(alice1.cached, false);
    assert.equal(stub.calls, 1);

    // Same principal, same prompt → cache hit, no new provider call.
    const alice2 = await freellm.completeChat({ ...base, cacheScope: 'user:alice' });
    assert.equal(alice2.cached, true);
    assert.equal(stub.calls, 1);
    assert.equal(alice2.content, alice1.content);

    // Different principal, byte-identical prompt → MUST miss and re-invoke.
    const bob1 = await freellm.completeChat({ ...base, cacheScope: 'user:bob' });
    assert.equal(bob1.cached, false);
    assert.equal(stub.calls, 2);
    assert.notEqual(bob1.content, alice1.content);

    // Alice's own entry is still intact after Bob's miss.
    const alice3 = await freellm.completeChat({ ...base, cacheScope: 'user:alice' });
    assert.equal(alice3.cached, true);
    assert.equal(stub.calls, 2);
    assert.equal(alice3.content, alice1.content);
});

test('F-02 engine: scoped and unscoped requests have distinct cache identities', async () => {
    freellm.resetCooldowns();
    freellm.clearCache();
    const stub = makeCountingFetch('identity');
    const base = {
        messages: [{ role: 'user', content: 'Scope versus no scope identity check' }],
        platformConfig,
        fetchImpl: stub.fetch,
        temperature: 0.3,
    };

    const unscoped1 = await freellm.completeChat({ ...base, cacheScope: null });
    assert.equal(unscoped1.cached, false);
    const unscoped2 = await freellm.completeChat({ ...base, cacheScope: null });
    assert.equal(unscoped2.cached, true);
    assert.equal(stub.calls, 1);

    const scoped = await freellm.completeChat({ ...base, cacheScope: 'pk:0123456789abcdef' });
    assert.equal(scoped.cached, false, 'a scoped caller must not replay the unscoped entry');
    assert.equal(stub.calls, 2);

    const unscoped3 = await freellm.completeChat({ ...base, cacheScope: null });
    assert.equal(unscoped3.cached, true);
    assert.equal(stub.calls, 2);
});

test('F-02 agent: handleAnthropicMessages forwards cacheScope for per-principal isolation', async () => {
    freellm.resetCooldowns();
    freellm.clearCache();
    const stub = makeCountingFetch('anthropic');
    const request = {
        model: 'claude-3-7-sonnet',
        max_tokens: 128,
        messages: [{ role: 'user', content: 'Identical anthropic prompt from two keys' }],
    };

    const keyA = await freellm.handleAnthropicMessages(request, {
        platformConfig,
        fetchImpl: stub.fetch,
        cacheScope: 'pk:aaaaaaaaaaaaaaaa',
    });
    assert.equal(keyA._freellmapi.cached, false);
    assert.equal(stub.calls, 1);

    const keyB = await freellm.handleAnthropicMessages(request, {
        platformConfig,
        fetchImpl: stub.fetch,
        cacheScope: 'pk:bbbbbbbbbbbbbbbb',
    });
    assert.equal(keyB._freellmapi.cached, false, 'platform key B must not replay key A cached answer');
    assert.equal(stub.calls, 2);

    const keyAAgain = await freellm.handleAnthropicMessages(request, {
        platformConfig,
        fetchImpl: stub.fetch,
        cacheScope: 'pk:aaaaaaaaaaaaaaaa',
    });
    assert.equal(keyAAgain._freellmapi.cached, true);
    assert.equal(stub.calls, 2);
    assert.equal(keyAAgain.content[0].text, keyA.content[0].text);
});

test('F-02 runtime: generateWithProviders binds the cache to principalId', async () => {
    freellm.resetCooldowns();
    freellm.clearCache();
    const stub = makeCountingFetch('runtime');
    const configuration = {
        providers: {
            groq: { key: 'gsk-mock-runtime-scope', enabled: true, model: 'llama-3.3-70b-versatile' },
        },
        primary: 'groq',
        enableFallback: false,
        temperature: 0.3,
        maxTokens: 256,
    };
    const { generateWithProviders } = require('../services/aiRuntime');
    const call = (principalId, config = configuration) => generateWithProviders({
        prompt: 'Shared prompt text across product callers',
        configuration: config,
        operation: 'unit-test-cache-scope',
        fetchImpl: stub.fetch,
        principalId,
    });

    const alice1 = await call('alice');
    assert.ok(!alice1.routing.cached);
    assert.equal(stub.calls, 1);

    const alice2 = await call('alice');
    assert.equal(alice2.routing.cached, true);
    assert.equal(stub.calls, 1);

    const bob1 = await call('bob');
    assert.ok(!bob1.routing.cached, 'principal bob must not replay alice cached completion');
    assert.equal(stub.calls, 2);

    // Configuration-stamped principalId (tenant policy / personal scope
    // resolution) is honoured when no explicit principalId is passed.
    const stamped = { ...configuration, principalId: 'carol' };
    const carol1 = await call(null, stamped);
    assert.ok(!carol1.routing.cached);
    assert.equal(stub.calls, 3);

    const carol2 = await call(null, stamped);
    assert.equal(carol2.routing.cached, true);
    assert.equal(stub.calls, 3);

    const alice3 = await call('alice');
    assert.equal(alice3.routing.cached, true, 'alice entry survives other principals misses');
    assert.equal(stub.calls, 3);
});
