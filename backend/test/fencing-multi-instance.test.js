'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fencing = require('../database/fencing');
const authority = require('../database/authority');

test('CAS generation bump: only one of three workers wins a competing failover', () => {
    const shared = {
        generation: 1,
        operationalWriteEngine: 'mysql',
        mode: 'NORMAL',
        leaseOwner: null,
        leaseExpiresAt: 0,
        lastReason: null,
        updatedAt: new Date().toISOString(),
    };
    fencing.__useSharedStore(shared);

    const results = ['A', 'B', 'C'].map((id) => fencing.bumpGeneration({
        reason: 'primary_down',
        writeEngine: 'firestore',
        expectedGeneration: 1,
        mode: 'MARIADB_FAILED_OVER',
        instanceId: id,
    }));
    const winners = results.filter((r) => r.won);
    const losers = results.filter((r) => !r.won);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 2);
    assert.equal(shared.generation, 2);
    assert.equal(shared.operationalWriteEngine, 'firestore');
});

test('stale fence generation is rejected', () => {
    fencing.__resetForTests({ generation: 5 });
    assert.equal(fencing.assertFence(5), 5);
    assert.throws(() => fencing.assertFence(4), (err) => err.code === 'STALE_FENCE_GENERATION');
});

test('lease prevents a second instance from taking write authority while fresh', () => {
    fencing.__resetForTests({ generation: 1 });
    const first = fencing.acquireLease('worker-a', 1_000_000);
    assert.equal(first.acquired, true);
    const second = fencing.acquireLease('worker-b', 1_000_000);
    assert.equal(second.acquired, false);
    assert.equal(second.owner, 'worker-a');
    const afterExpiry = fencing.acquireLease('worker-b', 1_000_000 + fencing.LEASE_TTL_MS + 1);
    assert.equal(afterExpiry.acquired, true);
});

test('authority degrades without failover by default — MySQL stays authoritative', () => {
    fencing.__resetForTests({ generation: 1, operationalWriteEngine: 'mysql' });
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
    authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
    const status = authority.getStatus();
    // Default configuration: no automatic failover to Firestore.
    assert.equal(status.operationalWriteEngine, 'mysql');
    assert.equal(status.canAcceptWrites, false);
    assert.equal(status.metrics.failovers, 0);
});

test('recovery bump restores primary write engine on a new generation', () => {
    fencing.__resetForTests({ generation: 4, operationalWriteEngine: 'firestore' });
    authority.__resetForTests({
        configuredPrimary: 'mysql',
        operationalWriteEngine: 'firestore',
        mode: 'RECONCILING',
        mysqlHealthy: true,
        firestoreHealthy: true,
    });
    const recovered = authority.completeRecovery({ conflicts: 0 });
    assert.equal(recovered.operationalWriteEngine, 'mysql');
    assert.equal(recovered.mode, 'RECOVERED');
    assert.ok(fencing.currentGeneration() >= 5);
});

test('conflicts during an operator-approved standby recovery do not restore primary (no silent overwrite)', () => {
    fencing.__resetForTests({ generation: 7, operationalWriteEngine: 'firestore' });
    const previous = process.env.ALLOW_FIRESTORE_FAILOVER;
    process.env.ALLOW_FIRESTORE_FAILOVER = 'true';
    try {
        delete require.cache[require.resolve('../database/authority')];
        const authorityOptedIn = require('../database/authority');
        authorityOptedIn.__resetForTests({
            configuredPrimary: 'mysql',
            operationalWriteEngine: 'firestore',
            mode: 'RECONCILING',
            mysqlHealthy: true,
            firestoreHealthy: true,
        });
        const result = authorityOptedIn.completeRecovery({ conflicts: 3 });
        assert.equal(result.mode, 'CONFLICT_DETECTED');
        assert.equal(result.operationalWriteEngine, 'firestore');
    } finally {
        process.env.ALLOW_FIRESTORE_FAILOVER = previous || '';
        delete require.cache[require.resolve('../database/authority')];
        require('../database/authority');
    }
});

test.after(async () => {
    try {
        const { getPool } = require('../database/mysql');
        await getPool().end();
    } catch (_) {}
});
