'use strict';

/**
 * Mandate 11D — Customer Support Helpdesk, Public Blog CMS, and the candidate
 * Application/Tracker surface.
 *
 * The suites below exercise the real route handlers, the real service layer and
 * the real repository CI contracts. Only the storage boundary is substituted:
 *   - the support helpdesk talks to MariaDB directly, so the pool is replaced by
 *     a transactional in-memory fake (same technique as
 *     test/support-desk-contract.test.js);
 *   - the blog CMS and jobs APIs go through the repository abstraction, so a
 *     scoped repository is injected (app.locals / getRepository stub).
 *
 * Failure paths are part of the contract: a database error, a stale revision, a
 * cross-account read and an invalid payload must all be reported truthfully.
 */

process.env.NODE_ENV = 'test';

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

const mysql = require('../database/mysql');

// ─────────────────────────── transactional fake MariaDB ───────────────────────────

class FakePool {
  constructor() {
    this.tickets = new Map();
    this.messages = new Map();
    this.users = new Map();
    this.audits = [];
    this.failures = [];
    this.statements = [];
    this.snapshot = null;
  }

  reset() {
    this.tickets.clear();
    this.messages.clear();
    this.users.clear();
    this.audits.length = 0;
    this.failures.length = 0;
    this.statements.length = 0;
    this.snapshot = null;
  }

  /** Fail the next statement whose SQL matches `pattern`. */
  fail(pattern) {
    this.failures.push(pattern);
  }

  addTicket(row) {
    this.tickets.set(row.id, {
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
      priority: row.priority || 'NORMAL',
      status: row.status || 'OPEN',
      ...row,
    });
    if (!this.messages.has(row.id)) this.messages.set(row.id, []);
  }

  _savePoint() {
    this.snapshot = {
      tickets: new Map([...this.tickets].map(([key, value]) => [key, { ...value }])),
      messages: new Map([...this.messages].map(([key, value]) => [key, value.map(item => ({ ...item }))])),
      audits: this.audits.map(item => ({ ...item })),
    };
  }

  _rollback() {
    if (!this.snapshot) return;
    this.tickets = this.snapshot.tickets;
    this.messages = this.snapshot.messages;
    this.audits = this.snapshot.audits;
    this.snapshot = null;
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    const lower = normalized.toLowerCase();
    this.statements.push(normalized);

    const failureIndex = this.failures.findIndex(pattern => pattern.test(lower));
    if (failureIndex !== -1) {
      this.failures.splice(failureIndex, 1);
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), {
        code: 'ECONNREFUSED', errno: 2003,
      });
    }

    if (/^insert ignore into users/i.test(lower)) {
      const [id, email] = params;
      if (!this.users.has(id)) this.users.set(id, { id, email: email || '', revision: 1 });
      return [{ affectedRows: 1 }];
    }

    if (/^insert into support_tickets/i.test(lower)) {
      // VALUES (id, user_id, subject, 'OPEN', priority)
      const [id, userId, subject, priority] = params;
      this.addTicket({ id, user_id: userId, subject, priority, status: 'OPEN' });
      return [{ affectedRows: 1 }];
    }

    if (/^insert into support_ticket_messages/i.test(lower)) {
      // The opening message writes 'USER' as a SQL literal (4 parameters); a
      // reply passes the author role as a parameter (5 parameters).
      const [id, ticketId, third, fourth, fifth] = params;
      const authorUid = third;
      const authorRole = params.length === 4 ? 'USER' : fourth;
      const body = params.length === 4 ? fourth : fifth;
      const list = this.messages.get(ticketId) || [];
      list.push({
        id, ticket_id: ticketId, author_uid: authorUid, author_role: authorRole, body,
        created_at: new Date().toISOString(),
      });
      this.messages.set(ticketId, list);
      return [{ affectedRows: 1 }];
    }

    if (/^insert into security_audit_logs/i.test(lower)) {
      this.audits.push({ id: params[0], actor_uid: params[1], target_id: params[2], metadata: params[3] });
      return [{ affectedRows: 1 }];
    }

    if (/from support_ticket_messages where ticket_id = \?/i.test(lower)) {
      return [[...(this.messages.get(params[0]) || [])]];
    }

    if (/from support_tickets where id = \?/i.test(lower)) {
      const ticket = this.tickets.get(params[0]);
      return [ticket ? [{ ...ticket }] : []];
    }

    if (/^select .* from support_tickets where user_id = \?/i.test(lower)) {
      let rows = [...this.tickets.values()].filter(ticket => ticket.user_id === params[0]);
      let index = 1;
      if (/and status = \?/i.test(lower)) {
        rows = rows.filter(ticket => ticket.status === params[index]);
        index += 1;
      }
      if (/and priority = \?/i.test(lower)) {
        rows = rows.filter(ticket => ticket.priority === params[index]);
        index += 1;
      }
      const limit = Number(params[index]);
      const offset = Number(params[index + 1]);
      rows.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
      return [rows.slice(offset, offset + limit)];
    }

    if (/^select .* from support_tickets/i.test(lower)) {
      let rows = [...this.tickets.values()];
      let index = 0;
      if (/(?:where|and) status = \?/i.test(lower)) {
        rows = rows.filter(ticket => ticket.status === params[index]);
        index += 1;
      }
      if (/(?:where|and) priority = \?/i.test(lower)) {
        rows = rows.filter(ticket => ticket.priority === params[index]);
        index += 1;
      }
      const limit = Number(params[index]);
      const offset = Number(params[index + 1]);
      rows.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
      return [rows.slice(offset, offset + limit)];
    }

    if (/^update support_tickets set status = \?, updated_at = current_timestamp\(3\) where id = \? and status = \?/i.test(lower)) {
      const [status, id, expectedFrom] = params;
      const ticket = this.tickets.get(id);
      if (!ticket || ticket.status !== expectedFrom) return [{ affectedRows: 0 }];
      ticket.status = status;
      ticket.updated_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }

    if (/^update support_tickets set updated_at = current_timestamp\(3\) where id = \?/i.test(lower)) {
      const ticket = this.tickets.get(params[0]);
      if (!ticket) return [{ affectedRows: 0 }];
      ticket.updated_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }

    throw new Error(`Unsupported fake pool query: ${normalized.slice(0, 160)}`);
  }

  async getConnection() {
    const pool = this;
    return {
      async beginTransaction() { pool._savePoint(); },
      async query(sql, params) { return pool.query(sql, params); },
      async commit() { pool.snapshot = null; },
      async rollback() { pool._rollback(); },
      async release() { /* no-op */ },
    };
  }
}

const pool = new FakePool();
mysql.setPoolForTests(pool);

const { supportUserRouter, supportAdminRouter } = require('../routes/support');

// ─────────────────────────── shared app builders ───────────────────────────

/** Identity comes from a header, exactly like the verified token would. */
function identityMiddleware(req, _res, next) {
  const uid = req.get('x-test-user');
  if (uid) {
    const role = req.get('x-test-role') || 'USER';
    const permissions = (req.get('x-test-permissions') || '').split(',').filter(Boolean);
    req.user = Object.freeze({ uid, email: `${uid}@example.test`, emailVerified: true, claims: { role, permissions } });
  }
  next();
}

