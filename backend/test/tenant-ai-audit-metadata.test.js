'use strict';

// F-17 (P2): tenant audit metadata was empty. routes/ai.js reads decisionId,
// executedModel, selectionLatencyMs, candidatesConsidered, fallbackCount,
// attempts, candidatesRejected and lastResort from `generated.routing`, but
// generateWithProviders (live engine branch) returned only
// {latencyMs, cached, fallbacksAttempted} — so writeAudit persisted
// aiRouting:{executedModel:null} with every other field undefined and
// dropped by JSON serialisation. The fix propagates an honest routing
// summary: real values where the live engine measures them (executed
// provider/model, fallback counts, attempts, lastResort, engine stamp,
// routingDecision as the rationale object) and explicit nulls where it does
// not (decisionId, selectionLatencyMs, candidate counts) — never undefined,
// never fabricated.

process.env.FREELMAPI_METRICS_DB = ':memory:';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    generateWithProviders,
    getSharedAiRouter,
    resetSharedAiRouterForTests,
} = require('../services/aiRuntime');
const freellm = require('../freellmapi');

const okBody = JSON.stringify({
    id: 'chatcmpl-f17',
    choices: [{ index: 0, message: { role: 'assistant', content: 'f17 answer' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
});

function okFetch() {
    return async (url) => {
        // Policy-mode selection triggers model discovery against the
        // provider's /models endpoint; serve the pinned model id.
        if (String(url).endsWith('/models')) {
            return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }] }) };
        }
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => okBody };
    };
}

function groqConfig(overrides = {}) {
    return {
        providers: { groq: { key: 'gsk-mock-f17-audit-key', enabled: true, model: 'llama-3.3-70b-versatile' } },
        primary: 'groq',
        enableFallback: false,
        temperature: 0.3,
        maxTokens: 256,
        ...overrides,
    };
}

