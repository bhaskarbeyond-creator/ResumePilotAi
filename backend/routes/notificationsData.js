const express = require('express');
const { getRepository } = require('../repositories');
const { requirePermission } = require('../security/auth');
const router = express.Router();

/* ────────────────────────────────────────────────────────────────────────────
 * The candidate notification feed.
 *
 * Every route here is owner-scoped by the authenticated uid: the queries carry
 * `user_id = ?` and the uid always comes from the verified token, never from
 * the request body or query string. A row that belongs to another account is
 * answered exactly like a row that does not exist (404), so the API never
 * confirms that someone else's notification is real.
 * ──────────────────────────────────────────────────────────────────────────── */

// Same shape the PATCH route has always accepted; ids are opaque strings.
const NOTIFICATION_ID = /^[A-Za-z0-9_-]{1,128}$/;
// Documented paging ceiling. A caller asking for more is clamped, not failed.
const MAX_PAGE_LIMIT = 500;

router.use((req, res, next) => {
    try {
        req.repository = req.repository || getRepository();
        next();
    } catch (_err) {
        return res.status(503).json({ success: false, code: 'APPLICATION_DATABASE_UNAVAILABLE', error: 'Database layer unavailable' });
    }
});

/** The feed is private to one user, so no response may be stored by a proxy. */
function noStore(res) {
    res.setHeader('Cache-Control', 'no-store, private');
}

function unauthorized(res) {
    return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Sign in to read your notifications.' });
}

/**
 * A notification counts as read when the repository says so (`read`) or when the
 * raw row is still numeric (`is_read`), so both shapes answer the same way.
 */
function isRead(row) {
    return row?.read === true || row?.is_read === 1 || row?.is_read === true;
}

/** MySQL returns a Date for TIMESTAMP columns; the in-memory store returns ISO strings. */
function timestampOf(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Date.parse(typeof value === 'string' ? value : '');
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Newest first. The sort is stable and only moves rows that carry a real
 * timestamp, so the repository's own ordering is preserved for rows written in
 * the same second (and for stores that return rows without timestamps at all).
 */
function newestFirst(rows) {
    return rows
        .map((row, index) => ({ row, index }))
        .sort((left, right) => {
            const delta = timestampOf(right.row?.created_at ?? right.row?.createdAt)
                - timestampOf(left.row?.created_at ?? left.row?.createdAt);
            return delta !== 0 ? delta : left.index - right.index;
        })
        .map((entry) => entry.row);
}

/** Parse a non-negative integer query parameter, or return undefined when absent. */
function readCount(raw) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (Array.isArray(raw)) return null; // repeated parameter: ambiguous, reject
    const text = String(raw).trim();
    if (!/^\d{1,9}$/.test(text)) return null;
    return Number.parseInt(text, 10);
}

function databaseFailure(res, error, fallbackMessage) {
    const code = String(error?.code || '');
    const unavailable = [
        'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
        'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_ACCESS_DENIED_ERROR',
        'APPLICATION_DATABASE_UNAVAILABLE',
    ].includes(code);
    // Codes only: notification titles/messages never reach a log line.
    console.error('[Notifications]', { operation: fallbackMessage, code: code || error?.name || 'ERROR' });
    return res.status(unavailable ? 503 : 500).json({
        success: false,
        code: unavailable ? 'APPLICATION_DATABASE_UNAVAILABLE' : 'NOTIFICATION_STORE_ERROR',
        error: unavailable ? 'The notification store is unavailable. Nothing was changed.' : fallbackMessage,
    });
}

