'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

/**
 * Regression suite for the recursive tenant hard-delete pipeline (the change
 * introduced at production commit f72e13b and the production defects found in
 * the independent takeover audit).
 *
 * Covers:
 *  - garbage collection actually purges DELETING tenants whose updatedAt is a
 *    REAL firebase-admin Timestamp (the NaN comparison regression that made
 *    the f72e13b purge effectively dead code in production);
 *  - grace-period enforcement (tenants younger than the grace window stay);
 *  - cross-tenant safety: deleting Tenant A leaves Tenant B fully intact,
 *    including with intentionally overlapping-looking identifiers;
 *  - partition data is deleted BEFORE control-plane records, so a mid-purge
 *    failure leaves a retryable tenant instead of an orphaned partition;
 *  - write-batch chunking: tenants with more than 500 control-plane documents
 *    are still purged (Firestore batches cap at 500 operations);
 *  - identity-map cleanup: a purged personal tenant does not brick its owner;
 *  - in-memory registry purge parity (configuration + identity map);
 *  - GC failure isolation: one failing tenant never blocks the others;
 *  - idempotency: repeated purges succeed;
 *  - authorization: the GC control-plane route is super-admin gated.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore, createMemoryAdmin, HarnessTimestamp } = require('../test/helpers/memoryFirestore');
const { FirestoreTenantRegistry, InMemoryTenantRegistry } = require('../enterprise/tenantRegistry');
const { TenantService } = require('../enterprise/tenantService');
const { assertTenantTransition } = require('../enterprise/tenantLifecycle');

// The REAL Admin SDK Timestamp class: valueOf() returns the object itself, so
// new Date(timestamp) is NaN. Any GC timestamp handling must survive it.
const { Timestamp: RealFirestoreTimestamp } = require('firebase-admin/firestore');

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const OWNER_A = 'uid-owner-a';
const OWNER_B = 'uid-owner-b';

function daysAgo(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function buildRegistry() {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const registry = new FirestoreTenantRegistry({ db, admin });
  return { db, admin, registry };
}

async function seedTenant(db, { tenantId, ownerId, lifecycleState = 'ACTIVE', updatedAt = daysAgo(30) }) {
  const workspaceId = `${tenantId.slice(0, 13)}w-0001`;
  await db.collection('enterprise_tenants').doc(tenantId).set({
    id: tenantId,
    slug: `tenant-${tenantId.slice(0, 8)}`,
    displayName: `Tenant ${tenantId.slice(0, 4)}`,
    lifecycleState,
    isolationTier: 'STANDARD',
    dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', region: 'default', routingVersion: 1, storageProfile: 'shared', cacheProfile: 'shared', queueProfile: 'firestore-durable-outbox', aiProfile: 'platform-default', securityProfile: 'standard' },
    policyVersion: 1,
    createdAt: HarnessTimestamp.fromMillis(updatedAt),
    updatedAt: HarnessTimestamp.fromMillis(updatedAt),
  });
  await db.collection('enterprise_tenant_slugs').doc(`tenant-${tenantId.slice(0, 8)}`).set({ tenantId });
  await db.collection('enterprise_tenant_configurations').doc(tenantId).set({ tenantId, revision: 3, quotaPolicy: { aiRequestsPerDay: 500 } });
  await db.collection('enterprise_workspaces').doc(workspaceId).set({ id: workspaceId, tenantId, name: 'Default', lifecycleState: 'ACTIVE', isDefault: true });
  await db.collection('enterprise_memberships').doc(`${tenantId}_${ownerId.replace(/[^a-zA-Z0-9]/g, '').padEnd(20, '0').slice(0, 20)}`).set({ id: `${tenantId}_${ownerId}`, tenantId, principalId: ownerId, workspaceId, status: 'ACTIVE', roles: ['TENANT_OWNER'], revision: 1 });
  // Tenant data partition: nested subcollections under tenants/{tenantId}.
  await db.collection('tenants').doc(tenantId).collection('resources').doc('res-1').set({ tenantId, resourceType: 'RESUME', payload: { secret: `data-of-${tenantId}` } });
  await db.collection('tenants').doc(tenantId).collection('audit').doc('aud-1').set({ tenantId, action: 'CREATED' });
  await db.collection('enterprise_outbox').doc(`job-${tenantId.slice(0, 8)}`).set({ tenantId, state: 'PENDING' });
  return workspaceId;
}

// ─── 1. The NaN regression: real Firestore Timestamps must be honored ───────

test('GC purges a DELETING tenant whose updatedAt is a real firebase-admin Timestamp', async () => {
  // The regression: Firestore stores updatedAt as an SDK Timestamp whose
  // valueOf() returns the object itself, so the production code's
  // new Date(tenant.updatedAt) evaluated to NaN and the grace-period
  // comparison was always false — no tenant was EVER hard-deleted.
  // This stub registry hands the GC a genuine SDK Timestamp, with no test
  // harness in between to soften the type.
  const realTimestamp = RealFirestoreTimestamp.fromMillis(daysAgo(30));
  const purged = [];
  const registry = {
    listTenantsByLifecycleState: async () => [{ id: TENANT_A, lifecycleState: 'DELETING', updatedAt: realTimestamp }],
    purgeTenantRecords: async tenantId => { purged.push(tenantId); return true; },
  };
  const service = new TenantService({ db: null, admin: null, registry });
  const result = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(result.purgedCount, 1, 'a DELETING tenant past grace with a real SDK Timestamp must be purged');
  assert.deepEqual(purged, [TENANT_A]);
});

test('the real Firestore Timestamp object is what broke the original GC comparison', () => {
  const ts = RealFirestoreTimestamp.fromMillis(daysAgo(30));
  // Documents the root cause: this is exactly what the production code did.
  assert.ok(Number.isNaN(new Date(ts).getTime()), 'real SDK Timestamps produce Invalid Date');
  // ...and the Firestore-backed registry returns exactly this type from
  // enterprise_tenants documents written with serverTimestamp().
});

// ─── 2. Grace period ────────────────────────────────────────────────────────

test('GC leaves DELETING tenants inside the grace window untouched', async () => {
  const { db, admin, registry } = buildRegistry();
  await seedTenant(db, { tenantId: TENANT_A, ownerId: OWNER_A, lifecycleState: 'DELETING', updatedAt: daysAgo(2) });
  const service = new TenantService({ db, admin, registry });
  const result = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(result.purgedCount, 0);
  assert.equal((await db.collection('enterprise_tenants').doc(TENANT_A).get()).exists, true);
});

// ─── 3. Cross-tenant safety with overlapping-looking identifiers ────────────

test('deleting Tenant A leaves Tenant B completely intact even with look-alike data', async () => {
  const { db, admin, registry } = buildRegistry();
  await seedTenant(db, { tenantId: TENANT_A, ownerId: OWNER_A, lifecycleState: 'DELETING', updatedAt: daysAgo(30) });
  await seedTenant(db, { tenantId: TENANT_B, ownerId: OWNER_B, lifecycleState: 'ACTIVE', updatedAt: daysAgo(1) });
  // Overlapping-looking cross references: B references A-shaped identifiers.
  await db.collection('tenants').doc(TENANT_B).collection('resources').doc('res-1').set({ tenantId: TENANT_B, payload: { note: `mentions ${TENANT_A}` } });

  const service = new TenantService({ db, admin, registry });
  const result = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(result.purgedCount, 1);

  // Tenant A is completely gone: control plane, configuration, partition.
  assert.equal((await db.collection('enterprise_tenants').doc(TENANT_A).get()).exists, false);
  assert.equal((await db.collection('enterprise_tenant_configurations').doc(TENANT_A).get()).exists, false);
  assert.equal((await db.collection('tenants').doc(TENANT_A).collection('resources').doc('res-1').get()).exists, false);
  assert.equal((await db.collection('tenants').doc(TENANT_A).collection('audit').doc('aud-1').get()).exists, false);
  const outboxSnap = await db.collection('enterprise_outbox').where('tenantId', '==', TENANT_A).get();
  assert.equal(outboxSnap.docs.length, 0);
  const slugASnap = await db.collection('enterprise_tenant_slugs').where('tenantId', '==', TENANT_A).get();
  assert.equal(slugASnap.docs.length, 0);

  // Tenant B remains fully intact, including its partition and its look-alike doc.
  assert.equal((await db.collection('enterprise_tenants').doc(TENANT_B).get()).exists, true);
  assert.equal((await db.collection('enterprise_tenant_configurations').doc(TENANT_B).get()).exists, true);
  const bResource = await db.collection('tenants').doc(TENANT_B).collection('resources').doc('res-1').get();
  assert.equal(bResource.exists, true);
  assert.equal(bResource.data().payload.note, `mentions ${TENANT_A}`);
  const bMembers = await db.collection('enterprise_memberships').where('tenantId', '==', TENANT_B).get();
  assert.equal(bMembers.docs.length, 1);
  const bSlug = await db.collection('enterprise_tenant_slugs').where('tenantId', '==', TENANT_B).get();
  assert.equal(bSlug.docs.length, 1);
});

// ─── 4. Retry-safe ordering: partition first, control plane last ────────────

test('a partition deletion failure leaves the tenant discoverable and retryable', async () => {
  const { db, admin, registry } = buildRegistry();
  await seedTenant(db, { tenantId: TENANT_A, ownerId: OWNER_A, lifecycleState: 'DELETING', updatedAt: daysAgo(30) });
  // Simulate a recursiveDelete outage: partition deletion fails.
  const originalRecursiveDelete = db.recursiveDelete.bind(db);
  let calls = 0;
  db.recursiveDelete = async ref => {
    calls += 1;
    if (calls === 1) throw new Error('14 UNAVAILABLE: simulated recursiveDelete outage');
    return originalRecursiveDelete(ref);
  };

  const service = new TenantService({ db, admin, registry });
  const first = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(first.purgedCount, 0);
  assert.equal(first.failures.length, 1);
  // Control-plane records MUST still exist so the next GC run retries.
  assert.equal((await db.collection('enterprise_tenants').doc(TENANT_A).get()).exists, true, 'tenant document must survive a failed purge for retry');

  const second = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(second.purgedCount, 1, 'retry after transient failure completes the purge');
  assert.equal((await db.collection('enterprise_tenants').doc(TENANT_A).get()).exists, false);
});

test('a missing recursiveDelete capability fails closed instead of silently skipping partition data', async () => {
  const { db, admin, registry } = buildRegistry();
  await seedTenant(db, { tenantId: TENANT_A, ownerId: OWNER_A, lifecycleState: 'DELETING', updatedAt: daysAgo(30) });
  db.recursiveDelete = undefined;
  const service = new TenantService({ db, admin, registry });
  const result = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(result.purgedCount, 0);
  assert.match(result.failures[0].error, /unavailable/i);
  assert.equal((await db.collection('enterprise_tenants').doc(TENANT_A).get()).exists, true, 'tenant must not be reported deleted while its partition survives');
});

// ─── 5. Batch chunking beyond the Firestore 500-op write limit ──────────────

test('a tenant with more than 500 control-plane documents is purged in chunked batches', async () => {
  const { db, admin, registry } = buildRegistry();
  await seedTenant(db, { tenantId: TENANT_A, ownerId: OWNER_A, lifecycleState: 'DELETING', updatedAt: daysAgo(30) });
  // 600 additional memberships for the tenant → 606 total deletes required.
  for (let i = 0; i < 600; i += 1) {
    await db.collection('enterprise_memberships').doc(`bulk-${String(i).padStart(4, '0')}`).set({ id: `bulk-${i}`, tenantId: TENANT_A, principalId: `member-${i}`, status: 'ACTIVE', roles: ['MEMBER'] });
  }
  // Instrument every committed batch and enforce the real Firestore limit.
  const originalBatch = db.batch.bind(db);
  const batchSizes = [];
  db.batch = () => {
    const batch = originalBatch();
    let ops = 0;
    return {
      set: (...args) => { ops += 1; return batch.set(...args); },
      update: (...args) => { ops += 1; return batch.update(...args); },
      delete: (...args) => { ops += 1; return batch.delete(...args); },
      commit: async () => {
        batchSizes.push(ops);
        assert.ok(ops <= 500, `committed batch exceeded the Firestore 500-op limit (${ops})`);
        return batch.commit();
      },
    };
  };

  const service = new TenantService({ db, admin, registry });
  const result = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(result.purgedCount, 1);
  assert.ok(batchSizes.length >= 2, 'purge of a >500-document tenant must be chunked into multiple batches');
  const remaining = await db.collection('enterprise_memberships').where('tenantId', '==', TENANT_A).get();
  assert.equal(remaining.docs.length, 0, 'every control-plane document is deleted');
});

// ─── 6. Identity map: purging a personal tenant must not brick its owner ────

test('purging a personal tenant removes the identity map so the owner can obtain a fresh workspace', async () => {
  const { db, registry } = buildRegistry();
  const identityDocId = 'a'.repeat(64);
  await db.collection('enterprise_principal_tenants').doc(identityDocId).set({ principalId: OWNER_A, personalTenantId: TENANT_A, defaultWorkspaceId: 'ws-x' });
  await seedTenant(db, { tenantId: TENANT_A, ownerId: OWNER_A, lifecycleState: 'DELETING', updatedAt: daysAgo(30) });

  await registry.purgeTenantRecords(TENANT_A);
  assert.equal((await db.collection('enterprise_principal_tenants').doc(identityDocId).get()).exists, false, 'identity map entry is removed with the personal tenant');

  // The owner can resolve a brand-new personal tenant afterwards.
  const fresh = await registry.ensurePersonalTenant(OWNER_A, { displayName: 'Owner A' });
  assert.match(fresh.tenantId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(fresh.tenantId, TENANT_A);
});

// ─── 7. Idempotency ────────────────────────────────────────────────────────

test('purge is idempotent: a second purge of the same tenant succeeds', async () => {
  const { db, registry } = buildRegistry();
  await seedTenant(db, { tenantId: TENANT_A, ownerId: OWNER_A, lifecycleState: 'DELETING', updatedAt: daysAgo(30) });
  await registry.purgeTenantRecords(TENANT_A);
  await assert.doesNotReject(() => registry.purgeTenantRecords(TENANT_A));
  assert.equal((await db.collection('enterprise_tenants').doc(TENANT_A).get()).exists, false);
});

test('purge rejects malformed tenant identifiers before touching any data', async () => {
  const { registry } = buildRegistry();
  await assert.rejects(() => registry.purgeTenantRecords("'; DROP TABLE tenants; --"), /Tenant identifier/i);
  await assert.rejects(() => registry.purgeTenantRecords('not-a-uuid'), /Tenant identifier/i);
});

// ─── 8. In-memory registry purge parity ────────────────────────────────────

test('in-memory registry purge removes configuration and identity mapping like the Firestore registry', async () => {
  const registry = new InMemoryTenantRegistry();
  const personal = await registry.ensurePersonalTenant(OWNER_A, { displayName: 'Owner A' });
  await registry.updateTenantConfiguration({ tenantId: personal.tenantId, input: {}, expectedRevision: 1 });
  assert.ok(await registry.getTenantConfiguration(personal.tenantId));

  await registry.purgeTenantRecords(personal.tenantId);

  await assert.rejects(() => registry.getTenant(personal.tenantId), error => error.code === 'TENANT_NOT_FOUND');
  // Default configuration would return revision 1; the stored revision-2
  // configuration must be gone.
  const config = await registry.getTenantConfiguration(personal.tenantId);
  assert.equal(config.revision, 1, 'stored configuration is purged');
  const refreshed = await registry.ensurePersonalTenant(OWNER_A, { displayName: 'Owner A' });
  assert.notEqual(refreshed.tenantId, personal.tenantId, 'a fresh personal tenant is provisionable');
});

// ─── 9. GC failure isolation ───────────────────────────────────────────────

test('one failing tenant never blocks garbage collection of the others', async () => {
  const purged = [];
  const registry = {
    listTenantsByLifecycleState: async () => [
      { id: TENANT_A, lifecycleState: 'DELETING', updatedAt: daysAgo(30) },
      { id: TENANT_B, lifecycleState: 'DELETING', updatedAt: daysAgo(30) },
    ],
    purgeTenantRecords: async tenantId => {
      if (tenantId === TENANT_A) throw new Error('simulated purge outage');
      purged.push(tenantId);
      return true;
    },
  };
  const service = new TenantService({ db: null, admin: null, registry });
  const result = await service.executeTenantGarbageCollection({ gracePeriodDays: 7 });
  assert.equal(result.purgedCount, 1);
  assert.deepEqual(purged, [TENANT_B]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].tenantId, TENANT_A);
});

// ─── 10. Lifecycle transitions into DELETING remain constrained ────────────

test('tenant lifecycle transitions into DELETING are enforced and terminal for DELETED', () => {
  assert.equal(assertTenantTransition('ACTIVE', 'DELETING'), 'DELETING');
  assert.equal(assertTenantTransition('SUSPENDED', 'DELETING'), 'DELETING');
  assert.equal(assertTenantTransition('PROVISIONING', 'DELETING'), 'DELETING');
  assert.throws(() => assertTenantTransition('DELETED', 'DELETING'));
  assert.throws(() => assertTenantTransition('ACTIVE', 'DELETED'), /not allowed/);
});

// ─── 11. GC control-plane route authorization ──────────────────────────────

test('the tenant garbage-collection control-plane route is super-admin gated and audited', async () => {
  process.env.REQUIRE_RECENT_AUTH_IN_TEST = 'true';
  const request = require('supertest');
  const { setTokenVerifierForTests } = require('../security/auth');
  const now = Math.floor(Date.now() / 1000);
  setTokenVerifierForTests(async token => {
    if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
    if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
    if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
    if (token === 'stale-super-admin') return { uid: 'super-2', email: 'stale@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now - 3600 };
    throw new Error('invalid token');
  });
  const app = require('../index');
  const gcCalls = [];
  app.set('tenantService', {
    executeTenantGarbageCollection: async ({ gracePeriodDays }) => {
      gcCalls.push(gracePeriodDays);
      return { purgedCount: 1, considered: 1, failures: [] };
    },
  });

  const deniedUser = await request(app).post('/api/platform/tenants/garbage-collect').set('Authorization', 'Bearer user').send({});
  assert.equal(deniedUser.status, 403, 'regular users cannot trigger tenant GC');

  const deniedAdmin = await request(app).post('/api/platform/tenants/garbage-collect').set('Authorization', 'Bearer admin').send({});
  assert.equal(deniedAdmin.status, 403, 'plain admins cannot trigger tenant GC');

  const deniedStale = await request(app).post('/api/platform/tenants/garbage-collect').set('Authorization', 'Bearer stale-super-admin').send({});
  assert.equal(deniedStale.status, 403);
  assert.equal(deniedStale.body.error.code, 'RECENT_AUTH_REQUIRED', 'even super admins must reauthenticate for destructive operations');

  const oversized = await request(app).post('/api/platform/tenants/garbage-collect').set('Authorization', 'Bearer super-admin').send({ gracePeriodDays: 400 });
  assert.equal(oversized.status, 200);
  assert.equal(gcCalls.at(-1), 90, 'grace period is clamped server-side to a bounded range');

  const allowed = await request(app).post('/api/platform/tenants/garbage-collect').set('Authorization', 'Bearer super-admin').send({ gracePeriodDays: 7 });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.success, true);
  assert.equal(allowed.body.purgedCount, 1);
  delete process.env.REQUIRE_RECENT_AUTH_IN_TEST;
});
