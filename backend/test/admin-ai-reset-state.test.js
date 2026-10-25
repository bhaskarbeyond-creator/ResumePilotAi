'use strict';

// F-13 (P2): resetCooldowns() and clearCache() existed in freellmapi since
// day one but NO route called them — during an incident an operator had to
// wait out cooldowns (up to 300s) or restart the process to flush a poisoned
// cached answer.
//
// Fix contract: POST /api/admin/ai/reset-state {cooldowns?, cache?}
//  - requireSuperAdmin (401 unauthenticated, 403 for lesser roles);
//  - flags default to true; both-false is a 400 (nothing to do);
//    non-boolean flags are a 400;
//  - the admin-audit middleware records the mutation automatically (the
//    mandated audit event: actor, path, body, outcome);
//  - durable metrics are deliberately NOT resettable (routing evidence).

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRepositoryForTests } = require('../repositories');
const { promptCache } = require('../freellmapi/services/cache');
const freellm = require('../freellmapi');

const auditEvents = [];

setRepositoryForTests({
    async getSetting() { return null; },
    async recordAdminAuditLog(event) { auditEvents.push(event); return event; },
});

setTokenVerifierForTests(async (token) => {
    const now = Math.floor(Date.now() / 1000);
    if (token === 'plain-user') return { uid: 'reset-user', email: 'u@test', email_verified: true, role: 'USER', auth_time: now };
    if (token === 'super-admin') return { uid: 'reset-admin', email: 's@test', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
    throw new Error('invalid token');
});

const app = require('../index');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function seedState() {
    freellm.cooldownManager.setCooldown('groq', 'fixture-model', 'rate_limit');
    promptCache.clear();
    promptCache.set([{ role: 'user', content: 'poisoned fixture answer' }], 'fixture-model', 0.3, 'poisoned');
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

test('F-13: unauthenticated and non-super-admin callers are rejected', async () => {
    const anon = await request(app).post('/api/admin/ai/reset-state').send({});
    assert.equal(anon.status, 401);

    const user = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer plain-user').send({});
    assert.equal(user.status, 403);

    assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'fixture-model').onCooldown, false);
});

test('F-13: empty body resets BOTH cooldowns and cache, and the mutation is audited', async () => {
    seedState();
    assert.equal(promptCache.size(), 1);

    const res = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.cooldowns.ok, true);
    assert.equal(res.body.cache.entriesCleared, 1, 'the response reports what was flushed');

    assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'fixture-model').onCooldown, false);
    assert.equal(promptCache.size(), 0);

    await sleep(60); // audit is recorded post-response
    const event = auditEvents.find(e => String(e.pathname || '').includes('/api/admin/ai/reset-state'));
    assert.ok(event, 'the admin-audit middleware recorded the reset as an audit event');
    assert.equal(event.actorUid, 'reset-admin');
    assert.equal(event.outcome, 'SUCCESS');
});

test('F-13: selective flags reset only the requested state', async () => {
    seedState();
    const keepCache = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ cache: false });
    assert.equal(keepCache.status, 200);
    assert.equal(keepCache.body.cache, null);
    assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'fixture-model').onCooldown, false, 'cooldowns reset');
    assert.equal(promptCache.size(), 1, 'cache deliberately kept');

    seedState();
    const keepCooldowns = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ cooldowns: false });
    assert.equal(keepCooldowns.status, 200);
    assert.equal(keepCooldowns.body.cooldowns, null);
    assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'fixture-model').onCooldown, true, 'cooldowns deliberately kept');
    assert.equal(promptCache.size(), 0, 'cache flushed');
});

test('F-13: invalid flag combinations are rejected 400 without touching state', async () => {
    seedState();
    const nothing = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ cooldowns: false, cache: false });
    assert.equal(nothing.status, 400);
    assert.equal(nothing.body.code, 'RESET_STATE_NOTHING_TO_DO');

    const badType = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({ cooldowns: 'yes' });
    assert.equal(badType.status, 400);
    assert.equal(badType.body.code, 'INVALID_RESET_STATE_FLAGS');

    assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'fixture-model').onCooldown, true, 'state untouched by rejected calls');
    assert.equal(promptCache.size(), 1);
});

test('F-13: durable metrics are NOT resettable through the operator path', async () => {
    const persistence = require('../freellmapi/services/persistence').getMetricsPersistence();
    persistence.recordRequest({ provider: 'groq', model: 'fixture-model', ok: false, status: 429, latencyMs: 12 });

    const res = await request(app).post('/api/admin/ai/reset-state')
        .set('Authorization', 'Bearer super-admin').send({});
    assert.equal(res.status, 200);

    const aggregates = persistence.getRollingAggregates({ windowMs: 30 * 60_000 });
    assert.ok(aggregates.some(row => row.provider === 'groq'), 'routing evidence survives the reset — metrics are not incident state');
    freellm.resetMetricsForTests();
});