function supportApp() {
  const app = express();
  app.use(express.json());
  app.use(identityMiddleware);
  app.use('/api/support', supportUserRouter);
  app.use('/api/admin/support', supportAdminRouter);
  return app;
}

const app = supportApp();

const asUserA = ['x-test-user', 'user-a'];
const asUserB = ['x-test-user', 'user-b'];
const asStaff = [['x-test-user', 'staff-1'], ['x-test-role', 'SUPPORT']];
const asAdmin = [['x-test-user', 'admin-1'], ['x-test-role', 'ADMIN']];

function withHeaders(req, headers) {
  const pairs = Array.isArray(headers[0]) ? headers : [headers];
  for (const [key, value] of pairs) req.set(key, value);
  return req;
}

async function createTicket({ subject = 'Cannot open my interview', message = 'The interview screen shows an error code.', category = 'technical', priority = 'normal' } = {}) {
  const response = await withHeaders(request(app).post('/api/support/tickets'), asUserA)
    .send({ subject, message, category, priority });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.ticket;
}

// ─────────────────────────────── support tests ───────────────────────────────

describe('support helpdesk — authentication, validation and persistence', () => {
  beforeEach(() => pool.reset());

  it('rejects unauthenticated ticket creation and listing with 401', async () => {
    const created = await request(app).post('/api/support/tickets').send({ subject: 'No auth', message: 'Long enough body.' });
    assert.equal(created.status, 401);
    const listed = await request(app).get('/api/support/tickets');
    assert.equal(listed.status, 401);
  });

  it('validates subject, message, category and priority before writing anything', async () => {
    const cases = [
      { subject: 'abc', message: 'A long enough message.', category: 'technical', priority: 'normal' },
      { subject: 'Valid subject', message: 'short', category: 'technical', priority: 'normal' },
      { subject: 'Valid subject', message: 'A long enough message.', category: 'finance', priority: 'normal' },
      { subject: 'Valid subject', message: 'A long enough message.', category: 'general', priority: 'immediate' },
    ];
    for (const body of cases) {
      const response = await withHeaders(request(app).post('/api/support/tickets'), asUserA).send(body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    assert.equal(pool.tickets.size, 0, 'no ticket row was written for a rejected payload');
  });

  it('persists the ticket and its initial message together', async () => {
    const ticket = await createTicket({ subject: 'Billing question', message: 'I was charged twice this month.', category: 'billing', priority: 'high' });

    assert.ok(ticket.id);
    assert.equal(ticket.subject, 'Billing question');
    assert.equal(ticket.status, 'open');
    assert.equal(ticket.priority, 'HIGH');

    const stored = pool.tickets.get(ticket.id);
    assert.equal(stored.user_id, 'user-a', 'the owner is the verified caller, never a client value');
    assert.equal(pool.messages.get(ticket.id).length, 1);
    const [first] = pool.messages.get(ticket.id);
    assert.equal(first.author_role, 'USER');
    assert.equal(first.body, 'I was charged twice this month.');
  });

  it('rejects a client-supplied owner id: the ticket always belongs to the caller', async () => {
    const response = await withHeaders(request(app).post('/api/support/tickets'), asUserA)
      .send({ subject: 'Ownership probe', message: 'Trying to write for someone else.', userId: 'user-b', user_id: 'user-b', uid: 'user-b' });
    assert.equal(response.status, 201);
    assert.equal(pool.tickets.get(response.body.ticket.id).user_id, 'user-a');
  });

  it('rolls the ticket back when the initial message cannot be written', async () => {
    pool.fail(/^insert into support_ticket_messages/);
    const response = await withHeaders(request(app).post('/api/support/tickets'), asUserA)
      .send({ subject: 'Rollback probe', message: 'This message insert is forced to fail.' });
    assert.ok(response.status >= 500, `expected a failure status, got ${response.status}`);
    assert.equal(response.body.success, false);
    assert.equal(pool.tickets.size, 0, 'the ticket insert was rolled back with the failed message');
  });

  it('never reports success when the database is unavailable', async () => {
    pool.fail(/^insert into support_tickets/);
    const response = await withHeaders(request(app).post('/api/support/tickets'), asUserA)
      .send({ subject: 'Outage probe', message: 'The database refuses this insert.' });
    assert.ok(response.status >= 500);
    assert.equal(response.body.success, false);
    assert.doesNotMatch(JSON.stringify(response.body), /ECONNREFUSED|password|127\.0\.0\.1/);
  });
});

describe('support helpdesk — ticket isolation and thread access', () => {
  beforeEach(() => pool.reset());

  it('lists only the caller’s tickets and never another account’s', async () => {
    const mine = await createTicket({ subject: 'Mine only' });
    pool.addTicket({ id: 'someone-elses-ticket', user_id: 'user-b', subject: 'Not yours', status: 'OPEN' });

    const mineList = await withHeaders(request(app).get('/api/support/tickets'), asUserA);
    assert.equal(mineList.status, 200);
    assert.deepEqual(mineList.body.tickets.map(ticket => ticket.id), [mine.id]);

    const theirs = await withHeaders(request(app).get('/api/support/tickets'), asUserB);
    assert.deepEqual(theirs.body.tickets.map(ticket => ticket.id), ['someone-elses-ticket']);
  });

  it('ignores a query-supplied user id when listing tickets', async () => {
    await createTicket({ subject: 'Scoped' });
    const response = await withHeaders(request(app).get('/api/support/tickets?userId=user-b&uid=user-b'), asUserA);
    assert.equal(response.status, 200);
    assert.equal(response.body.tickets.length, 1, 'the caller still sees only their own ticket');
  });

  it('paginates and rejects invalid pagination input', async () => {
    await createTicket({ subject: 'First ticket' });
    await createTicket({ subject: 'Second ticket' });

    const page = await withHeaders(request(app).get('/api/support/tickets?limit=1&offset=1'), asUserA);
    assert.equal(page.status, 200);
    assert.equal(page.body.tickets.length, 1);
    assert.equal(page.body.limit, 1);
    assert.equal(page.body.offset, 1);

    const invalidLimit = await withHeaders(request(app).get('/api/support/tickets?limit=0'), asUserA);
    assert.equal(invalidLimit.status, 400);
    const invalidOffset = await withHeaders(request(app).get('/api/support/tickets?offset=-4'), asUserA);
    assert.equal(invalidOffset.status, 400);
    const invalidStatus = await withHeaders(request(app).get('/api/support/tickets?status=archived'), asUserA);
    assert.equal(invalidStatus.status, 400);
  });

  it('returns the thread only to its owner and 404s for everyone else', async () => {
    const ticket = await createTicket({ subject: 'Thread owner' });

    const owner = await withHeaders(request(app).get(`/api/support/tickets/${ticket.id}`), asUserA);
    assert.equal(owner.status, 200);
    assert.equal(owner.body.ticket.messages.length, 1);
    assert.equal(owner.body.ticket.messages[0].role, 'USER');

    const stranger = await withHeaders(request(app).get(`/api/support/tickets/${ticket.id}`), asUserB);
    assert.equal(stranger.status, 404);
    assert.equal(stranger.body.ticket, undefined);

    const malformed = await withHeaders(request(app).get('/api/support/tickets/not_a_real_id'), asUserA);
    assert.equal(malformed.status, 404);
  });

  it('keeps messages in stable chronological order', async () => {
    const ticket = await createTicket({ subject: 'Ordering' });
    await withHeaders(request(app).post(`/api/support/tickets/${ticket.id}/reply`), asUserA).send({ message: 'Second message' });
    const staffReply = await withHeaders(request(app).post(`/api/admin/support/tickets/${ticket.id}/reply`), asStaff).send({ message: 'Third message from staff' });
    assert.equal(staffReply.status, 200, `staff reply: ${JSON.stringify(staffReply.body)}`);

    const detail = await withHeaders(request(app).get(`/api/support/tickets/${ticket.id}`), asUserA);
    assert.deepEqual(
      detail.body.ticket.messages.map(message => message.role),
      ['USER', 'USER', 'STAFF'],
    );
  });
});

describe('support helpdesk — replies and lifecycle transitions', () => {
  beforeEach(() => pool.reset());

  it('persists an owner reply and attributes it to the caller', async () => {
    const ticket = await createTicket({ subject: 'Reply path' });
    const response = await withHeaders(request(app).post(`/api/support/tickets/${ticket.id}/reply`), asUserA)
      .send({ message: 'Any update on this?' });

    assert.equal(response.status, 200);
    assert.equal(response.body.reply.senderUid, 'user-a');
    assert.equal(response.body.reply.message, 'Any update on this?');

    const stored = pool.messages.get(ticket.id).at(-1);
    assert.equal(stored.author_role, 'USER');
    assert.equal(stored.author_uid, 'user-a');
  });

  it('refuses an empty reply and a cross-account reply', async () => {
    const ticket = await createTicket({ subject: 'Guarded reply' });

    const empty = await withHeaders(request(app).post(`/api/support/tickets/${ticket.id}/reply`), asUserA).send({ message: '   ' });
    assert.equal(empty.status, 400);

    const stranger = await withHeaders(request(app).post(`/api/support/tickets/${ticket.id}/reply`), asUserB).send({ message: 'Inserting into someone else’s thread' });
    assert.equal(stranger.status, 404);
    assert.equal(pool.messages.get(ticket.id).length, 1, 'no message was added to the other account’s ticket');
  });

  it('freezes a closed ticket and refuses replies until it is reopened', async () => {
    const ticket = await createTicket({ subject: 'Closed ticket' });
    const closed = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin)
      .send({ status: 'CLOSED' });
    assert.equal(closed.status, 200);

    const ownerReply = await withHeaders(request(app).post(`/api/support/tickets/${ticket.id}/reply`), asUserA)
      .send({ message: 'Are you still there?' });
    assert.equal(ownerReply.status, 409);
    assert.equal(ownerReply.body.code, 'TICKET_CLOSED');

    const staffReply = await withHeaders(request(app).post(`/api/admin/support/tickets/${ticket.id}/reply`), asStaff)
      .send({ message: 'Internal note attempt' });
    assert.equal(staffReply.status, 409);

    const reopened = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin)
      .send({ status: 'OPEN' });
    assert.equal(reopened.status, 200);
    const afterReopen = await withHeaders(request(app).post(`/api/support/tickets/${ticket.id}/reply`), asUserA)
      .send({ message: 'Thanks for reopening.' });
    assert.equal(afterReopen.status, 200);
  });

  it('reopens a resolved ticket when its owner replies', async () => {
    const ticket = await createTicket({ subject: 'Resolved then reopened' });
    await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin).send({ status: 'RESOLVED' });
    assert.equal(pool.tickets.get(ticket.id).status, 'RESOLVED');

    const reply = await withHeaders(request(app).post(`/api/support/tickets/${ticket.id}/reply`), asUserA)
      .send({ message: 'It happened again.' });
    assert.equal(reply.status, 200);
    assert.equal(pool.tickets.get(ticket.id).status, 'OPEN', 'a customer reply reopens the resolved ticket');
  });

  it('moves an open ticket to in-progress when staff replies, attributed to the agent', async () => {
    const ticket = await createTicket({ subject: 'Staff picks it up' });
    const response = await withHeaders(request(app).post(`/api/admin/support/tickets/${ticket.id}/reply`), asStaff)
      .send({ message: 'We are looking into this now.' });

    assert.equal(response.status, 200);
    assert.equal(response.body.reply.senderUid, 'staff-1');
    assert.equal(pool.messages.get(ticket.id).at(-1).author_role, 'SUPPORT');
    assert.equal(pool.tickets.get(ticket.id).status, 'PENDING');
  });
});

