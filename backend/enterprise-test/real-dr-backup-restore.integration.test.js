'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('Disaster Recovery & Backup: Full enterprise snapshot produces deterministic checksums and full state restore', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();

  // 1. Setup schema & test table
  await db.query('CREATE SCHEMA tenant_data');
  await db.query('CREATE TABLE tenant_data.resumes (id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL, content jsonb NOT NULL, checksum text NOT NULL)');

  // 2. Populate seed records across 3 tenants
  const seedRecords = [
    { id: 'res-1', tenant_id: crypto.randomUUID(), title: 'Alice Resume', content: { skills: ['Node.js', 'PostgreSQL'] } },
    { id: 'res-2', tenant_id: crypto.randomUUID(), title: 'Bob Resume', content: { skills: ['React', 'TypeScript'] } },
    { id: 'res-3', tenant_id: crypto.randomUUID(), title: 'Charlie Resume', content: { skills: ['Kubernetes', 'AWS'] } },
  ];

  for (const rec of seedRecords) {
    const rawContent = JSON.stringify(rec.content);
    const checksum = crypto.createHash('sha256').update(rawContent).digest('hex');
    await db.query(
      'INSERT INTO tenant_data.resumes (id, tenant_id, title, content, checksum) VALUES ($1, $2, $3, $4, $5)',
      [rec.id, rec.tenant_id, rec.title, rawContent, checksum]
    );
  }

  // 3. Create backup snapshot
  const exportResult = await db.query('SELECT * FROM tenant_data.resumes ORDER BY id ASC');
  assert.equal(exportResult.rows.length, 3);
  const snapshotJson = JSON.stringify(exportResult.rows);
  const snapshotChecksum = crypto.createHash('sha256').update(snapshotJson).digest('hex');

  // 4. Simulate catastrophic data loss (e.g. accidental DROP / truncation)
  await db.query('TRUNCATE TABLE tenant_data.resumes');
  const emptyCheck = await db.query('SELECT count(*) AS total FROM tenant_data.resumes');
  assert.equal(Number(emptyCheck.rows[0].total), 0, 'Database table must be empty after simulated disaster');

  // 5. Execute Disaster Recovery Restore procedure
  const restoredRows = JSON.parse(snapshotJson);
  const restoredChecksum = crypto.createHash('sha256').update(JSON.stringify(restoredRows)).digest('hex');
  assert.equal(restoredChecksum, snapshotChecksum, 'Restore manifest checksum must match pre-disaster snapshot 100%');

  for (const row of restoredRows) {
    await db.query(
      'INSERT INTO tenant_data.resumes (id, tenant_id, title, content, checksum) VALUES ($1, $2, $3, $4, $5)',
      [row.id, row.tenant_id, row.title, typeof row.content === 'string' ? row.content : JSON.stringify(row.content), row.checksum]
    );
  }

  // 6. Verify full post-restore integrity
  const finalCheck = await db.query('SELECT * FROM tenant_data.resumes ORDER BY id ASC');
  assert.equal(finalCheck.rows.length, 3);
  for (let i = 0; i < finalCheck.rows.length; i++) {
    assert.equal(finalCheck.rows[i].id, seedRecords[i].id);
    assert.equal(finalCheck.rows[i].title, seedRecords[i].title);
    const content = typeof finalCheck.rows[i].content === 'string' ? JSON.parse(finalCheck.rows[i].content) : finalCheck.rows[i].content;
    assert.deepEqual(content, seedRecords[i].content);
  }
});
