'use strict';

/**
 * Mandate 11C — Platform governance, moderation and operational integrity.
 *
 * Coverage:
 *   1. User360 identity lifecycle (PATCH /api/admin/users/:uid/status) and
 *      session revocation against the Firebase Admin identity abstraction.
 *   2. Employer application verification (companies + submitted application
 *      records) with transactional state, conflict detection and audit.
 *   3. Job marketplace moderation, anti-spam metadata and public-discovery
 *      suppression.
 *   4. Platform operations: verified database backup, cache clearing, live
 *      system telemetry.
 *   5. Administrative audit attribution and audit-failure behaviour.
 *
 * HOW THE PRODUCTION CODE IS EXERCISED
 *   - The real routers (backend/routes/adminUsers.js and
 *     backend/routes/adminPlatformOperations.js) are mounted on an Express app
 *     behind the production `requireAuth` middleware, so authentication,
 *     authorization and handler logic all run for real.
 *   - MariaDB is replaced through the repository's documented test seams
 *     (`setPoolForTests` / `setRepositoryForTests`) with a recording adapter
 *     that understands the exact parameterized statements the handlers issue.
 *     An unrecognised statement fails the test instead of silently passing, so
 *     a query change cannot slip through the suite unnoticed.
 *   - Firebase Admin Auth is replaced with an in-memory double injected through
 *     the app's own `firebaseAdmin` setting (the production lookup path).
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

const { requireAuth, setTokenVerifierForTests } = require('../security/auth');
const { setRepositoryForTests } = require('../repositories');
const { setPoolForTests } = require('../database/mysql');
const MySQLRepository = require('../repositories/MySQLRepository');
const { adminUsersRouter } = require('../routes/adminUsers');
const { adminPlatformOperationsRouter } = require('../routes/adminPlatformOperations');

// ---------------------------------------------------------------------------
// Identity tokens (production `requireAuth` is used, so these are verified the
// same way a Firebase ID token would be).
// ---------------------------------------------------------------------------
const NOW_SECONDS = Math.floor(Date.now() / 1000);
const TOKENS = {
  super: { uid: 'm11c-super', email: 'super@ime365.test', email_verified: true, role: 'SUPER_ADMIN', auth_time: NOW_SECONDS },
  admin: { uid: 'm11c-admin', email: 'admin@ime365.test', email_verified: true, role: 'ADMIN', auth_time: NOW_SECONDS },
  auditor: { uid: 'm11c-auditor', email: 'auditor@ime365.test', email_verified: true, role: 'AUDITOR', auth_time: NOW_SECONDS },
  support: { uid: 'm11c-support', email: 'support@ime365.test', email_verified: true, role: 'SUPPORT', auth_time: NOW_SECONDS },
  user: { uid: 'm11c-user', email: 'candidate@ime365.test', email_verified: true, role: 'USER', auth_time: NOW_SECONDS },
};

setTokenVerifierForTests(async token => {
  const identity = TOKENS[token];
  if (!identity) throw new Error('invalid test token');
  return identity;
});

const bearer = name => ({ Authorization: `Bearer ${name}` });

// ---------------------------------------------------------------------------
// Recording MariaDB adapter
// ---------------------------------------------------------------------------
const isoNow = () => new Date();

function createDatabase(seed = {}) {
  return {
    users: new Map((seed.users || []).map(user => [user.id, { ...user }])),
    companies: new Map((seed.companies || []).map(company => [company.id, { ...company }])),
    documents: new Map((seed.documents || []).map(doc => [doc.entity_id, { ...doc }])),
    jobs: new Map((seed.jobs || []).map(job => [job.id, { ...job }])),
    identities: new Map((seed.identities || []).map(identity => [identity.uid, { ...identity }])),
    notifications: [],
    statements: [],
    auditLog: [],
    committedTransactions: 0,
    rolledBackTransactions: 0,
    outboxFailure: null,
    auditFailure: false,
    firebaseFailure: false,
    claimFailure: false,
    claimWrites: [],
    alive: true,
  };
}

function unhandled(sql) {
  return Object.assign(new Error(`Unhandled test SQL: ${sql.slice(0, 160)}`), { code: 'UNHANDLED_TEST_SQL' });
}

function jobRow(job) {
  return {
    id: job.id,
    employer_id: job.employer_id || null,
    title: job.title || '',
    company_name: job.company_name || '',
    location: job.location || null,
    status: job.status || 'pending',
    revision: job.revision == null ? 1 : job.revision,
    extra_json: job.extra_json == null ? null : job.extra_json,
    created_at: job.created_at || isoNow(),
    updated_at: job.updated_at || isoNow(),
    expires_at: job.expires_at || null,
  };
}

function companyRow(company) {
  return {
    id: company.id,
    owner_id: company.owner_id || null,
    name: company.name || '',
    website: company.website || null,
    location: company.location || null,
    industry: company.industry || null,
    size: company.size || null,
    description: company.description || null,
    verified: company.verified ? 1 : 0,
    status: company.status || 'pending',
    revision: company.revision == null ? 1 : company.revision,
    extra_json: company.extra_json == null ? null : company.extra_json,
    created_at: company.created_at || isoNow(),
    updated_at: company.updated_at || isoNow(),
  };
}

function documentRow(doc) {
  return {
    entity_id: doc.entity_id,
    payload: typeof doc.payload === 'string' ? doc.payload : JSON.stringify(doc.payload || {}),
    created_at: doc.created_at || isoNow(),
    updated_at: doc.updated_at || isoNow(),
  };
}

/** Executes one parameterized statement against the recording database. */
function executeStatement(db, sqlRaw, params = []) {
  const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();
  db.statements.push({ sql, params });

  // --- health probe -------------------------------------------------------
  if (/^SELECT 1 AS alive/i.test(sql)) {
    if (!db.alive) throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' });
    return [[{ alive: 1 }]];
  }

  // --- users lifecycle ----------------------------------------------------
  if (/^SELECT revision, suspended, extra_data FROM users WHERE id = \? FOR UPDATE/i.test(sql)) {
    const user = db.users.get(params[0]);
    if (!user) return [[]];
    return [[{ revision: user.revision == null ? 1 : user.revision, suspended: user.suspended ? 1 : 0, extra_data: user.extra_data ?? null }]];
  }
  if (/^UPDATE users SET suspended = \?, extra_data = \?, revision = \?, updated_at = CURRENT_TIMESTAMP WHERE id = \? AND revision = \?/i.test(sql)) {
    const [suspended, extra, revision, id, expectedRevision] = params;
    const user = db.users.get(id);
    if (!user) return [{ affectedRows: 0 }];
    if (Number(user.revision == null ? 1 : user.revision) !== Number(expectedRevision)) return [{ affectedRows: 0 }];
    user.suspended = Number(suspended) === 1;
    user.extra_data = String(extra);
    user.revision = Number(revision);
    user.updated_at = isoNow();
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT updated_at FROM users WHERE id = \? LIMIT 1/i.test(sql)) {
    const user = db.users.get(params[0]);
    return [user ? [{ updated_at: user.updated_at || isoNow() }] : []];
  }

  // --- companies ----------------------------------------------------------
  if (/^SELECT id, owner_id, name, website, location, industry, size, description, verified, status, revision, extra_json, created_at, updated_at FROM companies WHERE LOWER\(status\) IN/i.test(sql)) {
    const limit = Number(params[params.length - 1]) || 50;
    const statuses = params.slice(0, -1).map(value => String(value).toLowerCase());
    const rows = [...db.companies.values()]
      .filter(company => statuses.includes(String(company.status || 'pending').toLowerCase()))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .map(companyRow);
    return [rows];
  }
  if (/^SELECT id, owner_id, name, website, location, industry, size, description, verified, status, revision, extra_json, created_at, updated_at FROM companies WHERE id = \? LIMIT 1/i.test(sql)) {
    const company = db.companies.get(params[0]);
    return [company ? [companyRow(company)] : []];
  }
  if (/^UPDATE companies SET verified = \?, status = \?, extra_json = \?, revision = revision \+ 1, updated_at = CURRENT_TIMESTAMP WHERE id = \? AND revision = \?/i.test(sql)) {
    const [verified, status, extra, id, expectedRevision] = params;
    const company = db.companies.get(id);
    if (!company) return [{ affectedRows: 0 }];
    if (Number(company.revision == null ? 1 : company.revision) !== Number(expectedRevision)) return [{ affectedRows: 0 }];
    company.verified = Number(verified) === 1;
    company.status = status;
    company.extra_json = String(extra);
    company.revision = Number(expectedRevision) + 1;
    company.updated_at = isoNow();
    return [{ affectedRows: 1 }];
  }

  // --- canonical_documents (employer application submissions) --------------
  if (/^SELECT entity_id, payload, created_at, updated_at FROM canonical_documents WHERE entity_type = 'employer_applications' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT \?/i.test(sql)) {
    const limit = Number(params[0]) || 50;
    const rows = [...db.documents.values()]
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      .slice(0, limit)
      .map(documentRow);
    return [rows];
  }
  if (/^SELECT entity_id, payload, created_at, updated_at FROM canonical_documents WHERE entity_type = 'employer_applications' AND entity_id = \? AND deleted_at IS NULL LIMIT 1/i.test(sql)) {
    const doc = db.documents.get(params[0]);
    return [doc ? [documentRow(doc)] : []];
  }
  if (/^UPDATE canonical_documents SET payload = \?, updated_at = CURRENT_TIMESTAMP WHERE entity_type = 'employer_applications' AND entity_id = \?/i.test(sql)) {
    const [payload, id] = params;
    const doc = db.documents.get(id);
    if (!doc) return [{ affectedRows: 0 }];
    const currentStatus = String((typeof doc.payload === 'string' ? JSON.parse(doc.payload) : doc.payload)?.status || '').toLowerCase();
    if (currentStatus && currentStatus !== 'pending') return [{ affectedRows: 0 }];
    doc.payload = String(payload);
    doc.updated_at = isoNow();
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT entity_id, payload, created_at, updated_at FROM canonical_documents WHERE entity_type = \? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT \?/i.test(sql)) {
    return [params[0] === 'employer_applications' ? [...db.documents.values()].map(documentRow) : []];
  }

  // --- jobs ----------------------------------------------------------------
  if (/^SELECT id, employer_id, title, company_name, status, revision, extra_json FROM jobs WHERE id = \? FOR UPDATE/i.test(sql)) {
    const job = db.jobs.get(params[0]);
    return [job ? [jobRow(job)] : []];
  }
  if (/^UPDATE jobs SET status = \?, extra_json = \?, revision = \?, updated_at = CURRENT_TIMESTAMP WHERE id = \? AND revision = \?/i.test(sql)) {
    const [status, extra, revision, id, expectedRevision] = params;
    const job = db.jobs.get(id);
    if (!job) return [{ affectedRows: 0 }];
    if (Number(job.revision == null ? 1 : job.revision) !== Number(expectedRevision)) return [{ affectedRows: 0 }];
    job.status = status;
    job.extra_json = String(extra);
    job.revision = Number(revision);
    job.updated_at = isoNow();
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT id, employer_id, title, company_name, location, status, revision, extra_json, created_at, updated_at, expires_at FROM jobs WHERE 1=1/i.test(sql)) {
    const limit = Number(params[params.length - 1]) || 100;
    const filters = params.slice(0, -1);
    let rows = [...db.jobs.values()];
    if (sql.includes("LOWER(status) IN ('pending','flagged')")) {
      rows = rows.filter(job => ['pending', 'flagged'].includes(String(job.status).toLowerCase()));
    } else if (sql.includes('AND LOWER(status) = ?')) {
      const status = String(filters.shift()).toLowerCase();
      rows = rows.filter(job => String(job.status).toLowerCase() === status);
    }
    if (sql.includes('title LIKE ?')) {
      const [titleLike, companyLike, locationLike, idLike] = filters;
      const match = (value, like) => String(value || '').toLowerCase().includes(String(like || '').replace(/%/g, '').toLowerCase());
      rows = rows.filter(job => match(job.title, titleLike) || match(job.company_name, companyLike)
        || match(job.location, locationLike) || match(job.id, idLike));
    }
    rows = rows
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .map(jobRow);
    return [rows];
  }
  // Repository-level reads used by the legacy index.js handlers and by the
  // public discovery invariant check.
  if (/^SELECT \* FROM jobs WHERE 1=1/i.test(sql)) {
    let rows = [...db.jobs.values()];
    if (sql.includes("LOWER(status) = 'active'")) {
      rows = rows.filter(job => String(job.status).toLowerCase() === 'active');
    }
    if (sql.includes('AND LOWER(status) = LOWER(?)')) {
      const status = String(params[0]).toLowerCase();
      rows = rows.filter(job => String(job.status).toLowerCase() === status);
    }
    const limitIndex = sql.includes('LIMIT ?') ? params.length - 1 : -1;
    if (limitIndex >= 0) rows = rows.slice(0, Number(params[limitIndex]));
    return [rows.map(jobRow)];
  }
  if (/^SELECT \* FROM jobs ORDER BY updated_at DESC LIMIT \?/i.test(sql)) {
    return [[...db.jobs.values()].map(jobRow)];
  }

  // --- notification outbox ------------------------------------------------
  if (/^INSERT INTO notification_outbox/i.test(sql)) {
    if (db.outboxFailure) throw Object.assign(new Error('outbox store unavailable'), { code: 'OUTBOX_WRITE_FAILED' });
    db.notifications.push({ id: params[0], eventId: params[1], recipient: params[2], templateType: params[3], metadata: params[5] });
    return [{ affectedRows: 1, insertId: 1 }];
  }
  if (/^SELECT id, event_id, recipient, template_type FROM notification_outbox WHERE idempotency_key = \? FOR UPDATE/i.test(sql)) {
    return [[]];
  }

  throw unhandled(sql);
}