describe('support helpdesk — staff authorisation and status transitions', () => {
  beforeEach(() => pool.reset());

  it('requires tickets.manage for every staff route', async () => {
    const ticket = await createTicket({ subject: 'Staff gate' });
    const list = await withHeaders(request(app).get('/api/admin/support/tickets'), asUserA);
    assert.equal(list.status, 403);
    const detail = await withHeaders(request(app).get(`/api/admin/support/tickets/${ticket.id}`), asUserA);
    assert.equal(detail.status, 403);
    const reply = await withHeaders(request(app).post(`/api/admin/support/tickets/${ticket.id}/reply`), asUserA).send({ message: 'nope' });
    assert.equal(reply.status, 403);
    const patch = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asUserA).send({ status: 'CLOSED' });
    assert.equal(patch.status, 403);
    assert.equal(pool.tickets.get(ticket.id).status, 'OPEN', 'no transition happened for an unauthorised caller');
  });

  it('filters and paginates the staff list and rejects unknown filters', async () => {
    await createTicket({ subject: 'Urgent one', priority: 'urgent' });
    await createTicket({ subject: 'Low one', priority: 'low' });

    const urgent = await withHeaders(request(app).get('/api/admin/support/tickets?priority=urgent'), asStaff);
    assert.equal(urgent.status, 200);
    assert.deepEqual(urgent.body.tickets.map(ticket => ticket.subject), ['Urgent one']);

    const byStatus = await withHeaders(request(app).get('/api/admin/support/tickets?status=open'), asStaff);
    assert.equal(byStatus.body.tickets.length, 2);

    const paged = await withHeaders(request(app).get('/api/admin/support/tickets?limit=1&offset=1'), asStaff);
    assert.equal(paged.body.tickets.length, 1);
    assert.equal(paged.body.limit, 1);

    for (const query of ['status=archived', 'priority=immediate', 'limit=500', 'offset=-1']) {
      const invalid = await withHeaders(request(app).get(`/api/admin/support/tickets?${query}`), asStaff);
      assert.equal(invalid.status, 400, query);
    }
  });

  it('applies a valid transition, records the audit row and returns the stored status', async () => {
    const ticket = await createTicket({ subject: 'Transition me' });
    const response = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin)
      .send({ status: 'in_progress', resolutionNote: 'Handling the account issue.' });

    assert.equal(response.status, 200);
    assert.equal(response.body.ticket.status, 'in_progress');
    assert.equal(response.body.transition.to, 'IN_PROGRESS');
    assert.equal(response.body.auditRecorded, true);
    assert.equal(pool.tickets.get(ticket.id).status, 'PENDING');

    assert.equal(pool.audits.length, 1);
    const [audit] = pool.audits;
    assert.equal(audit.actor_uid, 'admin-1');
    assert.equal(audit.target_id, ticket.id);
    const metadata = JSON.parse(audit.metadata);
    assert.equal(metadata.fromStatus, 'OPEN');
    assert.equal(metadata.toStatus, 'PENDING');
    assert.equal(metadata.resolutionNote, 'Handling the account issue.');
  });

  it('rejects unknown statuses and illegal transitions without writing', async () => {
    const ticket = await createTicket({ subject: 'Illegal transitions' });

    const unknown = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin)
      .send({ status: 'archived' });
    assert.equal(unknown.status, 400);

    // OPEN -> CLOSED is legal; CLOSED -> RESOLVED is not (it must reopen first).
    await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin).send({ status: 'CLOSED' });
    const illegal = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin)
      .send({ status: 'RESOLVED' });
    assert.equal(illegal.status, 409);
    assert.equal(illegal.body.code, 'INVALID_TICKET_TRANSITION');
    assert.equal(pool.tickets.get(ticket.id).status, 'CLOSED', 'the refused transition left the ticket unchanged');
  });

  it('is idempotent when the ticket already holds the requested status', async () => {
    const ticket = await createTicket({ subject: 'Idempotent' });
    const first = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin).send({ status: 'RESOLVED' });
    assert.equal(first.status, 200);
    const second = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin).send({ status: 'RESOLVED' });
    assert.equal(second.status, 200);
    assert.equal(pool.audits.length, 1, 'a no-op transition writes no second audit row');
  });

  it('404s a status change for an unknown ticket', async () => {
    const response = await withHeaders(request(app).patch('/api/admin/support/tickets/abcdefgh-1234/status'), asAdmin)
      .send({ status: 'RESOLVED' });
    assert.equal(response.status, 404);
  });

  it('reports a failed audit write instead of pretending it succeeded', async () => {
    const ticket = await createTicket({ subject: 'Audit outage' });
    pool.fail(/^insert into security_audit_logs/);
    const response = await withHeaders(request(app).patch(`/api/admin/support/tickets/${ticket.id}/status`), asAdmin)
      .send({ status: 'RESOLVED' });
    assert.equal(response.status, 200, 'the status change itself is committed');
    assert.equal(response.body.auditRecorded, false, 'the caller is told the audit trail is missing');
    assert.equal(pool.tickets.get(ticket.id).status, 'RESOLVED');
  });
});

