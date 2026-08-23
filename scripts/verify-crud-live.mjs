#!/usr/bin/env node
/**
 * Destructive live CRUD certification for Admin and Super Admin.
 *
 * This script is intentionally conservative. It performs read/RBAC checks by
 * default; tenant and user mutations only run with ALLOW_DESTRUCTIVE=1. Every
 * mutation is read back and the script checks the admin audit endpoint before
 * cleanup. A skipped mutation is reported as SKIPPED/INCOMPLETE, never PASS.
 *
 * Required for read/RBAC: FIREBASE_API_KEY, SUPERADMIN_EMAIL,
 * SUPERADMIN_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD.
 * Optional destructive user fixture: TEST_USER_EMAIL, TEST_USER_PASSWORD.
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

const SCRIPT = 'verify-crud-live';
const { ok, values, missing } = readEnv({
  PROD_BASE_URL: { default: DEFAULT_BASE_URL, description: 'Production origin' },
  FIREBASE_API_KEY: { required: true, description: 'Firebase Web API key' },
  SUPERADMIN_EMAIL: { required: true, description: 'SUPER_ADMIN email' },
  SUPERADMIN_PASSWORD: { required: true, description: 'SUPER_ADMIN password' },
  ADMIN_EMAIL: { required: true, description: 'ADMIN email' },
  ADMIN_PASSWORD: { required: true, description: 'ADMIN password' },
  TEST_USER_EMAIL: { description: 'Disposable test-user email for user CRUD' },
  TEST_USER_PASSWORD: { description: 'Disposable test-user password for user CRUD' },
  ALLOW_DESTRUCTIVE: { default: '0', description: 'Set to 1 to create/update/delete disposable production records' },
});
if (!ok) { reportMissingEnv(missing, SCRIPT); process.exit(2); }

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const destructive = values.ALLOW_DESTRUCTIVE === '1';
const recorder = new Recorder(SCRIPT, { base: BASE, destructive });
const createdTenants = [];
const createdUsers = [];

const authHeaders = session => ({ Authorization: `Bearer ${session.idToken}`, 'Content-Type': 'application/json' });
async function call(session, method, route, body, extraHeaders = {}) {
  return probe(`${BASE}${route}`, {
    method,
    headers: { ...(session ? authHeaders(session) : { 'Content-Type': 'application/json' }), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function bodyCode(response) { return response.json?.error?.code || response.json?.code || null; }
function assertStatus(label, response, expected, reason) {
  if (expected.includes(response.status)) recorder.pass(label, { status: response.status, code: bodyCode(response) });
  else recorder.fail(label, { status: response.status, expected, reason: reason || `Expected ${expected.join('/')} but received ${response.status}` });
}

async function assertAuditEvent(session, label, needle, tenantId = null, expectedAction = null) {
  const matches = entry => {
    const text = JSON.stringify(entry).toLowerCase();
    return text.includes(String(needle).toLowerCase()) && (!expectedAction || String(entry.action || '').toUpperCase() === expectedAction.toUpperCase());
  };
  let matched = null;
  let lastStatus = null;
  for (let attempt = 0; attempt < 6 && !matched; attempt += 1) {
    const adminAudit = await call(session, 'GET', `/api/admin/audit-logs?limit=100&search=${encodeURIComponent(needle)}`);
    lastStatus = adminAudit.status;
    if (adminAudit.status === 200) matched = (adminAudit.json?.logs || []).find(matches);
    if (!matched) {
      const security = await call(session, 'GET', '/api/platform/security-events?limit=100');
      lastStatus = security.status;
      if (security.status === 200) matched = (security.json?.events || []).find(matches);
    }
    if (!matched && tenantId) {
      const tenantAudit = await call(session, 'GET', '/api/enterprise/audit?limit=100', undefined, { 'X-Tenant-Id': tenantId });
      lastStatus = tenantAudit.status;
      if (tenantAudit.status === 200) matched = (tenantAudit.json?.events || []).find(matches);
    }
    if (!matched && attempt < 5) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (matched) {
    const flat = JSON.stringify(matched).toLowerCase();
    const useful = Boolean(matched.action && (matched.createdAt || matched.occurredAt || flat.includes('createdat') || flat.includes('occurredat')));
    if (useful) recorder.pass(`audit event read-back: ${label}`, { action: matched.action, status: lastStatus });
    else recorder.fail(`audit event read-back: ${label}`, { reason: 'Matched record is missing action or timestamp fields.' });
  } else {
    recorder.fail(`audit event read-back: ${label}`, { reason: `No audit event referenced ${needle}. Last response status: ${lastStatus}` });
  }
}

async function signIn(label, email, password) {
  try {
    const session = await firebaseSignIn(values.FIREBASE_API_KEY, email, password);
    recorder.pass(`${label} authenticated`, { uid: session.uid });
    return session;
  } catch (error) {
    recorder.blocked(`${label} authenticated`, { reason: error.message });
    return null;
  }
}

async function runRbac(superAdmin, admin) {
  const anonymous = await call(null, 'GET', '/api/platform/operational-status');
  assertStatus('anonymous cannot read platform health', anonymous, [401, 403]);
  const adminRead = await call(admin, 'GET', '/api/platform/operational-status');
  assertStatus('ADMIN can read platform health', adminRead, [200], 'The operational read surface is part of the ADMIN contract.');
  const adminWrite = await call(admin, 'POST', '/api/platform/maintenance', { enabled: false });
  assertStatus('ADMIN cannot mutate Super Admin maintenance control', adminWrite, [403], 'Maintenance changes are Super Admin-only.');
  const adminFlag = await call(admin, 'GET', '/api/platform/feature-flags');
  assertStatus('ADMIN cannot read Super Admin feature-flag control surface', adminFlag, [403], 'Feature flag control is Super Admin-only.');
  const adminConfig = await call(admin, 'GET', '/api/platform/configuration');
  assertStatus('ADMIN cannot read the Super Admin configuration census', adminConfig, [403], 'The full configuration census is Super Admin-only.');
  const adminPayments = await call(admin, 'GET', '/api/platform/payment-settings');
  assertStatus('ADMIN cannot read payment credential status', adminPayments, [403], 'Payment credential status is Super Admin-only.');
  const superFlags = await call(superAdmin, 'GET', '/api/platform/feature-flags');
  assertStatus('SUPER_ADMIN can read feature-flag control surface', superFlags, [200], 'A valid Super Admin must be able to inspect the governed flags.');
}

async function runTenantCrud(superAdmin) {
  if (!destructive) {
    recorder.skipped('tenant CREATE/RENAME/SUSPEND/REACTIVATE/DECOMMISSION', { reason: 'Set ALLOW_DESTRUCTIVE=1; no production mutation was attempted.' });
    return;
  }
  const name = disposableName('zz-cert-tenant');
  const created = await call(superAdmin, 'POST', '/api/enterprise/tenants', { displayName: name, slug: name, isolationTier: 'STANDARD' });
  if (![201].includes(created.status)) {
    const code = bodyCode(created);
    if (created.status === 404 || code === 'ENTERPRISE_DISABLED') recorder.skipped('tenant CRUD', { reason: 'Enterprise tenancy is explicitly disabled in this deployment.', status: created.status, code });
    else recorder.fail('tenant CREATE', { status: created.status, code, reason: 'A destructive tenant create was requested but the backend did not create it.' });
    return;
  }
  const tenantId = created.json?.tenant?.id;
  if (!tenantId) { recorder.fail('tenant CREATE returned an id', { reason: 'No tenant id was returned; cleanup cannot be safely targeted.' }); return; }
  createdTenants.push({ id: tenantId, name });
  recorder.pass('tenant CREATE returned a disposable id', { tenantId });
  await assertAuditEvent(superAdmin, 'tenant CREATE', tenantId, tenantId, 'TENANT_PROVISIONED');

  const listed = await call(superAdmin, 'GET', '/api/enterprise/platform/tenants');
  if (listed.status === 200 && JSON.stringify(listed.json).includes(tenantId)) recorder.pass('tenant CREATE persisted and is visible on read-back', { tenantId });
  else recorder.fail('tenant CREATE persisted and is visible on read-back', { status: listed.status, reason: 'The created tenant was not present in the subsequent registry read.' });

  const detail = await call(superAdmin, 'GET', `/api/platform/tenants/${encodeURIComponent(tenantId)}`);
  assertStatus('tenant detail reads from the server data plane', detail, [200], 'The detail endpoint must expose measured overview, users, usage, security, M2M, audit, and configuration sections.');
  if (detail.status === 200) {
    const required = ['overview', 'users', 'memberships', 'usage', 'security', 'm2m', 'audit', 'activity', 'configuration'];
    const missingSections = required.filter(key => !(key in (detail.json || {})));
    if (missingSections.length) recorder.fail('tenant detail contains all enterprise sections', { reason: `Missing ${missingSections.join(', ')}` });
    else recorder.pass('tenant detail contains all enterprise sections');
  }

  const renamed = await call(superAdmin, 'PATCH', `/api/platform/tenants/${encodeURIComponent(tenantId)}`, { displayName: `${name}-renamed` });
  assertStatus('tenant RENAME returns the persisted name', renamed, [200]);
  if (renamed.status === 200 && renamed.json?.tenant?.displayName !== `${name}-renamed`) recorder.fail('tenant RENAME read-back matches', { reason: 'Response did not contain the renamed displayName.' });
  await assertAuditEvent(superAdmin, 'tenant RENAME', tenantId, tenantId, 'PLATFORM_TENANT_RENAMED');

  for (const [verb, action, expectedState] of [['suspend', 'SUSPEND', 'SUSPENDED'], ['reactivate', 'REACTIVATE', 'ACTIVE']]) {
    const response = await call(superAdmin, 'POST', `/api/enterprise/platform/tenants/${encodeURIComponent(tenantId)}/${verb}`);
    assertStatus(`tenant ${action} returns a state`, response, [200]);
    if (response.status === 200 && response.json?.tenant?.lifecycleState !== expectedState) recorder.fail(`tenant ${action} read-back is ${expectedState}`, { reason: `Got ${response.json?.tenant?.lifecycleState}` });
    else if (response.status === 200) recorder.pass(`tenant ${action} read-back is ${expectedState}`);
    await assertAuditEvent(superAdmin, `tenant ${action}`, tenantId, tenantId, `PLATFORM_TENANT_${expectedState}`);
  }

  const retired = await call(superAdmin, 'POST', `/api/platform/tenants/${encodeURIComponent(tenantId)}/decommission`, { reason: 'Disposable live CRUD certification record' });
  assertStatus('tenant DECOMMISSION is a controlled lifecycle transition', retired, [200], 'A created disposable tenant is safe to retire through the retention lifecycle.');
  if (retired.status === 200 && retired.json?.tenant?.lifecycleState === 'DELETING') recorder.pass('tenant DECOMMISSION persisted as DELETING');
  await assertAuditEvent(superAdmin, 'tenant DECOMMISSION', tenantId, tenantId, 'DECOMMISSION_PLATFORM_TENANT');
}

async function createTestUser(superAdmin) {
  if (!destructive || !values.TEST_USER_EMAIL || !values.TEST_USER_PASSWORD) return null;
  const response = await probe(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(values.FIREBASE_API_KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: values.TEST_USER_EMAIL, password: values.TEST_USER_PASSWORD, returnSecureToken: true }) });
  if (response.status !== 200 || !response.json?.localId) { recorder.fail('disposable user CREATE', { status: response.status, reason: 'Firebase Identity Toolkit did not create the configured disposable account.' }); return null; }
  const uid = response.json.localId;
  createdUsers.push({ uid, email: values.TEST_USER_EMAIL });
  recorder.pass('disposable user CREATE', { uid });
  return uid;
}

async function runUserCrud(superAdmin) {
  if (!destructive) { recorder.skipped('user suspend/activate/role/delete', { reason: 'Set ALLOW_DESTRUCTIVE=1; no production mutation was attempted.' }); return; }
  const uid = await createTestUser(superAdmin);
  if (!uid) { recorder.blocked('user CRUD read-back', { reason: 'Set TEST_USER_EMAIL and TEST_USER_PASSWORD to create a disposable user fixture.' }); return; }
  const initial = await call(superAdmin, 'GET', `/api/admin/users/${encodeURIComponent(uid)}`);
  if (initial.status === 404 && bodyCode(initial) === 'USER_NOT_FOUND') {
    recorder.blocked('user CRUD profile fixture', { reason: 'Firebase Auth created the account but no product profile exists. Create the disposable profile through the approved signup/bootstrap flow before rerunning user CRUD.' });
    return;
  }
  assertStatus('user CREATE is visible in authoritative directory', initial, [200]);
  if (initial.status !== 200) return;
  const initialUser = initial.json?.user || {};
  const suspended = await call(superAdmin, 'PATCH', `/api/admin/users/${encodeURIComponent(uid)}`, { suspended: true, expectedSuspended: false });
  assertStatus('user SUSPEND is server-authorized', suspended, [200]);
  await assertAuditEvent(superAdmin, 'user SUSPEND', uid, null, 'USER_ADMIN_UPDATE');
  const suspendedRead = await call(superAdmin, 'GET', `/api/admin/users/${encodeURIComponent(uid)}`);
  if (suspendedRead.status === 200 && suspendedRead.json?.user?.suspended === true) recorder.pass('user SUSPEND persisted on read-back');
  else recorder.fail('user SUSPEND persisted on read-back', { status: suspendedRead.status, reason: 'Disabled state was not visible in Firebase Auth-backed read.' });
  const active = await call(superAdmin, 'PATCH', `/api/admin/users/${encodeURIComponent(uid)}`, { suspended: false, expectedSuspended: true });
  assertStatus('user ACTIVATE is server-authorized', active, [200]);
  await assertAuditEvent(superAdmin, 'user ACTIVATE', uid, null, 'USER_ADMIN_UPDATE');
  const role = await call(superAdmin, 'PATCH', `/api/admin/users/${encodeURIComponent(uid)}`, { role: 'SUPPORT', expectedRole: initialUser.role || 'USER' });
  assertStatus('user role assignment is server-authorized', role, [200]);
  await assertAuditEvent(superAdmin, 'user role assignment', uid, null, 'USER_ADMIN_UPDATE');
  const roleRead = await call(superAdmin, 'GET', `/api/admin/users/${encodeURIComponent(uid)}`);
  if (roleRead.status === 200 && roleRead.json?.user?.role === 'SUPPORT') recorder.pass('user role assignment persisted on read-back');
  else recorder.fail('user role assignment persisted on read-back', { status: roleRead.status, reason: 'Firebase custom claim did not appear in the subsequent read.' });
}

async function cleanup(superAdmin) {
  for (const tenant of [...createdTenants].reverse()) {
    // A tenant already moved to DELETING is intentionally retained for the
    // configured Enterprise retention worker. Do not issue a second destructive
    // request that could obscure the original audit event. Record the exact
    // deferred cleanup target so the certification artifact is actionable.
    recorder.info('tenant cleanup deferred to retention worker', {
      tenantId: tenant.id,
      name: tenant.name,
      state: 'DELETING',
      cleanup: 'retention worker must complete the configured purge window',
    });
  }
  for (const user of [...createdUsers].reverse()) {
    const response = await call(superAdmin, 'POST', '/api/admin/delete-user', { uid: user.uid, email: user.email });
    if (response.status === 200 && response.json?.success === true) recorder.pass('cleanup removed the disposable user', { uid: user.uid });
    else recorder.fail('cleanup removed the disposable user', { uid: user.uid, status: response.status, reason: 'The test user could not be safely removed; investigate before another run.' });
  }
}

async function main() {
  const superAdmin = await signIn('SUPER_ADMIN', values.SUPERADMIN_EMAIL, values.SUPERADMIN_PASSWORD);
  const admin = await signIn('ADMIN', values.ADMIN_EMAIL, values.ADMIN_PASSWORD);
  if (!superAdmin || !admin) { recorder.blocked('CRUD certification prerequisites', { reason: 'Both privileged sessions are required.' }); process.exit(recorder.finish('test-results/crud-live.json')); }
  await runRbac(superAdmin, admin);
  await runTenantCrud(superAdmin);
  await runUserCrud(superAdmin);
  await cleanup(superAdmin);
  process.exit(recorder.finish('test-results/crud-live.json'));
}
main().catch(error => { recorder.fail('script completed', { reason: error.message }); process.exit(recorder.finish('test-results/crud-live.json') || 1); });
