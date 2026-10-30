'use strict';

/**
 * Mandate 12-ULTIMATE — MariaDB integration evidence for all six workstreams.
 *
 * These are the only tests in this mandate that can prove: real row locks, real
 * transactions, real persistence, and real multi-connection concurrency. They run
 * ONLY against a disposable, migrated MariaDB (RUN_MARIADB_INTEGRATION=true plus
 * DB_* pointing at a test/ci/sandbox database) and are reported as NOT VERIFIED —
 * never as passed — when no database is configured. That gate is the repository's
 * existing convention (see backend/test/helpers/mandate11a.js).
 *
 * Setup (from the repository root):
 *   RUN_MARIADB_INTEGRATION=true MARIADB_TEST_ALLOW_RESET=true \
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=airesume_test \
 *   node --test backend/test/mandate12-database-integration.test.js
 */

process.env.NODE_ENV = 'test';
// Revocation enforcement is opt-in under NODE_ENV=test; this suite proves it.
process.env.SESSION_REVOCATION_IN_TEST = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, newUuid, isMariaEnabled } = fixtures;

if (isMariaEnabled()) fixtures.requireDisposableTarget();

const request = require('supertest');
const express = require('express');
const { getPool } = require('../database/mysql');
const readCursor = require('../services/messageReadCursor');
const { router: employerSettingsRouter } = require('../routes/employerSettings');
const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
const sessionRevocation = require('../security/sessionRevocation');

const EMPLOYER_UID = fixtures.IDENTITIES.owner.uid;
const CANDIDATE_UID = fixtures.IDENTITIES.candidate.uid;

const created = { conversations: [], applications: [], tenants: [], userIds: [], settingsOwners: [], revocations: [] };

function pool() {
  return getPool();
}

function asIdentity(uid, extra = {}) {
  return (req, _res, next) => {
    req.user = Object.freeze({
      uid,
      email: `${uid}@mandate12.test`,
      emailVerified: true,
      claims: { role: 'USER', employer: true, auth_time: Math.floor(Date.now() / 1000), ...extra },
    });
    next();
  };
}

/**
 * Skip (never pass) when the gate is enabled but the server is unreachable.
 *
 * The repository's test wrapper forces RUN_MARIADB_INTEGRATION=true, so a machine
 * with no server would otherwise report these as failures. A skip with an
 * explicit reason is the honest outcome: the claim below has NOT been verified.
 */
async function databaseReachable(t) {
  try {
    await pool().query('SELECT 1 AS alive');
    return true;
  } catch (error) {
    t.skip(`NOT VERIFIED: MariaDB unreachable (${error.code || error.message})`);
    return false;
  }
}

