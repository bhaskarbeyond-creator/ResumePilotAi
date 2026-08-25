import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import FirestoreRepository from '../backend/repositories/FirestoreRepository.js';
import { processFirestoreOutbox, replicateToMySQL } from '../backend/database/syncManager.js';
import { MemoryFirestore, HarnessTimestamp } from '../backend/test/helpers/memoryFirestore.js';

/**
 * Reverse-replication (Firestore → MySQL standby) test suite.
 *
 * Repository-mediated writes in Firestore-active mode must atomically commit
 * a durable outbox event (sync_outbox_fs) alongside the data. The background
 * worker drains those events into MySQL with claim semantics, retry with
 * exponential backoff, dead-lettering, and stale-lease recovery.
 */

// Minimal raw Firestore mock (mirrors the parity-test mock, with unique auto ids).
function buildRawFirestoreMock() {
    const storage = new Map();
    let autoId = 0;
    const makeDoc = (fullPath) => ({
        id: fullPath.split('/').pop(),
        get: async () => {
            const data = storage.get(fullPath);
            return { exists: data !== undefined, id: fullPath.split('/').pop(), data: () => data };
        },
        set: async (val, opts = {}) => {
            const prev = storage.get(fullPath) || {};
            storage.set(fullPath, opts.merge ? { ...prev, ...val } : val);
            return makeDoc(fullPath);
        },
        delete: async () => { storage.delete(fullPath); return true; },
        collection: (subCol) => makeCollection(`${fullPath}/${subCol}`),
    });
    const makeCollection = (colName) => ({
        doc: (docId) => makeDoc(`${colName}/${docId === undefined ? `auto_${++autoId}` : docId}`),
        get: async () => {
            const docs = [];
            for (const [k, v] of storage.entries()) {
                if (k.startsWith(`${colName}/`) && !k.slice(colName.length + 1).includes('/')) {
                    docs.push({ id: k.split('/').pop(), ref: makeDoc(k), data: () => v });
                }
            }
            return { docs, empty: docs.length === 0 };
        },
    });
    const db = {
        collection: makeCollection,
        runTransaction: async (cb) => {
            const tx = {
                get: async (ref) => ref.get(),
                set: async (ref, val, opts) => ref.set(val, opts),
                delete: async (ref) => ref.delete(),
            };
            return await cb(tx);
        },
        batch: () => {
            const ops = [];
            return {
                delete: (ref) => ops.push(() => ref.delete()),
                set: (ref, val, opts) => ops.push(() => ref.set(val, opts)),
                commit: async () => { for (const op of ops) await op(); },
            };
        },
    };
    db.__storage = storage;
    return db;
}

async function outboxEvents(storage) {
    const events = [];
    for (const [path, data] of storage.entries()) {
        if (path.startsWith('sync_outbox_fs/')) events.push({ path, data });
    }
    return events;
}