const uniquePrompt = tag => `F-17 ${tag} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

// The EXACT metadata mapping routes/ai.js persists via writeAudit.
function auditAiRouting(generated) {
    const routing = generated?.routing;
    return routing ? {
        decisionId: routing.decisionId,
        executedModel: routing.executedModel || null,
        selectionLatencyMs: routing.selectionLatencyMs,
        fallbackCount: routing.fallbackCount,
        attempts: routing.attempts,
        candidatesConsidered: routing.candidatesConsidered,
        candidatesRejected: routing.candidatesRejected,
        lastResort: routing.lastResort,
    } : null;
}

test('F-17 live engine: routing carries real executed facts and honest nulls, zero undefined', async () => {
    freellm.resetCooldowns();
    const generated = await generateWithProviders({
        prompt: uniquePrompt('live-summary'),
        // Policy mode so the ranking decision (rationale) exists; the legacy
        // path's honest null rationale is asserted in the next test.
        configuration: groqConfig({ selectionMode: 'speed' }),
        operation: 'f17-live-summary',
        fetchImpl: okFetch(),
    });
    const routing = generated.routing;
    assert.equal(routing.engine, 'freellmapi');
    assert.equal(routing.executedProvider, 'groq');
    assert.equal(routing.executedModel, 'llama-3.3-70b-versatile', 'the executed model must never be null on a served request');
    assert.equal(routing.fallbackCount, 0);
    assert.equal(routing.attempts, 1);
    assert.equal(routing.lastResort, false);
    assert.equal(routing.cached, false);
    // Fields the live engine does not measure stay honest nulls.
    assert.equal(routing.decisionId, null);
    assert.equal(routing.selectionLatencyMs, null);
    assert.equal(routing.candidatesConsidered, null);
    assert.equal(routing.candidatesRejected, null);
    // The rationale object rides along (mode/evidence/observation counts).
    assert.ok(routing.rationale && typeof routing.rationale === 'object');
    assert.equal(routing.rationale.mode, 'speed');
    const undefinedKeys = Object.entries(routing).filter(([, v]) => v === undefined).map(([k]) => k);
    assert.deepEqual(undefinedKeys, [], 'no routing field may be undefined (JSON would drop it)');
});

test('F-17 audit mapping: persisted aiRouting metadata keeps all eight fields with a real model', async () => {
    freellm.resetCooldowns();
    const generated = await generateWithProviders({
        prompt: uniquePrompt('audit-map'),
        configuration: groqConfig(),
        operation: 'f17-audit-map',
        fetchImpl: okFetch(),
    });
    const persisted = JSON.parse(JSON.stringify({ aiRouting: auditAiRouting(generated) }));
    assert.deepEqual(Object.keys(persisted.aiRouting).sort(), [
        'attempts', 'candidatesConsidered', 'candidatesRejected', 'decisionId',
        'executedModel', 'fallbackCount', 'lastResort', 'selectionLatencyMs',
    ], 'undefined-drop must no longer shrink the persisted metadata');
    assert.equal(persisted.aiRouting.executedModel, 'llama-3.3-70b-versatile');
    assert.equal(persisted.aiRouting.fallbackCount, 0);
    assert.equal(persisted.aiRouting.attempts, 1);
    assert.equal(persisted.aiRouting.lastResort, false);
    // Legacy pinned config (no selectionMode) has no ranking decision —
    // the rationale stays an honest null instead of a fabricated object.
    assert.equal(generated.routing.rationale, null);
});

test('F-17 cached serve: attempts honestly report zero network calls', async () => {
    freellm.resetCooldowns();
    const prompt = uniquePrompt('cached');
    const first = await generateWithProviders({
        prompt, configuration: groqConfig(), operation: 'f17-cached', fetchImpl: okFetch(), principalId: 'f17-user',
    });
    assert.equal(first.routing.cached, false);
    assert.equal(first.routing.attempts, 1);
    const second = await generateWithProviders({
        prompt, configuration: groqConfig(), operation: 'f17-cached', fetchImpl: okFetch(), principalId: 'f17-user',
    });
    assert.equal(second.routing.cached, true);
    assert.equal(second.routing.attempts, 0, 'a cache hit performs no provider attempt');
    assert.equal(second.routing.executedModel, 'llama-3.3-70b-versatile', 'the cached answer still reports what served it');
});

test('F-17 fallback: counts and attempted providers propagate into routing', async () => {
    freellm.resetCooldowns();
    const fetchImpl = async (url) => {
        if (String(url).includes('groq')) {
            return { ok: false, status: 500, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ error: { message: 'groq down' } }) };
        }
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => okBody };
    };
    const generated = await generateWithProviders({
        prompt: uniquePrompt('fallback'),
        configuration: {
            providers: {
                groq: { key: 'gsk-mock-f17-fallback', enabled: true, model: 'llama-3.3-70b-versatile' },
                openai: { key: 'sk-mock-f17-fallback', enabled: true, model: 'gpt-4o-mini' },
            },
            primary: 'groq',
            enableFallback: true,
            temperature: 0.3,
            maxTokens: 256,
        },
        operation: 'f17-fallback',
        fetchImpl,
    });
    assert.equal(generated.provider, 'openai');
    assert.equal(generated.routing.fallbackCount, 1);
    assert.equal(generated.routing.attempts, 2);
    assert.equal(generated.routing.executedModel, 'gpt-4o-mini');
    assert.equal(generated.routing.fallbacksAttempted[0].provider, 'groq');
    freellm.resetCooldowns();
});

test('F-17 aiRouting engine: the selector summary survives with an engine stamp', async () => {
    process.env.AI_ENGINE = 'aiRouting';
    const router = getSharedAiRouter();
    const original = router.route;
    router.route = async () => ({
        raw: 'selector answer',
        provider: 'selProvider',
        model: 'selModel',
        usage: { promptTokens: 1, completionTokens: 1 },
        routing: { decisionId: 'sel-f17', executedModel: 'selModel', fallbackCount: 0, attempts: 1, lastResort: false },
    });
    try {
        const generated = await generateWithProviders({
            prompt: uniquePrompt('airouting-stamp'),
            configuration: groqConfig(),
            operation: 'f17-airouting',
            fetchImpl: okFetch(),
        });
        assert.equal(generated.routing.engine, 'aiRouting');
        assert.equal(generated.routing.decisionId, 'sel-f17', 'the selector decisionId must survive the stamp');
        assert.equal(generated.routing.executedModel, 'selModel');
        assert.equal(generated.raw, 'selector answer');
    } finally {
        router.route = original;
        delete process.env.AI_ENGINE;
    }
});

test('F-17 last-resort release is visible in the audit metadata', async () => {
    freellm.resetCooldowns();
    freellm.cooldownManager.setCooldown('groq', 'llama-3.3-70b-versatile', 'HTTP 429 across all pooled keys', 120_000);
    const generated = await generateWithProviders({
        prompt: uniquePrompt('last-resort'),
        configuration: groqConfig(),
        operation: 'f17-last-resort',
        fetchImpl: okFetch(),
    });
    assert.equal(generated.routing.lastResort, true, 'the F-14 release must reach the tenant audit trail');
    assert.equal(generated.routing.executedModel, 'llama-3.3-70b-versatile');
    const persisted = JSON.parse(JSON.stringify({ aiRouting: auditAiRouting(generated) }));
    assert.equal(persisted.aiRouting.lastResort, true);
    freellm.resetCooldowns();
    resetSharedAiRouterForTests();
});
