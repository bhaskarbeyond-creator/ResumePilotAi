'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { InMemoryTenantRegistry } = require('../enterprise/tenantRegistry');
const { freezeContext } = require('../enterprise/tenantContext');
const { assertSameTenant } = require('../enterprise/tenantPolicy');
const { tenantCacheKey } = require('../enterprise/tenantCache');
const { tenantObjectKey, assertStorageContext } = require('../enterprise/tenantStorage');
const { buildTenantAiOperation } = require('../enterprise/tenantAi');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../enterprise/tenantJobs');

async function contextFor(registry, principalId) {
  const resolved = await registry.resolveMembership({ principalId, profile: { displayName: principalId } });
  return freezeContext({
    requestId: `request-${principalId}`,
    principalId: resolved.membership.canonicalPrincipalId,
    subjectId: principalId,
    tenantId: resolved.tenant.id,
    workspaceId: resolved.workspace.id,
    tenant: resolved.tenant,
    membership: resolved.membership,
    permissions: ['resource.read'],
    dataPlane: resolved.tenant.dataPlane,
  });
}

test('adversarial tenant A to B matrix denies resource, cache, file, AI, and job forgery paths', async () => {
  const registry = new InMemoryTenantRegistry();
  const tenantA = await contextFor(registry, 'tenant-a-user');
  const tenantB = await contextFor(registry, 'tenant-b-user');

  assert.throws(() => assertSameTenant(tenantA, { tenantId: tenantB.tenantId, workspaceId: tenantB.workspaceId }), error => error.code === 'TENANT_RESOURCE_NOT_FOUND');

  const cacheA = tenantCacheKey({ tenantId: tenantA.tenantId, workspaceId: tenantA.workspaceId, domain: 'resume', resourceId: 'shared-id', revision: 1 });
  const cacheB = tenantCacheKey({ tenantId: tenantB.tenantId, workspaceId: tenantB.workspaceId, domain: 'resume', resourceId: 'shared-id', revision: 1 });
  assert.notEqual(cacheA, cacheB);

  const fileA = tenantObjectKey({ tenantId: tenantA.tenantId, workspaceId: tenantA.workspaceId, resourceType: 'resume', resourceId: 'same', category: 'generated', extension: 'pdf' });
  assert.throws(() => assertStorageContext(tenantB, fileA), error => error.code === 'TENANT_STORAGE_NOT_FOUND');

  assert.throws(() => buildTenantAiOperation({ context: tenantA, operation: 'generate-summary', payload: { occupation: 'Engineer' }, sourceResources: [{ id: 'r-b', revision: 1, tenantId: tenantB.tenantId, workspaceId: tenantB.workspaceId }] }), error => error.code === 'TENANT_AI_SOURCE_DENIED');

  const secret = 'z'.repeat(48);
  const jobA = createTenantJobEnvelope({ context: tenantA, jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'resume-a', revision: 1 }, idempotencyKey: 'export-a', signingSecret: secret });
  assert.throws(() => validateTenantJobEnvelope({ ...jobA, tenantId: tenantB.tenantId }, secret), error => error.code === 'INVALID_TENANT_JOB_SIGNATURE');
});