// ──────────────────────────────── blog tests ────────────────────────────────

/** A repository double with the exact read/write contract blogData.js uses. */
class BlogRepository {
  constructor(seed = []) {
    this.posts = new Map();
    this.calls = [];
    this.failures = [];
    this.duplicateOnSave = false;
    for (const post of seed) this.posts.set(post.id, post);
  }

  failOn(method) { this.failures.push(method); }

  _maybeFail(method) {
    const index = this.failures.indexOf(method);
    if (index !== -1) {
      this.failures.splice(index, 1);
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
  }

  async getBlogPosts(options = {}) {
    this.calls.push(['getBlogPosts', options]);
    this._maybeFail('getBlogPosts');
    let rows = [...this.posts.values()];
    if (options.publishedOnly) rows = rows.filter(post => post.published === true);
    return rows.slice(0, options.limit || rows.length).map(row => ({ ...row }));
  }

  async getBlogPostBySlug(slug) {
    this.calls.push(['getBlogPostBySlug', slug]);
    this._maybeFail('getBlogPostBySlug');
    for (const post of this.posts.values()) if (post.slug === slug) return { ...post };
    return null;
  }

  async getBlogPostById(id) {
    this.calls.push(['getBlogPostById', id]);
    this._maybeFail('getBlogPostById');
    const post = this.posts.get(id);
    return post ? { ...post } : null;
  }

  async saveBlogPost(id, data) {
    this.calls.push(['saveBlogPost', id, data]);
    this._maybeFail('saveBlogPost');
    if (this.duplicateOnSave) {
      throw Object.assign(new Error('Duplicate entry for key blog.slug'), { code: 'ER_DUP_ENTRY', errno: 1062 });
    }
    const existing = this.posts.get(id) || {};
    const saved = { ...existing, ...data, id, created_at: existing.created_at || '2026-01-01T00:00:00.000Z' };
    saved.published = data.published === true;
    this.posts.set(id, saved);
    return { ...saved };
  }

  async deleteBlogPost(id, expectedRevision) {
    this.calls.push(['deleteBlogPost', id, expectedRevision]);
    this._maybeFail('deleteBlogPost');
    const revision = Number(expectedRevision);
    if (!Number.isInteger(revision) || revision < 1) {
      throw Object.assign(new Error('The current blog-post revision is required.'), { code: 'REVISION_REQUIRED', status: 400 });
    }
    const existing = this.posts.get(id);
    if (!existing) throw Object.assign(new Error('Blog post changed before it could be deleted.'), { code: 'CAS_CONFLICT', status: 409 });
    if (Number(existing.revision || 1) !== revision) {
      throw Object.assign(new Error('Blog post changed before it could be deleted.'), { code: 'CAS_CONFLICT', status: 409 });
    }
    this.posts.delete(id);
    return true;
  }
}

const repositories = require('../repositories');

// blogData.js destructures getRepository at module load, so the stub has to be
// installed before the router is required.
let activeBlogRepository = new BlogRepository();
const originalGetRepository = repositories.getRepository;
repositories.getRepository = () => activeBlogRepository;

const { blogDataRouter } = require('../routes/blogData');

after(() => { repositories.getRepository = originalGetRepository; });

function blogApp(repository) {
  activeBlogRepository = repository;
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    const uid = req.get('x-test-user');
    if (uid) {
      const permissions = (req.get('x-test-permissions') || '').split(',').filter(Boolean);
      req.user = { uid, email: `${uid}@example.test`, emailVerified: true, claims: { role: req.get('x-test-role') || 'USER', permissions } };
    }
    next();
  });
  instance.use('/api/blog-data', blogDataRouter);
  return instance;
}

const EDITOR = [['x-test-user', 'editor-1'], ['x-test-permissions', 'blog.write']];
const READER = ['x-test-user', 'reader-1'];

function seedPosts() {
  return new BlogRepository([
    { id: 'post-pub', title: 'Published article', slug: 'published-article', excerpt: 'Live', content: '# Hello', category: 'Career Advice', author: 'Editorial', tags: ['cv'], published: true, status: 'published', revision: 3, published_at: '2026-05-01T00:00:00.000Z', created_at: '2026-04-01T00:00:00.000Z' },
    { id: 'post-draft', title: 'Secret draft', slug: 'secret-draft', excerpt: 'Not live', content: 'internal notes', category: 'Career Advice', author: 'Editorial', tags: [], published: false, status: 'draft', revision: 1, created_at: '2026-04-02T00:00:00.000Z' },
    { id: 'post-interview', title: 'Interview article', slug: 'interview-article', excerpt: 'Live too', content: 'text', category: 'Technical Interviews', author: 'Editorial', tags: [], published: true, status: 'published', revision: 2, created_at: '2026-04-03T00:00:00.000Z' },
  ]);
}

