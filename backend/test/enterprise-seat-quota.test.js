'use strict';

/**
 * Enterprise seat quota and atomic invitation reservation (DISC-034 / DISC-050).
 *
 * DATABASE-BACKED: every seat count, invitation row, membership row and audit
 * event is asserted against the real MariaDB schema, and the API is exercised
 * over HTTP with supertest against the real enterprise router, the real
 * `MySqlTenantRegistry` and the real `TenantService`.
 *
 * The ONLY test double is the Firebase identity directory (`admin.auth()`),
 * injected at the same seam production uses to resolve an email address to a
 * principal id. Everything the mandate is actually about — seat counting,
 * transaction atomicity, uniqueness, cross-tenant isolation — runs on the
 * database.
 */

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, bearer, newUuid } = fixtures;

if (fixtures.isMariaEnabled()) fixtures.requireDisposableTarget();

const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const { createTenantService } = require('../enterprise/tenantService');
const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
const memberSeats = require('../enterprise/memberSeats');

// Identities used by this suite: the shared fixtures plus a tenant admin and a
// viewer (the two roles the seat surfaces must distinguish).
const LOCAL_IDENTITIES = Object.freeze({
  tenantAdmin: { uid: 'm11a-seat-tenant-admin', email: 'tenant-admin@m11a.test', role: 'USER' },
  viewer: { uid: 'm11a-seat-viewer', email: 'viewer@m11a.test', role: 'USER' },
});
const TEST_IDENTITIES = Object.freeze({ ...fixtures.IDENTITIES, ...LOCAL_IDENTITIES });

require('../security/auth').setTokenVerifierForTests(async token => {
  const identity = TEST_IDENTITIES[token];
  if (!identity) throw new Error('invalid token');
  return {
    uid: identity.uid,
    email: identity.email,
    email_verified: true,
    role: identity.role,
    auth_time: Math.floor(Date.now() / 1000),
  };
});

// ─── Identity directory (external boundary double) ──────────────────────────
// A closed address book of principals that exist in Firebase but have no
// membership yet. `getUserByEmail` is the exact call `TenantService` makes.
const DIRECTORY = new Map();
function directoryPrincipal(uid, email) {
  const record = { uid, email, disabled: false, emailVerified: true };
  DIRECTORY.set(email, record);
  return record;
}

// Every fixture identity already exists in the directory (they hold
// memberships), so re-inviting one of them exercises the membership conflict
// path instead of the unknown-address path.
for (const identity of Object.values(TEST_IDENTITIES)) directoryPrincipal(identity.uid, identity.email);

const directoryAdmin = {
  auth: () => ({
    async getUserByEmail(email) {
      const record = DIRECTORY.get(String(email || '').trim().toLowerCase());
      if (!record) throw Object.assign(new Error('There is no user record corresponding to the provided identifier.'), { code: 'auth/user-not-found' });
      return record;
    },
    async getUser(uid) {
      const record = [...DIRECTORY.values()].find(value => value.uid === uid);
      if (!record) throw Object.assign(new Error('There is no user record corresponding to the provided identifier.'), { code: 'auth/user-not-found' });
      return record;
    },
  }),
};

let pool;
let registry;
const tenants = [];

async function newTenant({ seatLimit = 10, ownerId = fixtures.IDENTITIES.owner.uid, members = [], pending = [] } = {}) {
  const tenantId = newUuid();
  const workspaceId = newUuid();
  await fixtures.seedEnterpriseTenant(pool, { tenantId, workspaceId, seatLimit, ownerId, slug: `m11a-seat-${tenantId.slice(0, 18)}` });
  for (const member of members) {
    await fixtures.seedEnterpriseMembership(pool, {
      tenantId, workspaceId, principalId: member.principalId, seatRole: member.seatRole || 'MEMBER', status: 'ACTIVE',
    });
  }
  for (const invite of pending) {
    await fixtures.seedPendingInvitation(pool, {
      tenantId, workspaceId, principalId: invite.principalId, email: invite.email,
      expiresAt: invite.expiresAt, invitedAt: invite.invitedAt,
    });
  }
  const tenant = { tenantId, workspaceId, ownerId };
  tenants.push(tenant);
  return tenant;
}

