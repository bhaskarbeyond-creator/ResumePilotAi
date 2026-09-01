'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');
const { InMemoryTenantRegistry } = require('./helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('./helpers/inMemoryEnterpriseRepository');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

const tokens = {
  admin: { uid: 'admin-provisioner', email: 'admin@example.com', email_verified: true, role: 'SUPER_ADMIN', superAdmin: true, auth_time: Math.floor(Date.now() / 1000) },
  regularUser: { uid: 'regular-user', email: 'user@example.com', email_verified: true, role: 'USER' },
  unverifiedUser: { uid: 'unverified-user', email: 'unverified@example.com', email_verified: false, role: 'USER' },
};

function bearer(name) {
  return `Bearer ${name}`;
}

test.beforeEach(() => {
  setTokenVerifierForTests(async (token) => {
    if (!tokens[token]) throw new Error('Invalid test token');
    return tokens[token];
  });
  const registry = new InMemoryTenantRegistry();
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) });
  const repository = new InMemoryEnterpriseRepository({ encryptionProvider });
  app.set('tenantService', new TenantService({ registry, repository, encryptionProvider }));
});

test('POST /api/enterprise/tenants: 201 Created on valid input by platform admin', async () => {
  const res = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Acme Global', slug: 'acme-global', isolationTier: 'ENTERPRISE' });

  assert.equal(res.status, 201);
  assert.equal(res.body.tenant.displayName, 'Acme Global');
  assert.equal(res.body.tenant.slug, 'acme-global');
  assert.equal(res.body.tenant.isolationTier, 'ENTERPRISE');
  assert.match(res.body.tenant.id, /^[0-9a-f-]{36}$/i);
  assert.match(res.body.workspace.id, /^[0-9a-f-]{36}$/i);
});

test('POST /api/enterprise/tenants: 400 INVALID_TENANT for invalid name or slug', async () => {
  const invalidName = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'A', slug: 'valid-slug' });

  assert.equal(invalidName.status, 400);
  assert.equal(invalidName.body.error.code, 'INVALID_TENANT');
  assert.match(invalidName.body.error.message, /invalid/i);

  const invalidSlug = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Valid Name', slug: 'Invalid Slug With Spaces!' });

  assert.equal(invalidSlug.status, 400);
  assert.equal(invalidSlug.body.error.code, 'INVALID_TENANT');
  assert.match(invalidSlug.body.error.message, /invalid/i);
});

test('POST /api/enterprise/tenants: 409 TENANT_SLUG_CONFLICT for duplicate organization slug', async () => {
  const first = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'First Tenant', slug: 'duplicate-slug' });
  assert.equal(first.status, 201);

  const duplicate = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Second Tenant', slug: 'duplicate-slug' });

  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'TENANT_SLUG_CONFLICT');
  assert.match(duplicate.body.error.message, /slug is already in use/i);
  assert.match(duplicate.body.error.remediation, /choose a different/i);
});

test('POST /api/enterprise/tenants: 403 FORBIDDEN for non-platform-provisioner callers', async () => {
  const nonAdmin = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('regularUser'))
    .send({ displayName: 'Hacker Corp', slug: 'hacker-corp' });

  assert.equal(nonAdmin.status, 403);
  assert.equal(nonAdmin.body.error.code, 'FORBIDDEN');
  assert.match(nonAdmin.body.error.message, /Platform tenant provisioning permission is required/i);
  assert.match(nonAdmin.body.error.remediation, /system\.config\.write/i);
});

test('POST /api/enterprise/tenants: 403 EMAIL_VERIFICATION_REQUIRED for unverified emails', async () => {
  const unverified = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('unverifiedUser'))
    .send({ displayName: 'Unverified Corp', slug: 'unverified-corp' });

  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('POST /api/enterprise/tenants: 503 TENANT_CONTROL_PLANE_UNAVAILABLE when registry is uninitialized', async () => {
  app.set('tenantService', new TenantService({ registry: null }));

  const res = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Outage Corp', slug: 'outage-corp' });

  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'TENANT_CONTROL_PLANE_UNAVAILABLE');
  assert.match(res.body.error.message, /registry is unavailable/i);
});