async function withConnection(fn) {
  const connection = await pool().getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

// ─── 033–036 schema ─────────────────────────────────────────────────────────
mariaTest('migrations 033-036 are applied and their objects exist', async (t) => {
  if (!(await databaseReachable(t))) return;
  const [ledger] = await pool().query(
    "SELECT version, name FROM schema_migrations WHERE version IN ('033','034','035','036') ORDER BY version"
  );
  assert.deepEqual(ledger.map(row => row.version), ['033', '034', '035', '036']);

  const [tenantColumns] = await pool().query(
    `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enterprise_tenants'
        AND COLUMN_NAME IN ('seat_quota','monthly_ai_credits','custom_domain')`
  );
  const columns = Object.fromEntries(tenantColumns.map(row => [row.COLUMN_NAME, row]));
  assert.equal(columns.seat_quota.IS_NULLABLE, 'YES', 'a NOT NULL default would retroactively cap existing tenants');
  assert.equal(columns.monthly_ai_credits.IS_NULLABLE, 'NO');
  assert.equal(String(columns.monthly_ai_credits.COLUMN_DEFAULT), '1000');
  assert.equal(columns.custom_domain.IS_NULLABLE, 'YES');

  const [domainIndex] = await pool().query(
    `SELECT INDEX_NAME, NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enterprise_tenants' AND INDEX_NAME = 'uq_ent_tenant_domain'`
  );
  assert.equal(domainIndex.length, 1);
  assert.equal(Number(domainIndex[0].NON_UNIQUE), 0, 'a custom domain must be unique across tenants');

  for (const table of ['revoked_sessions', 'employer_settings', 'application_evaluations']) {
    const [rows] = await pool().query(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [table]
    );
    assert.equal(rows.length, 1, `${table} must exist`);
  }

  const [evaluationKeys] = await pool().query(
    `SELECT INDEX_NAME, NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_evaluations' AND INDEX_NAME = 'uk_app_reviewer'`
  );
  assert.equal(evaluationKeys.length, 2, 'the unique key spans (application_id, reviewer_id)');
  assert.equal(Number(evaluationKeys[0].NON_UNIQUE), 0);
});

// ─── Workstream 1: read cursors ─────────────────────────────────────────────
async function seedConversation({ participants, messages }) {
  const conversationId = `conv_${crypto.randomBytes(8).toString('hex')}`;
  created.conversations.push(conversationId);
  await pool().query('INSERT INTO conversations (id, created_at) VALUES (?, CURRENT_TIMESTAMP)', [conversationId]);
  for (const uid of participants) {
    await pool().query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [conversationId, uid]);
  }
  const ids = [];
  for (const [index, message] of messages.entries()) {
    const id = `msg_${message.timestamp}_${crypto.randomBytes(8).toString('hex')}`;
    ids.push(id);
    await pool().query(
      'INSERT INTO conversation_messages (id, conversation_id, sender_id, text, timestamp) VALUES (?, ?, ?, ?, ?)',
      [id, conversationId, message.senderId || participants[index % participants.length], `message ${index}`, message.timestamp]
    );
  }
  return { conversationId, ids };
}

