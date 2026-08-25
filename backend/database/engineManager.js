const fs = require('fs');
const path = require('path');
const { testConnection: testMysqlConnection, getPool } = require('./mysql');

const STATE_FILE_PATH = path.join(__dirname, 'engine_state.json');

// In-memory runtime state
let currentEngine = null;

/**
 * Resolves the initial active database engine.
 * Precedence:
 * 1. engine_state.json (Super Admin persistent runtime choice)
 * 2. process.env.DB_ENGINE ('firestore' or 'mysql')
 * 3. Default fallback: 'firestore'
 */
function getActiveEngine() {
    if (currentEngine) {
        return currentEngine;
    }

    try {
        if (fs.existsSync(STATE_FILE_PATH)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
            if (data.engine === 'mysql' || data.engine === 'firestore') {
                currentEngine = data.engine;
                return currentEngine;
            }
        }
    } catch (e) {
        console.warn('[EngineManager] Could not read engine_state.json:', e.message);
    }

    const envEngine = String(process.env.DB_ENGINE || 'firestore').trim().toLowerCase();
    currentEngine = (envEngine === 'mysql') ? 'mysql' : 'firestore';
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
        const start = Date.now();
        try {
            let db = firestoreDb;
            if (!db) {
                try {
                    const admin = require('../services/firebaseAdmin');
                    if (admin.apps.length > 0) {
                        db = admin.firestore();
                    } else if (process.env.FIREBASE_PROJECT_ID) {
                        admin.initializeApp({
                            projectId: process.env.FIREBASE_PROJECT_ID
                        });
                        db = admin.firestore();
                    }
                } catch (e) {}
            }
            if (!db) {
                return {
                    connected: false,
                    latencyMs: Date.now() - start,
                    error: 'Firestore admin instance not initialized or unavailable',
                };
            }
            // Lightweight test query
            try {
                await db.collection('settings').limit(1).get();
            } catch (queryErr) {
                return {
                    connected: false,
                    latencyMs: Date.now() - start,
                    error: queryErr.message || 'Firestore query failed',
                };
            }
            return {
                connected: true,
                latencyMs: Date.now() - start,
                projectId: db.projectId || process.env.FIREBASE_PROJECT_ID || 'connected',
            };
        } catch (err) {
            return {
                connected: false,
                latencyMs: Date.now() - start,
                error: err.message,
                code: err.code,
            };
        }
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
    } catch (e) {
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
    } catch (e) {
        // Safe ignore
    }

    return { id: auditId };
}

/**
 * Returns recent database switch audit logs.
 */
async function getSwitchAuditLogs() {
    const logs = [];
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT * FROM database_switch_audit ORDER BY created_at DESC LIMIT 20'
        );
        return rows;
    } catch (e) {
        return [];
    }
}

module.exports = {
    getActiveEngine,
    testEngineConnectivity,
    switchActiveEngine,
    getSwitchAuditLogs,
};
