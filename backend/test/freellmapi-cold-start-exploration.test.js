'use strict';

// PH4-ENGINE-030 (closes precondition A.9): bounded cold-start exploration.
//
// The defect (probe legs A.9r1/A.9r2): with the F-07 maturity gate, latency
// influences selection only at n >= 3 windowed observations — but an
// under-evidenced destination is never SERVED while the primary succeeds, so
// it never gathers observations. A newly added fast provider stayed at n = 0
// indefinitely (chicken-and-egg); the A.9r3 flip proof needed a manual pin to
// warm the window. Consequences in production: a new provider, a long-idle
// standby, or a post-cooldown recovery needs an outage or operator action
// before "fastest" can ever see it.
//
// The fix: at most one call in COLD_START_EXPLORE_INTERVAL (20) intelligent-
// mode calls (auto/balanced/speed) is diverted to the eligible under-evidenced
// candidate with the fewest observations, marked on the wire as
// routingDecision.exploration = 'cold-start'. The n >= 3 gate itself is
// UNCHANGED; circuit-breaker-demoted candidates are never targets; manual
// pins, explicit requests, quality mode (curated-tier promise), the
// dedicated-BYOK sanctuary tier (observations not persisted) and
// fallback-disabled configs never explore. Diversion is bounded: <= 5% of
// calls, and zero once every candidate is mature.

process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    pickColdStartExploration,
    COLD_START_EXPLORE_INTERVAL,
    COLD_START_MIN_OBSERVATIONS,
} = require('../freellmapi/services/selectionPolicy');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const freellm = require('../freellmapi');

const NOW = Date.now();

function ranked(provider, model, observationCount) {
    return { provider, model, routingDecision: { mode: 'speed', observationCount } };
}

test('PH4-ENGINE-030 constants: interval 20, maturity gate stays at 3', () => {
    assert.equal(COLD_START_EXPLORE_INTERVAL, 20);
    assert.equal(COLD_START_MIN_OBSERVATIONS, 3, 'the F-07 n>=3 gate value is unchanged');
});

test('PH4-ENGINE-030 picker: diverts ONLY on interval ticks', () => {
    const ordered = [ranked('openai', 'slow-mature', 5), ranked('groq', 'fast-new', 0)];
    for (let callCount = 1; callCount < COLD_START_EXPLORE_INTERVAL; callCount += 1) {
        assert.equal(pickColdStartExploration(ordered, { callCount, now: NOW }), null, `call ${callCount} must not divert`);
    }
    const atTick = pickColdStartExploration(ordered, { callCount: COLD_START_EXPLORE_INTERVAL, now: NOW });
    assert.equal(atTick?.provider, 'groq');
    assert.equal(pickColdStartExploration(ordered, { callCount: 21, now: NOW }), null);
    assert.equal(pickColdStartExploration(ordered, { callCount: 40, now: NOW })?.provider, 'groq');
});

test('PH4-ENGINE-030 picker: fewest observations first, ties keep rank order', () => {
    const ordered = [ranked('a', 'mature', 9), ranked('b', 'two', 2), ranked('c', 'zero', 0)];
    assert.equal(pickColdStartExploration(ordered, { callCount: 20, now: NOW })?.provider, 'c');
    const tie = [ranked('a', 'mature', 9), ranked('b', 'one', 1), ranked('c', 'one', 1)];
    assert.equal(pickColdStartExploration(tie, { callCount: 20, now: NOW })?.provider, 'b', 'tie resolves to the higher-ranked candidate');
});

test('PH4-ENGINE-030 picker: mature field, single candidate and winner-already-under-evidenced are no-ops', () => {
    const mature = [ranked('a', 'x', 3), ranked('b', 'y', 10)];
    assert.equal(pickColdStartExploration(mature, { callCount: 20, now: NOW }), null);
    assert.equal(pickColdStartExploration([ranked('a', 'x', 0)], { callCount: 20, now: NOW }), null);
    const winnerUnderEvidenced = [ranked('a', 'x', 0), ranked('b', 'y', 7)];
    assert.equal(pickColdStartExploration(winnerUnderEvidenced, { callCount: 20, now: NOW }), null,
        'the served winner already gathers evidence — diverting to it would be a mislabelled no-op');
});

