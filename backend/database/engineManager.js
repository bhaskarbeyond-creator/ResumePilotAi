const fs = require('fs');
const path = require('path');
const { testConnection: testMysqlConnection, getPool } = require('./mysql');

const STATE_FILE_PATH = path.join(__dirname, 'engine_state.json');

// In-memory runtime state
let currentEngine = null;
// In-process switch mutex: concurrent switch requests must serialize, never
// interleave their connectivity checks, state writes, and audit entries.
// (PM2 runs a single backend instance; a multi-instance deployment would need
// the database_engine_state switch lock as the cross-process mutex.)
let switchInProgress = false;

/**
 * Resolves the active database engine.
 *
 * ZERO-FORESTORE CERTIFICATION: MySQL/MariaDB is the single authoritative
 * engine and this function can no longer return 'firestore'. A legacy
 * engine_state.json or DB_ENGINE=firestore left over from the dual-database
 * era is detected, reported, and overridden — silently honoring such state
 * would recreate the split-brain architecture this platform was hardened
 * against.
 */
function getActiveEngine() {
    if (currentEngine) {
        return currentEngine;
    }

    try {
        if (fs.existsSync(STATE_FILE_PATH)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
            if (data.engine === 'firestore') {
                console.warn('[EngineManager] Legacy engine_state.json requests the removed Firestore engine; MySQL/MariaDB is enforced as the authoritative store.');
            }
        }
    } catch (e) {
        console.warn('[EngineManager] Could not read engine_state.json:', e.message);
    }

    const envEngine = String(process.env.DB_ENGINE || 'mysql').trim().toLowerCase();
    if (envEngine === 'firestore') {
        console.warn('[EngineManager] DB_ENGINE=firestore is ignored: the Firestore data plane has been removed. MySQL/MariaDB is authoritative.');
    }
    currentEngine = 'mysql';
    return currentEngine;
}

/**
 * Tests live connection for a given engine.
 * @param {'firestore' | 'mysql'} engine
 * @param {object} firestoreDb
 */
async function testEngineConnectivity(engine, firestoreDb) {
    if (engine === 'mysql') {
        return await testMysqlConnection();
    }

    if (engine === 'firestore') {
        // The Firestore data plane has been REMOVED from the runtime. This
        // probe must never create a client or issue a network read: it reports
        // the architectural truth instead. MySQL/MariaDB is the sole
        // authoritative store.
        return {
            connected: false,
            removed: true,
            latencyMs: 0,
            error: 'The Firestore data plane has been removed from the runtime. MySQL/MariaDB is the single authoritative database.',
        };
    }

    return { connected: false, error: `Unknown database engine: ${engine}` };
}

/**
 * Switches the active database engine after strict validation and connectivity checks.
 * @param {'firestore' | 'mysql'} newEngine
 * @param {string} switchedBy - Super admin identifier
 * @param {object} firestoreDb
 * @returns {Promise<{success: boolean, engine: string, auditId?: string, error?: string}>}
 */
async function switchActiveEngine(newEngine, switchedBy = 'SUPER_ADMIN', firestoreDb = null) {
    const target = String(newEngine || '').trim().toLowerCase();
    if (target !== 'firestore' && target !== 'mysql') {
        throw new Error(`Invalid database engine '${target}'. Allowed values: 'firestore', 'mysql'.`);
    }
    if (target === 'firestore' && String(process.env.ALLOW_FIRESTORE_ENGINE || 'false').toLowerCase() !== 'true') {
        const err = new Error('Switching the active engine to Firestore is disabled. MySQL/MariaDB is the authoritative database; Firestore is not a synchronous fallback. Set ALLOW_FIRESTORE_ENGINE=true only for explicit migration tooling.');
        err.status = 403;
        throw err;
    }

    if (switchInProgress) {
        const err = new Error('A database engine switch is already in progress; retry when it completes.');
        err.status = 409;
        throw err;
    }
    switchInProgress = true;
    try {
        return await performEngineSwitch(target, switchedBy, firestoreDb);
    } finally {
        switchInProgress = false;
    }
}

