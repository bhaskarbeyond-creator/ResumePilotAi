'use strict';

/**
 * Support Helpdesk Backend Contract (DISC-029 / DISC-047 / FP-A19)
 * - GET/POST /api/support/tickets  (candidate, scoped to req.user.uid)
 * - GET /api/admin/support/tickets (operator; tickets.manage)
 * - POST /api/support/tickets/:id/reply and POST /api/admin/support/tickets/:id/reply
 * - PATCH /api/admin/support/tickets/:id/status
 *
 * The ticket service talks to MySQL directly, so this suite patches the pool
 * with a deterministic in-memory fake. Identity is provided by the local test
 * token verifier. No MariaDB or SMTP is required.
 */

process.env.NODE_ENV = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const auth = require('../security/auth');

// Patch the pool before the app (and its routers/services) are required, so
// every module that calls `getPool` from './database/mysql' sees the fake.
const mysql = require('../database/mysql');

class FakePool {
  constructor() {
    this.tickets = new Map();   // id -> ticket row
    this.messages = new Map();  // ticketId -> message rows[]
    this.users = new Map();
  }

  async query(sql, params = []) {
    const norm = String(sql).replace(/\s+/g, ' ').trim();
    const low = norm.toLowerCase();

    if (/^insert ignore into users/i.test(low)) {
      this.users.set(String(params[0]), { id: params[0], email: params[1] || '', revision: 1 });
      return [{ affectedRows: 1 }];
    }
    if (/^insert into support_tickets/i.test(low)) {
      // VALUES (id, user_id, subject, 'OPEN', priority) — status is literal.
      const [id, userId, subject, priority] = params;
      const now = new Date().toISOString();
      this.tickets.set(id, { id, user_id: userId, subject, status: 'OPEN', priority, created_at: now, updated_at: now });
      this.messages.set(id, []);
      return [{ affectedRows: 1, insertId: id }];
    }
    if (/^insert into support_ticket_messages/i.test(low)) {
      const [id, ticketId, authorUid, authorRole, body] = params;
      const now = new Date().toISOString();
      const list = this.messages.get(ticketId) || [];
      list.push({ id, ticket_id: ticketId, author_uid: authorUid, author_role: authorRole, body, created_at: now });
      this.messages.set(ticketId, list);
      const ticket = this.tickets.get(ticketId);
      if (ticket) ticket.updated_at = now;
      return [{ affectedRows: 1 }];
    }
    if (/^update support_tickets set status/i.test(low)) {
      const [status, ticketId] = params;
      const ticket = this.tickets.get(ticketId);
      if (!ticket) return [{ affectedRows: 0 }];
      ticket.status = status;
      ticket.updated_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }
    if (/^update support_tickets set updated_at/i.test(low)) {
      const [ticketId] = params;
      const ticket = this.tickets.get(ticketId);
      if (ticket) ticket.updated_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }
    if (/^select count, expiresat from enterprise_quota_buckets/i.test(low)) {
      return [[]];
    }
    if (/^insert into enterprise_quota_buckets/i.test(low)) return [{ affectedRows: 1 }];
    if (/^update enterprise_quota_buckets/i.test(low)) return [{ affectedRows: 1 }];
    if (/^select id, user_id, subject, status, priority.*from support_tickets where id = \?/i.test(low)) {
      const ticket = this.tickets.get(params[0]);
      return [[ticket ? { ...ticket } : undefined].filter(Boolean)];
    }
    if (/^select id, ticket_id, author_uid, author_role, body, created_at.*from support_ticket_messages where ticket_id = \?/i.test(low)) {
      return [this.messages.get(params[0]) || []];
    }
    if (/^select id, user_id, subject, status, priority.*from support_tickets/i.test(low) && !/where id = \?/i.test(low)) {
      let rows = Array.from(this.tickets.values());
      const userMatch = norm.match(/where\s+user_id\s*=\s*\?/i);
      const columnMatch = norm.match(/where\s+(status|priority)\s*=\s*\?/i);
      if (userMatch) rows = rows.filter(row => row.user_id === params[0]);
      else if (columnMatch) rows = rows.filter(row => row[columnMatch[1]] === params[0]);
      rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      const page = norm.match(/limit\s+\?\s+offset\s+\?/i);
      if (page) {
        const limit = Number(params[params.length - 2]);
        const offset = Number(params[params.length - 1]);
        rows = rows.slice(Number.isFinite(offset) ? offset : 0, Number.isFinite(offset) ? offset + (Number.isFinite(limit) ? limit : 200) : 200);
      } else {
        rows = rows.slice(0, 200);
      }
      return [rows];
    }
    throw new Error(`Unsupported fake pool query: ${norm.slice(0, 140)}`);
  }

