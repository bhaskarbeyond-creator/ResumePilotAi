'use strict';

/**
 * Support helpdesk persistence (DISC-029 / DISC-047 / DISC-052).
 *
 * Tables (see database/migrations/015_support_tickets.sql):
 *   support_tickets        id, user_id, subject, status, priority, created_at, updated_at
 *   support_ticket_messages id, ticket_id, author_uid, author_role, body, created_at
 *
 * The schema's status CHECK constraint stores OPEN | PENDING | RESOLVED | CLOSED.
 * The public lifecycle language is OPEN | IN_PROGRESS | RESOLVED | CLOSED, so
 * PENDING <-> IN_PROGRESS is the one explicit, tested mapping below. There is no
 * ticket `category` column and no resolution-note column: category is validated
 * at the edge, and staff transition metadata (including any resolution note) is
 * written to the existing security_audit_logs audit facility.
 */

const crypto = require('crypto');
const { getPool } = require('../database/mysql');

/** Stored statuses permitted by the schema CHECK constraint. */
const DB_STATUSES = new Set(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']);
/** Lifecycle statuses exposed by the API. */
const STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
// The legacy public contract accepts low|medium|high; MEDIUM is normalized to
// NORMAL for storage (the ticket table CHECK constraint governs persisted values).
const ACCEPTED_PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'MEDIUM']);
const STAFF_ROLES = new Set(['SUPPORT', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Allowed staff transitions, in stored (database) terms. A transition to the
 * same status is an accepted no-op. Anything else is a 409: the lifecycle must
 * not be regressed or invented by a request.
 */
const TRANSITIONS = Object.freeze({
  OPEN: new Set(['PENDING', 'RESOLVED', 'CLOSED']),
  PENDING: new Set(['OPEN', 'RESOLVED', 'CLOSED']),
  RESOLVED: new Set(['OPEN', 'CLOSED']),
  CLOSED: new Set(['OPEN']),
});

/** Reply policy: a closed ticket is frozen until staff reopen it. */
const REPLYABLE = new Set(['OPEN', 'PENDING', 'RESOLVED']);

const MAX_SUBJECT = 200;
const MAX_BODY = 8000;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 50;

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePriority(value) {
  return String(value || '').trim().toUpperCase();
}

/** API status -> stored status. */
function toDbStatus(value) {
  const normalized = normalizeStatus(value);
  return normalized === 'IN_PROGRESS' ? 'PENDING' : normalized;
}

/** Stored status -> API status. */
function toApiStatus(value) {
  const normalized = normalizeStatus(value);
  return normalized === 'PENDING' ? 'IN_PROGRESS' : normalized;
}

function storablePriority(value) {
  const normalized = normalizePriority(value);
  return normalized === 'MEDIUM' ? 'NORMAL' : normalized;
}

function fail(code, status, message) {
  return Object.assign(new Error(message || code), { code, status });
}

function cleanText(value, max) {
  return String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, max);
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    // Stored value kept verbatim; toApiStatus() is the single mapping point.
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorUid: row.author_uid,
    authorRole: row.author_role,
    body: row.body,
    createdAt: iso(row.created_at),
  };
}

function normalizeTicketId(ticketId) {
  const value = String(ticketId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(value)) {
    throw fail('TICKET_NOT_FOUND', 404, 'Ticket not found.');
  }
  return value;
}

function pageLimit(value, fallback = DEFAULT_PAGE_LIMIT) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_LIMIT) {
    throw fail('INVALID_PAGINATION', 400, `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}.`);
  }
  return parsed;
}

function pageOffset(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
    throw fail('INVALID_PAGINATION', 400, 'offset must be a non-negative integer.');
  }
  return parsed;
}

async function ensureUserRow(connection, uid, email) {
  await connection.query(
    'INSERT IGNORE INTO users (id, email, revision) VALUES (?, ?, 1)',
    [uid, email || '']
  );
}

/**
 * Best-effort transition audit. The status change is already committed, so a
 * failure here is logged (never swallowed) and reported to the caller as
 * auditRecorded: false instead of pretending the audit trail exists.
 */
async function recordTransitionAudit(pool, { ticketId, actorUid, actorRole, fromStatus, toStatus, resolutionNote, requestId }) {
  try {
    await pool.query(
      `INSERT INTO security_audit_logs
       (id, actor_uid, action, category, severity, target_type, target_id, metadata, request_id, created_at)
       VALUES (?, ?, 'SUPPORT_TICKET_STATUS_CHANGED', 'support.ticket', 'MEDIUM', 'support_ticket', ?, ?, ?, NOW())`,
      [
        crypto.randomUUID(),
        String(actorUid || 'unknown').slice(0, 128),
        ticketId,
        JSON.stringify({
          fromStatus,
          toStatus,
          actorRole: actorRole || null,
          resolutionNote: resolutionNote || null,
        }),
        requestId ? String(requestId).slice(0, 128) : null,
      ]
    );
    return true;
  } catch (error) {
    // Never fabricate the audit row: report the degradation the caller will see.
    console.error('[support] ticket transition audit could not be written:', error?.code || error?.message);
    return false;
  }
}

