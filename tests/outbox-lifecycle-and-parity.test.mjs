import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pruneSyncedOutboxEvents, pruneFirestoreOutboxEvents, computeContinuousParity } from '../backend/database/syncManager.js';

describe('🛡️ Outbox Lifecycle Management & Continuous Parity Auditor Test Suite', () => {

    it('1. pruneSyncedOutboxEvents deletes only SYNCED records older than retention threshold and preserves active records', async () => {
        const deletedQueries = [];
        const mockPool = {
            query: async (sql, params) => {
                deletedQueries.push({ sql, params });
                return [{ affectedRows: 42 }];
            }
        };

        const res = await pruneSyncedOutboxEvents(14, 500, mockPool);

        assert.equal(res.prunedCount, 42);
        assert.equal(res.retentionDays, 14);
        assert.equal(deletedQueries.length, 1);
        assert.match(deletedQueries[0].sql, /WHERE status = 'SYNCED'/i);
        assert.match(deletedQueries[0].sql, /INTERVAL \? DAY/i);
        assert.deepEqual(deletedQueries[0].params, [14, 500]);
    });

    it('2. pruneSyncedOutboxEvents enforces bounded parameters safely', async () => {
        const deletedQueries = [];
        const mockPool = {
            query: async (sql, params) => {
                deletedQueries.push({ sql, params });
                return [{ affectedRows: 0 }];
            }
        };

        // Pass invalid / negative parameters
        const res = await pruneSyncedOutboxEvents(-5, 99999, mockPool);

        assert.equal(res.retentionDays, 1); // Minimum bounded to 1 day
        assert.equal(deletedQueries[0].params[0], 1);
        assert.equal(deletedQueries[0].params[1], 5000); // Maximum batch bounded to 5000
    });

    it('3. pruneFirestoreOutboxEvents cleans up old SYNCED documents in Firestore batch', async () => {
        const deletedDocRefs = [];
        const mockDocs = [
            { ref: { id: 'doc1' } },
            { ref: { id: 'doc2' } },
            { ref: { id: 'doc3' } },
        ];

        const mockFirestore = {
            Timestamp: {
                fromDate: (d) => ({ toDate: () => d, toMillis: () => d.getTime() })
            },
            collection: (colName) => {
                assert.equal(colName, 'sync_outbox_fs');
                return {
                    where: (_field, _op, _val) => ({
                        where: (_f2, _op2, _v2) => ({
                            limit: (_lim) => ({
                                get: async () => ({
                                    empty: false,
                                    docs: mockDocs
                                })
                            })
                        })
                    })
                };
            },
            batch: () => ({
                delete: (ref) => deletedDocRefs.push(ref.id),
                commit: async () => {}
            })
        };

        const res = await pruneFirestoreOutboxEvents(mockFirestore, 7, 100);

        assert.equal(res.prunedCount, 3);
        assert.equal(res.retentionDays, 7);
        assert.deepEqual(deletedDocRefs, ['doc1', 'doc2', 'doc3']);
    });

    it('4. computeContinuousParity checks all 13 canonical entities and reports 100% when counts match', async () => {
        const mockPool = {
            query: async (_sql) => {
                return [[{ c: 10 }], []]; // Return mysql2 [rows, fields] tuple
            }
        };

        const mockFirestore = {
            collection: (_colName) => ({
                get: async () => ({ docs: new Array(10).fill({}) }) // Return 10 docs
            }),
            collectionGroup: (_groupName) => ({
                get: async () => ({ docs: new Array(10).fill({}) }) // Return 10 docs
            })
        };

        const res = await computeContinuousParity(mockFirestore, mockPool);

        assert.equal(res.status, 'OPTIMAL');
        assert.equal(res.overallParityPercentage, 100);
        assert.equal(res.totalCheckedEntities, 13);
        assert.equal(res.divergentEntitiesCount, 0);
        assert.equal(res.entities.users.isSynchronized, true);
        assert.equal(res.entities.resumes.isSynchronized, true);
        assert.equal(res.entities.portfolios.isSynchronized, true);
        assert.equal(res.entities.covers.isSynchronized, true);
        assert.equal(res.entities.jobs.isSynchronized, true);
    });

    it('5. computeContinuousParity detects divergence and flags non-matching entity counts', async () => {
        const mockPool = {
            query: async (sql) => {
                if (sql.includes('resumes')) return [[{ c: 100 }], []]; // 100 in MySQL
                return [[{ c: 10 }], []];
            }
        };

        const mockFirestore = {
            collection: (_colName) => ({
                get: async () => ({ docs: new Array(10).fill({}) })
            }),
            collectionGroup: (groupName) => ({
                get: async () => {
                    if (groupName === 'resumes') return { docs: new Array(80).fill({}) }; // 80 in Firestore
                    return { docs: new Array(10).fill({}) };
                }
            })
        };

        const res = await computeContinuousParity(mockFirestore, mockPool);

        assert.equal(res.entities.resumes.mysqlCount, 100);
        assert.equal(res.entities.resumes.firestoreCount, 80);
        assert.equal(res.entities.resumes.difference, 20);
        assert.equal(res.entities.resumes.isSynchronized, false);
        assert.equal(res.divergentEntitiesCount, 1);
        assert.ok(res.overallParityPercentage < 100);
    });

    it('6. computeContinuousParity handles disconnected Firestore safely without throwing', async () => {
        const res = await computeContinuousParity(null);

        assert.equal(res.status, 'UNAVAILABLE');
        assert.equal(res.overallParityPercentage, 100);
        assert.ok(res.reason.includes('Firestore instance not connected'));
    });
});