  async getConnection() {
    return {
      beginTransaction: async () => {},
      query: (sql, params) => this.query(sql, params),
      commit: async () => {},
      rollback: async () => {},
      release: async () => {},
    };
  }
}

const pool = new FakePool();
mysql.setPoolForTests(pool);

const app = require('../index');

const IDENTITIES = {
  'user-a': {
    uid: 'ua', email: 'a@sd-test.local', role: 'USER', email_verified: true,
    permissions: ['resumes.manage', 'subscription.self'],
  },
  'user-b': {
    uid: 'ub', email: 'b@sd-test.local', role: 'USER', email_verified: true,
    permissions: ['resumes.manage', 'subscription.self'],
  },
  staff: {
    uid: 'st', email: 'staff@sd-test.local', role: 'SUPPORT', email_verified: true,
    permissions: ['users.read', 'email.logs.read', 'tenants.read', 'tickets.manage'],
  },
  admin: {
    uid: 'ad', email: 'admin@sd-test.local', role: 'ADMIN', email_verified: true,
    permissions: ['tickets.manage', 'system.config.write'],
  },
};

auth.setTokenVerifierForTests(async token => {
  const identity = IDENTITIES[token];
  if (!identity) throw new Error('Unknown test token');
  return identity;
});

function bearer(token) { return `Bearer ${token}`; }

async function createTicket(actor, body) {
  return request(app).post('/api/support/tickets').set('Authorization', bearer(actor)).send(body);
}

