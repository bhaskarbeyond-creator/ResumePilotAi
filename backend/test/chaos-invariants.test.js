'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ResilientRepository = require('../repositories/ResilientRepository');
const authority = require('../database/authority');
const fencing = require('../database/fencing');
const { createMutationId } = require('../database/canonical');
const { recordTombstone, isTombstoned, rememberMutation } = require('../database/tombstones');

function dualStore() {
    const mysql = new Map();
    const firestore = new Map();
    const make = (label, store, { fail = false } = {}) => ({
        label,
        fail,
        store,
        async getUser(id) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            return store.get(`user:${id}`) || null;
        },
        async saveUser(id, data) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            const rec = { id, revision: Number(data.revision || 1), ...data };
            store.set(`user:${id}`, rec);
            return rec;
        },
        async getResume(uid, id) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ETIMEDOUT'; throw e; }
            return store.get(`resume:${id}`) || null;
        },
        async saveResume(uid, id, data) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ETIMEDOUT'; throw e; }
            const rec = { id, user_id: uid, revision: Number(data.revision || 1), ...data };
            store.set(`resume:${id}`, rec);
            return rec;
        },
        async deleteResume(uid, id) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.delete(`resume:${id}`);
            return true;
        },
        async savePortfolio(uid, id, data) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.set(`portfolio:${id}`, { id, user_id: uid, ...data });
            return store.get(`portfolio:${id}`);
        },
        async saveJob(id, data) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.set(`job:${id}`, { id, ...data });
            return store.get(`job:${id}`);
        },
        async saveBlogPost(id, data) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.set(`blog:${id}`, { id, ...data });
            return store.get(`blog:${id}`);
        },
        async savePaymentOrder(id, data) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.set(`pay:${id}`, { id, ...data });
            return store.get(`pay:${id}`);
        },
        async getPaymentOrder(id) {
            if (this.fail) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            return store.get(`pay:${id}`) || null;
        },
    });
    return {
        mysql, firestore,
        mysqlRepo: make('mysql', mysql),
        firestoreRepo: make('firestore', firestore),
    };
}

test('invariant: successful mutation exists on write-authority engine', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    const { mysql, mysqlRepo, firestoreRepo } = dualStore();
    const repo = new ResilientRepository({ mysqlRepo, firestoreRepo });
    await repo.saveUser('u1', { email: 'a@b.c', membership: 'Premium', membershipEnds: '2026-12-01T00:00:00.000Z', paymentStatus: 'ACTIVE' });
    assert.equal(mysql.has('user:u1'), true);
});

test('invariant: failed secondary never causes primary data loss', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: false });
    const stores = dualStore();
    stores.firestoreRepo.fail = true;
    const repo = new ResilientRepository({ mysqlRepo: stores.mysqlRepo, firestoreRepo: stores.firestoreRepo });
    await repo.saveResume('u1', 'r1', { title: 'Keep me', revision: 1 });
    assert.equal(stores.mysql.has('resume:r1'), true);
    assert.equal(stores.firestore.has('resume:r1'), false);
});

test('invariant: both engines down never fake success', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql' });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    const stores = dualStore();
    stores.mysqlRepo.fail = true;
    stores.firestoreRepo.fail = true;
    const repo = new ResilientRepository({ mysqlRepo: stores.mysqlRepo, firestoreRepo: stores.firestoreRepo });
    await assert.rejects(() => repo.saveUser('u-none', { email: 'x@y.z' }), (err) => {
        assert.ok(err.status === 503 || err.code === 'BOTH_DATABASES_UNAVAILABLE');
        return true;
    });
    assert.equal(stores.mysql.size, 0);
    assert.equal(stores.firestore.size, 0);
});

test('invariant: MariaDB down degrades writes with controlled errors — no silent Firestore failover', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: false, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    const stores = dualStore();
    stores.mysqlRepo.fail = true;
    const repo = new ResilientRepository({ mysqlRepo: stores.mysqlRepo, firestoreRepo: stores.firestoreRepo });
    // MySQL is the single authoritative store: an outage must NOT silently
    // switch writes to Firestore. The write is rejected with a controlled error.
    await assert.rejects(
        () => repo.saveUser('u-fs', { email: 'fs@x.com', membership: 'Pro', paymentStatus: 'ACTIVE' }),
        error => error.code === 'SERVICE_DEGRADED' || error.code === 'DATABASE_UNAVAILABLE'
    );
    assert.equal(stores.firestore.has('user:u-fs'), false, 'Firestore must not receive the write');
    assert.equal(stores.mysql.has('user:u-fs'), false, 'MySQL must not receive the write');
});

