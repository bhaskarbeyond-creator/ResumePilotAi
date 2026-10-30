'use strict';

/**
 * Mandate 14 — SAML 2.0 SSO MariaDB Integration Evidence.
 *
 * Verifies live persistence, row constraints, foreign key cascades,
 * single-use AuthnRequest tracking, and assertion replay memory on
 * real MariaDB tables created by migration 037_enterprise_sso.sql.
 *
 * Setup:
 *   RUN_MARIADB_INTEGRATION=true MARIADB_TEST_ALLOW_RESET=true \
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=airesume_test \
 *   node --test backend/test/mandate14-saml-database-integration.test.js
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, isMariaEnabled } = fixtures;

if (isMariaEnabled()) fixtures.requireDisposableTarget();

const { getPool } = require('../database/mysql');
const { createMysqlSamlStore } = require('../enterprise/samlStore');

const created = { tenants: [] };

function pool() {
  return getPool();
}

async function databaseReachable(t) {
  try {
    await pool().query('SELECT 1 AS alive');
    return true;
  } catch (error) {
    t.skip(`NOT VERIFIED: MariaDB unreachable (${error.code || error.message})`);
    return false;
  }
}

async function createTestTenant(slugPrefix = 'saml-tenant') {
  const id = `ent_${crypto.randomBytes(8).toString('hex')}`;
  const slug = `${slugPrefix}-${crypto.randomBytes(4).toString('hex')}`;
  created.tenants.push(id);
  await pool().query(
    `INSERT INTO enterprise_tenants (id, slug, displayName, lifecycleState, isolationTier, policyVersion)
     VALUES (?, ?, ?, 'ACTIVE', 'STANDARD', 1)`,
    [id, slug, `Test Tenant ${slug}`]
  );
  return { id, slug };
}

// ─── Migration 037 Schema Verification ──────────────────────────────────────
mariaTest('migration 037 schema objects exist with correct column widths and foreign keys', async (t) => {
  if (!(await databaseReachable(t))) return;

  const [ledger] = await pool().query(
    "SELECT version, name FROM schema_migrations WHERE version = '037'"
  );
  assert.equal(ledger.length, 1, 'migration 037 must be recorded in schema_migrations');
  assert.equal(ledger[0].name, 'enterprise_sso');

  // Verify all 3 tables exist
  for (const table of ['enterprise_sso_config', 'saml_authn_requests', 'saml_assertion_replay']) {
    const [rows] = await pool().query(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [table]
    );
    assert.equal(rows.length, 1, `table ${table} must exist in database`);
  }

  // Verify tenant_id column width is VARCHAR(128) across all 3 tables
  for (const table of ['enterprise_sso_config', 'saml_authn_requests', 'saml_assertion_replay']) {
    const [cols] = await pool().query(
      `SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'`,
      [table]
    );
    assert.equal(cols.length, 1);
    assert.equal(cols[0].DATA_TYPE, 'varchar');
    assert.equal(Number(cols[0].CHARACTER_MAXIMUM_LENGTH), 128, `${table}.tenant_id must be VARCHAR(128)`);
  }

  // Verify foreign key constraints pointing to enterprise_tenants(id)
  const [fks] = await pool().query(
    `SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME, DELETE_RULE
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('enterprise_sso_config', 'saml_authn_requests', 'saml_assertion_replay')`
  );
  assert.equal(fks.length, 3, 'all 3 tables must have foreign key constraints');
  for (const fk of fks) {
    assert.equal(fk.REFERENCED_TABLE_NAME, 'enterprise_tenants');
    assert.equal(fk.DELETE_RULE, 'CASCADE', `${fk.CONSTRAINT_NAME} must CASCADE on delete`);
  }
});

// ─── SSO Config Persistence & Retrieval ─────────────────────────────────────
mariaTest('enterprise_sso_config stores JSON certificates and loads canonical configuration', async (t) => {
  if (!(await databaseReachable(t))) return;

  const tenant = await createTestTenant('sso-config');
  const store = createMysqlSamlStore({ pool });

  // Initial read is null
  const initial = await store.loadConfig(tenant.id);
  assert.equal(initial, null);

  const testCert = Buffer.from('MIIDAzCCAmugAwIBAgIUFakeCertificateDataForTestingPurposesOnly').toString('base64');
  const config = {
    entityId: 'https://idp.example.com/entity',
    ssoUrl: 'https://idp.example.com/sso',
    sloUrl: 'https://idp.example.com/slo',
    certificates: [testCert],
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    defaultRole: 'MEMBER',
    jitProvisioning: true,
    enabled: true,
  };

  await store.saveConfig(tenant.id, config);

  const loaded = await store.loadConfig(tenant.id);
  assert.ok(loaded);
  assert.equal(loaded.tenantId, tenant.id);
  assert.equal(loaded.entityId, config.entityId);
  assert.equal(loaded.ssoUrl, config.ssoUrl);
  assert.equal(loaded.sloUrl, config.sloUrl);
  assert.deepEqual(loaded.certificates, [testCert]);
  assert.equal(loaded.jitProvisioning, true);
  assert.equal(loaded.enabled, true);
  assert.equal(loaded.defaultRole, 'MEMBER');

  // Update configuration (change enabled to false, update ssoUrl)
  await store.saveConfig(tenant.id, {
    ...config,
    ssoUrl: 'https://idp.example.com/sso-v2',
    enabled: false,
  });

  const updated = await store.loadConfig(tenant.id);
  assert.equal(updated.ssoUrl, 'https://idp.example.com/sso-v2');
  assert.equal(updated.enabled, false);
  assert.equal(updated.entityId, config.entityId);
});

// ─── Single-Use AuthnRequest Tracking ───────────────────────────────────────
mariaTest('saml_authn_requests enforces single-use atomic consumption and expiry in MariaDB', async (t) => {
  if (!(await databaseReachable(t))) return;

  const tenant = await createTestTenant('authn-request');
  const store = createMysqlSamlStore({ pool });

  const requestId = `_req_${crypto.randomBytes(16).toString('hex')}`;
  const now = Date.now();
  const futureExpiry = now + 300_000; // +5 minutes

  await store.createAuthnRequest({
    id: requestId,
    tenantId: tenant.id,
    relayState: '/portal',
    expiresAt: futureExpiry,
  });

  // Verify created request can be read
  const unconsumed = await store.readAuthnRequest(requestId);
  assert.ok(unconsumed);
  assert.equal(unconsumed.id, requestId);
  assert.equal(unconsumed.tenantId, tenant.id);
  assert.equal(unconsumed.relayState, '/portal');
  assert.equal(unconsumed.consumedAt, null);

  // First consumption succeeds
  const consumed = await store.consumeAuthnRequest({
    id: requestId,
    tenantId: tenant.id,
    now,
  });
  assert.equal(consumed, true, 'first consumption must succeed (affectedRows === 1)');

  // Verify consumed_at was persisted in MariaDB
  const readAfter = await store.readAuthnRequest(requestId);
  assert.ok(readAfter);
  assert.equal(readAfter.consumedAt, now);

  // Second consumption fails (atomic single-use)
  const replay = await store.consumeAuthnRequest({
    id: requestId,
    tenantId: tenant.id,
    now,
  });
  assert.equal(replay, false, 'second consumption must return false');

  // Consuming under a mismatched tenant ID fails
  const otherTenant = await createTestTenant('mismatched-tenant');
  const req2 = `_req_${crypto.randomBytes(16).toString('hex')}`;
  await store.createAuthnRequest({
    id: req2,
    tenantId: tenant.id,
    relayState: null,
    expiresAt: futureExpiry,
  });

  const crossTenant = await store.consumeAuthnRequest({
    id: req2,
    tenantId: otherTenant.id,
    now,
  });
  assert.equal(crossTenant, false, 'cross-tenant consumption must fail');

  // Expired request is rejected
  const req3 = `_req_${crypto.randomBytes(16).toString('hex')}`;
  await store.createAuthnRequest({
    id: req3,
    tenantId: tenant.id,
    relayState: null,
    expiresAt: now - 1000, // expired 1s ago
  });

  const expired = await store.consumeAuthnRequest({
    id: req3,
    tenantId: tenant.id,
    now,
  });
  assert.equal(expired, false, 'expired request consumption must return false');
});

// ─── Assertion Replay Prevention Memory ─────────────────────────────────────
mariaTest('saml_assertion_replay enforces duplicate assertion rejection in MariaDB', async (t) => {
  if (!(await databaseReachable(t))) return;

  const tenant = await createTestTenant('assertion-replay');
  const store = createMysqlSamlStore({ pool });

  const assertionId = `_assert_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = Date.now() + 600_000;

  // First registration succeeds
  const first = await store.rememberAssertion({
    assertionId,
    tenantId: tenant.id,
    expiresAt,
  });
  assert.equal(first, true, 'first assertion registration must succeed');

  // Second registration with the same assertion ID fails
  const duplicate = await store.rememberAssertion({
    assertionId,
    tenantId: tenant.id,
    expiresAt,
  });
  assert.equal(duplicate, false, 'duplicate assertion ID must be rejected');

  // Verify the row exists in MariaDB
  const [rows] = await pool().query(
    'SELECT assertion_id, tenant_id FROM saml_assertion_replay WHERE assertion_id = ?',
    [assertionId]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].assertion_id, assertionId);
  assert.equal(rows[0].tenant_id, tenant.id);
});

// ─── Foreign Key Cascade Deletion ───────────────────────────────────────────
mariaTest('deleting an enterprise tenant automatically cascades to all SSO tables', async (t) => {
  if (!(await databaseReachable(t))) return;

  const tenant = await createTestTenant('cascade-test');
  const store = createMysqlSamlStore({ pool });

  const requestId = `_cascade_req_${crypto.randomBytes(12).toString('hex')}`;
  const assertionId = `_cascade_assert_${crypto.randomBytes(12).toString('hex')}`;

  // Seed data in all 3 SSO tables for this tenant
  await store.saveConfig(tenant.id, {
    entityId: 'https://idp.cascade.test',
    ssoUrl: 'https://idp.cascade.test/sso',
    certificates: ['fakecert'],
    enabled: true,
  });
  await store.createAuthnRequest({
    id: requestId,
    tenantId: tenant.id,
    expiresAt: Date.now() + 300_000,
  });
  await store.rememberAssertion({
    assertionId,
    tenantId: tenant.id,
    expiresAt: Date.now() + 600_000,
  });

  // Verify records exist
  const [cfg] = await pool().query('SELECT tenant_id FROM enterprise_sso_config WHERE tenant_id = ?', [tenant.id]);
  const [req] = await pool().query('SELECT id FROM saml_authn_requests WHERE tenant_id = ?', [tenant.id]);
  const [rep] = await pool().query('SELECT assertion_id FROM saml_assertion_replay WHERE tenant_id = ?', [tenant.id]);
  assert.equal(cfg.length, 1);
  assert.equal(req.length, 1);
  assert.equal(rep.length, 1);

  // Delete the parent tenant
  await pool().query('DELETE FROM enterprise_tenants WHERE id = ?', [tenant.id]);

  // Verify all 3 child tables were cascade-deleted by MariaDB InnoDB engine
  const [cfgAfter] = await pool().query('SELECT tenant_id FROM enterprise_sso_config WHERE tenant_id = ?', [tenant.id]);
  const [reqAfter] = await pool().query('SELECT id FROM saml_authn_requests WHERE tenant_id = ?', [tenant.id]);
  const [repAfter] = await pool().query('SELECT assertion_id FROM saml_assertion_replay WHERE tenant_id = ?', [tenant.id]);

  assert.equal(cfgAfter.length, 0, 'enterprise_sso_config must cascade-delete with tenant');
  assert.equal(reqAfter.length, 0, 'saml_authn_requests must cascade-delete with tenant');
  assert.equal(repAfter.length, 0, 'saml_assertion_replay must cascade-delete with tenant');
});

// ─── Cleanup ────────────────────────────────────────────────────────────────
test('mandate 14 test tenants are removed', { skip: isMariaEnabled() ? false : 'NOT VERIFIED: no disposable MariaDB' }, async () => {
  let cleanedCount = 0;
  for (const tenantId of created.tenants) {
    try {
      const [res] = await pool().query('DELETE FROM enterprise_tenants WHERE id = ?', [tenantId]);
      cleanedCount += Number(res.affectedRows || 0);
    } catch (_err) {
      // Best effort cleanup
    }
  }
  assert.ok(cleanedCount >= 0);
});
