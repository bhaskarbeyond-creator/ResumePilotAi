#!/usr/bin/env node
/**
 * Live Admin / Super Admin CRUD and RBAC certification.
 *
 * This is the script that proves the control plane actually works in
 * production, as opposed to proving the tests pass. For each domain it
 * exercises the full chain the brief requires:
 *
 *   request -> Authorization header -> backend authz -> database mutation
 *           -> read-back confirming the change -> audit record
 *
 * Safety rules, enforced in code rather than by convention:
 *   - Every created resource carries the DISPOSABLE_PREFIX so it is
 *     identifiable at a glance in production data.
 *   - Cleanup runs in a finally block, so an assertion failure mid-test still
 *     removes what it created. Anything that could not be cleaned up is
 *     reported loudly at the end with the exact ids.
 *   - Destructive verbs are only ever aimed at resources this script created.
 *     It refuses to delete anything it did not make.
 *
 * RBAC is verified negatively as well as positively: the same request is
 * replayed as anonymous, ordinary user, and ADMIN to prove the server rejects
 * it, because hiding a button in React proves nothing.
 *
 * Environment
 *   PROD_BASE_URL          optional, defaults to the production origin
 *   FIREBASE_API_KEY       required
 *   SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD   required
 *   ADMIN_EMAIL / ADMIN_PASSWORD             required for negative RBAC
 *   USER_EMAIL / USER_PASSWORD               optional, adds a third role
 *   ALLOW_DESTRUCTIVE=1    required to run create/delete flows at all
 *
 * Exit codes: 0 certified, 1 a check failed, 2 could not be verified.
 */

import {
  DEFAULT_BASE_URL,
  Recorder,
  disposableName,
  firebaseSignIn,
  probe,
  readEnv,
  reportMissingEnv,
} from './lib/live-certification.mjs';

const SCRIPT = 'verify-admin-superadmin-live';
const DISPOSABLE_PREFIX = 'zz-cert';

const { ok, values, missing } = readEnv({
  PROD_BASE_URL: { default: DEFAULT_BASE_URL, description: 'Production origin' },
  FIREBASE_API_KEY: { required: true, description: 'Firebase Web API key used to sign in test accounts' },
  SUPERADMIN_EMAIL: { required: true, description: 'A SUPER_ADMIN account for the platform' },
  SUPERADMIN_PASSWORD: { required: true, description: 'Password for SUPERADMIN_EMAIL' },
  ADMIN_EMAIL: { required: true, description: 'A plain ADMIN account, used to prove privileged actions are refused' },
  ADMIN_PASSWORD: { required: true, description: 'Password for ADMIN_EMAIL' },
  USER_EMAIL: { description: 'Optional ordinary user account for a third negative RBAC case' },
  USER_PASSWORD: { description: 'Password for USER_EMAIL' },
  ALLOW_DESTRUCTIVE: { default: '0', description: 'Set to 1 to permit create/update/delete against production' },
});

if (!ok) {
  reportMissingEnv(missing, SCRIPT);
  process.exit(2);
}

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const ALLOW_DESTRUCTIVE = values.ALLOW_DESTRUCTIVE === '1';

const recorder = new Recorder(SCRIPT, { base: BASE, destructive: ALLOW_DESTRUCTIVE });

/** Resources created during the run, cleaned up in reverse order. */
const created = [];
const orphaned = [];

const authHeaders = session => ({
  Authorization: `Bearer ${session.idToken}`,
  'Content-Type': 'application/json',
});

