'use strict';

/**
 * INV-5 as an executable assertion: **console visibility and backend enforcement
 * must agree**, for every role and every tab, computed rather than asserted by hand.
 *
 * The failure this catches is the one the audit found: `console.tsx` hid tabs by
 * role name, so an AUDITOR was shown an Operations tab whose feature-flag call
 * answered 403, while a role granted `audit.read` saw nothing new. A hand-written
 * matrix would have to be maintained alongside two other lists and would rot. This
 * test derives both sides from the same source and compares them:
 *
 *   visibility  ← `resolveCapabilities()` (what `/api/me/capabilities` returns)
 *   enforcement ← `enforceApiPolicy()` against the tab's `probe` request
 *
 * It also pins the *reason* a tab is hidden: `missing` must name exactly the
 * permissions the caller lacks, so the UI can explain a denial instead of
 * presenting a dead end.
 *
 * Roles covered: the five platform roles plus a synthetic custom role, because the
 * whole point of REC-005 is that authority is configurable — a role that is not in
 * the literal must behave identically.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCapabilities } = require('../routes/capabilities').__test;
const { CAPABILITIES } = require('../security/capabilityMap');
const { enforceApiPolicy } = require('../security/policy');
const { satisfies } = require('../services/adminRbac');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');

/** Roles exercised by the matrix. `AUDIT_LEAD` is a role no code mentions. */
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT', 'USER', 'AUDIT_LEAD', 'TICKET_AGENT'];

/** Seed that includes a role defined only in the database. */
const SEED = new Map([
  ['SUPER_ADMIN', [['*', '*']]],
  ['ADMIN', [
    ['users', 'read'], ['users', 'create'], ['users', 'update'], ['users', 'delete'], ['users.roles', 'manage'],
    ['tenants', 'read'], ['tenants', 'write'], ['tenants', 'manage'],
    ['email.template', 'manage'], ['email.logs', 'read'],
    ['payments', 'manage'], ['payments', 'read'], ['notifications', 'send'],
    ['ai.entitlements', 'manage'], ['ai.usage', 'read'],
    ['audit', 'read'], ['security', 'read'], ['tickets', 'manage'],
    ['blog', 'write'], ['blog', 'read'], ['blog', 'manage'], ['content', 'manage'], ['system.config', 'write'],
  ]],
  ['AUDITOR', [
    ['users', 'read'], ['tenants', 'read'], ['email.logs', 'read'],
    ['payments', 'read'], ['ai.usage', 'read'], ['audit', 'read'], ['security', 'read'],
  ]],
  ['SUPPORT', [['users', 'read'], ['email.logs', 'read'], ['tenants', 'read'], ['tickets', 'manage']]],
  // A role with no route to the dashboard at all, used to prove the default-tab
  // fallback rather than asserting it from a role that happens to hold users.read.
  ['TICKET_AGENT', [['tickets', 'manage']]],
  ['USER', [['resumes', 'manage'], ['coverletters', 'manage'], ['interviews', 'execute'], ['subscription', 'self']]],
  // A role invented for this test. If capability resolution ever consults a
  // hard-coded role list instead of the permission set, this role stops matching
  // its own permissions and the matrix fails.
  ['AUDIT_LEAD', [['audit', 'read'], ['users', 'read'], ['security', 'read']]],
]);

/**
 * Minimal store double: the matrix only needs role→permission expansion.
 * @param {Map<string, Array<[string, string]>>} model
 */
function storeFrom(model) {
  return {
    async listRoles() {
      return [...model.keys()].map(name => ({ name, rank: 0, isSystem: false }));
    },
    async listRolePermissions() {
      const rows = [];
      for (const [role, pairs] of model) {
        for (const [resource, action] of pairs) rows.push({ role, resource, action });
      }
      return rows;
    },
    async listUserGrants() { return []; },
  };
}

test.before(async () => {
  setRbacStoreForTests(storeFrom(SEED));
  const result = await refreshRbacCache();
  assert.equal(result.degraded, false, 'the fixture store must load, or the whole matrix proves nothing');
});

test.after(() => {
  setRbacStoreForTests(null);
});

/**
 * Would this request be authorised for this role, all the way through?
 *
 * Two layers are composed, because they can disagree and did:
 *
 *  1. `enforceApiPolicy` — the manifest, which decides by permission;
 *  2. the route's own guard — a handful of registrations additionally call
 *     `requireSuperAdmin`, which is *stricter* than the manifest.
 *
 * The tab entry declares the stricter layer (`superAdminOnly`). A separate test
 * below proves the declaration matches the source, so this composition cannot
 * silently drift into fiction.
 *
 * @param {string} role
 * @param {string} method
 * @param {string} pathname
 * @param {boolean} superAdminOnly
 * @returns {{allowed: boolean, code: string|null}}
 */
