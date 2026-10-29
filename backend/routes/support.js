'use strict';

/**
 * Support helpdesk routes (DISC-029 / DISC-047 / DISC-052).
 *
 * Mounted by backend/index.js as:
 *   app.use('/api/support', supportUserRouter)      -> candidate/user surface
 *   app.use('/api/admin/support', supportAdminRouter) -> staff surface (tickets.manage)
 *
 * Authentication is enforced globally for /api/support (backend/index.js). This
 * router never trusts a client-supplied owner id: ownership comes from req.user.
 */

const express = require('express');
const { requirePermission, permissionsFor } = require('../security/auth');
const { replyRepoError } = require('./errorResponder');
const supportTickets = require('../services/supportTickets');

const userRouter = express.Router();
const adminRouter = express.Router();

const TICKET_CATEGORIES = new Set(['technical', 'billing', 'general']);
// Public lifecycle language; the service maps IN_PROGRESS <-> stored PENDING.
const TICKET_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
const TICKET_PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

function actorRole(req) {
  return String(req.user?.claims?.role || 'USER').toUpperCase();
}

/**
 * Fail closed on identity. backend/index.js authenticates /api/support before
 * this router runs, but every route here is owner-scoped, so the router refuses
 * an anonymous request itself rather than dereferencing an absent req.user.
 */
function requireUser(req, res, next) {
  if (!req.user?.uid) {
    return res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required', requestId: res.locals?.requestId },
    });
  }
  return next();
}

/** Staff may open any ticket; a candidate only their own. */
function isStaff(req) {
  const permissions = permissionsFor(req.user);
  return permissions.has('*') || permissions.has('tickets.manage');
}

// Transport-level driver failures must never reach a client: the raw message can
// carry a host, port or credential fragment. They are reported as a controlled
// 503 and the request is truthfully described as not processed.
const TRANSPORT_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ETIMEOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR', 'ER_SERVER_SHUTDOWN', 'POOL_CLOSED', 'EQUEUELIMIT',
]);

function controlledError(error) {
  if (error && TRANSPORT_CODES.has(String(error.code || ''))) {
    return Object.assign(
      new Error('The support service is temporarily unavailable. Your request was not processed and no data was changed.'),
      { code: 'DATABASE_UNAVAILABLE', status: 503 },
    );
  }
  return error;
}

function fail(res, error, fallbackMessage) {
  return replyRepoError(res, controlledError(error), fallbackMessage);
}

function invalid(res, code, message, status = 400) {
  return res.status(status).json({
    success: false,
    error: { code, message, requestId: res.locals?.requestId },
    code,
  });
}

function normalizeCategory(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  return String(value).trim().toLowerCase();
}

function normalizePriority(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  return String(value).trim().toUpperCase();
}

function readMessage(body) {
  const raw = body?.message ?? body?.body ?? body?.description;
  return typeof raw === 'string' ? raw : '';
}

/** The single API projection of a stored ticket. */
function toTicketView(ticket, { ownerEmail, includeThread }) {
  if (!ticket) return null;
  const view = {
    id: ticket.id,
    subject: ticket.subject,
    // Stored/API vocabulary is lower-case on the wire (existing client contract).
    status: String(supportTickets.toApiStatus(ticket.status)).toLowerCase(),
    priority: String(ticket.priority || '').toUpperCase(),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    hasMessages: Array.isArray(ticket.messages) ? ticket.messages.length > 0 : undefined,
  };
  // The caller's own verified email is the only owner email this surface knows;
  // no user table is read here, so another user's email can never leak.
  if (ownerEmail) view.email = ownerEmail;
  if (includeThread) {
    view.messages = (ticket.messages || []).map(message => ({
      id: message.id,
      role: String(message.authorRole || 'USER').toUpperCase() === 'USER' ? 'USER' : 'STAFF',
      authorRole: String(message.authorRole || 'USER').toUpperCase(),
      authorUid: message.authorUid,
      body: message.body,
      createdAt: message.createdAt,
    }));
  }
  return view;
}

function latestReply(ticket) {
  const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
  const latest = messages[messages.length - 1] || {};
  return {
    id: latest.id,
    senderUid: latest.authorUid,
    message: latest.body,
    createdAt: latest.createdAt,
  };
}

// ───────────────────────────── candidate surface ─────────────────────────────

userRouter.use(requireUser);

userRouter.post('/tickets', async (req, res) => {
  try {
    const category = normalizeCategory(req.body?.category);
    if (category !== undefined && !TICKET_CATEGORIES.has(category)) {
      return invalid(res, 'INVALID_TICKET_CATEGORY', 'Category must be technical, billing or general.');
    }
    const priority = normalizePriority(req.body?.priority);
    if (priority !== undefined && !TICKET_PRIORITIES.has(priority) && priority !== 'MEDIUM') {
      return invalid(res, 'INVALID_TICKET_PRIORITY', 'Priority must be low, normal, high or urgent.');
    }
    const ticket = await supportTickets.createTicket({
      uid: req.user.uid,
      email: req.user.email,
      subject: req.body?.subject,
      body: readMessage(req.body),
      priority: priority || 'NORMAL',
      category,
    });
    return res.status(201).json({
      success: true,
      ticket: toTicketView(ticket, { ownerEmail: req.user.email, includeThread: true }),
    });
  } catch (error) {
    return fail(res, error, 'Unable to create support ticket.');
  }
});

