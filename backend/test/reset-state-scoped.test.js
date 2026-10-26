'use strict';

/**
 * PH4-ENGINE-021 C.4 — F-13 scoped-reset route tests.
 *
 * POST /api/admin/ai/reset-state gains an OPTIONAL `scope` for the cooldown
 * reset: omitted/'platform' wipes only platform benches (a platform incident
 * reset must never wipe tenant scopes), 'all' keeps the legacy full wipe,
 * 'tenant:<id>'/'uid:<hash>' wipes exactly one scope. The route stays
 * super-admin-only, so scoped resets inherit that gate. Cache semantics are
 * unchanged (legacy global flush; entries are principal-bound via cacheScope).
 * The durable store follows the in-memory wipe (CooldownManager persists the
 * scoped clear). Response gains an additive `scope` field.
 */

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRepositoryForTests } = require('../repositories');
const { promptCache } = require('../freellmapi/services/cache');
const { getMetricsPersistence } = require('../freellmapi/services/persistence');
const freellm = require('../freellmapi');

const auditEvents = [];

setRepositoryForTests({
    async getSetting() { return null; },
    async recordAdminAuditLog(event) { auditEvents.push(event); return event; },
});

setTokenVerifierForTests(async (token) => {
    const now = Math.floor(Date.now() / 1000);
    if (token === 'plain-user') return { uid: 'scoped-reset-user', email: 'u@test', email_verified: true, role: 'USER', auth_time: now };
    if (token === 'super-admin') return { uid: 'scoped-reset-admin', email: 's@test', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
    throw new Error('invalid token');
});

const app = require('../index');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function seedScopes() {
    freellm.resetMetricsForTests();
    // resetMetricsForTests detaches the durable store; re-attach so the scoped
    // wipe's persistence leg is exercised (attach is idempotent, A.5 contract).
    freellm.cooldownManager.attachPersistence(getMetricsPersistence());
    freellm.cooldownManager.setCooldown('groq', 'fixture-model', 'HTTP 429 across all pooled keys');
    freellm.cooldownManager.setCooldown('groq', 'fixture-model', 'HTTP 429 on tenant credentials', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
    freellm.cooldownManager.setCooldown('groq', 'fixture-model', 'HTTP 429 on tenant credentials', null, { scopeKey: 'tenant:t2', credentialKind: 'byok' });
    promptCache.clear();
}

function benchOn(scopeKey) {
    return freellm.cooldownManager.isOnCooldown('groq', 'fixture-model', scopeKey ? { scopeKey } : {}).onCooldown;
}

test.beforeEach(() => {
    freellm.resetCooldowns();
    promptCache.clear();
    auditEvents.length = 0;
});

test.after(() => {
    freellm.resetCooldowns();
    promptCache.clear();
    freellm.resetMetricsForTests();
});

test('C.4: default (no scope) wipes ONLY the platform bench — tenant scopes survive, response is scope-honest', async () => {
    seedScopes();
    assert.equal(benchOn(null), true);
    assert.equal(benchOn('tenant:t1'), true);

    const res = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.scope, 'platform', 'the additive response field states what was wiped');
    assert.equal(res.body.cooldowns.ok, true);

    assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'fixture-model').onCooldown, false, 'platform bench wiped');
    const t1 = freellm.cooldownManager.isOnCooldown('groq', 'fixture-model', { scopeKey: 'tenant:t1' });
    assert.equal(t1.onCooldown, true, 'tenant benches survive a platform incident reset');
    assert.equal(t1.scopeKey, 'tenant:t1');
    assert.equal(benchOn('tenant:t2'), true);

    await sleep(60); // the audit event is recorded post-response (tripwire pattern)
    const event = auditEvents.find(entry => String(entry.pathname || '').includes('/api/admin/ai/reset-state'));
    assert.ok(event, 'the mutation stays audited');
    assert.equal(event.actorUid, 'scoped-reset-admin');
    assert.equal(event.outcome, 'SUCCESS');
});

test('C.4: scope "all" keeps the legacy full wipe — every scope is cleared', async () => {
    seedScopes();
    const res = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ scope: 'all' });
    assert.equal(res.status, 200);
    assert.equal(res.body.scope, 'all');
    assert.equal(benchOn(null), false);
    assert.equal(benchOn('tenant:t1'), false);
    assert.equal(benchOn('tenant:t2'), false);
});

test('C.4: scope "tenant:t1" wipes exactly one scope — platform and other tenants untouched', async () => {
    seedScopes();
    const res = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ scope: 'tenant:t1', cache: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.scope, 'tenant:t1');
    assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'fixture-model').onCooldown, true, 'platform bench untouched');
    assert.equal(benchOn('tenant:t2'), true, 'other tenants untouched');
    const t1View = freellm.cooldownManager.isOnCooldown('groq', 'fixture-model', { scopeKey: 'tenant:t1' });
    assert.equal(t1View.onCooldown, true, 't1 still sees the PLATFORM bench via physics fall-through...');
    assert.equal(t1View.scopeKey, 'platform', '...but its OWN row is gone');
    assert.equal(getMetricsPersistence().loadCooldowns({ scopeKey: 'tenant:t1' }).length, 0, 'the durable store follows the scoped wipe');
    assert.equal(getMetricsPersistence().loadCooldowns({ scopeKey: 'tenant:t2' }).length, 1);
    assert.equal(getMetricsPersistence().loadCooldowns({ scopeKey: 'platform' }).length, 1);
});

test('C.4: invalid scopes are rejected 400 without touching any state', async () => {
    seedScopes();
    for (const bad of ['tenant:', 'TENANT:t1', 'platform;DROP', 'uid:zzz', '', 'tenant:t1 ', 42, {}]) {
        const res = await request(app).post('/api/admin/ai/reset-state')
            .set('Authorization', 'Bearer super-admin').send({ scope: bad, cache: false });
        assert.equal(res.status, 400, `scope ${JSON.stringify(bad)} must be rejected`);
        assert.equal(res.body.code, 'INVALID_RESET_STATE_SCOPE');
    }
    assert.equal(benchOn(null), true, 'nothing was wiped by the rejected calls');
    assert.equal(benchOn('tenant:t1'), true);
    // uid scope shape is valid:
    const uid = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ scope: 'uid:0123456789abcdef0123456789abcdef01234567', cache: false });
    assert.equal(uid.status, 200);
    assert.equal(uid.body.scope, 'uid:0123456789abcdef0123456789abcdef01234567');
});

test('C.4: the super-admin gate covers scoped resets; cooldowns:false keeps every bench', async () => {
    seedScopes();
    const user = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer plain-user').send({ scope: 'tenant:t1' });
    assert.equal(user.status, 403);
    const anon = await request(app).post('/api/admin/ai/reset-state').send({ scope: 'all' });
    assert.equal(anon.status, 401);
    assert.equal(benchOn(null), true);
    assert.equal(benchOn('tenant:t1'), true);

    promptCache.set([{ role: 'user', content: 'scoped reset cache fixture' }], 'fixture-model', 0.3, 'cached');
    const cacheOnly = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ cooldowns: false, scope: 'all' });
    assert.equal(cacheOnly.status, 200);
    assert.equal(cacheOnly.body.cooldowns, null, 'a scope never forces a cooldown reset');
    assert.equal(promptCache.size(), 0, 'the cache flush stays the legacy global behaviour');
    assert.equal(benchOn(null), true, 'every bench survived');
    assert.equal(benchOn('tenant:t2'), true);
});