async function createTicket({ uid, email, subject, body, priority = 'NORMAL', category, pool = getPool() }) {
  if (!uid) throw fail('AUTH_REQUIRED', 401, 'Authentication required.');
  const cleanSubject = cleanText(subject, MAX_SUBJECT);
  const cleanBody = cleanText(body, MAX_BODY);
  const cleanPriority = storablePriority(priority);
  const cleanCategory = category === undefined || category === null ? undefined : String(category).toLowerCase();

  if (cleanSubject.length < 4) throw fail('INVALID_TICKET_SUBJECT', 400, 'A subject of at least four characters is required.');
  if (cleanBody.length < 8) throw fail('INVALID_TICKET_BODY', 400, 'A message of at least eight characters is required.');
  if (!ACCEPTED_PRIORITIES.has(normalizePriority(priority))) throw fail('INVALID_TICKET_PRIORITY', 400, 'Invalid ticket priority.');
  if (!PRIORITIES.has(cleanPriority)) throw fail('INVALID_TICKET_PRIORITY', 400, 'Invalid ticket priority.');
  if (cleanCategory !== undefined && !['technical', 'billing', 'general'].includes(cleanCategory)) {
    throw fail('INVALID_TICKET_CATEGORY', 400, 'Category must be technical, billing or general.');
  }

  const ticketId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureUserRow(connection, uid, email);
    await connection.query(
      `INSERT INTO support_tickets (id, user_id, subject, status, priority)
       VALUES (?, ?, ?, 'OPEN', ?)`,
      [ticketId, uid, cleanSubject, cleanPriority]
    );
    await connection.query(
      `INSERT INTO support_ticket_messages (id, ticket_id, author_uid, author_role, body)
       VALUES (?, ?, ?, 'USER', ?)`,
      [messageId, ticketId, uid, cleanBody]
    );
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      // The original failure is what the caller must see; the rollback failure
      // is logged rather than replacing it.
      console.error('[support] ticket creation rollback failed:', rollbackError?.code || rollbackError?.message);
    }
    throw error;
  } finally {
    connection.release();
  }
  return getTicket({ ticketId, uid, staff: false, pool });
}