function createPool(db) {
  const connection = {
    async query(sql, params) { return executeStatement(db, sql, params); },
    async beginTransaction() {},
    async commit() { db.committedTransactions += 1; },
    async rollback() { db.rolledBackTransactions += 1; },
    release() {},
  };
  const pool = {
    async query(sql, params) { return executeStatement(db, sql, params); },
    async getConnection() { return connection; },
    async end() {},
    // Present so pool telemetry can be asserted without inventing numbers.
    pool: {
      config: { connectionLimit: 15 },
      _allConnections: [],
      _freeConnections: [],
      _connectionQueue: [],
    },
  };
  return pool;
}

function createRepository(db) {
  return {
    async getUser(uid) {
      const user = db.users.get(uid);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName || null,
        revision: user.revision == null ? 1 : user.revision,
        suspended: Boolean(user.suspended),
        extra_data: user.extra_data ?? null,
      };
    },
    async recordAdminAuditLog(doc) {
      if (db.auditFailure) throw Object.assign(new Error('audit store unavailable'), { code: 'AUDIT_WRITE_FAILED' });
      db.auditLog.push(doc);
      return doc;
    },
  };
}

function createFirebaseAdmin(db) {
  const missing = () => Object.assign(new Error('no user record'), { code: 'auth/user-not-found' });
  const down = () => Object.assign(new Error('identity backend unavailable'), { code: 'auth/internal-error' });
  return {
    auth() {
      return {
        async getUser(uid) {
          const identity = db.identities.get(uid);
          if (!identity) throw missing();
          return {
            uid,
            email: identity.email,
            disabled: Boolean(identity.disabled),
            customClaims: identity.claims || {},
            tokensValidAfterTime: identity.tokensValidAfterTime || isoNow(),
            multiFactor: { enrolledFactors: [] },
            providerData: [],
            metadata: {},
          };
        },
        async updateUser(uid, patch) {
          if (db.firebaseFailure) throw down();
          const identity = db.identities.get(uid);
          if (!identity) throw missing();
          if (patch.disabled !== undefined) identity.disabled = Boolean(patch.disabled);
          return { uid, ...patch };
        },
        async revokeRefreshTokens(uid) {
          if (db.firebaseFailure) throw down();
          const identity = db.identities.get(uid);
          if (!identity) throw missing();
          identity.tokensValidAfterTime = new Date();
          identity.revocations = (identity.revocations || 0) + 1;
          return true;
        },
        async setCustomUserClaims(uid, claims) {
          if (db.claimFailure) throw down();
          const identity = db.identities.get(uid);
          if (!identity) throw missing();
          identity.claims = claims;
          db.claimWrites.push({ uid, claims });
          return true;
        },
      };
    },
  };
}

