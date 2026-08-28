'use strict';

process.env.NODE_ENV = 'test';
// This suite exercises deterministic database-unavailable behavior. Genuine
// MariaDB integration coverage uses the dedicated integration environment.
process.env.DB_HOST = process.env.MYSQL_HOST = '127.0.0.1';
process.env.DB_PORT = process.env.MYSQL_PORT = '1';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

const nowSeconds = () => Math.floor(Date.now() / 1000);

setTokenVerifierForTests(async token => {
    const now = nowSeconds();
    if (token === 'admin') {
        return { uid: 'admin-01', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
    }
    if (token === 'superadmin') {
        return { uid: 'sa-01', email: 'sa@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
    }
    if (token === 'user') {
        return { uid: 'u-01', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
    }
    throw new Error('INVALID_TOKEN');
});

const app = require('../index');

test('1. Unauthenticated request to /api/admin/database-settings is rejected with 401', async () => {
    const res = await request(app).get('/api/admin/database-settings');
    assert.equal(res.status, 401);
});

test('2. Plain USER request to /api/admin/database-settings is rejected with 403', async () => {
    const res = await request(app)
        .get('/api/admin/database-settings')
        .set('Authorization', 'Bearer user');
    assert.equal(res.status, 403);
});

test('3. ADMIN can read truthful MariaDB and Firebase Authentication ownership telemetry', async () => {
    const res = await request(app)
        .get('/api/admin/database-settings')
        .set('Authorization', 'Bearer admin');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.activeEngine, 'mysql');
    assert.equal(res.body.authoritativeDatabase, 'mariadb');
    assert.equal(res.body.ownershipMutable, false);
    assert.equal(res.body.identityProvider, 'firebase-auth');
    assert.equal(res.body.backupVerification?.status, 'NOT VERIFIED');
    assert.equal(typeof res.body.database?.connected, 'boolean');
});

test('4. Test connection endpoint rejects every non-MariaDB engine', async () => {
    const res = await request(app)
        .post('/api/admin/database-settings/test-connection')
        .set('Authorization', 'Bearer admin')
        .send({ engine: 'unsupported_db' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'DATABASE_ENGINE_UNSUPPORTED');
});

test('5. Runtime database-owner switching is rejected fail-closed', async () => {
    const res = await request(app)
        .post('/api/admin/database-settings')
        .set('Authorization', 'Bearer superadmin')
        .send({ engine: 'firestore' });
    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 'DATABASE_OWNER_IMMUTABLE');
});

test('6. Admin jobs fail closed when the authoritative MariaDB is unavailable', async () => {
    const res = await request(app)
        .get('/api/admin/jobs')
        .set('Authorization', 'Bearer admin');
    assert.equal(res.status, 503);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'JOBS_UNAVAILABLE');
    assert.ok(res.body.requestId);
});

test('7. Public jobs fail closed without fabricated fallback data when MariaDB is unavailable', async () => {
    const res = await request(app)
        .get('/api/jobs-data');
    assert.equal(res.status, 503);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 'DATABASE_UNAVAILABLE');
});

after(async () => {
    try {
        const { getPool } = require('../database/mysql');
        await getPool().end();
    } catch (_e) {}
});
