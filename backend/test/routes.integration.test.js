process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
process.env.SMTP_USER = 'mailer@example.com';
process.env.SMTP_PASS = 'fixture-mail-password';
process.env.SMTP_HOST = 'smtp.example.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const RUN_MARIADB_INTEGRATION = process.env.RUN_MARIADB_INTEGRATION === 'true';
if (RUN_MARIADB_INTEGRATION) {
  require('./helpers/disposableMariaDb').loadDisposableMariaDb();
}
const mariaTest = (name, fn) => test(name, {
  skip: RUN_MARIADB_INTEGRATION ? false : 'NOT VERIFIED: requires a disposable migrated MariaDB database',
}, fn);

if (!RUN_MARIADB_INTEGRATION) {
  require('./helpers/routesIntegrationContract').installRoutesIntegrationContract();
} else {
  const { configureAbuseCounterStoreForTests } = require('../security/abuse');
  const { InMemoryAtomicCounterStore } = require('./helpers/inMemoryAtomicCounterStore');
  configureAbuseCounterStoreForTests(new InMemoryAtomicCounterStore());
}

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'user-2', email: 'pending@example.com', email_verified: false, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'employer') return { uid: 'employer-1', email: 'employer@example.com', email_verified: true, role: 'EMPLOYER', employer: true, auth_time: now };
  if (token === 'unverified-admin') return { uid: 'admin-2', email: 'admin2@example.com', email_verified: false, role: 'SUPER_ADMIN', superAdmin: true, auth_time: now };
  if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  if (token === 'stale-admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now - 3600 };
  if (token === 'stale-super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now - 3600 };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('minimal health endpoint is public and does not cache', async () => {
  const response = await request(app).get('/healthz');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('readiness is truthful: reflects the MySQL data plane, never a secondary store', async () => {
  const { testConnection } = require('../database/mysql');
  const mysql = await testConnection();
  const response = await request(app).get('/readyz');
  // Readiness tracks the AUTHORITATIVE database. With MySQL reachable this
  // environment is ready; with MySQL down it must report not_ready (503).
  assert.equal(response.status, mysql.connected ? 200 : 503);
  assert.equal(response.body.status, mysql.connected ? 'ready' : 'not_ready');
  assert.equal(response.body.authoritativeDatabase, 'MARIADB');
  assert.equal(response.body.checks.firestoreDataPlane, 'REMOVED', 'readiness must never depend on a secondary store');
  assert.equal(response.body.checks.mysql.status, mysql.connected ? 'READY' : 'UNAVAILABLE');
  assert.equal(response.body.checks.aiProviders, 'NOT_CHECKED');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('protected endpoint rejects absent and invalid Firebase tokens', async () => {
  const absent = await request(app).get('/api/rtl-font-config');
  assert.equal(absent.status, 401);
  assert.equal(absent.body.error.code, 'AUTH_REQUIRED');
  const invalid = await request(app).get('/api/rtl-font-config').set(bearer('invalid'));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'INVALID_AUTH_TOKEN');
});

test('one-time export render data endpoint is public only through an opaque token', async () => {
  const missing = await request(app).get('/api/export-render-data');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers['cache-control'], 'no-store, private');
  const forged = await request(app).get('/api/export-render-data?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(forged.status, 404);
});

test('valid authenticated user reaches an ordinary route', async () => {
  const response = await request(app).get('/api/rtl-font-config').set(bearer('user'));
  assert.equal(response.status, 200);
  assert.equal(response.body.isRtlSupported, true);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('admin aliases and mail logs reject an ordinary authenticated user', async () => {
  for (const route of ['/api/auth/purge-orphaned-auth', '/api/email/logs', '/api/email/admin/test-imap', '/api/send-sms', '/api/admin/blog/publish-due', '/api/admin/ai/test-provider']) {
    const method = route.includes('logs') ? 'get' : 'post';
    const response = await request(app)[method](route).set(bearer('user')).send({});
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'FORBIDDEN', route);
  }
});

test('stale admin sessions cannot perform sensitive destructive account deletion', async () => {
  for (const [method, route, token] of [
    ['post', '/api/account/delete', 'stale-admin']
  ]) {
    const response = await request(app)[method](route).set(bearer(token)).send({ paymentOrderId: 'order', suspended: true });
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'RECENT_AUTH_REQUIRED', route);
  }
});

test('unverified admin cannot load or mutate protected configuration', async () => {
  for (const [method, route] of [['get', '/api/admin/ai-settings'], ['post', '/api/admin/ai-settings'], ['post', '/api/admin/ai/test-provider'], ['post', '/api/admin/ai/fetch-models'], ['get', '/api/email/admin/settings'], ['get', '/api/admin/twilio-settings'], ['post', '/api/admin/settings/modules']]) {
    const response = await request(app)[method](route).set(bearer('unverified-admin')).send({});
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'EMAIL_VERIFICATION_REQUIRED', route);
  }
});

test('admin lacking super-admin role cannot mutate or test AI provider settings', async () => {
  for (const route of ['/api/admin/ai-settings', '/api/admin/ai/test-provider']) {
    const response = await request(app).post(route).set(bearer('stale-admin')).send({ provider: 'gemini', model: 'gemini-2.0-flash' });
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'FORBIDDEN', route);
  }
});

test('email settings projections expose configured state without runtime credentials', async () => {
  const runtime = await request(app).get('/api/email/admin/settings').set(bearer('super-admin'));
  assert.equal(runtime.status, 200);
  assert.equal(runtime.body.settings.smtp.passwordConfigured, true);
  assert.equal(Object.hasOwn(runtime.body.settings.smtp, 'password'), false);
  assert.doesNotMatch(JSON.stringify(runtime.body), /fixture-mail-password/);

  const generic = await request(app).get('/api/admin/settings').set(bearer('super-admin'));
  assert.equal(generic.status, 200);
  if (generic.body.settings.smtp) {
    assert.equal(generic.body.settings.smtp.enabled, true);
    assert.equal(Object.hasOwn(generic.body.settings.smtp, 'password'), false);
  }
  assert.doesNotMatch(JSON.stringify(generic.body), /fixture-mail-password/);
});

mariaTest('Twilio settings persist in the canonical MySQL secret namespace without response disclosure', async () => {
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  const [snapshot] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN ('admin_configuration','public_config')");
  await pool.query("DELETE FROM system_settings WHERE category IN ('admin_configuration','public_config')");
  try {
    const authToken = 'fixture-twilio-auth-token-1234';
    const saved = await request(app).post('/api/admin/twilio-settings').set(bearer('super-admin')).send({
      accountSid: `AC${'a'.repeat(32)}`, authToken, fromPhoneNumber: '+14155552671', enableSmsAlerts: true, expectedRevision: 0,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.doesNotMatch(JSON.stringify(saved.body), /fixture-twilio-auth-token/);
    const [rows] = await pool.query("SELECT data FROM system_settings WHERE category = 'admin_configuration'");
    const stored = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    assert.equal(stored.twilio.authToken, authToken);
    const loaded = await request(app).get('/api/admin/twilio-settings').set(bearer('super-admin'));
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.settings.accountSidConfigured, true);
    assert.equal(Object.hasOwn(loaded.body.settings, 'authToken'), false);
    const bypass = await request(app).post('/api/admin/settings/twilio').set(bearer('super-admin')).send({ data: { authToken }, expectedRevision: 0 });
    assert.equal(bypass.status, 400);
  } finally {
    await pool.query("DELETE FROM system_settings WHERE category IN ('admin_configuration','public_config')").catch(() => {});
    for (const row of snapshot) {
      await pool.query("INSERT INTO system_settings (category, data, revision) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision)", [row.category, typeof row.data === 'string' ? row.data : JSON.stringify(row.data), row.revision]).catch(() => {});
    }
  }
});

mariaTest('Ads create and revision-safe delete persist through audited backend routes', async () => {
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  await pool.query("DELETE FROM canonical_documents WHERE entity_type = 'ads'");
  try {
    const created = await request(app).post('/api/admin/ads').set(bearer('super-admin')).send({ name: 'Release banner', imageLink: 'https://cdn.example.com/banner.png', destinationLink: '/pricing' });
    assert.equal(created.status, 200);
    assert.equal(created.body.item.revision, 1);
    const adId = created.body.item.id;
    const [rows] = await pool.query("SELECT payload FROM canonical_documents WHERE entity_type = 'ads' AND entity_id = ?", [adId]);
    const stored = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    assert.equal(stored.name, 'Release banner');
    const stale = await request(app).delete(`/api/admin/ads/${adId}`).set(bearer('super-admin')).send({ expectedRevision: 999 });
    assert.equal(stale.status, 409);
    assert.ok(['ADMIN_TARGET_CHANGED', 'CAS_CONFLICT'].includes(stale.body.code), `conflict code, got ${stale.body.code}`);
    const [stillRows] = await pool.query("SELECT entity_id FROM canonical_documents WHERE entity_type = 'ads' AND entity_id = ? AND deleted_at IS NULL", [adId]);
    assert.equal(stillRows.length, 1);
    const removed = await request(app).delete(`/api/admin/ads/${adId}`).set(bearer('super-admin')).send({ expectedRevision: 1 });
    assert.equal(removed.status, 200);
    const [goneRows] = await pool.query("SELECT entity_id FROM canonical_documents WHERE entity_type = 'ads' AND entity_id = ? AND deleted_at IS NULL", [adId]);
    assert.equal(goneRows.length, 0);
  } finally {
    await pool.query("DELETE FROM canonical_documents WHERE entity_type = 'ads'").catch(() => {});
  }
});

mariaTest('job application submission and employer status transitions are atomic, audited, and revision safe', async () => {
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  await pool.query("DELETE FROM applications WHERE id LIKE 'user-1_%'");
  await pool.query("DELETE FROM jobs WHERE id = 'active-job'");
  await pool.query("DELETE FROM users WHERE id IN ('user-1','employer-1')");
  await pool.query("INSERT INTO users (id, email, membership, paymentStatus) VALUES ('user-1','user@example.com','Premium','ACTIVE'), ('employer-1','employer@example.com','Basic','INACTIVE')");
  await pool.query("INSERT INTO jobs (id, employer_id, status, title, company_name, revision) VALUES ('active-job','employer-1','active','Engineer','Example Co',1)");
  await pool.query("INSERT INTO resumes (id, user_id, title, summary, revision) VALUES ('resume-1','user-1','Primary resume','Owned candidate resume',1)");
  try {
    const submitted = await request(app).post('/api/jobs/active-job/applications').set(bearer('user')).send({
      fullName: 'Candidate One', phone: '+14155552671', coverLetter: `<p>${'A'.repeat(80)}</p>`, resumeId: 'resume-1', linkedinUrl: 'https://linkedin.example/candidate',
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.revision, 1);
    const applicationId = submitted.body.applicationId;
    const [appRows] = await pool.query('SELECT * FROM applications WHERE id = ?', [applicationId]);
    assert.equal(appRows[0].applicant_id, 'user-1');
    assert.equal(appRows[0].applicant_email, 'user@example.com');

    const duplicate = await request(app).post('/api/jobs/active-job/applications').set(bearer('user')).send({
      fullName: 'Candidate One', phone: '+14155552671', coverLetter: `<p>${'A'.repeat(80)}</p>`,
    });
    assert.equal(duplicate.status, 409);

    const updated = await request(app).patch(`/api/job-applications/${encodeURIComponent(applicationId)}/status`).set(bearer('employer')).send({ status: 'interview', expectedStatus: 'pending', expectedRevision: 1 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.revision, 2);
    const [updatedRows] = await pool.query('SELECT status FROM applications WHERE id = ?', [applicationId]);
    assert.equal(updatedRows[0].status, 'interview');
    const stale = await request(app).patch(`/api/job-applications/${encodeURIComponent(applicationId)}/status`).set(bearer('employer')).send({ status: 'accepted', expectedStatus: 'pending', expectedRevision: 1 });
    assert.equal(stale.status, 409);
    const outsider = await request(app).patch(`/api/job-applications/${encodeURIComponent(applicationId)}/status`).set(bearer('user')).send({ status: 'accepted', expectedStatus: 'interview', expectedRevision: 2 });
    assert.equal(outsider.status, 404);
  } finally {
    await pool.query("DELETE FROM applications WHERE id LIKE 'user-1_%'").catch(() => {});
    await pool.query("DELETE FROM jobs WHERE id = 'active-job'").catch(() => {});
    await pool.query("DELETE FROM users WHERE id IN ('user-1','employer-1')").catch(() => {});
  }
});

mariaTest('employer job create, pause, edit, and delete routes are owned, audited, and revision safe', async () => {
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  await pool.query("DELETE FROM jobs WHERE employer_id = 'employer-1'");
  await pool.query("DELETE FROM companies WHERE owner_id = 'employer-1'");
  await pool.query("DELETE FROM users WHERE id = 'employer-1'");
  await pool.query("INSERT INTO users (id, email, membership, paymentStatus, role) VALUES ('employer-1','employer@example.com','Basic','INACTIVE','EMPLOYER')");
  await pool.query("INSERT INTO companies (id, owner_id, name, status, revision) VALUES ('company-1','employer-1','Example Co','approved',1)");
  try {
    const created = await request(app).post('/api/employer/jobs').set(bearer('employer')).send({ data: { title: 'New role', companyId: 'company-1', description: 'A great engineering role', location: 'Remote', type: 'Full-time' } });
    assert.equal(created.status, 201);
    const jobId = created.body.jobId || created.body.id;
    assert.ok(jobId, 'job id must be returned');
    const [jobRows] = await pool.query('SELECT status, revision FROM jobs WHERE id = ?', [jobId]);
    assert.equal(jobRows[0].status, 'pending');
    assert.equal(Number(jobRows[0].revision), 1);

    // Pause an active job through the employer route.
    await pool.query("UPDATE jobs SET status = 'active', revision = 2 WHERE id = ?", [jobId]);
    const paused = await request(app).patch(`/api/employer/jobs/${jobId}`).set(bearer('employer')).send({ status: 'paused', expectedRevision: 2 });
    assert.equal(paused.status, 200);
    const [pausedRows] = await pool.query('SELECT status, revision FROM jobs WHERE id = ?', [jobId]);
    assert.equal(pausedRows[0].status, 'paused');
    const revisionAfterPause = Number(pausedRows[0].revision);

    // Edit requires the company to be approved (pause bumped the revision).
    const edited = await request(app).patch(`/api/employer/jobs/${jobId}`).set(bearer('employer')).send({ data: { title: 'Edited role', companyId: 'company-1', description: 'Updated description', location: 'Remote', type: 'Full-time' }, expectedRevision: revisionAfterPause });
    assert.equal(edited.status, 200);
    const [editedRows] = await pool.query('SELECT revision FROM jobs WHERE id = ?', [jobId]);
    const revisionAfterEdit = Number(editedRows[0].revision);

    // Delete owned job (edit bumped the revision).
    const removed = await request(app).delete(`/api/employer/jobs/${jobId}`).set(bearer('employer')).send({ expectedRevision: revisionAfterEdit });
    assert.equal(removed.status, 200);
    const [goneRows] = await pool.query('SELECT id FROM jobs WHERE id = ?', [jobId]);
    assert.equal(goneRows.length, 0);
  } finally {
    await pool.query("DELETE FROM jobs WHERE employer_id = 'employer-1'").catch(() => {});
    await pool.query("DELETE FROM companies WHERE owner_id = 'employer-1'").catch(() => {});
    await pool.query("DELETE FROM users WHERE id = 'employer-1'").catch(() => {});
  }
});

mariaTest('generic settings preserve omitted and blank backend secrets without browser disclosure', async () => {
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  const [snapshot] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN ('admin_configuration','public_config')");
  await pool.query("DELETE FROM system_settings WHERE category IN ('admin_configuration','public_config')");
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('admin_configuration', ?, 2)", [JSON.stringify({
    socialAuth: { linkedinClientId: 'existing-client', linkedinClientSecret: 'fixture-existing-client-secret', nested: { accessToken: 'fixture-existing-access-token' } },
    _revisions: { socialAuth: 2 },
  })]);
  try {
    const response = await request(app).post('/api/admin/settings/socialAuth').set(bearer('super-admin')).send({
      data: { linkedinClientId: 'updated-client', linkedinClientSecret: '' }, expectedRevision: 2,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.revision, 3);
    assert.doesNotMatch(JSON.stringify(response.body), /fixture-existing/);
    const [rows] = await pool.query("SELECT data FROM system_settings WHERE category = 'admin_configuration'");
    const adminConfig = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    assert.equal(adminConfig.socialAuth.linkedinClientSecret, 'fixture-existing-client-secret');
    assert.equal(adminConfig.socialAuth.nested.accessToken, 'fixture-existing-access-token');
    const [pubRows] = await pool.query("SELECT data FROM system_settings WHERE category = 'public_config'");
    const pubConfig = typeof pubRows[0].data === 'string' ? JSON.parse(pubRows[0].data) : pubRows[0].data;
    assert.equal(pubConfig.socialAuth.linkedinClientSecret, undefined);
    const providerStatus = await request(app).get('/api/auth/linkedin/test-credentials').set(bearer('super-admin'));
    assert.equal(providerStatus.status, 200);
    assert.equal(providerStatus.body.configured, true);
    assert.doesNotMatch(JSON.stringify(providerStatus.body), /fixture-existing-client-secret/);
  } finally {
    await pool.query("DELETE FROM system_settings WHERE category IN ('admin_configuration','public_config')").catch(() => {});
    for (const row of snapshot) {
      await pool.query("INSERT INTO system_settings (category, data, revision) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision)", [row.category, typeof row.data === 'string' ? row.data : JSON.stringify(row.data), row.revision]).catch(() => {});
    }
  }
});

test('email runtime save rejects unencrypted or malformed transport configuration', async () => {
  const response = await request(app).post('/api/email/admin/save-smtp').set(bearer('super-admin')).send({
    expectedRevision: 0,
    smtp: { host: 'smtp.example.com', port: 25, encryption: 'none', username: 'mailer@example.com' },
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Encrypted smtp transport is required/);
});

test('Firebase credential status loads without recent auth but runtime rotation remains recent-auth protected', async () => {
  const loaded = await request(app).get('/api/admin/firebase-service-account').set(bearer('stale-super-admin'));
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.runtimeRotationEnabled, false);
  const changed = await request(app).post('/api/admin/firebase-service-account').set(bearer('stale-super-admin')).send({});
  assert.equal(changed.status, 501);
  assert.equal(changed.body.code, 'RUNTIME_SECRET_ROTATION_DISABLED');
  const disabled = await request(app).post('/api/admin/firebase-service-account').set(bearer('super-admin')).send({ projectId: 'p', clientEmail: 'x@example.com', privateKey: 'secret' });
  assert.equal(disabled.status, 501);
  assert.equal(disabled.body.code, 'RUNTIME_SECRET_ROTATION_DISABLED');
});

test('loading non-secret AI settings does not require recent authentication', async () => {
  // The settings store (MySQL) is authoritative and available; a stale super-admin
  // (no recent re-auth) can still READ the non-secret projection.
  const response = await request(app).get('/api/admin/ai-settings').set(bearer('stale-super-admin'));
  assert.equal(response.status, 200);
  assert.ok(response.body.settings || response.body.provider, 'non-secret AI settings must load');
  assert.doesNotMatch(JSON.stringify(response.body), /server-only-gemini-key|gemini-secret-value/);
});

mariaTest('fresh authorized admin reaches revisioned AI settings persistence without secret disclosure', async () => {
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  const [snapshot] = await pool.query("SELECT category, data, revision FROM system_settings WHERE category IN ('public_config','ai_providers','system_settings')");
  await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','ai_providers','system_settings')");
  try {
    const saved = await request(app).post('/api/admin/ai-settings').set(bearer('super-admin')).send({ provider: 'gemini', model: 'gemini-2.0-flash', geminiApiKey: 'gemini-secret-value', expectedRevision: 0, enableFallback: true });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.success, true);
    assert.equal(saved.body.revision, 1);
    assert.equal(saved.body.configuredProviders.gemini, true);
    assert.doesNotMatch(JSON.stringify(saved.body), /gemini-secret-value/);
    const loaded = await request(app).get('/api/admin/ai-settings').set(bearer('super-admin'));
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.revision, 1);
    assert.doesNotMatch(JSON.stringify(loaded.body), /gemini-secret-value/);
  } finally {
    await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','ai_providers','system_settings')").catch(() => {});
    for (const row of snapshot) {
      await pool.query("INSERT INTO system_settings (category, data, revision) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision)", [row.category, typeof row.data === 'string' ? row.data : JSON.stringify(row.data), row.revision]).catch(() => {});
    }
  }
});