test('PH4-ENGINE-030 picker: circuit-breaker-demoted candidates are never exploration targets', () => {
    const freshFailure = { n: 2, lastOk: false, lastAt: NOW - 5_000 };
    const ordered = [ranked('a', 'mature', 5), ranked('b', 'fresh-failed', 2), ranked('c', 'clean-new', 0)];
    const observationFor = candidate => (candidate.provider === 'b' ? freshFailure : null);
    assert.equal(pickColdStartExploration(ordered, { callCount: 20, observationFor, now: NOW })?.provider, 'c');
    const onlyTripped = [ranked('a', 'mature', 5), ranked('b', 'fresh-failed', 2)];
    assert.equal(pickColdStartExploration(onlyTripped, { callCount: 20, observationFor, now: NOW }), null);
    const staleFailure = { n: 2, lastOk: false, lastAt: NOW - 45 * 60_000 };
    const observationForStale = candidate => (candidate.provider === 'b' ? staleFailure : null);
    assert.equal(pickColdStartExploration(onlyTripped, { callCount: 20, observationFor: observationForStale, now: NOW })?.provider, 'b',
        'a failure outside the 30-minute freshness window no longer holds the breaker');
});

// ─── Router-level policy wiring ───────────────────────────────────────────────

function makeRouter() {
    const router = new FreeLlmRouter();
    router.cooldownManager = new CooldownManager();
    router.modelDiscovery = {
        getOrDiscover: async ({ providerId }) => [{ id: `${providerId}-fixture`, capabilities: {} }],
    };
    return router;
}

function candidatesFor(providers) {
    return providers.map(provider => ({
        provider,
        keys: [`${provider}-fixture-key-0123456789`],
        baseUrl: `http://127.0.0.1:9/${provider}`,
    }));
}

function seedMatureSlowPrimary() {
    freellm.resetMetricsForTests();
    const persistence = require('../freellmapi/services/persistence').getMetricsPersistence();
    for (let i = 0; i < 5; i += 1) {
        persistence.recordRequest({ provider: 'openai', model: 'openai-fixture', ok: true, status: 200, latencyMs: 1500, at: NOW - i * 20_000 });
    }
}

const unusedFetch = async () => { throw new Error('discovery is mocked; fetch must not be needed'); };

test('PH4-ENGINE-030 router: speed mode diverts on tick 20/40 to the under-evidenced candidate and marks it', async () => {
    seedMatureSlowPrimary();
    const router = makeRouter();
    const platformConfig = {
        selectionMode: 'speed',
        primary: 'openai',
        providers: { openai: { enabled: true, key: 'fixture-openai-key-123' }, groq: { enabled: true, key: 'fixture-groq-key-123' } },
    };
    const runPolicy = () => router.applySelectionPolicy(candidatesFor(['openai', 'groq']), {
        platformConfig, requestedModel: 'auto', requirements: {}, fetchImpl: unusedFetch,
    });
    for (let call = 1; call <= 40; call += 1) {
        const ordered = await runPolicy();
        if (call === 20 || call === 40) {
            assert.equal(ordered[0].provider, 'groq', `call ${call}: tick must divert to the under-evidenced candidate`);
            assert.equal(ordered[0].routingDecision.exploration, 'cold-start', `call ${call}: diversion is marked on the wire`);
            assert.equal(ordered[1].provider, 'openai', 'the normal winner stays as the immediate failover behind the diversion');
        } else {
            assert.equal(ordered[0].provider, 'openai', `call ${call}: non-tick calls keep the mature primary first`);
            assert.equal(ordered[0].routingDecision.exploration, undefined);
        }
    }
    freellm.resetMetricsForTests();
});

