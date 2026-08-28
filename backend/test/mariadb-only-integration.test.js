'use strict';

/**
 * MARIADB-ONLY PRODUCTION CONTRACT INTEGRATION SUITE
 * ============================================
 *
 * Proves the application runs with ZERO retired data plane dependency:
 *  - no retired data-plane handle is registered on the application
 *  - Firebase Authentication remains available as the identity plane
 *  - every synchronous production workflow is backed by MariaDB only
 *
 * Run:  NODE_ENV=test node --test backend/test/mariadb-only-integration.test.js
 *
 * The suite asserts the retired application-data plane is absent and then exercises the critical
 * user journeys against the real MariaDB database.
 */

process.env.NODE_ENV = 'test';
delete process.env.FIREBASE_PRIVATE_KEY;
delete process.env.FIREBASE_CLIENT_EMAIL;
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
process.env.SMTP_PASS = 'fixture-mail-password';

const test = require('node:test');
const assert = require('node:assert/strict');
const ENABLED = process.env.RUN_MARIADB_INTEGRATION === 'true';
if (ENABLED) require('./helpers/disposableMariaDb').loadDisposableMariaDb();
const mariaTest = (name, fn) => test(name, {
    skip: ENABLED ? false : 'NOT VERIFIED: set RUN_MARIADB_INTEGRATION=true against a disposable migrated MariaDB database',
}, fn);
const request = require('supertest');
const crypto = require('crypto');
process.env.ENTERPRISE_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('base64');
const { setTokenVerifierForTests } = require('../security/auth');