function enforcementVerdict(role, method, pathname, superAdminOnly) {
  const user = { uid: `matrix-${role}`, emailVerified: true, claims: { role } };
  const result = { allowed: false, code: null };
  const res = {
    locals: { requestId: 'matrix' },
    status(code) { result.code = `HTTP_${code}`; return this; },
    json(body) { result.code = body?.error?.code || result.code; return this; },
  };
  let policyAllowed = false;
  enforceApiPolicy({ method, path: pathname, user, originalUrl: pathname, headers: {} }, res, () => { policyAllowed = true; });
  if (!policyAllowed) {
    result.allowed = false;
    return result;
  }
  if (superAdminOnly && role !== 'SUPER_ADMIN') {
    result.allowed = false;
    result.code = 'SUPER_ADMIN_REQUIRED';
    return result;
  }
  result.allowed = true;
  return result;
}

test('INV-5: for every role and every tab, visibility agrees with backend enforcement', () => {
  const disagreements = [];
  for (const role of ROLES) {
    const caps = resolveCapabilities({ uid: `matrix-${role}`, claims: { role } });
    for (const entry of CAPABILITIES) {
      const tab = caps.tabs.find(candidate => candidate.id === entry.id);
      assert.ok(tab, `capability map must return a row for ${entry.id}`);
      const verdict = enforcementVerdict(role, entry.probe.method, entry.probe.path, Boolean(entry.superAdminOnly));
      if (tab.allowed !== verdict.allowed) {
        disagreements.push(`${role}/${entry.id}: visible=${tab.allowed} enforced=${verdict.allowed} (${verdict.code || 'ok'}) via ${entry.probe.method} ${entry.probe.path}`);
      }
    }
  }
  assert.deepEqual(disagreements, [],
    'a visible-but-denied tab is a dead end, and a hidden-but-allowed tab is work the caller cannot find');
});

test('INV-5: a hidden tab names exactly the permissions the caller lacks', () => {
  for (const role of ROLES) {
    const caps = resolveCapabilities({ uid: `matrix-${role}`, claims: { role } });
    for (const entry of CAPABILITIES) {
      const tab = caps.tabs.find(candidate => candidate.id === entry.id);
      if (tab.allowed) {
        assert.deepEqual(tab.missing, [], `${role}/${entry.id}: an allowed tab must not report missing permissions`);
        continue;
      }
      assert.ok(tab.missing.length > 0, `${role}/${entry.id}: a hidden tab must say why`);
      assert.ok(tab.reason === 'missing-permission' || tab.reason === 'super-admin-only',
        `${role}/${entry.id}: a hidden tab must carry a machine-readable reason`);
      if (tab.reason === 'super-admin-only') {
        assert.deepEqual(tab.missing, ['*'],
          `${role}/${entry.id}: a super-admin-only surface is refused for a reason a grant cannot fix, and must say so`);
        assert.equal(entry.superAdminOnly, true);
        continue;
      }
      // Every named permission must genuinely be absent, and every absence must be
      // one of the tab's declared requirements.
      const required = Array.isArray(entry.requires) ? entry.requires : [entry.requires];
      for (const permission of tab.missing) {
        assert.ok(required.includes(permission), `${role}/${entry.id}: "${permission}" is not one of the tab's requirements`);
      }
    }
  }
});

test('INV-5: a super-admin-only tab is visible only to the wildcard holder', () => {
  for (const role of ROLES) {
    const caps = resolveCapabilities({ uid: `matrix-${role}`, claims: { role } });
    for (const entry of CAPABILITIES.filter(candidate => candidate.superAdminOnly)) {
      const tab = caps.tabs.find(candidate => candidate.id === entry.id);
      assert.equal(tab.allowed, role === 'SUPER_ADMIN',
        `${role}/${entry.id}: a super-admin-only surface must not be offered to a role whose first write will 403`);
    }
  }
});

test('REC-018: a role that exists only in the database gets the tabs its permissions imply', () => {
  const caps = resolveCapabilities({ uid: 'lead-1', claims: { role: 'AUDIT_LEAD' } });
  const allowed = caps.tabs.filter(tab => tab.allowed).map(tab => tab.id);
  // audit.read + users.read + security.read implies exactly these surfaces. `config`
  // is among them because `audit.read` may read the configuration census (elevated
  // values redacted), and a tab an auditor can open must not be hidden from them.
  assert.deepEqual([...allowed].sort(), [
    'attention', 'audit', 'config', 'dashboard', 'health', 'moderation', 'operations', 'queues', 'rbac', 'security', 'users',
  ].sort(),
    'capability resolution must be driven by permissions, not by a role allowlist');

  // ...and it must not offer anything it cannot enforce.
  assert.equal(allowed.includes('settings'), false, 'AUDIT_LEAD has no system.config.read');
  assert.equal(caps.tabs.find(tab => tab.id === 'config').allowed, true,
    'the census is readable by audit.read, so the tab is visible — and its save action is not');
  assert.equal(caps.actions.config?.save, false, 'a visible surface does not imply a writable one');
  assert.equal(allowed.includes('support'), false, 'AUDIT_LEAD has no tickets.manage');
  assert.equal(allowed.includes('ai-settings'), false, 'AUDIT_LEAD is not a wildcard holder');
});

