'use strict';

/**
 * Database authority tests — MySQL/MariaDB authoritative architecture.
 *
 * ARCHITECTURE UNDER TEST:
 *  - MySQL is the ONLY synchronous store; Firestore is never a read/write
 *    fallback on the production path.
 *  - Automatic failover to Firestore is OFF by default (DB_AUTO_FAILOVER and
 *    ALLOW_FIRESTORE_FAILOVER both default to false). A MySQL outage degrades
 *    writes with controlled errors instead of silently switching the source
 *    of truth.
 *  - When an operator explicitly enables ALLOW_FIRESTORE_FAILOVER=true the
 *    standby path may be used; the recovery/conflict semantics below still
 *    apply to that opt-in configuration.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const authority = require('../database/authority');

test('authority starts in NORMAL with mysql as default primary', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    const status = authority.getStatus();
    assert.equal(status.configuredPrimary, 'mysql');
    assert.equal(status.configuredSecondary, 'firestore');
    assert.equal(status.operationalWriteEngine, 'mysql');
    assert.equal(status.canAcceptWrites, true);
    // Synchronous reads are MySQL-only: Firestore is excluded from the read
    // order unless an operator explicitly enables standby failover.
    assert.deepEqual(status.readOrder, ['mysql']);
});

test('consecutive MariaDB failures degrade writes — NO silent failover to Firestore', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
    authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
    const status = authority.getStatus();
    // The authoritative store stays MySQL; writes are rejected, not rerouted.
    assert.equal(status.operationalWriteEngine, 'mysql');
    assert.equal(status.canAcceptWrites, false);
    assert.equal(status.metrics.failovers, 0, 'no automatic failover without operator approval');
    assert.equal(status.mode, 'MARIADB_DEGRADED');
});

test('Firestore-only outage keeps MariaDB as write authority', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    authority.recordFailure('firestore', 'read', new Error('UNAVAILABLE'));
    authority.recordFailure('firestore', 'read', new Error('UNAVAILABLE'));
    const status = authority.getStatus();
    assert.equal(status.operationalWriteEngine, 'mysql');
    assert.equal(status.canAcceptWrites, true);
    assert.equal(status.mode, 'FIRESTORE_DEGRADED');
});

test('both engines down reject writes (no fake success)', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql' });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    const status = authority.getStatus();
    assert.equal(status.mode, 'BOTH_UNAVAILABLE');
    assert.equal(status.canAcceptWrites, false);
});

test('recovery restores primary from a degraded state without Firestore', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    assert.equal(authority.getWriteEngine(), 'mysql');
    authority.recordSuccess('mysql', 'probe');
    authority.recordSuccess('mysql', 'probe');
    const recovered = authority.completeRecovery({ conflicts: 0 });
    assert.equal(recovered.operationalWriteEngine, 'mysql');
    assert.equal(recovered.mode, 'RECOVERED');
    assert.equal(recovered.metrics.recoveries >= 1, true);
});

test('conflicts during an operator-approved standby recovery do not blindly overwrite', () => {
    // Standby-failover semantics apply only when an operator explicitly
    // enables ALLOW_FIRESTORE_FAILOVER (opt-in; off by default).
    const previous = process.env.ALLOW_FIRESTORE_FAILOVER;
    process.env.ALLOW_FIRESTORE_FAILOVER = 'true';
    try {
        // Re-read the module flag (module reads env at load; emulate by resetting
        // the module's memoized decision via a fresh require cache entry).
        delete require.cache[require.resolve('../database/authority')];
        const authorityOptedIn = require('../database/authority');
        authorityOptedIn.__resetForTests({ configuredPrimary: 'mysql', operationalWriteEngine: 'firestore', mode: 'RECONCILING', mysqlHealthy: true, firestoreHealthy: true });
        const result = authorityOptedIn.completeRecovery({ conflicts: 2 });
        assert.equal(result.mode, 'CONFLICT_DETECTED');
        assert.equal(result.operationalWriteEngine, 'firestore');
    } finally {
        process.env.ALLOW_FIRESTORE_FAILOVER = previous || '';
        delete require.cache[require.resolve('../database/authority')];
        require('../database/authority');
    }
});