userRouter.get('/tickets', async (req, res) => {
  try {
    const page = await supportTickets.listTicketsForUser({
      uid: req.user.uid,
      status: req.query?.status,
      priority: req.query?.priority,
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({
      success: true,
      tickets: page.tickets.map(ticket => toTicketView(ticket, { ownerEmail: req.user.email, includeThread: false })),
      limit: page.limit,
      offset: page.offset,
      hasMore: page.hasMore,
    });
  } catch (error) {
    return fail(res, error, 'Unable to load support tickets.');
  }
});

userRouter.get('/tickets/:ticketId', async (req, res) => {
  try {
    // Staff reading through the candidate surface still get the full thread;
    // a candidate is restricted to their own ticket inside the service.
    const staff = isStaff(req);
    const ticket = await supportTickets.getTicket({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      staff,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({
      success: true,
      ticket: toTicketView(ticket, { ownerEmail: req.user.email, includeThread: true }),
    });
  } catch (error) {
    return fail(res, error, 'Unable to load support ticket.');
  }
});

async function userReply(req, res) {
  try {
    const message = readMessage(req.body);
    if (!String(message || '').trim()) {
      return invalid(res, 'INVALID_TICKET_BODY', 'A message is required.');
    }
    const ticket = await supportTickets.addMessage({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      role: 'USER',
      body: message,
      staff: false,
    });
    return res.status(200).json({ success: true, reply: latestReply(ticket) });
  } catch (error) {
    return fail(res, error, 'Unable to reply to ticket.');
  }
}

userRouter.post('/tickets/:ticketId/reply', userReply);
// Legacy alias kept for existing clients (same service call, same contract).
userRouter.post('/tickets/:ticketId/messages', userReply);

// ────────────────────────────── staff surface ──────────────────────────────

adminRouter.use(requireUser);
adminRouter.use(requirePermission('tickets.manage'));

adminRouter.get('/tickets', async (req, res) => {
  try {
    const status = req.query?.status;
    if (status !== undefined && status !== null && String(status).length > 0
      && !TICKET_STATUSES.has(String(status).trim().toUpperCase())) {
      return invalid(res, 'INVALID_TICKET_STATUS', 'Status must be open, in_progress, resolved or closed.');
    }
    const page = await supportTickets.listTicketsForStaff({
      status,
      priority: req.query?.priority,
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({
      success: true,
      tickets: page.tickets.map(ticket => toTicketView(ticket, { ownerEmail: undefined, includeThread: false })),
      limit: page.limit,
      offset: page.offset,
      hasMore: page.hasMore,
    });
  } catch (error) {
    return fail(res, error, 'Unable to load support tickets.');
  }
});

adminRouter.get('/tickets/:ticketId', async (req, res) => {
  try {
    const ticket = await supportTickets.getTicket({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      staff: true,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({
      success: true,
      ticket: toTicketView(ticket, { ownerEmail: undefined, includeThread: true }),
    });
  } catch (error) {
    return fail(res, error, 'Unable to load support ticket.');
  }
});

async function staffReply(req, res) {
  try {
    const message = readMessage(req.body);
    if (!String(message || '').trim()) {
      return invalid(res, 'INVALID_TICKET_BODY', 'A message is required.');
    }
    const ticket = await supportTickets.addMessage({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      role: actorRole(req),
      body: message,
      staff: true,
    });
    return res.status(200).json({ success: true, reply: latestReply(ticket) });
  } catch (error) {
    return fail(res, error, 'Unable to reply to ticket.');
  }
}

adminRouter.post('/tickets/:ticketId/reply', staffReply);
adminRouter.post('/tickets/:ticketId/messages', staffReply);

adminRouter.patch('/tickets/:ticketId/status', async (req, res) => {
  try {
    const requested = String(req.body?.status || '').trim().toUpperCase();
    if (!TICKET_STATUSES.has(requested)) {
      return invalid(res, 'INVALID_TICKET_STATUS', 'Status must be OPEN, IN_PROGRESS, RESOLVED or CLOSED.');
    }
    const result = await supportTickets.updateTicketStatus({
      ticketId: req.params.ticketId,
      status: requested,
      resolutionNote: req.body?.resolutionNote,
      actorUid: req.user.uid,
      actorRole: actorRole(req),
      requestId: res.locals?.requestId,
    });
    return res.json({
      success: true,
      ticket: toTicketView(result.ticket, { ownerEmail: undefined, includeThread: true }),
      transition: { from: result.fromStatus, to: result.toStatus },
      // false means the ticket moved but its audit row could not be written.
      auditRecorded: result.auditRecorded,
    });
  } catch (error) {
    return fail(res, error, 'Unable to update ticket.');
  }
});

module.exports = { supportUserRouter: userRouter, supportAdminRouter: adminRouter };