describe('blog CMS — public reading surface', () => {
  it('lists only published articles for anonymous readers, with pagination metadata', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const response = await request(instance).get('/api/blog-data?publishedOnly=false');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.posts.map(post => post.id).sort(), ['post-interview', 'post-pub']);
    assert.equal(response.body.meta.total, 2);
    assert.equal(response.body.meta.hasMore, false);
    for (const post of response.body.posts) {
      assert.equal(post.published, true);
      assert.equal(post.status, undefined, 'editorial status is not part of the public projection');
      assert.equal(post.revision, undefined, 'the CAS revision is not exposed publicly');
    }
  });

  it('never returns a draft through the listing for an ordinary authenticated reader', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const response = await withHeaders(request(instance).get('/api/blog-data'), READER);
    assert.deepEqual(response.body.posts.map(post => post.id).sort(), ['post-interview', 'post-pub']);
  });

  it('lets an editor read drafts, and honours an explicit published-only request', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const everything = await withHeaders(request(instance).get('/api/blog-data'), EDITOR);
    assert.equal(everything.body.posts.length, 3);

    const publishedOnly = await withHeaders(request(instance).get('/api/blog-data?publishedOnly=true'), EDITOR);
    assert.deepEqual(publishedOnly.body.posts.map(post => post.id).sort(), ['post-interview', 'post-pub']);

    const drafts = everything.body.posts.filter(post => post.published === false);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].revision, 1, 'the editorial projection carries the revision');
  });

  it('filters by category and search, and paginates deterministically', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);

    const byCategory = await request(instance).get('/api/blog-data?category=technical-interviews');
    assert.deepEqual(byCategory.body.posts.map(post => post.id), ['post-interview']);

    const bySearch = await request(instance).get('/api/blog-data?search=interview');
    assert.deepEqual(bySearch.body.posts.map(post => post.id), ['post-interview']);

    const firstPage = await request(instance).get('/api/blog-data?limit=1');
    assert.equal(firstPage.body.posts.length, 1);
    assert.equal(firstPage.body.meta.total, 2);
    assert.equal(firstPage.body.meta.hasMore, true);

    const secondPage = await request(instance).get('/api/blog-data?limit=1&offset=1');
    assert.equal(secondPage.body.posts.length, 1);
    assert.notEqual(secondPage.body.posts[0].id, firstPage.body.posts[0].id);
  });

  it('rejects invalid pagination on the public listing', async () => {
    const instance = blogApp(seedPosts());
    for (const query of ['limit=0', 'limit=999', 'offset=-1', 'page=0', 'limit=abc']) {
      const response = await request(instance).get(`/api/blog-data?${query}`);
      assert.equal(response.status, 400, query);
    }
  });

  it('serves a published slug and 404s a draft slug for the public', async () => {
    const instance = blogApp(seedPosts());

    const published = await request(instance).get('/api/blog-data/slug/published-article');
    assert.equal(published.status, 200);
    assert.equal(published.body.post.content, '# Hello');

    const draft = await request(instance).get('/api/blog-data/slug/secret-draft');
    assert.equal(draft.status, 404);
    assert.equal(draft.body.post, undefined);

    const reader = await withHeaders(request(instance).get('/api/blog-data/slug/secret-draft'), READER);
    assert.equal(reader.status, 404);

    const editor = await withHeaders(request(instance).get('/api/blog-data/slug/secret-draft'), EDITOR);
    assert.equal(editor.status, 200);
    assert.equal(editor.body.post.revision, 1);

    const invalidSlug = await request(instance).get('/api/blog-data/slug/__proto__');
    assert.equal(invalidSlug.status, 404);
  });

  it('counts only published articles in the public category taxonomy', async () => {
    const instance = blogApp(seedPosts());
    const response = await request(instance).get('/api/blog-data/categories');
    assert.equal(response.status, 200);
    const counts = Object.fromEntries(response.body.categories.map(category => [category.slug, category.postCount]));
    assert.deepEqual(counts, { 'career-advice': 1, 'technical-interviews': 1 });
  });

  it('reports a database failure instead of an empty article list', async () => {
    const repo = seedPosts();
    repo.failOn('getBlogPosts');
    const instance = blogApp(repo);
    const response = await request(instance).get('/api/blog-data');
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'DATABASE_UNAVAILABLE');
    assert.equal(response.body.posts, undefined);
  });
});