async function performEngineSwitch(target, switchedBy, firestoreDb) {
    const previousEngine = getActiveEngine();
    if (previousEngine === target) {
        return {
            success: true,
            engine: target,
            unchanged: true,
            message: `Database engine is already set to ${target}.`
        };
    }

    // 1. Verify connectivity to the target engine before switching
    const testResult = await testEngineConnectivity(target, firestoreDb);
    if (!testResult.connected) {
        const err = new Error(`Cannot switch to ${target}: Connection check failed (${testResult.error || 'Unreachable'}).`);
        err.status = 400;
        err.details = testResult;
        
        // Log failed switch attempt
        await logSwitchAudit({
            switchedBy,
            fromEngine: previousEngine,
            toEngine: target,
            status: 'FAILED',
            errorMessage: err.message,
            firestoreDb
        }).catch(() => {});

        throw err;
    }

    // 2. Persist to state file atomically
    try {
        const statePayload = {
            engine: target,
            switchedBy,
            switchedAt: new Date().toISOString(),
            previousEngine
        };
        const tempPath = `${STATE_FILE_PATH}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, JSON.stringify(statePayload, null, 2), 'utf8');
        fs.renameSync(tempPath, STATE_FILE_PATH);
        currentEngine = target;
    } catch (err) {
        console.error('[EngineManager] Failed to persist state file:', err.message);
        throw new Error(`Failed to persist engine switch: ${err.message}`);
    }

    // 2b. Mirror the authoritative runtime state into the
    // database_engine_state control table so operators, verification scripts,
    // and any future multi-instance deployment observe one consistent engine
    // state instead of a split brain between the state file and the database.
    try {
        const pool = getPool();
        await pool.query(
            `INSERT INTO database_engine_state (id, active_engine, standby_engine, sync_mode, last_switched_by, switch_in_progress, switch_lock_expires_at)
             VALUES ('active_engine', ?, ?, 'ACTIVE_PASSIVE', ?, FALSE, 0)
             ON DUPLICATE KEY UPDATE
               active_engine = VALUES(active_engine),
               standby_engine = VALUES(standby_engine),
               last_switched_by = VALUES(last_switched_by),
               switch_in_progress = FALSE,
               switch_lock_expires_at = 0`,
            [target, target === 'mysql' ? 'firestore' : 'mysql', String(switchedBy).slice(0, 128)]
        );
    } catch (err) {
        // The state file remains the authoritative runtime source; a stale DB
        // mirror is surfaced by getEngineStateConsistency() rather than
        // silently diverging.
        console.warn('[EngineManager] Could not mirror engine state into database_engine_state:', err.message);
    }

    // 3. Log audit entry
    const auditRecord = await logSwitchAudit({
        switchedBy,
        fromEngine: previousEngine,
        toEngine: target,
        status: 'SUCCESS',
        errorMessage: null,
        firestoreDb
    }).catch(e => console.warn('[EngineManager] Audit log notice:', e.message));

    console.log(`[EngineManager] Database successfully switched from ${previousEngine} to ${target} by ${switchedBy}.`);

    return {
        success: true,
        engine: target,
        previousEngine,
        switchedBy,
        auditId: auditRecord?.id || null,
        message: `Database engine successfully switched to ${target}.`
    };
}

/**
 * Records an immutable audit log of the engine switch.
 */
async function logSwitchAudit({ switchedBy, fromEngine, toEngine, status, errorMessage, firestoreDb }) {
    const auditId = `dbs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    // Log to MySQL database_switch_audit if MySQL is accessible
    try {
        const pool = getPool();
        await pool.query(
            `INSERT INTO database_switch_audit (id, switched_by, from_engine, to_engine, status, error_message, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [auditId, switchedBy, fromEngine, toEngine, status, errorMessage, now]
        );
    } catch (_e) {
        // Safe fallback if MySQL table doesn't exist yet
    }

    // Log to Firestore if Firestore is accessible
    try {
        if (firestoreDb) {
            await firestoreDb.collection('admin_audit_logs').doc(auditId).set({
                action: 'DATABASE_ENGINE_SWITCH',
                switchedBy,
                fromEngine,
                toEngine,
                status,
                errorMessage: errorMessage || null,
                timestamp: now.toISOString(),
            }, { merge: true });
        }
    } catch (_e) {
        // Safe ignore
    }

    return { id: auditId };
}

/**
 * Returns recent database switch audit logs.
 */
async function getSwitchAuditLogs() {
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT * FROM database_switch_audit ORDER BY created_at DESC LIMIT 20'
        );
        return rows.map(r => {
            let createdAt = null;
            if (r.created_at) {
                const parsed = new Date(r.created_at);
                if (!isNaN(parsed.getTime())) createdAt = parsed.toISOString();
            }
            return {
                id: r.id,
                switchedBy: r.switched_by || r.switchedBy || 'system',
                fromEngine: r.from_engine || r.fromEngine || 'unknown',
                toEngine: r.to_engine || r.toEngine || 'unknown',
                status: r.status || 'SUCCESS',
                errorMessage: r.error_message || r.errorMessage || null,
                createdAt: createdAt || new Date().toISOString(),
            };
        });
    } catch (_e) {
        return [];
    }
}

/**
 * Reconciles the authoritative runtime engine state (engine_state.json) with
 * the database_engine_state control table. Divergence means a switch occurred
 * while MySQL was unreachable (the file is authoritative), or the table was
 * modified out-of-band — either way operators must be able to see it.
 */
async function getEngineStateConsistency() {
    const fileEngine = getActiveEngine();
    let dbEngine = null;
    let dbError = null;
    try {
        const pool = getPool();
        const [rows] = await pool.query("SELECT active_engine FROM database_engine_state WHERE id = 'active_engine'");
        dbEngine = rows[0]?.active_engine || null;
    } catch (e) {
        dbError = e.message;
    }
    return {
        runtimeEngine: fileEngine,
        databaseEngineState: dbEngine,
        databaseReachable: dbError === null,
        databaseError: dbError,
        diverged: dbError === null && dbEngine !== null && dbEngine !== fileEngine,
    };
}

module.exports = {
    getActiveEngine,
    testEngineConnectivity,
    switchActiveEngine,
    getSwitchAuditLogs,
    getEngineStateConsistency,
};
