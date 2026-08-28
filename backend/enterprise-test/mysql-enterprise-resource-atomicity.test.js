'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MySqlEnterpriseRepository } = require('../enterprise/mysqlEnterpriseRepository');

function clone(value) {
  return structuredClone(value);
}

class TransactionalResourcePool {
  constructor() {
    this.resources = new Map();
    this.audit = [];
    this.failAudit = false;
    this.forceCasMiss = false;
    this.queries = [];
  }

  getConnection() {
    const pool = this;
    let snapshot;
    return {
      async beginTransaction() {
        snapshot = { resources: clone([...pool.resources]), audit: clone(pool.audit) };
      },
      async commit() { snapshot = null; },
      async rollback() {
        if (!snapshot) return;
        pool.resources = new Map(clone(snapshot.resources));
        pool.audit = clone(snapshot.audit);
        snapshot = null;
      },
      release() {},
      async query(sql, params = []) { return pool.query(sql, params); },
    };
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.queries.push({ sql: normalized, params: clone(params) });

    if (normalized.startsWith('INSERT INTO enterprise_resources')) {
      const [id, tenantId, workspaceId, resourceType, classification, data, createdBy, updatedBy] = params;
      const key = `${tenantId}:${id}`;
      if (this.resources.has(key)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      const now = new Date('2026-08-28T00:00:00.000Z');
      this.resources.set(key, {
        id, tenantId, workspaceId, resourceType, classification, data,
        revision: 1, created_by: createdBy, updated_by: updatedBy,
        created_at: now, updated_at: now,
      });
      return [{ affectedRows: 1 }];
    }

    if (normalized.startsWith('INSERT INTO enterprise_audit_events')) {
      if (this.failAudit) throw Object.assign(new Error('audit unavailable'), { code: 'ER_AUDIT_WRITE' });
      this.audit.push({ id: params[0], tenantId: params[1], action: params[4], resourceId: params[14] });
      return [{ affectedRows: 1 }];
    }

    if (normalized === 'SELECT * FROM enterprise_resources WHERE tenantId = ? AND id = ? FOR UPDATE'
        || normalized === 'SELECT * FROM enterprise_resources WHERE tenantId = ? AND id = ?') {
      const row = this.resources.get(`${params[0]}:${params[1]}`);
      return [[...(row ? [clone(row)] : [])]];
    }

    if (normalized.startsWith('UPDATE enterprise_resources SET data = ?')) {
      const [data, classification, updatedBy, tenantId, id, expectedRevision] = params;
      const key = `${tenantId}:${id}`;
      const row = this.resources.get(key);
      if (this.forceCasMiss || !row || Number(row.revision) !== Number(expectedRevision)) return [{ affectedRows: 0 }];
      row.data = data;
      row.classification = classification;
      row.updated_by = updatedBy;
      row.revision += 1;
      row.updated_at = new Date('2026-08-28T00:01:00.000Z');
      return [{ affectedRows: 1 }];
    }

    if (normalized.startsWith('DELETE FROM enterprise_resources WHERE tenantId = ? AND id = ? AND revision = ?')) {
      const [tenantId, id, expectedRevision] = params;
      const key = `${tenantId}:${id}`;
      const row = this.resources.get(key);
      if (this.forceCasMiss || !row || Number(row.revision) !== Number(expectedRevision)) return [{ affectedRows: 0 }];
      this.resources.delete(key);
      return [{ affectedRows: 1 }];
    }

    throw new Error(`Unexpected SQL in resource transaction contract: ${normalized}`);
  }
}

const context = Object.freeze({
  tenantId: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  principalId: crypto.randomUUID(),
  subjectId: 'firebase-subject',
  identityIssuer: 'firebase',
  actorType: 'user',
  workspaceScope: 'WORKSPACE',
  requestId: 'request-atomicity',
  correlationId: 'correlation-atomicity',
});

function repositoryAndPool() {
  const pool = new TransactionalResourcePool();
  return { pool, repository: new MySqlEnterpriseRepository({ pool }) };
}

async function seed(repository) {
  return repository.createResource(context, {
    id: crypto.randomUUID(), resourceType: 'RESUME', classification: 'PUBLIC', payload: { title: 'v1' },
  });
}

test('resource create and its immutable audit event commit or roll back together', async () => {
  const { pool, repository } = repositoryAndPool();
  pool.failAudit = true;
  await assert.rejects(
    () => seed(repository),
    error => error.code === 'ER_AUDIT_WRITE'
  );
  assert.equal(pool.resources.size, 0);
  assert.equal(pool.audit.length, 0);

  pool.failAudit = false;
  const created = await seed(repository);
  assert.equal(created.revision, 1);
  assert.equal(pool.resources.size, 1);
  assert.deepEqual(pool.audit.map(event => event.action), ['RESOURCE_CREATED']);
});

test('resource update uses revision CAS and rolls back when audit persistence fails', async () => {
  const { pool, repository } = repositoryAndPool();
  const created = await seed(repository);
  pool.audit = [];

  pool.forceCasMiss = true;
  await assert.rejects(
    () => repository.updateResource(context, created.id, { expectedRevision: 1, payload: { title: 'lost race' } }),
    error => error.code === 'REVISION_CONFLICT' && error.status === 409
  );
  assert.equal(pool.resources.get(`${context.tenantId}:${created.id}`).revision, 1);
  assert.equal(pool.audit.length, 0);

  pool.forceCasMiss = false;
  pool.failAudit = true;
  await assert.rejects(
    () => repository.updateResource(context, created.id, { expectedRevision: 1, payload: { title: 'v2' } }),
    error => error.code === 'ER_AUDIT_WRITE'
  );
  assert.equal(pool.resources.get(`${context.tenantId}:${created.id}`).revision, 1);
  assert.equal(pool.audit.length, 0);

  pool.failAudit = false;
  const updated = await repository.updateResource(context, created.id, { expectedRevision: 1, payload: { title: 'v2' } });
  assert.equal(updated.revision, 2);
  assert.equal(updated.payload.title, 'v2');
  assert.deepEqual(pool.audit.map(event => event.action), ['RESOURCE_UPDATED']);
  assert.ok(pool.queries.some(query => query.sql.includes('WHERE tenantId = ? AND id = ? AND revision = ?')));
});

test('resource deletion is revision-bound and rolls back if its audit event cannot be written', async () => {
  const { pool, repository } = repositoryAndPool();
  const created = await seed(repository);
  pool.audit = [];
  pool.failAudit = true;

  await assert.rejects(
    () => repository.deleteResource(context, created.id),
    error => error.code === 'ER_AUDIT_WRITE'
  );
  assert.equal(pool.resources.size, 1);
  assert.equal(pool.audit.length, 0);

  pool.failAudit = false;
  assert.deepEqual(await repository.deleteResource(context, created.id), { success: true });
  assert.equal(pool.resources.size, 0);
  assert.deepEqual(pool.audit.map(event => event.action), ['RESOURCE_DELETED']);
});