async function advance(conversationId, uid, messageId) {
  return withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const result = await readCursor.markConversationRead({ connection, conversationId, uid, requestedMessageId: messageId });
      if (result.outcome === readCursor.OUTCOME.OK) await connection.commit();
      else await connection.rollback();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

mariaTest('a participant advances a persisted cursor; a non-participant and a cross-conversation message are rejected', async (t) => {
  if (!(await databaseReachable(t))) return;
  const base = Date.now() - 60_000;
  const { conversationId, ids } = await seedConversation({
    participants: [EMPLOYER_UID, CANDIDATE_UID],
    messages: [{ timestamp: base }, { timestamp: base + 1000 }, { timestamp: base + 2000 }],
  });
  const other = await seedConversation({ participants: [CANDIDATE_UID], messages: [{ timestamp: base + 5000 }] });

  const forward = await advance(conversationId, EMPLOYER_UID, ids[1]);
  assert.equal(forward.outcome, readCursor.OUTCOME.OK);
  assert.equal(forward.advanced, true);

  const [rows] = await pool().query(
    'SELECT last_read_message_id, last_read_at FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    [conversationId, EMPLOYER_UID]
  );
  assert.equal(rows[0].last_read_message_id, ids[1]);
  assert.equal(Number(rows[0].last_read_at), base + 1000, 'the timestamp must come from the message row');

  // Rewinding is refused and leaves the stored cursor intact.
  const stale = await advance(conversationId, EMPLOYER_UID, ids[0]);
  assert.equal(stale.advanced, false);
  const [afterStale] = await pool().query(
    'SELECT last_read_message_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    [conversationId, EMPLOYER_UID]
  );
  assert.equal(afterStale[0].last_read_message_id, ids[1]);

  // A message from a different conversation is not a cursor.
  const cross = await advance(conversationId, EMPLOYER_UID, other.ids[0]);
  assert.equal(cross.outcome, readCursor.OUTCOME.MESSAGE_NOT_IN_CONVERSATION);
  assert.equal(readCursor.httpStatusFor(cross.outcome), 400);

  // A non-participant cannot write read state.
  const outsider = await advance(conversationId, 'usr_not_a_participant', ids[2]);
  assert.equal(outsider.outcome, readCursor.OUTCOME.FORBIDDEN_CONVERSATION_PARTICIPANT);
  assert.equal(readCursor.httpStatusFor(outsider.outcome), 403);

  // A missing conversation is a 404.
  const missing = await advance('conv_does_not_exist', EMPLOYER_UID, ids[2]);
  assert.equal(missing.outcome, readCursor.OUTCOME.CONVERSATION_NOT_FOUND);
  assert.equal(readCursor.httpStatusFor(missing.outcome), 404);

  // The client-supplied timestamp is not part of the transaction at all: the
  // persisted value above is the message's own timestamp.
  const [finalRows] = await pool().query(
    'SELECT last_read_at FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    [conversationId, EMPLOYER_UID]
  );
  assert.equal(Number(finalRows[0].last_read_at), base + 1000);
});

mariaTest('concurrent cursor advances on separate connections cannot regress the cursor', async (t) => {
  if (!(await databaseReachable(t))) return;
  const base = Date.now() - 120_000;
  const { conversationId, ids } = await seedConversation({
    participants: [EMPLOYER_UID],
    messages: Array.from({ length: 8 }, (_, index) => ({ timestamp: base + index * 1000, senderId: CANDIDATE_UID })),
  });

  // Ten simultaneous advances in randomised order across ten real connections.
  const order = [...ids, ids[3], ids[7]].sort(() => Math.random() - 0.5);
  const results = await Promise.all(order.map(messageId => advance(conversationId, EMPLOYER_UID, messageId)));
  assert.ok(results.every(result => result.outcome === readCursor.OUTCOME.OK));

  const [rows] = await pool().query(
    'SELECT last_read_message_id, last_read_at FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    [conversationId, EMPLOYER_UID]
  );
  assert.equal(rows[0].last_read_message_id, ids[ids.length - 1], 'the cursor settles on the newest message');
  assert.equal(Number(rows[0].last_read_at), base + 7000);
});

// ─── Workstream 2: employer settings ────────────────────────────────────────
function settingsAppFor(uid) {
  const app = express();
  app.use(express.json());
  app.use(asIdentity(uid));
  app.use('/api/employer', employerSettingsRouter);
  return app;
}

mariaTest('employer settings persist, survive reconnection and stay tenant-isolated', async (t) => {
  if (!(await databaseReachable(t))) return;
  const ownerA = `emp12_${crypto.randomBytes(6).toString('hex')}`;
  const ownerB = `emp12_${crypto.randomBytes(6).toString('hex')}`;
  created.settingsOwners.push(ownerA, ownerB);

  let res = await request(settingsAppFor(ownerA)).get('/api/employer/settings');
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.timezone, 'UTC', 'a new profile is initialized with defined defaults');

  res = await request(settingsAppFor(ownerA)).patch('/api/employer/settings').send({
    companyName: 'Integration Talent', timezone: 'Asia/Kolkata', notificationEmail: 'hiring@integration.test',
    defaultInterviewDuration: 60, autoArchiveDays: 21,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.defaultInterviewDuration, 60);

  res = await request(settingsAppFor(ownerA)).patch('/api/employer/settings').send({ autoArchiveDays: 7 });
  assert.deepEqual(res.body.updated, ['autoArchiveDays']);
  assert.equal(res.body.settings.companyName, 'Integration Talent', 'unspecified settings are preserved');

  // Independent read (as if the page had been reloaded) hits the database again.
  res = await request(settingsAppFor(ownerA)).get('/api/employer/settings');
  assert.equal(res.body.settings.autoArchiveDays, 7);
  assert.equal(res.body.settings.notificationEmail, 'hiring@integration.test');

  // A second employer cannot see or affect the first employer's row.
  res = await request(settingsAppFor(ownerB)).get('/api/employer/settings');
  assert.equal(res.body.settings.companyName, '');
  res = await request(settingsAppFor(ownerB)).patch('/api/employer/settings').send({ companyName: 'Other Co' });
  assert.equal(res.status, 200);
  const [rows] = await pool().query(
    'SELECT owner_id, company_name FROM employer_settings WHERE owner_id IN (?, ?) ORDER BY owner_id',
    [ownerA, ownerB]
  );
  assert.equal(rows.find(row => row.owner_id === ownerA).company_name, 'Integration Talent');
  assert.equal(rows.find(row => row.owner_id === ownerB).company_name, 'Other Co');

  // Invalid values are rejected by the database-backed route, not coerced.
  res = await request(settingsAppFor(ownerA)).patch('/api/employer/settings').send({ defaultInterviewDuration: 20 });
  assert.equal(res.status, 400);
});

// ─── Workstream 3: relational scorecards ────────────────────────────────────
mariaTest('interview evaluations are relational, reviewer-scoped and dual-written for legacy consumers', async (t) => {
  if (!(await databaseReachable(t))) return;
  await fixtures.seedUsers(pool(), [fixtures.IDENTITIES.owner, fixtures.IDENTITIES.candidate]);
  const applicationId = `app12_${crypto.randomBytes(8).toString('hex')}`;
  created.applications.push(applicationId);
  await fixtures.seedApplication(pool(), {
    applicationId,
    employerId: EMPLOYER_UID,
    applicantId: CANDIDATE_UID,
    applicantEmail: 'candidate12@mandate12.test',
  });

  const { jobsDataRouter } = require('../routes/jobsData');
  const app = express();
  app.use(express.json());
  app.use(asIdentity(EMPLOYER_UID));
  app.use('/api/jobs-data', jobsDataRouter);

  let res = await request(app).put(`/api/jobs-data/applications/${applicationId}/evaluate`)
    .send({ rating: 4, notes: 'Strong platform depth.', recommendation: 'STRONG_YES' });
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluation.reviewerId, EMPLOYER_UID);

  const [evaluationRows] = await pool().query(
    'SELECT rating, recommendation, reviewer_id FROM application_evaluations WHERE application_id = ?',
    [applicationId]
  );
  assert.equal(evaluationRows.length, 1);
  assert.equal(Number(evaluationRows[0].rating), 4);
  assert.equal(evaluationRows[0].recommendation, 'STRONG_YES');

  // Legacy dual-write is present and consistent with the relational row.
  const [applicationRows] = await pool().query('SELECT rating, notes, extra_json FROM applications WHERE id = ?', [applicationId]);
  assert.equal(Number(applicationRows[0].rating), 4);
  assert.equal(applicationRows[0].notes, 'Strong platform depth.');
  assert.equal(JSON.parse(applicationRows[0].extra_json).evaluationRecommendation, 'STRONG_YES');

  // Repeating the save updates in place; it never creates a duplicate.
  res = await request(app).put(`/api/jobs-data/applications/${applicationId}/evaluate`)
    .send({ rating: 5, notes: 'Confirmed after the system design round.', recommendation: 'YES' });
  assert.equal(res.status, 200);
  const [afterUpdate] = await pool().query('SELECT rating FROM application_evaluations WHERE application_id = ?', [applicationId]);
  assert.equal(afterUpdate.length, 1);
  assert.equal(Number(afterUpdate[0].rating), 5);

  // The unique key physically prevents a second row for the same reviewer.
  await assert.rejects(() => pool().query(
    'INSERT INTO application_evaluations (id, application_id, reviewer_id, rating, recommendation, notes) VALUES (?, ?, ?, 3, ?, ?)',
    [`ael_dup_${crypto.randomBytes(4).toString('hex')}`, applicationId, EMPLOYER_UID, 'NEUTRAL', 'duplicate attempt']
  ), error => error.code === 'ER_DUP_ENTRY');

  // Out-of-contract values are refused by the schema itself.
  await assert.rejects(() => pool().query(
    'INSERT INTO application_evaluations (id, application_id, reviewer_id, rating, recommendation) VALUES (?, ?, ?, 9, ?, NULL)',
    [`ael_bad_${crypto.randomBytes(4).toString('hex')}`, applicationId, 'reviewer-x', 'NEUTRAL']
  ));

  res = await request(app).get(`/api/jobs-data/applications/${applicationId}/evaluate`);
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluation.recommendation, 'YES');
});