test('PH4-ENGINE-030 router: manual pins and quality mode NEVER explore', async () => {
    seedMatureSlowPrimary();
    const router = makeRouter();
    const manual = {
        selectionMode: 'manual',
        primary: 'openai',
        providers: { openai: { enabled: true, key: 'fixture-openai-key-123', model: 'openai-fixture' }, groq: { enabled: true, key: 'fixture-groq-key-123' } },
    };
    const quality = { ...manual, selectionMode: 'quality', providers: { ...manual.providers, openai: { enabled: true, key: 'fixture-openai-key-123' } } };
    for (const [name, platformConfig] of [['manual', manual], ['quality', quality]]) {
        for (let call = 1; call <= 20; call += 1) {
            const ordered = await router.applySelectionPolicy(candidatesFor(['openai', 'groq']), {
                platformConfig, requestedModel: 'auto', requirements: {}, fetchImpl: unusedFetch,
            });
            assert.equal(ordered[0].provider, 'openai', `${name} call ${call}: the pin/tier winner stays first`);
            for (const candidate of ordered) {
                assert.equal(candidate.routingDecision?.exploration, undefined, `${name} call ${call}: no exploration marker`);
            }
        }
    }
    freellm.resetMetricsForTests();
});

test('PH4-ENGINE-030 router: dedicated-BYOK sanctuary and fallback-disabled configs never explore', async () => {
    seedMatureSlowPrimary();
    const router = makeRouter();
    const base = {
        selectionMode: 'speed',
        primary: 'openai',
        providers: { openai: { enabled: true, key: 'fixture-openai-key-123' }, groq: { enabled: true, key: 'fixture-groq-key-123' } },
    };
    const byokCandidates = candidatesFor(['openai', 'groq']).map(candidate => ({ ...candidate, isDedicatedByok: true }));
    for (let call = 1; call <= 20; call += 1) {
        const ordered = await router.applySelectionPolicy(byokCandidates, {
            platformConfig: base, requestedModel: 'auto', requirements: {}, fetchImpl: unusedFetch,
        });
        for (const candidate of ordered) {
            assert.equal(candidate.routingDecision?.exploration, undefined, `BYOK call ${call}: sanctuary traffic is never diverted`);
        }
    }
    const router2 = makeRouter();
    for (let call = 1; call <= 20; call += 1) {
        const ordered = await router2.applySelectionPolicy(candidatesFor(['openai', 'groq']), {
            platformConfig: { ...base, enableFallback: false }, requestedModel: 'auto', requirements: {}, fetchImpl: unusedFetch,
        });
        for (const candidate of ordered) {
            assert.equal(candidate.routingDecision?.exploration, undefined, `fallback-disabled call ${call}: no exploration`);
        }
        assert.equal(ordered[0].provider, 'openai');
    }
    freellm.resetMetricsForTests();
});

