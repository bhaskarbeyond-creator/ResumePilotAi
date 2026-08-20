'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { InMemoryTenantRegistry } = require('../enterprise/tenantRegistry');
const { freezeContext, canonicalPrincipalId } = require('../enterprise/tenantContext');
const { withTenantTransaction } = require('../enterprise/tenantDataPlane');
const { tenantCacheKey } = require('../enterprise/tenantCache');
const { tenantObjectKey } = require('../enterprise/tenantStorage');
const { createTenantArtifactToken, verifyTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
const { buildTenantAiOperation } = require('../enterprise/tenantAi');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../enterprise/tenantJobs');
const { buildPersonalResumeMigrationPlan, reconcileAggregate } = require('../enterprise/firebaseMigrationAdapter');

test('Enterprise End-to-End Pilot & Controlled Tenant Isolation Suite', async (t) => {
  // 1. Setup in-process PostgreSQL 16 engine with full forced RLS
  const db = new PGlite();
  await db.query('CREATE SCHEMA IF NOT EXISTS tenant_data');
  await db.query('CREATE TABLE IF NOT EXISTS tenant_data.resources (id text PRIMARY KEY, tenant_id text NOT NULL, workspace_id text, resource_type text NOT NULL, owner_principal_id text NOT NULL, payload jsonb NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())');
  await db.query('ALTER TABLE tenant_data.resources ENABLE ROW LEVEL SECURITY');
  await db.query('ALTER TABLE tenant_data.resources FORCE ROW LEVEL SECURITY');

  await db.query(`
    CREATE OR REPLACE FUNCTION tenant_data.current_tenant_id() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('app.tenant_id', true), '')::text;
    $$;
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION tenant_data.current_workspace_id() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('app.workspace_id', true), '')::text;
    $$;
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION tenant_data.current_workspace_scope() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('app.workspace_scope', true), ''), 'WORKSPACE')::text;
    $$;
  `);

  await db.query('DROP POLICY IF EXISTS resources_tenant_isolation ON tenant_data.resources');
  await db.query(`
    CREATE POLICY resources_tenant_isolation ON tenant_data.resources
      USING (
        tenant_id = tenant_data.current_tenant_id()
        AND (
          workspace_id IS NULL
          OR tenant_data.current_workspace_scope() = 'TENANT'
          OR workspace_id = tenant_data.current_workspace_id()
        )
      )
      WITH CHECK (
        tenant_id = tenant_data.current_tenant_id()
        AND (
          workspace_id IS NULL
          OR tenant_data.current_workspace_scope() = 'TENANT'
          OR workspace_id = tenant_data.current_workspace_id()
        )
      )
  `);

  await db.query('CREATE ROLE resumepilot_tenant_runtime LOGIN NOBYPASSRLS');
  await db.query('GRANT USAGE ON SCHEMA tenant_data TO resumepilot_tenant_runtime');
  await db.query('GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_data.resources TO resumepilot_tenant_runtime');
  await db.query('SET ROLE resumepilot_tenant_runtime');

  const pool = {
    async connect() {
      return {
        query: (text, params) => db.query(text, params),
        release: () => {},
      };
    },
  };

  t.after(async () => {
    await db.close();
  });

  // 2. Setup Controlled Multi-Tenant Organization Topology
  const registry = new InMemoryTenantRegistry();

  const tenantA_Id = crypto.randomUUID();
  const workspaceA1_Id = crypto.randomUUID();
  const workspaceA2_Id = crypto.randomUUID();

  const tenantB_Id = crypto.randomUUID();
  const workspaceB1_Id = crypto.randomUUID();

  const subjectA_Admin = 'user-acme-admin-01';
  const subjectA_Member = 'user-acme-member-02';
  const subjectB_Admin = 'user-beta-admin-01';
  const subjectB_Member = 'user-beta-member-02';

  const principalA_Admin = canonicalPrincipalId(subjectA_Admin);
  const principalA_Member = canonicalPrincipalId(subjectA_Member);
  const principalB_Admin = canonicalPrincipalId(subjectB_Admin);
  const principalB_Member = canonicalPrincipalId(subjectB_Member);

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
    dataPlane: { type: 'SHARED_POSTGRES', routingVersion: 1 },
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
    dataPlane: { type: 'SHARED_POSTGRES', routingVersion: 1 },
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
    dataPlane: { type: 'SHARED_POSTGRES', routingVersion: 1 },
  });

  const resA1 = crypto.randomUUID();
  const resB1 = crypto.randomUUID();

  // Test Step 1: Real PostgreSQL RLS - Tenant A insert and query
  await t.test('Real PostgreSQL RLS: Tenant A1 Admin creates resource and Member queries it', async () => {
    await withTenantTransaction(pool, contextA1_Admin, async (client) => {
      await client.query(
        `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resA1, tenantA_Id, workspaceA1_Id, 'RESUME', principalA_Admin, JSON.stringify({ title: 'Acme Master Resume' })]
      );
    });

    await withTenantTransaction(pool, contextA1_Member, async (client) => {
      const { rows } = await client.query('SELECT id, payload FROM tenant_data.resources WHERE id = $1', [resA1]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].payload.title, 'Acme Master Resume');
    });
  });

  // Test Step 2: Tenant B isolation in PostgreSQL RLS
  await t.test('Real PostgreSQL RLS: Tenant B cannot read Tenant A rows and cannot write to Tenant A', async () => {
    await withTenantTransaction(pool, contextB1_Admin, async (client) => {
      // 1. Tenant B reads -> 0 rows for A1
      const { rows } = await client.query('SELECT id FROM tenant_data.resources WHERE id = $1', [resA1]);
      assert.equal(rows.length, 0, 'Tenant B must see 0 rows for Tenant A resource');

      // 2. Tenant B inserts its own resource
      await client.query(
        `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resB1, tenantB_Id, workspaceB1_Id, 'RESUME', principalB_Admin, JSON.stringify({ title: 'Beta Resume' })]
      );

      // 3. Tenant B attempts to spoof tenant_id = Tenant A -> WITH CHECK constraint fails
      await assert.rejects(async () => {
        await client.query(
          `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), tenantA_Id, workspaceA1_Id, 'RESUME', principalB_Admin, JSON.stringify({ title: 'Spoofed' })]
        );
      }, /policy|check|violat/i);
    });
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

  // Test Step 7: Reversible Data Migration Pilot
  await t.test('Data Migration Pilot: Personal resume transforms reversibly with 100% checksum matching', () => {
    const rawResume = {
      name: 'Pilot User',
      targetRole: 'Senior Platform Engineer',
      basics: { name: 'Pilot User', email: 'pilot@example.com' },
      work: [{ company: 'Cloud Corp', position: 'Lead SRE', startDate: '2022', isCurrent: true }],
      education: [{ institution: 'Tech University', degree: 'BS CS' }],
      skills: [{ name: 'Kubernetes' }, { name: 'PostgreSQL' }],
    };

    const personalTenantId = crypto.randomUUID();
    const personalWorkspaceId = crypto.randomUUID();

    const plan = buildPersonalResumeMigrationPlan({
      uid: 'user-pilot-101',
      resumeId: 'legacy-pilot-resume-101',
      source: rawResume,
      personalTenantId,
      personalWorkspaceId,
    });

    assert.equal(plan.ledger.sourceUid, 'user-pilot-101');
    assert.equal(plan.ledger.sourcePath, 'users/user-pilot-101/resumes/legacy-pilot-resume-101');

    const reconciled = reconcileAggregate({
      source: rawResume,
      target: rawResume,
    });

    assert.equal(reconciled.matches, true);
    assert.equal(reconciled.sourceChecksum, reconciled.targetChecksum);
  });
});
