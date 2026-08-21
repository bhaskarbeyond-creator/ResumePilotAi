#!/usr/bin/env node
/**
 * LIVE production verification for the Enterprise platform.
 *
 * Talks to the REAL deployed backend at https://airesume.projectdemo.guru —
 * no fixtures, no mocks. Safe by design: all created records are prefixed
 * `zz-verify-` and archived/revoked at the end.
 *
 * Phases
 *   0  Unauthenticated surface: health, readiness, SPA delivery, auth boundary.
 *   1  Real authentication (Firebase REST) + full enterprise API walk.
 *   2  Disposable CRUD: workspace / team / service account / support grant
 *      lifecycle + audit evidence, then cleanup.
 *   3  Tenant isolation (requires a second account in a DIFFERENT tenant).
 *   4  Latency profile (p50/p95 across the walked endpoints).
 *
 * Environment
 *   PROD_BASE_URL          default https://airesume.projectdemo.guru
 *   VITE_FIREBASE_KEY      Firebase web API key (or present in ./.env)
 *   PROD_TEST_EMAIL / PROD_TEST_PASSWORD           enterprise test account
 *   PROD_TEST_EMAIL_B / PROD_TEST_PASSWORD_B       optional: isolation probe
 *
 * Exit code 0 = every executed phase passed. Skipped phases are reported
 * as SKIPPED, never silently counted as passed.
 */
import fs from 'node:fs';
import https from 'node:https';

const BASE = process.env.PROD_BASE_URL || 'https://airesume.projectdemo.guru';

function readEnvKey() {
  if (process.env.VITE_FIREBASE_KEY) return process.env.VITE_FIREBASE_KEY;
  try {
    const match = fs.readFileSync('.env', 'utf8').match(/VITE_FIREBASE_KEY=([^\r\n]+)/);
    if (match) return match[1].trim();
  } catch { /* optional */ }
  return '';
}
const API_KEY = readEnvKey();

const timings = [];
function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method,
      headers: {
        'User-Agent': 'ResumePilot-LiveVerifier/1.0',
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 30_000,
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        timings.push({ path: u.pathname, ms: Date.now() - started, status: res.statusCode });
        let json = null;
        try { json = JSON.parse(data); } catch { /* html/binary */ }
        resolve({ status: res.statusCode, body: data, json, headers: res.headers });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(title) { console.log(`\n=== ${title} ===`); }

async function firebaseSignIn(email, password) {
  const res = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', body: { email, password, returnSecureToken: true },
  });
  if (res.status !== 200) throw new Error(`Firebase sign-in failed (${res.status}): ${res.body.slice(0, 200)}`);
  return res.json; // idToken, refreshToken, localId, email
}

