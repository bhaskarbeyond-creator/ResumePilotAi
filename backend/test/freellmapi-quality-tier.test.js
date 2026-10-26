'use strict';

// F-06 (P1): `quality` mode had no quality signal — it ranked by capability
// flag count plus primary preference, i.e. "primary-first with zero speed
// weight" (audit probe A.10: quality served the 3.08s primary while an 8ms
// healthy alternative existed). Per the reviewer mandate the mode is NOT
// relabelled; it now ranks on a real signal: curated static quality tiers in
// providers/registry.js (premium|standard|economy). Uncurated models receive
// no bonus and keep qualityEvidence 'unknown' — no fabricated quality.

process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rankCandidates } = require('../freellmapi/services/selectionPolicy');
const { getModelQualityTier, MODEL_QUALITY_TIERS } = require('../freellmapi/providers/registry');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const freellm = require('../freellmapi');

const candidate = (provider, model, capabilities = {}) => ({ provider, model, metadata: { capabilities } });

test('F-06 registry: curated tiers resolve exactly and unknown models stay null', () => {
    assert.equal(getModelQualityTier('gpt-4o'), 'premium');
    assert.equal(getModelQualityTier('llama-3.3-70b-versatile'), 'premium');
    assert.equal(getModelQualityTier('gpt-4o-mini'), 'standard');
    assert.equal(getModelQualityTier('gemini-2.0-flash'), 'standard');
    assert.equal(getModelQualityTier('llama-3.1-8b-instant'), 'economy');
    assert.equal(getModelQualityTier('totally-unknown-model'), null, 'unknown models must never be guessed');
    assert.equal(getModelQualityTier(''), null);
    assert.equal(getModelQualityTier(null), null);
    for (const tier of Object.values(MODEL_QUALITY_TIERS)) {
        assert.ok(['premium', 'standard', 'economy'].includes(tier));
    }
});

test('F-06 ranking: quality mode prefers the premium tier over primary preference', () => {
    const observationFor = () => null; // no observations: tiers alone decide
    const ranked = rankCandidates(
        [candidate('openai', 'gpt-4o-mini'), candidate('groq', 'llama-3.3-70b-versatile')],
        { mode: 'quality', primary: 'openai', observationFor },
    );
    assert.equal(ranked[0].model, 'llama-3.3-70b-versatile', 'premium tier must beat standard-tier primary');
    assert.equal(ranked[0].routingDecision.qualityEvidence, 'curated-tier:premium');
    assert.equal(ranked[1].routingDecision.qualityEvidence, 'curated-tier:standard');
});

test('F-06 ranking: premium > standard > economy with equal observations', () => {
    const observationFor = () => ({ createdAt: Date.now() - 1000, latencyMs: 500, ok: true, status: 200 });
    const ranked = rankCandidates(
        [candidate('a', 'llama-3.1-8b-instant'), candidate('b', 'gpt-4o-mini'), candidate('c', 'gpt-4o')],
        { mode: 'quality', primary: 'a', observationFor },
    );
    assert.deepEqual(ranked.map(r => r.model), ['gpt-4o', 'gpt-4o-mini', 'llama-3.1-8b-instant']);
});

test('F-06 ranking: uncurated models keep the old conservative behaviour and unknown evidence', () => {
    const observationFor = () => null;
    const ranked = rankCandidates(
        [candidate('a', 'mystery-large'), candidate('b', 'mystery-small')],
        { mode: 'quality', primary: 'b', observationFor },
    );
    assert.equal(ranked[0].provider, 'b', 'without tier evidence, primary preference still wins');
    assert.ok(ranked.every(r => r.routingDecision.qualityEvidence === 'unknown'));
});

test('F-06 ranking: non-quality modes ignore tiers entirely', () => {
    const observationFor = c => ({ createdAt: Date.now() - 1000, latencyMs: c.model === 'fast-uncurated' ? 100 : 5000, ok: true, status: 200 });
    const ranked = rankCandidates(
        [candidate('a', 'gpt-4o'), candidate('b', 'fast-uncurated')],
        { mode: 'speed', primary: 'a', observationFor },
    );
    assert.equal(ranked[0].model, 'fast-uncurated', 'speed mode must still prefer measured latency over tiers');
    assert.ok(ranked.every(r => r.routingDecision.qualityEvidence === 'unknown'));
});

test('F-06 router: quality mode end-to-end selects the premium-tier catalog model', async () => {
    const router = new FreeLlmRouter();
    router.cooldownManager = new CooldownManager();
    router.modelDiscovery = {
        getOrDiscover: async ({ providerId }) => (providerId === 'openai'
            ? [{ id: 'gpt-4o-mini', capabilities: {} }]
            : [{ id: 'llama-3.3-70b-versatile', capabilities: {} }]),
    };
    const served = [];
    const fetchImpl = async (_url, options) => {
        served.push(String(JSON.parse(options.body || '{}').model));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'quality served' } }] }));
    };
    const result = await router.routeCompletion({
        prompt: 'quality tier end-to-end fixture',
        bypassCache: true,
        fetchImpl,
        platformConfig: {
            selectionMode: 'quality',
            primary: 'openai', // standard-tier primary must yield to the premium tier
            providers: {
                openai: { enabled: true, key: 'fixture-openai-key-123', model: 'gpt-4o-mini' },
                groq: { enabled: true, key: 'fixture-groq-key-123', model: 'llama-3.3-70b-versatile' },
            },
        },
    });
    assert.equal(result.provider, 'groq');
    assert.equal(result.model, 'llama-3.3-70b-versatile');
    assert.equal(result.routingDecision.qualityEvidence, 'curated-tier:premium');
    assert.deepEqual(served, ['llama-3.3-70b-versatile'], 'only the selected premium model is invoked');
});

test('F-06 status: engine status and admin catalog report the curated tier instead of bare null', async () => {
    const status = freellm.getEngineStatus();
    const groq = status.supportedProviders.find(p => p.id === 'groq');
    assert.equal(groq.intelligenceScore, 'premium', 'groq default model llama-3.3-70b-versatile is curated premium');
    const openai = status.supportedProviders.find(p => p.id === 'openai');
    assert.equal(openai.intelligenceScore, 'standard');

    process.env.NODE_ENV = 'test';
    const { loadAiAdminSettings } = require('../services/aiAdmin');
    const { installAiSettingsContract } = require('./helpers/aiSettingsContract');
    const settingsContract = installAiSettingsContract();
    settingsContract.reset();
    const loaded = await loadAiAdminSettings({});
    const catalogGroq = loaded.catalog.find(p => p.id === 'groq');
    assert.equal(catalogGroq.intelligenceScore, 'premium');
    const catalogOpenai = loaded.catalog.find(p => p.id === 'openai');
    assert.equal(catalogOpenai.intelligenceScore, 'standard');
});