/**
 * Mount the real routers behind the production auth middleware. The injected
 * pool/repository/firebaseAdmin are the same seams the shipped code resolves.
 */
function buildApp(db) {
  setPoolForTests(createPool(db));
  setRepositoryForTests(createRepository(db));
  const app = express();
  app.use(express.json());
  app.set('firebaseAdmin', createFirebaseAdmin(db));
  app.use((_req, res, next) => { res.locals.requestId = 'test-request-id'; next(); });
  app.use(requireAuth);
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin', adminPlatformOperationsRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ success: false, code: 'UNHANDLED_TEST_ERROR', error: String(err?.message || err) });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function baseSeed() {
  return {
    users: [
      { id: 'm11c-target', email: 'target@ime365.test', displayName: 'Target User', revision: 3, suspended: false, extra_data: JSON.stringify({ preferredCurrency: 'INR' }) },
      { id: 'm11c-target-2', email: 'target2@ime365.test', displayName: 'Second User', revision: 1, suspended: false, extra_data: null },
    ],
    identities: [
      { uid: 'm11c-target', email: 'target@ime365.test', disabled: false },
      { uid: 'm11c-target-2', email: 'target2@ime365.test', disabled: false },
      { uid: 'm11c-owner', email: 'owner@employer.test', disabled: false, claims: { role: 'EMPLOYER' } },
    ],
    companies: [
      {
        id: 'company-pending',
        owner_id: 'm11c-owner',
        name: 'Nexus Robotics Pvt Ltd',
        website: 'https://nexus.example',
        location: 'Berlin, Germany',
        industry: 'Robotics',
        size: '51-200',
        description: 'Industrial robotics.',
        status: 'pending',
        verified: false,
        revision: 2,
        extra_json: JSON.stringify({ taxId: 'DE391829104', contactEmail: 'legal@nexus.example', contactPerson: 'Klaus Schmidt', contactPersonTitle: 'Talent Director', contactPhone: '+49 30 9182 301', linkedinProfile: 'https://linkedin.com/company/nexus' }),
      },
      {
        id: 'company-approved',
        owner_id: 'm11c-owner',
        name: 'Already Verified Ltd',
        status: 'approved',
        verified: true,
        revision: 4,
        extra_json: JSON.stringify({ contactEmail: 'hr@verified.example' }),
      },
    ],
    documents: [
      {
        entity_id: 'm11c-owner',
        payload: JSON.stringify({ companyName: 'Owner Startup', status: 'pending', submittedAt: '2026-10-01T10:00:00.000Z', taxId: 'US-829104812', contactEmail: 'founder@ownerstartup.example', contactPerson: 'Dana Reed', industry: 'SaaS', location: 'Austin, TX' }),
      },
    ],
    jobs: [
      { id: 'job-pending', employer_id: 'm11c-owner', title: 'Backend Engineer', company_name: 'Nexus Robotics', location: 'Remote', status: 'pending', revision: 1, created_at: new Date('2026-10-01T09:00:00Z') },
      { id: 'job-active', employer_id: 'm11c-owner', title: 'Platform Engineer', company_name: 'Nexus Robotics', location: 'Berlin', status: 'active', revision: 5, created_at: new Date('2026-09-01T09:00:00Z') },
      { id: 'job-flagged', employer_id: 'm11c-owner', title: 'Earn $5000/day Typist', company_name: 'Quick Money', location: 'Remote', status: 'flagged', revision: 2, created_at: new Date('2026-09-20T09:00:00Z'), extra_json: JSON.stringify({ moderation: { isSpam: true, notes: 'Crypto spam', moderatedAt: '2026-09-20T10:00:00.000Z' } }) },
      { id: 'job-draft', employer_id: 'm11c-owner', title: 'Draft Role', company_name: 'Nexus Robotics', location: 'Berlin', status: 'draft', revision: 1, created_at: new Date('2026-10-05T09:00:00Z') },
    ],
  };
}

function appWithSeed(seedOverrides = {}) {
  const db = createDatabase({ ...baseSeed(), ...seedOverrides });
  return { db, app: buildApp(db) };
}

test.afterEach(() => {
  setPoolForTests(null);
  setRepositoryForTests(null);
});