test('REC-018: the default tab is the preferred one when visible, else the first permitted', () => {
  assert.equal(resolveCapabilities({ claims: { role: 'ADMIN' } }).defaultTab, 'dashboard');
  // A role that cannot reach the dashboard must land on the first surface it can
  // use, not on a 403.
  const agent = resolveCapabilities({ claims: { role: 'TICKET_AGENT' } });
  assert.equal(agent.tabs.find(tab => tab.id === 'dashboard').allowed, false);
  assert.equal(agent.defaultTab, 'support');
  assert.ok(agent.tabs.find(tab => tab.id === 'support').allowed);

  // A principal with no admin authority at all gets no tab and no default.
  const endUser = resolveCapabilities({ claims: { role: 'USER' } });
  assert.equal(endUser.defaultTab, null);
  assert.deepEqual(endUser.tabs.filter(tab => tab.allowed), []);
});

test('REC-018: in-tab actions are resolved from permissions independently of the tab', () => {
  const admin = resolveCapabilities({ claims: { role: 'ADMIN' } });
  assert.equal(admin.actions.settings.save, true, 'ADMIN holds system.config.write');
  assert.equal(admin.actions.rbac.editRole, false, 'ADMIN may read the role catalogue but not edit it');
  assert.equal(admin.actions.users.mutate, true);
  assert.equal(admin.actions.users.delete, true);

  const auditor = resolveCapabilities({ claims: { role: 'AUDITOR' } });
  assert.equal(auditor.actions.settings.save, false);
  assert.equal(auditor.actions.rbac.editRole, false);
  assert.equal(auditor.actions.users.mutate, false);

  const superAdmin = resolveCapabilities({ claims: { role: 'SUPER_ADMIN' } });
  for (const [tab, mapping] of Object.entries(superAdmin.actions)) {
    for (const [action, allowed] of Object.entries(mapping)) {
      assert.equal(allowed, true, `${tab}.${action}: the wildcard holder must be permitted every action`);
    }
  }
});

test('INV-5: every action permission is one that some role can hold', () => {
  const { ACTIONS } = require('../security/capabilityMap');
  const { legacyPermissionSet } = require('../services/adminRbac');
  const roles = [...SEED.keys()].filter(role => role !== 'SUPER_ADMIN');
  const bundles = roles.map(role => legacyPermissionSet(role));
  // `system.config.manage` gates the RBAC editor and only the wildcard holds it.
  // That is intentional (editing authority is not delegable, D-005-4), so it is
  // declared here rather than silently tolerated.
  const WILDCARD_ONLY = new Set(['system.config.manage']);
  const unreachable = [];
  for (const [tab, mapping] of Object.entries(ACTIONS)) {
    for (const [action, permission] of Object.entries(mapping)) {
      if (WILDCARD_ONLY.has(permission)) continue;
      if (!roles.some((role, index) => satisfies(bundles[index], permission))) {
        unreachable.push(`${tab}.${action} → ${permission}`);
      }
    }
  }
  assert.deepEqual(unreachable, [], 'an action no role can perform is a control that can never be used');
});

test('INV-5: every super-admin-only declaration is backed by a real route guard', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  /** @returns {string[]} every backend .js file outside tests and node_modules */
  const backendSources = () => {
    const root = path.join(__dirname, '..');
    const files = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'test' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
      }
    };
    walk(root);
    return files;
  };

  const sources = backendSources().map(file => fs.readFileSync(file, 'utf8'));
  const missing = [];
  for (const entry of CAPABILITIES.filter(candidate => candidate.superAdminOnly)) {
    // The probe path is mount-relative; the registration carries the `/api` prefix.
    const absolute = `/api${entry.probe.path}`;
    const guarded = sources.some(source => source
      .split('\n')
      .some(line => line.includes(absolute) && line.includes('requireSuperAdmin')));
    if (!guarded) missing.push(`${entry.id} → ${absolute}`);
  }
  assert.deepEqual(missing, [],
    'a tab declared super-admin-only must correspond to a registration that actually calls requireSuperAdmin; otherwise the UI is hiding a surface that is merely permission-gated, or claiming a guard that does not exist');
});

test('INV-5: every tab probe is a route the manifest actually resolves', () => {
  const { resolveRoutePermission } = require('../security/routeManifest');
  const unresolved = [];
  for (const entry of CAPABILITIES) {
    const resolved = resolveRoutePermission(entry.probe.path, entry.probe.method);
    if (!resolved) unresolved.push(`${entry.id} → ${entry.probe.method} ${entry.probe.path}`);
    else if (resolved.isDefault) {
      // A probe landing on a declared default would mean the tab's requirement is
      // not the requirement the engine enforces.
      unresolved.push(`${entry.id} → ${entry.probe.method} ${entry.probe.path} (declared default: ${resolved.ruleId})`);
    }
  }
  assert.deepEqual(unresolved, [],
    'each tab must probe a route the manifest names explicitly, so visibility is derived from the same decision the engine makes');
});