test('PH4-ENGINE-030 end-to-end: the bounded tick diverts, the diverted call MATURES the frozen window, and a matured fast window still flips on merit', async () => {
    freellm.resetMetricsForTests();
    const persistence = require('../freellmapi/services/persistence').getMetricsPersistence();
    // openai primary: mature and slow (5 x 2000ms, fresh).
    for (let i = 0; i < 5; i += 1) {
        persistence.recordRequest({ provider: 'openai', model: 'openai-fixture', ok: true, status: 200, latencyMs: 2000, at: NOW - i * 20_000 });
    }
    // groq standby: two 100ms samples from earlier in the window — UNDER the
    // n >= 3 gate, so its latency cannot influence selection... and primary-
    // preference means it is never served, so it never matures. This is the
    // A.9 chicken-and-egg (probe legs A.9r1/A.9r2). The seeded latencies keep
    // every assertion deterministic; the mock adds a fixed simulated 3ms
    // provider latency so recorded samples always clear the engine's
    // `p50 > 0` signal guard (0ms p50 = no evidence, by design).
    persistence.recordRequest({ provider: 'groq', model: 'groq-fixture', ok: true, status: 200, latencyMs: 100, at: NOW - 20_000 });
    persistence.recordRequest({ provider: 'groq', model: 'groq-fixture', ok: true, status: 200, latencyMs: 100, at: NOW - 40_000 });

    const router = makeRouter();
    const fetchImpl = async () => {
        await new Promise(resolve => { setTimeout(resolve, 3); });
        return new Response(JSON.stringify({ choices: [{ message: { content: 'cold-start exploration served' } }] }));
    };
    const platformConfig = {
        selectionMode: 'speed',
        primary: 'openai',
        providers: {
            openai: { enabled: true, key: 'fixture-openai-key-123', model: 'openai-fixture' },
            groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-fixture' },
        },
    };
    const results = [];
    for (let call = 1; call <= 61; call += 1) {
        results.push(await router.routeCompletion({
            prompt: `cold-start exploration end-to-end fixture ${call}`,
            bypassCache: true,
            fetchImpl,
            platformConfig,
        }));
    }
    const served = results.map(result => result.provider);

    // Calls 1..19: the mature primary serves; nothing diverts before the tick.
    for (let i = 0; i < 19; i += 1) {
        assert.equal(served[i], 'openai', `call ${i + 1}: pre-tick calls stay on the primary`);
        assert.equal(results[i].routingDecision?.exploration, undefined);
    }
    // Call 20: the bounded tick diverts to the standby frozen below the gate.
    assert.equal(served[19], 'groq', 'call 20: tick diverts to the under-evidenced standby');
    assert.equal(results[19].routingDecision.exploration, 'cold-start', 'the diversion is marked on the wire');
    assert.equal(results[19].routingDecision.observationCount, 2, 'diverted WITH its two stale-but-windowed observations');
    // The diverted call's own sample MATURED the window: n = 3 and the p50 is
    // now a usable speed signal (100ms from the seeded pair — the weighted
    // median ignores the sub-10ms mock sample). Without exploration this
    // window would still be frozen at n = 2, exactly as in probe legs
    // A.9r1/A.9r2 where the fast candidate stayed at n = 0 indefinitely.
    const groqRow = persistence.getRollingAggregates({ windowMs: 30 * 60_000 }).find(row => row.provider === 'groq');
    assert.equal(groqRow.n, 3, 'the diversion matured the standby window to the F-07 gate');
    const rankedAfter = await router.applySelectionPolicy(candidatesFor(['openai', 'groq']), {
        platformConfig, requestedModel: 'auto', requirements: {}, fetchImpl: unusedFetch,
    });
    const groqRanked = rankedAfter.find(candidate => candidate.provider === 'groq');
    assert.equal(groqRanked.routingDecision.observationCount, 3, 'the matured window is visible in ranking evidence');
    assert.equal(groqRanked.routingDecision.observedLatencyMs, 100, 'p50 is the seeded 100ms — deterministic, not mock wall-time');
    // Budget: exactly ONE exploratory diversion in 61 calls (<= 5%), and no
    // further ticks divert once every candidate is mature (calls 40/60 stay
    // on the merit winner — in this fixture both providers measure fast, so
    // the +5 primary bonus holds; the flip-on-real-latency-gap half of the
    // contract is asserted next and proven live in probe leg A.9r4).
    assert.equal(results.filter(result => result.routingDecision?.exploration === 'cold-start').length, 1);
    for (let i = 20; i < 61; i += 1) {
        assert.equal(results[i].routingDecision?.exploration, undefined, `call ${i + 1}: mature field means zero further diversions`);
    }

    // Merit flip preserved (A.9r3 shape, deterministic): when the matured
    // window is genuinely FAST and the primary genuinely SLOW, the non-primary
    // wins with no exploration marker and no manual pin.
    freellm.resetMetricsForTests();
    const persistence2 = require('../freellmapi/services/persistence').getMetricsPersistence();
    for (let i = 0; i < 5; i += 1) {
        persistence2.recordRequest({ provider: 'openai', model: 'openai-fixture', ok: true, status: 200, latencyMs: 2000, at: NOW - i * 20_000 });
    }
    for (let i = 0; i < 3; i += 1) {
        persistence2.recordRequest({ provider: 'groq', model: 'groq-fixture', ok: true, status: 200, latencyMs: 100, at: NOW - i * 20_000 });
    }
    const router2 = makeRouter();
    const flipped = await router2.applySelectionPolicy(candidatesFor(['openai', 'groq']), {
        platformConfig, requestedModel: 'auto', requirements: {}, fetchImpl: unusedFetch,
    });
    assert.equal(flipped[0].provider, 'groq', 'mature fast window (n=3, p50=100ms) beats the slow primary (p50=2000ms) ON MERIT');
    assert.equal(flipped[0].routingDecision.exploration, undefined, 'the merit flip is NOT a diversion');
    assert.equal(flipped[0].routingDecision.observedLatencyMs, 100);
    freellm.resetMetricsForTests();
});
