'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { tenantCacheKey } = require('../enterprise/tenantCache');
const { InMemoryAtomicCounterStore, TenantQuotaGuard } = require('../enterprise/tenantQuota');

function context(tenantId, principalId = 'load-principal') {
  return { tenantId, workspaceId: crypto.randomUUID(), principalId, dataPlane: { routingVersion: 1 } };
}

test('logical tenant namespacing remains collision-free across 1,000 simulated tenants', () => {
  const keys = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const tenantId = crypto.randomUUID();
    const key = tenantCacheKey({ tenantId, workspaceId: crypto.randomUUID(), subjectId: `principal-${index}`, domain: 'ai-generate', resourceId: 'same-resource', revision: 1 });
    assert.equal(keys.has(key), false, `duplicate key at tenant ${index}`);
    keys.add(key);
  }
  assert.equal(keys.size, 1000);
});

test('a noisy simulated tenant cannot consume another tenant quota bucket', async () => {
  const store = new InMemoryAtomicCounterStore();
  const guard = new TenantQuotaGuard({ store });
  const noisy = context(crypto.randomUUID(), 'noisy-user');
  const quiet = context(crypto.randomUUID(), 'quiet-user');
  for (let index = 0; index < 5; index += 1) await guard.consume({ context: noisy, metric: 'render', limit: 5, windowMs: 60_000, principalScoped: false });
  await assert.rejects(() => guard.consume({ context: noisy, metric: 'render', limit: 5, windowMs: 60_000, principalScoped: false }), error => error.code === 'TENANT_QUOTA_EXCEEDED');
  const quietResult = await guard.consume({ context: quiet, metric: 'render', limit: 5, windowMs: 60_000, principalScoped: false });
  assert.equal(quietResult.used, 1);
});