describe('blog CMS — editorial authoring', () => {
  it('requires authentication and editorial permission for every mutation', async () => {
    const instance = blogApp(seedPosts());
    const payload = { title: 'A new article', content: 'Body text' };

    const anonymous = await request(instance).post('/api/blog-data/posts').send(payload);
    assert.equal(anonymous.status, 401);

    const ordinaryUser = await withHeaders(request(instance).post('/api/blog-data/posts'), READER).send(payload);
    assert.equal(ordinaryUser.status, 403);

    const update = await withHeaders(request(instance).put('/api/blog-data/posts/post-pub'), READER).send({ title: 'Hijacked' });
    assert.equal(update.status, 403);
    const removal = await withHeaders(request(instance).delete('/api/blog-data/posts/post-pub?expectedRevision=3'), READER);
    assert.equal(removal.status, 403);
  });

  it('creates a draft, generates a slug and derives authorship from the identity', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const response = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR)
      .send({ title: 'Salary Negotiation Basics', content: 'Ask for the range first.', authorId: 'somebody-else', author_id: 'somebody-else' });

    assert.equal(response.status, 201);
    assert.equal(response.body.post.slug, 'salary-negotiation-basics');
    assert.equal(response.body.post.status, 'draft');
    assert.equal(response.body.post.published, false);
    assert.equal(response.body.post.revision, 1);

    const save = repo.calls.find(call => call[0] === 'saveBlogPost');
    assert.equal(save[2].authorId, 'editor-1', 'authorship comes from the verified caller');
    assert.notEqual(save[2].author_id, 'somebody-else');
    assert.equal(repo.posts.get(response.body.post.id).published, false);
  });

  it('rejects an invalid create payload', async () => {
    const instance = blogApp(seedPosts());
    const shortTitle = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR).send({ title: 'a', content: 'Body' });
    assert.equal(shortTitle.status, 400);
    const noContent = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR).send({ title: 'Valid title', content: '   ' });
    assert.equal(noContent.status, 400);
    const badStatus = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR)
      .send({ title: 'Valid title', content: 'Body', status: 'whatever' });
    assert.equal(badStatus.status, 400);
  });

  it('suffixes a generated slug but conflicts on an explicitly requested one', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);

    const generated = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR)
      .send({ title: 'Published article', content: 'Second article, same title.' });
    assert.equal(generated.status, 201);
    assert.equal(generated.body.post.slug, 'published-article-2');

    const explicit = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR)
      .send({ title: 'Another article', content: 'Body text.', slug: 'secret-draft' });
    assert.equal(explicit.status, 409);
    assert.equal(explicit.body.code, 'SLUG_CONFLICT');
  });

  it('reports a duplicate-key race as a slug conflict', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    repo.duplicateOnSave = true;
    const response = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR)
      .send({ title: 'Race article', content: 'Body text.' });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'SLUG_CONFLICT');
  });

  it('updates a post, preserves omitted fields and bumps the revision', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);

    const response = await withHeaders(request(instance).put('/api/blog-data/posts/post-pub'), EDITOR)
      .send({ title: 'Published article, revised' });

    assert.equal(response.status, 200);
    assert.equal(response.body.post.title, 'Published article, revised');
    assert.equal(response.body.post.content, '# Hello', 'omitted content is preserved, not blanked');
    assert.equal(response.body.post.status, 'published', 'publication state survives a partial update');
    assert.equal(response.body.post.publishedAt, '2026-05-01T00:00:00.000Z', 'the original publication time is kept');
    assert.equal(response.body.post.revision, 4, 'the revision increments for the CAS contract');
  });

  it('returns 409 for a stale expectedRevision and writes nothing', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const before = { ...repo.posts.get('post-pub') };

    const response = await withHeaders(request(instance).put('/api/blog-data/posts/post-pub'), EDITOR)
      .send({ title: 'Stale write', expectedRevision: 2 });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'CAS_CONFLICT');
    assert.equal(response.body.revision, 3, 'the caller is told the current revision');
    assert.deepEqual(repo.posts.get('post-pub'), before, 'the stale write changed nothing');
  });

  it('404s an update and a delete for a post that does not exist', async () => {
    const instance = blogApp(seedPosts());
    const update = await withHeaders(request(instance).put('/api/blog-data/posts/missing-post'), EDITOR).send({ title: 'Nope' });
    assert.equal(update.status, 404);
    const removal = await withHeaders(request(instance).delete('/api/blog-data/posts/missing-post?expectedRevision=1'), EDITOR);
    assert.equal(removal.status, 404);
  });

  it('requires expectedRevision to delete (no blind delete)', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const response = await withHeaders(request(instance).delete('/api/blog-data/posts/post-pub'), EDITOR);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'REVISION_REQUIRED');
    assert.equal(repo.posts.has('post-pub'), true);
  });

  it('refuses a stale compare-and-swap delete and keeps the post', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const response = await withHeaders(request(instance).delete('/api/blog-data/posts/post-pub?expectedRevision=1'), EDITOR);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'CAS_CONFLICT');
    assert.equal(repo.posts.has('post-pub'), true);
  });

  it('deletes with the current revision', async () => {
    const repo = seedPosts();
    const instance = blogApp(repo);
    const response = await withHeaders(request(instance).delete('/api/blog-data/posts/post-pub?expectedRevision=3'), EDITOR);
    assert.equal(response.status, 200);
    assert.equal(response.body.deleted, true);
    assert.equal(repo.posts.has('post-pub'), false);
  });

  it('surfaces a write failure instead of a false save', async () => {
    const repo = seedPosts();
    repo.failOn('saveBlogPost');
    const instance = blogApp(repo);
    const response = await withHeaders(request(instance).post('/api/blog-data/posts'), EDITOR)
      .send({ title: 'Will not persist', content: 'Body text.' });
    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);
    assert.equal(repo.posts.has('post-pub'), true);
  });
});

// ───────────────────────── applications and tracker ─────────────────────────

const { jobsDataRouter, lifecycleStatusFor, TRACKER_COLUMNS } = require('../routes/jobsData');

function jobsApp(repository) {
  const instance = express();
  instance.use(express.json());
  instance.use(identityMiddleware);
  instance.locals.jobsRepositoryProvider = () => repository;
  instance.use('/api/jobs-data', jobsDataRouter);
  return instance;
}

function trackerRepository() {
  const tracked = new Map([
    ['tracker-a', { id: 'tracker-a', userId: 'user-a', title: 'Platform Engineer', company: 'Acme', status: 'applied', order: 0, notes: 'Prepare the system design round.', salary: '24 LPA', deadline: '2026-11-01', location: 'Remote', interviewRound: 'Technical', interviewAt: '2026-11-05 10:30:00', revision: 2 }],
    ['tracker-b', { id: 'tracker-b', userId: 'user-b', title: 'Data Analyst', company: 'Northwind', status: 'wishlist', order: 0, revision: 1 }],
  ]);
  const applications = [
    { id: 'app-1', jobId: 'job-1', status: 'interview', applicantName: 'Avery', applicantEmail: 'avery@example.test', applicantPhone: '+1 555 0100', resumeId: null, coverLetter: 'Hello', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z', job: { title: 'Platform Engineer', company: 'Acme', location: 'Remote', listed: true } },
  ];
  const calls = [];
  return {
    tracked,
    applications,
    calls,
    async getApplicantApplications({ applicantId }) {
      calls.push(['getApplicantApplications', applicantId]);
      return applicantId === 'user-a' ? applications.map(row => ({ ...row })) : [];
    },
    async getTrackedJobs(userId) {
      calls.push(['getTrackedJobs', userId]);
      return [...tracked.values()].filter(row => row.userId === userId).map(row => ({ ...row }));
    },
    async createTrackedJob(userId, id, data) {
      calls.push(['createTrackedJob', userId, id, data]);
      const row = { id, userId, ...data, revision: 1 };
      tracked.set(id, row);
      return { ...row };
    },
    async updateTrackedJob(userId, id, patch, { expectedRevision } = {}) {
      calls.push(['updateTrackedJob', userId, id, patch, expectedRevision]);
      const current = tracked.get(id);
      if (!current || current.userId !== userId) {
        throw Object.assign(new Error('Tracked job not found.'), { code: 'JOB_TRACKER_NOT_FOUND', status: 404 });
      }
      if (Number(expectedRevision) !== current.revision) {
        throw Object.assign(new Error('Tracked job changed in another tab or device.'), {
          code: 'JOB_TRACKER_CONFLICT', status: 409, remoteRevision: current.revision,
        });
      }
      const next = { ...current, ...patch, revision: current.revision + 1 };
      tracked.set(id, next);
      return { ...next };
    },
    async deleteTrackedJob(userId, id, { expectedRevision } = {}) {
      calls.push(['deleteTrackedJob', userId, id, expectedRevision]);
      const current = tracked.get(id);
      if (!current || current.userId !== userId) {
        throw Object.assign(new Error('Tracked job not found.'), { code: 'JOB_TRACKER_NOT_FOUND', status: 404 });
      }
      if (Number(expectedRevision) !== current.revision) {
        throw Object.assign(new Error('Tracked job changed in another tab or device.'), {
          code: 'JOB_TRACKER_CONFLICT', status: 409, remoteRevision: current.revision,
        });
      }
      tracked.delete(id);
      return true;
    },
    async getJobs() { return []; },
    async getJob() { return null; },
  };
}

describe('applications — projection, isolation and lifecycle status', () => {
  it('requires an authenticated candidate', async () => {
    const instance = jobsApp(trackerRepository());
    const response = await request(instance).get('/api/jobs-data/applications/list');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'AUTH_REQUIRED');
  });

  it('projects the required fields for the caller’s own applications', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);
    const response = await withHeaders(request(instance).get('/api/jobs-data/applications/list'), asUserA);

    assert.equal(response.status, 200);
    const [application] = response.body.applications;
    assert.equal(application.id, 'app-1');
    assert.equal(application.jobId, 'job-1');
    assert.equal(application.status, 'interview');
    // Title/company/location are projected under `job`, and the submission time
    // is `createdAt`; that frozen shape is asserted by
    // test/job-applications-candidate-api.test.js and is preserved here.
    assert.equal(application.job.title, 'Platform Engineer');
    assert.equal(application.job.company, 'Acme');
    assert.equal(application.job.location, 'Remote');
    assert.equal(application.createdAt, '2026-10-01T09:00:00.000Z');
    // Employer-only columns never appear.
    for (const key of ['rating', 'notes', 'employerId', 'employer_id', 'resumeUrl']) {
      assert.equal(Object.hasOwn(application, key), false, `${key} must not be projected`);
    }
  });

  it('scopes the query to the verified applicant, never a client-supplied id', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);
    await withHeaders(request(instance).get('/api/jobs-data/applications/list?applicantId=user-b'), asUserA);
    assert.deepEqual(repository.calls.at(-1), ['getApplicantApplications', 'user-a']);
  });

  it('maps every stored application status onto the lifecycle vocabulary', () => {
    assert.equal(lifecycleLevel('pending'), 'APPLIED');
    assert.equal(lifecycleStatusFor('reviewing'), 'REVIEWING');
    assert.equal(lifecycleStatusFor('interview'), 'INTERVIEW_SCHEDULED');
    assert.equal(lifecycleStatusFor('rejected'), 'REJECTED');
    assert.equal(lifecycleStatusFor('accepted'), 'OFFERED');
    assert.equal(lifecycleStatusFor('PENDING'), 'APPLIED', 'stored values are matched case-insensitively');
    assert.equal(lifecycleStatusFor('mystery'), 'UNKNOWN', 'an unknown stored value is not guessed');
  });

  function lifecycleLevel(status) { return lifecycleStatusFor(status); }
});

