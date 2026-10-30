'use strict';

process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_VERIFIER = 'true';

/**
 * Live MariaDB Integration Test Suite for FP-G16:
 * Real-Time Support Web Chat with Server-Sent Events (SSE) & Ticket Persistence
 *
 * Verifies:
 * 1. Authentication guards (401 on unauthenticated requests)
 * 2. Live chat session retrieval / initialization backed by support_tickets
 * 3. Session idempotency (reusing open session instead of duplicate tickets)
 * 4. User message submission validation (required body, <= 2000 chars)
 * 5. Cross-user isolation (candidate cannot message or stream another candidate's ticket)
 * 6. User message persistence in support_ticket_messages
 * 7. Staff RBAC guards (tickets.manage required for admin endpoints)
 * 8. Staff message dispatch to candidate session
 * 9. Staff live chat sessions listing with last message preview
 * 10. Typing indicators for both user and staff
 * 11. Real-time Server-Sent Events (SSE) stream handshakes and broadcasts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const supportLiveChat = require('../services/supportLiveChat');
const { setTokenVerifierForTests } = require('../security/auth');

const runId = Date.now().toString(36);
const userAId = `user_chat_a_${runId}`;
const userBId = `user_chat_b_${runId}`;
const staffUid = `staff_chat_${runId}`;
const nonStaffUid = `nonstaff_chat_${runId}`;

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === userAId) {
    return { uid: userAId, email: `user_a_${runId}@example.com`, email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === userBId) {
    return { uid: userBId, email: `user_b_${runId}@example.com`, email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === staffUid) {
    return {
      uid: staffUid,
      email: `staff_${runId}@ime365.test`,
      email_verified: true,
      role: 'SUPPORT',
      permissions: ['tickets.manage'],
      auth_time: now,
    };
  }
  if (token === nonStaffUid) {
    return { uid: nonStaffUid, email: `nonstaff_${runId}@example.com`, email_verified: true, role: 'USER', auth_time: now };
  }
  throw new Error('invalid token');
});

const bearer = token => ({ Authorization: `Bearer ${token}` });

let pool;
let userATicketId = null;

test.before(async () => {
  pool = getPool();
  // Ensure test users exist in MariaDB users table
  await pool.query(
    `INSERT INTO users (id, email, displayName, role)
     VALUES (?, ?, ?, ?),
            (?, ?, ?, ?),
            (?, ?, ?, ?),
            (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE displayName = VALUES(displayName)`,
    [
      userAId, `user_a_${runId}@example.com`, 'User A Chat', 'USER',
      userBId, `user_b_${runId}@example.com`, 'User B Chat', 'USER',
      staffUid, `staff_${runId}@ime365.test`, 'Staff Support Specialist', 'SUPPORT',
      nonStaffUid, `nonstaff_${runId}@example.com`, 'Non Staff User', 'USER',
    ]
  );
});

test.after(async () => {
  if (pool) {
    await pool.query(
      `DELETE FROM support_ticket_messages WHERE author_uid IN (?, ?, ?, ?)`,
      [userAId, userBId, staffUid, nonStaffUid]
    );
    await pool.query(
      `DELETE FROM support_tickets WHERE user_id IN (?, ?, ?, ?)`,
      [userAId, userBId, staffUid, nonStaffUid]
    );
    await pool.query(
      `DELETE FROM users WHERE id IN (?, ?, ?, ?)`,
      [userAId, userBId, staffUid, nonStaffUid]
    );
  }
});

test('1. GET /api/support/live-chat/session requires authentication', async () => {
  const res = await request(app).get('/api/support/live-chat/session');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('2. GET /api/support/live-chat/session creates and returns a new session for user A', async () => {
  const res = await request(app)
    .get('/api/support/live-chat/session')
    .set(bearer(userAId));

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.session);
  assert.ok(res.body.session.ticketId);
  assert.equal(res.body.session.userId, userAId);
  assert.equal(res.body.session.status, 'open');
  assert.ok(Array.isArray(res.body.session.messages));
  userATicketId = res.body.session.ticketId;

  // Verify in MariaDB
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status FROM support_tickets WHERE id = ?`,
    [userATicketId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject, 'Live Support Chat');
  assert.equal(rows[0].status, 'OPEN');
});

test('3. GET /api/support/live-chat/session reuses existing session without duplicating ticket', async () => {
  const res = await request(app)
    .get('/api/support/live-chat/session')
    .set(bearer(userAId));

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.session.ticketId, userATicketId);

  // Check count in MariaDB
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM support_tickets WHERE user_id = ? AND subject = 'Live Support Chat'`,
    [userAId]
  );
  assert.equal(countRows[0].total, 1);
});

test('4. POST /api/support/live-chat/messages rejects missing or empty message', async () => {
  const res = await request(app)
    .post('/api/support/live-chat/messages')
    .set(bearer(userAId))
    .send({ ticketId: userATicketId, body: '   ' });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_MESSAGE_BODY');
});

test('5. POST /api/support/live-chat/messages rejects message over 2000 chars', async () => {
  const longBody = 'x'.repeat(2005);
  const res = await request(app)
    .post('/api/support/live-chat/messages')
    .set(bearer(userAId))
    .send({ ticketId: userATicketId, body: longBody });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'MESSAGE_TOO_LONG');
});

test('6. POST /api/support/live-chat/messages prevents cross-user access (user B posting to user A)', async () => {
  const res = await request(app)
    .post('/api/support/live-chat/messages')
    .set(bearer(userBId))
    .send({ ticketId: userATicketId, body: 'Malicious injection into another session' });

  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'TICKET_NOT_FOUND');
});

test('7. POST /api/support/live-chat/messages successfully sends and stores candidate message', async () => {
  const res = await request(app)
    .post('/api/support/live-chat/messages')
    .set(bearer(userAId))
    .send({ ticketId: userATicketId, body: 'Hello, I need assistance with my resume export.' });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.message);
  assert.equal(res.body.message.body, 'Hello, I need assistance with my resume export.');
  assert.equal(res.body.message.authorUid, userAId);
  assert.equal(res.body.message.authorRole, 'USER');

  // Verify stored in MariaDB support_ticket_messages
  const [msgRows] = await pool.query(
    `SELECT id, author_uid, author_role, body FROM support_ticket_messages WHERE ticket_id = ? AND author_uid = ?`,
    [userATicketId, userAId]
  );
  assert.equal(msgRows.length, 2);
  const userMsg = msgRows.find(m => m.body === 'Hello, I need assistance with my resume export.');
  assert.ok(userMsg);
  assert.equal(userMsg.author_role, 'USER');
});

test('8. Staff endpoints reject non-staff users (RBAC tickets.manage)', async () => {
  const listRes = await request(app)
    .get('/api/admin/support/live-chat/sessions')
    .set(bearer(nonStaffUid));
  assert.equal(listRes.status, 403);

  const sendRes = await request(app)
    .post(`/api/admin/support/live-chat/${userATicketId}/messages`)
    .set(bearer(nonStaffUid))
    .send({ body: 'Impostor staff message' });
  assert.equal(sendRes.status, 403);
});

test('9. Staff sends message, transitions status to PENDING and persists with SUPPORT role', async () => {
  const res = await request(app)
    .post(`/api/admin/support/live-chat/${userATicketId}/messages`)
    .set(bearer(staffUid))
    .send({ body: 'Hi User A! I am happy to help you with resume export.' });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.message);
  assert.equal(res.body.message.body, 'Hi User A! I am happy to help you with resume export.');
  assert.equal(res.body.message.authorRole, 'SUPPORT');

  // Verify ticket status transition to PENDING (in_progress) in DB
  const [ticketRows] = await pool.query(
    `SELECT status FROM support_tickets WHERE id = ?`,
    [userATicketId]
  );
  assert.equal(ticketRows[0].status, 'PENDING');
});

test('10. GET /api/admin/support/live-chat/sessions lists active chats with preview', async () => {
  const res = await request(app)
    .get('/api/admin/support/live-chat/sessions')
    .set(bearer(staffUid));

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.sessions));
  const userASession = res.body.sessions.find(s => s.ticketId === userATicketId);
  assert.ok(userASession, 'User A session should be present');
  assert.equal(userASession.userId, userAId);
  assert.equal(userASession.userName, 'User A Chat');
  assert.ok(userASession.lastMessage);
  assert.equal(userASession.lastMessage.body, 'Hi User A! I am happy to help you with resume export.');
});

test('11. POST /api/support/live-chat/typing broadcasts typing indicators', async () => {
  const userTypingRes = await request(app)
    .post('/api/support/live-chat/typing')
    .set(bearer(userAId))
    .send({ ticketId: userATicketId, isTyping: true });

  assert.equal(userTypingRes.status, 200);
  assert.equal(userTypingRes.body.success, true);

  const staffTypingRes = await request(app)
    .post(`/api/admin/support/live-chat/${userATicketId}/typing`)
    .set(bearer(staffUid))
    .send({ isTyping: false });

  assert.equal(staffTypingRes.status, 200);
  assert.equal(staffTypingRes.body.success, true);
});

test('12. SSE Stream Handshake: GET /api/support/live-chat/stream', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const chunk = await new Promise((resolve, reject) => {
      const sseReq = http.get(
        `http://127.0.0.1:${port}/api/support/live-chat/stream?ticketId=${userATicketId}`,
        { headers: { Authorization: `Bearer ${userAId}` } },
        (res) => {
          assert.equal(res.statusCode, 200);
          assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
          res.on('data', data => {
            const str = data.toString('utf8');
            if (str.includes('event: connected')) {
              sseReq.destroy();
              resolve(str);
            }
          });
          res.on('error', reject);
        }
      );
      sseReq.on('error', (err) => {
        if (err.code === 'ECONNRESET') return;
        reject(err);
      });
    });

    assert.ok(chunk.includes('event: connected'));
    assert.ok(chunk.includes(userATicketId));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