// ===========================================================================
// 1. Authentication & authorization
// ===========================================================================
test.describe('Authentication and authorization', () => {
  test('unauthenticated administrative requests are rejected with 401', async () => {
    const { app } = appWithSeed();
    const calls = [
      ['patch', '/api/admin/users/m11c-target/status', { status: 'SUSPENDED' }],
      ['post', '/api/admin/users/m11c-target/revoke-sessions', {}],
      ['get', '/api/admin/employer-applications', undefined],
      ['post', '/api/admin/employer-applications/company-pending/verify', { decision: 'APPROVED' }],
      ['get', '/api/admin/jobs', undefined],
      ['get', '/api/admin/jobs/pending-moderation', undefined],
      ['post', '/api/admin/jobs/job-pending/moderate', { status: 'active' }],
      ['post', '/api/admin/operations/backup', {}],
      ['post', '/api/admin/operations/cache-clear', {}],
      ['get', '/api/admin/operations/system-status', undefined],
    ];
    for (const [method, url, body] of calls) {
      const response = await request(app)[method](url).send(body);
      assert.equal(response.status, 401, `${method.toUpperCase()} ${url} must require authentication`);
    }
  });

  test('non-administrative identities are denied with 403', async () => {
    const { app, db } = appWithSeed();
    const denied = [
      ['patch', '/api/admin/users/m11c-target/status', { status: 'SUSPENDED' }],
      ['post', '/api/admin/users/m11c-target/revoke-sessions', {}],
      ['post', '/api/admin/operations/backup', {}],
      ['post', '/api/admin/operations/cache-clear', {}],
    ];
    for (const [method, url, body] of denied) {
      const response = await request(app)[method](url).set(bearer('user')).send(body);
      assert.equal(response.status, 403, `${method.toUpperCase()} ${url} must deny a USER identity`);
    }
    // An auditor has read rights only: mutations stay denied.
    const auditorStatus = await request(app).patch('/api/admin/users/m11c-target/status').set(bearer('auditor')).send({ status: 'SUSPENDED' });
    assert.equal(auditorStatus.status, 403);
    // Backup/cache clearing are super-admin operations: a delegation-level ADMIN is denied.
    const adminBackup = await request(app).post('/api/admin/operations/backup').set(bearer('admin')).send({});
    assert.equal(adminBackup.status, 403);
    const adminCache = await request(app).post('/api/admin/operations/cache-clear').set(bearer('admin')).send({});
    assert.equal(adminCache.status, 403);
    assert.equal(db.identities.get('m11c-target').disabled, false, 'a denied request must not mutate identity state');
    assert.equal(db.auditLog.length, 0, 'a denied request must not write an audit event');
  });

  test('read-only administrators receive the queue without applicant tax/contact data', async () => {
    const { app } = appWithSeed();
    const auditorView = await request(app).get('/api/admin/employer-applications').set(bearer('auditor'));
    assert.equal(auditorView.status, 200);
    assert.ok(Array.isArray(auditorView.body.applications));
    assert.ok(auditorView.body.applications.length > 0);
    for (const application of auditorView.body.applications) {
      assert.equal(application.taxId, undefined, 'tax identifiers must not be disclosed to read-only roles');
      assert.equal(application.contactEmail, undefined);
      assert.equal(application.contactPhone, undefined);
    }
    assert.ok(Array.isArray(auditorView.body.restricted));

    const adminView = await request(app).get('/api/admin/employer-applications').set(bearer('admin'));
    assert.equal(adminView.status, 200);
    const pending = adminView.body.applications.find(application => application.id === 'company-pending');
    assert.ok(pending, 'the pending company application must be listed');
    assert.equal(pending.taxId, 'DE391829104', 'a reviewing administrator sees the verification dossier');
    assert.equal(pending.companyName, 'Nexus Robotics Pvt Ltd');
    assert.equal(pending.status, 'PENDING');
    assert.equal(adminView.body.restricted, null);
  });
});

// ===========================================================================
// 2. User360 identity lifecycle
// ===========================================================================
test.describe('User360 identity lifecycle', () => {
  test('PATCH status persists SUSPENDED in MariaDB and disables the identity', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app)
      .patch('/api/admin/users/m11c-target/status')
      .set(bearer('admin'))
      .send({ status: 'SUSPENDED', reason: 'Chargeback fraud investigation' });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.uid, 'm11c-target');
    assert.equal(response.body.status, 'SUSPENDED');
    assert.equal(response.body.previousStatus, 'ACTIVE');
    assert.equal(response.body.identity.disabled, true);
    assert.equal(response.body.persistence.profilePersisted, true);
    assert.ok(Number.isFinite(new Date(response.body.updatedAt).getTime()), 'updatedAt must be an ISO timestamp');

    const user = db.users.get('m11c-target');
    assert.equal(user.suspended, true);
    const extra = JSON.parse(user.extra_data);
    assert.equal(extra.accountStatus, 'SUSPENDED');
    assert.equal(extra.accountStatusReason, 'Chargeback fraud investigation');
    assert.equal(extra.preferredCurrency, 'INR', 'unrelated profile metadata must be preserved');
    assert.equal(user.revision, 4, 'the profile revision must be bumped');

    const identity = db.identities.get('m11c-target');
    assert.equal(identity.disabled, true);
    assert.equal(identity.revocations, 1, 'disabling an account must revoke refresh tokens');

    const audit = db.auditLog.find(entry => entry.action === 'USER_STATUS_UPDATED');
    assert.ok(audit, 'the lifecycle change must be audited');
    assert.equal(audit.actorUid, 'm11c-admin');
    assert.equal(audit.resourceType, 'user');
    assert.equal(audit.resourceId, 'm11c-target');
    assert.equal(audit.outcome, 'SUCCESS');
    assert.equal(audit.metadata.previousStatus, 'ACTIVE');
    assert.equal(audit.metadata.status, 'SUSPENDED');
  });

  test('DISABLED is persisted distinctly from SUSPENDED and ACTIVE restores the account', async () => {
    const { app, db } = appWithSeed();
    const disabled = await request(app)
      .patch('/api/admin/users/m11c-target/status')
      .set(bearer('super'))
      .send({ status: 'DISABLED', reason: 'Policy violation' });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.status, 'DISABLED');
    assert.equal(JSON.parse(db.users.get('m11c-target').extra_data).accountStatus, 'DISABLED');

    const reactivated = await request(app)
      .patch('/api/admin/users/m11c-target/status')
      .set(bearer('super'))
      .send({ status: 'ACTIVE' });
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.status, 'ACTIVE');
    assert.equal(reactivated.body.previousStatus, 'DISABLED');
    const user = db.users.get('m11c-target');
    assert.equal(user.suspended, false);
    const extra = JSON.parse(user.extra_data);
    assert.equal(extra.accountStatus, 'ACTIVE');
    assert.equal(extra.accountStatusReason, null, 'a reactivation clears the stale reason');
    assert.equal(db.identities.get('m11c-target').disabled, false);
  });

  test('invalid payloads and identifiers are rejected before any mutation', async () => {
    const { app, db } = appWithSeed();
    const invalidStatus = await request(app).patch('/api/admin/users/m11c-target/status').set(bearer('admin')).send({ status: 'BANNED' });
    assert.equal(invalidStatus.status, 400);
    assert.equal(invalidStatus.body.code, 'INVALID_ACCOUNT_STATUS');

    const missingStatus = await request(app).patch('/api/admin/users/m11c-target/status').set(bearer('admin')).send({ reason: 'no status' });
    assert.equal(missingStatus.status, 400);

    const longReason = await request(app).patch('/api/admin/users/m11c-target/status').set(bearer('admin')).send({ status: 'ACTIVE', reason: 'x'.repeat(501) });
    assert.equal(longReason.status, 400);
    assert.equal(longReason.body.code, 'INVALID_STATUS_REASON');

    const badId = await request(app).patch('/api/admin/users/%20bad%20id%20/status').set(bearer('admin')).send({ status: 'ACTIVE' });
    assert.equal(badId.status, 400);

    const missingUser = await request(app).patch('/api/admin/users/does-not-exist/status').set(bearer('admin')).send({ status: 'SUSPENDED' });
    assert.equal(missingUser.status, 404);
    assert.equal(missingUser.body.code, 'USER_NOT_FOUND');

    const selfChange = await request(app).patch('/api/admin/users/m11c-admin/status').set(bearer('admin')).send({ status: 'DISABLED' });
    assert.equal(selfChange.status, 400);
    assert.equal(selfChange.body.code, 'SELF_STATUS_CHANGE_FORBIDDEN');

    assert.equal(db.users.get('m11c-target').revision, 3, 'rejected requests must not persist changes');
    assert.equal(db.auditLog.length, 0, 'rejected requests must not create audit success records');
  });

  test('a Firebase failure is reported truthfully and leaves MariaDB untouched', async () => {
    const { app, db } = appWithSeed();
    db.firebaseFailure = true;
    const response = await request(app)
      .patch('/api/admin/users/m11c-target/status')
      .set(bearer('admin'))
      .send({ status: 'SUSPENDED', reason: 'Identity outage drill' });

    assert.equal(response.status, 502);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'IDENTITY_SYNC_FAILED');
    assert.equal(response.body.applied, false);
    assert.equal(db.users.get('m11c-target').revision, 3, 'no MariaDB write may occur when the identity plane failed');
    assert.equal(db.users.get('m11c-target').suspended, false);
    const audit = db.auditLog.find(entry => entry.action === 'USER_STATUS_UPDATED');
    assert.ok(audit, 'a failed attempt must still be audited');
    assert.equal(audit.outcome, 'FAILURE');
  });

  test('a MariaDB failure after the identity update returns a partial-result failure', async () => {
    const { app, db } = appWithSeed();
    // Concurrent revision change makes the guarded UPDATE match zero rows.
    db.users.get('m11c-target').revision = 99;
    const original = executeStatement;
    const response = await (async () => {
      setPoolForTests({
        async query(sql, params) { return original(db, sql, params); },
        async getConnection() {
          return {
            async query(sql, params) {
              // Force the FOR UPDATE read to see the old revision, then let the
              // guarded UPDATE miss, which is exactly what a lost update looks like.
              if (/^SELECT revision, suspended, extra_data FROM users WHERE id = \? FOR UPDATE/i.test(String(sql))) {
                const rows = await original(db, sql, params);
                rows[0] = rows[0].map(row => ({ ...row, revision: 2 }));
                return rows;
              }
              return original(db, sql, params);
            },
            async beginTransaction() {},
            async commit() {},
            async rollback() { db.rolledBackTransactions += 1; },
            release() {},
          };
        },
        async end() {},
      });
      return request(app).patch('/api/admin/users/m11c-target/status').set(bearer('admin')).send({ status: 'SUSPENDED' });
    })();

    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'USER_PROFILE_CONFLICT');
    assert.equal(response.body.partial.identityUpdated, true, 'the response must state that the identity plane changed');
    assert.equal(db.identities.get('m11c-target').disabled, true, 'the identity update did happen');
  });

  test('an audit write failure is never presented as a clean success', async () => {
    const { app, db } = appWithSeed();
    db.auditFailure = true;
    const response = await request(app)
      .patch('/api/admin/users/m11c-target/status')
      .set(bearer('admin'))
      .send({ status: 'SUSPENDED' });
    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'AUDIT_WRITE_FAILED');
    assert.equal(response.body.applied, true);
    assert.equal(response.body.audit.recorded, false);
  });

  test('the legacy POST route still accepts suspended:boolean and maps to the lifecycle', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app)
      .post('/api/admin/users/m11c-target/status')
      .set(bearer('admin'))
      .send({ suspended: true, reason: 'Legacy client' });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'SUSPENDED');
    assert.equal(response.body.changed, true);
    assert.equal(db.users.get('m11c-target').suspended, true);
    assert.equal(JSON.parse(db.users.get('m11c-target').extra_data).accountStatus, 'SUSPENDED');
  });

  test('revoke-sessions revokes real refresh tokens and is audited', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app)
      .post('/api/admin/users/m11c-target/revoke-sessions')
      .set(bearer('admin'))
      .send({});
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.uid, 'm11c-target');
    assert.ok(Number.isFinite(new Date(response.body.revokedAt).getTime()));
    assert.equal(db.identities.get('m11c-target').revocations, 1);

    const audit = db.auditLog.find(entry => entry.action === 'USER_SESSIONS_REVOKED');
    assert.ok(audit, 'session revocation must be audited');
    assert.equal(audit.resourceId, 'm11c-target');
    assert.equal(audit.metadata.identityCheckRevoked, true);

    const missing = await request(app).post('/api/admin/users/ghost-uid/revoke-sessions').set(bearer('admin')).send({});
    assert.equal(missing.status, 404);
  });
});

