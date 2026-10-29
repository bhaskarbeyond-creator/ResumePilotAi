'use strict';

/**
 * Shared fixtures for the Mandate 11A backend suites.
 *
 * Everything here is test plumbing around the REAL application: MariaDB rows,
 * the real invoice business service, the real outbox, the real mailer test
 * injection. There is no in-memory substitute for persistence: the database
 * suites run only when a disposable, migrated MariaDB is configured
 * (`RUN_MARIADB_INTEGRATION=true` plus DB_*), and skip with an explicit
 * "NOT VERIFIED" reason otherwise (the repository's existing convention).
 */

const test = require('node:test');
const crypto = require('node:crypto');

const MARIA_ENABLED = process.env.RUN_MARIADB_INTEGRATION === 'true';
const SKIP_REASON = 'NOT VERIFIED: set RUN_MARIADB_INTEGRATION=true against a disposable migrated MariaDB database (see scripts/dev-db/README.md)';

/** `test()` that skips (never silently passes) when no database is available. */
function mariaTest(name, fn, options = {}) {
  return test(name, { skip: MARIA_ENABLED ? false : SKIP_REASON, ...options }, fn);
}

function isMariaEnabled() {
  return MARIA_ENABLED;
}

/** Validate the configured target exactly as the repository's gate does. */
function requireDisposableTarget() {
  if (!MARIA_ENABLED) return null;
  return require('./disposableMariaDb').loadDisposableMariaDb(process.env);
}

const hex = bytes => crypto.randomBytes(bytes).toString('hex');
const newUid = (prefix = 'usr') => `${prefix}_${hex(8)}`;
const newUuid = () => crypto.randomUUID();
const newId = (prefix = 'id') => `${prefix}_${hex(10)}`;

/** Deterministic test identities, each reachable through its own bearer token. */
const IDENTITIES = Object.freeze({
  owner: { uid: 'm11a-owner-1', email: 'owner@m11a.test', role: 'USER' },
  other: { uid: 'm11a-other-1', email: 'other@m11a.test', role: 'USER' },
  employer: { uid: 'm11a-employer-1', email: 'employer@m11a.test', role: 'USER', employer: true },
  employer2: { uid: 'm11a-employer-2', email: 'employer2@m11a.test', role: 'USER', employer: true },
  candidate: { uid: 'm11a-candidate-1', email: 'candidate@m11a.test', role: 'USER' },
  admin: { uid: 'm11a-admin-1', email: 'admin@m11a.test', role: 'ADMIN' },
  auditor: { uid: 'm11a-auditor-1', email: 'auditor@m11a.test', role: 'AUDITOR' },
});