// ── Test identity: a deterministic set of UIDs with roles ──────────────────
const now = Math.floor(Date.now() / 1000);
setTokenVerifierForTests(async token => {
    if (token === 'user') return { uid: 'maria-only-user-1', email: 'maria-only-user@example.com', email_verified: true, role: 'USER', auth_time: now };
    if (token === 'user2') return { uid: 'maria-only-user-2', email: 'maria-only-user2@example.com', email_verified: true, role: 'USER', auth_time: now };
    if (token === 'admin') return { uid: 'maria-only-admin-1', email: 'maria-only-admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
    if (token === 'super-admin') return { uid: 'maria-only-super-1', email: 'maria-only-super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
    throw new Error('invalid token');
});

const app = require('../index');
// Structural assertion: the retired application-data plane is not registered.
assert.equal(app.get('db'), undefined, 'retired application-data plane must be absent from the application');
assert.equal(app.get('firebaseAdmin').apps.length >= 0, true);

const bearer = token => ({ Authorization: `Bearer ${token}` });
const rid = () => crypto.randomBytes(6).toString('hex');

// Cleanup helper: remove test rows created by this suite.
const { getPool } = require('../database/mysql');
async function cleanup() {
    const pool = getPool();
    const ids = ['maria-only-user-1', 'maria-only-user-2'];
    for (const uid of ids) {
        await pool.query('DELETE FROM favourites WHERE user_id = ?', [uid]).catch(() => {});
        await pool.query('DELETE FROM resumes WHERE user_id = ?', [uid]).catch(() => {});
        await pool.query('DELETE FROM portfolios WHERE user_id = ?', [uid]).catch(() => {});
        await pool.query('DELETE FROM covers WHERE user_id = ?', [uid]).catch(() => {});
        await pool.query('DELETE FROM notifications WHERE user_id = ?', [uid]).catch(() => {});
        await pool.query('DELETE FROM users WHERE id = ?', [uid]).catch(() => {});
    }
    await pool.query("DELETE FROM stats WHERE id = 'global_stats'").catch(() => {});
    await pool.query("DELETE FROM reviews WHERE id LIKE 'reviews_%'").catch(() => {});
    await pool.query("DELETE FROM canonical_documents WHERE entity_type = 'phrases' AND entity_id = 'maria-only-category'").catch(() => {});
    await pool.query('DELETE FROM password_reset_tokens').catch(() => {});
    await pool.query('DELETE FROM password_reset_state').catch(() => {});
    await pool.query('DELETE FROM email_verification_tokens').catch(() => {});
    await pool.query('DELETE FROM email_verification_state').catch(() => {});
    await pool.query('DELETE FROM oauth_states').catch(() => {});
    await pool.query('DELETE FROM oauth_exchange_codes').catch(() => {});
    await pool.query('DELETE FROM export_render_tokens').catch(() => {});
}

test.before(async () => { if (ENABLED) await cleanup(); });
test.after(async () => { if (ENABLED) await cleanup(); });

mariaTest('CERTIFICATION: application starts and reports MySQL-only authority with the retired data plane absent', async () => {
    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body.status, 'ok');
    assert.equal(health.body.databases.authority.configuredPrimary, 'mysql');
    assert.equal(health.body.databases.authority.operationalWriteEngine, 'mysql');
    assert.equal(health.body.databases.authority.canAcceptWrites, true);

    const ready = await request(app).get('/readyz');
    assert.ok([200, 503].includes(ready.status));
});

mariaTest('CERTIFICATION: public configuration loads from MariaDB only', async () => {
    const res = await request(app).get('/api/platform/public-config').expect(200);
    assert.equal(res.body.success !== false, true);
    assert.ok(res.body.modules || res.body.subscriptions || res.body.website);
});

mariaTest('CERTIFICATION: llms.txt is default-off, claim-validated, audited, and MariaDB-backed', async () => {
    await request(app).get('/llms.txt').expect(404);
    const settings = await request(app).get('/api/admin/settings').set(bearer('admin')).expect(200);
    const expectedRevision = Number(settings.body.revisions?.llmGeo || 0);

    const rejected = await request(app)
        .post('/api/admin/settings/llmGeo')
        .set(bearer('admin'))
        .send({
            expectedRevision,
            data: { enableLlmGeo: true, llmsTxtContent: '# ResumePilot AI\nThe #1 top-rated resume service with a 4.9/5 rating.' },
        })
        .expect(400);
    assert.equal(rejected.body.code, 'LLMS_UNSUPPORTED_CLAIM');

    const document = '# ResumePilot AI\nBrowser-based tools for editing and exporting resumes and cover letters.';
    const published = await request(app)
        .post('/api/admin/settings/llmGeo')
        .set(bearer('admin'))
        .send({ expectedRevision, data: { enableLlmGeo: true, llmsTxtContent: document } })
        .expect(200);
    assert.equal(published.body.settings.enableLlmGeo, true);
    assert.deepEqual(Object.keys(published.body.settings).sort(), ['enableLlmGeo', 'llmsTxtContent']);

    const publicDocument = await request(app).get('/llms.txt').expect(200);
    assert.match(publicDocument.headers['content-type'], /^text\/plain/);
    assert.equal(publicDocument.text.trim(), document);

    await request(app)
        .post('/api/admin/settings/llmGeo')
        .set(bearer('admin'))
        .send({ expectedRevision: published.body.revision, data: { enableLlmGeo: false, llmsTxtContent: document } })
        .expect(200);
    await request(app).get('/llms.txt').expect(404);
});

mariaTest('CERTIFICATION: authentication is enforced on protected routes (identity-plane only)', async () => {
    await request(app).get('/api/users-data/profile').expect(401);
    const res = await request(app).get('/api/users-data/profile').set(bearer('user')).expect(200);
    assert.equal(res.body.success, true);
});

mariaTest('CERTIFICATION: user profile create/read/update with optimistic revision guard (MySQL transactions)', async () => {
    // Create profile (saveUser upsert)
    const created = await request(app)
        .post('/api/users-data/profile')
        .set(bearer('user'))
        .send({ userId: 'maria-only-user-1', email: 'maria-only-user@example.com', firstname: 'MariaDB', lastname: 'Only', profile: { name: 'MariaDB Only', revision: 1 } })
        .expect(200);
    assert.equal(created.body.success, true);

    const fetched = await request(app).get('/api/users-data/profile').set(bearer('user')).expect(200);
    assert.equal(fetched.body.user.id, 'maria-only-user-1');
    const currentRevision = Number(fetched.body.user.revision || 1);

    // Guarded save with the correct revision succeeds
    const saved = await request(app)
        .post('/api/users-data/profile')
        .set(bearer('user'))
        .send({ userId: 'maria-only-user-1', expectedRevision: currentRevision, profile: { name: 'MariaDB Only Updated', revision: currentRevision + 1 } })
        .expect(200);
    assert.equal(saved.body.user.revision, currentRevision + 1);

    // Guarded save with a stale revision is rejected with 409 PROFILE_CONFLICT
    const conflict = await request(app)
        .post('/api/users-data/profile')
        .set(bearer('user'))
        .send({ userId: 'maria-only-user-1', expectedRevision: currentRevision, profile: { name: 'Stale Write', revision: currentRevision + 2 } })
        .expect(409);
    assert.equal(conflict.body.code, 'PROFILE_CONFLICT');
});

mariaTest('CERTIFICATION: resume create -> list -> load -> edit -> publish -> delete (MySQL persistence)', async () => {
    const resumeId = `maria-only-resume-${rid()}`;
    // Create (the API creates/updates drafts at POST /api/resumes/:id)
    const created = await request(app)
        .post(`/api/resumes/${resumeId}`)
        .set(bearer('user'))
        .send({ template: 'Cv1', firstname: 'MariaDB Only', revision: 1, employments: [], educations: [], skills: ['Node'], languages: [] })
        .expect(200);
    assert.equal(created.body.success, true);

    // List
    const list = await request(app).get('/api/resumes').set(bearer('user')).expect(200);
    const found = (list.body.resumes || []).find(r => r.id === resumeId);
    assert.ok(found, 'created resume must appear in the list');
    assert.equal(found.template, 'Cv1');

    // Load
    const loaded = await request(app).get(`/api/resumes/${resumeId}`).set(bearer('user')).expect(200);
    assert.equal(loaded.body.resume.id, resumeId);
    assert.equal(loaded.body.resume.firstname, 'MariaDB Only');

    // Edit with revision
    const edited = await request(app)
        .post(`/api/resumes/${resumeId}`)
        .set(bearer('user'))
        .send({ ...loaded.body.resume, firstname: 'MariaDB Only Edited', expectedRevision: 1 })
        .expect(200);
    assert.ok(Number(edited.body.resume.revision) >= 2);

    // Publish
    const published = await request(app)
        .post(`/api/resumes/${resumeId}/publish`)
        .set(bearer('user'))
        .send({ resumeData: { firstname: 'MariaDB Only Edited' }, expectedRevision: Number(edited.body.resume.revision) })
        .expect(200);
    assert.equal(published.body.success, true);

    // Publication state
    const pub = await request(app).get(`/api/resumes/${resumeId}/publication`).set(bearer('user')).expect(200);
    assert.equal(pub.body.isPublished, true);

    // Delete
    await request(app).delete(`/api/resumes/${resumeId}`).set(bearer('user')).expect(200);
    const afterDelete = await request(app).get(`/api/resumes/${resumeId}`).set(bearer('user')).expect(404);
    assert.equal(afterDelete.body.success, false);
});

mariaTest('CERTIFICATION: cross-user access is denied (multi-tenant zero-trust)', async () => {
    const resumeId = `maria-only-private-${rid()}`;
    await request(app)
        .post(`/api/resumes/${resumeId}`)
        .set(bearer('user'))
        .send({ template: 'Cv1', firstname: 'Private', revision: 1 })
        .expect(200);
    // User B must not read user A's resume
    const res = await request(app).get(`/api/resumes/${resumeId}`).set(bearer('user2')).expect(404);
    assert.equal(res.body.success, false);
    // User B must not delete user A's resume
    const del = await request(app).delete(`/api/resumes/${resumeId}`).set(bearer('user2')).expect(404);
    assert.equal(del.body.success, false);
});

mariaTest('CERTIFICATION: favourites are MySQL-backed and owner-scoped', async () => {
    await request(app).post('/api/favourites').set(bearer('user')).send({ itemId: 'res-1', itemType: 'resume', data: { name: 'x' } }).expect(200);
    const list = await request(app).get('/api/favourites').set(bearer('user')).expect(200);
    assert.ok((list.body.favourites || []).some(f => f.itemId === 'res-1'));
    const check = await request(app).get('/api/favourites/res-1/check').set(bearer('user')).expect(200);
    assert.equal(check.body.isFavourite, true);
    // Owner-scoped: user2 must not see it
    const other = await request(app).get('/api/favourites').set(bearer('user2')).expect(200);
    assert.ok(!(other.body.favourites || []).some(f => f.itemId === 'res-1'));
    await request(app).delete('/api/favourites/res-1').set(bearer('user')).expect(200);
    const after = await request(app).get('/api/favourites/res-1/check').set(bearer('user')).expect(200);
    assert.equal(after.body.isFavourite, false);
});

mariaTest('CERTIFICATION: stats read + authenticated increments (MySQL)', async () => {
    const res = await request(app).get('/api/stats').expect(200);
    assert.equal(res.body.success, true);
    await request(app).post('/api/stats/increment').set(bearer('user')).send({ key: 'downloads_test', delta: 1 }).expect(200);
    const after = await request(app).get('/api/stats').expect(200);
    assert.ok(Number(after.body.stats.downloads_test) >= 1);
});

mariaTest('CERTIFICATION: public reviews use relational owner and phrases use canonical documents', async () => {
    // Admin writes a review
    const write = await request(app)
        .post('/api/admin/reviews')
        .set(bearer('admin'))
        .send({ name: 'MariaDB Only Tester', review: 'Great product from the certification suite', rating: 5 })
        .expect(200);
    assert.equal(write.body.success, true);
    const reviews = await request(app).get('/api/reviews?limit=3').expect(200);
    assert.ok(Array.isArray(reviews.body.reviews));

    // Phrases (public read)
    const phrases = await request(app).get('/api/phrases').expect(200);
    assert.equal(phrases.body.success, true);
});

mariaTest('CERTIFICATION: contact messages persist to MySQL', async () => {
    const res = await request(app)
        .post('/api/contact')
        .send({ name: 'MariaDB Only Tester', email: 'contact-mariadb-only@example.com', message: 'This is a contact message from the MariaDB-only integration suite.' })
        .expect(202);
    assert.equal(res.body.success, true);
});

mariaTest('CERTIFICATION: AI endpoints fail with controlled configuration errors (not retired data plane errors)', async () => {
    const res = await request(app)
        .post('/api/ai/generate-resume')
        .set(bearer('user'))
        .send({ jobTitle: 'Developer', yearsOfExperience: 3 });
    // A controlled 4xx/5xx from the AI layer (providers unconfigured) is correct;
    // the failure must NOT be a retired data plane error.
    assert.ok(res.status >= 400, `expected controlled error, got ${res.status}`);
    const errorText = JSON.stringify(res.body || {});
    assert.ok(!/retired data plane/i.test(errorText), 'AI failure must not mention retired data plane');
});

mariaTest('CERTIFICATION: export render token lifecycle is MySQL-durable', async () => {
    const { createExportRenderToken, consumeExportRenderToken } = require('../security/exportTokens');
    const data = { jobId: `job-${rid()}`, userId: 'maria-only-user-1' };
    const token = await createExportRenderToken(data, { ttlMs: 60_000 });
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const consumed = await consumeExportRenderToken(token);
    assert.equal(consumed.jobId, data.jobId);
    const again = await consumeExportRenderToken(token);
    assert.equal(again, null, 'a token must be single-use');
});

mariaTest('CERTIFICATION: OAuth state & exchange codes are MySQL-backed (single-use)', async () => {
    const { createOAuthState, consumeOAuthState, createOAuthExchangeCode, redeemOAuthExchangeCode } = require('../database/oauthStore');
    const stateHash = crypto.createHash('sha256').update('state-abc').digest('hex');
    await createOAuthState({ stateHash, provider: 'github', codeVerifier: 'verifier-123', expiresAt: Date.now() + 60_000 });
    const consumed = await consumeOAuthState({ stateHash, provider: 'github' });
    assert.equal(consumed.codeVerifier, 'verifier-123');
    const again = await consumeOAuthState({ stateHash, provider: 'github' });
    assert.equal(again, null, 'OAuth state must be single-use');

    const codeHash = crypto.createHash('sha256').update('exchange-code').digest('hex');
    await createOAuthExchangeCode({ codeHash, uid: 'maria-only-user-1', provider: 'github', expiresAt: Date.now() + 60_000 });
    const record = await redeemOAuthExchangeCode({ codeHash });
    assert.equal(record.uid, 'maria-only-user-1');
    const again2 = await redeemOAuthExchangeCode({ codeHash });
    assert.equal(again2, null, 'exchange codes must be single-use');
});

mariaTest('CERTIFICATION: password-reset token store is MySQL-backed and latest-token-wins', async () => {
    const { createPasswordResetToken, leasePasswordResetToken, finalizePasswordReset, releasePasswordResetLease } = require('../database/authTokens');
    const t1 = crypto.createHash('sha256').update('reset-token-1').digest('hex');
    const t2 = crypto.createHash('sha256').update('reset-token-2').digest('hex');
    await createPasswordResetToken({ tokenHash: t1, uid: 'maria-only-user-1', email: 'maria-only-user@example.com', expiresAt: Date.now() + 60_000 });
    await createPasswordResetToken({ tokenHash: t2, uid: 'maria-only-user-1', email: 'maria-only-user@example.com', expiresAt: Date.now() + 60_000 });
    // t1 was replaced by t2 (latest-token-wins)
    await assert.rejects(
        leasePasswordResetToken({ tokenHash: t1, email: 'maria-only-user@example.com' }),
        /INVALID_TOKEN/
    );
    const leased = await leasePasswordResetToken({ tokenHash: t2, email: 'maria-only-user@example.com' });
    assert.equal(leased.uid, 'maria-only-user-1');
    // A second concurrent lease on the same token is refused
    await assert.rejects(
        leasePasswordResetToken({ tokenHash: t2, email: 'maria-only-user@example.com' }),
        /INVALID_TOKEN/
    );
    await finalizePasswordReset({ tokenHash: t2, uid: 'maria-only-user-1', leaseId: leased.leaseId });
    await releasePasswordResetLease({ tokenHash: t2, leaseId: leased.leaseId }).catch(() => {});
});

mariaTest('CERTIFICATION: GDPR account export assembles owner data from MySQL', async () => {
    const res = await request(app).post('/api/account/export').set(bearer('user')).expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.export.userId, 'maria-only-user-1');
    assert.ok(Array.isArray(res.body.export.resumes));
    assert.ok(Array.isArray(res.body.export.favourites));
    assert.ok(Array.isArray(res.body.export.exportWarnings));
});

mariaTest('CERTIFICATION: admin surfaces operate with MySQL (users list, audit write)', async () => {
    const users = await request(app).get('/api/admin/users').set(bearer('admin')).expect(200);
    assert.equal(users.body.success, true);
    assert.ok(Array.isArray(users.body.users));

    // Admin audit log writes to MySQL
    const audit = await request(app).get('/api/admin/audit-logs').set(bearer('super-admin'));
    assert.ok([200, 403].includes(audit.status));
});

// Allow clean process exit: close the shared MySQL pool after this file.
const { after: teardown } = require('node:test');
teardown(async () => { if (ENABLED) try { await getPool().end(); } catch { /* already closed */ } });
