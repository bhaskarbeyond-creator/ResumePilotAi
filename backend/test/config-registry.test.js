'use strict';

/**
 * Configuration registry, resolution order and write path (REC-012, INV-4, INV-6).
 *
 * These tests run without a database. That is deliberate and is the point: the claims
 * INV-4 and INV-6 need are about *behaviour*, not about MySQL, and a suite that needs a
 * database is a suite that does not run in the gate. A small in-memory store stands in
 * for the pool, so the transaction boundaries, the revision guard and the before/after
 * capture are all exercised.
 *
 * The register-parity test at the end reads
 * `developer-review/admin/09-configuration-gap-register.md` and asserts that every
 * `CFG-nnn` row named there has a registry entry. That is the drift guard: the document
 * and the code cannot disagree about which values are covered.
 *
 * Run: NODE_ENV=test node --test test/config-registry.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const registry = require('../config/registry');
const configService = require('../services/configService');

const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

/** Alias kept so the cases below read as store operations rather than module calls. */
const createFakeStore = createInMemoryConfigStore;

/** Inject the store for the duration of a test, then detach it. */
function withStore(store) {
  configService.setConfigPoolForTests(store.pool);
  return () => configService.setConfigPoolForTests(null);
}

const ACTOR = Object.freeze({ uid: 'admin-1', email: 'admin@example.com', role: 'ADMIN' });

/* ── registry integrity ──────────────────────────────────────────────── */

test('registry: every declared default satisfies its own validator', () => {
  // A default that fails validation would throw on the first read of an unset key,
  // which is the one moment an operator most needs the console to load.
  for (const entry of registry.ENTRIES) {
    assert.doesNotThrow(() => entry.validate(entry.defaultValue), `${entry.key} default must validate`);
  }
});

test('registry: read-only entries carry a written justification and are never deployment-editable', () => {
  const readOnly = registry.ENTRIES.filter(entry => !entry.editable);
  assert.ok(readOnly.length >= 8, 'the register justified eight constants; they must all be represented');
  for (const entry of readOnly) {
    assert.ok(entry.readOnlyReason && entry.readOnlyReason.length > 40,
      `${entry.key} must explain why it cannot be edited (INV-4 requires a justification, not a shrug)`);
  }
  for (const entry of registry.ENTRIES.filter(entry => entry.editable)) {
    assert.notStrictEqual(entry.scope, registry.SCOPE.DEPLOYMENT, `${entry.key} is editable but deployment-scoped`);
  }
});

test('registry: an env-resolved entry names its variable, so the census can say where the value came from', () => {
  for (const entry of registry.ENTRIES.filter(entry => entry.resolution === registry.RESOLUTION.ENV)) {
    assert.match(entry.envVar, /^[A-Z][A-Z0-9_]+$/, `${entry.key} must declare envVar`);
  }
});

test('registry: no credential-bearing value is registered as editable', () => {
  // Secrets belong in the secret store, never in a table the console can read back.
  const credentialish = /password|secret|api_?key|private_?key|access_?token|refresh_?token|bearer|credential/i;
  for (const entry of registry.ENTRIES.filter(entry => entry.editable)) {
    assert.ok(!credentialish.test(entry.key), `${entry.key} looks like a secret and must not be dashboard-editable`);
  }
});

test('registry: duplicate key or id is rejected at load time', () => {
  const sample = registry.ENTRIES[0];
  assert.throws(
    () => registry.assertRegistryIntegrity([sample, sample]),
    /duplicate/,
    'two entries claiming one key would make resolution order-dependent and silent'
  );
});

test('register parity: every CFG-nnn row in 09-configuration-gap-register.md has a registry entry', () => {
  const registerPath = path.join(__dirname, '..', '..', 'developer-review', 'admin', '09-configuration-gap-register.md');
  const markdown = fs.readFileSync(registerPath, 'utf8');
  const registerIds = new Set([...markdown.matchAll(/\*\*(CFG-\d{3})\*\*/g)].map(match => match[1]));
  assert.ok(registerIds.size >= 30, `expected at least 30 register rows, found ${registerIds.size}`);

  const covered = new Set(registry.ENTRIES.map(entry => entry.id.replace(/[a-z]$/, '')));
  const missing = [...registerIds].filter(id => !covered.has(id)).sort();
  assert.deepStrictEqual(missing, [], `register rows with no registry entry: ${missing.join(', ')}`);
});

