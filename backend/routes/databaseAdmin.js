const express = require('express');
const { getActiveEngine, testEngineConnectivity, switchActiveEngine, getSwitchAuditLogs } = require('../database/engineManager');
const { initializeSchema } = require('../database/mysql');
const { requireSuperAdmin, requirePermission } = require('../security/auth');

const router = express.Router();

// Super Admin / Admin access gate for all database control plane endpoints
router.use(requirePermission('system.config.write'));

/**
 * GET /api/admin/database-settings
 * Returns the current active database engine, live health checks, and audit history.
 */
router.get('/', async (req, res) => {
    try {
        const firestoreDb = req.app.get('db');
        const activeEngine = getActiveEngine();

        // Perform parallel connectivity checks
        const [firestoreStatus, mysqlStatus, recentAudits] = await Promise.all([
            testEngineConnectivity('firestore', firestoreDb),
            testEngineConnectivity('mysql', firestoreDb),
            getSwitchAuditLogs(),
        ]);

        return res.json({
            success: true,
            activeEngine,
            engineDetails: {
                current: activeEngine,
                firestore: firestoreStatus,
                mysql: mysqlStatus,
            },
            recentAudits,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[DatabaseAdmin] Failed to load settings:', err.message);
        return res.status(500).json({
            success: false,
            error: { code: 'DATABASE_SETTINGS_ERROR', message: err.message, requestId: res.locals.requestId }
        });
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
router.post('/initialize-schema', async (req, res) => {
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
 * Atomically switches the database engine after validating target connectivity.
 */
router.post('/', async (req, res) => {
    try {
        const targetEngine = String(req.body.engine || '').trim().toLowerCase();
        if (targetEngine !== 'firestore' && targetEngine !== 'mysql') {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ENGINE', message: "Target engine must be 'firestore' or 'mysql'." }
            });
        }

        const firestoreDb = req.app.get('db');
        const switchedBy = req.user?.email || req.user?.uid || 'SUPER_ADMIN';

        const result = await switchActiveEngine(targetEngine, switchedBy, firestoreDb);
        return res.json(result);
    } catch (err) {
        console.error('[DatabaseAdmin] Engine switch rejected:', err.message);
        return res.status(err.status || 500).json({
            success: false,
            error: {
                code: 'DATABASE_SWITCH_FAILED',
                message: err.message,
                details: err.details || null,
                requestId: res.locals.requestId,
            }
        });
    }
});

module.exports = { databaseAdminRouter: router };
