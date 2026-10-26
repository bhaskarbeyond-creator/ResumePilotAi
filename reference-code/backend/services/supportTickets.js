'use strict';

const crypto = require('crypto');
const { getPool } = require('../database/mysql');

const STATUSES = new Set(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']);
const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const STAFF_ROLES = new Set(['SUPPORT', 'ADMIN', 'SUPER_ADMIN']);

function fail(code, status, message) {
  return Object.assign(new Error(message || code), { code, status });
}

function cleanText(value, max) {
  return String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, max);
}

function mapTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
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
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function ensureUserRow(connection, uid, email) {
  await connection.query(
    'INSERT IGNORE INTO users (id, email, revision) VALUES (?, ?, 1)',
    [uid, email || '']
  );
}

async function createTicket({ uid, email, subject, body, priority = 'NORMAL', pool = getPool() }) {
  const cleanSubject = cleanText(subject, 200);
  const cleanBody = cleanText(body, 8000);
  const cleanPriority = String(priority || 'NORMAL').toUpperCase();
  if (cleanSubject.length < 4) throw fail('INVALID_TICKET_SUBJECT', 400, 'A subject of at least four characters is required.');
  if (cleanBody.length < 8) throw fail('INVALID_TICKET_BODY', 400, 'A message of at least eight characters is required.');
  if (!PRIORITIES.has(cleanPriority)) throw fail('INVALID_TICKET_PRIORITY', 400, 'Invalid ticket priority.');
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
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  return getTicket({ ticketId, uid, staff: false, pool });
}

async function listTicketsForUser({ uid, pool = getPool() }) {
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`,
    [uid]
  );
  return rows.map(mapTicket);
}

async function listTicketsForStaff({ status, pool = getPool() } = {}) {
  const filters = [];
  const params = [];
  if (status) {
    const normalized = String(status).toUpperCase();
    if (!STATUSES.has(normalized)) throw fail('INVALID_TICKET_STATUS', 400, 'Invalid ticket status filter.');
    filters.push('status = ?');
    params.push(normalized);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM support_tickets ${where} ORDER BY updated_at DESC LIMIT 200`,
    params
  );
  return rows.map(mapTicket);
}

async function getTicket({ ticketId, uid, staff = false, pool = getPool() }) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(ticketId || ''))) {
    throw fail('TICKET_NOT_FOUND', 404, 'Ticket not found.');
  }
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM support_tickets WHERE id = ? LIMIT 1`,
    [ticketId]
  );
  if (!rows.length || (!staff && rows[0].user_id !== uid)) {
    throw fail('TICKET_NOT_FOUND', 404, 'Ticket not found.');
  }
  const [messages] = await pool.query(
    `SELECT id, ticket_id, author_uid, author_role, body, created_at
     FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
    [ticketId]
  );
  return { ...mapTicket(rows[0]), messages: messages.map(mapMessage) };
}

async function addMessage({ ticketId, uid, role, body, staff = false, pool = getPool() }) {
  const cleanBody = cleanText(body, 8000);
  if (cleanBody.length < 1) throw fail('INVALID_TICKET_BODY', 400, 'A message is required.');
  const ticket = await getTicket({ ticketId, uid, staff, pool });
  if (!staff && ticket.status === 'CLOSED') {
    throw fail('TICKET_CLOSED', 409, 'This ticket is closed.');
  }
  const authorRole = staff && STAFF_ROLES.has(String(role || '').toUpperCase())
    ? String(role).toUpperCase()
    : 'USER';
  const messageId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO support_ticket_messages (id, ticket_id, author_uid, author_role, body)
     VALUES (?, ?, ?, ?, ?)`,
    [messageId, ticketId, uid, authorRole, cleanBody]
  );
  if (staff && ticket.status === 'OPEN') {
    await pool.query(
      `UPDATE support_tickets SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [ticketId]
    );
  } else {
    await pool.query(
      `UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [ticketId]
    );
  }
  return getTicket({ ticketId, uid, staff, pool });
}

async function updateTicketStatus({ ticketId, status, pool = getPool() }) {
  const normalized = String(status || '').toUpperCase();
  if (!STATUSES.has(normalized)) throw fail('INVALID_TICKET_STATUS', 400, 'Invalid ticket status.');
  const [result] = await pool.query(
    `UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [normalized, ticketId]
  );
  if (!Number(result.affectedRows || 0)) throw fail('TICKET_NOT_FOUND', 404, 'Ticket not found.');
  return getTicket({ ticketId, uid: null, staff: true, pool });
}

module.exports = {
  STATUSES,
  createTicket,
  listTicketsForUser,
  listTicketsForStaff,
  getTicket,
  addMessage,
  updateTicketStatus,
};