const api = (token, extra = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

async function main() {
  console.log(`LIVE verification against ${BASE} — ${new Date().toISOString()}`);

  // ---------------- Phase 0: unauthenticated surface ----------------
  section('Phase 0 — unauthenticated surface');
  const root = await request(`${BASE}/`);
  check('SPA root returns 200', root.status === 200, `status=${root.status}`);
  check('SPA root is the app shell', root.status === 200 && /assets\/index-[\w-]+\.js/.test(root.body), 'entry asset link present');
  const ent = await request(`${BASE}/enterprise`);
  check('/enterprise SPA route returns 200', ent.status === 200, `status=${ent.status}`);
  const healthz = await request(`${BASE}/api/healthz`);
  check('/api/healthz ok', healthz.status === 200 && healthz.json?.status === 'ok', healthz.body.slice(0, 80));
  const readyz = await request(`${BASE}/api/readyz`);
  const entReady = readyz.json?.checks?.enterprise || {};
  check('/api/readyz ready', readyz.status === 200 && readyz.json?.status === 'ready');
  check('enterprise data plane = firestore + configured', entReady.dataProvider === 'firestore' && entReady.dataPlaneConfigured === true, JSON.stringify(entReady));
  check('encryption = server-key', entReady.encryption === 'server-key');
  check('queue = firestore-durable-outbox', entReady.queue === 'firestore-durable-outbox');
  const unauth = await request(`${BASE}/api/enterprise/status`);
  check('zero-trust boundary: /api/enterprise/status without token → 401', unauth.status === 401, `status=${unauth.status}`);

  if (!API_KEY || !process.env.PROD_TEST_EMAIL || !process.env.PROD_TEST_PASSWORD) {
    console.log('\nPhase 1–3 SKIPPED: set VITE_FIREBASE_KEY, PROD_TEST_EMAIL, PROD_TEST_PASSWORD.');
    return finish();
  }

  // ---------------- Phase 1: real authentication + API walk ----------------
  section('Phase 1 — real authentication + enterprise API walk');
  const session = await firebaseSignIn(process.env.PROD_TEST_EMAIL, process.env.PROD_TEST_PASSWORD);
  check('Firebase sign-in issued a real ID token', !!session.idToken, session.email);
  const token = session.idToken;

  const status = await request(`${BASE}/api/enterprise/status`, { headers: api(token) });
  check('authenticated /enterprise/status', status.status === 200 && status.json?.enabled === true, status.body.slice(0, 80));

  const tenants = await request(`${BASE}/api/enterprise/tenants`, { headers: api(token) });
  check('tenant list resolves', tenants.status === 200 && Array.isArray(tenants.json?.tenants) && tenants.json.tenants.length > 0);
  const context = await request(`${BASE}/api/enterprise/context`, { method: 'POST', headers: api(token), body: {} });
  check('context resolves tenant + workspace + roles + permissions',
    context.status === 200 && context.json?.tenant?.id && context.json?.workspace?.id
    && Array.isArray(context.json?.context?.roles) && Array.isArray(context.json?.context?.permissions),
    `tenant=${context.json?.tenant?.displayName} roles=${(context.json?.context?.roles || []).join(',')}`);
  const tenantId = context.json?.tenant?.id;
  const workspaceId = context.json?.workspace?.id;
  const scoped = api(token, { 'X-Tenant-Id': tenantId, 'X-Workspace-Id': workspaceId });

  const walk = [
    ['workspaces', '/api/enterprise/workspaces?includeArchived=1', json => Array.isArray(json?.workspaces)],
    ['memberships', '/api/enterprise/memberships', json => Array.isArray(json?.memberships)],
    ['teams', '/api/enterprise/teams', json => Array.isArray(json?.teams)],
    ['roles-matrix', '/api/enterprise/roles-matrix', json => json?.roles && json.roles.TENANT_OWNER],
    ['configuration', '/api/enterprise/configuration', json => json?.configuration?.aiPolicy],
    ['usage ledger', '/api/enterprise/usage/ai?days=30', json => json?.usage && Array.isArray(json.usage.byDay)],
    ['usage events', '/api/enterprise/usage/ai/events', json => Array.isArray(json?.events)],
    ['audit trail', '/api/enterprise/audit?limit=25', json => Array.isArray(json?.events)],
    ['service accounts', '/api/enterprise/service-accounts', json => Array.isArray(json?.serviceAccounts)],
    ['queue status', '/api/enterprise/queue/status', json => json?.queue?.engine === 'firestore-durable-outbox'],
    ['data-plane status', '/api/enterprise/data-plane/status', json => json?.dataPlane?.configured === true],
    ['support grants', '/api/enterprise/support-grants', json => Array.isArray(json?.grants)],
    ['resources', '/api/enterprise/resources?resourceType=resume', json => Array.isArray(json?.resources)],
    ['observability', '/api/enterprise/observability/metrics', json => json?.metrics],
  ];
  for (const [name, path, validate] of walk) {
    const res = await request(`${BASE}${path}`, { headers: scoped });
    check(`GET ${name}`, res.status === 200 && validate(res.json), `status=${res.status}`);
  }

  // ---------------- Phase 2: disposable CRUD + audit evidence ----------------
  section('Phase 2 — disposable CRUD (prefixed zz-verify-, cleaned up)');
  const markerId = `zz-verify-${Date.now()}`;

  const wsCreate = await request(`${BASE}/api/enterprise/workspaces`, { method: 'POST', headers: scoped, body: { name: `${markerId}-ws` } });
  check('workspace create', wsCreate.status === 201 && wsCreate.json?.workspace?.id, `status=${wsCreate.status}`);
  const verifyWsId = wsCreate.json?.workspace?.id;

  if (verifyWsId) {
    const wsRename = await request(`${BASE}/api/enterprise/workspaces/${verifyWsId}`, { method: 'PATCH', headers: scoped, body: { name: `${markerId}-ws-renamed` } });
    check('workspace rename', wsRename.status === 200 && wsRename.json?.workspace?.name?.endsWith('renamed'));
    const wsArchive = await request(`${BASE}/api/enterprise/workspaces/${verifyWsId}/archive`, { method: 'POST', headers: scoped });
    check('workspace archive', wsArchive.status === 200);
    const wsRestore = await request(`${BASE}/api/enterprise/workspaces/${verifyWsId}/restore`, { method: 'POST', headers: scoped });
    check('workspace restore', wsRestore.status === 200);
  }

  const teamCreate = await request(`${BASE}/api/enterprise/teams`, { method: 'POST', headers: scoped, body: { name: `${markerId}-team`, workspaceId: verifyWsId || workspaceId } });
  check('team create', teamCreate.status === 201 && teamCreate.json?.team?.id);
  const verifyTeamId = teamCreate.json?.team?.id;
  if (verifyTeamId) {
    const teamRename = await request(`${BASE}/api/enterprise/teams/${verifyTeamId}`, { method: 'PATCH', headers: scoped, body: { name: `${markerId}-team-renamed` } });
    check('team rename', teamRename.status === 200);
  }

  const saCreate = await request(`${BASE}/api/enterprise/service-accounts`, { method: 'POST', headers: scoped, body: { displayName: `${markerId}-sa`, scopes: ['resource.read'] } });
  check('service account create returns one-time key', saCreate.status === 201 && typeof saCreate.json?.apiKey === 'string' && saCreate.json.apiKey.startsWith('rpa_'));
  const verifySaId = saCreate.json?.serviceAccount?.id;
  if (verifySaId) {
    const saRotate = await request(`${BASE}/api/enterprise/service-accounts/${verifySaId}/rotate`, { method: 'POST', headers: scoped });
    check('service account rotate issues a new key', saRotate.status === 200 && typeof saRotate.json?.apiKey === 'string');
  }

  const grant = await request(`${BASE}/api/enterprise/support-grants`, { method: 'POST', headers: scoped, body: { reason: `${markerId} live verification`, scopes: ['tenant.audit.read'], durationMinutes: 5, supportSubjectId: 'live-verifier' } });
  check('support grant issue', grant.status === 201 && grant.json?.grant?.id, `status=${grant.status}`);
  const grantId = grant.json?.grant?.id;

  // Audit must contain evidence of what we just did.
  const auditNow = await request(`${BASE}/api/enterprise/audit?limit=50`, { headers: scoped });
  const auditText = JSON.stringify(auditNow.json?.events || []);
  check('audit recorded workspace lifecycle', /WORKSPACE/.test(auditText));
  check('audit recorded service-account activity', /SERVICE_ACCOUNT/.test(auditText));
  check('audit server-side action filter works', await (async () => {
    const filtered = await request(`${BASE}/api/enterprise/audit?action=SERVICE_ACCOUNT&limit=20`, { headers: scoped });
    return filtered.status === 200 && (filtered.json?.events || []).every(event => String(event.action || '').includes('SERVICE_ACCOUNT'));
  })());

  // Cleanup — leave production the way we found it.
  section('Cleanup');
  if (grantId) check('support grant revoked', (await request(`${BASE}/api/enterprise/support-grants/${grantId}/revoke`, { method: 'POST', headers: scoped })).status === 200);
  if (verifySaId) check('service account revoked', [200, 204].includes((await request(`${BASE}/api/enterprise/service-accounts/${verifySaId}/revoke`, { method: 'POST', headers: scoped })).status));
  if (verifyTeamId) check('team archived', (await request(`${BASE}/api/enterprise/teams/${verifyTeamId}/archive`, { method: 'POST', headers: scoped })).status === 200);
  if (verifyWsId) check('workspace archived', (await request(`${BASE}/api/enterprise/workspaces/${verifyWsId}/archive`, { method: 'POST', headers: scoped })).status === 200);

  // ---------------- Phase 3: tenant isolation ----------------
  if (process.env.PROD_TEST_EMAIL_B && process.env.PROD_TEST_PASSWORD_B) {
    section('Phase 3 — tenant isolation (adversarial)');
    const sessionB = await firebaseSignIn(process.env.PROD_TEST_EMAIL_B, process.env.PROD_TEST_PASSWORD_B);
    const tokenB = sessionB.idToken;
    const forged = api(tokenB, { 'X-Tenant-Id': tenantId, 'X-Workspace-Id': workspaceId });
    for (const [name, path, method, body] of [
      ['read Tenant A members', '/api/enterprise/memberships', 'GET', null],
      ['read Tenant A audit', '/api/enterprise/audit', 'GET', null],
      ['read Tenant A workspaces', '/api/enterprise/workspaces', 'GET', null],
      ['read Tenant A resources', '/api/enterprise/resources', 'GET', null],
      ['create resource in Tenant A', '/api/enterprise/resources', 'POST', { resourceType: 'resume', payload: { title: 'attack' } }],
      ['read Tenant A service accounts', '/api/enterprise/service-accounts', 'GET', null],
    ]) {
      const res = await request(`${BASE}${path}`, { method, headers: forged, body });
      check(`isolation: B cannot ${name} (got ${res.status})`, [401, 403, 404].includes(res.status));
    }
  } else {
    console.log('\nPhase 3 SKIPPED: set PROD_TEST_EMAIL_B / PROD_TEST_PASSWORD_B for adversarial isolation checks.');
  }

  return finish();
}

function finish() {
  section('Phase 4 — latency profile');
  const sorted = timings.map(t => t.ms).sort((a, b) => a - b);
  const pct = q => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  console.log(`  requests=${sorted.length} p50=${pct(0.5)}ms p95=${pct(0.95)}ms max=${sorted[sorted.length - 1] || 0}ms`);
  const report = { base: BASE, at: new Date().toISOString(), results, latency: { count: sorted.length, p50: pct(0.5), p95: pct(0.95) } };
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/live-verification.json', JSON.stringify(report, null, 2));
  console.log(`\n${failures === 0 ? 'LIVE VERIFICATION: PASS' : `LIVE VERIFICATION: ${failures} FAILURE(S)`} — report: test-results/live-verification.json`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => { console.error('FATAL:', error.message); process.exit(1); });
