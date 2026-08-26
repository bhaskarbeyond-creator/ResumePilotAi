'use strict';

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
    assert.deepEqual(status.readOrder, ['mysql', 'firestore']);
});

test('consecutive MariaDB failures fail over writes to Firestore', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
    authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
    const status = authority.getStatus();
    assert.equal(status.operationalWriteEngine, 'firestore');
    assert.ok(['MARIADB_FAILED_OVER', 'MARIADB_DEGRADED'].includes(status.mode));
    assert.equal(status.metrics.failovers >= 1, true);
    assert.equal(status.readOrder[0], 'firestore');
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

test('recovery enters RECONCILING then restores primary after completeRecovery', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    assert.equal(authority.getWriteEngine(), 'firestore');
    authority.recordSuccess('mysql', 'probe');
    authority.recordSuccess('mysql', 'probe');
    assert.equal(authority.getStatus().mode, 'RECONCILING');
    const recovered = authority.completeRecovery({ conflicts: 0 });
    assert.equal(recovered.operationalWriteEngine, 'mysql');
    assert.equal(recovered.mode, 'RECOVERED');
    assert.equal(recovered.metrics.recoveries >= 1, true);
});

test('conflicts during recovery do not blindly overwrite', () => {
    authority.__resetForTests({ configuredPrimary: 'mysql', operationalWriteEngine: 'firestore', mode: 'RECONCILING', mysqlHealthy: true, firestoreHealthy: true });
    const result = authority.completeRecovery({ conflicts: 2 });
    assert.equal(result.mode, 'CONFLICT_DETECTED');
    assert.equal(result.operationalWriteEngine, 'firestore');
});