test('legacy shared provider-test endpoint is retired instead of reporting false success', async () => {
  const response = await request(app).post('/api/admin/test-connection').set(bearer('super-admin')).send({ type: 'gemini' });
  assert.equal(response.status, 404);
});

test('fresh authorized admin provider test reaches the dedicated AI route with useful errors', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) });
    const valid = await request(app).post('/api/admin/ai/test-provider').set(bearer('super-admin')).send({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'openai-secret-value' });
    assert.equal(valid.status, 200);
    assert.equal(valid.body.success, true);
    assert.equal(valid.body.provider, 'openai');
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'provider-sensitive-detail' } }) });
    const invalid = await request(app).post('/api/admin/ai/test-provider').set(bearer('super-admin')).send({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'invalid-secret-value' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.code, 'AI_PROVIDER_AUTHENTICATION_FAILED');
    assert.doesNotMatch(JSON.stringify(invalid.body), /provider-sensitive-detail|invalid-secret-value/);
  } finally { global.fetch = originalFetch; }
});

test('unverified users cannot consume paid AI or payment endpoints', async () => {
  const ai = await request(app).post('/api/generate-summary').set(bearer('unverified')).send({ occupation: 'Engineer' });
  assert.equal(ai.status, 403);
  assert.equal(ai.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const payment = await request(app).post('/api/pay').set(bearer('unverified')).send({ planId: 'monthly' });
  assert.equal(payment.status, 403);
  assert.equal(payment.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const message = await request(app).post('/api/messages/send').set(bearer('unverified')).send({ conversationId: 'conversation', text: 'hello' });
  assert.equal(message.status, 403);
  assert.equal(message.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const participant = await request(app).get('/api/messages/conversations/conversation/participant-profile').set(bearer('unverified'));
  assert.equal(participant.status, 403);
  assert.equal(participant.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const application = await request(app).post('/api/jobs/active-job/applications').set(bearer('unverified')).send({});
  assert.equal(application.status, 403);
  assert.equal(application.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const applicationStatus = await request(app).patch('/api/job-applications/application/status').set(bearer('unverified')).send({});
  assert.equal(applicationStatus.status, 403);
  assert.equal(applicationStatus.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('password reset request is generic and timing-equalized for malformed accounts', async () => {
  const started = Date.now();
  const response = await request(app).post('/api/auth/custom-password-reset').send({ email: 'not-an-email' });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Date.now() - started >= 275);
  assert.doesNotMatch(JSON.stringify(response.body), /not-an-email|user.not.found/i);
});

test('verification requires authentication and legacy notification dispatch is retired', async () => {
  const anonymous = await request(app).post('/api/auth/send-verification-email').send({ email: 'victim@example.com' });
  assert.equal(anonymous.status, 401);
  const notification = await request(app).post('/api/notify/user-signup').set(bearer('user')).send({ userEmail: 'victim@example.com' });
  assert.equal(notification.status, 410);
  assert.equal(notification.body.code, 'CLIENT_NOTIFICATION_DISPATCH_RETIRED');
});

test('CORS grants only exact configured origins', async () => {
  const allowed = await request(app).options('/api/rtl-font-config')
    .set('Origin', 'https://app.example.com')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.example.com');
  const denied = await request(app).options('/api/rtl-font-config')
    .set('Origin', 'https://app.example.com.evil.test')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('public contact endpoint uses validation, honeypot and per-source throttling', async () => {
  const bot = await request(app).post('/api/contact').send({ website: 'https://spam.test', email: 'x@y.test', name: 'Bot', message: 'buy now spam' });
  assert.equal(bot.status, 202);
  const invalid1 = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(invalid1.status, 400);
  const invalid2 = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.ok([400, 429].includes(invalid2.status));
  const limited = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(limited.status, 429);
});

test('Stripe webhook fails closed without a configured signature secret', async () => {
  const response = await request(app).post('/api/stripe-webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'forged')
    .send('{"id":"evt_forged"}');
  assert.equal(response.status, 400);
});

test('legacy/demo payment bypasses fail closed and client entitlement dates are ignored', async () => {
  const legacy = await request(app).post('/api/payment/razorpay-order').set(bearer('user')).send({ amount: 1, keySecret: 'attacker' });
  assert.equal(legacy.status, 410);
  // Client-supplied identity fields (userId, amount) are rejected before provider is checked.
  const razorpayWithIdentity = await request(app).post('/api/razorpay/create-order').set(bearer('user')).send({ planId: 'monthly', amount: 1, userId: 'victim' });
  assert.equal(razorpayWithIdentity.status, 400);
  assert.equal(razorpayWithIdentity.body.error.code, 'CLIENT_PAYMENT_IDENTITY_REJECTED');
  // Simulate a fully unconfigured provider. The repository contract contains no
  // provider credential and there is no secondary data-plane fallback.
  const savedId = process.env.RAZORPAY_KEY_ID;
  const savedSecret = process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  try {
    const razorpayUnconfigured = await request(app).post('/api/razorpay/create-order').set(bearer('user')).send({ planId: 'monthly' });
    assert.equal(razorpayUnconfigured.status, 503);
    assert.equal(razorpayUnconfigured.body.error.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  } finally {
    if (savedId) process.env.RAZORPAY_KEY_ID = savedId;
    if (savedSecret) process.env.RAZORPAY_KEY_SECRET = savedSecret;
  }
  // Legacy client-supplied entitlement dates are rejected as 503.
  const entitlement = await request(app).post('/api/check').set(bearer('user')).send({ accountType: 'Premium', expDate: '2999-01-01' });
  assert.equal(entitlement.status, 503);
  assert.equal(entitlement.body.status, 'false');
});

test('payment verification rejects malformed or unbound provider orders', async () => {
  const paypal = await request(app).post('/api/paypal/verify').set(bearer('user')).send({ orderId: '../metadata', paymentOrderId: 'x' });
  assert.equal(paypal.status, 400);
  const razorpay = await request(app).post('/api/razorpay/verify-payment').set(bearer('user')).send({ razorpay_order_id: 'order', razorpay_payment_id: 'pay', razorpay_signature: 'forged' });
  assert.equal(razorpay.status, 400);
});

test('JSON body limit rejects oversized payloads before route work', async () => {
  const response = await request(app).post('/api/check')
    .set(bearer('user'))
    .send({ value: 'x'.repeat(300 * 1024) });
  assert.equal(response.status, 413);
});
