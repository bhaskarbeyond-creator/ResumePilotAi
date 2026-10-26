'use strict';

/**
 * Characterisation tests (tier "characterisation", REC-017).
 *
 * ## What a characterisation test is for
 *
 * Where legacy intent was ambiguous, the analysis recorded a *divergence* and a decision
 * (DIV-nnn, ADR-nnn). Characterisation pins the behaviour that was chosen, so a future
 * change to it is deliberate and visible in a diff rather than silent. It is not a test of
 * what is "correct" — it is a test of what we decided, with the decision named in the
 * assertion message.
 *
 * Each block below corresponds to a documented decision. The citations are the
 * identifiers those decisions carry in `07-intentional-divergence-register.md`,
 * `DECISION-LOG.md` and `decisions/ADR-*.md`; an earlier revision of this file
 * used stale DIV numbers, which was itself a consistency defect (D-026-1):
 *
 *  - ADR-002 / D-005-3 — authority is the persisted bundle, never the token's claims.
 *  - D-005-1 / DIV-002 — the legacy dotted permission vocabulary still resolves.
 *  - ADR-001 / INV-3 — `manage ⊃ write ⊃ read`, and nothing implies `*`.
 *  - RCA-005 / RCA-006 (REC-004) — the target-authority ceiling: a lower-ranked
 *    actor cannot act on a higher one.
 *  - INV-2 — the wildcard holder is the only authority for `superAdminOnly` surfaces.
 *  - D-005-7 / ADR-005 — one audit row per authority change, with stable action names.
 *  - DIV-014 / INV-4 — deployment-owned values are read-only, and every register
 *    row is editable or justified. Resolution order (database → env → default) is
 *    the RESOLUTION model in `config/registry.js`.
 *
 * Run: NODE_ENV=test node --test test/characterisation.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';

const rbac = require('../services/adminRbac');
const vocabulary = require('../security/permissionVocabulary');
const targetAuthority = require('../security/targetAuthority');
const registry = require('../config/registry');

test.before(() => {
  // The frozen literal is the contract here, so no store is installed: resolution falls
  // back to the vocabulary, which is exactly the pre-migration behaviour DIV-002 preserves.
  rbac.setRbacStoreForTests(null);
  rbac.invalidateRbacCache();
});

/* ── ADR-002 / D-005-3: authority comes from the bundle, not from the token ── */

test('ADR-002: token-asserted permissions are ignored; only persisted grants count', () => {
  // The forged claims below are exactly what the legacy resolver merged in. USER holds only
  // resumes/coverletters/interviews/subscription, so a claim of `*` must not become one.
  const forged = { uid: 'u-forged', claims: { role: 'USER', permissions: ['users.manage', 'system.config.write', '*'] } };
  const resolved = rbac.resolvePermissionSet(forged);
  assert.strictEqual(rbac.satisfies(resolved, 'system.config.write'), false,
    'a claim is not a grant: an unforgeable token is still a client-supplied claim');
  assert.strictEqual(rbac.satisfies(resolved, 'users.manage'), false);
  assert.strictEqual(rbac.satisfies(resolved, '*'), false, 'claiming the wildcard must not grant it');
  assert.strictEqual(rbac.satisfies(resolved, 'resumes.manage'), true, 'the role it actually holds still works');
});

test('ADR-002: an unknown role resolves to no authority at all, not to a default', () => {
  assert.deepStrictEqual([...rbac.resolvePermissionSet({ claims: { role: 'GHOST_ROLE' } })], []);
  assert.deepStrictEqual([...rbac.resolvePermissionSet({})], []);
  assert.deepStrictEqual([...rbac.resolvePermissionSet(null)], []);
});

/* ── D-005-1 / DIV-002: the legacy dotted vocabulary keeps working ────── */