// ===========================================================================
// 3. Employer verification
// ===========================================================================
test.describe('Employer application verification', () => {
  test('the queue returns real pending records from both authoritative stores', async () => {
    const { app } = appWithSeed();
    const response = await request(app).get('/api/admin/employer-applications').set(bearer('admin'));
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    const ids = response.body.applications.map(application => application.id);
    assert.ok(ids.includes('company-pending'), 'pending company profiles must be listed');
    assert.ok(ids.includes('m11c-owner'), 'submitted application records must be listed');
    assert.ok(!ids.includes('company-approved'), 'decided records are not in the pending queue');
    const submission = response.body.applications.find(application => application.id === 'm11c-owner');
    assert.equal(submission.source, 'APPLICATION_SUBMISSION');
    assert.equal(submission.status, 'PENDING');
  });

  test('approving a company persists verified=1/approved through a guarded transaction', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin'))
      .send({ decision: 'APPROVED' });
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.decision, 'APPROVED');
    assert.equal(response.body.verified, true);
    assert.equal(response.body.claimSync.state, 'UPDATED');
    assert.equal(response.body.notification.state, 'QUEUED');
    assert.equal(response.body.notification.deliveryContract, 'DURABLE_OUTBOX_ENQUEUE');

    const company = db.companies.get('company-pending');
    assert.equal(company.status, 'approved');
    assert.equal(company.verified, true);
    assert.equal(company.revision, 3);
    const extra = JSON.parse(company.extra_json);
    assert.equal(extra.decision, 'APPROVED');
    assert.equal(extra.reviewedBy, 'm11c-admin');
    assert.equal(extra.contactEmail, 'legal@nexus.example', 'existing dossier metadata is preserved');

    assert.equal(db.claimWrites.at(-1).claims.employer, true, 'the employer claim must be granted on approval');
    assert.equal(db.notifications.length, 1, 'the decision notice must be durably queued');
    assert.equal(db.notifications[0].recipient, 'legal@nexus.example');

    const audit = db.auditLog.find(entry => entry.action === 'EMPLOYER_APPLICATION_VERIFIED');
    assert.ok(audit);
    assert.equal(audit.resourceId, 'company-pending');
    assert.equal(audit.metadata.decision, 'APPROVED');
    assert.equal(audit.metadata.verificationPersisted, true);
    assert.equal(audit.outcome, 'SUCCESS');
  });

  test('rejection requires a reason and persists the rejected state', async () => {
    const { app, db } = appWithSeed();
    const noReason = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin'))
      .send({ decision: 'REJECTED' });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, 'REJECTION_REASON_REQUIRED');
    assert.equal(db.companies.get('company-pending').status, 'pending', 'a rejected request must not mutate the record');

    const rejected = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin'))
      .send({ decision: 'REJECTED', reason: 'Tax identifier could not be validated' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.decision, 'REJECTED');
    assert.equal(rejected.body.verified, false);
    assert.equal(rejected.body.claimSync.employer, false);

    const company = db.companies.get('company-pending');
    assert.equal(company.status, 'rejected');
    assert.equal(company.verified, false);
    assert.equal(JSON.parse(company.extra_json).rejectionReason, 'Tax identifier could not be validated');
    assert.equal(db.claimWrites.at(-1).claims.employer, false);
  });

  test('conflicting decisions on an already decided record return 409', async () => {
    const { app, db } = appWithSeed();
    const first = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin'))
      .send({ decision: 'APPROVED' });
    assert.equal(first.status, 200);

    const second = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin'))
      .send({ decision: 'REJECTED', reason: 'Changed my mind' });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'APPLICATION_ALREADY_DECIDED');
    assert.equal(db.companies.get('company-pending').status, 'approved', 'the original decision must survive');
    assert.equal(db.notifications.length, 1, 'a conflicting decision must not queue a second notification');
  });

  test('submitted application records are reviewed transactionally', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app)
      .post('/api/admin/employer-applications/m11c-owner/verify')
      .set(bearer('admin'))
      .send({ decision: 'APPROVED' });
    assert.equal(response.status, 200);
    assert.equal(response.body.source, 'SUBMISSION');
    const payload = JSON.parse(db.documents.get('m11c-owner').payload);
    assert.equal(payload.status, 'approved');
    assert.equal(payload.reviewedBy, 'm11c-admin');

    const repeat = await request(app)
      .post('/api/admin/employer-applications/m11c-owner/verify')
      .set(bearer('admin')).send({ decision: 'APPROVED' });
    assert.equal(repeat.status, 409);
  });

  test('unknown applications return 404 and malformed payloads return 400', async () => {
    const { app } = appWithSeed();
    const missing = await request(app)
      .post('/api/admin/employer-applications/no-such-application/verify')
      .set(bearer('admin')).send({ decision: 'APPROVED' });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'APPLICATION_NOT_FOUND');

    const badDecision = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin')).send({ decision: 'MAYBE' });
    assert.equal(badDecision.status, 400);
    assert.equal(badDecision.body.code, 'INVALID_DECISION');

    const badReason = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin')).send({ decision: 'REJECTED', reason: { nested: true } });
    assert.equal(badReason.status, 400);
  });

  test('a notification enqueue failure is surfaced as a warning, never hidden', async () => {
    const { app, db } = appWithSeed();
    db.outboxFailure = true;
    const response = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin')).send({ decision: 'APPROVED' });
    assert.equal(response.status, 200);
    assert.equal(response.body.notification.state, 'NOT_QUEUED');
    assert.ok(response.body.warnings.some(warning => /notification/i.test(warning)));
    assert.equal(db.companies.get('company-pending').status, 'approved', 'the decision itself was persisted');
    const audit = db.auditLog.find(entry => entry.action === 'EMPLOYER_APPLICATION_VERIFIED');
    assert.equal(audit.outcome, 'SUCCESS_WITH_WARNINGS');
  });

  test('a claim-sync failure does not roll back the decision but is reported', async () => {
    const { app, db } = appWithSeed();
    db.claimFailure = true;
    const response = await request(app)
      .post('/api/admin/employer-applications/company-pending/verify')
      .set(bearer('admin')).send({ decision: 'APPROVED' });
    assert.equal(response.status, 200);
    assert.equal(response.body.claimSync.state, 'FAILED');
    assert.ok(response.body.warnings.length >= 1);
    assert.equal(db.companies.get('company-pending').status, 'approved');
  });
});

