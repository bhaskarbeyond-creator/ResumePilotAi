process.env.NODE_ENV = 'test';
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const admin = require('../services/firebaseAdmin');
const { adminAuditRouter } = require('../routes/adminAudit');
const { platformRouter } = require('../routes/platform');
const { requireAuth, setTokenVerifierForTests } = require('../security/auth');

describe('Control Plane Data Source Integrity & Quota Degradation', () => {
    let app;

    before(() => {
        setTokenVerifierForTests(async () => ({
            uid: 'superadmin_audit_tester',
            email: 'admin@resumepilot.ai',
            email_verified: true,
            role: 'SUPER_ADMIN',
            isA: true,
            permissions: ['*']
        }));

        app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            if (!req.headers.authorization) req.headers.authorization = 'Bearer valid_mock_token';
            next();
        });
        app.use(requireAuth);

        const createMockQuery = () => {
            const throwQuota = async () => {
                const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
                err.code = 8;
                throw err;
            };
            const obj = {
                get: throwQuota,
                set: throwQuota,
                doc: () => createMockQuery(),
                collection: () => createMockQuery(),
                orderBy: () => createMockQuery(),
                where: () => createMockQuery(),
                limit: () => createMockQuery(),
                startAfter: () => createMockQuery(),
                count: () => ({ get: throwQuota })
            };
            return obj;
        };

        const mockDb = createMockQuery();

        app.set('db', mockDb);
        app.set('firebaseAdmin', {
            firestore: { FieldValue: { serverTimestamp: () => new Date() } },
            auth: () => ({
                listUsers: async () => ({ users: [], pageToken: null })
            })
        });

        app.use('/api/admin', adminAuditRouter);
        app.use('/api/platform', platformRouter);
    });

    after(() => {
        setTokenVerifierForTests(token => admin.auth().verifyIdToken(token, true));
    });

    it('1. Admin Audit Logs route gracefully degrades with HTTP 200 and quotaLimited: true when Firestore quota is exhausted', async () => {
        const res = await request(app)
            .get('/api/admin/audit-logs')
            .set('Authorization', 'Bearer valid_mock_token')
            .expect(200);

        assert.strictEqual(res.body.degraded, true);
        assert.strictEqual(res.body.quotaLimited, true);
        assert(Array.isArray(res.body.logs));
        assert.strictEqual(res.body.logs.length, 0);
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
    });

    it('2. Admin Audit Stats route gracefully degrades with HTTP 200 and quotaLimited: true when Firestore quota is exhausted', async () => {
        const res = await request(app)
            .get('/api/admin/audit-logs/stats')
            .set('Authorization', 'Bearer valid_mock_token')
            .expect(200);

        assert.strictEqual(res.body.degraded, true);
        assert.strictEqual(res.body.quotaLimited, true);
        assert.strictEqual(res.body.sampleSize, 0);
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
    });

    it('3. Security Events route gracefully degrades with HTTP 200 when Firestore quota is exhausted', async () => {
        const res = await request(app)
            .get('/api/platform/security-events')
            .set('Authorization', 'Bearer valid_mock_token')
            .expect(200);

        assert.strictEqual(res.body.degraded, true);
        assert.strictEqual(res.body.quotaLimited, true);
        assert(Array.isArray(res.body.events));
        assert.strictEqual(res.body.events.length, 0);
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
    });

    it('4. Platform Version endpoint is 100% resilient and requires no database reads', async () => {
        const res = await request(app)
            .get('/api/platform/version')
            .set('Authorization', 'Bearer valid_mock_token')
            .expect(200);

        assert.strictEqual(res.body.service, 'resumepilot-backend');
        assert(typeof res.body.commitSha === 'string' && res.body.commitSha.length > 0);
    });
});
