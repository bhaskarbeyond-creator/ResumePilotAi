'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('enterprise rollout uses a single canonical server feature-flag implementation', () => {
  const flag = read('backend/enterprise/featureFlags.js');
  const route = read('backend/routes/enterprise.js');
  const m2m = read('backend/routes/enterpriseM2m.js');
  assert.match(flag, /function enterpriseFeatureEnabled/);
  assert.match(route, /require\('\.\.\/enterprise\/featureFlags'\)/);
  assert.match(m2m, /require\('\.\.\/enterprise\/featureFlags'\)/);
  assert.doesNotMatch(route, /function enterpriseFeatureEnabled/);
  assert.doesNotMatch(m2m, /function enterpriseFeatureEnabled/);
});

test('enterprise configuration separates browser UX flag from server-only data-plane secret', () => {
  const env = read('.env.example');
  const frontend = read('src/enterprise/EnterpriseContext.jsx');
  assert.match(env, /^ENTERPRISE_TENANCY_ENABLED=false$/m);
  assert.match(env, /^VITE_ENTERPRISE_TENANCY_ENABLED=false$/m);
  assert.match(env, /^TENANT_DATABASE_URL=$/m);
  assert.doesNotMatch(env, /^VITE_TENANT_DATABASE_URL=/m);
  assert.match(frontend, /\/api\/enterprise\/status/);
  assert.match(frontend, /serverDisabled/);
});

test('tenant identity conventions distinguish external subject from canonical data-plane principal', () => {
  const context = read('backend/enterprise/tenantContext.js');
  const service = read('backend/enterprise/tenantService.js');
  const dataPlane = read('backend/enterprise/tenantDataPlane.js');
  const registry = read('backend/enterprise/tenantRegistry.js');
  assert.match(context, /function canonicalPrincipalId/);
  assert.match(service, /subjectId: principalId/);
  assert.match(service, /principalId: resolved\.membership\.canonicalPrincipalId/);
  assert.match(dataPlane, /assertUuid\(context\.principalId, 'Canonical principal identifier'\)/);
  assert.match(registry, /TENANT_IDENTITY_MISMATCH/);
});

test('tenant-sensitive downstream paths consume canonical shared helpers rather than ambient identifiers', () => {
  const cache = read('backend/enterprise/tenantCache.js');
  const jobs = read('backend/enterprise/tenantJobs.js');
  const storage = read('backend/enterprise/tenantStorage.js');
  const ai = read('backend/enterprise/tenantAi.js');
  assert.match(cache, /assertUuid\(tenantId/);
  assert.match(jobs, /tenantId: assertUuid\(context\?\.tenantId/);
  assert.match(jobs, /subjectId: context\?\.subjectId/);
  assert.match(storage, /assertStorageContext/);
  assert.match(ai, /CLIENT_AUTHORITY_FIELDS/);
  assert.match(ai, /TENANT_AI_SOURCE_DENIED/);
});