describe('job tracker — Kanban columns, ownership and concurrency', () => {
  it('requires an authenticated candidate on every tracker route', async () => {
    const instance = jobsApp(trackerRepository());
    assert.equal((await request(instance).get('/api/jobs-data/tracker')).status, 401);
    assert.equal((await request(instance).post('/api/jobs-data/tracker').send({ title: 'x', company: 'y' })).status, 401);
    assert.equal((await request(instance).patch('/api/jobs-data/tracker/tracker-a').send({ status: 'offer', expectedRevision: 2 })).status, 401);
    assert.equal((await request(instance).delete('/api/jobs-data/tracker/tracker-a').send({ expectedRevision: 2 })).status, 401);
  });

  it('returns all five columns and only the caller’s cards', async () => {
    const instance = jobsApp(trackerRepository());
    const response = await withHeaders(request(instance).get('/api/jobs-data/tracker'), asUserA);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.columns, ['wishlist', 'applied', 'interview', 'offer', 'rejected']);
    assert.deepEqual(TRACKER_COLUMNS, ['wishlist', 'applied', 'interview', 'offer', 'rejected']);
    assert.deepEqual(response.body.jobs.map(job => job.id), ['tracker-a']);
  });

  it('creates a card for the caller and rejects an invalid column', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);
    const created = await withHeaders(request(instance).post('/api/jobs-data/tracker'), asUserA)
      .send({ title: 'Staff Engineer', company: 'Initech', status: 'wishlist' });
    assert.equal(created.status, 201);
    assert.equal(created.body.job.status, 'wishlist');

    const stored = [...repository.tracked.values()].find(job => job.title === 'Staff Engineer');
    assert.equal(stored.userId, 'user-a', 'the card is scoped to the authenticated candidate');

    const invalid = await withHeaders(request(instance).post('/api/jobs-data/tracker'), asUserA)
      .send({ title: 'Bad column', company: 'Initech', status: 'ghosted' });
    assert.equal(invalid.status, 400);
  });

  it('persists a stage move and the card metadata with the revision check', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);
    const response = await withHeaders(request(instance).patch('/api/jobs-data/tracker/tracker-a'), asUserA)
      .send({ status: 'offer', expectedRevision: 2 });

    assert.equal(response.status, 200);
    assert.equal(response.body.job.status, 'offer');
    assert.equal(response.body.job.revision, 3);
    assert.equal(repository.tracked.get('tracker-a').status, 'offer');

    // The rest of the card survives a stage move.
    assert.equal(repository.tracked.get('tracker-a').notes, 'Prepare the system design round.');
    assert.equal(repository.tracked.get('tracker-a').salary, '24 LPA');
    assert.equal(repository.tracked.get('tracker-a').deadline, '2026-11-01');
  });

  it('requires expectedRevision and rejects a stale one', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);

    const missing = await withHeaders(request(instance).patch('/api/jobs-data/tracker/tracker-a'), asUserA).send({ status: 'offer' });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.code, 'JOB_TRACKER_REVISION_REQUIRED');

    const stale = await withHeaders(request(instance).patch('/api/jobs-data/tracker/tracker-a'), asUserA)
      .send({ status: 'offer', expectedRevision: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'JOB_TRACKER_CONFLICT');
    assert.equal(stale.body.remoteRevision, 2);
    assert.equal(repository.tracked.get('tracker-a').status, 'applied', 'the stale move changed nothing');
  });

  it('never lets one candidate read or change another candidate’s card', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);

    const theirList = await withHeaders(request(instance).get('/api/jobs-data/tracker'), asUserB);
    assert.deepEqual(theirList.body.jobs.map(job => job.id), ['tracker-b']);

    const hijack = await withHeaders(request(instance).patch('/api/jobs-data/tracker/tracker-a'), asUserB)
      .send({ status: 'rejected', expectedRevision: 2 });
    assert.equal(hijack.status, 404);
    assert.equal(repository.tracked.get('tracker-a').status, 'applied');

    const hijackDelete = await withHeaders(request(instance).delete('/api/jobs-data/tracker/tracker-a'), asUserB)
      .send({ expectedRevision: 2 });
    assert.equal(hijackDelete.status, 404);
    assert.equal(repository.tracked.has('tracker-a'), true);
  });

  it('deletes a card only with the current revision', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);

    const stale = await withHeaders(request(instance).delete('/api/jobs-data/tracker/tracker-a'), asUserA).send({ expectedRevision: 1 });
    assert.equal(stale.status, 409);
    assert.equal(repository.tracked.has('tracker-a'), true);

    const removed = await withHeaders(request(instance).delete('/api/jobs-data/tracker/tracker-a'), asUserA).send({ expectedRevision: 2 });
    assert.equal(removed.status, 200);
    assert.equal(repository.tracked.has('tracker-a'), false);
  });

  it('keeps interview details, salary, notes and deadlines on the same card', async () => {
    const repository = trackerRepository();
    const instance = jobsApp(repository);
    await withHeaders(request(instance).patch('/api/jobs-data/tracker/tracker-a'), asUserA)
      .send({ interviewRound: 'System Design', salary: '26 LPA', notes: 'Panel round.', deadline: '2026-12-01', expectedRevision: 2 });

    const stored = repository.tracked.get('tracker-a');
    assert.equal(stored.interviewRound, 'System Design');
    assert.equal(stored.salary, '26 LPA');
    assert.equal(stored.notes, 'Panel round.');
    assert.equal(stored.deadline, '2026-12-01');
  });

  it('reports a tracker outage as an unavailable service, leaking nothing', async () => {
    const broken = {
      async getTrackedJobs() { throw new Error('ER_ACCESS_DENIED_ERROR password=secret host=db.internal'); },
    };
    const instance = jobsApp(broken);
    const response = await withHeaders(request(instance).get('/api/jobs-data/tracker'), asUserA);
    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);
    assert.doesNotMatch(JSON.stringify(response.body), /password|db\.internal|ER_ACCESS/);
  });
});