async function listTicketsForUser({ uid, status, priority, limit, offset, pool = getPool() }) {
  if (!uid) throw fail('AUTH_REQUIRED', 401, 'Authentication required.');
  const filters = [];
  const params = [uid];
  if (status !== undefined && status !== null && String(status).length > 0) {
    const normalized = toDbStatus(status);
    if (!DB_STATUSES.has(normalized)) throw fail('INVALID_TICKET_STATUS', 400, 'Invalid ticket status filter.');
    filters.push('status = ?');
    params.push(normalized);
  }
  if (priority !== undefined && priority !== null && String(priority).length > 0) {
    const normalized = storablePriority(priority);
    if (!PRIORITIES.has(normalized)) throw fail('INVALID_TICKET_PRIORITY', 400, 'Invalid ticket priority filter.');
    filters.push('priority = ?');
    params.push(normalized);
  }
  const safeLimit = pageLimit(limit);
  const safeOffset = pageOffset(offset);
  const where = filters.length ? ` AND ${filters.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM support_tickets WHERE user_id = ?${where}
     ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );
  // hasMore is derived from a full page: no COUNT query, no invented totals.
  return {
    tickets: rows.map(mapTicket),
    limit: safeLimit,
    offset: safeOffset,
    hasMore: rows.length === safeLimit,
  };
}

async function listTicketsForStaff({ status, priority, limit, offset, pool = getPool() } = {}) {
  const filters = [];
  const params = [];
  if (status !== undefined && status !== null && String(status).length > 0) {
    const normalized = toDbStatus(status);
    if (!DB_STATUSES.has(normalized)) throw fail('INVALID_TICKET_STATUS', 400, 'Invalid ticket status filter.');
    filters.push('status = ?');
    params.push(normalized);
  }
  if (priority !== undefined && priority !== null && String(priority).length > 0) {
    const normalized = storablePriority(priority);
    if (!PRIORITIES.has(normalized)) throw fail('INVALID_TICKET_PRIORITY', 400, 'Invalid ticket priority filter.');
    filters.push('priority = ?');
    params.push(normalized);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const safeLimit = pageLimit(limit);
  const safeOffset = pageOffset(offset);
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM support_tickets ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );
  return {
    tickets: rows.map(mapTicket),
    limit: safeLimit,
    offset: safeOffset,
    hasMore: rows.length === safeLimit,
  };
}

async function getTicket({ ticketId, uid, staff = false, pool = getPool() }) {
  const id = normalizeTicketId(ticketId);
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM support_tickets WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length || (!staff && rows[0].user_id !== uid)) {
    throw fail('TICKET_NOT_FOUND', 404, 'Ticket not found.');
  }
  const [messages] = await pool.query(
    `SELECT id, ticket_id, author_uid, author_role, body, created_at
     FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC`,
    [id]
  );
  return { ...mapTicket(rows[0]), messages: messages.map(mapMessage) };
}

async function addMessage({ ticketId, uid, role, body, staff = false, pool = getPool() }) {
  if (!uid) throw fail('AUTH_REQUIRED', 401, 'Authentication required.');
  const cleanBody = cleanText(body, MAX_BODY);
  if (cleanBody.length < 1) throw fail('INVALID_TICKET_BODY', 400, 'A message is required.');

  const ticket = await getTicket({ ticketId, uid, staff, pool });
  if (!REPLYABLE.has(ticket.status)) {
    throw fail('TICKET_CLOSED', 409, 'This ticket is closed. A support agent must reopen it before it can be replied to.');
  }

  const actorRole = staff && STAFF_ROLES.has(String(role || '').toUpperCase())
    ? String(role).toUpperCase()
    : 'USER';

  // A staff reply starts work (OPEN -> PENDING); an owner reply to a resolved
  // ticket reopens it (RESOLVED -> OPEN). Both are real lifecycle transitions.
  const nextStatus = ticket.status === 'RESOLVED' && !staff
    ? 'OPEN'
    : (staff && ticket.status === 'OPEN' ? 'PENDING' : ticket.status);

  const messageId = crypto.randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO support_ticket_messages (id, ticket_id, author_uid, author_role, body)
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, ticket.id, uid, actorRole, cleanBody]
    );
    if (nextStatus !== ticket.status) {
      const [result] = await connection.query(
        `UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = ?`,
        [nextStatus, ticket.id, ticket.status]
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        throw fail('TICKET_CONFLICT', 409, 'This ticket changed while your reply was being saved. Reload and try again.');
      }
    } else {
      const [result] = await connection.query(
        'UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [ticket.id]
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        throw fail('TICKET_CONFLICT', 409, 'This ticket changed while your reply was being saved. Reload and try again.');
      }
    }
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('[support] reply rollback failed:', rollbackError?.code || rollbackError?.message);
    }
    throw error;
  } finally {
    connection.release();
  }

  return getTicket({ ticketId: ticket.id, uid, staff, pool });
}

/**
 * Applies a staff status transition. The read/validate/write cycle is guarded by
 * SELECT ... FOR UPDATE plus a conditional UPDATE, so two agents changing the
 * same ticket cannot both win. Transition metadata goes to security_audit_logs.
 */
async function updateTicketStatus({
  ticketId, status, resolutionNote, actorUid, actorRole, requestId, pool = getPool(),
}) {
  const id = normalizeTicketId(ticketId);
  const requested = toDbStatus(status);
  if (!DB_STATUSES.has(requested)) {
    throw fail('INVALID_TICKET_STATUS', 400, 'Status must be OPEN, IN_PROGRESS, RESOLVED or CLOSED.');
  }
  const note = resolutionNote === undefined || resolutionNote === null
    ? null
    : cleanText(resolutionNote, 2000) || null;

  const connection = await pool.getConnection();
  let fromStatus;
  let auditRecorded = true;
  let ticket;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, user_id, subject, status, priority, created_at, updated_at
       FROM support_tickets WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) throw fail('TICKET_NOT_FOUND', 404, 'Ticket not found.');
    const current = normalizeStatus(rows[0].status);
    fromStatus = current;

    if (current === requested) {
      // Idempotent: the ticket already holds the requested status.
      ticket = mapTicket(rows[0]);
      await connection.commit();
    } else {
      const allowed = TRANSITIONS[current];
      if (!allowed || !allowed.has(requested)) {
        throw fail('INVALID_TICKET_TRANSITION', 409, `A ticket cannot move from ${toApiStatus(current)} to ${toApiStatus(requested)}.`);
      }
      const [result] = await connection.query(
        `UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = ?`,
        [requested, id, current]
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        throw fail('TICKET_CONFLICT', 409, 'This ticket changed while the status update was being saved. Reload and try again.');
      }
      await connection.commit();
      ticket = { ...mapTicket(rows[0]), status: requested, updatedAt: new Date().toISOString() };
    }
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('[support] status rollback failed:', rollbackError?.code || rollbackError?.message);
    }
    throw error;
  } finally {
    connection.release();
  }

  if (fromStatus !== requested) {
    auditRecorded = await recordTransitionAudit(pool, {
      ticketId: id, actorUid, actorRole, fromStatus, toStatus: requested, resolutionNote: note, requestId,
    });
  }
  // Return the authoritative row (not the pre-update snapshot).
  const fresh = await getTicket({ ticketId: id, uid: null, staff: true, pool });
  return { ticket: fresh || ticket, auditRecorded, fromStatus: toApiStatus(fromStatus), toStatus: toApiStatus(requested) };
}

module.exports = {
  STATUSES,
  DB_STATUSES,
  PRIORITIES,
  TRANSITIONS,
  MAX_PAGE_LIMIT,
  toApiStatus,
  toDbStatus,
  createTicket,
  listTicketsForUser,
  listTicketsForStaff,
  getTicket,
  addMessage,
  updateTicketStatus,
};