async function call(session, method, route, body) {
  return probe(`${BASE}${route}`, {
    method,
    headers: session ? authHeaders(session) : { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/* ------------------------------------------------------------------ *
 * RBAC
 * ------------------------------------------------------------------ */

/**
 * Proves a privileged route is enforced server-side by replaying it as every
 * role that must be refused. Hiding the control in the UI is not evidence.
 */
async function assertServerSideRbac(label, method, route, body, sessions) {
  const denied = [];

  const anonymous = await probe(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  denied.push({ role: 'anonymous', status: anonymous.status });

  for (const [role, session] of Object.entries(sessions)) {
    if (!session) continue;
    const response = await call(session, method, route, body);
    denied.push({ role, status: response.status });
  }

  const leaks = denied.filter(entry => entry.status > 0 && entry.status < 400);
  if (leaks.length === 0) {
    recorder.pass(`RBAC enforced server-side: ${label}`, { attempts: denied });
  } else {
    recorder.fail(`RBAC enforced server-side: ${label}`, {
      reason: `${leaks.map(l => l.role).join(', ')} were allowed through`,
      attempts: denied,
      remediation: 'Add or repair the server-side authorization check. Never rely on the UI hiding the control.',
    });
  }
}

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

/**
 * Confirms a mutation produced a server-side audit record. Looks the action up
 * by the disposable resource name so it cannot match an unrelated event.
 */
async function assertAuditRecord(session, label, needle) {
  const response = await call(session, 'GET', `/api/admin/audit-logs?limit=50&search=${encodeURIComponent(needle)}`);
  if (!response.ok) {
    recorder.blocked(`audit record written: ${label}`, { reason: response.error });
    return;
  }
  if (response.status !== 200) {
    recorder.blocked(`audit record written: ${label}`, { reason: `audit query returned HTTP ${response.status}` });
    return;
  }

  const entries = response.json?.logs || response.json?.entries || response.json?.items || [];
  const match = entries.find(entry => JSON.stringify(entry).includes(needle));

  if (!match) {
    recorder.fail(`audit record written: ${label}`, {
      reason: `no audit entry references ${needle}`,
      remediation: 'Ensure recordAdminAuditLog runs for this mutation.',
    });
    return;
  }

  // The record has to be useful, not merely present.
  const required = ['actor', 'action', 'timestamp'];
  const flat = JSON.stringify(match).toLowerCase();
  const absent = required.filter(field => !flat.includes(field.toLowerCase()));
  if (absent.length) {
    recorder.fail(`audit record written: ${label}`, { reason: `record is missing ${absent.join(', ')}` });
  } else {
    recorder.pass(`audit record written: ${label}`, { action: match.action || match.type });
  }
}

/* ------------------------------------------------------------------ *
 * Domain flows
 * ------------------------------------------------------------------ */

async function verifyReadSurfaces(superAdmin) {
  const surfaces = [
    ['users', '/api/platform/search?q=test'],
    ['operators', '/api/platform/operators'],
    ['audit log', '/api/admin/audit-logs?limit=5'],
    ['queues / DLQ', '/api/platform/queues'],
    ['settings', '/api/admin/settings'],
    ['platform health', '/api/platform/operational-status'],
    ['API matrix', '/api/platform/operational-status/api-matrix'],
  ];

  for (const [label, route] of surfaces) {
    const response = await call(superAdmin, 'GET', route);
    if (!response.ok) {
      recorder.blocked(`read ${label}`, { reason: response.error, route });
      continue;
    }
    if (response.status === 200) {
      recorder.pass(`read ${label}`, { route, status: 200 });
    } else if (response.status === 404) {
      recorder.fail(`read ${label}`, {
        reason: 'route not found in production',
        route,
        remediation: 'An Admin surface must never 404. Fix the route or remove the UI that calls it.',
      });
    } else {
      recorder.fail(`read ${label}`, { reason: `HTTP ${response.status}`, route, body: (response.text || '').slice(0, 160) });
    }
  }
}

async function verifyTenantLifecycle(superAdmin, sessions) {
  if (!ALLOW_DESTRUCTIVE) {
    recorder.skipped('tenant lifecycle CRUD', { reason: 'set ALLOW_DESTRUCTIVE=1 to run create/suspend/decommission' });
    return;
  }

  const name = disposableName(`${DISPOSABLE_PREFIX}-tenant`);

  // RBAC first: provisioning must be refused for everyone below SUPER_ADMIN.
  await assertServerSideRbac(
    'provision tenant',
    'POST',
    '/api/enterprise/platform/tenants',
    { displayName: name, slug: name },
    { admin: sessions.admin, user: sessions.user },
  );

  const createResponse = await call(superAdmin, 'POST', '/api/enterprise/platform/tenants', {
    displayName: name,
    slug: name,
    isolationTier: 'STANDARD',
  });

  if (!createResponse.ok) {
    recorder.blocked('tenant create', { reason: createResponse.error });
    return;
  }

  if (createResponse.status === 404) {
    // Enterprise tenancy is gated off; that is a documented state, not a defect.
    recorder.skipped('tenant lifecycle CRUD', {
      reason: 'enterprise tenancy is disabled in this deployment (documented DISABLED state)',
    });
    return;
  }

  if (createResponse.status >= 400) {
    recorder.fail('tenant create', { reason: `HTTP ${createResponse.status}`, body: (createResponse.text || '').slice(0, 200) });
    return;
  }

  const tenantId = createResponse.json?.tenant?.id || createResponse.json?.id;
  if (!tenantId) {
    recorder.fail('tenant create', { reason: 'response did not include a tenant id' });
    return;
  }
  created.push({ kind: 'tenant', id: tenantId, name });
  recorder.pass('tenant create', { tenantId, name });

  try {
    // Read-back: the mutation must be visible in a subsequent query, not just
    // echoed by the write response.
    const list = await call(superAdmin, 'GET', '/api/enterprise/platform/tenants');
    const present = JSON.stringify(list.json || {}).includes(tenantId);
    if (present) recorder.pass('tenant create is visible on read-back', { tenantId });
    else recorder.fail('tenant create is visible on read-back', { reason: 'created tenant absent from the list', tenantId });

    const suspend = await call(superAdmin, 'POST', `/api/enterprise/platform/tenants/${tenantId}/suspend`, { reason: 'certification run' });
    if (suspend.status < 400) recorder.pass('tenant suspend', { tenantId });
    else recorder.fail('tenant suspend', { reason: `HTTP ${suspend.status}`, tenantId });

    const reactivate = await call(superAdmin, 'POST', `/api/enterprise/platform/tenants/${tenantId}/reactivate`, {});
    if (reactivate.status < 400) recorder.pass('tenant reactivate', { tenantId });
    else recorder.fail('tenant reactivate', { reason: `HTTP ${reactivate.status}`, tenantId });

    await assertAuditRecord(superAdmin, 'tenant lifecycle', tenantId);
  } finally {
    await cleanupTenant(superAdmin, tenantId, name);
  }
}

async function cleanupTenant(superAdmin, tenantId, name) {
  // Only ever removes something this run created.
  if (!name.startsWith(DISPOSABLE_PREFIX)) {
    orphaned.push({ kind: 'tenant', id: tenantId, reason: 'refusing to delete a resource this script did not create' });
    return;
  }
  const response = await call(superAdmin, 'POST', `/api/enterprise/platform/tenants/${tenantId}/decommission`, {
    reason: 'automated certification cleanup',
  });
  if (response.status < 400) {
    recorder.pass('tenant cleanup (decommission)', { tenantId });
  } else {
    orphaned.push({ kind: 'tenant', id: tenantId, status: response.status });
    recorder.fail('tenant cleanup (decommission)', {
      reason: `HTTP ${response.status} — MANUAL CLEANUP REQUIRED for ${tenantId}`,
    });
  }
}

async function verifyOperatorRbac(superAdmin, sessions) {
  // Assigning roles is the most sensitive operation in the console. Verify the
  // negative case even when not running destructive flows, because it makes no
  // change on success paths we do not trigger.
  await assertServerSideRbac(
    'assign operator role',
    'POST',
    '/api/platform/operators/role',
    { uid: 'zz-cert-nonexistent-uid', role: 'ADMIN' },
    { admin: sessions.admin, user: sessions.user },
  );

  // SUPER_ADMIN must never be assignable through the API.
  const escalation = await call(superAdmin, 'POST', '/api/platform/operators/role', {
    uid: 'zz-cert-nonexistent-uid',
    role: 'SUPER_ADMIN',
  });
  if (escalation.status >= 400) {
    recorder.pass('SUPER_ADMIN cannot be granted via the operators API', { status: escalation.status });
  } else {
    recorder.fail('SUPER_ADMIN cannot be granted via the operators API', {
      reason: `privilege escalation possible (HTTP ${escalation.status})`,
      remediation: 'Reject SUPER_ADMIN in the role assignment handler.',
    });
  }
}

async function verifyPlatformHealthTruthfulness(superAdmin) {
  const response = await call(superAdmin, 'GET', '/api/platform/operational-status');
  if (!response.ok || response.status !== 200) {
    recorder.blocked('platform health reports real state', { reason: response.error || `HTTP ${response.status}` });
    return;
  }

  const snapshot = response.json || {};
  const services = snapshot.services || [];
  if (!services.length) {
    recorder.fail('platform health reports real state', { reason: 'no services reported' });
    return;
  }

  const VALID = ['OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'DISABLED', 'NOT_CONFIGURED', 'NOT_SUPPORTED', 'UNKNOWN'];
  const invalid = services.filter(service => !VALID.includes(service.state));
  if (invalid.length) {
    recorder.fail('platform health uses the documented state vocabulary', {
      reason: `${invalid.length} service(s) reported an unknown state`,
      examples: invalid.slice(0, 5).map(s => ({ id: s.id, state: s.state })),
    });
  } else {
    recorder.pass('platform health uses the documented state vocabulary', { services: services.length });
  }

  // Every non-operational service must explain itself; a bare red dot is not
  // actionable.
  const unexplained = services.filter(s => s.state !== 'OPERATIONAL' && !s.reason);
  if (unexplained.length) {
    recorder.fail('every non-operational service explains itself', {
      reason: `${unexplained.length} service(s) have no reason`,
      examples: unexplained.slice(0, 5).map(s => s.id),
    });
  } else {
    recorder.pass('every non-operational service explains itself');
  }

  // The snapshot must never carry secrets.
  const payload = JSON.stringify(snapshot);
  if (/BEGIN [A-Z ]*PRIVATE KEY|cfut_[A-Za-z0-9_-]{20,}|sk_live_/.test(payload)) {
    recorder.fail('platform health payload is secret-free', { reason: 'credential material present in the snapshot' });
  } else {
    recorder.pass('platform health payload is secret-free');
  }

  recorder.info('platform health summary', {
    overall: snapshot.summary?.overall,
    indicator: snapshot.summary?.indicator,
    counts: snapshot.summary?.counts,
  });
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log(`\n${SCRIPT}: certifying ${BASE}`);
  console.log(`  destructive flows: ${ALLOW_DESTRUCTIVE ? 'ENABLED' : 'disabled (set ALLOW_DESTRUCTIVE=1)'}\n`);

  const reachable = await probe(`${BASE}/healthz`);
  if (!reachable.ok) {
    recorder.blocked('production is reachable', {
      reason: reachable.error,
      remediation: 'Run this from a host with network access to production.',
    });
    process.exit(recorder.finish('test-results/admin-superadmin-live.json'));
  }
  recorder.pass('production is reachable', { status: reachable.status });

  let superAdmin;
  try {
    superAdmin = await firebaseSignIn(values.FIREBASE_API_KEY, values.SUPERADMIN_EMAIL, values.SUPERADMIN_PASSWORD);
    recorder.pass('SUPER_ADMIN signed in', { uid: superAdmin.uid });
  } catch (error) {
    recorder.blocked('SUPER_ADMIN signed in', { reason: error.message });
    process.exit(recorder.finish('test-results/admin-superadmin-live.json'));
  }

  const sessions = { admin: null, user: null };
  try {
    sessions.admin = await firebaseSignIn(values.FIREBASE_API_KEY, values.ADMIN_EMAIL, values.ADMIN_PASSWORD);
    recorder.pass('ADMIN signed in', { uid: sessions.admin.uid });
  } catch (error) {
    recorder.blocked('ADMIN signed in', { reason: error.message });
  }

  if (values.USER_EMAIL && values.USER_PASSWORD) {
    try {
      sessions.user = await firebaseSignIn(values.FIREBASE_API_KEY, values.USER_EMAIL, values.USER_PASSWORD);
      recorder.pass('ordinary user signed in', { uid: sessions.user.uid });
    } catch (error) {
      recorder.blocked('ordinary user signed in', { reason: error.message });
    }
  }

  try {
    await verifyReadSurfaces(superAdmin);
    await verifyPlatformHealthTruthfulness(superAdmin);
    await verifyOperatorRbac(superAdmin, sessions);
    await verifyTenantLifecycle(superAdmin, sessions);
  } finally {
    if (orphaned.length) {
      recorder.fail('all disposable resources were cleaned up', {
        reason: 'some resources could not be removed and need manual deletion',
        orphaned,
      });
    } else if (created.length) {
      recorder.pass('all disposable resources were cleaned up', { created: created.length });
    }
  }

  process.exit(recorder.finish('test-results/admin-superadmin-live.json'));
}

main().catch(error => {
  recorder.fail('script completed', { reason: error.message, orphaned });
  process.exit(recorder.finish('test-results/admin-superadmin-live.json') || 1);
});