/* ── resolution order ────────────────────────────────────────────────── */

test('resolution: database override wins over env and default', async () => {
  process.env.SENSITIVE_AUTH_MAX_AGE_MS = '900000';
  const store = createFakeStore({ 'security.rateLimit.authHourly': { value: 250, revision: 3 } });
  const restore = withStore(store);
  try {
    assert.strictEqual(await configService.getConfigValue('security.rateLimit.authHourly'), 250);
    const resolved = await configService.resolveAll();
    const entry = resolved.get('security.rateLimit.authHourly');
    assert.strictEqual(entry.source, 'database');
    assert.strictEqual(entry.revision, 3);
  } finally {
    restore();
    delete process.env.SENSITIVE_AUTH_MAX_AGE_MS;
  }
});

test('resolution: env applies when there is no row, and the default when there is neither', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  process.env.AUTH_BURST_RATE_LIMIT_MAX = '7';
  try {
    assert.strictEqual(await configService.getConfigValue('security.rateLimit.authBurst'), 7);
    assert.strictEqual(await configService.getConfigValue('content.announcements.defaultTtlHours'), 24);
  } finally {
    delete process.env.AUTH_BURST_RATE_LIMIT_MAX;
    restore();
  }
});

test('resolution: a read-only key ignores a database row entirely (CFG-007)', async () => {
  // The invariant is that a security value cannot be widened from a surface the
  // protected session could compromise — including by a direct SQL insert, which is
  // what this simulates.
  process.env.SENSITIVE_AUTH_MAX_AGE_MS = '600000';
  const store = createFakeStore({ 'security.session.sensitiveActionMaxAgeMs': { value: 3_600_000, revision: 9 } });
  const restore = withStore(store);
  try {
    assert.strictEqual(await configService.getConfigValue('security.session.sensitiveActionMaxAgeMs'), 600_000);
    assert.strictEqual((await configService.describeConfig()).entries
      .find(entry => entry.key === 'security.session.sensitiveActionMaxAgeMs').source, 'env');
  } finally {
    delete process.env.SENSITIVE_AUTH_MAX_AGE_MS;
    restore();
  }
});

test('resolution: an out-of-range stored row is reported, not applied', async () => {
  // A hand-edited row must not be able to put an invalid number into the runtime.
  const store = createFakeStore({ 'operations.queues.sampleSize': { value: 5000, revision: 2 } });
  const restore = withStore(store);
  try {
    assert.strictEqual(await configService.getConfigValue('operations.queues.sampleSize'), 50);
    const resolved = await configService.resolveAll();
    assert.strictEqual(resolved.get('operations.queues.sampleSize').source, 'database-invalid');
    assert.strictEqual(resolved.get('operations.queues.sampleSize').valid, false);
  } finally {
    restore();
  }
});

test('resolution: an unreachable database degrades to declared defaults and says so', async () => {
  const store = createFakeStore();
  store.failNext(Object.assign(new Error('no database'), { code: 'ECONNREFUSED' }));
  const restore = withStore(store);
  try {
    const census = await configService.describeConfig();
    assert.strictEqual(census.authority.degraded, true);
    assert.ok(census.entries.length > 30, 'the census must still render during an incident');
    assert.match(census.authority.reason, /unavailable/);
  } finally {
    restore();
  }
});

test('resolution: a missing override table is a pending migration, not a failure', async () => {
  const store = createFakeStore();
  store.failNext(Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' }));
  const restore = withStore(store);
  try {
    const census = await configService.describeConfig();
    assert.strictEqual(census.authority.degraded, true);
    assert.match(census.authority.reason, /migration 029/);
  } finally {
    restore();
  }
});

/* ── census ──────────────────────────────────────────────────────────── */

test('census: every entry reports value, origin, editability and the reason it is read-only', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    const census = await configService.describeConfig();
    assert.strictEqual(census.entries.length, registry.ENTRIES.length);
    for (const entry of census.entries) {
      assert.ok(['database', 'env', 'code', 'default', 'database-invalid', 'env-invalid'].includes(entry.source),
        `${entry.key} has an unknown source ${entry.source}`);
      assert.strictEqual(typeof entry.editable, 'boolean');
      if (!entry.editable) assert.ok(entry.readOnlyReason, `${entry.key} must carry its justification to the UI`);
      assert.ok(!('validate' in entry), 'validators are functions and must not be serialised');
    }
  } finally {
    restore();
  }
});

