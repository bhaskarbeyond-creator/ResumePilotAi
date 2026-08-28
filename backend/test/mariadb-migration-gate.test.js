'use strict';

/**
 * Destructive MariaDB integration gate.
 *
 * This suite is deliberately opt-in because it removes every table from the
 * configured database before applying the checked-in migrations. It may run
 * only against a disposable local/CI database under NODE_ENV=test. MySQL or a
 * MariaDB release older than 11.4 is rejected; a substitute engine must never
 * be reported as target-database evidence.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { loadDisposableMariaDb } = require('./helpers/disposableMariaDb');

const ENABLED = process.env.RUN_MARIADB_INTEGRATION === 'true';
const DB = ENABLED ? loadDisposableMariaDb(process.env, { destructive: true }) : null;
const DB_HOST = DB?.host;
const DB_PORT = DB?.port;
const DB_USER = DB?.user;
const DB_PASSWORD = DB?.password;
const DB_NAME = DB?.database;

function assertDestructiveTestTarget() {
  assert.ok(DB, 'an explicit disposable MariaDB target is required');
}

async function resetSchema(connection) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    const [tables] = await connection.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
      [DB_NAME]
    );
    for (const row of tables) {
      const tableName = row.TABLE_NAME || row.table_name;
      assert.match(tableName, /^[A-Za-z0-9_]+$/, 'unsafe table identifier returned by information_schema');
      await connection.query(`DROP TABLE \`${tableName}\``);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

function assertMariaDb114(version) {
  assert.match(version, /MariaDB/i, `target engine must be MariaDB, received ${version}`);
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, `could not parse MariaDB version: ${version}`);
  const [, major, minor] = match.map(Number);
  assert.ok(major > 11 || (major === 11 && minor >= 4),
    `MariaDB 11.4 or newer is required, received ${version}`);
}

test('clean MariaDB 11.4 ownership, concurrency, outbox, payment, and deletion integration', {
  skip: ENABLED ? false : 'set RUN_MARIADB_INTEGRATION=true against a disposable MariaDB 11.4 database',
  timeout: 120_000,
}, async (t) => {
  assertDestructiveTestTarget();

  const bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: false,
  });
  const [[engine]] = await bootstrap.query('SELECT VERSION() AS version');
  assertMariaDb114(engine.version);
  await resetSchema(bootstrap);
  await bootstrap.end();

  // These modules capture DB_* at load time; load them only after the explicit
  // target checks and schema reset above.
  const database = require('../database/mysql');
  const { runMigrations, migrationStatus } = require('../database/migrationRunner');
  const MySQLRepository = require('../repositories/MySQLRepository');
  const {
    getPlatformCurrencyConfig,
    setPlatformCurrencyConfig,
  } = require('../services/platformCurrency');
  const {
    getUserAiEntitlement,
    setUserAiQuotaOverride,
  } = require('../services/adminAiEntitlement');
  const {
    queueEmailInTransaction,
    claimDueEvent,
    finishAttempt,
  } = require('../services/notificationOutbox');
  const { requestDeletion, loadRequest } = require('../services/accountDeletion');
  const { billingSnapshotHash, generateInvoice, listInvoicesForUser } = require('../services/invoiceService');

  function billingEvidence(email, { financialYear = '26-27', name = 'Integration Customer' } = {}) {
    const billingSnapshot = {
      name,
      company: '',
      email,
      gstin: '',
      type: 'B2C / Individual',
      address: 'Customer Test Address',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      stateCode: '37',
      pincode: '520001',
      country: 'India',
    };
    const supplierSnapshot = {
      legalName: 'ResumePilot AI Private Limited',
      tradeName: 'ResumePilot AI',
      gstin: '37ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      address: 'Test Business Address',
      city: 'Vijayawada',
      state: 'Andhra Pradesh',
      stateCode: '37',
      pincode: '520001',
      country: 'India',
      sacCode: '998313',
      gstRate: 18,
      invoicePrefix: 'RPA',
      financialYear,
      email: 'billing@example.test',
      phone: '',
      website: '',
    };
    return {
      billingSnapshot,
      supplierSnapshot,
      billingSnapshotHash: billingSnapshotHash(billingSnapshot, supplierSnapshot),
      billingSnapshotVersion: 1,
    };
  }

  const pool = database.getPool();
  const repo = new MySQLRepository();
  const runId = `maria_it_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  const uid = `${runId}_owner`;
  let invoiceOrderId;

  t.after(async () => {
    await database.closePool();
  });

  await t.test('applies the complete checksummed migration chain from empty state and is idempotent', async () => {
    const first = await runMigrations(pool, { mode: 'apply', appliedBy: 'mariadb-integration-gate' });
    assert.equal(first.current, true);
    assert.ok(first.applied.length >= 1, 'an empty database must apply at least the baseline migration');
    assert.deepEqual(first.pending, []);

    const second = await runMigrations(pool, { mode: 'apply', appliedBy: 'mariadb-integration-gate-repeat' });
    assert.equal(second.current, true);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.pending, []);

    const status = await migrationStatus(pool);
    assert.equal(status.current, true);
    assert.deepEqual(status.mismatches, []);
    assert.deepEqual(status.unknownApplied, []);
  });

  await t.test('boots optional modules and discovery publication fail-closed without a fabricated rating', async () => {
    const publicConfig = await repo.getSetting('public_config');
    const optionalFlags = [
      'enableGoogleAuthModule', 'enableFacebookAuthModule', 'enableImportModule',
      'enableCouponsModule', 'enableJobScraperModule', 'enablePortfolioModule',
      'enableMessagesModule', 'enableJobTrackerModule', 'enableAppliedJobsModule',
      'enableCoverLetterModule', 'enableAiSuggestionsModule', 'enableAtsScoreModule',
      'enablePublicSharingModule', 'enableSalesTaxModule',
    ];
    for (const flag of optionalFlags) assert.notEqual(publicConfig.modules?.[flag], true, `${flag} must not boot enabled`);
    assert.notEqual(publicConfig.geoSeo?.enableGeoSeo, true);
    assert.deepEqual(publicConfig.llmGeo, { enableLlmGeo: false, llmsTxtContent: '' });
    const websiteMeta = await repo.getSetting('website_meta');
    assert.equal(Object.hasOwn(websiteMeta, 'rating'), false);
  });

  await t.test('keeps CMS domains relational, revision-guarded, and quarantines legacy generic rows', async () => {
    const pageId = `${runId}-page`;
    await repo.saveCustomPage(pageId, {
      title: 'Integration page', slug: pageId, pagecontent: '<p>Version one</p>',
      status: 'draft', revision: 1,
    });
    const pageWriters = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      repo.saveCustomPage(pageId, {
        title: `Integration page ${index}`, slug: pageId, pagecontent: `<p>Writer ${index}</p>`,
        status: 'published', revision: 2,
      })
    ));
    assert.equal(pageWriters.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(pageWriters.filter(result => result.status === 'rejected' && result.reason?.code === 'CAS_CONFLICT').length, 7);
    const page = await repo.getCustomPageBySlug(pageId, { publishedOnly: true });
    assert.equal(page.revision, 2);
    assert.equal(page.status, 'published');

    const reviewId = `${runId}_review`;
    await repo.saveReview(reviewId, {
      name: 'Integration reviewer', review: 'Relational owner verified', rating: 5,
      status: 'approved', revision: 1,
    });
    assert.equal((await repo.getReviews({ approvedOnly: true })).some(item => item.id === reviewId), true);

    const trustedId = `${runId}_trusted`;
    await repo.saveTrustedBy(trustedId, {
      name: 'Integration organization', imageUrl: 'https://example.test/logo.png',
      published: true, order: 1, revision: 1,
    });
    assert.equal((await repo.getTrustedBy({ publishedOnly: true })).some(item => item.id === trustedId), true);

    for (const type of ['custom_pages', 'reviews', 'trusted_by']) {
      await assert.rejects(
        () => repo.getDocument(type, 'legacy-id'),
        error => error.code === 'DATABASE_OWNERSHIP_VIOLATION'
      );
    }
  });

  await t.test('serializes concurrent operational counter increments without lost updates', async () => {
    const counter = `counter_${crypto.randomBytes(5).toString('hex')}`;
    await Promise.all(Array.from({ length: 24 }, () => repo.incrementStat(counter, 1)));
    const stats = await repo.getStats();
    assert.equal(stats[counter], 24);
  });

  await t.test('enforces profile ownership and exactly-one-winner optimistic concurrency', async () => {
    await repo.saveUserWithRevisionGuard(uid, {
      email: `${runId}@example.test`,
      firstname: 'Initial',
      role: 'SUPER_ADMIN',
      suspended: true,
      customPreference: 'preserved',
    }, 0);

    let stored = await repo.getUser(uid);
    assert.equal(stored.revision, 1);
    assert.equal(stored.role, 'USER', 'profile persistence must not write identity-owned roles');
    assert.equal(stored.suspended, false, 'profile persistence must not disable an identity');
    assert.equal(stored.customPreference, 'preserved');

    const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, index) =>
      repo.saveUserWithRevisionGuard(uid, { ...stored, firstname: `Writer ${index}` }, 1)
    ));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(result => result.status === 'rejected'
      && result.reason?.code === 'PROFILE_CONFLICT').length, 11);

    stored = await repo.getUser(uid);
    assert.equal(stored.revision, 2);
    assert.match(stored.firstname, /^Writer \d+$/);
  });

  await t.test('prevents cross-owner resume-id collisions', async () => {
    const resumeId = `${runId}_shared_resume`;
    await repo.saveResume(uid, resumeId, {
      title: 'Owner copy',
      email: `${runId}@example.test`,
    }, { expectedRevision: 0 });

    await assert.rejects(
      () => repo.saveResume(`${runId}_attacker`, resumeId, {
        title: 'Attacker overwrite',
        email: 'attacker@example.test',
      }, { expectedRevision: 0 }),
      error => error.code === 'RESUME_NOT_FOUND' && error.status === 404
    );
    assert.equal((await repo.getResume(uid, resumeId)).title, 'Owner copy');
  });

  await t.test('commits currency configuration and audit together and rejects stale writers', async () => {
    assert.equal((await getPlatformCurrencyConfig()).revision, 0);
    const updated = await setPlatformCurrencyConfig({
      currency: 'USD',
      allowMultiCurrency: true,
      actorUid: `${runId}_admin`,
      requestId: `${runId}_currency`,
      expectedRevision: 0,
    });
    assert.equal(updated.code, 'USD');
    assert.equal(updated.revision, 1);

    await assert.rejects(
      () => setPlatformCurrencyConfig({
        currency: 'EUR',
        actorUid: `${runId}_stale_admin`,
        expectedRevision: 0,
      }),
      error => error.code === 'CURRENCY_CONFLICT' && error.status === 409
    );
    const authoritative = await getPlatformCurrencyConfig();
    assert.equal(authoritative.code, 'USD');
    assert.equal(authoritative.revision, 1);
    const [[audit]] = await pool.query(
      "SELECT COUNT(*) AS count FROM admin_audit_logs WHERE action = 'PLATFORM_CURRENCY_UPDATED' AND actor_uid = ?",
      [`${runId}_admin`]
    );
    assert.equal(Number(audit.count), 1);
  });

  await t.test('stores AI entitlement overrides only in the MariaDB user owner', async () => {
    const before = await getUserAiEntitlement(null, uid);
    assert.equal(before.source, 'MARIADB');
    const after = await setUserAiQuotaOverride({
      uid,
      dailyLimit: 77,
      maxTokens: 4096,
      reason: 'MariaDB integration gate',
      actorUid: `${runId}_admin`,
      requestId: `${runId}_ai`,
    });
    assert.equal(after.effectiveLimit, 77);
    assert.equal(after.customOverride.dailyLimit, 77);
    assert.equal((await repo.getUser(uid)).aiQuotaOverride.dailyLimit, 77);
  });

  await t.test('rolls outbox entries back with the business transaction and safely reclaims expired leases', async () => {
    const rolledBackEvent = `${runId}_rolled_back`;
    let connection = await pool.getConnection();
    await connection.beginTransaction();
    await queueEmailInTransaction(connection, {
      eventId: rolledBackEvent,
      recipient: 'person@example.test',
      templateType: 'Welcome',
      metadata: { uid },
    });
    await connection.rollback();
    connection.release();
    const [[rolledBack]] = await pool.query(
      'SELECT COUNT(*) AS count FROM notification_outbox WHERE event_id = ?',
      [rolledBackEvent]
    );
    assert.equal(Number(rolledBack.count), 0);

    const durableEvent = `${runId}_durable`;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await queueEmailInTransaction(connection, {
      eventId: durableEvent,
      recipient: 'person@example.test',
      templateType: 'Welcome',
      metadata: { uid },
    });
    await queueEmailInTransaction(connection, {
      eventId: durableEvent,
      recipient: 'person@example.test',
      templateType: 'Welcome',
      metadata: { uid },
    });
    await connection.commit();
    connection.release();

    const [[deduplicated]] = await pool.query(
      'SELECT COUNT(*) AS count FROM notification_outbox WHERE event_id = ?',
      [durableEvent]
    );
    assert.equal(Number(deduplicated.count), 1);

    const firstNow = Date.now() + 10;
    const firstClaim = await claimDueEvent(pool, `${runId}_worker_1`, firstNow);
    assert.equal(firstClaim.eventId, durableEvent);
    assert.equal(await claimDueEvent(pool, `${runId}_worker_2`, firstNow + 1), null,
      'an unexpired lease must exclude competing workers');

    const reclaimed = await claimDueEvent(pool, `${runId}_worker_2`, firstNow + 120_001);
    assert.equal(reclaimed.eventId, durableEvent, 'a crashed worker lease must be reclaimable');
    await finishAttempt(pool, reclaimed, `${runId}_worker_2`, { success: true }, firstNow + 120_001);
    assert.equal(await claimDueEvent(pool, `${runId}_worker_3`, firstNow + 500_000), null,
      'provider-accepted events must be terminal');
  });

  await t.test('derives payment duration under the order lock and makes concurrent activation idempotent', async () => {
    const orderId = `${runId}_yearly_order`;
    const before = await repo.getUser(uid);
    await repo.savePaymentOrder(orderId, {
      uid,
      planId: 'yearly',
      provider: 'stripe',
      amount: 12000,
      currency: 'INR',
      status: 'PENDING_PAYMENT',
      revision: 1,
      mutationId: `${runId}_created`,
      ...billingEvidence(`${runId}@example.test`, { financialYear: '25-26', name: 'Duration Customer' }),
    });

    const activations = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      repo.activatePaymentOrderAtomic({
        orderId,
        gatewayLabel: 'Stripe',
        providerPaymentId: `${runId}_provider_payment`,
        mutationId: `${runId}_activation_${index}`,
        // Deliberately hostile legacy input: the repository must ignore it and
        // derive twelve months from the locked `yearly` order row.
        months: 600,
      })
    ));
    assert.equal(activations.filter(result => result.duplicate === false).length, 1);
    assert.equal(activations.filter(result => result.duplicate === true).length, 7);
    const active = activations.find(result => result.duplicate === false);
    const durationDays = (Date.parse(active.membershipEnds) - Date.now()) / 86_400_000;
    assert.ok(durationDays > 360 && durationDays < 370,
      `yearly plan should grant about twelve months, received ${durationDays} days`);

    const user = await repo.getUser(uid);
    assert.equal(user.lastPaymentOrderId, orderId);
    assert.equal(user.paymentStatus, 'ACTIVE');
    assert.equal(user.revision, before.revision + 1);
    assert.equal((await repo.getUserPaymentOrders(uid)).filter(order => order.id === orderId).length, 1);
    const [[notification]] = await pool.query(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'payment_active'",
      [uid]
    );
    assert.equal(Number(notification.count), 1);

    await assert.rejects(
      () => repo.activatePaymentOrderAtomic({
        orderId,
        gatewayLabel: 'Stripe',
        providerPaymentId: `${runId}_different_payment`,
        mutationId: `${runId}_conflict`,
      }),
      error => error.code === 'PAYMENT_ID_CONFLICT'
    );

    const invalidOrderId = `${runId}_invalid_plan`;
    // Seed an invalid historical/corrupt row directly to prove activation still
    // fails closed even when repository input validation is bypassed.
    await pool.query(
      `INSERT INTO payment_orders (id, uid, plan_id, provider, amount, original_amount, currency, status, revision)
       VALUES (?, ?, 'attacker-plan', 'stripe', 1, 1, 'INR', 'PENDING_PAYMENT', 1)`,
      [invalidOrderId, uid]
    );
    await assert.rejects(
      () => repo.activatePaymentOrderAtomic({
        orderId: invalidOrderId,
        gatewayLabel: 'Stripe',
        mutationId: `${runId}_invalid`,
      }),
      error => error.code === 'INVALID_PLAN_DURATION'
    );
    assert.equal((await repo.getPaymentOrder(invalidOrderId)).status, 'PENDING_PAYMENT',
      'unsupported-plan activation must roll back');
  });

  await t.test('issues exactly one owner-bound invoice and allocates its sequence transactionally', async () => {
    const publicConfig = (await repo.getSetting('public_config')) || {};
    await repo.saveSetting('public_config', {
      ...publicConfig,
      subscriptions: {
        ...(publicConfig.subscriptions || {}),
        supplierLegalName: 'ResumePilot AI Private Limited',
        supplierTradeName: 'ResumePilot AI',
        supplierGstin: '37ABCDE1234F1Z5',
        supplierPan: 'ABCDE1234F',
        supplierAddress: 'Test Business Address',
        supplierCity: 'Vijayawada',
        supplierState: 'Andhra Pradesh',
        supplierStateCode: '37',
        supplierPincode: '520001',
        sacCode: '998313',
        taxRate: 18,
        invoicePrefix: 'RPA',
        financialYear: '26-27',
        supplierEmail: 'billing@example.test',
      },
    }, 1);
    invoiceOrderId = `${runId}_invoice_order`;
    await repo.savePaymentOrder(invoiceOrderId, {
      uid,
      planId: 'monthly',
      provider: 'stripe',
      amount: 49900,
      currency: 'INR',
      status: 'PENDING_PAYMENT',
      revision: 1,
      ...billingEvidence(`${runId}@example.test`),
    });
    const activation = await repo.activatePaymentOrderAtomic({
      orderId: invoiceOrderId,
      gatewayLabel: 'Stripe',
      providerPaymentId: `${runId}_invoice_payment`,
      mutationId: `${runId}_invoice_activation`,
    });
    assert.equal(activation.invoiceStatus, 'ISSUED');
    assert.match(activation.invoice.invoiceNumber, /^RPA\/26-27\/\d{6}$/);
    const attempts = await Promise.all(Array.from({ length: 8 }, () => generateInvoice({
      uid, paymentOrderId: invoiceOrderId,
    })));
    assert.equal(attempts.filter(result => result.duplicate === false).length, 0);
    assert.equal(attempts.filter(result => result.duplicate === true).length, 8);
    assert.equal(new Set(attempts.map(result => result.invoice.invoiceNumber)).size, 1);
    assert.equal(attempts[0].invoice.grandTotal, 499);
    const [[invoiceRows]] = await pool.query(
      'SELECT COUNT(*) AS count FROM invoices WHERE payment_order_id = ?', [invoiceOrderId]
    );
    assert.equal(Number(invoiceRows.count), 1);
    const [[counter]] = await pool.query(
      "SELECT next_sequence FROM invoice_counters WHERE financial_year = '26-27'"
    );
    assert.equal(Number(counter.next_sequence), 2);
    await assert.rejects(
      () => generateInvoice({ uid: `${runId}_attacker`, paymentOrderId: invoiceOrderId }),
      error => error.code === 'PAYMENT_ORDER_NOT_FOUND' && error.status === 404
    );
  });

  await t.test('reconciles a pending full refund and issues exactly one immutable credit note', async () => {
    const firstClaim = await repo.claimPaymentRefundAtomic({
      orderId: invoiceOrderId,
      actorUid: `${runId}_admin`,
      reason: 'MariaDB refund reconciliation gate',
    });
    assert.equal(firstClaim.status, 'REFUND_PENDING');
    assert.match(firstClaim.refundIdempotencyKey, /^refund_[a-f0-9]{30}$/);

    await repo.recordPaymentRefundSubmittedAtomic({
      orderId: invoiceOrderId,
      claimId: firstClaim.claimId,
      providerRefundId: `${runId}_refund`,
      providerRefundStatus: 'PENDING',
    });
    const reconciliationClaim = await repo.claimPaymentRefundAtomic({
      orderId: invoiceOrderId,
      actorUid: `${runId}_admin`,
      reason: 'Retry text must not replace original reason',
    });
    assert.equal(reconciliationClaim.refundIdempotencyKey, firstClaim.refundIdempotencyKey);
    assert.equal(reconciliationClaim.refundReason, 'MariaDB refund reconciliation gate');

    const reversed = await repo.reversePaymentEntitlementAtomic({
      orderId: invoiceOrderId,
      status: 'REFUNDED',
      expectedRefundClaimId: reconciliationClaim.claimId,
      providerRefundId: `${runId}_refund`,
    });
    assert.equal(reversed.status, 'REFUNDED');
    assert.match(reversed.creditNote.creditNoteNumber, /^CN\/26-27\/\d{6}$/);
    const duplicate = await repo.reversePaymentEntitlementAtomic({
      orderId: invoiceOrderId,
      status: 'REFUNDED',
      providerRefundId: `${runId}_refund`,
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.creditNote.creditNoteNumber, reversed.creditNote.creditNoteNumber);

    const [[creditCount]] = await pool.query(
      'SELECT COUNT(*) AS count FROM credit_notes WHERE payment_order_id = ?', [invoiceOrderId]
    );
    assert.equal(Number(creditCount.count), 1);
    const invoiceHistory = await listInvoicesForUser({ uid });
    const refundedInvoice = invoiceHistory.find(invoice => invoice.paymentOrderId === invoiceOrderId);
    assert.equal(refundedInvoice.creditNote.creditNoteNumber, reversed.creditNote.creditNoteNumber);
  });

  await t.test('makes identity-provider failure durable and completes deletion on retry', async () => {
    const deletionUid = `${runId}_delete_user`;
    const resumeId = `${runId}_delete_resume`;
    const paymentId = `${runId}_retained_payment`;
    await repo.saveUserWithRevisionGuard(deletionUid, {
      email: `${runId}.delete@example.test`,
      firstname: 'Delete',
    }, 0);
    await repo.saveResume(deletionUid, resumeId, {
      title: 'Private content',
      email: `${runId}.delete@example.test`,
    }, { expectedRevision: 0 });
    await repo.savePaymentOrder(paymentId, {
      uid: deletionUid,
      planId: 'monthly',
      provider: 'stripe',
      amount: 99,
      currency: 'INR',
      status: 'PENDING_PAYMENT',
      revision: 1,
      ...billingEvidence(`${runId}.delete@example.test`, { name: 'Deletion Customer' }),
    });

    await assert.rejects(
      () => requestDeletion({
        uid: deletionUid,
        actorUid: deletionUid,
        requestId: `${runId}_delete_fail`,
        identityAdmin: { auth: () => ({
          deleteUser: async () => { throw Object.assign(new Error('identity outage'), { code: 'auth/internal-error' }); },
        }) },
      }),
      error => error.code === 'ACCOUNT_IDENTITY_DELETE_FAILED' && error.identityPending === true
    );
    let ledger = await loadRequest(null, deletionUid);
    assert.equal(ledger.status, 'IDENTITY_PENDING');
    assert.equal((await pool.query('SELECT id FROM resumes WHERE user_id = ?', [deletionUid]))[0].length, 0);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM payment_orders WHERE uid = ?', [deletionUid]))[0][0].count), 1,
      'financial records must remain under retention');

    let deletedIdentity = null;
    const completed = await requestDeletion({
      uid: deletionUid,
      actorUid: deletionUid,
      requestId: `${runId}_delete_retry`,
      identityAdmin: { auth: () => ({ deleteUser: async value => { deletedIdentity = value; } }) },
    });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(deletedIdentity, deletionUid);
    ledger = await loadRequest(null, deletionUid);
    assert.equal(ledger.status, 'COMPLETED');
    assert.equal(ledger.identityDeleted, true);
    const [[deletedUser]] = await pool.query(
      'SELECT email, deleted_at, suspended FROM users WHERE id = ?',
      [deletionUid]
    );
    assert.ok(deletedUser.deleted_at);
    assert.equal(deletedUser.suspended, 1);
    assert.match(deletedUser.email, /^deleted\+/);
  });
});