/** Install the token verifier: tokens are the identity keys above. */
function installIdentities() {
  const { setTokenVerifierForTests } = require('../../security/auth');
  setTokenVerifierForTests(async token => {
    const identity = IDENTITIES[token];
    if (!identity) throw new Error('invalid token');
    return {
      uid: identity.uid,
      email: identity.email,
      email_verified: true,
      role: identity.role,
      ...(identity.employer ? { employer: true } : {}),
      auth_time: Math.floor(Date.now() / 1000),
    };
  });
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Seed the `users` rows the FKs require. */
async function seedUsers(pool, identities = Object.values(IDENTITIES)) {
  for (const identity of identities) {
    await pool.query(
      `INSERT INTO users (id, email, displayName, firstname, lastname, role, membership, paymentStatus)
       VALUES (?, ?, ?, ?, ?, ?, 'Basic', 'INACTIVE')
       ON DUPLICATE KEY UPDATE email = VALUES(email), displayName = VALUES(displayName)`,
      [identity.uid, identity.email, identity.uid, 'Test', identity.uid, identity.role === 'ADMIN' ? 'ADMIN' : 'USER']
    );
  }
}

const SUPPLIER = Object.freeze({
  legalName: 'IME365 Technologies Private Limited',
  tradeName: 'IME365',
  gstin: '37ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  address: '1 Test Tower, MVP Colony',
  city: 'Visakhapatnam',
  state: 'Andhra Pradesh',
  stateCode: '37',
  pincode: '530017',
  country: 'India',
  sacCode: '998313',
  gstRate: 18,
  invoicePrefix: 'IMX',
  financialYear: '26-27',
  email: 'billing@m11a.test',
  phone: '0000000000',
  website: 'https://ime365.test',
});

function customerFor(email, overrides = {}) {
  return {
    name: 'Billing Candidate',
    company: '',
    email,
    gstin: '',
    type: 'B2C / Individual',
    address: '2 Test Street',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    stateCode: '37',
    pincode: '520001',
    country: 'India',
    ...overrides,
  };
}

/**
 * Create a payment order row carrying the frozen billing snapshot, exactly as
 * the checkout flow does before a provider is contacted.
 */
async function seedPaymentOrder({ uid, email, paymentOrderId, amountSubunits = 118000, customerOverrides = {} }) {
  const { getPool } = require('../../database/mysql');
  const { billingSnapshotHash } = require('../../services/invoiceService');
  const customer = customerFor(email, customerOverrides);
  const hash = billingSnapshotHash(customer, SUPPLIER);
  await getPool().query(
    `INSERT INTO payment_orders
       (id, uid, plan_id, provider, amount, currency, status, provider_payment_id,
        billing_snapshot, supplier_snapshot, billing_snapshot_hash, billing_snapshot_version)
     VALUES (?, ?, 'monthly', 'stripe', ?, 'INR', 'ACTIVE', ?, ?, ?, ?, 1)`,
    [paymentOrderId, uid, amountSubunits, `pi_${paymentOrderId}`,
      JSON.stringify(customer), JSON.stringify(SUPPLIER), hash]
  );
  return { customer, hash };
}

/**
 * Issue a REAL invoice through the existing invoice business service.
 *
 * `generateInvoice` is the same function the payment-activation path uses: it
 * locks the payment order, verifies the immutable snapshot hash, computes the
 * GST split, allocates the next statutory invoice number, writes the audit row
 * and queues the customer email — all in one transaction. The suite therefore
 * reads back genuine ledger records, not hand-written fixtures.
 */
async function issueInvoiceFixture({ uid, email, paymentOrderId, amountSubunits = 118000, customerOverrides = {} }) {
  const { generateInvoice } = require('../../services/invoiceService');
  await seedPaymentOrder({ uid, email, paymentOrderId, amountSubunits, customerOverrides });
  const result = await generateInvoice({ uid, paymentOrderId });
  return result.invoice;
}

/** Issue a credit note through the real service, reversing an issued invoice. */
async function creditNoteFixture({ uid, email, paymentOrderId, ref } = {}) {
  const { getPool } = require('../../database/mysql');
  const { issueCreditNoteInTransaction } = require('../../services/invoiceService');
  const pool = getPool();
  const [orders] = await pool.query('SELECT * FROM payment_orders WHERE id = ? LIMIT 1', [paymentOrderId]);
  if (!orders.length) throw new Error(`payment order ${paymentOrderId} must exist before a credit note can be issued`);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await issueCreditNoteInTransaction(connection, {
      order: orders[0],
      providerRefundId: ref || `re_${paymentOrderId}`,
      reason: 'Mandate 11A refund fixture',
      actorUid: uid,
    });
    await connection.commit();
    return result.creditNote;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

/** Insert one enterprise tenant + workspace + configuration (commercial seat cap). */
async function seedEnterpriseTenant(pool, { tenantId = newUuid(), workspaceId = newUuid(), seatLimit = 10, ownerId = IDENTITIES.owner.uid, slug } = {}) {
  await pool.query(
    `INSERT INTO enterprise_tenants (id, slug, displayName, lifecycleState, isolationTier, dataPlane, policyVersion)
     VALUES (?, ?, ?, 'ACTIVE', 'STANDARD', ?, 1)`,
    [tenantId, slug || `tenant-${tenantId.slice(0, 18)}`, 'Mandate 11A Tenant', JSON.stringify({ id: 'mysql-primary', type: 'MYSQL', region: 'default', routingVersion: 1 })]
  );
  await pool.query(
    `INSERT INTO enterprise_workspaces (id, tenantId, name, lifecycleState, isDefault)
     VALUES (?, ?, 'Main Workspace', 'ACTIVE', TRUE)`,
    [workspaceId, tenantId]
  );
  await pool.query(
    `INSERT INTO enterprise_tenant_configurations
       (tenantId, revision, customRoles, aiPolicy, quotaPolicy, retentionPolicy, securityPolicy, identityPolicy, commercials)
     VALUES (?, 1, '{}', '{}', '{}', '{}', '{}', '{}', ?)`,
    [tenantId, JSON.stringify({ plan: 'enterprise-scale', seatLimit, currency: 'INR', billingStatus: 'ACTIVE' })]
  );
  await seedEnterpriseMembership(pool, { tenantId, workspaceId, principalId: ownerId, seatRole: 'OWNER', status: 'ACTIVE' });
  return { tenantId, workspaceId };
}

const SEAT_ROLE_TENANT_ROLE = Object.freeze({
  OWNER: 'ENTERPRISE_OWNER',
  ADMIN: 'ENTERPRISE_ADMIN',
  MEMBER: 'ENTERPRISE_MEMBER',
  VIEWER: 'ENTERPRISE_VIEWER',
});

/** Insert one ACTIVE membership row (directly, so tests can shape seat counts). */
async function seedEnterpriseMembership(pool, { tenantId, workspaceId, principalId, seatRole = 'MEMBER', status = 'ACTIVE' }) {
  const membershipId = `m_${crypto.createHash('sha256').update(`${tenantId}:${principalId}`).digest('hex').slice(0, 24)}`;
  await pool.query(
    `INSERT INTO enterprise_memberships
       (id, tenantId, principalId, canonicalPrincipalId, workspaceId, status, roles, revision, personalTenant)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 1, FALSE)
     ON DUPLICATE KEY UPDATE status = VALUES(status), roles = VALUES(roles)`,
    [membershipId, tenantId, principalId, workspaceId, status, JSON.stringify([SEAT_ROLE_TENANT_ROLE[seatRole] || 'ENTERPRISE_MEMBER'])]
  );
  await pool.query(
    `INSERT INTO enterprise_workspace_memberships (id, tenantId, workspaceId, principalId, status)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [`wm_${crypto.createHash('sha256').update(`${workspaceId}:${principalId}`).digest('hex').slice(0, 24)}`, tenantId, workspaceId, principalId, status]
  );
  return membershipId;
}

/** Insert a PENDING invitation row (and its membership) for seat-count tests. */
async function seedPendingInvitation(pool, { tenantId, workspaceId, principalId, email, expiresAt = new Date(Date.now() + 86_400_000), invitedAt = null }) {
  const membershipId = await seedEnterpriseMembership(pool, { tenantId, workspaceId, principalId, seatRole: 'MEMBER', status: 'INVITED' });
  // `invitedAt` defaults to NOW(6); supplying it lets a test seed an invitation
  // that genuinely lapsed (the schema requires expiresAt > invitedAt).
  await pool.query(
    `INSERT INTO enterprise_membership_invitations
       (id, membershipId, tenantId, principalId, workspaceId, recipientEmail, invitedByPrincipalId,
        invitationState, deliveryState, queueRevision, expiresAt, invitedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'NOTIFICATION_QUEUED', 1, ?, COALESCE(?, NOW(6)))
     ON DUPLICATE KEY UPDATE invitationState = 'PENDING', expiresAt = VALUES(expiresAt), invitedAt = VALUES(invitedAt)`,
    [`inv_${crypto.createHash('sha256').update(membershipId).digest('hex').slice(0, 24)}`, membershipId, tenantId, principalId, workspaceId, email, IDENTITIES.owner.uid, expiresAt, invitedAt]
  );
  return membershipId;
}

/** Insert one portfolio owned by `userId`. */
async function seedPortfolio(pool, { portfolioId, userId, title = 'Test Portfolio', isPublished = false, slug = null }) {
  await pool.query(
    `INSERT INTO portfolios (id, user_id, title, slug, theme, is_published, revision, published_at, data)
     VALUES (?, ?, ?, ?, 'modern', ?, 1, ?, ?)`,
    [portfolioId, userId, title, slug, isPublished ? 1 : 0, isPublished ? new Date() : null, JSON.stringify({ title, slug, isPublished, metadata: { description: 'test', tags: [], seoTitle: '', seoDescription: '' }, data: { content: [], root: { props: {} }, canonical: null } })]
  );
  return portfolioId;
}

/** Insert one job application (and its job) for interview-booking tests. */
async function seedApplication(pool, { applicationId, employerId, applicantId, applicantEmail, status = 'pending' }) {
  const jobId = `job_${crypto.createHash('sha256').update(applicationId).digest('hex').slice(0, 20)}`;
  await pool.query(
    `INSERT INTO jobs (id, employer_id, title, company_name, description, location, job_type, status, created_at)
     VALUES (?, ?, 'Platform Engineer', 'IME365 Test Co', 'Fixture job', 'Remote', 'Full-time', 'OPEN', CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [jobId, employerId]
  );
  await pool.query(
    `INSERT INTO applications (id, job_id, employer_id, applicant_id, applicant_name, applicant_email, status, revision)
     VALUES (?, ?, ?, ?, 'Candidate One', ?, ?, 1)`,
    [applicationId, jobId, employerId, applicantId, applicantEmail, status]
  );
  return applicationId;
}

/** Best-effort cleanup: remove the rows a suite created, in FK-safe order. */
async function cleanup(pool, { userIds = [], tenantIds = [], portfolioIds = [], applicationIds = [], outboxPrefixes = [] } = {}) {
  const run = async (sql, params) => { try { await pool.query(sql, params); } catch (_error) { /* best effort */ } };
  for (const prefix of outboxPrefixes) {
    await run('DELETE FROM notification_outbox WHERE event_id LIKE ?', [`${prefix}%`]);
  }
  for (const applicationId of applicationIds) {
    await run('DELETE FROM interview_slots WHERE booked_by_app_id = ?', [applicationId]);
    await run('DELETE FROM applications WHERE id = ?', [applicationId]);
  }
  for (const portfolioId of portfolioIds) {
    await run('DELETE FROM portfolio_custom_domains WHERE portfolio_id = ?', [portfolioId]);
    await run('DELETE FROM portfolios WHERE id = ?', [portfolioId]);
  }
  for (const tenantId of tenantIds) {
    await run('DELETE FROM enterprise_membership_invitations WHERE tenantId = ?', [tenantId]);
    await run('DELETE FROM enterprise_workspace_memberships WHERE tenantId = ?', [tenantId]);
    await run('DELETE FROM enterprise_memberships WHERE tenantId = ?', [tenantId]);
    await run('DELETE FROM enterprise_workspaces WHERE tenantId = ?', [tenantId]);
    await run('DELETE FROM enterprise_tenant_configurations WHERE tenantId = ?', [tenantId]);
    await run('DELETE FROM enterprise_tenants WHERE id = ?', [tenantId]);
  }
  for (const userId of userIds) {
    await run('DELETE FROM interview_slots WHERE employer_id = ?', [userId]);
    await run('DELETE FROM credit_notes WHERE user_id = ?', [userId]);
    await run('DELETE FROM invoices WHERE user_id = ?', [userId]);
  }
  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',');
    await run(`DELETE FROM payment_refund_provider_references WHERE payment_order_id IN (SELECT id FROM payment_orders WHERE uid IN (${placeholders}))`, userIds);
    await run(`DELETE FROM payment_orders WHERE uid IN (${placeholders})`, userIds);
    await run(`DELETE FROM notification_outbox WHERE recipient IN (${placeholders})`, userIds);
    await run(`DELETE FROM applications WHERE applicant_id IN (${placeholders}) OR employer_id IN (${placeholders})`, [...userIds, ...userIds]);
    await run(`DELETE FROM jobs WHERE employer_id IN (${placeholders})`, userIds);
    await run(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
  }
}

module.exports = {
  IDENTITIES,
  MARIA_ENABLED,
  SKIP_REASON,
  SUPPLIER,
  bearer,
  cleanup,
  creditNoteFixture,
  customerFor,
  installIdentities,
  isMariaEnabled,
  issueInvoiceFixture,
  mariaTest,
  newId,
  newUid,
  newUuid,
  requireDisposableTarget,
  seedApplication,
  seedEnterpriseMembership,
  seedEnterpriseTenant,
  seedPendingInvitation,
  seedPaymentOrder,
  seedPortfolio,
  seedUsers,
};