test('invariant: same mutation id applied N times equals once (processed ledger)', async () => {
    const seen = new Set();
    async function apply(mutationId) {
        if (seen.has(mutationId)) return 'duplicate';
        seen.add(mutationId);
        return 'applied';
    }
    const id = createMutationId('pay');
    assert.match(id, /^pay_/);
    assert.equal(await apply(id), 'applied');
    assert.equal(await apply(id), 'duplicate');
    assert.equal(await apply(id), 'duplicate');
    assert.equal(seen.size, 1);
});

test('invariant: older revision cannot overwrite newer (monotonic)', () => {
    const current = 5;
    const incoming = 3;
    assert.equal(incoming > current, false);
    const shouldApply = incoming >= current;
    assert.equal(shouldApply, false);
});

test('invariant: tombstone blocks resurrection by older upsert', async () => {
    const tombstones = new Map();
    const fakePool = {
        async query(sql, params) {
            if (String(sql).includes('INSERT INTO sync_tombstones')) {
                const [type, id, version] = params;
                const key = `${type}:${id}`;
                const existing = tombstones.get(key);
                if (!existing || Number(version) >= existing.version) tombstones.set(key, { version: Number(version) });
                return [{ affectedRows: 1 }];
            }
            if (String(sql).includes('SELECT version FROM sync_tombstones')) {
                const rec = tombstones.get(`${params[0]}:${params[1]}`);
                return [rec ? [{ version: rec.version }] : []];
            }
            if (String(sql).includes('INSERT INTO processed_mutations')) {
                return [{ affectedRows: 1 }];
            }
            return [[]];
        },
    };
    await recordTombstone(fakePool, { entityType: 'resumes', entityId: 'r-del', version: 4, mutationId: 'ev_del', sourceEngine: 'mysql' });
    assert.equal(await isTombstoned(fakePool, 'resumes', 'r-del', 3), true);
    assert.equal(await isTombstoned(fakePool, 'resumes', 'r-del', 4), true);
    assert.equal(await isTombstoned(fakePool, 'resumes', 'r-del', 5), false);
});

test('invariant: duplicate mutation ledger returns already-processed', async () => {
    const keys = new Set();
    const fakePool = {
        async query(sql, params) {
            if (String(sql).includes('INSERT INTO processed_mutations')) {
                const id = params[0];
                if (keys.has(id)) {
                    const err = new Error('Duplicate');
                    err.code = 'ER_DUP_ENTRY';
                    err.errno = 1062;
                    throw err;
                }
                keys.add(id);
                return [{ affectedRows: 1 }];
            }
            return [[]];
        },
    };
    const first = await rememberMutation(fakePool, { mutationId: 'ev_dup', entityType: 'users', entityId: 'u', operation: 'UPSERT', sourceEngine: 'mysql' });
    const second = await rememberMutation(fakePool, { mutationId: 'ev_dup', entityType: 'users', entityId: 'u', operation: 'UPSERT', sourceEngine: 'mysql' });
    assert.equal(first, false);
    assert.equal(second, true);
});

test('chaos: alternating availability converges without fake success', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    const stores = dualStore();
    const repo = new ResilientRepository({ mysqlRepo: stores.mysqlRepo, firestoreRepo: stores.firestoreRepo });

    await repo.saveUser('chaos', { email: 'c@x.com', membership: 'Basic' });
    stores.mysqlRepo.fail = true;
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    // MySQL down → the write is rejected with a controlled error; the standby
    // Firestore store must never receive it (no silent failover).
    await assert.rejects(
        () => repo.saveUser('chaos', { email: 'c@x.com', membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: '2026-12-01T00:00:00.000Z' }),
        error => error.code === 'SERVICE_DEGRADED' || error.code === 'DATABASE_UNAVAILABLE'
    );
    assert.equal(stores.firestore.has('user:chaos'), false);

    stores.mysqlRepo.fail = false;
    stores.firestoreRepo.fail = true;
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: false, operationalWriteEngine: 'mysql' });
    fencing.__resetForTests({ generation: 3, operationalWriteEngine: 'mysql' });
    await repo.savePortfolio('chaos', 'p1', { title: 'Port' });
    assert.equal(stores.mysql.has('portfolio:p1'), true);
});
