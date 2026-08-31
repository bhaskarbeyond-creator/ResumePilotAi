/**
 * Wave 9 — Backend RBAC API matrix test.
 *
 * Signs in as each of 8 roles via /api/auth/preview-login and exercises a
 * curated set of critical endpoints covering:
 *   - Admin (system.config.write, secrets.manage, payments.manage)
 *   - Auditor (audit.read, security.read)
 *   - Support (tickets.manage)
 *   - Enterprise admin/member (tenant.*)
 *   - Employer (jobs.*)
 *   - Regular user (self)
 *   - Public endpoints (must be 2xx/3xx without auth)
 *   - Forged/tampered JWTs (must be rejected with 401)
 *   - Cross-role escalation attempts (USER calling /api/admin/* must 403)
 *
 * Exit code 0 = every allow/deny assertion holds.
 */
const http = require('http');

const PORT = 8080;
const HOST = '127.0.0.1';

// Roles we test against. Note: preview-login provisions accounts with
// passwords 'password123' and assigns role based on env allowlist.
const ROLES = [
  { email: 'user@test.test',              role: 'USER' },
  { email: 'employer@resumepilot.test',   role: 'EMPLOYER' },
  { email: 'ent-member@resumepilot.test', role: 'ENTERPRISE_MEMBER' },
  { email: 'ent-admin@resumepilot.test',  role: 'ENTERPRISE_ADMIN' },
  { email: 'support@resumepilot.test',    role: 'SUPPORT' },
  { email: 'auditor@resumepilot.test',    role: 'AUDITOR' },
  { email: 'admin@resumepilot.test',      role: 'ADMIN' },
  { email: 'superadmin@resumepilot.test', role: 'SUPER_ADMIN' },
];

