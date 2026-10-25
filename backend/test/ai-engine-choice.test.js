'use strict';

// F-05 (P1): the aiRouting selector was dead code on the production hot path
// — it ran only when the live engine threw an unexpected error code. The
// engine choice is now explicit and observable via AI_ENGINE:
//   freellm (default) | shadow (aiRouting first, divergence logged, response
//   unchanged) | aiRouting (selector serves end-to-end).
// These tests pin all three modes plus the bounded divergence log.

process.env.FREELMAPI_METRICS_DB = ':memory:';
// The settings-contract harness (pool injection) is test-gated.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    generateWithProviders,
    getSharedAiRouter,
    resetSharedAiRouterForTests,
    resolveAiEngineChoice,
    getAiEngineShadowLog,
} = require('../services/aiRuntime');

const configuration = {
    providers: {
        groq: { key: 'gsk-mock-engine-choice', enabled: true, model: 'llama-3.3-70b-versatile' },
    },
    primary: 'groq',
    enableFallback: false,
    temperature: 0.3,
    maxTokens: 256,
};

function makeFetchStub() {
    const state = { calls: 0 };
    state.fetch = async () => {
        state.calls += 1;
        return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => JSON.stringify({
                id: 'chatcmpl-engine-choice',
                choices: [{ index: 0, message: { role: 'assistant', content: 'freellm authoritative answer' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
            }),
        };
    };
    return state;
}

function withRouteStub(impl, run) {
    const router = getSharedAiRouter();
    const original = router.route;
    const state = { calls: 0 };
    router.route = async (args) => {
        state.calls += 1;
        return impl(args);
    };
    return Promise.resolve()
        .then(() => run(state))
        .finally(() => { router.route = original; });
}

function generate(fetchImpl) {
    return generateWithProviders({
        prompt: 'engine choice fixture prompt',
        configuration,
        operation: 'engine-choice-probe',
        fetchImpl,
    });
}

test('F-05 default: freellm is authoritative and aiRouting is not invoked', async () => {
    resetSharedAiRouterForTests();
    delete process.env.AI_ENGINE;
    assert.equal(resolveAiEngineChoice(), 'freellm');
    const stub = makeFetchStub();
    await withRouteStub(() => { throw new Error('must not be called'); }, async (routeState) => {
        const result = await generate(stub.fetch);
        assert.equal(result.raw, 'freellm authoritative answer');
        assert.equal(result.provider, 'groq');
        assert.equal(stub.calls, 1);
        assert.equal(routeState.calls, 0);
        assert.deepEqual(getAiEngineShadowLog(), []);
    });
    resetSharedAiRouterForTests();
});

test('F-05 AI_ENGINE=aiRouting: the selector serves end-to-end without touching freellm', async () => {
    resetSharedAiRouterForTests();
    process.env.AI_ENGINE = 'aiRouting';
    try {
        assert.equal(resolveAiEngineChoice(), 'aiRouting');
        const stub = makeFetchStub();
        await withRouteStub(() => ({ raw: 'selector served', provider: 'openai', model: 'gpt-fixture', usage: null, routing: {} }), async (routeState) => {
            const result = await generate(stub.fetch);
            assert.equal(result.raw, 'selector served');
            assert.equal(routeState.calls, 1);
            assert.equal(stub.calls, 0, 'the live engine must not be invoked in aiRouting mode');
        });
    } finally {
        delete process.env.AI_ENGINE;
        resetSharedAiRouterForTests();
    }
});

test('F-05 AI_ENGINE=shadow: matching decisions log diverged=false and the response is freellm', async () => {
    resetSharedAiRouterForTests();
    process.env.AI_ENGINE = 'shadow';
    try {
        const stub = makeFetchStub();
        await withRouteStub(() => ({ raw: 'shadow answer (discarded)', provider: 'groq', model: 'llama-3.3-70b-versatile' }), async (routeState) => {
            const result = await generate(stub.fetch);
            assert.equal(result.raw, 'freellm authoritative answer', 'shadow must never change the response');
            assert.equal(routeState.calls, 1, 'aiRouting runs first in shadow mode');
            assert.equal(stub.calls, 1);
            const log = getAiEngineShadowLog();
            assert.equal(log.length, 1);
            assert.equal(log[0].diverged, false);
            assert.equal(log[0].authoritative.provider, 'groq');
            assert.equal(log[0].shadow.provider, 'groq');
            assert.equal(log[0].operation, 'engine-choice-probe');
        });
    } finally {
        delete process.env.AI_ENGINE;
        resetSharedAiRouterForTests();
    }
});

test('F-05 AI_ENGINE=shadow: a different provider/model decision logs diverged=true', async () => {
    resetSharedAiRouterForTests();
    process.env.AI_ENGINE = 'shadow';
    try {
        const stub = makeFetchStub();
        await withRouteStub(() => ({ raw: 'shadow answer (discarded)', provider: 'openai', model: 'gpt-fixture' }), async () => {
            const result = await generate(stub.fetch);
            assert.equal(result.raw, 'freellm authoritative answer');
            const log = getAiEngineShadowLog();
            assert.equal(log.length, 1);
            assert.equal(log[0].diverged, true);
            assert.equal(log[0].shadow.provider, 'openai');
            assert.equal(log[0].authoritative.provider, 'groq');
        });
    } finally {
        delete process.env.AI_ENGINE;
        resetSharedAiRouterForTests();
    }
});

test('F-05 AI_ENGINE=shadow: a failing selector is logged as divergence and never surfaces', async () => {
    resetSharedAiRouterForTests();
    process.env.AI_ENGINE = 'shadow';
    try {
        const stub = makeFetchStub();
        await withRouteStub(() => { throw Object.assign(new Error('selector down'), { code: 'SHADOW_FIXTURE_FAILURE' }); }, async () => {
            const result = await generate(stub.fetch);
            assert.equal(result.raw, 'freellm authoritative answer');
            const log = getAiEngineShadowLog();
            assert.equal(log.length, 1);
            assert.equal(log[0].diverged, true);
            assert.equal(log[0].shadow.error, 'SHADOW_FIXTURE_FAILURE');
        });
    } finally {
        delete process.env.AI_ENGINE;
        resetSharedAiRouterForTests();
    }
});

test('F-05: resolveAiEngineChoice normalizes input and defaults to freellm', () => {
    assert.equal(resolveAiEngineChoice({ AI_ENGINE: 'aiRouting' }), 'aiRouting');
    assert.equal(resolveAiEngineChoice({ AI_ENGINE: ' AIRouting ' }), 'aiRouting');
    assert.equal(resolveAiEngineChoice({ AI_ENGINE: 'shadow' }), 'shadow');
    assert.equal(resolveAiEngineChoice({ AI_ENGINE: 'garbage' }), 'freellm');
    assert.equal(resolveAiEngineChoice({}), 'freellm');
});

test('F-05 observability: the super-admin settings surface reports the engine mode and shadow log', async () => {
    const { loadAiAdminSettings } = require('../services/aiAdmin');
    const { installAiSettingsContract } = require('./helpers/aiSettingsContract');
    const settingsContract = installAiSettingsContract();
    settingsContract.reset();
    const before = await loadAiAdminSettings({});
    assert.equal(before.engine.aiEngine, 'freellm');
    assert.ok(Array.isArray(before.engine.shadowDivergences));

    process.env.AI_ENGINE = 'shadow';
    try {
        const stub = makeFetchStub();
        await withRouteStub(() => ({ raw: 'shadow (discarded)', provider: 'openai', model: 'gpt-fixture' }), async () => {
            await generate(stub.fetch);
        });
        const during = await loadAiAdminSettings({ AI_ENGINE: 'shadow' });
        assert.equal(during.engine.aiEngine, 'shadow');
        assert.equal(during.engine.shadowDivergences.length, 1);
        assert.equal(during.engine.shadowDivergences[0].diverged, true);
        // Secret-free: the log carries decisions only.
        assert.ok(!JSON.stringify(during.engine.shadowDivergences).includes('gsk-mock-engine-choice'));
    } finally {
        delete process.env.AI_ENGINE;
        resetSharedAiRouterForTests();
    }
});