describe('Firestore reverse-outbox (Firestore → MySQL standby)', () => {

    it('1. saveResume commits a durable reverse-sync event atomically with the resume', async () => {
        const db = buildRawFirestoreMock();
        const repo = new FirestoreRepository(db);
        await repo.saveResume('user-1', 'res-1', { title: 'Staff Engineer', skills: ['JS'] });
        const events = await outboxEvents(db.__storage);
        assert.equal(events.length, 1, 'exactly one reverse-sync event is committed');
        const event = events[0].data;
        assert.equal(event.entityType, 'resumes');
        assert.equal(event.entityId, 'res-1');
        assert.equal(event.operation, 'UPSERT');
        assert.equal(event.status, 'PENDING');
        assert.equal(event.payload.user_id, 'user-1');
        assert.equal(event.payload.revision, 1);
        assert.equal(event.payload.title, 'Staff Engineer');
        assert.equal(event.version, 1);
        assert.equal(typeof event.contentHash, 'string');
        assert.equal(event.contentHash.length, 64);
    });

    it('2. deleteResume commits a DELETE reverse-sync event', async () => {
        const db = buildRawFirestoreMock();
        const repo = new FirestoreRepository(db);
        await repo.saveResume('user-1', 'res-1', { title: 'X' });
        await repo.deleteResume('user-1', 'res-1');
        const events = await outboxEvents(db.__storage);
        assert.equal(events.length, 2);
        const deleteEvent = events.map(e => e.data).find(e => e.operation === 'DELETE');
        assert.ok(deleteEvent, 'a DELETE event is committed');
        assert.equal(deleteEvent.entityType, 'resumes');
        assert.equal(deleteEvent.payload.user_id, 'user-1');
    });

    it('3. user, portfolio, and cover writes enqueue reverse-sync events', async () => {
        const db = buildRawFirestoreMock();
        const repo = new FirestoreRepository(db);
        await repo.saveUser('user-1', { email: 'a@b.c', displayName: 'A B' });
        await repo.savePortfolio('user-1', 'port-1', { title: 'My Portfolio', theme: 'modern' });
        await repo.saveCover('user-1', 'cover-1', { title: 'Cover', template: 'Cover1' });
        const events = (await outboxEvents(db.__storage)).map(e => e.data);
        assert.deepEqual(events.map(e => e.entityType).sort(), ['covers', 'portfolios', 'users']);
        assert.ok(events.every(e => e.status === 'PENDING'));
        const portfolio = events.find(e => e.entityType === 'portfolios');
        assert.equal(portfolio.payload.user_id, 'user-1');
    });

    it('4. processFirestoreOutbox claims a PENDING event, replicates it, and marks it SYNCED', async () => {
        const db = new MemoryFirestore();
        await db.collection('sync_outbox_fs').doc('ev-1').set({
            entityType: 'resumes',
            entityId: 'res-9',
            operation: 'UPSERT',
            payload: { id: 'res-9', user_id: 'user-9', title: 'Synced Resume', revision: 2 },
            version: 2,
            status: 'PENDING',
            attemptCount: 0,
            createdAt: HarnessTimestamp.fromMillis(Date.now() - 5000),
        });
        const statements = [];
        const fakePool = {
            query: async (sql, params) => {
                statements.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
                if (statements.length === 1) {
                    // Monotonic revision guard SELECT: MySQL is behind (revision 1).
                    return [[{ revision: 1 }]];
                }
                return [{ affectedRows: 1 }];
            },
        };
        const result = await processFirestoreOutbox(db, 10, fakePool);
        assert.equal(result.processed, 1);
        assert.equal(result.failed, 0);
        const event = (await db.collection('sync_outbox_fs').doc('ev-1').get()).data();
        assert.equal(event.status, 'SYNCED');
        assert.equal(event.attemptCount, 1);
        const upsert = statements.find(s => s.sql.includes('INSERT INTO resumes'));
        assert.ok(upsert, 'the event is replicated to MySQL');
        assert.equal(upsert.params[0], 'res-9');
        assert.equal(upsert.params[1], 'user-9');
        // Idempotency: a drained event is not picked up again.
        const secondRun = await processFirestoreOutbox(db, 10, fakePool);
        assert.equal(secondRun.processed, 0);
    });

    it('5. replicateToMySQL handles portfolio and cover upserts and deletes', async () => {
        const statements = [];
        const fakePool = {
            query: async (sql, params) => {
                statements.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
                return [{ affectedRows: 1 }];
            },
        };
        await replicateToMySQL({ entity_type: 'portfolios', entity_id: 'p1', operation: 'UPSERT', payload: JSON.stringify({ id: 'p1', user_id: 'u1', title: 'Port', theme: 'dark', isPublished: true }), version: 1 }, fakePool);
        await replicateToMySQL({ entity_type: 'covers', entity_id: 'c1', operation: 'UPSERT', payload: JSON.stringify({ id: 'c1', user_id: 'u1', title: 'Cov', template: 'Cover2' }), version: 1 }, fakePool);
        await replicateToMySQL({ entity_type: 'portfolios', entity_id: 'p1', operation: 'DELETE', payload: JSON.stringify({ user_id: 'u1' }), version: 1 }, fakePool);

        const portfolioUpsert = statements.find(s => s.sql.includes('INSERT INTO portfolios'));
        assert.ok(portfolioUpsert, 'portfolio upsert is issued');
        assert.equal(portfolioUpsert.params[1], 'u1');
        assert.equal(portfolioUpsert.params[3], 'dark');
        assert.equal(portfolioUpsert.params[4], 1);
        const coverUpsert = statements.find(s => s.sql.includes('INSERT INTO covers'));
        assert.ok(coverUpsert, 'cover upsert is issued');
        assert.equal(coverUpsert.params[3], 'Cover2');
        const portfolioDelete = statements.find(s => s.sql.startsWith('DELETE FROM portfolios'));
        assert.ok(portfolioDelete, 'portfolio delete is issued');
        // A portfolio upsert without user_id must fail loudly, not silently skip.
        await assert.rejects(
            () => replicateToMySQL({ entity_type: 'portfolios', entity_id: 'p2', operation: 'UPSERT', payload: JSON.stringify({ id: 'p2' }), version: 1 }, fakePool),
            /Missing user_id/,
        );
    });

    it('6. failing events retry with backoff and dead-letter after five attempts', async () => {
        const db = new MemoryFirestore();
        await db.collection('sync_outbox_fs').doc('ev-fail').set({
            entityType: 'portfolios',
            entityId: 'p-no-user',
            operation: 'UPSERT',
            payload: { id: 'p-no-user' }, // missing user_id → replication error
            version: 1,
            status: 'PENDING',
            attemptCount: 0,
            createdAt: HarnessTimestamp.fromMillis(Date.now() - 5000),
        });
        const fakePool = { query: async () => [[]] };

        let result = await processFirestoreOutbox(db, 10, fakePool);
        assert.equal(result.failed, 1);
        let event = (await db.collection('sync_outbox_fs').doc('ev-fail').get()).data();
        assert.equal(event.status, 'RETRYING');
        assert.equal(event.attemptCount, 1);
        assert.ok(event.nextAttemptAt.toMillis() > Date.now(), 'backoff delays the next attempt');
        assert.match(event.lastError, /Missing user_id/);

        // Simulate attempts 2-5 by clearing the backoff timestamp each time.
        for (let attempt = 2; attempt <= 5; attempt += 1) {
            await db.collection('sync_outbox_fs').doc('ev-fail').set({ nextAttemptAt: HarnessTimestamp.fromMillis(0) }, { merge: true });
            result = await processFirestoreOutbox(db, 10, fakePool);
        }
        event = (await db.collection('sync_outbox_fs').doc('ev-fail').get()).data();
        assert.equal(event.status, 'DEAD_LETTER', 'after five attempts the event dead-letters');
        assert.equal(result.deadLettered, 1);
    });

    it('7. a fresh PROCESSING lease is respected; a stale lease is reclaimed', async () => {
        const db = new MemoryFirestore();
        // Fresh lease: another worker claimed this 10 seconds ago.
        await db.collection('sync_outbox_fs').doc('ev-fresh').set({
            entityType: 'users', entityId: 'u1', operation: 'UPSERT',
            payload: { id: 'u1', email: 'a@b.c' }, version: 1,
            status: 'PROCESSING', attemptCount: 1,
            claimedAt: HarnessTimestamp.fromMillis(Date.now() - 10_000),
            createdAt: HarnessTimestamp.fromMillis(Date.now() - 60_000),
        });
        // Stale lease: a worker crashed five minutes ago mid-flight.
        await db.collection('sync_outbox_fs').doc('ev-stale').set({
            entityType: 'users', entityId: 'u2', operation: 'UPSERT',
            payload: { id: 'u2', email: 'c@d.e' }, version: 1,
            status: 'PROCESSING', attemptCount: 1,
            claimedAt: HarnessTimestamp.fromMillis(Date.now() - 300_000),
            createdAt: HarnessTimestamp.fromMillis(Date.now() - 400_000),
        });
        const fakePool = { query: async () => [[{ revision: 0 }]] };
        const result = await processFirestoreOutbox(db, 10, fakePool);
        assert.equal(result.processed, 1, 'only the stale-lease event is reclaimed');
        const fresh = (await db.collection('sync_outbox_fs').doc('ev-fresh').get()).data();
        assert.equal(fresh.status, 'PROCESSING', 'the fresh lease is left to its owner');
        assert.equal(fresh.attemptCount, 1);
        const stale = (await db.collection('sync_outbox_fs').doc('ev-stale').get()).data();
        assert.equal(stale.status, 'SYNCED', 'the stale lease is reclaimed and completed');
    });
});