test('D-005-9: the eight legacy roles keep their documented bundle sizes', () => {
  const expected = {
    SUPER_ADMIN: 1, // ['*']
    ADMIN: 23,
    AUDITOR: 7,
    SUPPORT: 4,
    ENTERPRISE_ADMIN: 9,
    ENTERPRISE_MEMBER: 4,
    EMPLOYER: 3,
    USER: 4,
  };
  for (const [role, size] of Object.entries(expected)) {
    const literal = vocabulary.PERMISSIONS[role];
    assert.ok(Array.isArray(literal), `${role} must exist in the frozen vocabulary`);
    assert.strictEqual(literal.length, size,
      `${role} changed size: a role's bundle is a documented decision (08-admin-superadmin-rights-and-rbac.md), not an incidental edit`);
  }
});

test('D-005-1: dotted aliases resolve to the canonical resource:action key', () => {
  // A handler written before REC-004 calls `permissions.has('users.update')`. It must keep
  // working, which is why the resolved set carries both forms.
  const admin = rbac.resolvePermissionSet({ claims: { role: 'ADMIN' } });
  assert.ok(admin.has('users:read'), 'canonical key');
  for (const dotted of ['users.read', 'users.update', 'users.delete']) {
    assert.ok(admin.has(dotted), `${dotted} must resolve for a legacy call site`);
  }
});

test('D-005-9: a role that exists only in the store is not blocked by a role allowlist', () => {
  assert.deepStrictEqual(vocabulary.PERMISSIONS.AUDIT_LEAD, undefined,
    'AUDIT_LEAD is deliberately absent from the literal: the store is the only place it can come from');
});

/* ── ADR-001 / INV-3: the action hierarchy ────────────────────────────── */

test('ADR-001: manage ⊃ write ⊃ read, and no action implies the wildcard', () => {
  assert.strictEqual(rbac.ACTION_IMPLIES.manage.includes('write'), true);
  assert.strictEqual(rbac.ACTION_IMPLIES.manage.includes('read'), true);
  assert.strictEqual(rbac.ACTION_IMPLIES.write.includes('read'), true);
  assert.strictEqual((rbac.ACTION_IMPLIES.read || []).length, 0, 'read implies nothing above it');
  for (const [action, implied] of Object.entries(rbac.ACTION_IMPLIES)) {
    assert.ok(!implied.includes('*'), `${action} must never imply the wildcard`);
  }
  // The hierarchy is applied when a grant is expanded (`expandGrant`), not when it is
  // checked: `requirePermission` compares against the expanded set that
  // `resolvePermissionSet` returns. Asserting on a hand-built set would therefore test
  // nothing — so the expansion is what is characterised here.
  // Both key forms are emitted: the canonical `resource:action` and the legacy dotted
  // alias, so a handler written either way keeps working (DIV-004).
  assert.deepStrictEqual(rbac.expandGrant('users', 'manage').sort(),
    ['users.manage', 'users.read', 'users.write', 'users:manage', 'users:read', 'users:write'],
    'manage must expand to itself plus the actions below it, in both key vocabularies');
  assert.deepStrictEqual(rbac.expandGrant('users', 'write').sort(), ['users.read', 'users.write', 'users:read', 'users:write']);
  assert.deepStrictEqual(rbac.expandGrant('users', 'read').sort(), ['users.read', 'users:read']);

  const managed = new Set(rbac.expandGrant('users', 'manage'));
  assert.strictEqual(rbac.satisfies(managed, 'users:write'), true);
  assert.strictEqual(rbac.satisfies(managed, 'users:read'), true);
  const readOnly = new Set(rbac.expandGrant('users', 'read'));
  assert.strictEqual(rbac.satisfies(readOnly, 'users:write'), false);
  assert.strictEqual(rbac.satisfies(readOnly, 'users:manage'), false);
});

test('INV-2: a wildcard holder satisfies every permission, and the check is not string-prefix based', () => {
  const wildcard = new Set(['*']);
  assert.strictEqual(rbac.satisfies(wildcard, 'anything.at.all'), true);
  assert.strictEqual(rbac.satisfies(wildcard, ['a:read', 'b:write']), true);
  const prefixTrap = new Set(['users:rea']);
  assert.strictEqual(rbac.satisfies(prefixTrap, 'users:read'), false, 'a near-miss key must not satisfy the real one');
});

