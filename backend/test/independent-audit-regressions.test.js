'use strict';

/**
 * REGRESSION SUITE — Independent Cloud Engineer Audit (2026-08-26)
 *
 * Locks in the three P1 fail-open defects found and fixed during the
 * independent audit. Each test exercises the REAL production code path.
 *
 *   P1-01  Plain ADMIN must not reach the production database-engine switch
 *          or destructive database-admin mutations (SUPER_ADMIN + step-up
 *          authentication required).
 *   P1-02  flushAndVerifyBeforeSwitch() must fail CLOSED when the parity
 *          probe cannot run — never report 100% parity unverified.
 *   P1-03  The monotonic revision guard must fail CLOSED when its own read
 *          throws — never let a stale event regress Firestore.
 */

process.env.NODE_ENV = 'test';

const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

const nowSeconds = () => Math.floor(Date.now() / 1000);

setTokenVerifierForTests(async (token) => {
  const now = nowSeconds();
  if (token === 'admin') return { uid: 'admin-01', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'superadmin') return { uid: 'sa-01', email: 'sa@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  if (token === 'support') return { uid: 'sup-01', email: 'support@example.com', email_verified: true, role: 'SUPPORT', auth_time: now };
  throw new Error('INVALID_TOKEN');
});

const app = require('../index');
const SWITCH = '/api/admin/database-settings';

// Mirrors backend/test/database-admin.test.js: the audit sandbox has no Google
// default credentials, so a minimal Firestore double is supplied for the
// read-only settings surface.
app.set('db', {
  collection() {
    return {
      doc() {
        return {
          async get() { return { exists: true, data: () => ({ status: 'healthy' }) }; },
          async set() { return true; },
        };
      },
    };
  },
});

/* ─────────────────────────────────────────────────────────────────────────
 * P1-01 — authorization on destructive database-admin operations
 * ───────────────────────────────────────────────────────────────────────── */

test('P1-01: SUPPORT is denied the database-engine switch', async () => {
  const res = await request(app).post(SWITCH).set('Authorization', 'Bearer support').send({ engine: 'firestore' });
  assert.equal(res.status, 403);
});

test('P1-01: plain ADMIN is denied the database-engine switch', async () => {
  // An invalid engine keeps this non-destructive: a 400 would mean the handler
  // ran, i.e. authorization wrongly passed. 403 is the only acceptable result.
  const res = await request(app).post(SWITCH).set('Authorization', 'Bearer admin').send({ engine: 'not-a-real-engine' });
  assert.equal(res.status, 403, 'ADMIN must not be authorised to switch the production database engine');
});

test('P1-01: plain ADMIN is denied destructive initialize-schema', async () => {
  const res = await request(app).post(`${SWITCH}/initialize-schema`).set('Authorization', 'Bearer admin').send({});
  assert.equal(res.status, 403, 'ADMIN must not be authorised to reinitialize the production schema');
});

test('P1-01: plain ADMIN is denied outbox pruning and dead-letter replay', async () => {
  for (const route of ['/prune-outbox', '/retry-dead-letter', '/sync-now']) {
    const res = await request(app).post(`${SWITCH}${route}`).set('Authorization', 'Bearer admin').send({});
    assert.equal(res.status, 403, `ADMIN must not be authorised to call ${route}`);
  }
});

test('P1-01: ADMIN retains read-only database settings access', async () => {
  // The fix must not over-restrict: ADMIN keeps diagnostic read access.
  const res = await request(app).get(SWITCH).set('Authorization', 'Bearer admin');
  assert.equal(res.status, 200);
});

/* ─────────────────────────────────────────────────────────────────────────
 * P1-02 — the pre-switch parity gate must fail closed
 * ───────────────────────────────────────────────────────────────────────── */

function stubPool() {
  return {
    async query(sql) {
      const s = String(sql).replace(/\s+/g, ' ');
      if (/SELECT \* FROM sync_outbox/.test(s)) return [[]];
      if (/COUNT\(\*\)/.test(s)) return [[{ c: 0 }]];
      return [[]];
    },
  };
}

function failingFirestore() {
  const boom = () => Promise.reject(new Error('9 UNAVAILABLE: Firestore unreachable'));
  return {
    collection: () => ({
      get: boom,
      where: () => ({ get: boom }),
      orderBy: () => ({ limit: () => ({ get: boom }) }),
      doc: () => ({ get: boom, set: boom, update: boom }),
    }),
  };
}

test('P1-02: parity gate blocks the switch when the parity probe throws', async () => {
  const MYSQL_PATH = require.resolve('../database/mysql');
  const original = require.cache[MYSQL_PATH];
  require.cache[MYSQL_PATH] = {
    id: MYSQL_PATH, filename: MYSQL_PATH, loaded: true,
    exports: { getPool: () => stubPool(), testConnection: async () => ({ connected: true }) },
  };
  // Bust the syncManager cache so it binds the stubbed pool.
  delete require.cache[require.resolve('../database/syncManager')];

  try {
    const { flushAndVerifyBeforeSwitch } = require('../database/syncManager');
    const result = await flushAndVerifyBeforeSwitch(failingFirestore());

    assert.equal(result.safeToSwitch, false, 'switch must be blocked when parity is unverifiable');
    assert.equal(result.parityPercentage, 0, 'unverified parity must never be reported as 100');
    assert.match(String(result.reason), /UNVERIFIED/i);
  } finally {
    delete require.cache[require.resolve('../database/syncManager')];
    if (original) require.cache[MYSQL_PATH] = original;
  }
});

test('P1-02: parity gate blocks the switch when no Firestore handle exists', async () => {
  const MYSQL_PATH = require.resolve('../database/mysql');
  const original = require.cache[MYSQL_PATH];
  require.cache[MYSQL_PATH] = {
    id: MYSQL_PATH, filename: MYSQL_PATH, loaded: true,
    exports: { getPool: () => stubPool(), testConnection: async () => ({ connected: true }) },
  };
  delete require.cache[require.resolve('../database/syncManager')];

  try {
    const { flushAndVerifyBeforeSwitch } = require('../database/syncManager');
    const result = await flushAndVerifyBeforeSwitch(null);

    assert.equal(result.safeToSwitch, false, 'switch must be blocked without a standby to verify against');
    assert.equal(result.parityPercentage, 0);
  } finally {
    delete require.cache[require.resolve('../database/syncManager')];
    if (original) require.cache[MYSQL_PATH] = original;
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * P1-03 — the monotonic revision guard must fail closed
 * ───────────────────────────────────────────────────────────────────────── */

function makeFirestore({ readFails }) {
  const writes = [];
  return {
    writes,
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (resumeId) => ({
            async get() {
              if (readFails) throw new Error('9 UNAVAILABLE: transient Firestore read failure');
              return { exists: true, data: () => ({ revision: 9, title: 'CURRENT NEW CONTENT' }) };
            },
            async set(value) { writes.push({ id: resumeId, revision: value.revision }); },
          }),
        }),
      }),
    }),
  };
}

