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

function fencing() {
    return require('./fencing');
}

function alerts() {
    return require('./alerts');
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
// Automatic failover is OFF by default. MySQL/MariaDB is the single authoritative
// store; a MySQL outage degrades writes with controlled errors instead of silently
// switching the source of truth to Firestore (dual-source problem). Firestore can
// only become a write target when ALLOW_FIRESTORE_FAILOVER=true is set explicitly
// by an operator who accepts the standby-write semantics.
const AUTO_FAILOVER = String(process.env.DB_AUTO_FAILOVER || 'false').toLowerCase() !== 'false';
const ALLOW_FIRESTORE_FAILOVER = String(process.env.ALLOW_FIRESTORE_FAILOVER || 'false').toLowerCase() === 'true';

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
    configuredPrimary = engineAlias(engineManager().getActiveEngine());
    if (!operationalWriteEngine) operationalWriteEngine = configuredPrimary;
    return configuredPrimary;
}

function getConfiguredSecondary() {
    return getConfiguredPrimary() === 'mysql' ? 'firestore' : 'mysql';
}

function getWriteEngine() {
    getConfiguredPrimary();
    // Firestore can never be the write engine unless an operator explicitly
    // enables standby failover. Default: MySQL is the only write target.
    if (operationalWriteEngine === 'firestore' && !ALLOW_FIRESTORE_FAILOVER) {
        operationalWriteEngine = 'mysql';
    }
    return operationalWriteEngine;
}

function getReadOrder() {
    const primary = getConfiguredPrimary();
    const write = getWriteEngine() || primary;
    if (mode === MODES.BOTH_UNAVAILABLE) return [];
    // Synchronous reads always go to MySQL first. Firestore appears in the read
    // order only in the explicitly-opted-in standby-failover configuration.
    const secondary = write === 'mysql' ? 'firestore' : 'mysql';
    if (!ALLOW_FIRESTORE_FAILOVER && secondary === 'firestore') return [write];
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
    if (!AUTO_FAILOVER || !ALLOW_FIRESTORE_FAILOVER) {
        // Controlled degradation: MySQL stays the only authoritative store. When
        // MySQL is down, classifyMode reports MARIADB_DEGRADED / BOTH_UNAVAILABLE
        // and write paths surface controlled errors instead of silently switching
        // to Firestore.
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
        const fence = fencing().bumpGeneration({
            reason: primaryHealth.lastError || 'primary_failure_threshold',
            writeEngine: secondary,
            expectedGeneration: fencing().currentGeneration(),
            mode: MODES.MARIADB_FAILED_OVER,
        });
        if (!fence.won && fence.operationalWriteEngine === secondary) {
            operationalWriteEngine = secondary;
            mode = MODES.MARIADB_FAILED_OVER;
            alerts().emitAlert(alerts().ALERT_TYPES.SPLIT_BRAIN_PREVENTION, {
                message: 'Failover generation already advanced by another instance; adopting existing fence',
                generation: fence.generation,
            });
        } else if (!fence.won) {
            operationalWriteEngine = fence.operationalWriteEngine || secondary;
            mode = classifyMode();
            alerts().emitAlert(alerts().ALERT_TYPES.SPLIT_BRAIN_PREVENTION, {
                message: 'Refusing competing failover; another instance owns write generation',
                generation: fence.generation,
            });
            return;
        } else {
            operationalWriteEngine = secondary;
            mode = primary === 'mysql' ? MODES.MARIADB_FAILED_OVER : MODES.MARIADB_FAILED_OVER;
        }
        lastFailoverAt = new Date().toISOString();
        metrics.failovers += 1;
        emit('failover', {
            from: primary,
            to: secondary,
            mode,
            at: lastFailoverAt,
            reason: primaryHealth.lastError,
            generation: fencing().currentGeneration(),
        });
        alerts().emitAlert(alerts().ALERT_TYPES.AUTOMATIC_FAILOVER, {
            from: primary,
            to: secondary,
            reason: primaryHealth.lastError,
            generation: fencing().currentGeneration(),
        });
        return;
    }
    if (primaryHealth.healthy === false && secondaryHealth.healthy === false) {
        mode = MODES.BOTH_UNAVAILABLE;
        alerts().emitAlert(alerts().ALERT_TYPES.BOTH_UNAVAILABLE, {
            mysqlError: healthCache.mysql.lastError,
            firestoreError: healthCache.firestore.lastError,
        });
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
        alerts().emitAlert(alerts().ALERT_TYPES.CONFLICT, { conflicts });
        return getStatus();
    }
    fencing().bumpGeneration({
        reason: 'recovery_restore_primary',
        writeEngine: primary,
        expectedGeneration: fencing().currentGeneration(),
        mode: MODES.RECOVERED,
    });
    operationalWriteEngine = primary;
    mode = MODES.RECOVERED;
    lastRecoveryAt = new Date().toISOString();
    metrics.recoveries += 1;
    emit('recovered', { primary, at: lastRecoveryAt, generation: fencing().currentGeneration() });
    setTimeout(() => {
        if (mode === MODES.RECOVERED) mode = MODES.NORMAL;
    }, 1000).unref?.();
    return getStatus();
}

function assertManualSwitchAllowed() {
    getConfiguredPrimary();
    if (mode === MODES.MARIADB_FAILED_OVER || mode === MODES.RECONCILING || mode === MODES.BOTH_UNAVAILABLE || mode === MODES.CONFLICT_DETECTED) {
        const err = new Error(`Manual engine switch is blocked while authority mode is ${mode}. Wait for recovery or use an emergency force switch after inspecting fence generation.`);
        err.code = 'MANUAL_SWITCH_BLOCKED';
        err.status = 409;
        err.mode = mode;
        err.fence = fencing().currentFence();
        alerts().emitAlert(alerts().ALERT_TYPES.SPLIT_BRAIN_PREVENTION, {
            message: 'Rejected Super Admin engine switch during automatic failover/reconciliation',
            mode,
        });
        throw err;
    }
    return true;
}

function canAcceptWrites() {
    if (mode === MODES.BOTH_UNAVAILABLE) return false;
    const write = getWriteEngine();
    const health = healthCache[write];
    if (health.healthy === false && health.consecutiveFailures >= FAILURE_THRESHOLD) {
        // Without an operator-approved Firestore failover the authoritative
        // MySQL store being down means writes cannot be accepted: no fabricated
        // success, no silent switch to another database.
        if (!ALLOW_FIRESTORE_FAILOVER) return false;
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
        fence: fencing().currentFence(),
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
