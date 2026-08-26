process.env.NODE_ENV = 'test';
const { describe, it, before, after, _beforeEach } = require('node:test');
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

        // MySQL is the authoritative control-plane store. A Firestore quota
        // exhaustion can no longer degrade these endpoints — Firestore is not
        // consulted on the synchronous path.
        app.set('db', null);
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

    it('1. Admin Audit Logs route serves from MySQL with a truthful envelope', async () => {
        const res = await request(app)
            .get('/api/admin/audit-logs')
            .set('Authorization', 'Bearer valid_mock_token')
            .expect(200);

        assert.ok(Array.isArray(res.body.logs));
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
        assert(!/quotaLimited|RESOURCE_EXHAUSTED|STANDBY_FIRESTORE/.test(JSON.stringify(res.body)));
    });

    it('2. Admin Audit Stats route serves from MySQL without quota flags', async () => {
        const res = await request(app)
            .get('/api/admin/audit-logs/stats')
            .set('Authorization', 'Bearer valid_mock_token')
            .expect(200);

        assert.ok(Number.isFinite(Number(res.body.sampleSize)));
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
        assert(!/quotaLimited|RESOURCE_EXHAUSTED|STANDBY_FIRESTORE/.test(JSON.stringify(res.body)));
    });

    it('3. Security Events route serves from MySQL with a truthful envelope', async () => {
        const res = await request(app)
            .get('/api/platform/security-events')
            .set('Authorization', 'Bearer valid_mock_token')
            .expect(200);

        assert.ok(Array.isArray(res.body.events));
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
        assert(!JSON.stringify(res.body).includes('firestore'));
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
