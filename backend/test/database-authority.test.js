'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const authority = require('../database/authority');

const reset = () => authority.__resetForTests({ mysqlHealthy: true });

test('authority starts NORMAL with MariaDB as the only application-data owner', () => {
    reset();
    const state = authority.getStatus();
    assert.equal(state.mode, authority.MODES.NORMAL);
    assert.equal(state.configuredPrimary, 'mysql');
    assert.equal(state.configuredSecondary, null);
    assert.equal(state.operationalWriteEngine, 'mysql');
    assert.deepEqual(state.readOrder, ['mysql']);
    assert.equal(state.autoFailover, false);
    assert.equal(state.ownershipMutable, false);
});

test('consecutive MariaDB failures reject writes without silent fallback', () => {
    reset();
    authority.recordFailure('mysql', 'write', new Error('connection unavailable'));
    assert.equal(authority.getStatus().mode, authority.MODES.MARIADB_DEGRADED);
    authority.recordFailure('mysql', 'write', new Error('connection unavailable'));
    const state = authority.getStatus();
    assert.equal(state.mode, authority.MODES.MARIADB_UNAVAILABLE);
    assert.equal(state.canAcceptWrites, false);
    assert.equal(state.operationalWriteEngine, 'mysql');
    assert.equal(state.configuredSecondary, null);
    assert.equal(state.metrics.writeFailures, 2);
});

test('a report about an unsupported engine cannot alter MariaDB authority', () => {
    reset();
    authority.recordFailure('unsupported-secondary', 'write', new Error('down'));
    const state = authority.getStatus();
    assert.equal(state.mode, authority.MODES.NORMAL);
    assert.equal(state.canAcceptWrites, true);
    assert.equal(state.operationalWriteEngine, 'mysql');
    assert.equal(state.metrics.writeFailures, 0);
});

test('authoritative outage never produces fake acceptance', () => {
    reset();
    authority.recordFailure('mysql', 'write', new Error('connection unavailable'));
    authority.recordFailure('mysql', 'write', new Error('connection unavailable'));
    assert.equal(authority.canAcceptWrites(), false);
    authority.noteRejectedWrite();
    const state = authority.getStatus();
    assert.equal(state.metrics.rejectedWrites, 1);
    assert.equal(state.lastFailoverAt, null);
});

test('recovery threshold restores the same owner and records the transition', () => {
    reset();
    authority.recordFailure('mysql', 'probe', new Error('connection unavailable'));
    authority.recordFailure('mysql', 'probe', new Error('connection unavailable'));
    authority.recordSuccess('mysql', 'probe');
    assert.equal(authority.getStatus().mode, authority.MODES.MARIADB_UNAVAILABLE, 'one success is insufficient');
    authority.recordSuccess('mysql', 'probe');
    assert.equal(authority.getStatus().mode, authority.MODES.RECOVERED);
    assert.ok(authority.getStatus().lastRecoveryAt);
    authority.completeRecovery();
    assert.equal(authority.getStatus().mode, authority.MODES.NORMAL);
    assert.equal(authority.getWriteEngine(), 'mysql');
});

test('runtime switching and secondary fallback are explicitly rejected', () => {
    reset();
    assert.throws(
        () => authority.assertManualSwitchAllowed(),
        error => error.code === 'DATABASE_OWNER_IMMUTABLE' && error.status === 409
    );
    assert.throws(
        () => authority.noteSecondaryFallback(),
        error => error.code === 'DATABASE_FALLBACK_FORBIDDEN' && error.status === 500
    );
    assert.equal(authority.getStatus().operationalWriteEngine, 'mysql');
});
