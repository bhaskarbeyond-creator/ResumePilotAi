'use strict';

/**
 * Centralized Database Authority.
 *
 * One service decides:
 *   - where reads go
 *   - where writes go
 *   - when failover occurs
 *   - when recovery occurs
 *   - how synchronization behaves
 *
 * Configured primary comes from engineManager (default: mariadb/mysql).
 * Operational failover is independent of Super Admin engine switches so a
 * temporary outage never silently rewrites engine_state.json (split-brain).
 *
 * State machine:
 *   NORMAL
 *   MARIADB_DEGRADED
 *   MARIADB_FAILED_OVER
 *   FIRESTORE_DEGRADED
 *   RECONCILING
 *   RECOVERED
 *   CONFLICT_DETECTED
 *   BOTH_UNAVAILABLE
 */

function engineManager() {
    return require('./engineManager');
}

const MODES = Object.freeze({
    NORMAL: 'NORMAL',
    MARIADB_DEGRADED: 'MARIADB_DEGRADED',
    MARIADB_FAILED_OVER: 'MARIADB_FAILED_OVER',
    FIRESTORE_DEGRADED: 'FIRESTORE_DEGRADED',
    RECONCILING: 'RECONCILING',
    RECOVERED: 'RECOVERED',
    CONFLICT_DETECTED: 'CONFLICT_DETECTED',
    BOTH_UNAVAILABLE: 'BOTH_UNAVAILABLE',
});

const HEALTH_TTL_MS = Number(process.env.DB_HEALTH_TTL_MS || 4000);
const FAILURE_THRESHOLD = Number(process.env.DB_FAILOVER_FAILURE_THRESHOLD || 2);
const RECOVERY_THRESHOLD = Number(process.env.DB_RECOVERY_SUCCESS_THRESHOLD || 2);
const AUTO_FAILOVER = String(process.env.DB_AUTO_FAILOVER || 'true').toLowerCase() !== 'false';

let configuredPrimary = null;
let operationalWriteEngine = null;
let mode = MODES.NORMAL;
let healthCache = {
    mysql: { healthy: null, checkedAt: 0, consecutiveFailures: 0, consecutiveSuccesses: 0, lastError: null, latencyMs: null },
    firestore: { healthy: null, checkedAt: 0, consecutiveFailures: 0, consecutiveSuccesses: 0, lastError: null, latencyMs: null },
};
let lastFailoverAt = null;
let lastRecoveryAt = null;
let lastReconcileAt = null;
const metrics = {
    failovers: 0,
    recoveries: 0,
    staleReads: 0,
    rejectedWrites: 0,
    primaryReadFailures: 0,
    secondaryReadFallbacks: 0,
};

const listeners = new Set();

function engineAlias(name) {
    const v = String(name || '').toLowerCase();
    if (v === 'mariadb' || v === 'mysql') return 'mysql';
    if (v === 'firestore' || v === 'firebase') return 'firestore';
    return v || 'mysql';
}

function getConfiguredPrimary() {
    if (configuredPrimary) return configuredPrimary;
    configuredPrimary = engineAlias(getActiveEngine());
    if (!operationalWriteEngine) operationalWriteEngine = configuredPrimary;
    return configuredPrimary;
}

function getConfiguredSecondary() {
    return getConfiguredPrimary() === 'mysql' ? 'firestore' : 'mysql';
}

function getWriteEngine() {
    getConfiguredPrimary();
    return operationalWriteEngine;
}

function getReadOrder() {
    const primary = getConfiguredPrimary();
    const write = getWriteEngine() || primary;
    const secondary = write === 'mysql' ? 'firestore' : 'mysql';
    if (mode === MODES.BOTH_UNAVAILABLE) return [];
    if (mode === MODES.MARIADB_FAILED_OVER || mode === MODES.RECONCILING) {
        return write === 'firestore' ? ['firestore', 'mysql'] : ['mysql', 'firestore'];
    }
    return [write, secondary === write ? primary : secondary];
}

function snapshotHealth(engine) {
    return { ...healthCache[engineAlias(engine)] };
}