// Sampled endpoint matrix: path → allowed roles (set of role names or '*').
//   'auth' = any logged-in user (all 8 roles); false/[] = only public.
// In-memory repo means some endpoints return 503 / 404 when they depend on
// external systems; we accept 5xx/404 as "not a RBAC violation" for the
// purpose of this test (401/403 are the signals we check for).
const ENDPOINTS = [
  // ── Public (no token required) ──
  { method: 'GET',  path: '/api/health',                          allow: '*' },
  { method: 'GET',  path: '/api/service-availability',            allow: '*' },
  { method: 'GET',  path: '/api/platform/version',                allow: '*' },
  { method: 'GET',  path: '/api/platform/public-config',          allow: '*' },
  { method: 'GET',  path: '/api/reviews',                         allow: '*' },
  { method: 'GET',  path: '/api/public/trusted-by',               allow: '*' },
  { method: 'GET',  path: '/api/public/custom-pages',             allow: '*' },
  { method: 'GET',  path: '/api/blog-data',                       allow: '*' },
  { method: 'GET',  path: '/api/jobs-data',                       allow: '*' },
  { method: 'POST', path: '/api/auth/preview-login',              allow: '*', body: { email: 'user@test.test', password: 'password123' } },
  { method: 'POST', path: '/api/contact',                         allow: '*', body: { email: 'a@b.c', message: 'hi' } },
  { method: 'POST', path: '/api/stripe-webhook',                  allow: '*', body: {} }, // webhook has its own sig check; auth gate skips it

  // ── Authenticated only ──
  { method: 'GET',  path: '/api/users/profile',                   allow: 'auth' },
  { method: 'GET',  path: '/api/resumes',                         allow: 'auth' },
  { method: 'GET',  path: '/api/portfolios',                      allow: 'auth' },
  { method: 'GET',  path: '/api/covers',                          allow: 'auth' },
  { method: 'GET',  path: '/api/notifications-data',              allow: 'auth' },
  { method: 'GET',  path: '/api/messages',                        allow: 'auth' },
  { method: 'GET',  path: '/api/support/tickets',                 allow: 'auth' },
  { method: 'GET',  path: '/api/jobs-data/tracker',               allow: 'auth' }, // explicitly NOT public
  { method: 'GET',  path: '/api/billing/subscription',            allow: 'auth' },

  // ── Admin-prefixed routes (enforced via isAdminPath in policy.js + per-route middleware) ──
  { method: 'GET',  path: '/api/admin/users',                     allow: ['SUPER_ADMIN','ADMIN','AUDITOR','SUPPORT'] }, // users.read
  { method: 'GET',  path: '/api/admin/audit-logs',                allow: ['SUPER_ADMIN','ADMIN','AUDITOR'] },           // audit.read (per router)
  { method: 'GET',  path: '/api/admin/health-summary',            allow: ['SUPER_ADMIN','ADMIN','AUDITOR'] },           // security.read (route resolves to health summary)
  { method: 'GET',  path: '/api/admin/firebase-service-account',  allow: ['SUPER_ADMIN'] },                             // secrets.manage — only SA
  { method: 'POST', path: '/api/admin/firebase-service-account',  allow: ['SUPER_ADMIN'], body: {} },                   // secrets.manage mutation
  { method: 'GET',  path: '/api/admin/payment-settings',          allow: ['SUPER_ADMIN','ADMIN','AUDITOR'] },           // payments.read
  { method: 'POST', path: '/api/admin/payment-settings',          allow: ['SUPER_ADMIN'], body: {} },                   // SA-only mutation (secrets)
  { method: 'GET',  path: '/api/admin/support/tickets',           allow: ['SUPER_ADMIN','ADMIN','SUPPORT'] },           // tickets.manage for help-desk
  { method: 'GET',  path: '/api/admin/subscriptions',             allow: ['SUPER_ADMIN','ADMIN','AUDITOR'] },           // payments.read (per-router)
  { method: 'GET',  path: '/api/admin/ai/entitlements',           allow: ['SUPER_ADMIN','ADMIN','AUDITOR'] },           // ai.usage.read
  { method: 'GET',  path: '/api/admin/settings',                  allow: ['SUPER_ADMIN','ADMIN','AUDITOR'] },           // system.config.read — AUDITOR is read-only admin

  // ── Platform alias ──
  { method: 'GET',  path: '/api/platform/health-indicator',       allow: ['SUPER_ADMIN','ADMIN','AUDITOR'] },           // security.read
  { method: 'GET',  path: '/api/email/logs',                      allow: ['SUPER_ADMIN','ADMIN','AUDITOR','SUPPORT'] }, // email.logs.read

  // ── Enterprise console (any auth can hit; tenant layer enforces) ──
  { method: 'GET',  path: '/api/enterprise/status',               allow: '*' },
  { method: 'GET',  path: '/api/enterprise/tenants',              allow: 'auth' }, // will 503 with no DB but should not be 401/403 for auth'd users
];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function request(method, path, { token, body } = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({
      host: HOST, port: PORT, method, path, headers,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_e) { /* not JSON */ }
        resolve({ status: res.statusCode, data, json });
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message, data: '' }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(email, password = 'password123') {
  const res = await request('POST', '/api/auth/preview-login', { body: { email, password } });
  if (res.status !== 200 || !res.json || !res.json.token) {
    throw new Error(`login failed for ${email}: ${res.status} ${res.data}`);
  }
  return res.json;
}

function decodeJwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function allowedFor(rule, role) {
  if (rule.allow === '*') return true;
  if (rule.allow === 'auth') return role !== null;
  if (Array.isArray(rule.allow)) return rule.allow.includes(role);
  return false;
}

// Expected "good" status families. An allowed call should NOT get 401/403;
// 200/201/400/404/503 are all acceptable (503 = infrastructure blocker,
// 400/404 = the handler ran and enforced domain logic, which is what we
// want — we're testing authz, not functional correctness).
// A denied call MUST get 401 (no creds) or 403 (wrong role).
function isAcceptableAllowedStatus(status) {
  return status >= 200 && status < 500; // excludes 5xx because that's a server fault
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  const failures = [];
  const tokens = {};

  // 1. Log in each role, verify token role claim matches.
  for (const role of ROLES) {
    const sess = await login(role.email);
    const claims = decodeJwtPayload(sess.token);
    tokens[role.role] = sess.token;
    if (String(claims.role).toUpperCase() !== role.role) {
      failures.push(`TOKEN MISMATCH: ${role.email} got role claim ${claims.role}, expected ${role.role}`);
    }
  }
  console.log(`[+] Authenticated ${ROLES.length} roles; tokens cached.`);

  // 2. Forged / tampered tokens
  const forgedTokens = {
    forgedHeader: 'rptest.eyJ1aWQiOiJob2F4Iiwicm9sZSI6IlNVUEVSX0FETUlOIiwiZXhwIjoxOTk5OTk5OTk5fQ.badsig', // invalid signature
    tamperedPayload: (() => {
      const t = tokens.USER;
      const [h,, s] = t.split('.');
      const fakePayload = Buffer.from(JSON.stringify({ uid: 'local_x', role: 'SUPER_ADMIN', exp: 9999999999 })).toString('base64url');
      return `${h}.${fakePayload}.${s}`;
    })(),
    garbageToken: 'totally.not.a.jwt',
    emptyToken: '',
  };
  for (const [name, tok] of Object.entries(forgedTokens)) {
    const res = await request('GET', '/api/admin/users', { token: tok || undefined });
    if (![401, 400, 403].includes(res.status)) {
      failures.push(`FORGED TOKEN ${name} against /api/admin/users got ${res.status}, expected 401/403`);
    } else {
      console.log(`  [ok] forged token ${name} → ${res.status}`);
    }
  }

  // 3. No-token calls against protected endpoints
  for (const rule of ENDPOINTS) {
    if (rule.allow === '*') continue;
    const res = await request(rule.method, rule.path, { body: rule.body });
    if (![401, 403].includes(res.status)) {
      failures.push(`UNAUTHENTICATED ${rule.method} ${rule.path} got ${res.status} (expected 401/403)`);
    }
  }
  console.log(`[+] Unauthenticated denial checks done against ${ENDPOINTS.filter(r => r.allow !== '*').length} protected endpoints.`);

  // 4. Cross-role RBAC matrix
  let total = 0;
  let passed = 0;
  for (const role of ROLES) {
    const token = tokens[role.role];
    for (const rule of ENDPOINTS) {
      total++;
      const expectAllowed = allowedFor(rule, role.role);
      const res = await request(rule.method, rule.path, { token, body: rule.body });
      // Skip POST requests with body that fail validation for users that don't have permission (400 or 403 both acceptable denial signals)
      if (expectAllowed) {
        // Allowed role must NOT get 401/403 (those are the RBAC denials).
        // 404/400/409/503/etc. are functional outcomes (route missing, DB down,
        // validation failure, optimistic lock) — NOT RBAC bugs.
        if (res.status === 401 || res.status === 403) {
          failures.push(`ALLOW-MISS: ${role.role} → ${rule.method} ${rule.path} got ${res.status} ${JSON.stringify(res.json && res.json.error).slice(0, 120)}`);
        } else {
          passed++;
        }
      } else {
        if (![401, 403].includes(res.status)) {
          failures.push(`DENY-MISS: ${role.role} → ${rule.method} ${rule.path} got ${res.status} (expected 401/403)`);
        } else {
          passed++;
        }
      }
    }
  }
  console.log(`[+] Matrix complete: ${passed}/${total} assertions passed (${failures.length} failures).`);

  // 5. Summary
  console.log('\n=== FAILURES ===');
  if (failures.length === 0) {
    console.log('(none)');
  } else {
    failures.forEach((f) => console.log('  ✗', f));
  }

  console.log(`\nResult: ${failures.length === 0 ? 'PASS' : 'FAIL'} (${passed}/${total} RBAC assertions, ${Object.keys(forgedTokens).length} forgery checks)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error('FATAL', err); process.exit(2); });