async function membershipRow(tenantId, principalId) {
  const [rows] = await pool.query(
    `SELECT m.*, i.recipientEmail, i.invitationState, i.expiresAt AS invitationExpiresAt
       FROM enterprise_memberships m
       LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id
      WHERE m.tenantId = ? AND m.principalId = ?`,
    [tenantId, principalId]
  );
  return rows[0] || null;
}

async function seatRowCount(tenantId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM enterprise_memberships WHERE tenantId = ?', [tenantId]);
  return Number(rows[0].total);
}

/** One distinct invitee per call, registered in the identity directory. */
let inviteeSequence = 0;
function invitee(label = 'invitee') {
  inviteeSequence += 1;
  const uid = `m11a-seat-${label}-${inviteeSequence}-${newUuid().slice(0, 8)}`;
  const email = `${uid}@m11a.test`.toLowerCase();
  directoryPrincipal(uid, email);
  return { uid, email };
}

function invite(tenantId, token, body) {
  return request(app)
    .post('/api/enterprise/members/invite')
    .set(bearer(token))
    .set('x-tenant-id', tenantId)
    .send(body);
}

function seats(tenantId, token) {
  return request(app)
    .get('/api/enterprise/members/seats')
    .set(bearer(token))
    .set('x-tenant-id', tenantId);
}

test.before(async () => {
  if (!fixtures.isMariaEnabled()) return;
  pool = getPool();
  registry = new MySqlTenantRegistry({ pool });
  await fixtures.seedUsers(pool);
  // The production router reads `app.get('tenantService')`; the only injected
  // dependency is the identity directory (see the header).
  app.set('tenantService', createTenantService({ pool, admin: directoryAdmin }));
  await fixtures.seedUsers(pool, Object.values(LOCAL_IDENTITIES));
});

test.after(async () => {
  if (!fixtures.isMariaEnabled()) return;
  for (const tenant of tenants) {
    await fixtures.cleanup(pool, { tenantIds: [tenant.tenantId] });
    await pool.query('DELETE FROM enterprise_audit_events WHERE tenantId = ?', [tenant.tenantId]).catch(() => {});
    await pool.query('DELETE FROM notification_outbox WHERE tenant_id = ?', [tenant.tenantId]).catch(() => {});
  }
  app.set('tenantService', undefined);
  await pool.end().catch(() => {});
});

// ─── Unauthenticated / unauthorized callers ─────────────────────────────────
mariaTest('seat endpoints require authentication and refuse unauthorized roles', async () => {
  const tenant = await newTenant({ seatLimit: 5, members: [
    { principalId: fixtures.IDENTITIES.other.uid, seatRole: 'MEMBER' },
    { principalId: LOCAL_IDENTITIES.viewer.uid, seatRole: 'VIEWER' },
  ] });

  const anonymous = await request(app).get('/api/enterprise/members/seats').set('x-tenant-id', tenant.tenantId);
  assert.equal(anonymous.status, 401);

  for (const token of ['other', 'viewer']) {
    const listed = await seats(tenant.tenantId, token);
    assert.equal(listed.status, 403, `${token} must not read the seat ledger`);
    assert.equal(listed.body.error.code, 'TENANT_FORBIDDEN');

    const target = invitee(`denied-${token}`);
    const denied = await invite(tenant.tenantId, token, { email: target.email, role: 'MEMBER' });
    assert.equal(denied.status, 403, `${token} must not invite`);
    assert.equal(denied.body.error.code, 'TENANT_FORBIDDEN');
    assert.equal(await membershipRow(tenant.tenantId, target.uid), null, 'a refused invite must not write a membership');
  }
});

