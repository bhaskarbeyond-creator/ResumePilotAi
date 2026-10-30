'use strict';

/**
 * Live MariaDB Integration Test Suite for Module 15:
 * Dynamic Tenant Branding & Whitelabel Configuration (FP-A15)
 *
 * Verifies:
 * 1. Default tenant branding schema in defaultTenantConfiguration
 * 2. Branding input sanitization (URLs, hex/rgb colors, CSS script injection defense)
 * 3. MariaDB persistence in enterprise_tenant_configurations (Migration 039)
 * 4. Tenant configuration round-trip via mysqlTenantRegistry
 * 5. Public discovery endpoint GET /api/public/tenant-branding/:slugOrDomain
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { MySqlTenantRegistry, defaultTenantConfiguration } = require('../enterprise/mysqlTenantRegistry');

test('Module 15: Dynamic Tenant Branding & Whitelabel Suite', async (t) => {
  const pool = getPool();
  const registry = new MySqlTenantRegistry({ pool });

  const testTenantId = crypto.randomUUID();
  const testSlug = `brand-${testTenantId.substring(0, 8)}`;

  // Setup test tenant in enterprise_tenants
  await pool.query(
    `INSERT INTO enterprise_tenants (id, displayName, slug, lifecycleState, seat_quota, created_at)
     VALUES (?, 'Acme Global Careers', ?, 'ACTIVE', 25, NOW(3))`,
    [testTenantId, testSlug]
  );

  // Setup initial enterprise_tenant_configurations
  await pool.query(
    `INSERT INTO enterprise_tenant_configurations (tenantId, revision, customRoles, aiPolicy, quotaPolicy, retentionPolicy, securityPolicy, identityPolicy, commercials, branding)
     VALUES (?, 1, '{}', '{}', '{}', '{}', '{}', '{}', NULL, NULL)`,
    [testTenantId]
  );

  t.after(async () => {
    await pool.query('DELETE FROM enterprise_tenant_configurations WHERE tenantId = ?', [testTenantId]);
    await pool.query('DELETE FROM enterprise_tenants WHERE id = ?', [testTenantId]);
    await pool.end();
  });

  await t.test('1. defaultTenantConfiguration exposes authoritative branding defaults', () => {
    const defaults = defaultTenantConfiguration(testTenantId);
    assert.ok(defaults.branding, 'defaultTenantConfiguration must include branding object');
    assert.equal(defaults.branding.brandName, '');
    assert.equal(defaults.branding.logoUrl, '');
    assert.equal(defaults.branding.darkLogoUrl, '');
    assert.equal(defaults.branding.faviconUrl, '');
    assert.equal(defaults.branding.primaryColor, '');
    assert.equal(defaults.branding.accentColor, '');
    assert.equal(defaults.branding.customCss, '');
    assert.equal(defaults.branding.hidePlatformBadge, false);
  });

  await t.test('2. updateTenantConfiguration persists valid branding to MariaDB', async () => {
    const updateInput = {
      branding: {
        brandName: 'Acme Careers Worldwide',
        logoUrl: 'https://cdn.example.com/acme/logo.svg',
        darkLogoUrl: 'https://cdn.example.com/acme/dark-logo.svg',
        faviconUrl: 'https://cdn.example.com/acme/favicon.ico',
        primaryColor: '#0ea5e9',
        accentColor: '#6366f1',
        customCss: '.tenant-header { font-family: Outfit, sans-serif; }',
        hidePlatformBadge: true,
      },
    };

    const updated = await registry.updateTenantConfiguration({
      tenantId: testTenantId,
      input: updateInput,
      expectedRevision: 1,
    });

    assert.equal(updated.revision, 2);
    assert.equal(updated.branding.brandName, 'Acme Careers Worldwide');
    assert.equal(updated.branding.logoUrl, 'https://cdn.example.com/acme/logo.svg');
    assert.equal(updated.branding.primaryColor, '#0ea5e9');
    assert.equal(updated.branding.accentColor, '#6366f1');
    assert.equal(updated.branding.hidePlatformBadge, true);

    // Verify row directly in MariaDB
    const [rows] = await pool.query(
      'SELECT branding, revision FROM enterprise_tenant_configurations WHERE tenantId = ?',
      [testTenantId]
    );
    assert.equal(rows.length, 1);
    const dbBranding = JSON.parse(rows[0].branding);
    assert.equal(dbBranding.brandName, 'Acme Careers Worldwide');
    assert.equal(dbBranding.primaryColor, '#0ea5e9');
    assert.equal(dbBranding.hidePlatformBadge, true);
  });

  await t.test('3. getTenantConfiguration retrieves persisted branding from database', async () => {
    const config = await registry.getTenantConfiguration(testTenantId);
    assert.equal(config.revision, 2);
    assert.ok(config.branding, 'Branding must be present in retrieved config');
    assert.equal(config.branding.brandName, 'Acme Careers Worldwide');
    assert.equal(config.branding.logoUrl, 'https://cdn.example.com/acme/logo.svg');
    assert.equal(config.branding.hidePlatformBadge, true);
  });

  await t.test('4. Branding sanitization strips dangerous CSS and invalid URLs', async () => {
    const maliciousInput = {
      branding: {
        brandName: '  Malicious Corp  ',
        logoUrl: 'javascript:alert(1)', // Malicious URL scheme
        primaryColor: 'invalid-not-a-color-injection',
        customCss: '.test { background: red; } <script>alert("xss")</script> @import url("evil.com");',
        hidePlatformBadge: false,
      },
    };

    const updated = await registry.updateTenantConfiguration({
      tenantId: testTenantId,
      input: maliciousInput,
      expectedRevision: 2,
    });

    assert.equal(updated.branding.brandName, 'Malicious Corp');
    assert.equal(updated.branding.logoUrl, '', 'javascript: URL must be stripped');
    assert.equal(updated.branding.primaryColor, '', 'Invalid color must be stripped');
    assert.equal(updated.branding.customCss, '', 'CSS containing <script> or @import must be stripped');
    assert.equal(updated.branding.hidePlatformBadge, false);
  });

  await t.test('5. Public discovery endpoint serves branding for active tenant', async () => {
    const express = require('express');
    const request = require('supertest');
    const { publicDiscoveryRouter } = require('../routes/publicDiscovery');

    const app = express();
    app.use('/api/public', publicDiscoveryRouter);

    const res = await request(app).get(`/api/public/tenant-branding/${testSlug}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.tenant.id, testTenantId);
    assert.equal(res.body.tenant.slug, testSlug);
    assert.equal(res.body.branding.brandName, 'Malicious Corp');
  });

  await t.test('6. Public discovery returns 404 for unknown tenant identifier', async () => {
    const express = require('express');
    const request = require('supertest');
    const { publicDiscoveryRouter } = require('../routes/publicDiscovery');

    const app = express();
    app.use('/api/public', publicDiscoveryRouter);

    const res = await request(app).get('/api/public/tenant-branding/non-existent-tenant-slug');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, 'Tenant branding not found');
  });
});