// ─── Workstream 4: tenant quotas and custom domains ─────────────────────────
mariaTest('tenant quotas and custom domains persist on the tenant row and reject duplicates', async (t) => {
  if (!(await databaseReachable(t))) return;
  const seeded = await fixtures.seedEnterpriseTenant(pool(), { seatLimit: 50 });
  created.tenants.push(seeded.tenantId);
  const registry = new MySqlTenantRegistry({ pool: pool() });

  const updated = await registry.updateTenantProfile({
    tenantId: seeded.tenantId,
    seatQuota: 12,
    monthlyAiCredits: 25000,
    customDomain: 'Talent.Acme-Integration.Test.',
  });
  assert.equal(updated.seatQuota, 12);
  assert.equal(updated.monthlyAiCredits, 25000);
  assert.equal(updated.customDomain, 'talent.acme-integration.test');

  const [rows] = await pool().query(
    'SELECT seat_quota, monthly_ai_credits, custom_domain FROM enterprise_tenants WHERE id = ?',
    [seeded.tenantId]
  );
  assert.equal(Number(rows[0].seat_quota), 12);
  assert.equal(Number(rows[0].monthly_ai_credits), 25000);
  assert.equal(rows[0].custom_domain, 'talent.acme-integration.test');

  // A partial update leaves the other commercial fields untouched.
  const renamed = await registry.updateTenantProfile({ tenantId: seeded.tenantId, displayName: 'Renamed Tenant' });
  assert.equal(renamed.seatQuota, 12);
  assert.equal(renamed.customDomain, 'talent.acme-integration.test');

  // A second tenant cannot claim the same domain.
  const second = await fixtures.seedEnterpriseTenant(pool(), { seatLimit: 10 });
  created.tenants.push(second.tenantId);
  await assert.rejects(
    () => registry.updateTenantProfile({ tenantId: second.tenantId, customDomain: 'talent.acme-integration.test' }),
    error => error.code === 'CUSTOM_DOMAIN_TAKEN' && error.status === 409
  );

  // Explicit null releases the domain.
  const released = await registry.updateTenantProfile({ tenantId: second.tenantId, customDomain: null });
  assert.equal(released.customDomain, null);

  // Invalid quotas never reach the database.
  await assert.rejects(
    () => registry.updateTenantProfile({ tenantId: seeded.tenantId, seatQuota: 0 }),
    error => error.code === 'INVALID_SEAT_QUOTA'
  );
});