// ─── Successful invitation consumes exactly one seat ────────────────────────
mariaTest('an owner invitation reserves one seat and persists the pending invitation', async () => {
  const tenant = await newTenant({ seatLimit: 5 });
  const target = invitee('admin');

  const created = await invite(tenant.tenantId, 'owner', { email: target.email.toUpperCase(), role: 'ADMIN' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.success, true);
  assert.equal(created.body.invitation.status, 'INVITED');
  assert.equal(created.body.invitation.role, 'ADMIN');
  assert.equal(created.body.invitation.email, target.email);
  assert.match(created.body.invitation.membershipId, /^[0-9a-f-]{36}_[0-9a-f]{32,64}$/);
  assert.equal(created.body.seatUsage.seatLimit, 5);
  assert.equal(created.body.seatUsage.seatsUsed, 2, 'owner + newly invited seat');
  assert.equal(created.body.seatUsage.pendingInvites, 1);
  assert.equal(created.body.seatUsage.seatsRemaining, 3);

  const row = await membershipRow(tenant.tenantId, target.uid);
  assert.ok(row, 'membership row must be persisted');
  assert.equal(row.status, 'INVITED');
  assert.deepEqual(JSON.parse(row.roles), ['ENTERPRISE_ADMIN']);
  assert.equal(row.recipientEmail, target.email);
  assert.equal(row.invitationState, 'PENDING');

  const [invitationRows] = await pool.query(
    'SELECT notificationId, deliveryState FROM enterprise_membership_invitations WHERE membershipId = ?',
    [row.id]
  );
  assert.equal(invitationRows.length, 1);
  assert.equal(invitationRows[0].deliveryState, 'NOTIFICATION_QUEUED');
  assert.ok(invitationRows[0].notificationId, 'the invitation must be queued in the outbox');
  const [outboxRows] = await pool.query(
    'SELECT recipient, template_type, tenant_id FROM notification_outbox WHERE id = ?',
    [invitationRows[0].notificationId]
  );
  assert.equal(outboxRows.length, 1, 'the outbox row must be durable');
  assert.equal(outboxRows[0].recipient, target.email);
  assert.equal(outboxRows[0].template_type, 'enterprise-invitation');
  assert.equal(outboxRows[0].tenant_id, tenant.tenantId);

  const [auditRows] = await pool.query(
    "SELECT action, metadata FROM enterprise_audit_events WHERE tenantId = ? AND action = 'TENANT_INVITATION_CREATED'",
    [tenant.tenantId]
  );
  assert.equal(auditRows.length, 1, 'the invitation must be audited');
  assert.equal(JSON.parse(auditRows[0].metadata).status, 'INVITED');

  // The seat ledger agrees with the API response.
  const usage = await registry.getSeatUsage({ tenantId: tenant.tenantId });
  assert.equal(usage.seatsUsed, 2);
  assert.equal(usage.pendingInvites, 1);
  assert.equal(usage.activeMembers, 1);
});

// ─── Input validation and role-grant rules ──────────────────────────────────
mariaTest('role vocabulary, email validation and role-grant authorization are enforced', async () => {
  const tenant = await newTenant({ seatLimit: 10 });
  const target = invitee('validation');

  const badRole = await invite(tenant.tenantId, 'owner', { email: target.email, role: 'SUPERUSER' });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.error.code, 'INVALID_ROLE');

  const badEmail = await invite(tenant.tenantId, 'owner', { email: 'not-an-email', role: 'MEMBER' });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.error.code, 'INVALID_INVITATION_EMAIL');

  const unknown = await invite(tenant.tenantId, 'owner', { email: `missing-${newUuid()}@m11a.test`, role: 'MEMBER' });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'TARGET_PRINCIPAL_NOT_FOUND');

  // A tenant administrator may invite, but may not mint owners.
  await fixtures.seedEnterpriseMembership(pool, {
    tenantId: tenant.tenantId, workspaceId: tenant.workspaceId,
    principalId: LOCAL_IDENTITIES.tenantAdmin.uid, seatRole: 'ADMIN', status: 'ACTIVE',
  });
  const ownerGrant = await invite(tenant.tenantId, 'tenantAdmin', { email: invitee('admin-grant').email, role: 'OWNER' });
  assert.equal(ownerGrant.status, 403, JSON.stringify(ownerGrant.body));
  assert.equal(ownerGrant.body.error.code, 'ROLE_GRANT_FORBIDDEN');

  const adminGrant = await invite(tenant.tenantId, 'tenantAdmin', { email: invitee('admin-grants-admin').email, role: 'ADMIN' });
  assert.equal(adminGrant.status, 201, JSON.stringify(adminGrant.body));
  assert.equal(adminGrant.body.invitation.role, 'ADMIN');

  const ownerOwnershipGrant = await invite(tenant.tenantId, 'owner', { email: invitee('owner-grants-owner').email, role: 'OWNER' });
  assert.equal(ownerOwnershipGrant.status, 201, 'an owner may grant ownership');
  assert.equal(ownerOwnershipGrant.body.invitation.role, 'OWNER');

  // Members and viewers hold no grant authority at all (covered above), and the
  // tenant role vocabulary is exactly OWNER / ADMIN / MEMBER / VIEWER.
  assert.deepEqual([...memberSeats.SEAT_ROLES], ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
});

