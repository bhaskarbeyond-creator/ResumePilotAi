'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSupportGrant, activeGrant } = require('../enterprise/supportAccessStore');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('GAP-07: support grants are time-bound, reason-captured, and tenant/workflow scoped', () => {
  const now = Date.now();
  const grant = createSupportGrant({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    supportSubjectId: 'support-a',
    requestedBySubjectId: 'admin-a',
    reason: 'Investigate billing activation failure for the tenant owner',
    expiresInMinutes: 30,
    scopes: ['tenant.audit.read'],
    now,
  });
  assert.equal(grant.status, 'ACTIVE');
  assert.ok(new Date(grant.expiresAt).getTime() > now + 20 * 60 * 1000);
  assert.match(grant.reason, /billing/i);
  assert.deepEqual(grant.scopes, ['tenant.audit.read']);
  assert.equal(activeGrant(grant, {
    supportSubjectId: 'support-a',
    tenantId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    now,
  }), true);
  assert.equal(activeGrant(grant, {
    supportSubjectId: 'other-token',
    tenantId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    now,
  }), false);
  assert.equal(activeGrant(grant, {
    supportSubjectId: 'support-a',
    tenantId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    now: now + 31 * 60 * 1000,
  }), false);
});

test('GAP-07: delegated access is grant-based, never session minting or credential mutation', () => {
  const auth = read('backend/enterprise/enterpriseAuth.js');
  const store = read('backend/enterprise/supportAccessStore.js');
  assert.match(auth, /x-support-grant-id/);
  assert.match(auth, /SUPPORT_ALLOWED_ENDPOINTS/);
  assert.doesNotMatch(auth, /createCustomToken|mintSession|signInWithCustomToken|setCustomUserClaims|issueLocalTestToken/);
  assert.doesNotMatch(store, /password|setCustomUserClaims|createCustomToken|signInWithCustomToken/);
});
