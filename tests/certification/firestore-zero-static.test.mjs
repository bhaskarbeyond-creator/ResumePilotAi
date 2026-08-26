/**
 * ZERO-FORESTORE STATIC CERTIFICATION (mission §2, §31)
 *
 * Structural proof that Firestore is outside every synchronous production
 * path, independent of runtime state:
 *   1. Repository factory returns MySQL-only repositories (no Firestore adapter
 *      reachable through the application interface).
 *   2. The resilient repository carries no Firestore handle and no fallback.
 *   3. The dependency census finds ZERO active Firestore data-plane references.
 *   4. The frontend bundle source contains no Firestore SDK imports and the
 *      compatibility shim refuses Firestore access.
 *   5. The notification queue is MySQL-backed and free of Firestore primitives.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('repository factory never hands out a Firestore adapter on the application path', () => {
  const repos = require(path.join(ROOT, 'backend', 'repositories', 'index.js'));
  const repo = repos.getRepository(null);
  assert.ok(repo, 'getRepository returns a repository');
  assert.equal(repo.firestoreRepo ?? null, null, 'no Firestore adapter is attached');
  assert.equal(repo.firestoreDb ?? null, null, 'no Firestore handle is attached');
  assert.ok(repo.mysqlRepo, 'the MySQL repository backs the resilient repository');
});

test('resilient repository source contains no Firestore fallback logic', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend', 'repositories', 'ResilientRepository.js'), 'utf8');
  assert.match(source, /MySQL\/MariaDB is the single authoritative store/);
  // Every assignment of the Firestore handle must be the null constant.
  const assignments = source.match(/this\.firestoreRepo\s*=[^;\n]*/g) || [];
  assert.ok(assignments.length > 0, 'the class must explicitly pin the handle');
  for (const assignment of assignments) {
    assert.match(assignment, /this\.firestoreRepo\s*=\s*null\s*$/, `unsafe Firestore handle assignment: ${assignment}`);
  }
  assert.doesNotMatch(source, /fallback to firestore|read from firestore|write to firestore/i);
});

test('dependency census: zero active Firestore data-plane references', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'firestore-dependency-census.mjs')], {
    cwd: ROOT, encoding: 'utf8',
  });
  assert.match(out, /ACTIVE_DATA_PLANE hits: 0/);
  assert.match(out, /CERTIFICATION: ZERO synchronous Firestore data-plane references/);
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'firestore-dependency-census.json'), 'utf8'));
  assert.equal(report.summary.activeDataPlaneHits, 0);
});

test('frontend source has no Firestore SDK imports; shim refuses Firestore', () => {
  const offenders = [];
  const scan = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(full); continue; }
      if (!/\.(js|jsx)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/from ['"]firebase\/firestore['"]|from ['"]firebase\/compat\/firestore['"]|require\(['"]firebase\/firestore/.test(text)) {
        offenders.push(full);
      }
    }
  };
  scan(path.join(ROOT, 'src'));
  assert.deepEqual(offenders, [], 'no Firestore SDK module may be imported by the frontend');

  const fire = fs.readFileSync(path.join(ROOT, 'src', 'conf', 'fire.js'), 'utf8');
  assert.match(fire, /import 'firebase\/compat\/auth'/, 'identity (auth) remains the only Firebase surface');
  assert.match(fire, /Firestore is not available in the browser/, 'the shim must refuse Firestore access');
  assert.doesNotMatch(fire, /firebase\/compat\/firestore|firebase\/firestore/);
});

test('notification outbox is a MySQL transactional outbox (no external queue dependency)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'backend', 'services', 'notificationOutbox.js'), 'utf8');
  assert.match(source, /INSERT IGNORE INTO notification_outbox/);
  assert.match(source, /lease_owner/);
  assert.match(source, /DEAD_LETTER/);
  assert.doesNotMatch(source, /firestore/i);
  const schema = fs.readFileSync(path.join(ROOT, 'backend', 'database', 'schema.sql'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS notification_outbox/);
});

test('runtime data-plane gate is a permanent null (no env can re-enable Firestore)', () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'backend', 'index.js'), 'utf8');
  assert.match(indexSource, /const db = null; \/\/ PERMANENT/, 'the data-plane handle must be a permanent null constant');
  assert.doesNotMatch(indexSource, /db = admin\.firestore\(\)/, 'no code may assign a Firestore client to the data-plane handle');
});
