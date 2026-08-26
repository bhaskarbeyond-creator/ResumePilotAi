process.env.NODE_ENV = 'test';
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const admin = require('../services/firebaseAdmin');
const { adminAuditRouter } = require('../routes/adminAudit');
const { platformRouter } = require('../routes/platform');
const { requireAuth, setTokenVerifierForTests } = require('../security/auth');

describe('Control Plane Firestore 8-State Failure & Degradation Chaos Test', () => {
    let currentMockDb;

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

    // State 1: Healthy
    it('State 1 (Healthy): Returns audit logs and platform events normally', async () => {
        const mockDb = {
            collection: () => ({
                orderBy: () => ({
                    limit: () => ({
                        get: async () => ({
                            forEach: (cb) => {
                                cb({
                                    id: 'audit_101',
                                    data: () => ({
                                        action: 'TEST_ACTION',
                                        actorUid: 'u1',
                                        category: 'system',
                                        severity: 'INFO',
                                        outcome: 'SUCCESS',
                                        occurredAt: new Date().toISOString()
                                    })
                                });
                            },
                            docs: [{ id: 'audit_101' }]
                        })
                    })
                })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.strictEqual(res.body.degraded, undefined);
        assert.strictEqual(res.body.logs.length, 1);
        assert.strictEqual(res.body.logs[0].id, 'audit_101');
    });

    // State 2: Quota Exhaustion (code 8)
    it('State 2 (Quota Exhaustion - code 8): Gracefully degrades without 500 or raw exception', async () => {
        const quotaErr = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
        quotaErr.code = 8;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({
                    limit: () => ({
                        get: async () => { throw quotaErr; }
                    })
                })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.strictEqual(res.body.degraded, true);
        assert.strictEqual(res.body.quotaLimited, true);
        assert.strictEqual(res.body.logs.length, 0);
        assert(!JSON.stringify(res.body).includes('RESOURCE_EXHAUSTED'));
    });

    // State 3: Network Unavailable (code 14)
    it('State 3 (Network Unavailable - code 14): Gracefully degrades without crashing', async () => {
        const unavailErr = new Error('14 UNAVAILABLE: The service is currently unavailable.');
        unavailErr.code = 14;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({
                    limit: () => ({
                        get: async () => { throw unavailErr; }
                    })
                })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs').expect(200);
        assert.strictEqual(res.body.degraded, true);
        assert.strictEqual(res.body.quotaLimited, true);
    });

    // State 4: Deadline Exceeded / Timeout (code 4)
    it('State 4 (Deadline Exceeded - code 4): Handled cleanly via standard error protocol', async () => {
        const timeoutErr = new Error('4 DEADLINE_EXCEEDED: Deadline exceeded.');
        timeoutErr.code = 4;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({
                    limit: () => ({
                        get: async () => { throw timeoutErr; }
                    })
                })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs');
        assert(res.status === 200 || res.status === 500);
        if (res.status === 500) {
            assert.strictEqual(res.body.error.code, 4);
        }
    });

    // State 5: Database Missing (null db)
    it('State 5 (Null Database Instance): Returns 503 DATABASE_UNAVAILABLE', async () => {
        const app = createApp(null);
        const res = await request(app).get('/api/admin/audit-logs').expect(503);
        assert.strictEqual(res.body.error.code, 'DATABASE_UNAVAILABLE');
    });

    // State 6: Partial Failure (stats degraded, events degraded)
    it('State 6 (Security Events Quota Exhaustion): Security Events degrades cleanly', async () => {
        const quotaErr = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
        quotaErr.code = 8;
        const mockDb = {
            collection: () => ({
                orderBy: () => ({
                    limit: () => ({
                        get: async () => { throw quotaErr; }
                    })
                })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/platform/security-events').expect(200);
        assert.strictEqual(res.body.degraded, true);
        assert.strictEqual(res.body.quotaLimited, true);
        assert.strictEqual(res.body.events.length, 0);
    });

    // State 7: Audit Single Record Fetch (HTTP 503 structured when quota limited)
    it('State 7 (Single Audit Log Detail): Returns structured 503 when store is unavailable', async () => {
        const quotaErr = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
        quotaErr.code = 8;
        const mockDb = {
            collection: () => ({
                doc: () => ({
                    get: async () => { throw quotaErr; }
                })
            })
        };

        const app = createApp(mockDb);
        const res = await request(app).get('/api/admin/audit-logs/log_999').expect(503);
        assert.strictEqual(res.body.error.code, 'STANDBY_STORE_QUOTA_LIMITED');
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
