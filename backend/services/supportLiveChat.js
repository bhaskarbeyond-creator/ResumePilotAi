'use strict';

/**
 * Real-Time Support Web Chat Service (FP-G16)
 *
 * Implements real-time bidirectional support communication:
 * 1. Server-Sent Events (SSE) live streaming with keepalive pings
 * 2. Persistent storage backed by MariaDB support_tickets & support_ticket_messages
 * 3. In-memory event dispatcher with channel subscriptions per ticket
 * 4. Multi-agent / staff broadcast channels
 * 5. Typing indicators and online status
 */

const { getPool } = require('../database/mysql');
const supportTickets = require('./supportTickets');

// Channel subscribers: Map<ticketId, Set<Response>>
const ticketSubscribers = new Map();
// Global staff monitor subscribers: Set<Response>
const staffSubscribers = new Set();

/**
 * Broadcast an SSE event to all connected subscribers for a ticket
 */
function broadcastToTicket(ticketId, eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

  const subscribers = ticketSubscribers.get(ticketId);
  if (subscribers && subscribers.size > 0) {
    for (const res of subscribers) {
      if (!res.writableEnded) {
        try {
          res.write(payload);
        } catch {
          subscribers.delete(res);
        }
      }
    }
  }

  // Also broadcast to staff subscribers monitoring all chats
  if (staffSubscribers.size > 0) {
    for (const res of staffSubscribers) {
      if (!res.writableEnded) {
        try {
          res.write(payload);
        } catch {
          staffSubscribers.delete(res);
        }
      }
    }
  }
}

/**
 * Gets or creates the active live chat session for a user.
 * Live chat tickets are identified by subject = 'Live Support Chat' and open/pending status.
 */
async function getOrCreateLiveChatSession(userId, userEmail) {
  const pool = getPool();

  // 1. Look for existing active live chat ticket
  const [existing] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM support_tickets
     WHERE user_id = ? AND subject = 'Live Support Chat' AND status IN ('OPEN', 'PENDING')
     ORDER BY updated_at DESC LIMIT 1`,
    [userId]
  );

  let ticket;
  if (existing.length > 0) {
    ticket = existing[0];
  } else {
    // 2. Create new live chat ticket
    ticket = await supportTickets.createTicket({
      uid: userId,
      email: userEmail,
      subject: 'Live Support Chat',
      body: 'Live support chat conversation initiated.',
      priority: 'NORMAL',
    });
  }

  // 3. Fetch all messages in the ticket
  const [messages] = await pool.query(
    `SELECT id, ticket_id, author_uid, author_role, body, created_at
     FROM support_ticket_messages
     WHERE ticket_id = ?
     ORDER BY created_at ASC`,
    [ticket.id]
  );

  return {
    ticketId: ticket.id,
    userId: ticket.userId || ticket.user_id,
    status: supportTickets.toApiStatus(ticket.status).toLowerCase(),
    priority: String(ticket.priority || 'NORMAL').toLowerCase(),
    createdAt: ticket.createdAt || ticket.created_at,
    updatedAt: ticket.updatedAt || ticket.updated_at,
    messages: messages.map(m => ({
      id: m.id,
      ticketId: m.ticket_id,
      authorUid: m.author_uid,
      authorRole: String(m.author_role || 'USER').toUpperCase(),
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}

/**
 * Sends a message in the live chat session and broadcasts it via SSE
 */
async function sendLiveChatMessage({ ticketId, authorUid, authorRole, body }) {
  const trimmed = String(body || '').trim();
  if (!trimmed) {
    const error = new Error('Message body is required.');
    error.code = 'INVALID_MESSAGE_BODY';
    error.status = 400;
    throw error;
  }
  if (trimmed.length > 2000) {
    const error = new Error('Message exceeds 2,000 character limit.');
    error.code = 'MESSAGE_TOO_LONG';
    error.status = 400;
    throw error;
  }

  const role = String(authorRole || 'USER').toUpperCase();
  const isStaffRole = ['STAFF', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN'].includes(role);
  const targetRole = isStaffRole ? (role === 'STAFF' ? 'SUPPORT' : role) : 'USER';

  // Add message through supportTickets service (handles DB insert and updated_at)
  const ticket = await supportTickets.addMessage({
    ticketId,
    uid: authorUid,
    role: targetRole,
    body: trimmed,
    staff: isStaffRole,
  });

  const latest = ticket.messages[ticket.messages.length - 1];
  const messageData = {
    id: latest.id,
    ticketId,
    authorUid: latest.authorUid,
    authorRole: latest.authorRole,
    body: latest.body,
    createdAt: latest.createdAt,
  };

  // Broadcast real-time SSE message to all listeners
  broadcastToTicket(ticketId, 'message', messageData);

  return messageData;
}

/**
 * Subscribes an HTTP response stream (SSE) to a live chat ticket
 */
function subscribeClientToLiveChat(ticketId, req, res) {
  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform, private',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // Send initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ ticketId, status: 'connected', time: new Date().toISOString() })}\n\n`);

  // Register in subscribers map
  if (!ticketSubscribers.has(ticketId)) {
    ticketSubscribers.set(ticketId, new Set());
  }
  ticketSubscribers.get(ticketId).add(res);

  // Heartbeat keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(': ping\n\n');
      } catch {
        cleanup();
      }
    } else {
      cleanup();
    }
  }, 15000);

  function cleanup() {
    clearInterval(pingInterval);
    const subs = ticketSubscribers.get(ticketId);
    if (subs) {
      subs.delete(res);
      if (subs.size === 0) ticketSubscribers.delete(ticketId);
    }
  }

  req.on('close', cleanup);
  res.on('finish', cleanup);
}

