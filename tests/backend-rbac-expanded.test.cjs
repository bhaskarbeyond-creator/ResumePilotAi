/**
 * Wave 12 - Expanded RBAC coverage.
 * Tests every role against a broad sampling of discovered admin/enterprise/
 * employer endpoints, plus public, authenticated-user, and payment endpoints.
 * Reports (a) allow/deny matrix vs expected, (b) forbidden/uncovered path findings.
 */
const http = require('http');

const API_HOST = '127.0.0.1';
const API_PORT = 8080;

function request(method, path, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: API_HOST, port: API_PORT, method, path,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': data.length } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let parsed; try { parsed = JSON.parse(buf); } catch { parsed = buf; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', (e) => resolve({ status: 0, data: String(e) }));
    if (data) req.write(data);
    req.end();
  });
}

const ROLES = [
  { email: 'user@test.test', role: 'USER' },
  { email: 'employer@resumepilot.test', role: 'EMPLOYER' },
  { email: 'ent-member@resumepilot.test', role: 'ENTERPRISE_MEMBER' },
  { email: 'ent-admin@resumepilot.test', role: 'ENTERPRISE_ADMIN' },
  { email: 'support@resumepilot.test', role: 'SUPPORT' },
  { email: 'auditor@resumepilot.test', role: 'AUDITOR' },
  { email: 'admin@resumepilot.test', role: 'ADMIN' },
  { email: 'superadmin@resumepilot.test', role: 'SUPER_ADMIN' },
];

// Expected allow-per role. '*' = any authenticated, 'pub' = public.
// Permission map mirrors backend/security/auth.js PERMISSIONS.
const PERMS = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['users.read','users.create','users.update','users.delete','users.roles.manage',
          'tenants.read','tenants.write','tenants.manage','email.template.manage','email.logs.read',
          'system.config.read','system.config.write','payments.manage','payments.read',
          'notifications.send','ai.entitlements.manage','ai.usage.read','audit.read','security.read','tickets.manage'],
  AUDITOR: ['users.read','tenants.read','email.logs.read','system.config.read','payments.read','ai.usage.read','audit.read','security.read'],
  SUPPORT: ['users.read','email.logs.read','tenants.read','tickets.manage'],
  ENTERPRISE_ADMIN: ['tenant.members.manage','tenant.roles.manage','tenant.ai.policy','tenant.billing.view','tenant.audit.read','tenant.workspaces.manage','workspace.read','workspace.manage','workspace.members.manage'],
  ENTERPRISE_MEMBER: ['tenant.resumes.write','tenant.interviews.execute','tenant.ai.consume','workspace.read'],
  EMPLOYER: ['jobs.manage','applications.review','candidates.contact'],
  USER: ['resumes.manage','coverletters.manage','interviews.execute','subscription.self'],
};

function can(role, perm) {
  if (!role) return false;
  const p = PERMS[role];
  if (!p) return false;
  return p.includes('*') || p.includes(perm);
}

