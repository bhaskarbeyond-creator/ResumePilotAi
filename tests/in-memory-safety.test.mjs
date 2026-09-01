/**
 * Regression Suite: In-Memory Repository Production Safety & Fail-Closed Invariants
 * 
 * Invariants Proven:
 * 1. HARD FAIL-CLOSED: In production (NODE_ENV === 'production'), InMemoryRepository
 *    is NEVER selected, regardless of any environment variables.
 * 2. Database outages throw HTTP 503 (DATABASE_UNAVAILABLE / SERVICE_DEGRADED).
 * 3. MariaDB is the sole authoritative store; zero silent fallback to in-memory.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('In-Memory Safety 1: Production hard fail-closed prevents in-memory repository selection', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalFlag = process.env.IN_MEMORY_REPOSITORY;
    const originalDegraded = process.env.DEGRADED_MODE_REPOSITORY;

    try {
        process.env.NODE_ENV = 'production';
        process.env.IN_MEMORY_REPOSITORY = '1';
        process.env.DEGRADED_MODE_REPOSITORY = 'inmemory';

        // Re-require backend/repositories/index.js
        const { getRepository, resetRepositoryCacheForTests } = await import(`../backend/repositories/index.js?t=${Date.now()}`);
        resetRepositoryCacheForTests();

        const repo = getRepository();

        assert.notEqual(repo.constructor.name, 'InMemoryRepository', 'Production MUST NEVER select InMemoryRepository');
        assert.equal(repo.constructor.name, 'ResilientRepository', 'Production MUST select ResilientRepository');
    } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalFlag === undefined) delete process.env.IN_MEMORY_REPOSITORY; else process.env.IN_MEMORY_REPOSITORY = originalFlag;
        if (originalDegraded === undefined) delete process.env.DEGRADED_MODE_REPOSITORY; else process.env.DEGRADED_MODE_REPOSITORY = originalDegraded;
    }
});

test('In-Memory Safety 2: ResilientRepository fails closed with 503 when MariaDB is unavailable', async () => {
    const ResilientRepository = (await import('../backend/repositories/ResilientRepository.js')).default || (await import('../backend/repositories/ResilientRepository.js'));

    const failingMysqlRepo = {
        getUser: async () => {
            const err = new Error('connect ECONNREFUSED 127.0.0.1:3306');
            err.code = 'ECONNREFUSED';
            throw err;
        },
        saveUser: async () => {
            const err = new Error('PROTOCOL_CONNECTION_LOST');
            err.code = 'PROTOCOL_CONNECTION_LOST';
            throw err;
        }
    };

    const resilientRepo = new ResilientRepository({ mysqlRepo: failingMysqlRepo });

    // Read failure must throw 503
    await assert.rejects(
        async () => {
            await resilientRepo.getUser('test_user_id');
        },
        err => {
            assert.equal(err.status, 503, 'Read failure must surface HTTP 503');
            assert.ok(err.code === 'DATABASE_UNAVAILABLE' || err.code === 'ECONNREFUSED', 'Error code must reflect DB outage');
            return true;
        },
        'ResilientRepository must throw 503 on database read outage'
    );

    // Write failure must throw 503
    await assert.rejects(
        async () => {
            await resilientRepo.saveUser('test_user_id', { email: 'test@example.com' });
        },
        err => {
            assert.equal(err.status, 503, 'Write failure must surface HTTP 503');
            return true;
        },
        'ResilientRepository must throw 503 on database write outage'
    );
});
