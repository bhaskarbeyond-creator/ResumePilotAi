import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.NODE_ENV = 'test';
process.env.REQUIRE_RECENT_AUTH_IN_TEST = 'true';
process.env.SUPER_ADMIN_MFA_REQUIRED = 'true';

const request = require('../backend/node_modules/supertest');
const { setTokenVerifierForTests } = require('../backend/security/auth.js');
const app = require('../backend/index.js');

// Setup mock test verifier
const now = Math.floor(Date.now() / 1000);

const testRoles = {
  SUPER_ADMIN: {
    uid: 'uid-superadmin',
    email: 'superadmin@example.com',
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
    permissions: ['*'],
    auth_time: now,
    sign_in_second_factor: 'totp',
    firebase: { sign_in_second_factor: 'totp' },
  },
  ADMIN: {
    uid: 'uid-admin',
    email: 'admin@example.com',
    email_verified: true,
    role: 'ADMIN',
    permissions: [
      'users.read', 'users.create', 'users.update', 'users.delete', 'users.roles.manage',
      'tenants.read', 'tenants.write', 'tenants.manage',
      'email.template.manage', 'email.logs.read',
      'system.config.read', 'system.config.write',
      'payments.manage', 'payments.read',
      'notifications.send',
      'ai.entitlements.manage', 'ai.usage.read',
      'audit.read', 'security.read',
      'tickets.manage'
    ],
    auth_time: now,
    sign_in_second_factor: 'totp',
  },
  SUPPORT: {
    uid: 'uid-support',
    email: 'support@example.com',
    email_verified: true,
    role: 'SUPPORT',
    permissions: ['users.read', 'email.logs.read', 'tenants.read', 'tickets.manage'],
    auth_time: now,
  },
  AUDITOR: {
    uid: 'uid-auditor',
    email: 'auditor@example.com',
    email_verified: true,
    role: 'AUDITOR',
    permissions: [
      'users.read', 'tenants.read', 'email.logs.read', 'system.config.read',
      'payments.read', 'ai.usage.read', 'audit.read', 'security.read'
    ],
    auth_time: now,
  },
  ENTERPRISE_OWNER: {
    uid: 'uid-ent-owner',
    email: 'owner@entcorp.com',
    email_verified: true,
    role: 'ENTERPRISE_OWNER',
    permissions: [
      'tenant.members.manage', 'tenant.roles.manage', 'tenant.ai.policy',
      'tenant.billing.view', 'tenant.audit.read', 'tenant.workspaces.manage',
      'tenant.commercials.manage', 'workspace.manage', 'workspace.members.manage',
      'workspace.read', 'tenant.resumes.write', 'tenant.interviews.execute', 'tenant.ai.consume'
    ],
    auth_time: now,
  },
  ENTERPRISE_ADMIN: {
    uid: 'uid-ent-admin',
    email: 'admin@entcorp.com',
    email_verified: true,
    role: 'ENTERPRISE_ADMIN',
    permissions: [
      'tenant.members.manage', 'tenant.roles.manage', 'tenant.ai.policy',
      'tenant.billing.view', 'tenant.audit.read', 'tenant.workspaces.manage',
      'workspace.manage', 'workspace.members.manage', 'workspace.read',
      'tenant.resumes.write', 'tenant.interviews.execute', 'tenant.ai.consume'
    ],
    auth_time: now,
  },
  ENTERPRISE_MANAGER: {
    uid: 'uid-ent-mgr',
    email: 'manager@entcorp.com',
    email_verified: true,
    role: 'ENTERPRISE_MANAGER',
    permissions: [
      'tenant.workspaces.manage', 'workspace.manage', 'workspace.members.manage',
      'workspace.read', 'tenant.resumes.write', 'tenant.interviews.execute', 'tenant.ai.consume'
    ],
    auth_time: now,
  },
  ENTERPRISE_MEMBER: {
    uid: 'uid-ent-member',
    email: 'member@entcorp.com',
    email_verified: true,
    role: 'ENTERPRISE_MEMBER',
    permissions: [
      'workspace.read', 'tenant.resumes.write', 'tenant.interviews.execute', 'tenant.ai.consume'
    ],
    auth_time: now,
  },
  ENTERPRISE_VIEWER: {
    uid: 'uid-ent-viewer',
    email: 'viewer@entcorp.com',
    email_verified: true,
    role: 'ENTERPRISE_VIEWER',
    permissions: ['workspace.read', 'tenant.audit.read'],
    auth_time: now,
  },
  USER: {
    uid: 'uid-regular-user',
    email: 'candidate@example.com',
    email_verified: true,
    role: 'USER',
    permissions: ['resumes.manage', 'coverletters.manage', 'interviews.execute', 'subscription.self'],
    auth_time: now,
  },
  UNAUTHENTICATED: null,
};

setTokenVerifierForTests(async (token) => {
  if (testRoles[token]) {
    return testRoles[token];
  }
  throw new Error('Invalid test token');
});

const bearer = (roleKey) => ({ Authorization: `Bearer ${roleKey}` });

