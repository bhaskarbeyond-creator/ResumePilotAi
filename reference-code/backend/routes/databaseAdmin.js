'use strict';

const express = require('express');
const { getMigrationStatus, initializeSchema, getPool, testConnection } = require('../database/mysql');
const { getEngineStateConsistency } = require('../database/engineManager');
const { requirePermission, requireRecentAdminAuthentication } = require('../security/auth');

const router = express.Router();
router.use(requirePermission('system.config.write'));

async function queueCounts() {
    const pool = getPool();
    const count = async (table, stateColumn, activeStates, deadState = 'DEAD_LETTER') => {
        try {
            const placeholders = activeStates.map(() => '?').join(',');
            const [rows] = await pool.query(
                `SELECT
                   SUM(CASE WHEN \`${stateColumn}\` IN (${placeholders}) THEN 1 ELSE 0 END) AS active_count,
                   SUM(CASE WHEN \`${stateColumn}\` = ? THEN 1 ELSE 0 END) AS dead_count
                 FROM \`${table}\``,
                [...activeStates, deadState]
            );
            return {
                configured: true,
                active: Number(rows[0]?.active_count || 0),
                deadLetter: Number(rows[0]?.dead_count || 0),
            };
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') return { configured: false, active: null, deadLetter: null };
            throw error;
        }
    };
    const [notifications, enterpriseJobs] = await Promise.all([
        count('notification_outbox', 'state', ['NOTIFICATION_QUEUED', 'DELIVERY_ATTEMPTED', 'RETRYING']),
        count('enterprise_outbox', 'status', ['QUEUED', 'PROCESSING', 'RETRYING']),
    ]);
    return { notifications, enterpriseJobs };
}

router.get('/', async (_req, res) => {
    try {
        const [database, consistency, queues] = await Promise.all([
            testConnection(),
            getEngineStateConsistency(),
            queueCounts().catch(() => ({ error: 'Queue telemetry is unavailable.' })),
        ]);
        let tablesCount = null;
        let migrations = null;
        if (database.connected) {
            const [tables] = await getPool().query('SHOW TABLES');
            tablesCount = tables.length;
            const status = await getMigrationStatus();
            migrations = {
                appliedCount: status.applied.length,
                pending: status.pending,
                mismatches: status.mismatches,
                unknownApplied: status.unknownApplied,
                current: status.pending.length === 0 && status.mismatches.length === 0 && status.unknownApplied.length === 0,
            };
        }
        return res.json({
            success: true,
            activeEngine: 'mysql',
            authoritativeDatabase: 'mariadb',
            ownershipMutable: false,
            identityProvider: 'firebase-auth',
            database,
            tablesCount,
            migrations,
            consistency,
            queues,
            backupVerification: { status: 'NOT VERIFIED', reason: 'No live restore evidence is attached to this runtime.' },
            timestamp: new Date().toISOString(),
        });
    } catch (_error) {
        return res.status(503).json({
            success: false,
            error: { code: 'DATABASE_SETTINGS_UNAVAILABLE', message: 'Database telemetry is unavailable.', requestId: res.locals?.requestId },
        });
    }
});

const retiredDatabaseControl = (_req, res) => res.status(410).json({
    success: false,
    error: {
        code: 'LEGACY_DATABASE_CONTROL_RETIRED',
        message: 'Cross-database replication controls are not part of the single-owner architecture.',
    },
});
router.get('/sync-status', retiredDatabaseControl);
for (const path of ['/sync-now', '/verify-parity']) router.post(path, requireRecentAdminAuthentication, retiredDatabaseControl);

