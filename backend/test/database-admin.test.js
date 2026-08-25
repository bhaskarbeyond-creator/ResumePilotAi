'use strict';

process.env.NODE_ENV = 'test';

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

function buildMockDb() {
    return {
        collection(name) {
            return {
                doc() {
                    return {
                        async get() {
                            return { exists: true, data: () => ({ status: 'healthy' }) };
                        },
                        async set() {
                            return true;
                        }
                    };
                },
            };
        },
    };
}

app.set('db', buildMockDb());

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

test('3. ADMIN / SUPER_ADMIN can read database settings and connectivity status', async () => {
    const res = await request(app)
        .get('/api/admin/database-settings')
        .set('Authorization', 'Bearer admin');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.activeEngine === 'firestore' || res.body.activeEngine === 'mysql');
    assert.ok(res.body.engineDetails);
});

test('4. Test connection endpoint validates engine argument', async () => {
    const res = await request(app)
        .post('/api/admin/database-settings/test-connection')
        .set('Authorization', 'Bearer admin')
        .send({ engine: 'unsupported_db' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'INVALID_ENGINE');
});

test('5. Test connection to firestore returns connectivity report', async () => {
    const res = await request(app)
        .post('/api/admin/database-settings/test-connection')
        .set('Authorization', 'Bearer admin')
        .send({ engine: 'firestore' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.result?.connected, 'boolean');
});

after(async () => {
    try {
        const { getPool } = require('../database/mysql');
        await getPool().end();
    } catch (e) {}
});