// Comprehensive catalog of API endpoints to test across roles
const endpoints = [
  // Platform & Command Center
  { name: 'Platform Version', method: 'get', path: '/api/platform/version', expected: { UNAUTHENTICATED: 200, USER: 200, SUPER_ADMIN: 200 } },
  { name: 'Platform Healthz', method: 'get', path: '/api/healthz', expected: { UNAUTHENTICATED: 200, USER: 200, SUPER_ADMIN: 200 } },
  { name: 'Command Center', method: 'get', path: '/api/platform/command-center', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Platform Health (Admin)', method: 'get', path: '/api/platform/health', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Platform Search', method: 'get', path: '/api/platform/search?q=test', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Platform Announcements GET', method: 'get', path: '/api/platform/announcements', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Platform Announcements POST (SuperAdmin only)', method: 'post', path: '/api/platform/announcements', body: { title: 'Test', message: 'Test Msg' }, expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 403, ADMIN: 403, SUPER_ADMIN: 200 } },
  
  // Security & Audit
  { name: 'Admin Audit Logs', method: 'get', path: '/api/admin/audit-logs', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Security Audit Logs', method: 'get', path: '/api/admin/security/events', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  
  // User Management
  { name: 'Users List', method: 'get', path: '/api/admin/users', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 200, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'User Mutation (PATCH role)', method: 'patch', path: '/api/admin/users/test-uid-target', body: { role: 'ADMIN' }, expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 403, ADMIN: 403, SUPER_ADMIN: 400 } },
  
  // AI Settings & Secrets
  { name: 'AI Settings GET', method: 'get', path: '/api/admin/ai-settings', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'AI Settings POST (SuperAdmin only)', method: 'post', path: '/api/admin/ai-settings', body: { provider: 'nvidia', model: 'meta/llama-3.2-11b-vision-instruct' }, expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 403, ADMIN: 403, SUPER_ADMIN: 200 } },
  { name: 'AI Test Provider (SuperAdmin only)', method: 'post', path: '/api/admin/ai/test-provider', body: { provider: 'nvidia', apiKey: 'test' }, expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 403, ADMIN: 403, SUPER_ADMIN: 200 } },
  
  // Payment Settings & Secrets
  { name: 'Payment Settings GET', method: 'get', path: '/api/admin/payment-settings', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Payment Orders List', method: 'get', path: '/api/admin/payment-orders', expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  
  // Enterprise Tenants
  { name: 'Enterprise Tenants GET', method: 'get', path: '/api/enterprise/tenants', expected: { UNAUTHENTICATED: 401, USER: 200, SUPPORT: 200, AUDITOR: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Enterprise Tenant Provision (Platform provisioner)', method: 'post', path: '/api/enterprise/tenants', body: { displayName: 'Test Corp', slug: 'test-corp-xyz' }, expected: { UNAUTHENTICATED: 401, USER: 403, SUPPORT: 403, AUDITOR: 403, ENTERPRISE_MEMBER: 403, ADMIN: 201, SUPER_ADMIN: 201 } },
  
  // Help Desk & Support
  { name: 'Support Tickets (Admin/Support)', method: 'get', path: '/api/admin/support/tickets', expected: { UNAUTHENTICATED: 401, USER: 403, AUDITOR: 403, SUPPORT: 200, ADMIN: 200, SUPER_ADMIN: 200 } },
  { name: 'Support Tickets User (Candidate)', method: 'get', path: '/api/support/tickets', expected: { UNAUTHENTICATED: 401, USER: 200, SUPER_ADMIN: 200 } },
];

async function runAudit() {
  console.log('=== STARTING COMPLETE API AUTHORIZATION AUDIT ===');
  const results = [];
  let failures = 0;

  for (const ep of endpoints) {
    console.log(`\nTesting: [${ep.method.toUpperCase()}] ${ep.name} (${ep.path})`);
    for (const [roleKey, rolePayload] of Object.entries(testRoles)) {
      let req = request(app)[ep.method](ep.path);
      if (rolePayload) {
        req = req.set(bearer(roleKey));
      }
      if (ep.body) {
        req = req.send(ep.body);
      }

      const res = await req;
      const status = res.status;
      const expectedStatus = ep.expected[roleKey];

      let match = true;
      if (expectedStatus !== undefined) {
        if (Array.isArray(expectedStatus)) {
          match = expectedStatus.includes(status);
        } else if (expectedStatus === 200) {
          match = [200, 201, 503].includes(status);
        } else if (expectedStatus === 201) {
          match = [201, 409, 503].includes(status);
        } else if (expectedStatus === 400) {
          match = [400, 403].includes(status);
        } else {
          match = status === expectedStatus;
        }
      }

      if (!match) {
        console.error(`  ❌ [${roleKey}] Got ${status}, Expected ${expectedStatus} -> FAILED!`);
        failures++;
      } else {
        console.log(`  ✓ [${roleKey}] -> ${status}`);
      }

      results.push({
        endpoint: ep.name,
        path: ep.path,
        method: ep.method,
        role: roleKey,
        status,
        expectedStatus,
        match,
      });
    }
  }

  console.log(`\n==============================================`);
  console.log(`AUDIT COMPLETE: ${results.length} checks run. Failures: ${failures}`);
  console.log(`==============================================\n`);
  process.exit(failures > 0 ? 1 : 0);
}

runAudit().catch(err => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
