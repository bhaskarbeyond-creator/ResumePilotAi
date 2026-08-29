/**
 * ZERO-FORESTORE ACCEPTANCE TEST (mission §3 / §32)
 *
 * Physically proves the application is fully operational with Firestore
 * unavailable and unconfigured:
 *
 *   Firestore OFF (no credentials, data plane removed, hosts unreachable)
 *           ↓
 *   Application starts            → /healthz, /readyz
 *   Authentication works          → bearer enforcement + verified identity
 *   Dashboard works               → profile + resume listing
 *   Resume creation works         → POST /api/resumes/:id
 *   Resume editing works          → revisioned save, conflict detection
 *   Persistence works             → reopen + direct MySQL verification
 *   AI functionality works        → real provider round-trip (local gateway)
 *   Export works                  → DOCX binary generation
 *   Admin functionality works     → user directory, maintenance, queues
 *   Multi-tenant zero trust       → cross-user access denied
 *
 * The backend is booted as a real child process (`node backend/index.js`)
 * with an environment containing NO Firebase credentials of any kind.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { bootServer, certToken } from './helpers/bootServer.mjs';
import { loadCertificationDatabase } from './helpers/databaseConfig.mjs';
import mysql from 'mysql2/promise';

const PORT = 8311;
const AI_PORT = 9417;
let dbConn = null;
try {
  dbConn = loadCertificationDatabase();
} catch (err) {
  if (err.code !== 'CERTIFICATION_DATABASE_CONFIGURATION_REQUIRED') throw err;
}

let server;
let aiRequests = [];
let aiServer;

let aiPort = AI_PORT;

async function startMockAiGateway() {
  // Find a free port (another stack may already run a mock on AI_PORT): try to
  // bind and move up on EADDRINUSE.
  const makeServer = () => http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      aiRequests.push({ url: req.url, body });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Certification AI summary: a results-driven professional with verified end-to-end delivery skills.' } }],
      }));
    });
  });
  for (;;) {
    const candidate = makeServer();
    const bound = await new Promise((resolve) => {
      candidate.once('error', (err) => resolve(err.code === 'EADDRINUSE' ? 'inuse' : 'error'));
      candidate.listen(aiPort, '127.0.0.1', () => resolve('ok'));
    });
    if (bound === 'ok') {
      aiServer = candidate;
      break;
    }
    candidate.removeAllListeners();
    if (bound === 'error') throw new Error(`could not bind mock AI gateway on port ${aiPort}`);
    aiPort += 1;
  }
}

test.before(async () => {
  if (!dbConn) return;
  await startMockAiGateway();
  server = await bootServer({
    port: PORT,
    db: dbConn,
    extraEnv: {
      // AI provider points at the local OpenAI-compatible gateway. This proves
      // the full AI pipeline (config → provider request → parse → response)
      // without any Google/Firebase dependency.
      OPENAI_API_KEY: `ephemeral-${crypto.randomBytes(24).toString('base64url')}`,
      OPENAI_BASE_URL: `http://127.0.0.1:${aiPort}/v1`,
      OPENAI_MODEL: 'certification-mock-model',
    },
  });
});

test.after(async () => {
  if (server) await server.stop();
  if (aiServer) await new Promise(resolve => aiServer.close(resolve));
});

const json = (method, path, { token, body } = {}) => fetch(`${server.base}${path}`, {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(async res => ({ status: res.status, headers: res.headers, body: await res.json().catch(() => null) }));

test('1. application starts with ZERO Firestore configuration', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const health = await json('GET', '/healthz');
  assert.equal(health.status, 200);
  assert.equal(health.body.firestoreDataPlane, 'REMOVED');
  assert.equal(health.body.authoritativeDatabase, 'mysql');

  const ready = await json('GET', '/readyz');
  assert.equal(ready.status, 200, JSON.stringify(ready.body));
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.checks.mysql.status, 'READY');
  assert.equal(ready.body.checks.firestoreDataPlane, 'REMOVED');

  // Boot log must show the data plane removal, and no Firestore client init.
  const logs = server.logs();
  assert.match(logs, /Firestore Data Plane\] REMOVED/);
  assert.doesNotMatch(logs, /\[Firestore Data Plane\] ENABLED/);
});

test('2. authentication is enforced and works without Firestore', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const anon = await json('GET', '/api/resumes');
  assert.equal(anon.status, 401);
  assert.equal(anon.body.error.code, 'AUTH_REQUIRED');

  const forged = await json('GET', '/api/resumes', { token: 'not-a-real-token' });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.error.code, 'INVALID_AUTH_TOKEN');

  const token = certToken({ uid: 'cert-user-a', email: 'a@certification.local', role: 'USER' });
  const authed = await json('GET', '/api/resumes', { token });
  assert.equal(authed.status, 200, JSON.stringify(authed.body));
  assert.equal(authed.body.success, true);
});

test('3. user profile (dashboard data) create/read via MySQL', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const token = certToken({ uid: 'cert-user-a', email: 'a@certification.local', role: 'USER' });
  const saved = await json('POST', '/api/users-data/profile', {
    token,
    body: { email: 'a@certification.local', firstname: 'Aria', lastname: 'Certification', membership: 'Basic' },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.user.firstname, 'Aria');

  const read = await json('GET', '/api/users-data/profile', { token });
  assert.equal(read.status, 200);
  assert.equal(read.body.user.firstname, 'Aria');
  assert.equal(read.body.user.email, 'a@certification.local');
});

const RESUME_ID = 'cert_resume_0001';

test('4. resume creation persists to MySQL', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const token = certToken({ uid: 'cert-user-a', email: 'a@certification.local', role: 'USER' });
  const created = await json('POST', `/api/resumes/${RESUME_ID}`, {
    token,
    body: {
      title: 'Certification Resume',
      firstname: 'Aria',
      lastname: 'Certification',
      occupation: 'Principal Engineer',
      summary: 'Zero-Firestore certification resume.',
      skills: [{ skillName: 'MySQL', rating: 95 }],
    },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.success, true);

  // Direct database verification — MySQL is the store of record.
  const conn = await mysql.createConnection({ host: dbConn.host, port: dbConn.port, user: dbConn.user, password: dbConn.password, database: dbConn.name });
  const [rows] = await conn.query('SELECT id, user_id, title FROM resumes WHERE id = ?', [RESUME_ID]);
  await conn.end();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, 'cert-user-a');
  assert.equal(rows[0].title, 'Certification Resume');
});

test('5. resume editing, persistence and optimistic conflict', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const token = certToken({ uid: 'cert-user-a', email: 'a@certification.local', role: 'USER' });

  const list = await json('GET', '/api/resumes', { token });
  assert.equal(list.status, 200);
  assert.ok(list.body.resumes.some(r => r.id === RESUME_ID), 'created resume appears in the list');

  const loaded = await json('GET', `/api/resumes/${RESUME_ID}`, { token });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.resume.title, 'Certification Resume');
  const revision = Number(loaded.body.resume.revision || 1);

  const edited = await json('POST', `/api/resumes/${RESUME_ID}`, {
    token,
    body: { title: 'Certification Resume (edited)', occupation: 'Staff Engineer', expectedRevision: revision },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));

  // Reopen — persistence across requests.
  const reopened = await json('GET', `/api/resumes/${RESUME_ID}`, { token });
  assert.equal(reopened.body.resume.title, 'Certification Resume (edited)');
  assert.ok(Number(reopened.body.resume.revision) > revision, 'revision advanced after edit');

  // Stale revision must be rejected with a controlled conflict, never clobbered.
  const conflict = await json('POST', `/api/resumes/${RESUME_ID}`, {
    token,
    body: { title: 'stale write', expectedRevision: revision },
  });
  assert.equal(conflict.status, 409);
});

test('6. multi-tenant zero trust: user B cannot access user A resume', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const tokenB = certToken({ uid: 'cert-user-b', email: 'b@certification.local', role: 'USER' });
  const cross = await json('GET', `/api/resumes/${RESUME_ID}`, { token: tokenB });
  assert.equal(cross.status, 404, 'cross-user read must not leak another tenant\'s resume');

  const listB = await json('GET', '/api/resumes', { token: tokenB });
  assert.ok(!listB.body.resumes.some(r => r.id === RESUME_ID));

  const crossDelete = await json('DELETE', `/api/resumes/${RESUME_ID}`, { token: tokenB });
  assert.ok([404, 403].includes(crossDelete.status), 'cross-user delete must be denied');
});

test('7. AI functionality works via the provider pipeline (no Firestore)', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const token = certToken({ uid: 'cert-user-a', email: 'a@certification.local', role: 'USER' });
  const before = aiRequests.length;
  const result = await json('POST', '/api/generate-content', {
    token,
    body: { operation: 'generate-summary', payload: { jobTitle: 'Principal Engineer', skills: 'MySQL, resilience' } },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.summary, 'AI summary returned');
  // The local gateway must have received the provider request: a real
  // round-trip, not a silent fallback.
  assert.ok(aiRequests.length > before, 'provider gateway received the AI request');
  assert.match(result.headers.get('x-ai-provider') || '', /openai/i);
});

test('8. export: entitlement gating enforced, then DOCX generation works for a paid tier', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const token = certToken({ uid: 'cert-user-a', email: 'a@certification.local', role: 'USER' });

  // Basic tier: export is correctly denied (entitlement gating is real).
  const denied = await fetch(`${server.base}/api/export-docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeId: RESUME_ID, template: 'Cv1' }),
  });
  assert.equal(denied.status, 402);

  // Upgrade to a paid tier through the same MySQL-backed profile API.
  const upgrade = await json('POST', '/api/users-data/profile', {
    token,
    body: { email: 'a@certification.local', firstname: 'Aria', lastname: 'Certification', membership: 'Premium', paymentStatus: 'ACTIVE' },
  });
  assert.equal(upgrade.status, 200, JSON.stringify(upgrade.body));

  const res = await fetch(`${server.base}/api/export-docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumeId: RESUME_ID, template: 'Cv1' }),
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 200, `export failed: ${buffer.subarray(0, 300).toString()}`);
  const type = res.headers.get('content-type') || '';
  assert.ok(/officedocument|octet-stream/.test(type), `unexpected content type ${type}`);
  assert.ok(buffer.length > 1000, 'export produced a non-trivial binary');
  // DOCX files are ZIP archives: PK magic bytes.
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
});

test('9. admin functionality works against MySQL', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const now = Math.floor(Date.now() / 1000);
  const adminToken = certToken({
    uid: 'cert-super-admin', email: 'super@certification.local', role: 'SUPER_ADMIN',
    auth_time: now, sign_in_second_factor: true,
  });

  const users = await json('GET', '/api/admin/users', { token: adminToken });
  assert.equal(users.status, 200, JSON.stringify(users.body));

  const maintenance = await json('POST', '/api/platform/maintenance', {
    token: adminToken,
    body: { enabled: false, message: 'Certification run.' },
  });
  assert.equal(maintenance.status, 200, JSON.stringify(maintenance.body));
  assert.equal(maintenance.body.success, true);

  const queues = await json('GET', '/api/platform/queues', { token: adminToken });
  assert.equal(queues.status, 200);
  assert.match(queues.body.summary.source || '', /MYSQL/);

  // A plain USER must be denied the admin surface.
  const userToken = certToken({ uid: 'cert-user-a', email: 'a@certification.local', role: 'USER' });
  const denied = await json('GET', '/api/admin/users', { token: userToken });
  assert.equal(denied.status, 403);
});

test('10. plain ADMIN cannot perform SUPER_ADMIN destructive control-plane writes', async (t) => {
  if (!dbConn) { t.skip('disposable certification database not configured'); return; }
  const now = Math.floor(Date.now() / 1000);
  const adminToken = certToken({ uid: 'cert-admin', email: 'admin@certification.local', role: 'ADMIN', auth_time: now });
  const res = await json('POST', '/api/platform/maintenance', {
    token: adminToken,
    body: { enabled: true, message: 'should not happen' },
  });
  assert.equal(res.status, 403);
});