// Expected per-endpoint read permission
const ENDPOINTS = [
  // Public
  { method: 'GET',  path: '/api/health', allow: 'pub' },
  { method: 'GET',  path: '/api/healthz', allow: 'pub' },
  { method: 'GET',  path: '/api/readyz', allow: 'pub' },
  { method: 'GET',  path: '/healthz', allow: 'pub' },
  { method: 'GET',  path: '/readyz', allow: 'pub' },
  { method: 'POST', path: '/api/contact', allow: 'pub', body: { email: 'a@b.c', message: 'hi' } },
  { method: 'GET',  path: '/api/platform/public-config', allow: 'pub' },
  { method: 'GET',  path: '/api/public/featured-companies', allow: 'pub' },
  { method: 'GET',  path: '/api/public/custom-pages/home', allow: 'pub' },
  { method: 'GET',  path: '/llms.txt', allow: 'pub' },
  { method: 'GET',  path: '/api/service-availability', allow: 'pub' },
  { method: 'GET',  path: '/api/rtl-font-config', allow: '*' },
  { method: 'POST', path: '/api/auth/preview-login', allow: 'pub', body: { email: 'user@test.test', password: 'password123' } },
  // Auth-protected (any logged in user)
  { method: 'GET',  path: '/api/resumes', allow: '*' },
  { method: 'GET',  path: '/api/covers', allow: '*' },
  { method: 'GET',  path: '/api/subscription/preferences', allow: '*' },
  // Admin read endpoints — map to permissions
  { method: 'GET', path: '/api/admin/users', perm: 'users.read' },
  { method: 'GET', path: '/api/admin/audit-logs', perm: 'audit.read' },
  { method: 'GET', path: '/api/admin/security', perm: 'security.read' },
  { method: 'GET', path: '/api/admin/health-summary', perm: 'security.read' },
  { method: 'GET', path: '/api/admin/tenants', perm: 'tenants.read' },
  { method: 'GET', path: '/api/admin/jobs', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/companies', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/blog/posts', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/blog/categories', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/coupons', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/ads', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/pages', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/reviews', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/employer-applications', perm: 'users.read' },
  { method: 'GET', path: '/api/admin/ai-settings', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/ai/quota-stats', perm: 'ai.usage.read' },
  { method: 'POST', path: '/api/admin/ai/quota-limits', perm: '*', body: {} },
  { method: 'GET', path: '/api/admin/payment-settings', perm: 'payments.read' },
  { method: 'GET', path: '/api/admin/payment-orders', perm: 'payments.read' },
  { method: 'GET', path: '/api/admin/settings', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/system-health-settings', perm: 'security.read' },
  { method: 'GET', path: '/api/admin/website-meta', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/twilio-settings', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/trusted-by', perm: 'system.config.read' },
  { method: 'GET', path: '/api/admin/firebase-service-account', perm: 'secrets.manage' },
  { method: 'GET', path: '/api/email/logs', perm: 'email.logs.read' },
  { method: 'GET', path: '/api/platform/health-indicator', perm: 'security.read' },
  { method: 'GET', path: '/api/admin/support/tickets', perm: 'tickets.manage' },
  { method: 'GET', path: '/api/admin/subscriptions', perm: 'payments.read' },
  { method: 'GET', path: '/api/admin/ai/entitlements', perm: 'ai.usage.read' },
  { method: 'GET', path: '/api/email/admin/deliverability', perm: 'email.logs.read' },
  { method: 'GET', path: '/api/email/admin/circuit-breaker-status', perm: 'email.logs.read' },
  { method: 'GET', path: '/api/email/admin/settings', perm: 'system.config.read' },
  { method: 'GET', path: '/api/email/admin/custom-templates', perm: 'email.template.manage' },
  { method: 'GET',  path: '/api/health/databases', allow: 'pub' },
];

async function login(email, password = 'password123') {
  const res = await request('POST', '/api/auth/preview-login', { body: { email, password } });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.data).slice(0,200)}`);
  }
  return { token: res.data.token, uid: res.data.uid, role: res.data.role };
}

(async () => {
  console.log('# Wave 12 — Expanded RBAC sweep\n');
  // Mint tokens
  const tokens = {};
  for (const r of ROLES) {
    try { tokens[r.role] = await login(r.email); }
    catch (e) { console.log(`login FAIL ${r.role}: ${e.message}`); process.exit(1); }
  }

  let total = 0, pass = 0, fail = 0;
  const failures = [];

  // Test unauthenticated
  for (const ep of ENDPOINTS) {
    total++;
    const res = await request(ep.method, ep.path, { body: ep.body });
    const isAuthzFailure = [401, 403].includes(res.status);
    const allowed = !isAuthzFailure;
    const shouldAllow = ep.allow === 'pub';
    if (allowed === shouldAllow) pass++;
    else {
      fail++;
      failures.push(`UNAUTH ${ep.method} ${ep.path} → ${res.status} expected ${shouldAllow?'allow':'deny'}`);
    }
  }

  // Test each role
  for (const r of ROLES) {
    for (const ep of ENDPOINTS) {
      total++;
      let shouldAllow;
      if (ep.allow === 'pub') shouldAllow = true;
      else if (ep.allow === '*') shouldAllow = true; // any authenticated
      else if (ep.perm) shouldAllow = can(r.role, ep.perm);
      else shouldAllow = false;
      const res = await request(ep.method, ep.path, { token: tokens[r.role].token, body: ep.body });
      const isAuthzFailure = [401, 403].includes(res.status);
      const allowed = !isAuthzFailure;
      if (allowed === shouldAllow) pass++;
      else {
        fail++;
        failures.push(`${r.role} ${ep.method} ${ep.path} → ${res.status} (${res.data?.error?.code || res.data?.code || '?'}) expected ${shouldAllow?'ALLOW':'DENY'}`);
      }
    }
  }

  console.log(`Total: ${total}, Pass: ${pass}, Fail: ${fail}\n`);
  if (failures.length) {
    console.log('FAILURES:');
    for (const f of failures) console.log('  ' + f);
  } else {
    console.log('ALL PASS');
  }
  process.exit(fail > 0 ? 1 : 0);
})();