function recordSuccess(engine, _op = 'read') {
    const key = engineAlias(engine);
    const entry = healthCache[key] || (healthCache[key] = {});
    entry.healthy = true;
    entry.checkedAt = Date.now();
    entry.consecutiveFailures = 0;
    entry.consecutiveSuccesses = (entry.consecutiveSuccesses || 0) + 1;
    entry.lastError = null;
    maybeRecover();
}

function recordFailure(engine, _op = 'read', err = null) {
    const key = engineAlias(engine);
    const entry = healthCache[key] || (healthCache[key] = {});
    entry.healthy = false;
    entry.checkedAt = Date.now();
    entry.consecutiveSuccesses = 0;
    entry.consecutiveFailures = (entry.consecutiveFailures || 0) + 1;
    entry.lastError = err ? String(err.message || err).slice(0, 300) : 'unknown';
    if (key === getConfiguredPrimary()) metrics.primaryReadFailures += 1;
    maybeFailover();
}

function classifyMode() {
    const mysql = healthCache.mysql;
    const fs = healthCache.firestore;
    const mysqlOk = mysql.healthy !== false;
    const fsOk = fs.healthy !== false;
    const mysqlKnownDown = mysql.healthy === false;
    const fsKnownDown = fs.healthy === false;

    if (mysqlKnownDown && fsKnownDown) return MODES.BOTH_UNAVAILABLE;
    if (getConfiguredPrimary() === 'mysql') {
        if (mysqlKnownDown && fsOk) {
            return operationalWriteEngine === 'firestore' ? MODES.MARIADB_FAILED_OVER : MODES.MARIADB_DEGRADED;
        }
        if (fsKnownDown && mysqlOk) return MODES.FIRESTORE_DEGRADED;
    } else {
        if (fsKnownDown && mysqlOk) {
            return operationalWriteEngine === 'mysql' ? MODES.MARIADB_FAILED_OVER : MODES.MARIADB_DEGRADED;
        }
        if (mysqlKnownDown && fsOk) return MODES.FIRESTORE_DEGRADED;
    }
    if (mode === MODES.RECONCILING) return MODES.RECONCILING;
    if (mode === MODES.RECOVERED) return MODES.RECOVERED;
    return MODES.NORMAL;
}

function emit(event, payload) {
    for (const fn of listeners) {
        try { fn(event, payload); } catch { /* observers must not break authority */ }
    }
}

function maybeFailover() {
    if (!AUTO_FAILOVER) {
        mode = classifyMode();
        return;
    }
    const primary = getConfiguredPrimary();
    const secondary = getConfiguredSecondary();
    const primaryHealth = healthCache[primary];
    const secondaryHealth = healthCache[secondary];
    if (
        primaryHealth.consecutiveFailures >= FAILURE_THRESHOLD
        && secondaryHealth.healthy !== false
        && operationalWriteEngine === primary
    ) {
        operationalWriteEngine = secondary;
        mode = primary === 'mysql' ? MODES.MARIADB_FAILED_OVER : MODES.MARIADB_FAILED_OVER;
        lastFailoverAt = new Date().toISOString();
        metrics.failovers += 1;
        emit('failover', {
            from: primary,
            to: secondary,
            mode,
            at: lastFailoverAt,
            reason: primaryHealth.lastError,
        });
        return;
    }
    if (primaryHealth.healthy === false && secondaryHealth.healthy === false) {
        mode = MODES.BOTH_UNAVAILABLE;
        return;
    }
    mode = classifyMode();
}

function maybeRecover() {
    const primary = getConfiguredPrimary();
    const primaryHealth = healthCache[primary];
    if (
        operationalWriteEngine !== primary
        && primaryHealth.healthy === true
        && primaryHealth.consecutiveSuccesses >= RECOVERY_THRESHOLD
    ) {
        mode = MODES.RECONCILING;
        lastReconcileAt = new Date().toISOString();
        emit('reconciling', { primary, at: lastReconcileAt });
        return;
    }
    mode = classifyMode();
}

/**
 * Called by the sync/reconciliation worker once pending reverse mutations
 * have been drained and conflicts resolved. Restores write authority to the
 * configured primary.
 */