// ─────────────────────── frontend truthfulness contracts ───────────────────────

const readFrontend = relative => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', relative), 'utf8');

describe('frontend contracts — real data, no mock fallbacks, safe rendering', () => {
  it('the support page reads and writes the real ticket API', () => {
    const source = readFrontend('pages/dashboard/support.tsx');
    assert.match(source, /get<TicketListResponse>\('\/support\/tickets'\)/);
    assert.match(source, /post<TicketResponse>\('\/support\/tickets'/);
    assert.match(source, /\/reply`/);
    // No fixture tickets: no hardcoded sample subjects or ids.
    assert.doesNotMatch(source, /mockTicket|sampleTicket|fixture|placeholderTicket/i);
    assert.doesNotMatch(source, /MOCK_/);
  });

  it('the support dialog is the accessible Radix primitive with a real name and description', () => {
    const source = readFrontend('pages/dashboard/support.tsx');
    assert.match(source, /<Dialog\b/);
    assert.match(source, /<DialogTitle[^>]*>Create Support Ticket<\/DialogTitle>/);
    assert.match(source, /<DialogDescription/);
    assert.match(source, /onEscapeKeyDown=\{\(event\) => \{ if \(createPending\) event\.preventDefault\(\); \}\}/);
    // Validation errors are wired to their inputs, not only printed.
    assert.match(source, /aria-describedby=\{fieldErrors\.subject \? subjectErrorId : undefined\}/);
    assert.match(source, /aria-invalid=\{Boolean\(fieldErrors\.message\) \|\| undefined\}/);
  });

  it('no assigned page injects raw HTML into the DOM', () => {
    for (const file of [
      'pages/dashboard/support.tsx',
      'pages/dashboard/applied-jobs.tsx',
      'pages/dashboard/job-tracker.tsx',
      'pages/blog/index.tsx',
      'pages/blog/editor.tsx',
    ]) {
      assert.doesNotMatch(readFrontend(file), /dangerouslySetInnerHTML/, `${file} must not inject HTML`);
    }
  });

  it('the blog editor renders its preview through the safe Markdown parser', () => {
    const source = readFrontend('pages/blog/editor.tsx');
    assert.match(source, /function renderMarkdown\(/);
    assert.match(source, /function inlineNodes\(/);
    assert.match(source, /const preview = useMemo\(\(\) => renderMarkdown\(postData\.content\)/);
    // A failed load is an error state, never a substitute article.
    assert.match(source, /setLoadState\('error'\)/);
    assert.match(source, /Article not available/);
    // Deletion always carries the compare-and-swap revision.
    assert.match(source, /expectedRevision: postData\.revision/);
  });

  it('the blog index asks the API for its page and never falls back to sample articles', () => {
    const source = readFrontend('pages/blog/index.tsx');
    assert.match(source, /get<unknown>\('\/blog-data', params\)/);
    assert.match(source, /'\/blog-data\/categories'/);
    assert.match(source, /requestSeq\.current/);
    assert.doesNotMatch(source, /const CATEGORIES = \[/);
  });

  it('the tracker and applied-jobs pages use the real API modules and reconcile failures', () => {
    const tracker = readFrontend('pages/dashboard/job-tracker.tsx');
    assert.match(tracker, /listTrackedJobs/);
    assert.match(tracker, /updateTrackedJob/);
    assert.match(tracker, /TRACKER_STAGES/);
    assert.match(tracker, /setJobs\(\(current\) => current\.map/);
    // A conflict or a failed reload must be announced, never swallowed.
    assert.doesNotMatch(tracker, /catch\(\(\) => undefined\)/);
    assert.doesNotMatch(tracker, /catch\(\(\) => null\)/);
    assert.match(tracker, /could not be loaded/);

    const applied = readFrontend('pages/dashboard/applied-jobs.tsx');
    assert.match(applied, /listApplications/);
    assert.match(applied, /withdrawApplication|WithdrawDialog/);
    assert.match(applied, /role="alert"/);
  });

  it('no assigned frontend page contains an empty catch that hides a failure', () => {
    for (const file of [
      'pages/dashboard/support.tsx',
      'pages/dashboard/applied-jobs.tsx',
      'pages/dashboard/job-tracker.tsx',
      'pages/blog/index.tsx',
      'pages/blog/editor.tsx',
    ]) {
      const source = readFrontend(file);
      assert.doesNotMatch(source, /catch\s*\([^)]*\)\s*\{\s*\}/, `${file} has an empty catch block`);
      assert.doesNotMatch(source, /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/, `${file} swallows a rejection`);
    }
  });
});

describe('backend failure hygiene — assigned files swallow nothing', () => {
  const backendRoot = path.join(__dirname, '..');
  const assigned = [
    'routes/support.js',
    'services/supportTickets.js',
    'routes/blogData.js',
    'routes/jobsData.js',
  ];

  it('has no empty catch blocks', () => {
    for (const file of assigned) {
      const source = fs.readFileSync(path.join(backendRoot, file), 'utf8');
      assert.doesNotMatch(source, /catch\s*\([^)]*\)\s*\{\s*\}/, `${file}`);
      assert.doesNotMatch(source, /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/, `${file}`);
    }
  });

  it('never writes to a column the schema does not define', () => {
    const support = fs.readFileSync(path.join(backendRoot, 'services/supportTickets.js'), 'utf8');
    const migration = fs.readFileSync(path.join(backendRoot, 'database/migrations/015_support_tickets.sql'), 'utf8');
    // support_tickets has no category/resolution_note column: the service must not write one.
    assert.doesNotMatch(migration, /\bcategory\b/);
    assert.doesNotMatch(support, /INSERT INTO support_tickets[^;]*category/i);
    assert.doesNotMatch(support, /UPDATE support_tickets SET[^;]*resolution/i);

    const blog = fs.readFileSync(path.join(backendRoot, 'routes/blogData.js'), 'utf8');
    const baseline = fs.readFileSync(path.join(backendRoot, 'database/migrations/001_baseline.sql'), 'utf8');
    // The CMS table is `blog`, not `blog_posts`.
    assert.match(baseline, /CREATE TABLE IF NOT EXISTS blog \(/);
    assert.doesNotMatch(blog, /FROM blog_posts|INTO blog_posts/i);
  });
});
