import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateContentHash, enqueueOutboxEvent, getSyncHealthStatus, processSyncQueue } from '../backend/database/syncManager.js';

describe('Intelligent Synchronization & Outbox Engine Test Suite', () => {

    it('1. calculateContentHash produces deterministic SHA-256 hash ignoring ephemeral timestamps', () => {
        const payload1 = {
            title: 'Staff Engineer',
            skills: ['React', 'Node.js'],
            created_at: '2026-08-25T10:00:00Z',
            updatedAt: '2026-08-25T10:05:00Z',
            revision: 2
        };

        const payload2 = {
            revision: 2,
            skills: ['React', 'Node.js'],
            title: 'Staff Engineer',
            created_at: '2026-08-25T11:00:00Z',
            updatedAt: '2026-08-25T11:30:00Z',
            lastPing: '2026-08-25T12:00:00Z'
        };

        const hash1 = calculateContentHash('resumes', payload1);
        const hash2 = calculateContentHash('resumes', payload2);

        assert.equal(typeof hash1, 'string');
        assert.equal(hash1.length, 64);
        assert.equal(hash1, hash2, 'Hashes must match regardless of key order or timestamp variations');
    });

    it('2. calculateContentHash detects actual content changes', () => {
        const payload1 = { title: 'Staff Engineer', skills: ['React'] };
        const payload2 = { title: 'Principal Engineer', skills: ['React'] };

        const hash1 = calculateContentHash('resumes', payload1);
        const hash2 = calculateContentHash('resumes', payload2);

        assert.notEqual(hash1, hash2, 'Hash must change when substantive fields change');
    });

    it('3. Outbox enqueuing formats valid replication event envelope', async () => {
        const mockConn = {
            query: async (sql, params) => {
                assert.ok(sql.includes('INSERT INTO sync_outbox'));
                assert.equal(params[1], 'resumes');
                assert.equal(params[2], 'res_123');
                assert.equal(params[3], 'UPSERT');
                assert.equal(params[5], 3);
                assert.equal(params[6], 'mysql');
                assert.equal(params[7].length, 64);
                return [{ insertId: 1 }];
            }
        };

        const result = await enqueueOutboxEvent(mockConn, {
            entityType: 'resumes',
            entityId: 'res_123',
            operation: 'UPSERT',
            payload: { title: 'Architect', revision: 3 },
            version: 3,
            sourceEngine: 'mysql'
        });

        assert.ok(result.eventId.startsWith('ev_'));
        assert.equal(result.contentHash.length, 64);
    });

    it('4. Sync health status reports active and standby roles accurately', async () => {
        const health = await getSyncHealthStatus();
        assert.ok(health.activeEngine === 'mysql' || health.activeEngine === 'firestore');
        assert.ok(health.standbyEngine === 'mysql' || health.standbyEngine === 'firestore');
        assert.notEqual(health.activeEngine, health.standbyEngine);
        assert.equal(health.syncMode, 'ACTIVE_PASSIVE');
        assert.equal(typeof health.isHealthy, 'boolean');
        assert.equal(typeof health.pendingCount, 'number');
    });

    it('5. processSyncQueue reclaims stale PROCESSING leases before selecting events', async () => {
        const executed = [];
        // Fake pool: records every statement; returns one stale PROCESSING row
        // that the reclaim must flip back to RETRYING before selection.
        const fakePool = {
            query: async (sql, _params) => {
                executed.push(String(sql).replace(/\s+/g, ' ').trim());
                if (sql.includes("UPDATE sync_outbox") && sql.includes("stale PROCESSING lease")) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes("SELECT * FROM sync_outbox")) {
                    return [[{ id: 'ev_stuck', status: 'RETRYING', retry_count: 0, max_retries: 5, source_engine: 'mysql', entity_type: 'resumes', entity_id: 'res_1', operation: 'UPSERT', payload: JSON.stringify({ user_id: 'u1', revision: 1 }), version: 1 }]];
                }
                if (sql.includes("SET status = 'SYNCED'")) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }
        };
        const fakeFirestore = {
            collection: () => ({ doc: makeFakeDoc }),
        };
        function makeFakeDoc() {
            return {
                get: async () => ({ exists: false }),
                set: async () => ({}),
                delete: async () => ({}),
                collection: () => ({ doc: makeFakeDoc }),
            };
        }
        const result = await processSyncQueue(10, fakeFirestore, fakePool);
        const reclaim = executed.find(s => s.includes('stale PROCESSING lease'));
        assert.ok(reclaim, 'a stale-lease reclaim statement must run before event selection');
        assert.ok(reclaim.includes("INTERVAL 120 SECOND"), 'reclaim threshold is bounded');
        assert.ok(executed.indexOf(reclaim) < executed.findIndex(s => s.includes('SELECT * FROM sync_outbox')), 'reclaim runs before selection');
        assert.equal(result.processed, 1, 'the reclaimed event is processed');
    });

    it('6. processSyncQueue retries and dead-letters failing events with backoff', async () => {
        const fakePool = {
            query: async (sql) => {
                if (sql.includes("SELECT * FROM sync_outbox")) {
                    return [[{ id: 'ev_bad', status: 'PENDING', retry_count: 4, max_retries: 5, source_engine: 'mysql', entity_type: 'resumes', entity_id: 'res_1', operation: 'UPSERT', payload: JSON.stringify({ revision: 1 }), version: 1 }]];
                }
                if (sql.includes("SET status = 'DEAD_LETTER'")) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes("SET status = 'RETRYING'")) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            },
        };
        // Firestore without user_id → replicateToFirestore throws (missing user_id).
        const result = await processSyncQueue(10, { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }), set: async () => ({}), delete: async () => ({}) }) }) }, fakePool);
        assert.equal(result.processed, 0);
        assert.equal(result.deadLettered, 1, 'an event at max retries transitions to DEAD_LETTER');
    });

    after(async () => {
        try {
            const { getPool } = await import('../backend/database/mysql.js');
            await getPool().end();
        } catch (_) {}
    });
});
