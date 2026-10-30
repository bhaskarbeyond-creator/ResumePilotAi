'use strict';

/**
 * Live MariaDB Integration Test Suite for Module 12 & 21:
 * Tenant Custom Domain Management & Automated SSL/TLS Lifecycle (FP-A12 / FP-A21)
 *
 * Verifies:
 * 1. RFC 1123 normalization and domain syntax validation
 * 2. Inactive / non-existent tenant rejection
 * 3. Domain registration, token minting, and DNS instruction generation
 * 4. Cross-tenant and portfolio domain collision prevention
 * 5. DNS TXT verification failure and retry counter tracking
 * 6. Automated Let's Encrypt SSL/TLS provisioning upon verified DNS
 * 7. Querying tenant custom domain metadata
 * 8. Domain deletion and enterprise_tenants dual-state cleanup
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const {
  registerTenantCustomDomain,
  verifyTenantCustomDomainDns,
  getTenantCustomDomain,
  removeTenantCustomDomain,
  TOKEN_PREFIX,
} = require('../services/tenantCustomDomains');

test('Module 12 & 21: Tenant Custom Domains & Automated SSL Suite', async (t) => {
  const pool = getPool();

  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const slugA = `tcd-a-${tenantA.substring(0, 8)}`;
  const slugB = `tcd-b-${tenantB.substring(0, 8)}`;
  const testDomainA = `careers-${tenantA.substring(0, 8)}.examplecorp.com`;
  let activeTokenA = null;

  // Insert active tenant A and inactive tenant B
  await pool.query(
    `INSERT INTO enterprise_tenants (id, displayName, slug, lifecycleState, seat_quota, created_at)
     VALUES (?, 'Corporation A', ?, 'ACTIVE', 50, NOW(3)),
            (?, 'Corporation B (Suspended)', ?, 'SUSPENDED', 10, NOW(3))`,
    [tenantA, slugA, tenantB, slugB]
  );

  t.after(async () => {
    await pool.query('DELETE FROM tenant_custom_domains WHERE tenant_id IN (?, ?)', [tenantA, tenantB]);
    await pool.query('DELETE FROM enterprise_tenants WHERE id IN (?, ?)', [tenantA, tenantB]);
    await pool.end();
  });

  await t.test('1. Rejects domain registration for invalid syntax, non-existent, or inactive tenants', async () => {
    // Non-existent tenant
    await assert.rejects(
      async () => {
        await registerTenantCustomDomain({ tenantId: crypto.randomUUID(), domain: 'valid.example.com', pool });
      },
      (err) => err.code === 'TENANT_NOT_FOUND' && err.status === 404
    );

    // Inactive tenant
    await assert.rejects(
      async () => {
        await registerTenantCustomDomain({ tenantId: tenantB, domain: 'suspended.example.com', pool });
      },
      (err) => err.code === 'TENANT_INACTIVE' && err.status === 409
    );

    // Invalid domain syntax (RFC 1123)
    await assert.rejects(
      async () => {
        await registerTenantCustomDomain({ tenantId: tenantA, domain: 'http://invalid-proto.com', pool });
      },
      (err) => err.code === 'INVALID_DOMAIN' && err.status === 400
    );

    await assert.rejects(
      async () => {
        await registerTenantCustomDomain({ tenantId: tenantA, domain: '-starts-with-dash.com', pool });
      },
      (err) => err.code === 'INVALID_DOMAIN' && err.status === 400
    );
  });

  await t.test('2. Successfully registers custom domain, mints verification token, and updates tenant', async () => {
    const regResult = await registerTenantCustomDomain({
      tenantId: tenantA,
      domain: testDomainA.toUpperCase(), // Test case-insensitivity
      pool,
    });

    assert.equal(regResult.success, true);
    assert.equal(regResult.domain, testDomainA.toLowerCase());
    assert.equal(regResult.dnsStatus, 'PENDING_DNS');
    assert.equal(regResult.sslStatus, 'PENDING_PROVISIONING');
    assert.ok(regResult.verificationToken.startsWith(TOKEN_PREFIX), 'Token must start with ime365-verify=');
    assert.ok(regResult.expiresAt);
    assert.equal(regResult.dnsInstructions.txtRecord.host, testDomainA.toLowerCase());
    assert.equal(regResult.dnsInstructions.txtRecord.value, regResult.verificationToken);
    assert.equal(regResult.dnsInstructions.cnameRecord.target, 'domains.ime365.com');

    activeTokenA = regResult.verificationToken;

    // Verify row in tenant_custom_domains table
    const [rows] = await pool.query('SELECT * FROM tenant_custom_domains WHERE tenant_id = ?', [tenantA]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].domain, testDomainA.toLowerCase());
    assert.equal(rows[0].dns_status, 'PENDING_DNS');
    assert.equal(rows[0].ssl_status, 'PENDING_PROVISIONING');
    assert.equal(rows[0].verify_attempts, 0);

    // Verify dual-state sync with enterprise_tenants
    const [tenants] = await pool.query('SELECT custom_domain FROM enterprise_tenants WHERE id = ?', [tenantA]);
    assert.equal(tenants[0].custom_domain, testDomainA.toLowerCase());
  });

  await t.test('3. Prevents duplicate domain collision across tenants', async () => {
    // Attempt to register same domain on active tenant with different ID
    const otherTenantId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO enterprise_tenants (id, displayName, slug, lifecycleState, seat_quota, created_at)
       VALUES (?, 'Corporation C', 'corp-c', 'ACTIVE', 10, NOW(3))`,
      [otherTenantId]
    );

    try {
      await assert.rejects(
        async () => {
          await registerTenantCustomDomain({
            tenantId: otherTenantId,
            domain: testDomainA,
            pool,
          });
        },
        (err) => err.code === 'DOMAIN_ALREADY_CLAIMED' && err.status === 409
      );
    } finally {
      await pool.query('DELETE FROM enterprise_tenants WHERE id = ?', [otherTenantId]);
    }
  });

  await t.test('4. Gracefully fails DNS verification and increments retry counter when TXT records mismatch', async () => {
    // Mock resolver that returns empty or wrong TXT record
    const mockMismatchedResolver = async () => [['unrelated-txt-record']];

    const verifyResult = await verifyTenantCustomDomainDns({
      tenantId: tenantA,
      domain: testDomainA,
      pool,
      resolver: mockMismatchedResolver,
    });

    assert.equal(verifyResult.success, false);
    assert.equal(verifyResult.dnsStatus, 'PENDING_DNS');
    assert.equal(verifyResult.sslStatus, 'PENDING_PROVISIONING');
    assert.ok(verifyResult.reason.includes('Verification token not found'));
    assert.equal(verifyResult.attemptsRemaining, 19);

    const [rows] = await pool.query('SELECT verify_attempts, last_error FROM tenant_custom_domains WHERE tenant_id = ?', [tenantA]);
    assert.equal(rows[0].verify_attempts, 1);
    assert.ok(rows[0].last_error.includes('Verification token not found'));
  });

  await t.test('5. Successfully verifies DNS and provisions Let\'s Encrypt SSL certificate', async () => {
    // Mock resolver that returns the exact verification token
    const mockMatchingResolver = async () => [[activeTokenA]];

    const verifyResult = await verifyTenantCustomDomainDns({
      tenantId: tenantA,
      domain: testDomainA,
      pool,
      resolver: mockMatchingResolver,
    });

    assert.equal(verifyResult.success, true);
    assert.equal(verifyResult.domain, testDomainA.toLowerCase());
    assert.equal(verifyResult.dnsStatus, 'DNS_VERIFIED');
    assert.equal(verifyResult.sslStatus, 'PROVISIONED');
    assert.equal(verifyResult.sslIssuer, 'letsencrypt');
    assert.ok(verifyResult.sslCertThumbprint, 'Must generate cert thumbprint');
    assert.ok(verifyResult.sslExpiresAt, 'Must set 90-day SSL expiry');
    assert.ok(verifyResult.verifiedAt);

    // Verify DB state
    const [rows] = await pool.query('SELECT * FROM tenant_custom_domains WHERE tenant_id = ?', [tenantA]);
    assert.equal(rows[0].dns_status, 'DNS_VERIFIED');
    assert.equal(rows[0].ssl_status, 'PROVISIONED');
    assert.equal(rows[0].ssl_issuer, 'letsencrypt');
    assert.equal(rows[0].ssl_cert_thumbprint, verifyResult.sslCertThumbprint);
    assert.equal(rows[0].last_error, null);
  });

  await t.test('6. getTenantCustomDomain returns complete domain status and SSL telemetry', async () => {
    const domainInfo = await getTenantCustomDomain({ tenantId: tenantA, pool });
    assert.ok(domainInfo);
    assert.equal(domainInfo.domain, testDomainA.toLowerCase());
    assert.equal(domainInfo.dnsStatus, 'DNS_VERIFIED');
    assert.equal(domainInfo.sslStatus, 'PROVISIONED');
    assert.equal(domainInfo.sslIssuer, 'letsencrypt');
    assert.ok(domainInfo.sslCertThumbprint);
    assert.ok(domainInfo.sslExpiresAt);
    assert.ok(domainInfo.verifiedAt);
    assert.equal(domainInfo.lastError, null);
  });

  await t.test('7. removeTenantCustomDomain deletes claim and clears custom_domain on tenant', async () => {
    const removeResult = await removeTenantCustomDomain({ tenantId: tenantA, pool });
    assert.equal(removeResult.success, true);

    const [claimRows] = await pool.query('SELECT * FROM tenant_custom_domains WHERE tenant_id = ?', [tenantA]);
    assert.equal(claimRows.length, 0);

    const [tenantRows] = await pool.query('SELECT custom_domain FROM enterprise_tenants WHERE id = ?', [tenantA]);
    assert.equal(tenantRows[0].custom_domain, null);

    const domainInfoAfter = await getTenantCustomDomain({ tenantId: tenantA, pool });
    assert.equal(domainInfoAfter, null);
  });
});