test('census: elevated values are redacted for a reader who may not read configuration', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    const census = await configService.describeConfig({ actorPermissions: () => false });
    const gst = census.entries.find(entry => entry.key === 'payments.tax.gstPercentage');
    assert.strictEqual(gst.redacted, true);
    assert.strictEqual(gst.value, null);
    const sample = census.entries.find(entry => entry.key === 'operations.queues.sampleSize');
    assert.strictEqual(sample.redacted, false, 'a standard-audit value is not a secret');
  } finally {
    restore();
  }
});

/* ── write path ──────────────────────────────────────────────────────── */

test('write: a valid change lands, bumps the revision and records before/after with actor and reason', async () => {
  const store = createFakeStore({ 'operations.queues.sampleSize': { value: 50, revision: 4 } });
  const restore = withStore(store);
  try {
    const result = await configService.writeConfigValue({
      key: 'operations.queues.sampleSize', value: 120, expectedRevision: 4,
      actor: ACTOR, reason: 'backlog investigation', requestId: 'req-1',
    });
    assert.strictEqual(result.value, 120);
    assert.strictEqual(result.revision, 5);
    assert.strictEqual(result.before, 50);
    assert.strictEqual(store.log.length, 1);
    const record = store.log[0];
    assert.strictEqual(record.key, 'operations.queues.sampleSize');
    assert.strictEqual(record.before, 50, 'before must come from the store, never from the caller');
    assert.strictEqual(record.after, 120);
    assert.strictEqual(record.actorUid, 'admin-1');
    assert.strictEqual(record.revisionBefore, 4);
    assert.strictEqual(record.revisionAfter, 5);
  } finally {
    restore();
  }
});

test('write: unknown key, read-only key, invalid value and missing revision are all refused without writing', async () => {
  const store = createFakeStore({ 'operations.queues.sampleSize': { value: 50, revision: 1 } });
  const restore = withStore(store);
  try {
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'not.a.key', value: 1, expectedRevision: null, actor: ACTOR }),
      error => error.status === 404 && error.code === 'CONFIG_KEY_UNKNOWN'
    );
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'security.session.sensitiveActionMaxAgeMs', value: 3_600_000, expectedRevision: null, actor: ACTOR, reason: 'make step-up last an hour' }),
      error => error.status === 403 && error.code === 'CONFIG_READ_ONLY' && /loosened/.test(error.reason)
    );
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'operations.queues.sampleSize', value: 5000, expectedRevision: 1, actor: ACTOR }),
      error => error.status === 400 && error.code === 'CONFIG_INVALID'
    );
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'payments.tax.gstPercentage', value: 12, expectedRevision: null, actor: ACTOR }),
      error => error.status === 400 && error.code === 'CONFIG_REASON_REQUIRED',
      'a tax change is an auditable event and must state why'
    );
    assert.strictEqual(store.log.length, 0, 'a refused write must leave no trail suggesting a change happened');
    assert.strictEqual(store.rows.get('operations.queues.sampleSize').value, 50);
  } finally {
    restore();
  }
});

test('write: a stale revision is a 409 that names the revision to reload', async () => {
  const store = createFakeStore({ 'operations.queues.sampleSize': { value: 50, revision: 9 } });
  const restore = withStore(store);
  try {
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'operations.queues.sampleSize', value: 80, expectedRevision: 7, actor: ACTOR }),
      error => error.status === 409 && error.code === 'CONFIG_REVISION_CONFLICT' && error.currentRevision === 9
    );
    assert.strictEqual(store.log.length, 0);
    assert.strictEqual(store.rolledBack, 1, 'the transaction must be rolled back, not left open');
  } finally {
    restore();
  }
});

test('write: creating a value that has no stored row requires an explicit null revision', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    const result = await configService.writeConfigValue({
      key: 'content.announcements.maxActive', value: 3, expectedRevision: null,
      actor: ACTOR, reason: 'seasonal campaign window',
    });
    assert.strictEqual(result.revision, 1);
    assert.strictEqual(result.beforeRevision, null);
    assert.strictEqual(store.log[0].before, undefined === undefined ? 5 : null, 'before is the declared default when no row exists');
  } finally {
    restore();
  }
});

