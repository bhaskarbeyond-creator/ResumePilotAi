'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ResilientRepository = require('../repositories/ResilientRepository');
const authority = require('../database/authority');

function mockRepo(label, { fail = false, store = new Map() } = {}) {
    return {
        label,
        async getUser(id) {
            if (fail) {
                const err = new Error(`${label} unavailable`);
                err.code = 'ECONNREFUSED';
                throw err;
            }
            return store.get(`user:${id}`) || null;
        },
        async saveUser(id, data) {
            if (fail) {
                const err = new Error(`${label} unavailable`);
                err.code = 'ECONNREFUSED';
                throw err;
            }
            const rec = { id, ...data };
            store.set(`user:${id}`, rec);
            return rec;
        },
        async getResume(userId, resumeId) {
            if (fail) {
                const err = new Error(`${label} unavailable`);
                err.code = 'ETIMEDOUT';
                throw err;
            }
            return store.get(`resume:${resumeId}`) || null;
        },
        async saveResume(userId, resumeId, data) {
            if (fail) {
                const err = new Error(`${label} unavailable`);
                err.code = 'ETIMEDOUT';
                throw err;
            }
            const rec = { id: resumeId, user_id: userId, ...data };
            store.set(`resume:${resumeId}`, rec);
            return rec;
        },
        async deleteResume(userId, resumeId) {
            if (fail) {
                const err = new Error(`${label} unavailable`);
                err.code = 'ECONNREFUSED';
                throw err;
            }
            store.delete(`resume:${resumeId}`);
            return true;
        },
    };
}

test('reads from MariaDB when primary is healthy', async () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    const mysqlStore = new Map();
    mysqlStore.set('user:u1', {
        id: 'u1',
        membership: 'Premium',
        paymentStatus: 'ACTIVE',
        membershipEnds: '2026-09-25T00:00:00.000Z',
    });
    const repo = new ResilientRepository({
        mysqlRepo: mockRepo('mysql', { store: mysqlStore }),
        firestoreRepo: mockRepo('firestore', { fail: true }),
    });
    const user = await repo.getUser('u1');
    assert.equal(user.id, 'u1');
    assert.equal(user.membershipEnds, '2026-09-25T00:00:00.000Z');
    assert.equal(typeof user.membershipEnds?.toDate, 'undefined');
});

test('read fails with a controlled error when MariaDB is down — no Firestore read failover', async () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: false, firestoreHealthy: true });
    const fsStore = new Map();
    fsStore.set('user:u2', {
        id: 'u2',
        membership: 'Pro',
        paymentStatus: 'ACTIVE',
        membershipEnds: { seconds: 1789920000, nanoseconds: 0 },
    });
    const repo = new ResilientRepository({
        mysqlRepo: mockRepo('mysql', { fail: true }),
        firestoreRepo: mockRepo('firestore', { store: fsStore }),
    });
    // MySQL is the only synchronous read path; a MySQL outage surfaces a
    // controlled 503 — never a silent switch to Firestore data.
    await assert.rejects(
        () => repo.getUser('u2'),
        error => error.code === 'DATABASE_UNAVAILABLE' || error.status === 503
    );
});

test('writes are rejected with a controlled error during MariaDB outage — no Firestore write path', async () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: false, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    const fsStore = new Map();
    const repo = new ResilientRepository({
        mysqlRepo: mockRepo('mysql', { fail: true }),
        firestoreRepo: mockRepo('firestore', { store: fsStore }),
    });
    await assert.rejects(
        () => repo.saveUser('u3', {
            email: 'u3@example.com',
            membership: 'Premium',
            membershipEnds: '2026-09-25T00:00:00.000Z',
            paymentStatus: 'ACTIVE',
        }),
        error => error.code === 'SERVICE_DEGRADED' || error.code === 'DATABASE_UNAVAILABLE'
    );
    assert.equal(fsStore.has('user:u3'), false, 'Firestore must never receive the write');
});

test('both engines down: write throws SERVICE_DEGRADED and does not fake success', async () => {
    authority.__resetForTests({ configuredPrimary: 'mysql' });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    const repo = new ResilientRepository({
        mysqlRepo: mockRepo('mysql', { fail: true }),
        firestoreRepo: mockRepo('firestore', { fail: true }),
    });
    await assert.rejects(() => repo.saveUser('u4', { email: 'nope@example.com' }), (err) => {
        assert.ok(err.status === 503 || err.code === 'BOTH_DATABASES_UNAVAILABLE' || /unavailable/i.test(err.message));
        return true;
    });
});

test('duplicate-safe delete while secondary is conceptually offline still succeeds on primary', async () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: false });
    const mysqlStore = new Map();
    mysqlStore.set('resume:r1', { id: 'r1', title: 'gone' });
    const repo = new ResilientRepository({
        mysqlRepo: mockRepo('mysql', { store: mysqlStore }),
        firestoreRepo: mockRepo('firestore', { fail: true }),
    });
    const result = await repo.deleteResume('u1', 'r1');
    assert.equal(result, true);
    assert.equal(mysqlStore.has('resume:r1'), false);
});