// ─── Seat limit enforcement ────────────────────────────────────────────────
mariaTest('the seat limit returns 409 SEAT_LIMIT_REACHED and writes nothing', async () => {
  const tenant = await newTenant({ seatLimit: 2, members: [{ principalId: fixtures.IDENTITIES.other.uid, seatRole: 'MEMBER' }] });
  assert.equal(await seatRowCount(tenant.tenantId), 2, 'owner + member already fill the workspace');

  const target = invitee('blocked');
  const blocked = await invite(tenant.tenantId, 'owner', { email: target.email, role: 'MEMBER' });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.error.code, 'SEAT_LIMIT_REACHED');
  assert.match(blocked.body.error.message, /seat limit/i);

  assert.equal(await membershipRow(tenant.tenantId, target.uid), null);
  assert.equal(await seatRowCount(tenant.tenantId), 2, 'a rejected invitation must not occupy a seat');
  const [invitations] = await pool.query('SELECT COUNT(*) AS total FROM enterprise_membership_invitations WHERE tenantId = ?', [tenant.tenantId]);
  assert.equal(Number(invitations[0].total), 0);

  const usage = await registry.getSeatUsage({ tenantId: tenant.tenantId });
  assert.equal(usage.seatsUsed, 2);
  assert.equal(usage.seatsRemaining, 0);
  assert.equal(usage.limitReached, true);
});