describe('Support Helpdesk Backend Contract', () => {

  beforeEach(() => {
    pool.tickets.clear();
    pool.messages.clear();
    pool.users.clear();
  });

  describe('ticket creation (POST /api/support/tickets)', () => {
    it('rejects unauthenticated callers with 401', async () => {
      const res = await request(app).post('/api/support/tickets')
        .send({ subject: 'Login fails', category: 'technical', priority: 'high', description: 'I cannot log in.' });
      assert.equal(res.status, 401);
    });

    it('rejects invalid categories with 400', async () => {
      const res = await createTicket('user-a', { subject: 'Login fails', category: 'finance', priority: 'high', description: 'I cannot log in to the dashboard.' });
      assert.equal(res.status, 400);
    });

    it('creates a ticket and returns it with status open (201)', async () => {
      const res = await createTicket('user-a', { subject: 'Login fails', category: 'technical', priority: 'high', description: 'I cannot log in to the dashboard.' });
      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.ticket.id);
      assert.equal(res.body.ticket.status, 'open');
      assert.equal(res.body.ticket.subject, 'Login fails');
      assert.equal(res.body.ticket.priority, 'HIGH');
    });
  });

  describe('candidate ticket isolation (GET /api/support/tickets)', () => {
    it('scopes ticket lists to the caller uid', async () => {
      await createTicket('user-a', { subject: 'Ticket A', category: 'billing', priority: 'low', description: 'A longer description for ticket A.' });
      await createTicket('user-b', { subject: 'Ticket B', category: 'technical', priority: 'high', description: 'A longer description for ticket B.' });

      const a = await request(app).get('/api/support/tickets').set('Authorization', bearer('user-a'));
      assert.equal(a.status, 200);
      assert.equal(a.body.tickets.length, 1);
      assert.equal(a.body.tickets[0].subject, 'Ticket A');

      const b = await request(app).get('/api/support/tickets').set('Authorization', bearer('user-b'));
      assert.equal(b.status, 200);
      assert.equal(b.body.tickets.length, 1);
      assert.equal(b.body.tickets[0].subject, 'Ticket B');
    });

    it('rejects unauthenticated reads with 401', async () => {
      const res = await request(app).get('/api/support/tickets');
      assert.equal(res.status, 401);
    });

    it('returns 404 for a ticket the caller does not own', async () => {
      await createTicket('user-a', { subject: 'Private', category: 'general', priority: 'medium', description: 'A longer private description.' });
      const res = await request(app).get('/api/support/tickets/tkt_missing').set('Authorization', bearer('user-b'));
      assert.equal(res.status, 404);
    });
  });

  describe('ticket replies', () => {
    it('lets the ticket owner reply (200) via /reply', async () => {
      const created = await createTicket('user-a', { subject: 'Reply request', category: 'technical', priority: 'low', description: 'A longer description for the reply test.' });
      const ticketId = created.body.ticket.id;

      const res = await request(app)
        .post(`/api/support/tickets/${ticketId}/reply`)
        .set('Authorization', bearer('user-a'))
        .send({ message: 'Any updates?' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.reply.id);
      assert.equal(res.body.reply.senderUid, 'ua');
      assert.equal(res.body.reply.message, 'Any updates?');
      assert.ok(res.body.reply.createdAt);
    });

    it('lets a support agent reply via the admin desk (200)', async () => {
      const created = await createTicket('user-a', { subject: 'Agent reply', category: 'general', priority: 'low', description: 'A longer description for the agent reply test.' });
      const ticketId = created.body.ticket.id;

      const res = await request(app)
        .post(`/api/admin/support/tickets/${ticketId}/reply`)
        .set('Authorization', bearer('staff'))
        .send({ message: 'We are looking into it.' });
      assert.equal(res.status, 200);
      assert.equal(res.body.reply.senderUid, 'st');
    });

    it('rejects a non-agent on the admin reply route with 403', async () => {
      const created = await createTicket('user-a', { subject: 'Non-agent reply', category: 'general', priority: 'low', description: 'A longer description for the 403 test.' });
      const ticketId = created.body.ticket.id;

      const res = await request(app)
        .post(`/api/admin/support/tickets/${ticketId}/reply`)
        .set('Authorization', bearer('user-a'))
        .send({ message: 'x' });
      assert.equal(res.status, 403);
    });

    it('returns 404 for replies on unknown tickets', async () => {
      const res = await request(app)
        .post('/api/support/tickets/tkt_does_not_exist/reply')
        .set('Authorization', bearer('user-a'))
        .send({ message: 'x' });
      assert.equal(res.status, 404);
    });
  });

  describe('operator ticket desk (GET/POST/PATCH /api/admin/support/*)', () => {
    it('lists all tickets for operators with status/priority/limit/offset', async () => {
      await createTicket('user-a', { subject: 'High priority', category: 'technical', priority: 'high', description: 'A longer high priority description.' });
      await createTicket('user-a', { subject: 'Low priority', category: 'billing', priority: 'low', description: 'A longer low priority description.' });

      const all = await request(app).get('/api/admin/support/tickets').set('Authorization', bearer('staff'));
      assert.equal(all.status, 200);
      assert.equal(all.body.tickets.length, 2);

      const high = await request(app).get('/api/admin/support/tickets?priority=high').set('Authorization', bearer('staff'));
      assert.equal(high.status, 200);
      assert.equal(high.body.tickets.length, 1);
      assert.equal(high.body.tickets[0].subject, 'High priority');

      const paged = await request(app).get('/api/admin/support/tickets?limit=1&offset=1').set('Authorization', bearer('staff'));
      assert.equal(paged.status, 200);
      assert.equal(paged.body.tickets.length, 1);
    });

    it('rejects invalid status filters with 400', async () => {
      const res = await request(app).get('/api/admin/support/tickets?status=archived').set('Authorization', bearer('staff'));
      assert.equal(res.status, 400);
    });

    it('updates ticket status with 200 (requires agent/admin)', async () => {
      const created = await createTicket('user-a', { subject: 'To resolve', category: 'general', priority: 'medium', description: 'A longer description to resolve.' });
      const ticketId = created.body.ticket.id;

      const res = await request(app)
        .patch(`/api/admin/support/tickets/${ticketId}/status`)
        .set('Authorization', bearer('admin'))
        .send({ status: 'resolved', resolutionNote: 'Fixed in latest release.' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.ticket.status, 'resolved');
    });

    it('rejects callers without tickets.manage on the admin desk with 403', async () => {
      const created = await createTicket('user-a', { subject: 'Forbidden status change', category: 'general', priority: 'low', description: 'A longer forbidden description.' });
      const ticketId = created.body.ticket.id;

      const res = await request(app)
        .patch(`/api/admin/support/tickets/${ticketId}/status`)
        .set('Authorization', bearer('user-a'))
        .send({ status: 'closed' });
      assert.equal(res.status, 403);
    });

    it('rejects unauthenticated operator requests with 401', async () => {
      const res = await request(app).get('/api/admin/support/tickets');
      assert.equal(res.status, 401);
    });
  });

});