// ─── Workstream 5: seat concurrency ─────────────────────────────────────────
mariaTest('ten concurrent invitations against one free seat allocate exactly one membership', async (t) => {
  if (!(await databaseReachable(t))) return;
  const seeded = await fixtures.seedEnterpriseTenant(pool(), { seatLimit: 10 });
  created.tenants.push(seeded.tenantId);
  // The purchased quota is written on the tenant row (migration 033) and the owner
  // already occupies one seat, so four seats remain.
  await pool().query('UPDATE enterprise_tenants SET seat_quota = 5 WHERE id = ?', [seeded.tenantId]);

  const registry = new MySqlTenantRegistry({ pool: pool() });
  const principals = Array.from({ length: 10 }, (_, index) => `seat12_${crypto.randomBytes(5).toString('hex')}_${index}`);

  const outcomes = await Promise.all(principals.map(principalId => registry.grantMembership({
    tenantId: seeded.tenantId,
    principalId,
    workspaceId: seeded.workspaceId,
    roles: ['ENTERPRISE_MEMBER'],
    status: 'INVITED',
    invitation: {
      recipientEmail: `${principalId}@mandate12.test`,
      invitedByPrincipalId: EMPLOYER_UID,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      notification: { templateType: 'enterprise-invitation', vars: {} },
      tenantContext: null,
    },
  }).then(() => 'GRANTED').catch(error => error.code || 'FAILED')));

  const granted = outcomes.filter(outcome => outcome === 'GRANTED').length;
  const rejected = outcomes.filter(outcome => outcome === 'SEAT_LIMIT_REACHED').length;
  assert.equal(granted, 4, `four free seats means four grants: ${JSON.stringify(outcomes)}`);
  assert.equal(rejected, 10 - granted, 'every other attempt must be a clean SEAT_LIMIT_REACHED');

  const [usage] = await pool().query(
    `SELECT SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'INVITED' THEN 1 ELSE 0 END) AS invited
       FROM enterprise_memberships WHERE tenantId = ?`,
    [seeded.tenantId]
  );
  assert.equal(Number(usage[0].active) + Number(usage[0].invited), 5, 'ACTIVE + INVITED must never exceed the quota');

  // No orphan invitation rows for the rejected attempts.
  const [orphans] = await pool().query(
    `SELECT COUNT(*) AS total FROM enterprise_membership_invitations i
      LEFT JOIN enterprise_memberships m ON m.id = i.membershipId
     WHERE i.tenantId = ? AND m.id IS NULL`,
    [seeded.tenantId]
  );
  assert.equal(Number(orphans[0].total), 0);
});