const staleEvent = {
  entity_type: 'resumes',
  entity_id: 'resume-stale-001',
  operation: 'UPDATE',
  version: 1,
  payload: { user_id: 'user-1', title: 'ANCIENT STALE CONTENT', revision: 1 },
};

test('P1-03: guard blocks a stale revision when its read succeeds', async () => {
  const { replicateToFirestore } = require('../database/syncManager');
  const fs = makeFirestore({ readFails: false });
  await replicateToFirestore(fs, staleEvent);
  assert.equal(fs.writes.length, 0, 'revision 1 must not overwrite revision 9');
});

test('P1-03: guard fails closed (no write) when its read throws', async () => {
  const { replicateToFirestore } = require('../database/syncManager');
  const fs = makeFirestore({ readFails: true });

  await assert.rejects(
    () => replicateToFirestore(fs, staleEvent),
    /UNAVAILABLE/,
    'the read failure must propagate so the outbox retries instead of regressing data',
  );
  assert.equal(fs.writes.length, 0, 'a stale write must never land when parity of revision is unknown');
});

/* ─────────────────────────────────────────────────────────────────────────
 * P1-06 — Firestore → MySQL resume replication must not drop fields
 *
 * replicateToMySQL() inserted all 33 resume columns but its
 * ON DUPLICATE KEY UPDATE clause refreshed only title/template/revision/
 * summary, so every other field was silently left stale once the row existed.
 * The primary write path (MySQLRepository) derives its update clause from all
 * columns, so the replication path was the lossy outlier.
 * ───────────────────────────────────────────────────────────────────────── */

const RESUME_REPLICATED_COLUMNS = [
  'user_id', 'title', 'template', 'revision', 'firstname', 'lastname', 'email',
  'phone', 'occupation', 'country', 'city', 'address', 'postalcode', 'website',
  'linkedin', 'github', 'photo', 'showPhoto', 'summary', 'employments',
  'educations', 'skills', 'languages', 'hobbies', 'projects', 'certifications',
  'achievements', 'references', 'customSections', 'sectionOrder',
  'hiddenSections', 'completedSteps',
];

test('P1-06: replicating an existing resume refreshes every replicated column', async () => {
  const MYSQL_PATH = require.resolve('../database/mysql');
  const original = require.cache[MYSQL_PATH];

  const issued = [];
  let rowExists = true;
  require.cache[MYSQL_PATH] = {
    id: MYSQL_PATH, filename: MYSQL_PATH, loaded: true,
    exports: {
      getPool: () => ({
        async query(sql) {
          const s = String(sql).replace(/\s+/g, ' ');
          issued.push(s);
          if (/^SELECT revision FROM resumes/.test(s)) return [rowExists ? [{ revision: 1 }] : []];
          return [[]];
        },
      }),
      testConnection: async () => ({ connected: true }),
    },
  };
  delete require.cache[require.resolve('../database/syncManager')];

  try {
    const { replicateToMySQL } = require('../database/syncManager');
    await replicateToMySQL({
      entity_type: 'resumes',
      entity_id: 'resume-001',
      operation: 'UPDATE',
      version: 2,
      payload: { user_id: 'user-1', skills: [{ name: 'Kubernetes' }] },
    });

    const write = issued.find(q => /INSERT INTO resumes/.test(q));
    assert.ok(write, 'a write must be issued');
    const updateClause = write.split('ON DUPLICATE KEY UPDATE')[1] || '';

    const missing = RESUME_REPLICATED_COLUMNS.filter(
      col => !new RegExp('`?' + col + '`?\\s*=').test(updateClause),
    );
    assert.deepEqual(
      missing, [],
      `these resume columns are inserted but not refreshed on update, so the standby would keep stale values: ${missing.join(', ')}`,
    );
  } finally {
    delete require.cache[require.resolve('../database/syncManager')];
    if (original) require.cache[MYSQL_PATH] = original;
  }
});
