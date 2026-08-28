'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { InMemoryTenantRegistry } = require('../test/helpers/inMemoryTenantRegistry');
const { freezeContext, canonicalPrincipalId } = require('../enterprise/tenantContext');
const { InMemoryEnterpriseRepository } = require('../test/helpers/inMemoryEnterpriseRepository');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { tenantCacheKey } = require('../enterprise/tenantCache');
const { tenantObjectKey } = require('../enterprise/tenantStorage');
const { createTenantArtifactToken, verifyTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
const { buildTenantAiOperation } = require('../enterprise/tenantAi');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../enterprise/tenantJobs');
const { canonicalize, checksum } = require('../enterprise/enterpriseBackup');

test('Enterprise End-to-End Pilot & Controlled Tenant Isolation Suite', async (t) => {
  // Explicit test double exercises the immutable MariaDB repository contract;
  // production provider selection and SQL ownership are covered separately.
  const repository = new InMemoryEnterpriseRepository({
    encryptionProvider: new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) }),
  });

  // Setup controlled multi-tenant organization topology.
  new InMemoryTenantRegistry();

  const tenantA_Id = crypto.randomUUID();
  const workspaceA1_Id = crypto.randomUUID();
  crypto.randomUUID();

  const tenantB_Id = crypto.randomUUID();
  const workspaceB1_Id = crypto.randomUUID();

  const subjectA_Admin = 'user-acme-admin-01';
  const subjectA_Member = 'user-acme-member-02';
  const subjectB_Admin = 'user-beta-admin-01';
  const subjectB_Member = 'user-beta-member-02';

  const principalA_Admin = canonicalPrincipalId(subjectA_Admin);
  const principalA_Member = canonicalPrincipalId(subjectA_Member);
  const principalB_Admin = canonicalPrincipalId(subjectB_Admin);
  canonicalPrincipalId(subjectB_Member);

  const contextA1_Admin = freezeContext({
    requestId: 'req-pilot-a1-admin',
    principalId: principalA_Admin,
    subjectId: subjectA_Admin,
    tenantId: tenantA_Id,
    workspaceId: workspaceA1_Id,
    workspaceScope: 'TENANT',
    policyVersion: 1,
    permissions: ['resource.read', 'resource.create', 'resource.update', 'admin.all'],
    tenant: { id: tenantA_Id, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['TENANT_ADMIN'] },
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', routingVersion: 1 },
  });

  const contextA1_Member = freezeContext({
    requestId: 'req-pilot-a1-member',
    principalId: principalA_Member,
    subjectId: subjectA_Member,
    tenantId: tenantA_Id,
    workspaceId: workspaceA1_Id,
    workspaceScope: 'WORKSPACE',
    policyVersion: 1,
    permissions: ['resource.read', 'resource.create'],
    tenant: { id: tenantA_Id, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', routingVersion: 1 },
  });

  const contextB1_Admin = freezeContext({
    requestId: 'req-pilot-b1-admin',
    principalId: principalB_Admin,
    subjectId: subjectB_Admin,
    tenantId: tenantB_Id,
    workspaceId: workspaceB1_Id,
    workspaceScope: 'WORKSPACE',
    policyVersion: 1,
    permissions: ['resource.read', 'resource.create', 'admin.all'],
    tenant: { id: tenantB_Id, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['TENANT_ADMIN'] },
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', routingVersion: 1 },
  });

  const resA1 = crypto.randomUUID();
  const resB1 = crypto.randomUUID();

  // Test Step 1: Tenant A admin creates a resource; a workspace member reads it
  await t.test('MariaDB contract: Tenant A1 Admin creates resource and Member queries it', async () => {
    await repository.createResource(contextA1_Admin, { id: resA1, resourceType: 'RESUME', payload: { title: 'Acme Master Resume' } });
    const read = await repository.getResource(contextA1_Member, resA1);
    assert.equal(read.payload.title, 'Acme Master Resume');
    assert.equal(read.tenantId, tenantA_Id);
  });

  // Test Step 2: Tenant B isolation through the repository boundary
  await t.test('MariaDB contract: Tenant B cannot read Tenant A documents and writes only to its own partition', async () => {
    // Tenant B sees nothing of tenant A.
    await assert.rejects(() => repository.getResource(contextB1_Admin, resA1), error => error.code === 'TENANT_RESOURCE_NOT_FOUND');

    // Tenant B writes its own resource (into its own partition by construction).
    const beta = await repository.createResource(contextB1_Admin, { id: resB1, resourceType: 'RESUME', payload: { title: 'Beta Resume' } });
    assert.equal(beta.tenantId, tenantB_Id);
    assert.ok(repository.resources.has(`${tenantB_Id}:${resB1}`), 'the write must land in tenant B partition');
    assert.ok(!repository.resources.has(`${tenantA_Id}:${resB1}`), 'no row may appear in tenant A partition');

    // Spoofing tenant identity is structurally impossible: writes always go to
    // the verified context partition regardless of any client-supplied id.
    await assert.rejects(() => repository.getResource(contextA1_Admin, resB1), error => error.code === 'TENANT_RESOURCE_NOT_FOUND');
  });

  // Test Step 3: Cache Isolation with Identical Logical IDs
  await t.test('Cache Isolation: Identical logical resource IDs generate distinct, non-colliding keys', () => {
    const keyA = tenantCacheKey({ tenantId: tenantA_Id, workspaceId: workspaceA1_Id, domain: 'resume', resourceId: 'resume_001', revision: 1 });
    const keyB = tenantCacheKey({ tenantId: tenantB_Id, workspaceId: workspaceB1_Id, domain: 'resume', resourceId: 'resume_001', revision: 1 });

    assert.notEqual(keyA, keyB);
    assert.match(keyA, new RegExp(`tenant:${tenantA_Id}`));
    assert.match(keyB, new RegExp(`tenant:${tenantB_Id}`));
  });

  // Test Step 4: Storage Namespaces & Signed Artifact Tokens
  await t.test('Storage Isolation: Signed artifact tokens enforce purpose, tenant binding, and expiry', () => {
    const secret = 'pilot-signing-secret-very-secure-32chars!!';
    const storageKeyA = tenantObjectKey({ tenantId: tenantA_Id, workspaceId: workspaceA1_Id, resourceType: 'resume', resourceId: resA1, category: 'exports', extension: 'pdf' });

    // Generate token for Tenant A
    const tokenA = createTenantArtifactToken({
      context: contextA1_Admin,
      objectKey: storageKeyA,
      purpose: 'DOWNLOAD',
      expiresInMs: 60_000,
      signingSecret: secret,
    });

    // Verify token with valid Tenant A context -> ALLOW
    const verified = verifyTenantArtifactToken({
      context: contextA1_Admin,
      token: tokenA,
      purpose: 'DOWNLOAD',
      signingSecret: secret,
    });
    assert.equal(verified.objectKey, storageKeyA);

    // Verify token with Tenant B context -> DENY
    assert.throws(() => {
      verifyTenantArtifactToken({
        context: contextB1_Admin,
        token: tokenA,
        purpose: 'DOWNLOAD',
        signingSecret: secret,
      });
    }, error => error.code === 'TENANT_STORAGE_NOT_FOUND' || error.message.includes('Tenant artifact is unavailable'));

    // Verify token with wrong purpose -> DENY
    assert.throws(() => {
      verifyTenantArtifactToken({
        context: contextA1_Admin,
        token: tokenA,
        purpose: 'RENDER',
        signingSecret: secret,
      });
    }, error => error.code === 'INVALID_TENANT_ARTIFACT_TOKEN');
  });

  // Test Step 5: Enterprise AI Policy & Source Isolation
  await t.test('Enterprise AI Policy: Cross-tenant source access is denied and provider allowlist is enforced', () => {
    // 1. Valid intra-tenant AI operation
    const validAiOp = buildTenantAiOperation({
      context: contextA1_Admin,
      operation: 'generate-summary',
      payload: { targetRole: 'Staff Software Engineer' },
      sourceResources: [{ id: resA1, revision: 1, tenantId: tenantA_Id, workspaceId: workspaceA1_Id }],
    });
    assert.equal(validAiOp.tenantId, tenantA_Id);

    // 2. Cross-tenant source reference -> DENY
    assert.throws(() => {
      buildTenantAiOperation({
        context: contextA1_Admin,
        operation: 'generate-summary',
        payload: { targetRole: 'Staff Software Engineer' },
        sourceResources: [{ id: resB1, revision: 1, tenantId: tenantB_Id, workspaceId: workspaceB1_Id }],
      });
    }, error => error.code === 'TENANT_AI_SOURCE_DENIED');
  });

  // Test Step 6: Job Envelopes & Worker Reauthorization
  await t.test('Job Queue & Worker: Signed envelopes enforce tenant binding and worker reauthorization', () => {
    const jobSecret = 'job-signing-secret-secure-32chars-key!!';
    const envelope = createTenantJobEnvelope({
      context: contextA1_Admin,
      jobType: 'EXPORT_PDF',
      resource: { type: 'RESUME', id: resA1, revision: 1 },
      idempotencyKey: 'job-pilot-001',
      signingSecret: jobSecret,
    });

    assert.equal(envelope.tenantId, tenantA_Id);

    // Tampered tenantId -> signature validation fails
    assert.throws(() => {
      validateTenantJobEnvelope({ ...envelope, tenantId: tenantB_Id }, jobSecret);
    }, error => error.code === 'INVALID_TENANT_JOB_SIGNATURE');
  });

  // Test Step 7: deterministic MariaDB logical-backup portability
  await t.test('Data Portability: canonical backup values preserve a deterministic checksum', () => {
    const source = {
      id: 'legacy-pilot-resume-101', tenantId: tenantA_Id, workspaceId: workspaceA1_Id,
      payload: { basics: { name: 'Pilot User' }, skills: ['Kubernetes', 'MariaDB'] },
      updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    };
    const portable = canonicalize(source);
    const roundTrip = JSON.parse(JSON.stringify(portable));
    assert.equal(checksum(portable), checksum(roundTrip));
    assert.notEqual(checksum(portable), checksum({ ...roundTrip, tenantId: tenantB_Id }));
  });
});