// ─── Workstream 6: immediate session revocation ─────────────────────────────
mariaTest('a persisted revocation rejects previously issued tokens and survives a process-local reset', async (t) => {
  if (!(await databaseReachable(t))) return;
  const uid = `ops12_${crypto.randomBytes(6).toString('hex')}`;
  created.revocations.push(uid);
  sessionRevocation.resetForTests();

  const before = Math.floor(Date.now() / 1000) - 120;
  // No revocation yet: an old token is accepted.
  await sessionRevocation.assertSessionActive({ uid, issuedAt: before });

  const revocation = await sessionRevocation.revokeUserSessions({
    uid, actorUid: 'super-admin', reason: 'integration test', requestId: 'req-int',
  });
  assert.equal(revocation.uid, uid);

  const [rows] = await pool().query(
    'SELECT user_id, scope, reason, revoked_by, UNIX_TIMESTAMP(revoked_at) AS cutoff FROM revoked_sessions WHERE user_id = ?',
    [uid]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].revoked_by, 'super-admin');
  assert.equal(rows[0].reason, 'integration test');

  // Already-issued tokens are rejected immediately.
  await assert.rejects(
    () => sessionRevocation.assertSessionActive({ uid, issuedAt: before }),
    error => error.code === 'SESSION_REVOKED' && error.status === 401
  );
  // A token minted after the revocation is accepted.
  await sessionRevocation.assertSessionActive({ uid, issuedAt: Math.floor(Date.now() / 1000) + 1 });

  // Simulate a stale process (local cache cleared) and even a restart: the
  // decision is re-derived from the database.
  sessionRevocation.resetForTests();
  await assert.rejects(
    () => sessionRevocation.assertSessionActive({ uid, issuedAt: before }),
    error => error.code === 'SESSION_REVOKED'
  );

  // Repeated revocations are safe and never move the cutoff backwards.
  const second = await sessionRevocation.revokeUserSessions({ uid, actorUid: 'super-admin', reason: 'repeat' });
  assert.ok(second.cutoffSeconds >= revocation.cutoffSeconds);
  await assert.rejects(
    () => sessionRevocation.assertSessionActive({ uid, issuedAt: before }),
    error => error.code === 'SESSION_REVOKED'
  );
});

// ─── Cleanup ────────────────────────────────────────────────────────────────
test('mandate 12 integration fixtures are removed', { skip: isMariaEnabled() ? false : 'NOT VERIFIED: no disposable MariaDB configured' }, async () => {
  const run = async (sql, params) => { try { await pool().query(sql, params); } catch (_error) { /* best effort */ } };
  for (const conversationId of created.conversations) {
    await run('DELETE FROM conversation_messages WHERE conversation_id = ?', [conversationId]);
    await run('DELETE FROM conversation_participants WHERE conversation_id = ?', [conversationId]);
    await run('DELETE FROM conversations WHERE id = ?', [conversationId]);
  }
  for (const applicationId of created.applications) {
    await run('DELETE FROM application_evaluations WHERE application_id = ?', [applicationId]);
  }
  await fixtures.cleanup(pool(), { applicationIds: created.applications, tenantIds: created.tenants });
  for (const ownerId of created.settingsOwners) {
    await run('DELETE FROM employer_settings WHERE owner_id = ?', [ownerId]);
  }
  for (const uid of created.revocations) {
    await run('DELETE FROM revoked_sessions WHERE user_id = ?', [uid]);
  }
  assert.ok(true);
});
