'use strict';

// F-09 (P1): enterprise traffic was forced into the "dedicated BYOK tier"
// even when it used PLATFORM keys. generateWithProviders synthesized
// tenantContext.customProviderKeys from every enabled provider key, so
// hasTenantByok was always true for tenants, the BYOK sanctuary was chosen,
// _recordMetrics returned early (scoped) and cooldowns were skipped. The
// largest traffic class generated zero routing evidence: no metrics, no
// cooldowns, no health.
//
// Fix contract: `isDedicatedByok` is reserved for keys whose source is the
// encrypted enterprise_tenant_credentials store (F-08). applyTenantAiPolicy
// stamps the genuine set as `tenantByokProviders`; the runtime synthesis
// passes ONLY those keys as customProviderKeys. Platform-key tenant traffic
// routes through the platform tier: metrics recorded, cooldowns enforced,
// tenant policy (allowedProviders/allowedModels) still bounding selection.

process.env.FREELMAPI_METRICS_DB = ':memory:';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyTenantAiPolicy } = require('../enterprise/tenantAi');
const { generateWithProviders } = require('../services/aiRuntime');
const aiGateway = require('../services/aiGateway');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const freellm = require('../freellmapi');

const PLATFORM_GROQ_KEY = 'fixture-platform-groq-key-123';
const PLATFORM_OPENAI_KEY = 'fixture-platform-openai-key-456';
const TENANT_GROQ_KEY = 'gsk_tenant-owned-byok-key-789';

function baseConfig() {
    return {
        primary: 'groq',
        temperature: 0.3,
        maxTokens: 512,
        providers: {
            groq: { enabled: true, key: PLATFORM_GROQ_KEY, model: 'groq-fixture' },
            openai: { enabled: true, key: PLATFORM_OPENAI_KEY, model: 'gpt-fixture' },
        },
    };
}

function tenantContextFixture() {
    return { tenantId: 'tenant-f09', principalId: 'user-f09', policyVersion: 1, dataPlane: { aiProfile: 'platform-default' } };
}

// ---------------------------------------------------------------------------
// A — applyTenantAiPolicy stamps the genuine BYOK set.
// ---------------------------------------------------------------------------

test('A1: platform-key tenant config stamps tenantByokProviders=[] and keeps platform keys', () => {
    const config = applyTenantAiPolicy(baseConfig(), tenantContextFixture(), { allowedProviders: ['groq', 'openai'] });
    assert.deepEqual([...config.tenantByokProviders], []);
    assert.equal(config.providers.groq.key, PLATFORM_GROQ_KEY);
    assert.equal(config.providers.openai.key, PLATFORM_OPENAI_KEY);
});

test('A2: genuine BYOK keys are stamped per provider (source: encrypted store, F-08)', () => {
    const config = applyTenantAiPolicy(baseConfig(), tenantContextFixture(), {
        allowedProviders: ['groq', 'openai'],
        customProviderKeys: { groq: TENANT_GROQ_KEY },
    });
    assert.deepEqual([...config.tenantByokProviders], ['groq']);
    assert.equal(config.providers.groq.key, TENANT_GROQ_KEY, 'effective key = tenant key');
    assert.equal(config.providers.openai.key, PLATFORM_OPENAI_KEY, 'openai still on the platform key');
});

// ---------------------------------------------------------------------------
// B — generateWithProviders synthesis: only genuine BYOK keys become
//     tenantContext.customProviderKeys.
// ---------------------------------------------------------------------------

async function captureSynthesizedTenantContext(configuration) {
    const original = aiGateway.completeChat;
    let captured;
    aiGateway.completeChat = async (args) => {
        captured = args.tenantContext;
        return { raw: '{"ok":true}', provider: 'groq', model: 'groq-fixture', usage: null, fallbacksAttempted: [] };
    };
    try {
        await generateWithProviders({ prompt: 'F-09 synthesis fixture', configuration, operation: 'generate-summary' });
    } finally {
        aiGateway.completeChat = original;
    }
    return captured;
}

test('B1: platform-key tenant traffic synthesizes EMPTY customProviderKeys (no forced BYOK tier)', async () => {
    const configuration = applyTenantAiPolicy(baseConfig(), tenantContextFixture(), { allowedProviders: ['groq', 'openai'] });
    const captured = await captureSynthesizedTenantContext(configuration);
    assert.equal(captured.tenantId, 'tenant-f09');
    assert.deepEqual(captured.customProviderKeys, {}, 'platform keys are never re-labelled as tenant BYOK');
});

test('B2: genuine BYOK tenant traffic synthesizes ONLY the tenant-owned keys', async () => {
    const configuration = applyTenantAiPolicy(baseConfig(), tenantContextFixture(), {
        allowedProviders: ['groq', 'openai'],
        customProviderKeys: { groq: TENANT_GROQ_KEY },
    });
    const captured = await captureSynthesizedTenantContext(configuration);
    assert.deepEqual(captured.customProviderKeys, { groq: TENANT_GROQ_KEY },
        'sanctuary carries the tenant key only — the enabled platform openai key stays out');
});