test('write: auth burst may not exceed the hourly ceiling', async () => {
  const store = createFakeStore({ 'security.rateLimit.authHourly': { value: 30, revision: 1 } });
  const restore = withStore(store);
  try {
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'security.rateLimit.authBurst', value: 45, expectedRevision: null, actor: ACTOR }),
      error => error.status === 400 && /must not exceed/.test(error.message)
    );
    const ok = await configService.writeConfigValue({ key: 'security.rateLimit.authBurst', value: 25, expectedRevision: null, actor: ACTOR });
    assert.strictEqual(ok.value, 25);
  } finally {
    restore();
  }
});

test('history: returns newest-first before/after entries for one key', async () => {
  const store = createFakeStore({ 'operations.queues.sampleSize': { value: 50, revision: 1 } });
  const restore = withStore(store);
  try {
    await configService.writeConfigValue({ key: 'operations.queues.sampleSize', value: 60, expectedRevision: 1, actor: ACTOR });
    await configService.writeConfigValue({ key: 'operations.queues.sampleSize', value: 70, expectedRevision: 2, actor: ACTOR });
    const history = await configService.configHistory('operations.queues.sampleSize');
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].after, 70);
    assert.strictEqual(history[0].before, 60);
    assert.strictEqual(history[1].after, 60);
    assert.strictEqual(history[0].actor.uid, 'admin-1');
  } finally {
    restore();
  }
});

test('invalidation: a successful write is visible immediately, not after the cache TTL', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    assert.strictEqual(await configService.getConfigValue('content.announcements.defaultTtlHours'), 24);
    await configService.writeConfigValue({
      key: 'content.announcements.defaultTtlHours', value: 48, expectedRevision: null,
      actor: ACTOR, reason: 'two-day campaign banner',
    });
    assert.strictEqual(await configService.getConfigValue('content.announcements.defaultTtlHours'), 48);
  } finally {
    restore();
  }
});

/* ── remaining refusal and env paths ─────────────────────────────────── */

test('a malformed environment value is reported and the default is used instead', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  process.env.AUTH_BURST_RATE_LIMIT_MAX = 'not-a-number';
  try {
    const resolved = await configService.resolveAll();
    const entry = resolved.get('security.rateLimit.authBurst');
    assert.strictEqual(entry.source, 'env-invalid');
    assert.strictEqual(entry.valid, false);
    assert.strictEqual(entry.value, 5, 'an unreadable deployment value must not take the platform down');
  } finally {
    delete process.env.AUTH_BURST_RATE_LIMIT_MAX;
    restore();
  }
});

test('an unknown key is a programming error unless the caller supplies an explicit fallback', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    await assert.rejects(() => configService.getConfigValue('no.such.key'), /unknown key/);
    assert.strictEqual(await configService.getConfigValue('no.such.key', 42), 42,
      'the fallback exists for call sites that must never throw mid-request');
    await assert.rejects(() => configService.getConfigValues(['operations.queues.sampleSize', 'no.such.key']), /unknown key/);
  } finally {
    restore();
  }
});

test('a write without an identified actor is refused: an unattributable change is not a change', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'operations.queues.sampleSize', value: 60, expectedRevision: null, actor: null }),
      error => error.code === 'CONFIG_ACTOR_REQUIRED'
    );
    await assert.rejects(
      () => configService.writeConfigValue({ key: 'operations.queues.sampleSize', value: 60, expectedRevision: null, actor: {} }),
      error => error.code === 'CONFIG_ACTOR_REQUIRED'
    );
  } finally {
    restore();
  }
});

test('a reason longer than the audit column is refused rather than truncated', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    await assert.rejects(
      () => configService.writeConfigValue({
        key: 'payments.tax.gstPercentage', value: 12, expectedRevision: null,
        actor: ACTOR, reason: 'x'.repeat(501),
      }),
      error => error.code === 'CONFIG_REASON_TOO_LONG'
    );
  } finally {
    restore();
  }
});

test('history for an unregistered key is a 404 from the service too', async () => {
  const store = createFakeStore();
  const restore = withStore(store);
  try {
    await assert.rejects(() => configService.configHistory('no.such.key'), error => error.status === 404);
  } finally {
    restore();
  }
});