// GET /api/notifications-data — the caller's notifications, newest first.
//
// Optional query parameters (all validated; an invalid value is a 400 rather
// than a silent reinterpretation):
//   limit  1..500   page size (omitted: the whole feed, as it always returned)
//   offset >= 0     rows to skip, applied after sorting and filtering
//   unread  true|1  only unread rows
router.get('/', async (req, res) => {
    if (!req.user?.uid) return unauthorized(res);

    const limit = readCount(req.query.limit);
    if (limit === null) {
        return res.status(400).json({ success: false, code: 'INVALID_PAGINATION', error: 'limit must be a whole number of notifications.' });
    }
    const offset = readCount(req.query.offset);
    if (offset === null) {
        return res.status(400).json({ success: false, code: 'INVALID_PAGINATION', error: 'offset must be a whole number of notifications.' });
    }
    const unreadParam = req.query.unread;
    if (unreadParam !== undefined && !['true', '1', 'false', '0'].includes(String(unreadParam))) {
        return res.status(400).json({ success: false, code: 'INVALID_FILTER', error: 'unread must be true or false.' });
    }
    const unreadOnly = unreadParam === 'true' || unreadParam === '1';
    const pageLimit = limit === undefined ? null : Math.min(Math.max(limit, 1), MAX_PAGE_LIMIT);
    const pageOffset = offset ?? 0;

    try {
        const rows = await req.repository.getNotifications(req.user.uid);
        const sorted = newestFirst(Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object');
        const filtered = unreadOnly ? sorted.filter((row) => !isRead(row)) : sorted;
        const notifications = pageLimit === null
            ? (pageOffset ? filtered.slice(pageOffset) : filtered)
            : filtered.slice(pageOffset, pageOffset + pageLimit);
        noStore(res);
        return res.json({
            success: true,
            notifications,
            page: {
                total: filtered.length,
                limit: pageLimit,
                offset: pageOffset,
                hasMore: pageLimit === null ? false : pageOffset + notifications.length < filtered.length,
            },
        });
    } catch (error) {
        return databaseFailure(res, error, 'Failed to fetch notifications');
    }
});

// PATCH /api/notifications-data/:id — set one row's read state.
//
// The write is a single atomic UPDATE constrained by BOTH the id and the
// caller's uid, then re-read under the same constraint: the response carries the
// state that is actually persisted, and re-sending the current state is a
// success rather than a spurious 404 (MySQL reports zero *changed* rows for a
// no-op UPDATE). A row owned by someone else and a row that does not exist
// produce the identical 404.
router.patch('/:id', async (req, res) => {
    if (!req.user?.uid) return unauthorized(res);

    const notificationId = String(req.params.id || '');
    if (!NOTIFICATION_ID.test(notificationId)) {
        return res.status(400).json({ success: false, code: 'INVALID_NOTIFICATION_ID', error: 'Invalid notification id.' });
    }
    const body = req.body;
    if (!body || typeof body.read !== 'boolean' || Object.keys(body).some((key) => key !== 'read')) {
        return res.status(400).json({ success: false, code: 'NOTIFICATION_PATCH_INVALID', error: 'Only the read state can be updated.' });
    }
    const read = body.read;
    const uid = req.user.uid;

    let pool;
    try {
        pool = require('../database/mysql').getPool();
    } catch (error) {
        return databaseFailure(res, error, 'Failed to update notification');
    }

    try {
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [read ? 1 : 0, notificationId, uid]
        );
        if (Number(result?.affectedRows) > 0) {
            // A changed row is the persisted state: report it, nothing to re-read.
            noStore(res);
            return res.json({ success: true, notification: { id: notificationId, read } });
        }
        // Zero *changed* rows means either the row already held this state or the
        // caller does not own it. The owner-scoped read decides which, so setting
        // the state twice is a success while another account's row stays a 404.
        const [rows] = await pool.query(
            'SELECT id, is_read FROM notifications WHERE id = ? AND user_id = ?',
            [notificationId, uid]
        );
        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (!row || row.id !== notificationId) {
            return res.status(404).json({ success: false, code: 'NOTIFICATION_NOT_FOUND', error: 'Notification not found' });
        }
        noStore(res);
        return res.json({
            success: true,
            notification: { id: row.id, read: row.is_read === 1 || row.is_read === true },
        });
    } catch (error) {
        return databaseFailure(res, error, 'Failed to update notification');
    }
});

// POST /api/notifications-data/mark-all-read — mark every UNREAD notification
// belonging to the CURRENT user as read (DIR-055 S3).
//
// Owner-scoped by construction: the UPDATE is constrained by `user_id = ?`, so
// it can never touch another tenant's rows. Additive endpoint — it does not
// alter the existing GET or PATCH contracts. Idempotent: a second call finds no
// unread rows and reports 0 changed, which is the real number, not an estimate.
router.post('/mark-all-read', async (req, res) => {
    if (!req.user?.uid) return unauthorized(res);

    let pool;
    try {
        pool = require('../database/mysql').getPool();
    } catch (error) {
        return databaseFailure(res, error, 'Failed to mark notifications as read');
    }

    try {
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0',
            [req.user.uid]
        );
        const changed = Number(result?.affectedRows);
        noStore(res);
        return res.json({ success: true, updated: Number.isFinite(changed) && changed > 0 ? changed : 0 });
    } catch (error) {
        return databaseFailure(res, error, 'Failed to mark notifications as read');
    }
});

// GET /api/notifications-data/contact/list - List contact submissions (Admin / messages.read permission required)
router.get('/contact/list', requirePermission('messages.read'), async (req, res) => {
    try {
        const messages = await req.repository.getContactMessages();
        return res.json({ success: true, messages });
    } catch (error) {
        return databaseFailure(res, error, 'Failed to fetch contact messages');
    }
});

module.exports = { notificationsDataRouter: router };
