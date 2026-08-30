'use strict';

const express = require('express');

/**
 * Health, liveness, readiness, and observability routes.
 *
 * Dependencies are injected via the factory so the router stays testable
 * and does not import index.js (which would create a circular require).
 *
 * @param {object} deps
 * @param {object} deps.databaseAuthority - database authority module
 * @param {Function} deps.getPool - returns the MariaDB connection pool
 * @param {Function} deps.testMysql - tests MySQL connectivity
 * @param {Function} deps.getSchemaState - returns current schema bootstrap state
 * @param {Function} deps.getTenantService - returns the tenant service instance
 * @param {Function} deps.maybeQueueReadyzAlert - readiness alert dispatcher
 * @param {Function} deps.getExportStatus - export concurrency status
 * @param {object} deps.admin - Firebase Admin instance (may be null)
 * @param {string} deps.globalCommitSha - current deployment commit SHA
 */
function createHealthRouter(deps) {
    const router = express.Router();
    const {
        databaseAuthority,
        getPool,
        testMysql,
        getSchemaState,
        getTenantService,
        maybeQueueReadyzAlert,
        getExportStatus,
        admin,
        globalCommitSha,
    } = deps;

    function databaseHealthPayload() {
        const status = databaseAuthority.getStatus();
        const mariadbHealth = status.health.mysql;
        const databaseState = mariadbHealth.healthy === true ? 'UP' : (mariadbHealth.healthy === false ? 'DOWN' : 'UNKNOWN');
        return {
            mariadb: {
                status: databaseState,
                healthy: mariadbHealth.healthy,
                lastError: mariadbHealth.lastError,
                latencyMs: mariadbHealth.latencyMs,
            },
            authority: {
                mode: status.mode,
                owner: 'MARIADB',
                mutable: false,
                canAcceptWrites: status.canAcceptWrites,
                lastRecoveryAt: status.lastRecoveryAt,
            },
        };
    }

    function livenessPayload() {
        return {
            status: 'ok',
            identityProviderConfigured: Boolean(admin && admin.apps && admin.apps.length > 0),
            firebaseAdminConfigured: Boolean(admin && admin.apps && admin.apps.length > 0),
            firestoreDataPlane: 'REMOVED',
            authoritativeDatabase: 'MARIADB',
            date: new Date().toISOString(),
            commitSha: globalCommitSha,
            databases: databaseHealthPayload(),
        };
    }

    async function computeReadyzPayload() {
        const mysql = await testMysql();
        const schema = getSchemaState();
        const tenantService = getTenantService();
        const enterpriseRuntime = tenantService?.describeRuntime ? tenantService.describeRuntime() : null;

        const ready = mysql.connected === true;
        return {
            status: ready ? 'ready' : 'not_ready',
            authoritativeDatabase: 'MARIADB',
            checks: {
                mysql: ready
                    ? { status: 'READY', latencyMs: mysql.latencyMs, version: mysql.version, host: mysql.host, database: mysql.database }
                    : { status: 'UNAVAILABLE', error: mysql.error, code: mysql.code },
                schema: schema.success ? 'INITIALIZED' : `INCOMPLETE (${schema.error || 'unknown'})`,
                identityProvider: (admin && admin.apps && admin.apps.length > 0) ? 'CONFIGURED' : 'NOT_CONFIGURED',
                firestoreDataPlane: 'REMOVED',
                enterprise: enterpriseRuntime ? {
                    dataProvider: enterpriseRuntime.dataProvider,
                    dataPlaneConfigured: enterpriseRuntime.dataPlaneConfigured === true,
                    encryption: enterpriseRuntime.encryption?.provider || 'none',
                    quotaStore: enterpriseRuntime.quotaStore,
                    queue: 'mysql-transactional-outbox',
                } : 'UNAVAILABLE',
                aiProviders: 'NOT_CHECKED', paymentProviders: 'NOT_CHECKED', smtp: 'NOT_CHECKED',
                cmsScheduler: process.env.CMS_SCHEDULER_ENABLED === 'true' ? 'CONFIGURED' : 'DISABLED',
                notificationOutbox: process.env.NOTIFICATION_OUTBOX_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : process.env.NOTIFICATION_OUTBOX_EXTERNAL_WORKER === 'true' ? 'EXTERNAL_WORKER_DECLARED' : 'DISABLED',
                tenantGc: process.env.TENANT_GC_WORKER_ENABLED === 'true' ? 'LOCAL_WORKER_CONFIGURED' : 'DISABLED',
                pdfIsolation: process.env.PDF_RENDERER_ISOLATED === 'true' ? 'DECLARED_ISOLATED' : 'REQUIRES_ISOLATED_WORKER',
            },
        };
    }

    // Liveness
    router.get('/healthz', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        return res.json(livenessPayload());
    });

    router.get('/health', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        return res.json(livenessPayload());
    });

    // Database health
    router.get('/health/databases', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const snapshot = await databaseAuthority.refresh();
            return res.json({ success: true, ...snapshot });
        } catch (_error) {
            return res.status(503).json({ success: false, error: { code: 'HEALTH_PROBE_FAILED', message: 'Database health could not be determined', requestId: res.locals.requestId } });
        }
    });

    // AI Provider Health
    router.get('/health/ai-providers', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const { providerHealth } = require('../services/aiRuntime');
            const summary = providerHealth.getHealthSummary();
            return res.json({ success: true, providers: summary, timestamp: new Date().toISOString() });
        } catch (_error) {
            return res.status(503).json({ success: false, error: { code: 'AI_HEALTH_UNAVAILABLE', message: 'AI provider health could not be determined', requestId: res.locals.requestId } });
        }
    });

    // Export concurrency status
    router.get('/health/export-concurrency', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const status = await getExportStatus();
            return res.json({ success: true, exports: status, timestamp: new Date().toISOString() });
        } catch (_error) {
            return res.status(503).json({ success: false, error: { code: 'EXPORT_STATUS_UNAVAILABLE', message: 'Export concurrency status could not be determined', requestId: res.locals.requestId } });
        }
    });

    // Readiness
    router.get('/readyz', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const payload = await computeReadyzPayload();
        const healthy = payload.status === 'ready';
        try { maybeQueueReadyzAlert({ healthy, pool: getPool() }); } catch (error) {
            console.error('[readyz] alert dispatch failed:', error.message);
        }
        return res.status(healthy ? 200 : 503).json(payload);
    });

    return router;
}

module.exports = { createHealthRouter };
