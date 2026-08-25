import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
    calculateContentHash, 
    enqueueOutboxEvent, 
    getSyncHealthStatus 
} from '../backend/database/syncManager.js';

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
});