function completeRecovery({ conflicts = 0 } = {}) {
    const primary = getConfiguredPrimary();
    if (conflicts > 0) {
        mode = MODES.CONFLICT_DETECTED;
        emit('conflict', { conflicts, at: new Date().toISOString() });
        return getStatus();
    }
    operationalWriteEngine = primary;
    mode = MODES.RECOVERED;
    lastRecoveryAt = new Date().toISOString();
    metrics.recoveries += 1;
    emit('recovered', { primary, at: lastRecoveryAt });
    setTimeout(() => {
        if (mode === MODES.RECOVERED) mode = MODES.NORMAL;
    }, 1000).unref?.();
    return getStatus();
}

function canAcceptWrites() {
    if (mode === MODES.BOTH_UNAVAILABLE) return false;
    const write = getWriteEngine();
    const health = healthCache[write];
    if (health.healthy === false && health.consecutiveFailures >= FAILURE_THRESHOLD) {
        const other = write === 'mysql' ? 'firestore' : 'mysql';
        if (healthCache[other].healthy === false) return false;
    }
    return true;
}

function noteStaleRead() {
    metrics.staleReads += 1;
}

function noteRejectedWrite() {
    metrics.rejectedWrites += 1;
}

function noteSecondaryFallback() {
    metrics.secondaryReadFallbacks += 1;
}

async function probe(engine, firestoreDb = null) {
    const key = engineAlias(engine);
    const cached = healthCache[key];
    if (cached.checkedAt && (Date.now() - cached.checkedAt) < HEALTH_TTL_MS && cached.healthy !== null) {
        return snapshotHealth(key);
    }
    const result = await engineManager().testEngineConnectivity(key, firestoreDb);
    const entry = healthCache[key];
    entry.checkedAt = Date.now();
    entry.latencyMs = result.latencyMs ?? null;
    if (result.connected) {
        recordSuccess(key, 'probe');
        entry.healthy = true;
        if (result.quotaExceeded) {
            entry.lastError = result.warning || 'quota_limited';
        }
    } else {
        recordFailure(key, 'probe', result.error || 'unreachable');
        entry.healthy = false;
    }
    return snapshotHealth(key);
}

async function refresh(firestoreDb = null) {
    const [mysql, firestore] = await Promise.all([
        probe('mysql', firestoreDb),
        probe('firestore', firestoreDb),
    ]);
    return { mysql, firestore, ...getStatus() };
}

function getStatus() {
    const primary = getConfiguredPrimary();
    return {
        mode,
        configuredPrimary: primary,
        configuredSecondary: getConfiguredSecondary(),
        operationalWriteEngine: getWriteEngine(),
        readOrder: getReadOrder(),
        canAcceptWrites: canAcceptWrites(),
        lastFailoverAt,
        lastRecoveryAt,
        lastReconcileAt,
        health: {
            mysql: snapshotHealth('mysql'),
            firestore: snapshotHealth('firestore'),
        },
        metrics: { ...metrics },
        autoFailover: AUTO_FAILOVER,
    };
}

function onEvent(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Test-only reset. */
function __resetForTests(overrides = {}) {
    configuredPrimary = overrides.configuredPrimary || null;
    operationalWriteEngine = overrides.operationalWriteEngine || configuredPrimary;
    mode = overrides.mode || MODES.NORMAL;
    lastFailoverAt = null;
    lastRecoveryAt = null;
    lastReconcileAt = null;
    metrics.failovers = 0;
    metrics.recoveries = 0;
    metrics.staleReads = 0;
    metrics.rejectedWrites = 0;
    metrics.primaryReadFailures = 0;
    metrics.secondaryReadFallbacks = 0;
    healthCache = {
        mysql: { healthy: overrides.mysqlHealthy ?? null, checkedAt: 0, consecutiveFailures: 0, consecutiveSuccesses: 0, lastError: null, latencyMs: null },
        firestore: { healthy: overrides.firestoreHealthy ?? null, checkedAt: 0, consecutiveFailures: 0, consecutiveSuccesses: 0, lastError: null, latencyMs: null },
    };
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
    noteStaleRead,
    noteRejectedWrite,
    noteSecondaryFallback,
    probe,
    refresh,
    getStatus,
    onEvent,
    __resetForTests,
};
