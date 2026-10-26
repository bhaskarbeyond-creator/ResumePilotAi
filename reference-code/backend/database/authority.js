'use strict';

/**
 * Single-owner database authority.
 *
 * MariaDB is the only application-data owner. An outage changes availability,
 * never ownership: reads and writes fail closed with controlled errors until
 * the same database recovers. There is no engine election, fallback, mirroring,
 * or automatic promotion state in this module.
 */

function engineManager() {
    return require('./engineManager');
}

const MODES = Object.freeze({
    NORMAL: 'NORMAL',
    MARIADB_DEGRADED: 'MARIADB_DEGRADED',
    MARIADB_UNAVAILABLE: 'MARIADB_UNAVAILABLE',
    RECOVERED: 'RECOVERED',
});

const HEALTH_TTL_MS = Math.max(250, Number(process.env.DB_HEALTH_TTL_MS || 4000));
const FAILURE_THRESHOLD = Math.max(1, Number(process.env.DB_FAILURE_THRESHOLD || 2));
const RECOVERY_THRESHOLD = Math.max(1, Number(process.env.DB_RECOVERY_SUCCESS_THRESHOLD || 2));

let mode = MODES.NORMAL;
let health = {
    healthy: null,
    checkedAt: 0,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastError: null,
    latencyMs: null,
};
let lastRecoveryAt = null;
const metrics = {
    rejectedWrites: 0,
    readFailures: 0,
    writeFailures: 0,
    recoveries: 0,
};
const listeners = new Set();

function emit(event, payload) {
    for (const listener of listeners) {
        try { listener(event, payload); } catch { /* observers cannot alter authority */ }
    }
}

function getConfiguredPrimary() { return 'mysql'; }
function getConfiguredSecondary() { return null; }
function getWriteEngine() { return 'mysql'; }
function getReadOrder() { return ['mysql']; }

function recordSuccess(engine, operation = 'read') {
    if (String(engine || '').toLowerCase() !== 'mysql') return;
    // Recovery spans multiple successful probes. `healthy` becomes true after
    // the first probe, so mode must also retain the recovering state; otherwise
    // a threshold greater than one can never be reached or observed.
    const wasRecovering = health.healthy === false
        || mode === MODES.MARIADB_DEGRADED
        || mode === MODES.MARIADB_UNAVAILABLE;
    health = {
        ...health,
        healthy: true,
        checkedAt: Date.now(),
        consecutiveFailures: 0,
        consecutiveSuccesses: health.consecutiveSuccesses + 1,
        lastError: null,
    };
    if (wasRecovering && health.consecutiveSuccesses >= RECOVERY_THRESHOLD) {
        mode = MODES.RECOVERED;
        lastRecoveryAt = new Date().toISOString();
        metrics.recoveries += 1;
        emit('recovered', { engine: 'mysql', operation, at: lastRecoveryAt });
    } else if (!wasRecovering) {
        mode = MODES.NORMAL;
    }
}

function recordFailure(engine, operation = 'read', error = null) {
    if (String(engine || '').toLowerCase() !== 'mysql') return;
    health = {
        ...health,
        healthy: false,
        checkedAt: Date.now(),
        consecutiveFailures: health.consecutiveFailures + 1,
        consecutiveSuccesses: 0,
        lastError: String(error?.message || error || 'Database unavailable').slice(0, 300),
    };
    if (operation === 'write') metrics.writeFailures += 1;
    else metrics.readFailures += 1;
    mode = health.consecutiveFailures >= FAILURE_THRESHOLD
        ? MODES.MARIADB_UNAVAILABLE
        : MODES.MARIADB_DEGRADED;
    emit('degraded', { engine: 'mysql', operation, mode, error: health.lastError });
}

function completeRecovery() {
    if (health.healthy !== true) return getStatus();
    mode = MODES.NORMAL;
    return getStatus();
}

function canAcceptWrites() {
    return !(health.healthy === false && health.consecutiveFailures >= FAILURE_THRESHOLD);
}

function assertManualSwitchAllowed() {
    const error = new Error('Database ownership is fixed; runtime engine switching is not supported.');
    error.code = 'DATABASE_OWNER_IMMUTABLE';
    error.status = 409;
    throw error;
}

function noteStaleRead() {
    // Kept as a compatibility hook. Single-owner reads are never classified as stale.
}

function noteRejectedWrite() { metrics.rejectedWrites += 1; }
function noteSecondaryFallback() {
    throw Object.assign(new Error('A secondary database fallback does not exist.'), {
        code: 'DATABASE_FALLBACK_FORBIDDEN',
        status: 500,
    });
}

async function probe(engine = 'mysql') {
    if (String(engine || '').toLowerCase() !== 'mysql') {
        return { healthy: false, checkedAt: Date.now(), error: 'Unsupported database engine' };
    }
    if (health.checkedAt && Date.now() - health.checkedAt < HEALTH_TTL_MS && health.healthy !== null) {
        return { ...health };
    }
    const result = await engineManager().testEngineConnectivity('mysql');
    health.latencyMs = result.latencyMs ?? null;
    if (result.connected) recordSuccess('mysql', 'probe');
    else recordFailure('mysql', 'probe', result.error || 'Connection failed');
    return { ...health };
}

async function refresh() {
    const mysql = await probe('mysql');
    return { mysql, ...getStatus() };
}

function getStatus() {
    return {
        mode,
        configuredPrimary: 'mysql',
        configuredSecondary: null,
        operationalWriteEngine: 'mysql',
        readOrder: ['mysql'],
        canAcceptWrites: canAcceptWrites(),
        lastFailoverAt: null,
        lastRecoveryAt,
        lastReconcileAt: null,
        health: { mysql: { ...health } },
        metrics: { ...metrics },
        autoFailover: false,
        ownershipMutable: false,
    };
}

function onEvent(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function __resetForTests(overrides = {}) {
    mode = overrides.mode || MODES.NORMAL;
    lastRecoveryAt = null;
    health = {
        healthy: overrides.mysqlHealthy ?? null,
        checkedAt: 0,
        consecutiveFailures: Number(overrides.consecutiveFailures || 0),
        consecutiveSuccesses: 0,
        lastError: null,
        latencyMs: null,
    };
    Object.keys(metrics).forEach(key => { metrics[key] = 0; });
}

module.exports = {
    MODES,
    getConfiguredPrimary,
    getConfiguredSecondary,
    getWriteEngine,
    getReadOrder,
    recordSuccess,
    recordFailure,
    completeRecovery,
    canAcceptWrites,
    assertManualSwitchAllowed,
    noteStaleRead,
    noteRejectedWrite,
    noteSecondaryFallback,
    probe,
    refresh,
    getStatus,
    onEvent,
    __resetForTests,
};
