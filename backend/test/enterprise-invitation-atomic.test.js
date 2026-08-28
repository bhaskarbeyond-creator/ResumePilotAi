'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MySqlTenantRegistry,
  membershipDocumentId,
} = require('../enterprise/mysqlTenantRegistry');
const { TenantService } = require('../enterprise/tenantService');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const PRINCIPAL_ID = 'firebase-user-123';

function tenantContext() {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    principalId: '33333333-3333-4333-8333-333333333333',
    subjectId: 'owner-firebase-uid',
    identityIssuer: 'firebase',
    actorType: 'user',
    requestId: 'request-invite-1',
    correlationId: 'request-invite-1',
    policyVersion: 1,
    workspaceScope: 'TENANT',
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', routingVersion: 1 },
  };
}

function grantHarness({ failOutbox = false } = {}) {
  const calls = [];
  let notificationId = null;
  const id = membershipDocumentId(TENANT_ID, PRINCIPAL_ID);
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM enterprise_workspaces WHERE id = \? AND tenantId = \? FOR UPDATE/.test(sql)) {
        return [[{ id: WORKSPACE_ID, lifecycleState: 'ACTIVE' }]];
      }
      if (/SELECT id, principalId, revision FROM enterprise_memberships/.test(sql)) return [[]];
      if (/INSERT INTO notification_outbox/.test(sql)) {
        if (failOutbox) throw new Error('outbox unavailable');
        notificationId = params[0];
        return [{ affectedRows: 1 }];
      }
      if (/SELECT m\.\*, i\.recipientEmail/.test(sql)) {
        return [[{
          id,
          tenantId: TENANT_ID,
          principalId: PRINCIPAL_ID,
          canonicalPrincipalId: null,
          workspaceId: WORKSPACE_ID,
          status: 'INVITED',
          roles: JSON.stringify(['MEMBER']),
          revision: 1,
          invitationEmail: 'invitee@example.com',
          invitedAt: new Date(),
          acceptedAt: null,
          invitationExpiresAt: new Date(Date.now() + 7 * 86_400_000),
          invitationState: 'PENDING',
          invitationDeliveryState: 'NOTIFICATION_QUEUED',
          invitationNotificationId: notificationId,
          invitationQueueRevision: 1,
        }]];
      }
      if (/INSERT INTO enterprise_memberships|INSERT INTO enterprise_workspace_memberships|INSERT INTO enterprise_membership_invitations/.test(sql)) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return { calls, pool: { getConnection: async () => connection } };
}

function invitationPayload() {
  return {
    recipientEmail: 'Invitee@Example.com',
    invitedByPrincipalId: '33333333-3333-4333-8333-333333333333',
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    tenantContext: tenantContext(),
    notification: {
      templateType: 'enterprise-invitation',
      vars: { action_url: 'https://app.example.com/enterprise' },
      metadata: { customSubject: 'Invitation', customBody: 'Sign in to accept.' },
    },
  };
}

test('membership, workspace binding, invitation state and email outbox commit in one transaction', async () => {
  const harness = grantHarness();
  const registry = new MySqlTenantRegistry({ pool: harness.pool });
  const membership = await registry.grantMembership({
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    workspaceId: WORKSPACE_ID,
    roles: ['MEMBER'],
    status: 'INVITED',
    invitation: invitationPayload(),
  });

  assert.equal(membership.status, 'INVITED');
  assert.equal(membership.workspaceId, WORKSPACE_ID);
  assert.equal(membership.invitationEmail, 'invitee@example.com');
  assert.equal(membership.invitationDeliveryState, 'NOTIFICATION_QUEUED');
  assert.match(membership.invitationNotificationId, /^[a-f0-9]{64}$/);
  assert.equal(harness.calls.filter(call => call === 'begin').length, 1);
  assert.equal(harness.calls.filter(call => call === 'commit').length, 1);
  assert.equal(harness.calls.includes('rollback'), false);

  const membershipInsert = harness.calls.find(call => call?.sql && /INSERT INTO enterprise_memberships/.test(call.sql));
  const workspaceInsert = harness.calls.find(call => call?.sql && /INSERT INTO enterprise_workspace_memberships/.test(call.sql));
  const outboxInsert = harness.calls.find(call => call?.sql && /INSERT INTO notification_outbox/.test(call.sql));
  const invitationInsert = harness.calls.find(call => call?.sql && /INSERT INTO enterprise_membership_invitations/.test(call.sql));
  assert.ok(membershipInsert && workspaceInsert && outboxInsert && invitationInsert);
  assert.equal(outboxInsert.params[2], 'invitee@example.com');
  assert.equal(outboxInsert.params[3], 'enterprise-invitation');
  assert.equal(invitationInsert.params[7], outboxInsert.params[0]);
});

test('outbox enqueue failure rolls back the membership and invitation transaction', async () => {
  const harness = grantHarness({ failOutbox: true });
  const registry = new MySqlTenantRegistry({ pool: harness.pool });
  await assert.rejects(
    () => registry.grantMembership({
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      workspaceId: WORKSPACE_ID,
      roles: ['MEMBER'],
      status: 'INVITED',
      invitation: invitationPayload(),
    }),
    /outbox unavailable/
  );
  assert.equal(harness.calls.includes('commit'), false);
  assert.equal(harness.calls.includes('rollback'), true);
});

test('invitation recipient cannot differ from the Firebase identity bound to the membership', async () => {
  let registryCalled = false;
  const service = new TenantService({
    registry: {
      async getTenantConfiguration() { return { customRoles: {} }; },
      async grantMembership() { registryCalled = true; },
    },
    admin: {
      auth: () => ({
        async getUser() { return { uid: PRINCIPAL_ID, email: 'identity@example.com', disabled: false }; },
      }),
    },
    repository: { async appendAuditEvent() {} },
  });
  const context = {
    ...tenantContext(),
    roles: ['TENANT_OWNER'],
    tenant: { id: TENANT_ID, displayName: 'Example Org', configuration: { customRoles: {} } },
  };
  await assert.rejects(
    () => service.grantMembership({
      context,
      input: {
        principalId: PRINCIPAL_ID,
        workspaceId: WORKSPACE_ID,
        status: 'INVITED',
        invitationEmail: 'other@example.com',
        roles: ['MEMBER'],
      },
    }),
    error => error.code === 'INVITATION_IDENTITY_MISMATCH' && error.status === 409
  );
  assert.equal(registryCalled, false);
});