// ===========================================================================
// 4. Job moderation
// ===========================================================================
test.describe('Job marketplace moderation', () => {
  test('both list contracts return real records', async () => {
    const { app } = appWithSeed();
    const all = await request(app).get('/api/admin/jobs').set(bearer('support'));
    assert.equal(all.status, 200);
    assert.equal(all.body.success, true);
    assert.equal(all.body.jobs.length, 4);
    assert.equal(all.body.source, 'MARIADB_JOBS');

    const queue = await request(app).get('/api/admin/jobs/pending-moderation').set(bearer('support'));
    assert.equal(queue.status, 200);
    assert.deepEqual(queue.body.jobs.map(job => job.id).sort(), ['job-flagged', 'job-pending']);
    assert.equal(queue.body.queue, 'PENDING_AND_FLAGGED');
    const flagged = queue.body.jobs.find(job => job.id === 'job-flagged');
    assert.equal(flagged.isSpam, true);
    assert.equal(flagged.publiclyVisible, false);
  });

  test('flagging a job persists moderation metadata and suppresses public discovery', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app)
      .post('/api/admin/jobs/job-active/moderate')
      .set(bearer('admin'))
      .send({ status: 'flagged', isSpam: true, notes: 'Duplicate listing with fake salary' });
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.job.status, 'flagged');
    assert.equal(response.body.job.isSpam, true);
    assert.equal(response.body.job.publiclyVisible, false);
    assert.equal(response.body.changed, true);

    const job = db.jobs.get('job-active');
    assert.equal(job.status, 'flagged');
    assert.equal(job.revision, 6);
    const moderation = JSON.parse(job.extra_json).moderation;
    assert.equal(moderation.isSpam, true);
    assert.equal(moderation.notes, 'Duplicate listing with fake salary');
    assert.equal(moderation.state, 'SPAM');
    assert.equal(moderation.moderatedBy, 'm11c-admin');
    assert.ok(Number.isFinite(new Date(moderation.moderatedAt).getTime()));

    // The production public-discovery invariant: repository.getJobs({publicOnly})
    // only ever returns LOWER(status) = 'active'.
    const repository = new MySQLRepository();
    const publicJobs = await repository.getJobs({ publicOnly: true });
    assert.ok(!publicJobs.some(publicJob => publicJob.id === 'job-active'),
      'a moderated spam job must not be reachable through public discovery');

    const audit = db.auditLog.find(entry => entry.action === 'JOB_MODERATION_ACTION');
    assert.ok(audit);
    assert.equal(audit.resourceId, 'job-active');
    assert.equal(audit.metadata.publicVisibility, 'SUPPRESSED');
    assert.equal(audit.metadata.notes, 'Duplicate listing with fake salary');
  });

  test('approving a pending job publishes it and clears the spam flag', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app)
      .post('/api/admin/jobs/job-pending/moderate')
      .set(bearer('admin'))
      .send({ status: 'active', isSpam: false, notes: 'Verified employer and salary' });
    assert.equal(response.status, 200);
    assert.equal(response.body.job.status, 'active');
    assert.equal(response.body.job.publiclyVisible, true);
    assert.equal(db.jobs.get('job-pending').status, 'active');
    const moderation = JSON.parse(db.jobs.get('job-pending').extra_json).moderation;
    assert.equal(moderation.isSpam, false);
    assert.equal(moderation.state, 'CLEARED');

    const repository = new MySQLRepository();
    const publicJobs = await repository.getJobs({ publicOnly: true });
    assert.ok(publicJobs.some(publicJob => publicJob.id === 'job-pending'), 'the approved job must become publicly discoverable');
  });

  test('invalid payloads, missing jobs and unsafe transitions are rejected', async () => {
    const { app, db } = appWithSeed();
    const invalidStatus = await request(app).post('/api/admin/jobs/job-pending/moderate').set(bearer('admin')).send({ status: 'deleted' });
    assert.equal(invalidStatus.status, 400);
    assert.equal(invalidStatus.body.code, 'INVALID_MODERATION_STATUS');

    const badSpam = await request(app).post('/api/admin/jobs/job-pending/moderate').set(bearer('admin')).send({ status: 'flagged', isSpam: 'yes' });
    assert.equal(badSpam.status, 400);

    const longNotes = await request(app).post('/api/admin/jobs/job-pending/moderate').set(bearer('admin')).send({ status: 'flagged', notes: 'x'.repeat(501) });
    assert.equal(longNotes.status, 400);
    assert.equal(longNotes.body.code, 'INVALID_MODERATION_NOTES');

    const missing = await request(app).post('/api/admin/jobs/job-ghost/moderate').set(bearer('admin')).send({ status: 'flagged' });
    assert.equal(missing.status, 404);

    const unsafe = await request(app).post('/api/admin/jobs/job-draft/moderate').set(bearer('admin')).send({ status: 'active' });
    assert.equal(unsafe.status, 409);
    assert.equal(unsafe.body.code, 'UNSAFE_MODERATION_TRANSITION');
    assert.equal(db.jobs.get('job-draft').status, 'draft', 'an unsafe transition must not be persisted');

    const badFilter = await request(app).get('/api/admin/jobs?status=not-a-status').set(bearer('admin'));
    assert.equal(badFilter.status, 400);
  });
});