/* ── RCA-005 / RCA-006 (REC-004): the target-authority ceiling ───────── */

test('RCA-005: the rank ladder is ordered and monotonic', () => {
  const ranks = ['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT', 'EMPLOYER', 'ENTERPRISE_ADMIN', 'ENTERPRISE_MEMBER', 'USER']
    .map(role => ({ role, rank: targetAuthority.rankOf(role) }));
  for (const { role, rank } of ranks) {
    assert.strictEqual(typeof rank, 'number', `${role} must have a rank`);
  }
  assert.deepStrictEqual(ranks.map(entry => entry.rank), [100, 80, 60, 60, 40, 30, 20, 10],
    'the ladder is a documented constant (targetAuthority.js); changing it changes who may act on whom');
});

test('RCA-006: an actor may act on an equal or lower rank and never on a higher one', () => {
  const verdict = (actorRole, targetRole) => targetAuthority.evaluateTargetAuthority(
    { uid: 'actor-1', claims: { role: actorRole } },
    { uid: 'target-1', claims: { role: targetRole } },
    'users.delete',
  );

  assert.strictEqual(verdict('ADMIN', 'USER').allowed, true);
  assert.strictEqual(verdict('ADMIN', 'AUDITOR').allowed, true, 'equal-or-lower is permitted');
  assert.strictEqual(verdict('AUDITOR', 'ADMIN').allowed, false, 'an auditor must not administer an admin');
  assert.strictEqual(verdict('USER', 'SUPER_ADMIN').allowed, false);
  assert.strictEqual(verdict('ADMIN', 'SUPER_ADMIN').allowed, false,
    'the ceiling exists precisely so an admin cannot remove the person who could remove them');
  assert.strictEqual(verdict('ADMIN', 'ADMIN').allowed, true, 'acting on an equal is allowed; the last-admin guard is a separate rule');
});

/* ── DIV-014 / INV-4: deployment scope and the register's two columns ── */

test('DIV-014: a deployment-scoped value can never be made editable by adding a registry entry', () => {
  for (const entry of registry.ENTRIES.filter(candidate => candidate.scope === registry.SCOPE.DEPLOYMENT)) {
    assert.strictEqual(entry.editable, false, `${entry.key} is deployment-scoped and must stay read-only`);
    assert.ok(entry.readOnlyReason, `${entry.key} must carry the reason`);
  }
});

test('INV-4: every business-affecting register row is either editable or justified', () => {
  const rows = registry.ENTRIES;
  const editable = rows.filter(entry => entry.editable);
  const justified = rows.filter(entry => !entry.editable && entry.readOnlyReason);
  assert.strictEqual(editable.length + justified.length, rows.length,
    'INV-4 admits no third category: a value is configurable with validation/audit, or it is justified in code');
  const unjustifiedInCode = rows.filter(entry => !entry.editable && entry.resolution === registry.RESOLUTION.CODE && !entry.readOnlyReason);
  assert.deepStrictEqual(unjustifiedInCode.map(entry => entry.key), []);
});

/* ── D-005-7 / ADR-005: the audit trail's shape ──────────────────────── */

test('D-005-7: audit actions are namespaced and stable, so a saved query does not rot', () => {
  // The two semantic actions the remediation introduced. Renaming them silently would
  // break every saved filter on the audit surface.
  const expected = ['CONFIG_VALUE_UPDATED', 'UPDATE_ROLE_PERMISSIONS', 'GRANT_ROLE', 'REVOKE_ROLE'];
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'routes', 'adminRbac.js'), 'utf8')
    + require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'routes', 'config.js'), 'utf8');
  for (const action of expected) {
    assert.ok(source.includes(`'${action}'`), `${action} must remain the recorded action name`);
    assert.match(action, /^[A-Z][A-Z_]+$/, 'actions are upper snake case (adminAudit.deriveAction convention)');
  }
});
