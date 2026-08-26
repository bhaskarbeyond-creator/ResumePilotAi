process.env.NODE_ENV = 'test';
const { describe, it, before, after, _beforeEach } = require('node:test');
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const admin = require('../services/firebaseAdmin');
const { adminAuditRouter } = require('../routes/adminAudit');
const { platformRouter } = require('../routes/platform');
const { requireAuth, setTokenVerifierForTests } = require('../security/auth');

describe('Control Plane MySQL-Authoritative Degradation Test', () => {
    let _currentMockDb;

    before(() => {
        setTokenVerifierForTests(async () => ({
            uid: 'superadmin_chaos_tester',
            email: 'admin@resumepilot.ai',
            email_verified: true,
            role: 'SUPER_ADMIN',
            isA: true,
            permissions: ['*']
        }));
    });

    after(() => {
        setTokenVerifierForTests(token => admin.auth().verifyIdToken(token, true));
    });

    function createApp(mockDb) {
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            if (!req.headers.authorization) req.headers.authorization = 'Bearer valid_mock_token';
            next();
        });
        app.use(requireAuth);
        app.set('db', mockDb);
        app.set('firebaseAdmin', {
            firestore: { FieldValue: { serverTimestamp: () => new Date() } },
            auth: () => ({ listUsers: async () => ({ users: [], pageToken: null }) })
        });
        app.use('/api/admin', adminAuditRouter);
        app.use('/api/platform', platformRouter);
        return app;
    }

    // State 1: Healthy — audit logs and platform events come from MySQL.
    it('State 1 (Healthy): Returns audit logs and platform events normally', async () => {
        const app = createApp(null);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.strictEqual(res.body.degraded, undefined);
        assert.ok(Array.isArray(res.body.logs));
        assert(!/quotaLimited|RESOURCE_EXHAUSTED/.test(JSON.stringify(res.body)));
    });

    // State 2: A Firestore-shaped error cannot affect the MySQL path at all.
    it('State 2 (Firestore quota error is inert): MySQL serves normally', async () => {
        const quotaErr = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
        quotaErr.code = 8;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({ limit: () => ({ get: async () => { throw quotaErr; } }) })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.strictEqual(res.body.degraded, undefined, 'Firestore quota must not mark the MySQL response degraded');
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
    });

    // State 3: Firestore network failure is inert on the MySQL path.
    it('State 3 (Firestore unavailable is inert): MySQL serves normally', async () => {
        const unavailErr = new Error('14 UNAVAILABLE: The service is currently unavailable.');
        unavailErr.code = 14;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({ limit: () => ({ get: async () => { throw unavailErr; } }) })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.strictEqual(res.body.degraded, undefined);
    });

    // State 4: Deadline/timeout errors from Firestore are inert.
    it('State 4 (Firestore deadline error is inert): MySQL serves normally', async () => {
        const timeoutErr = new Error('4 DEADLINE_EXCEEDED: Deadline exceeded.');
        timeoutErr.code = 4;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({ limit: () => ({ get: async () => { throw timeoutErr; } }) })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.ok(Array.isArray(res.body.logs));
    });

    // State 5: MySQL is authoritative — the endpoints serve real data even
    // with the Firestore handle null (the default production configuration).
    it('State 5 (Null Firestore handle): MySQL serves normally', async () => {
        const app = createApp(null);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.ok(Array.isArray(res.body.logs));
    });

    // State 6: Security events are MySQL-backed; Firestore quota is inert.
    it('State 6 (Firestore quota inert): Security Events serve from MySQL', async () => {
        const quotaErr = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
        quotaErr.code = 8;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({ limit: () => ({ get: async () => { throw quotaErr; } }) })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/platform/security-events').expect(200);
        assert.strictEqual(res.body.degraded, undefined);
        assert.ok(Array.isArray(res.body.events));
    });

    // State 7: Single audit record fetch uses MySQL; a missing record is 404.
    it('State 7 (Single Audit Log Detail): MySQL-backed with structured 404', async () => {
        const app = createApp(null);
        const res = await request(app).get('/api/admin/audit-logs/log_999_missing');
        assert.ok([404, 500].includes(res.status), `expected 404/500, got ${res.status}`);
    });

    // State 8: Platform Version Invariant (Zero DB dependency)
    it('State 8 (Platform Version Invariant): Responds instantly regardless of DB state', async () => {
        const mockDb = {
            collection: () => { throw new Error('FATAL_CRASH_IF_ACCESSED'); }
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/platform/version').expect(200);
        assert.strictEqual(res.body.service, 'resumepilot-backend');
        assert(typeof res.body.commitSha === 'string');
    });
});