// ===========================================================================
// 5. Platform operations
// ===========================================================================
test.describe('Platform operations', () => {
  test('system status reports real process and database telemetry', async () => {
    const { app } = appWithSeed();
    const response = await request(app).get('/api/admin/operations/system-status').set(bearer('super'));
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.status, 'HEALTHY');
    assert.equal(response.body.database.reachable, true);
    assert.ok(response.body.process.uptimeSeconds > 0);
    assert.ok(response.body.process.memoryBytes.rss > 0);
    assert.ok(response.body.process.memoryBytes.heapUsed > 0);
    assert.equal(response.body.pool.connectionLimit, 15);

    const serialized = JSON.stringify(response.body).toLowerCase();
    for (const forbidden of ['password', 'db_host', 'db_user', 'connectionstring', 'mysql://']) {
      assert.ok(!serialized.includes(forbidden), `system status must not expose ${forbidden}`);
    }
  });

  test('system status degrades honestly when the database probe fails', async () => {
    const { app, db } = appWithSeed();
    db.alive = false;
    const response = await request(app).get('/api/admin/operations/system-status').set(bearer('super'));
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'DEGRADED');
    assert.equal(response.body.database.reachable, false);
    assert.ok(response.body.limitations.length >= 1);
  });

  test('cache clearing reports the layers it actually cleared', async () => {
    const { app, db } = appWithSeed();
    const response = await request(app).post('/api/admin/operations/cache-clear').set(bearer('super')).send({});
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(typeof response.body.clearedEntries, 'number');
    const layers = response.body.layers.map(layer => layer.layer);
    assert.ok(layers.includes('platform-health-snapshot'));
    assert.ok(layers.includes('ai-engine-prompt-cache'));
    assert.ok(response.body.unsupported.some(layer => layer.layer === 'marketplace-job-listings'),
      'unsupported cache layers must be declared, not silently claimed as cleared');
    const audit = db.auditLog.find(entry => entry.action === 'PLATFORM_CACHE_CLEARED');
    assert.ok(audit);
    assert.equal(audit.outcome, 'SUCCESS');
  });

  test('a failing cache layer is reported as a failure, never as success', async () => {
    const { app, db } = appWithSeed();
    const engine = require('../freellmapi');
    const originalClear = engine.clearCache;
    engine.clearCache = () => { throw Object.assign(new Error('engine cache unavailable'), { code: 'ENGINE_CACHE_CLEAR_FAILED' }); };
    try {
      const response = await request(app).post('/api/admin/operations/cache-clear').set(bearer('super')).send({});
      assert.equal(response.status, 502);
      assert.equal(response.body.success, false);
      assert.equal(response.body.result, 'PARTIAL_FAILURE');
      const failed = response.body.layers.find(layer => layer.status === 'FAILED');
      assert.ok(failed, 'the failing layer must be named');
      const audit = db.auditLog.find(entry => entry.action === 'PLATFORM_CACHE_CLEARED');
      assert.equal(audit.outcome, 'PARTIAL_FAILURE');
    } finally {
      engine.clearCache = originalClear;
    }
  });

  test('backup reports a blocked result when no backup subsystem is installed', async () => {
    const { app, db } = appWithSeed();
    const previous = process.env.DR_BACKUP_SCRIPT_PATH;
    process.env.DR_BACKUP_SCRIPT_PATH = path.join(os.tmpdir(), 'ime365-missing-backup-script.mjs');
    try {
      const response = await request(app).post('/api/admin/operations/backup').set(bearer('super')).send({});
      assert.equal(response.status, 501);
      assert.equal(response.body.success, false);
      assert.equal(response.body.code, 'BACKUP_SYSTEM_UNAVAILABLE');
      assert.equal(db.auditLog.filter(entry => entry.action === 'PLATFORM_DATABASE_BACKUP').length, 0);
    } finally {
      if (previous === undefined) delete process.env.DR_BACKUP_SCRIPT_PATH;
      else process.env.DR_BACKUP_SCRIPT_PATH = previous;
    }
  });

  test('backup requires a real, non-empty, checksum-matching artifact', async () => {
    const { app, db } = appWithSeed();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ime365-backup-test-'));
    const artifact = path.join(workDir, 'resumepilot-test.sql.gz');
    const payload = Buffer.from('CREATE TABLE users (id VARCHAR(128));\nINSERT INTO users VALUES ("x");\n');
    fs.writeFileSync(artifact, payload);
    const sha256 = crypto.createHash('sha256').update(payload).digest('hex');

    const script = path.join(workDir, 'fake-dr-runner.mjs');
    fs.writeFileSync(script, `
const report = {
  script: 'dr-backup-run',
  status: 'SUCCESS',
  durationMs: 12,
  recoveryPoints: 1,
  warnings: [],
  steps: {
    backup: { ok: true, file: ${JSON.stringify(artifact)}, bytes: ${payload.length}, sha256: ${JSON.stringify(sha256)}, encrypted: false, compressed: true, tables: 42, rows: 900 },
    verify: { ok: true }
  }
};
console.log(JSON.stringify(report, null, 2));
`);

    const previous = process.env.DR_BACKUP_SCRIPT_PATH;
    process.env.DR_BACKUP_SCRIPT_PATH = script;
    try {
      const response = await request(app).post('/api/admin/operations/backup').set(bearer('super')).send({});
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.sizeBytes, payload.length);
      assert.equal(response.body.artifact.sha256, sha256, 'the endpoint recomputes the artifact digest');
      assert.equal(response.body.artifact.name, 'resumepilot-test.sql.gz');
      assert.ok(!JSON.stringify(response.body).includes(workDir), 'absolute artifact paths must not be returned');
      const audit = db.auditLog.find(entry => entry.action === 'PLATFORM_DATABASE_BACKUP');
      assert.ok(audit);
      assert.equal(audit.outcome, 'SUCCESS');
      assert.equal(audit.metadata.sizeBytes, payload.length);
    } finally {
      if (previous === undefined) delete process.env.DR_BACKUP_SCRIPT_PATH;
      else process.env.DR_BACKUP_SCRIPT_PATH = previous;
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('a backup subsystem that claims success without an artifact cannot pass', async () => {
    const { app, db } = appWithSeed();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ime365-backup-lying-'));
    const script = path.join(workDir, 'lying-runner.mjs');
    fs.writeFileSync(script, `
console.log(JSON.stringify({ status: 'SUCCESS', steps: { backup: { ok: true, file: '/tmp/does-not-exist-ime365.sql.gz', bytes: 12345 }, verify: { ok: true } } }));
`);
    const previous = process.env.DR_BACKUP_SCRIPT_PATH;
    process.env.DR_BACKUP_SCRIPT_PATH = script;
    try {
      const response = await request(app).post('/api/admin/operations/backup').set(bearer('super')).send({});
      assert.equal(response.status, 502);
      assert.equal(response.body.success, false);
      assert.equal(response.body.code, 'BACKUP_ARTIFACT_MISSING');
      const audit = db.auditLog.find(entry => entry.action === 'PLATFORM_DATABASE_BACKUP');
      assert.equal(audit.outcome, 'FAILURE');
    } finally {
      if (previous === undefined) delete process.env.DR_BACKUP_SCRIPT_PATH;
      else process.env.DR_BACKUP_SCRIPT_PATH = previous;
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('an empty artifact and a checksum mismatch are both rejected', async () => {
    const { app } = appWithSeed();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ime365-backup-invalid-'));
    const emptyArtifact = path.join(workDir, 'empty.sql.gz');
    fs.writeFileSync(emptyArtifact, '');
    const emptyScript = path.join(workDir, 'empty-runner.mjs');
    fs.writeFileSync(emptyScript, `
console.log(JSON.stringify({ status: 'SUCCESS', steps: { backup: { ok: true, file: ${JSON.stringify(emptyArtifact)}, bytes: 0 }, verify: { ok: true } } }));
`);
    const mismatchArtifact = path.join(workDir, 'mismatch.sql.gz');
    fs.writeFileSync(mismatchArtifact, 'real bytes');
    const mismatchScript = path.join(workDir, 'mismatch-runner.mjs');
    fs.writeFileSync(mismatchScript, `
console.log(JSON.stringify({ status: 'SUCCESS', steps: { backup: { ok: true, file: ${JSON.stringify(mismatchArtifact)}, bytes: 10, sha256: 'deadbeef' }, verify: { ok: true } } }));
`);

    const previous = process.env.DR_BACKUP_SCRIPT_PATH;
    try {
      process.env.DR_BACKUP_SCRIPT_PATH = emptyScript;
      const empty = await request(app).post('/api/admin/operations/backup').set(bearer('super')).send({});
      assert.equal(empty.status, 502);
      assert.equal(empty.body.code, 'BACKUP_ARTIFACT_EMPTY');

      process.env.DR_BACKUP_SCRIPT_PATH = mismatchScript;
      const mismatch = await request(app).post('/api/admin/operations/backup').set(bearer('super')).send({});
      assert.equal(mismatch.status, 502);
      assert.equal(mismatch.body.code, 'BACKUP_CHECKSUM_MISMATCH');
    } finally {
      if (previous === undefined) delete process.env.DR_BACKUP_SCRIPT_PATH;
      else process.env.DR_BACKUP_SCRIPT_PATH = previous;
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('a failing backup subsystem returns a truthful failure', async () => {
    const { app, db } = appWithSeed();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ime365-backup-fail-'));
    const script = path.join(workDir, 'failing-runner.mjs');
    fs.writeFileSync(script, `
console.error(JSON.stringify({ script: 'dr-backup-run', status: 'FAILED', error: 'Insufficient disk space; password=supersecret' }));
process.exit(1);
`);
    const previous = process.env.DR_BACKUP_SCRIPT_PATH;
    process.env.DR_BACKUP_SCRIPT_PATH = script;
    try {
      const response = await request(app).post('/api/admin/operations/backup').set(bearer('super')).send({});
      assert.equal(response.status, 502);
      assert.equal(response.body.success, false);
      assert.equal(response.body.code, 'BACKUP_FAILED');
      assert.ok(!JSON.stringify(response.body).includes('supersecret'), 'credentials in subsystem output must be redacted');
      const audit = db.auditLog.find(entry => entry.action === 'PLATFORM_DATABASE_BACKUP');
      assert.equal(audit.outcome, 'FAILURE');
      assert.ok(!JSON.stringify(audit).includes('supersecret'));
    } finally {
      if (previous === undefined) delete process.env.DR_BACKUP_SCRIPT_PATH;
      else process.env.DR_BACKUP_SCRIPT_PATH = previous;
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// 6. Mounting evidence (documents the index.js router precedence finding)
// ===========================================================================
test.describe('Router mounting evidence', () => {
  test('the shipped app serves GET /api/admin/jobs and reports which handler answered', async t => {
    const db = createDatabase(baseSeed());
    setPoolForTests(createPool(db));
    setRepositoryForTests(createRepository(db));
    delete require.cache[require.resolve('../index')];
    const app = require('../index');

    const response = await request(app).get('/api/admin/jobs').set(bearer('super'));
    assert.ok([200, 503].includes(response.status), `unexpected status ${response.status}`);
    if (response.status === 200) {
      assert.ok(Array.isArray(response.body.jobs));
      const legacyHandled = Object.prototype.hasOwnProperty.call(response.body, 'allJobs');
      t.diagnostic(legacyHandled
        ? 'GET /api/admin/jobs is served by the legacy handler in backend/index.js (router handler is shadowed by registration order).'
        : 'GET /api/admin/jobs is served by adminPlatformOperationsRouter.');
    }
    setPoolForTests(null);
    setRepositoryForTests(null);
  });

  test('operations and lifecycle routes are reachable in the shipped app', async () => {
    const db = createDatabase(baseSeed());
    setPoolForTests(createPool(db));
    setRepositoryForTests(createRepository(db));
    delete require.cache[require.resolve('../index')];
    const app = require('../index');
    app.set('firebaseAdmin', createFirebaseAdmin(db));

    const status = await request(app).get('/api/admin/operations/system-status').set(bearer('super'));
    assert.equal(status.status, 200, 'GET /api/admin/operations/system-status must be served by the router');
    assert.ok(status.body.process?.uptimeSeconds > 0, 'the router telemetry payload must be returned');

    const cache = await request(app).post('/api/admin/operations/cache-clear').set(bearer('super')).send({});
    assert.equal(cache.status, 200, 'POST /api/admin/operations/cache-clear must be served by the router');
    assert.ok(Array.isArray(cache.body.layers));

    const unauthorized = await request(app).post('/api/admin/operations/cache-clear').set(bearer('user')).send({});
    assert.equal(unauthorized.status, 403);

    // The users router owns /api/admin/users/*; there is no shadowing handler.
    const lifecycle = await request(app)
      .patch('/api/admin/users/m11c-target/status')
      .set(bearer('admin'))
      .send({ status: 'SUSPENDED' });
    assert.ok([200, 502, 503].includes(lifecycle.status), `unexpected lifecycle status ${lifecycle.status}`);
    assert.notEqual(lifecycle.status, 404);

    setPoolForTests(null);
    setRepositoryForTests(null);
  });
});
