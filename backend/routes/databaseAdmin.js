const express = require('express');
const { getActiveEngine, testEngineConnectivity, switchActiveEngine, getSwitchAuditLogs, getEngineStateConsistency } = require('../database/engineManager');
const { initializeSchema, getPool } = require('../database/mysql');
const { 
    getSyncHealthStatus, 
    processSyncQueue, 
    flushAndVerifyBeforeSwitch,
    computeContinuousParity,
    pruneSyncedOutboxEvents,
    pruneFirestoreOutboxEvents
} = require('../database/syncManager');
const { requirePermission, requireRecentAdminAuthentication } = require('../security/auth');

const router = express.Router();

// Super Admin / Admin access gate for all database control plane endpoints
router.use(requirePermission('system.config.write'));

/**
 * GET /api/admin/database-settings
 * Returns the current active database engine, live health checks, sync metrics, and audit history.
 */
router.get('/', async (req, res) => {
    try {
        const activeEngine = 'mysql';

        // Perform live MySQL connectivity & outbox status checks
        const [mysqlStatus, syncHealth, recentAudits, engineStateConsistency] = await Promise.all([
            testEngineConnectivity('mysql', null),
            getSyncHealthStatus(),
            getSwitchAuditLogs(),
            getEngineStateConsistency(),
        ]);

        let tablesCount = 53;
        try {
            const p = getPool();
            const [tables] = await p.query('SHOW TABLES');
            tablesCount = tables.length;
        } catch (_) {}

        return res.json({
            success: true,
            activeEngine: 'mysql',
            authoritativeDatabase: 'mysql',
            firestoreDataPlane: 'REMOVED',
            firebaseAuth: 'IDENTITY_ONLY',
            engineDetails: {
                current: 'mysql',
                mysql: mysqlStatus,
                firestore: {
                    connected: false,
                    status: 'DECOMMISSIONED',
                    role: 'ZERO_DATA_PLANE',
                    note: 'All application entities reside natively in MariaDB / MySQL. Firebase Auth is retained exclusively for identity verification.'
                },
                auth: {
                    status: 'ACTIVE',
                    role: 'IDENTITY_ONLY',
                    providers: ['google', 'facebook', 'github', 'linkedin', 'password']
                }
            },
            tablesCount,
            engineStateConsistency,
            syncHealth,
            recentAudits,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[DatabaseAdmin] Failed to load settings:', err.message);
        return res.status(500).json({
            success: false,
            error: { code: 'DATABASE_SETTINGS_ERROR', message: err.message, requestId: res.locals?.requestId }
        });
    }
});

/**
 * GET /api/admin/database-settings/sync-status
 * Returns granular sync metrics, lag, outbox counts, and conflict counters.
 */
router.get('/sync-status', async (req, res) => {
    try {
        const status = await getSyncHealthStatus();
        return res.json({ success: true, ...status });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/database-settings/sync-now
 * Manually flushes and processes pending outbox synchronization items.
 */
router.post('/sync-now', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const firestoreDb = req.app.get('db');
        const result = await processSyncQueue(50, firestoreDb);
        const health = await getSyncHealthStatus();
        return res.json({ success: true, ...result, currentHealth: health });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/database-settings/prune-outbox
 * Safely prunes completed SYNCED outbox records older than retentionDays.
 */
router.post('/prune-outbox', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const retentionDays = Number(req.body.retentionDays) || 7;
        const firestoreDb = req.app.get('db');
        const [mysqlPrune, fsPrune] = await Promise.all([
            pruneSyncedOutboxEvents(retentionDays),
            pruneFirestoreOutboxEvents(firestoreDb, retentionDays)
        ]);

        return res.json({
            success: true,
            retentionDays,
            mysql: mysqlPrune,
            firestore: fsPrune,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/database-settings/verify-parity
 * Deep continuous parity verification comparing all 13 canonical entities across Firestore and MySQL.
 */
router.post('/verify-parity', async (req, res) => {
    try {
        const firestoreDb = req.app.get('db');
        const parity = await computeContinuousParity(firestoreDb);
        
        // Format legacy-compatible parityTable alongside rich continuous telemetry
        const parityTable = Object.entries(parity.entities || {}).map(([entity, info]) => ({
            entity,
            firestore: info.firestoreCount,
            mysql: info.mysqlCount,
            diff: info.difference,
            match: info.isSynchronized,
            parityPercentage: info.parityPercentage
        }));

        return res.json({
            success: true,
            parityPercentage: parity.overallParityPercentage,
            status: parity.status,
            totalCheckedEntities: parity.totalCheckedEntities,
            divergentEntitiesCount: parity.divergentEntitiesCount,
            parityTable,
            details: parity.entities,
            timestamp: parity.checkedAt || new Date().toISOString()
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/admin/database-settings/conflicts
 * Returns active conflict records from sync_conflicts ledger.
 */
router.get('/conflicts', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM sync_conflicts WHERE resolution = "PENDING" ORDER BY created_at DESC LIMIT 50');
        return res.json({ success: true, conflicts: rows });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/admin/database-settings/dead-letter
 * Returns dead-letter outbox records.
 */
router.get('/dead-letter', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM sync_outbox WHERE status = "DEAD_LETTER" ORDER BY updated_at DESC LIMIT 50');
        return res.json({ success: true, deadLetters: rows });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/database-settings/retry-dead-letter
 * Resets dead-letter records to PENDING.
 */
router.post('/retry-dead-letter', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const pool = getPool();
        const [result] = await pool.query('UPDATE sync_outbox SET status = "PENDING", retry_count = 0 WHERE status = "DEAD_LETTER"');
        return res.json({ success: true, requeued: result.affectedRows });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/database-settings/test-connection
 * Tests connectivity to a specific backend without switching.
 */
router.post('/test-connection', async (req, res) => {
    try {
        const targetEngine = String(req.body.engine || '').trim().toLowerCase();
        if (targetEngine !== 'firestore' && targetEngine !== 'mysql') {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ENGINE', message: "Engine must be 'firestore' or 'mysql'." }
            });
        }

        const firestoreDb = req.app.get('db');
        const result = await testEngineConnectivity(targetEngine, firestoreDb);
        return res.json({ success: true, engine: targetEngine, result });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: { code: 'TEST_CONNECTION_FAILED', message: err.message }
        });
    }
});

/**
 * POST /api/admin/database-settings/initialize-schema
 * Initializes or verifies the MySQL database schema.
 */
router.post('/initialize-schema', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const result = await initializeSchema();
        if (!result.success) {
            return res.status(500).json({ success: false, error: result.error });
        }
        return res.json({ success: true, message: 'MySQL schema successfully initialized / verified.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/admin/database-settings
 * Handles database administration actions and rejects switching to decommissioned Firestore.
 */
router.post('/', requireRecentAdminAuthentication, async (req, res) => {
    try {
        const targetEngine = String(req.body.engine || '').trim().toLowerCase();

        if (targetEngine === 'firestore') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'FIRESTORE_DATA_PLANE_DECOMMISSIONED',
                    message: 'Google Cloud Firestore has been decommissioned as an application data plane. MariaDB / MySQL is 100% authoritative for all user and application data. Firebase is used exclusively for Identity & Authentication.'
                }
            });
        }

        if (targetEngine !== 'mysql') {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ENGINE', message: "Authoritative engine must be 'mysql'." }
            });
        }

        return res.json({
            success: true,
            engine: 'mysql',
            message: 'MariaDB / MySQL is currently active and 100% authoritative.'
        });
    } catch (err) {
        console.error('[DatabaseAdmin] Engine switch rejected:', err.message);
        return res.status(err.status || 500).json({
            success: false,
            error: {
                code: 'DATABASE_ADMIN_ERROR',
                message: err.message,
                requestId: res.locals?.requestId,
            }
        });
    }
});

module.exports = { databaseAdminRouter: router };

