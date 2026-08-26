'use strict';

/**
 * Durable account-deletion workflow.
 *
 * Delete Request → deletion mutation on write-authority → tombstones →
 * outbox → secondary → identity deletion → verification.
 *
 * Never reports success if application data remains. If Firebase Auth is
 * unavailable after data is gone, the request stays IDENTITY_PENDING and is
 * retryable. Sync cannot resurrect a tombstoned user.
 */

const { createMutationId } = require('../database/canonical');
const { emitAlert, ALERT_TYPES } = require('../database/alerts');

function fail(code, status, message) {
    const err = new Error(message || code);
    err.code = code;
    err.status = status;
    return err;
}

function repoFor(firestoreDb, repo) {
    if (repo) return repo;
    return require('../repositories').getRepository(firestoreDb || null);
}

const STATES = Object.freeze({
    REQUESTED: 'REQUESTED',
    IN_PROGRESS: 'IN_PROGRESS',
    IDENTITY_PENDING: 'IDENTITY_PENDING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
});

async function loadRequest(r, uid) {
    if (typeof r.getDocument === 'function') {
        return r.getDocument('deletion_requests', uid);
    }
    return null;
}

async function saveRequest(r, uid, data) {
    if (typeof r.saveDocument === 'function') {
        return r.saveDocument('deletion_requests', uid, data);
    }
    throw fail('DELETION_STORE_UNAVAILABLE', 503, 'Deletion ledger is unavailable.');
}

async function executeOwnedCleanup(r, uid, failures) {
    const tryRun = async (label, fn) => {
        try { await fn(); } catch { failures.push(label); }
    };

    if (typeof r.getJobs === 'function') {
        await tryRun('employer jobs', async () => {
            const jobs = await r.getJobs({ employerId: uid, limit: 500 });
            for (const job of jobs || []) {
                if (typeof r.deleteJob === 'function') await r.deleteJob(job.id);
            }
        });
    }
    if (typeof r.getApplications === 'function') {
        await tryRun('job applications', async () => {
            const apps = await r.getApplications({ applicantId: uid });
            for (const app of apps || []) {
                if (typeof r.deleteApplication === 'function') await r.deleteApplication(app.id);
            }
        });
    }
    if (typeof r.getPortfolios === 'function') {
        await tryRun('portfolios', async () => {
            const items = await r.getPortfolios(uid);
            for (const item of items || []) {
                if (typeof r.deletePortfolio === 'function') await r.deletePortfolio(uid, item.id);
            }
        });
    }
    if (typeof r.getResumes === 'function') {
        await tryRun('resumes', async () => {
            const items = await r.getResumes(uid);
            for (const item of items || []) {
                if (typeof r.deleteResume === 'function') await r.deleteResume(uid, item.id);
            }
        });
    }
    if (typeof r.getCovers === 'function') {
        await tryRun('covers', async () => {
            const items = await r.getCovers(uid);
            for (const item of items || []) {
                if (typeof r.deleteCover === 'function') await r.deleteCover(uid, item.id);
            }
        });
    }
    if (typeof r.getCompanies === 'function') {
        await tryRun('companies', async () => {
            const items = await r.getCompanies({ employerId: uid });
            for (const item of items || []) {
                if (typeof r.deleteCompany === 'function') await r.deleteCompany(item.id);
            }
        });
    }
    if (typeof r.deleteDocument === 'function') {
        await tryRun('employer application', () => r.deleteDocument('employer_applications', uid));
    }
    if (typeof r.deleteUser === 'function') {
        await tryRun('user profile', () => r.deleteUser(uid));
    }
}

async function requestDeletion({ uid, actorUid, requestId, firestoreDb, repo, identityAdmin, removeRealtime }) {
    const r = repoFor(firestoreDb, repo);
    const existing = await loadRequest(r, uid);
    if (existing?.status === STATES.COMPLETED) {
        return { success: true, duplicate: true, status: STATES.COMPLETED };
    }
    const mutationId = existing?.mutationId || createMutationId('del');
    const revision = Number(existing?.revision || 0) + 1;
    const record = {
        id: uid,
        uid,
        status: STATES.IN_PROGRESS,
        mutationId,
        revision,
        actorUid: actorUid || uid,
        requestId,
        failures: [],
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await saveRequest(r, uid, record);

    const failures = [];
    await executeOwnedCleanup(r, uid, failures);
    if (typeof removeRealtime === 'function') {
        try { await removeRealtime(uid); } catch { failures.push('realtime messaging'); }
    }

    if (failures.length) {
        await saveRequest(r, uid, {
            ...record,
            status: STATES.FAILED,
            failures,
            updatedAt: new Date().toISOString(),
            revision: revision + 1,
        });
        if (typeof r.recordSecurityAuditLog === 'function') {
            await r.recordSecurityAuditLog({
                action: 'ACCOUNT_DELETION_INCOMPLETE', actorUid: actorUid || uid, targetUid: uid,
                cleanupFailures: failures, requestId,
            }).catch(() => {});
        }
        const err = fail('ACCOUNT_CLEANUP_INCOMPLETE', 500, `Cleanup failed for: ${failures.join(', ')}. Identity remains active; retry deletion.`);
        err.failures = failures;
        throw err;
    }

    let identityDeleted = false;
    if (identityAdmin?.auth) {
        try {
            await identityAdmin.auth().deleteUser(uid);
            identityDeleted = true;
        } catch (err) {
            if (err.code !== 'auth/user-not-found') {
                await saveRequest(r, uid, {
                    ...record,
                    status: STATES.IDENTITY_PENDING,
                    identityError: String(err.message || err).slice(0, 300),
                    updatedAt: new Date().toISOString(),
                    revision: revision + 1,
                });
                emitAlert(ALERT_TYPES.PAYMENT_ACTIVATION_PARTIAL, {
                    severity: 'HIGH',
                    message: 'Account data deleted but Firebase identity remains; retry identity deletion',
                    uid,
                });
                const pending = fail('ACCOUNT_IDENTITY_DELETE_FAILED', 500, 'Owned application data was removed, but the Firebase identity could not be deleted. Retry immediately.');
                pending.identityPending = true;
                throw pending;
            }
            identityDeleted = true;
        }
    }

    await saveRequest(r, uid, {
        ...record,
        status: STATES.COMPLETED,
        identityDeleted,
        failures: [],
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: revision + 1,
    });
    if (typeof r.recordSecurityAuditLog === 'function') {
        await r.recordSecurityAuditLog({
            action: 'ACCOUNT_SELF_DELETED',
            actorUid: actorUid || uid,
            targetUid: uid,
            retainedRecordTypes: ['payment_orders', 'invoices', 'transactions', 'subscriptions', 'security_audit_logs', 'deletion_requests'],
            requestId,
        }).catch(() => {});
    }
    return {
        success: true,
        status: STATES.COMPLETED,
        identityDeleted,
        mutationId,
        retainedRecordTypes: ['payment_orders', 'invoices', 'transactions', 'subscriptions', 'security_audit_logs', 'deletion_requests'],
    };
}

module.exports = {
    STATES,
    requestDeletion,
    loadRequest,
    saveRequest,
};