router.post('/prune-outbox', requireRecentAdminAuthentication, async (req, res) => {
    const retentionDays = Number(req.body?.retentionDays);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_OUTBOX_RETENTION', message: 'Retention must be a whole number from 1 to 365 days.' } });
    }
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);
    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();
        // Preserve the last terminal invitation delivery state before its outbox
        // row ages out; live rows remain authoritative through the join.
        await connection.query(
            `UPDATE enterprise_membership_invitations i
             JOIN notification_outbox o ON o.id = i.notificationId
             SET i.deliveryState = o.state,
                 i.deliveredAt = CASE WHEN o.state = 'DELIVERED' THEN COALESCE(i.deliveredAt, o.provider_accepted_at) ELSE i.deliveredAt END,
                 i.lastDeliveryError = o.last_error,
                 i.updated_at = NOW(6)
             WHERE o.state IN ('DELIVERED', 'DEAD_LETTER', 'CANCELLED') AND o.updated_at < ?`,
            [cutoff]
        );
        const [notifications] = await connection.query(
            `DELETE FROM notification_outbox
             WHERE state IN ('DELIVERED', 'DEAD_LETTER', 'CANCELLED') AND updated_at < ?
             LIMIT 1000`,
            [cutoff]
        );
        const [enterpriseJobs] = await connection.query(
            `DELETE FROM enterprise_outbox
             WHERE status IN ('COMPLETED', 'REJECTED', 'DEAD_LETTER') AND updated_at < ?
             LIMIT 1000`,
            [cutoff]
        );
        await connection.commit();
        return res.json({
            success: true,
            retentionDays,
            pruned: {
                notifications: Number(notifications?.affectedRows || 0),
                enterpriseJobs: Number(enterpriseJobs?.affectedRows || 0),
            },
        });
    } catch (_error) {
        await connection.rollback().catch(() => {});
        return res.status(503).json({ success: false, error: { code: 'OUTBOX_PRUNE_FAILED', message: 'Terminal outbox records could not be pruned.' } });
    } finally {
        connection.release();
    }
});

router.get('/conflicts', retiredDatabaseControl);

router.get('/dead-letter', async (_req, res) => {
    try {
        const [notifications, enterpriseJobs] = await Promise.all([
            getPool().query("SELECT id, event_id, state, attempt_count, last_error, updated_at FROM notification_outbox WHERE state = 'DEAD_LETTER' ORDER BY updated_at DESC LIMIT 50").then(([rows]) => rows),
            getPool().query("SELECT id AS job_id, tenantId AS tenant_id, jobType AS job_type, status, attemptCount AS attempt_count, lastError AS last_error, updated_at FROM enterprise_outbox WHERE status = 'DEAD_LETTER' ORDER BY updated_at DESC LIMIT 50").then(([rows]) => rows),
        ]);
        return res.json({ success: true, deadLetters: { notifications, enterpriseJobs } });
    } catch (_error) {
        return res.status(503).json({ success: false, error: { code: 'DEAD_LETTER_UNAVAILABLE', message: 'Dead-letter telemetry is unavailable.' } });
    }
});

router.post('/retry-dead-letter', requireRecentAdminAuthentication, (_req, res) => res.status(400).json({
    success: false,
    error: { code: 'BULK_REPLAY_FORBIDDEN', message: 'Dead letters must be reviewed and replayed individually with an idempotency key.' },
}));

router.post('/test-connection', async (req, res) => {
    const target = String(req.body?.engine || '').trim().toLowerCase();
    if (!['mysql', 'mariadb'].includes(target)) {
        return res.status(400).json({
            success: false,
            error: { code: 'DATABASE_ENGINE_UNSUPPORTED', message: 'Only the authoritative MariaDB connection can be tested.' },
        });
    }
    const result = await testConnection();
    return res.status(result.connected ? 200 : 503).json({ success: result.connected, engine: 'mysql', result });
});

router.post('/initialize-schema', requireRecentAdminAuthentication, async (req, res) => {
    if (req.body?.confirmation !== 'APPLY CHECKSUMMED MIGRATIONS') {
        return res.status(400).json({
            success: false,
            error: { code: 'MIGRATION_CONFIRMATION_REQUIRED', message: 'Explicit migration confirmation is required.' },
        });
    }
    const result = await initializeSchema({ mode: 'apply' });
    return res.status(result.success ? 200 : (result.code === 'PRODUCTION_MIGRATION_BACKUP_REQUIRED' ? 412 : 500)).json(result.success
        ? { success: true, message: 'MariaDB migrations applied and verified.', applied: result.applied }
        : { success: false, error: { code: result.code, message: result.error, migration: result.migration } });
});

router.post('/', requireRecentAdminAuthentication, (req, res) => {
    const target = String(req.body?.engine || '').trim().toLowerCase();
    if (['mysql', 'mariadb'].includes(target)) {
        return res.json({ success: true, engine: 'mysql', unchanged: true, ownershipMutable: false });
    }
    return res.status(409).json({
        success: false,
        error: { code: 'DATABASE_OWNER_IMMUTABLE', message: 'MariaDB ownership cannot be switched at runtime.' },
    });
});

module.exports = { databaseAdminRouter: router, queueCounts };
