'use strict';

/**
 * Controlled error responses for data-plane failures (mission §6).
 *
 * When MySQL/MariaDB is unavailable the repository layer throws errors tagged
 * with status 503 and codes DATABASE_UNAVAILABLE / SERVICE_DEGRADED. Routes
 * must surface those controlled errors transparently — never fabricate
 * success, never mask an outage as an opaque 500, and never silently switch
 * to another database.
 */
// Raw transport-level codes are normalized to a controlled domain code so an
// outage is reported consistently and no driver internals leak to clients.
const TRANSPORT_CODES = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ETIMEOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'PROTOCOL_CONNECTION_LOST',
    'ER_CON_COUNT_ERROR', 'ER_SERVER_SHUTDOWN', 'POOL_CLOSED', 'EQUEUELIMIT',
]);

function replyRepoError(res, err, fallbackMessage) {
    const status = Number(err?.status) >= 400 && Number(err?.status) < 600 ? err.status : 500;
    let code = err?.code && /^[A-Z][A-Z0-9_]{2,48}$/.test(err.code) ? err.code : (status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR');
    if (status === 503 && (TRANSPORT_CODES.has(code) || code === 'DATABASE_UNAVAILABLE' || code === 'SERVICE_DEGRADED')) {
        code = 'DATABASE_UNAVAILABLE';
    }
    const payload = {
        success: false,
        code,
        error: status === 503
            ? (err?.message || 'The database is temporarily unavailable. Your request was not processed; no data was written.')
            : (err?.message || fallbackMessage),
        requestId: res.locals?.requestId,
    };
    if (err?.remoteRevision !== undefined) payload.remoteRevision = err.remoteRevision;
    return res.status(status).json(payload);
}

module.exports = { replyRepoError };