/**
 * Subscribes a staff member to monitor all active live chats
 */
function subscribeStaffToAllChats(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform, private',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ role: 'staff', status: 'connected', time: new Date().toISOString() })}\n\n`);
  staffSubscribers.add(res);

  const pingInterval = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(': ping\n\n');
      } catch {
        cleanup();
      }
    } else {
      cleanup();
    }
  }, 15000);

  function cleanup() {
    clearInterval(pingInterval);
    staffSubscribers.delete(res);
  }

  req.on('close', cleanup);
  res.on('finish', cleanup);
}

/**
 * Broadcasts a typing indicator to a ticket
 */
function broadcastTyping({ ticketId, authorUid, authorRole, isTyping }) {
  broadcastToTicket(ticketId, 'typing', {
    ticketId,
    authorUid,
    authorRole: String(authorRole || 'USER').toUpperCase(),
    isTyping: Boolean(isTyping),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Lists all live chat sessions for staff administration
 */
async function listLiveChatSessions({ limit = 50 } = {}) {
  const pool = getPool();
  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 50));

  const [tickets] = await pool.query(
    `SELECT t.id, t.user_id, t.subject, t.status, t.priority, t.created_at, t.updated_at,
            u.email AS user_email, u.displayName AS user_name,
            (SELECT body FROM support_ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message_body,
            (SELECT created_at FROM support_ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message_time,
            (SELECT author_role FROM support_ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message_role
     FROM support_tickets t
     LEFT JOIN users u ON t.user_id = u.id
     WHERE t.subject = 'Live Support Chat'
     ORDER BY t.updated_at DESC
     LIMIT ?`,
    [boundedLimit]
  );

  return tickets.map(t => ({
    ticketId: t.id,
    userId: t.user_id,
    userName: t.user_name || 'Anonymous User',
    userEmail: t.user_email || 'No email',
    status: supportTickets.toApiStatus(t.status).toLowerCase(),
    priority: String(t.priority || 'NORMAL').toLowerCase(),
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    lastMessage: t.last_message_body ? {
      body: t.last_message_body,
      createdAt: t.last_message_time,
      authorRole: t.last_message_role,
    } : null,
  }));
}

module.exports = {
  getOrCreateLiveChatSession,
  sendLiveChatMessage,
  subscribeClientToLiveChat,
  subscribeStaffToAllChats,
  broadcastTyping,
  listLiveChatSessions,
  broadcastToTicket,
  _activeSubscriberCounts: () => ({
    tickets: ticketSubscribers.size,
    staff: staffSubscribers.size,
  }),
};