// ---------------------------------------------------------------------------
// C — router tier resolution.
// ---------------------------------------------------------------------------

function makeRouter() {
    const router = new FreeLlmRouter();
    router.cooldownManager = new CooldownManager();
    router.modelDiscovery = {
        getOrDiscover: async ({ providerId }) => [{ id: providerId === 'openai' ? 'gpt-fixture' : 'groq-fixture', capabilities: {} }],
    };
    return router;
}

test('C1: tenant with empty customProviderKeys routes through the PLATFORM tier (policy still bounds it)', async () => {
    const router = makeRouter();
    const candidates = await router.buildCandidateList({
        tenantContext: { tenantId: 'tenant-f09', customProviderKeys: {}, allowedProviders: ['groq'] },
        platformConfig: { selectionMode: 'speed', primary: 'groq', providers: baseConfig().providers },
        fetchImpl: async () => new Response('{}'),
    });
    assert.ok(candidates.length > 0);
    for (const candidate of candidates) {
        assert.equal(candidate.isDedicatedByok, false, 'platform tier: not dedicated BYOK');
        assert.equal(candidate.provider, 'groq', 'tenant allowedProviders still strictly bounds the platform tier');
    }
});

test('C2: genuine tenant keys select the dedicated BYOK sanctuary as before', async () => {
    const router = makeRouter();
    const candidates = await router.buildCandidateList({
        tenantContext: { tenantId: 'tenant-f09', customProviderKeys: { groq: TENANT_GROQ_KEY }, allowedProviders: ['groq'], primaryModel: 'groq-fixture' },
        platformConfig: { selectionMode: 'speed', primary: 'groq', providers: baseConfig().providers },
        fetchImpl: async () => new Response('{}'),
    });
    assert.ok(candidates.length > 0);
    for (const candidate of candidates) {
        assert.equal(candidate.isDedicatedByok, true);
        assert.equal(candidate.key, TENANT_GROQ_KEY);
    }
});

// ---------------------------------------------------------------------------
// D — metrics + cooldowns: platform-key tenant traffic trains the engine;
//     dedicated BYOK stays isolated.
// ---------------------------------------------------------------------------

const failingFetch = async () => new Response(JSON.stringify({ error: { message: 'rate limited fixture' } }), {
    status: 429,
    headers: { 'Retry-After': '60', 'Content-Type': 'application/json' },
});

test('D1: platform-key tenant failure RECORDS METRICS and SETS COOLDOWN', async () => {
    freellm.resetMetricsForTests();
    const persistence = require('../freellmapi/services/persistence').getMetricsPersistence();
    const router = makeRouter();

    await assert.rejects(() => router.routeCompletion({
        prompt: 'F-09 platform-key tenant metrics fixture',
        bypassCache: true,
        fetchImpl: failingFetch,
        tenantContext: { tenantId: 'tenant-f09', customProviderKeys: {}, allowedProviders: ['groq'] },
        platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseConfig().providers },
    }));

    const aggregates = persistence.getRollingAggregates({ windowMs: 30 * 60_000 });
    const groqRow = aggregates.find(row => row.provider === 'groq' && row.model === 'groq-fixture');
    assert.ok(groqRow, 'the tenant failure trained the shared platform metrics');
    assert.equal(groqRow.failures, 1);

    const cooldown = router.cooldownManager.isOnCooldown('groq', 'groq-fixture');
    assert.equal(cooldown.onCooldown, true, '429 on platform-key tenant traffic benches the provider');
    freellm.resetMetricsForTests();
});

test('D2: dedicated BYOK failure stays ISOLATED — no shared metrics, no shared cooldown', async () => {
    freellm.resetMetricsForTests();
    const persistence = require('../freellmapi/services/persistence').getMetricsPersistence();
    const router = makeRouter();

    await assert.rejects(() => router.routeCompletion({
        prompt: 'F-09 dedicated BYOK isolation fixture',
        bypassCache: true,
        fetchImpl: failingFetch,
        tenantContext: { tenantId: 'tenant-f09', customProviderKeys: { groq: TENANT_GROQ_KEY }, allowedProviders: ['groq'], primaryModel: 'groq-fixture' },
        platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseConfig().providers },
    }));

    const aggregates = persistence.getRollingAggregates({ windowMs: 30 * 60_000 });
    assert.equal(aggregates.length, 0, 'dedicated BYOK observations never train the shared platform rank');
    const cooldown = router.cooldownManager.isOnCooldown('groq', 'groq-fixture');
    assert.equal(cooldown.onCooldown, false, 'the tenant\'s own key failure must not bench the provider for everyone');
    freellm.resetMetricsForTests();
});
