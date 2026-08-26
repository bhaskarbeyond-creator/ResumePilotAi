'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recordTombstone, isTombstoned, rememberMutation } = require('../database/tombstones');
const { createMutationId, calculateContentHash } = require('../database/canonical');

function memoryPool(store = { tombstones: new Map(), mutations: new Map() }) {
    return {
        store,
        async query(sql, params = []) {
            const s = String(sql);
            if (s.includes('INSERT INTO sync_tombstones')) {
                const [entityType, entityId, version, mutationId, sourceEngine] = params;
                const key = `${entityType}:${entityId}`;
                const existing = store.tombstones.get(key);
                if (!existing || Number(version) >= Number(existing.version)) {
                    store.tombstones.set(key, { version, mutationId, sourceEngine });
                }
                return [{ affectedRows: 1 }];
            }
            if (s.includes('SELECT version FROM sync_tombstones')) {
                const [entityType, entityId] = params;
                const row = store.tombstones.get(`${entityType}:${entityId}`);
                return [row ? [{ version: row.version }] : []];
            }
            if (s.includes('INSERT INTO processed_mutations')) {
                const [mutationId] = params;
                if (store.mutations.has(mutationId)) {
                    const err = new Error('Duplicate');
                    err.code = 'ER_DUP_ENTRY';
                    err.errno = 1062;
                    throw err;
                }
                store.mutations.set(mutationId, params);
                return [{ affectedRows: 1 }];
            }
            return [[]];
        },
    };
}

test('tombstone prevents recreation at the same or lower version', async () => {
    const pool = memoryPool();
    await recordTombstone(pool, { entityType: 'resumes', entityId: 'r1', version: 4, mutationId: 'ev_del', sourceEngine: 'mysql' });
    assert.equal(await isTombstoned(pool, 'resumes', 'r1', 3), true);
    assert.equal(await isTombstoned(pool, 'resumes', 'r1', 4), true);
    assert.equal(await isTombstoned(pool, 'resumes', 'r1', 5), false);
});

test('processed mutation ledger is idempotent', async () => {
    const pool = memoryPool();
    const id = createMutationId('ev');
    const first = await rememberMutation(pool, { mutationId: id, entityType: 'users', entityId: 'u1', operation: 'UPSERT', sourceEngine: 'mysql' });
    const second = await rememberMutation(pool, { mutationId: id, entityType: 'users', entityId: 'u1', operation: 'UPSERT', sourceEngine: 'mysql' });
    assert.equal(first, false);
    assert.equal(second, true);
});

test('mutation IDs remain unique across retries', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createMutationId('ev')));
    assert.equal(ids.size, 50);
});
