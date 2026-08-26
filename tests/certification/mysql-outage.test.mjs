/**
 * MYSQL OUTAGE BEHAVIOR (mission §6, §12 failure injection)
 *
 * Boots the real backend with MySQL UNREACHABLE (connection refused) and
 * proves the controlled-degradation contract:
 *   - the application STARTS (liveness intact, no crash-loop)
 *   - readiness reports the authoritative database as UNAVAILABLE (503)
 *   - reads/writes fail with controlled 503 errors — never fabricated success,
 *     never a silent switch to another database
 *   - truly MySQL-independent endpoints keep working
 *   - recovery: pointing the same build back at a healthy MySQL restores full
 *     service (verified by the Firestore-OFF acceptance suite running the
 *     identical journeys against the healthy database)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootServer, certToken } from './helpers/bootServer.mjs';

const PORT = 8312;
const DEAD_DB_PORT = 3399; // nothing listens here → ECONNREFUSED

let server;

test.before(async () => {
  server = await bootServer({
    port: PORT,
    db: { host: '127.0.0.1', port: String(DEAD_DB_PORT), user: 'resumepilot', password: 'x', name: 'ai_resume_builder' },
    timeoutMs: 45_000,
  });
});

test.after(async () => {
  if (server) await server.stop();
});

const json = (method, path, { token, body } = {}) => fetch(`${server.base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(async res => ({ status: res.status, body: await res.json().catch(() => null) }));

test('application starts during a MySQL outage (liveness preserved)', async () => {
  const health = await json('GET', '/healthz');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.firestoreDataPlane, 'REMOVED');
  const logs = server.logs();
  assert.match(logs, /starting in degraded mode|Schema bootstrap incomplete|MySQL unreachable/i);
});

test('readiness honestly reports the authoritative database as unavailable', async () => {
  const ready = await json('GET', '/readyz');
  assert.equal(ready.status, 503);
  assert.equal(ready.body.status, 'not_ready');
  assert.equal(ready.body.checks.mysql.status, 'UNAVAILABLE');
  assert.equal(ready.body.checks.firestoreDataPlane, 'REMOVED', 'outage handling must never involve a secondary store');
});

test('reads fail with a controlled error — no fabricated data', async () => {
  const token = certToken({ uid: 'outage-user', email: 'o@certification.local', role: 'USER' });
  const res = await json('GET', '/api/resumes', { token });
  assert.equal(res.status, 503);
  assert.ok(['DATABASE_UNAVAILABLE', 'SERVICE_DEGRADED', 'SERVICE_UNAVAILABLE'].includes(res.body.code), JSON.stringify(res.body));
  assert.equal(res.body.success, false, 'no fabricated success during an outage');
  assert.ok(!res.body.resumes, 'no fabricated resume list during an outage');
});

test('writes are rejected with a controlled error — nothing is acknowledged', async () => {
  const token = certToken({ uid: 'outage-user', email: 'o@certification.local', role: 'USER' });
  const res = await json('POST', '/api/resumes/outage_resume_1', {
    token,
    body: { title: 'should not be acknowledged' },
  });
  assert.equal(res.status, 503);
  assert.ok(['DATABASE_UNAVAILABLE', 'SERVICE_DEGRADED', 'SERVICE_UNAVAILABLE'].includes(res.body.code), JSON.stringify(res.body));
  assert.equal(res.body.success, false, 'a write during an outage must never be reported as saved');

  const profile = await json('POST', '/api/users-data/profile', {
    token,
    body: { email: 'o@certification.local', firstname: 'Outage', lastname: 'Test' },
  });
  assert.equal(profile.status, 503);
  assert.equal(profile.body.success, false);
});

test('MySQL-independent endpoints remain available', async () => {
  const version = await json('GET', '/api/platform/version');
  assert.equal(version.status, 200);
  assert.ok(version.body.commitSha, 'deployment identity stays available during a data-plane outage');
});

test('no fallback to any secondary database is attempted', async () => {
  const logs = server.logs();
  // The outage must be surfaced as MySQL errors only.
  assert.doesNotMatch(logs, /switching to firestore|failover to firestore|firestore fallback/i);
  assert.doesNotMatch(logs, /\[Firestore Data Plane\] ENABLED/);
});