mariaTest('a pending invitation holds a seat until it expires', async () => {
  const pendingPrincipal = invitee('pending-hold');
  const tenant = await newTenant({
    seatLimit: 2,
    pending: [{ principalId: pendingPrincipal.uid, email: pendingPrincipal.email }],
  });

  const blocked = await invite(tenant.tenantId, 'owner', { email: invitee('after-pending').email, role: 'MEMBER' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, 'SEAT_LIMIT_REACHED');

  const usage = await registry.getSeatUsage({ tenantId: tenant.tenantId });
  assert.equal(usage.pendingInvites, 1);
  assert.equal(usage.seatsUsed, 2);
});

mariaTest('an expired invitation stops consuming a seat and the freed seat is reusable', async () => {
  const lapsed = invitee('lapsed');
  const tenant = await newTenant({
    seatLimit: 2,
    pending: [{
      principalId: lapsed.uid,
      email: lapsed.email,
      invitedAt: new Date(Date.now() - 8 * 86_400_000),
      expiresAt: new Date(Date.now() - 60_000),
    }],
  });

  const usage = await registry.getSeatUsage({ tenantId: tenant.tenantId });
  assert.equal(usage.pendingInvites, 0, 'expired invitations must not hold seats');
  assert.equal(usage.seatsUsed, 1);

  const [expired] = await pool.query(
    'SELECT invitationState FROM enterprise_membership_invitations WHERE tenantId = ? AND principalId = ?',
    [tenant.tenantId, lapsed.uid]
  );
  assert.equal(expired[0].invitationState, 'EXPIRED', 'the read path must expire the lapsed invitation');

  const replacement = invitee('replacement');
  const created = await invite(tenant.tenantId, 'owner', { email: replacement.email, role: 'MEMBER' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.seatUsage.seatsUsed, 2);
});

// ─── Seat ledger reporting ─────────────────────────────────────────────────
mariaTest('GET /members/seats reports the quota for the caller tenant only', async () => {
  const tenant = await newTenant({
    seatLimit: 4,
    members: [{ principalId: fixtures.IDENTITIES.other.uid }],
    pending: [{ principalId: invitee('ledger-pending').uid, email: `pending-${newUuid()}@m11a.test` }],
  });
  const other = await newTenant({ seatLimit: 25, members: [{ principalId: fixtures.IDENTITIES.candidate.uid }] });

  const listed = await seats(tenant.tenantId, 'owner');
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.deepEqual(Object.keys(listed.body).sort(), [
    'activeMembers', 'limitReached', 'ownersIncluded', 'pendingInvites',
    'seatLimit', 'seatsRemaining', 'seatsUsed', 'success',
  ]);
  assert.equal(listed.body.success, true);
  assert.equal(listed.body.seatLimit, 4);
  assert.equal(listed.body.activeMembers, 2, 'owner + active member');
  assert.equal(listed.body.pendingInvites, 1);
  assert.equal(listed.body.seatsUsed, 3);
  assert.equal(listed.body.seatsRemaining, 1);
  assert.equal(listed.body.limitReached, false);
  assert.equal(listed.body.ownersIncluded, 1);

  const otherListed = await seats(other.tenantId, 'owner');
  assert.equal(otherListed.status, 200);
  assert.equal(otherListed.body.seatLimit, 25);
  assert.equal(otherListed.body.seatsUsed, 2);
  assert.equal(otherListed.body.seatsRemaining, 23);

  // Another tenant cannot be addressed by header: the requested tenant id is
  // only honoured when the caller holds a membership there.
  const crossTenant = await seats(other.tenantId, 'candidate');
  assert.equal([403, 404].includes(crossTenant.status), true, `cross-tenant read must fail, got ${crossTenant.status}`);
});

mariaTest('a tenant without a configured cap reports an unlimited quota', async () => {
  const tenantId = newUuid();
  const workspaceId = newUuid();
  await fixtures.seedEnterpriseTenant(pool, { tenantId, workspaceId, seatLimit: 0, ownerId: fixtures.IDENTITIES.owner.uid, slug: `m11a-nocap-${tenantId.slice(0, 18)}` });
  // seatLimit 0 is rejected by the commercials validator, so write NULL directly
  // to represent "no commercial cap configured".
  await pool.query('UPDATE enterprise_tenant_configurations SET commercials = NULL WHERE tenantId = ?', [tenantId]);
  tenants.push({ tenantId, workspaceId, ownerId: fixtures.IDENTITIES.owner.uid });

  const listed = await seats(tenantId, 'owner');
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.seatLimit, null);
  assert.equal(listed.body.seatsRemaining, null);
  assert.equal(listed.body.limitReached, false);

  for (let index = 0; index < 2; index += 1) {
    const created = await invite(tenantId, 'owner', { email: invitee(`nocap-${index}`).email, role: 'VIEWER' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
  }
  assert.equal(await seatRowCount(tenantId), 3);
});

// ─── Duplicate / lifecycle behaviour ───────────────────────────────────────
mariaTest('re-inviting an active member or a pending invitee does not consume a second seat', async () => {
  const tenant = await newTenant({ seatLimit: 3, members: [{ principalId: fixtures.IDENTITIES.other.uid, seatRole: 'MEMBER' }] });
  const target = invitee('duplicate');

  const first = await invite(tenant.tenantId, 'owner', { email: target.email, role: 'VIEWER' });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.seatUsage.seatsUsed, 3);

  const again = await invite(tenant.tenantId, 'owner', { email: target.email, role: 'VIEWER' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'INVITATION_ALREADY_PENDING');

  const existing = await invite(tenant.tenantId, 'owner', { email: fixtures.IDENTITIES.other.email, role: 'VIEWER' });
  assert.equal(existing.status, 409);
  assert.equal(existing.body.error.code, 'MEMBER_ALREADY_EXISTS');

  assert.equal(await seatRowCount(tenant.tenantId), 3, 'failed re-invitations must not add rows');
});

mariaTest('removing a member frees the seat for a new invitation', async () => {
  const tenant = await newTenant({ seatLimit: 2, members: [{ principalId: fixtures.IDENTITIES.other.uid, seatRole: 'MEMBER' }] });

  const blocked = await invite(tenant.tenantId, 'owner', { email: invitee('before-remove').email, role: 'MEMBER' });
  assert.equal(blocked.status, 409);

  const removed = await request(app)
    .delete(`/api/enterprise/memberships/${fixtures.IDENTITIES.other.uid}`)
    .set(bearer('owner'))
    .set('x-tenant-id', tenant.tenantId);
  assert.equal(removed.status, 204, JSON.stringify(removed.body));
  assert.equal(await seatRowCount(tenant.tenantId), 1);

  const created = await invite(tenant.tenantId, 'owner', { email: invitee('after-remove').email, role: 'MEMBER' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.seatUsage.seatsUsed, 2);
  assert.equal(created.body.seatUsage.seatsRemaining, 0);
});

// ─── Concurrency ───────────────────────────────────────────────────────────
mariaTest('concurrent invitations cannot oversubscribe the workspace', async () => {
  const tenant = await newTenant({ seatLimit: 3 });
  const targets = [invitee('race-a'), invitee('race-b'), invitee('race-c'), invitee('race-d')];

  const results = await Promise.all(targets.map(target => invite(tenant.tenantId, 'owner', { email: target.email, role: 'MEMBER' })));
  const statuses = results.map(result => result.status).sort();
  const created = results.filter(result => result.status === 201);
  const rejected = results.filter(result => result.status === 409);

  assert.equal(created.length, 2, `exactly two invitations fit the remaining quota, got statuses ${statuses.join(',')}`);
  assert.equal(rejected.length, 2, `statuses were ${statuses.join(',')}`);
  for (const result of rejected) {
    assert.equal(result.body.error.code, 'SEAT_LIMIT_REACHED');
  }

  assert.equal(await seatRowCount(tenant.tenantId), 3, 'the database must never hold more memberships than the cap');
  const usage = await registry.getSeatUsage({ tenantId: tenant.tenantId });
  assert.equal(usage.seatsUsed, 3);
  assert.equal(usage.seatsRemaining, 0);
  assert.equal(usage.pendingInvites, 2);
});

mariaTest('a failed invitation leaves no seat reservation behind', async () => {
  const tenant = await newTenant({ seatLimit: 2 });
  const target = invitee('rollback');
  const unknownWorkspace = newUuid();

  // The workspace is validated inside the invitation transaction, so this
  // exercises the rollback path after the caller has already passed the
  // permission and seat-capacity checks.
  const response = await invite(tenant.tenantId, 'owner', {
    email: target.email,
    role: 'MEMBER',
    workspaceId: unknownWorkspace,
  });
  assert.equal(response.status, 404, JSON.stringify(response.body));

  const usage = await registry.getSeatUsage({ tenantId: tenant.tenantId });
  assert.equal(usage.seatsUsed, 1, 'the rolled-back attempt must not leave a reservation');
  assert.equal(await membershipRow(tenant.tenantId, target.uid), null);
  const [outbox] = await pool.query('SELECT COUNT(*) AS total FROM notification_outbox WHERE tenant_id = ?', [tenant.tenantId]);
  assert.equal(Number(outbox[0].total), 0, 'no invitation email may be queued for a rolled-back invitation');
});
