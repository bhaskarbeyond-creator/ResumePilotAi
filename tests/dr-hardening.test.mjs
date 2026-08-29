/**
 * DR / cloud-hardening unit certification.
 *
 * These tests assert the parts of the disaster-recovery system that decide
 * whether a recovery point is DESTROYED or an alert is RAISED. They run
 * without MariaDB, without network access and without production credentials,
 * so the guarantees they encode are verifiable in CI on every commit.
 *
 * Anything this file does not cover (real uploads, real restores) is
 * deliberately reported as NOT VERIFIED in docs/DR_CLOUD_FIRST_HARDENING.md
 * rather than asserted here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_POLICY,
  dayKey,
  evaluateRpo,
  monthKey,
  normalizePolicy,
  parseBackupTimestamp,
  planRetention,
  summariseDrPosture,
  weekKey,
} from '../scripts/lib/dr-policy.mjs';

import {
  assertSafeDestination,
  buildOffsiteUpload,
  detectOffsiteProviders,
  selectOffsiteProvider,
  whichSync,
} from '../scripts/lib/dr-offsite.mjs';

const DAY = 86400000;
const ANCHOR = Date.UTC(2026, 7, 29, 12, 0, 0); // 2026-08-29T12:00:00Z (Saturday)

/** Build `count` daily backups ending at `anchor`. */
function dailyEntries(count, anchor = ANCHOR) {
  return Array.from({ length: count }, (_, i) => ({
    file: `/backups/resumepilot-${anchor - i * DAY}.sql.gz.enc`,
    timestampMs: anchor - i * DAY,
    sizeBytes: 1024 * (i + 1),
  }));
}

// ───────────────────────────────────────────────────────────────────────────
// Timestamp parsing — the input every retention decision depends on
// ───────────────────────────────────────────────────────────────────────────

test('parseBackupTimestamp reads the existing production snapshot naming', () => {
  assert.equal(
    parseBackupTimestamp('mariadb-snapshot-u727965524_airesume-1787972070645.sql.gz'),
    1787972070645,
  );
});

test('parseBackupTimestamp handles encrypted and compressed variants', () => {
  assert.equal(parseBackupTimestamp('resumepilot-1787972070645.sql.gz.enc'), 1787972070645);
  assert.equal(parseBackupTimestamp('resumepilot-1787972070645.sql'), 1787972070645);
});

test('parseBackupTimestamp handles ISO-8601 compact stamps', () => {
  assert.equal(parseBackupTimestamp('backup-20260829T025430Z.sql.gz'), Date.UTC(2026, 7, 29, 2, 54, 30));
});

test('parseBackupTimestamp returns null rather than guessing', () => {
  for (const name of ['backup.sql.gz', '', 'latest.sql', 'resumepilot-123.sql.gz', null, undefined]) {
    assert.equal(parseBackupTimestamp(name), null, `expected null for ${String(name)}`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Calendar keys — ISO week boundaries are the classic off-by-one
// ───────────────────────────────────────────────────────────────────────────

test('weekKey keeps a Monday-to-Sunday ISO week together', () => {
  const days = [24, 25, 26, 27, 28, 29, 30].map((d) => weekKey(Date.UTC(2026, 7, d)));
  assert.equal(new Set(days).size, 1, 'Mon 2026-08-24 .. Sun 2026-08-30 must be one ISO week');
  assert.equal(days[0], '2026-W35');
});

test('weekKey rolls over on Monday, not Sunday', () => {
  assert.equal(weekKey(Date.UTC(2026, 7, 30)), '2026-W35'); // Sunday
  assert.equal(weekKey(Date.UTC(2026, 7, 31)), '2026-W36'); // next day, Monday
});

test('weekKey handles the Friday year-start case (ISO year differs from calendar year)', () => {
  // 2027-01-01 is a Friday, so it belongs to the final week of ISO year 2026.
  assert.equal(weekKey(Date.UTC(2027, 0, 1)), '2026-W53');
  assert.equal(weekKey(Date.UTC(2027, 0, 4)), '2027-W01');
});

test('dayKey and monthKey are UTC-stable', () => {
  assert.equal(dayKey(ANCHOR), '2026-08-29');
  assert.equal(monthKey(ANCHOR), '2026-08');
});

// ───────────────────────────────────────────────────────────────────────────
// Retention — the destructive part. These are the invariants that matter.
// ───────────────────────────────────────────────────────────────────────────

test('retention always keeps the newest recovery point', () => {
  const entries = dailyEntries(40);
  const plan = planRetention(entries, DEFAULT_POLICY, ANCHOR);
  assert.ok(plan.keep.some((e) => e.file === entries[0].file));
});

test('retention never drops below the safety floor, even with an empty calendar policy', () => {
  const entries = dailyEntries(30);
  const plan = planRetention(entries, { daily: 0, weekly: 0, monthly: 0, minKeep: 3 }, ANCHOR);
  assert.equal(plan.keep.length, 3);
  // The three newest specifically — those are the ones worth having.
  assert.deepEqual(
    plan.keep.map((e) => e.file).sort(),
    entries.slice(0, 3).map((e) => e.file).sort(),
  );
});

test('retention protects in-flight backups inside minAgeSeconds', () => {
  const fresh = { file: '/backups/in-flight.sql.enc', timestampMs: ANCHOR - 60_000 };
  const plan = planRetention([fresh, ...dailyEntries(40)], { minKeep: 0, daily: 0, weekly: 0, monthly: 0, minAgeSeconds: 900 }, ANCHOR);
  assert.ok(plan.keep.some((e) => e.file === fresh.file), 'a 60s-old backup must not be pruned');
  assert.equal(plan.keep.find((e) => e.file === fresh.file).reason, 'recent-protection');
});

test('retention never prunes a backup whose age cannot be proven', () => {
  const unknown = { file: '/backups/mystery-backup.sql.enc', timestampMs: NaN };
  const plan = planRetention([unknown, ...dailyEntries(20)], DEFAULT_POLICY, ANCHOR);
  const kept = plan.keep.find((e) => e.file === unknown.file);
  assert.ok(kept, 'undated backups must be retained for manual review');
  assert.equal(kept.reason, 'undated-manual-review');
  assert.ok(plan.prune.every((e) => e.file !== unknown.file));
});

test('GFS retention bounds the retained set across 90 daily backups', () => {
  const entries = dailyEntries(90);
  const plan = planRetention(entries, DEFAULT_POLICY, ANCHOR);
  // 7 daily + 4 weekly + 6 monthly, de-duplicated, plus the safety floor.
  assert.ok(plan.keep.length >= 7, `expected at least 7 kept, got ${plan.keep.length}`);
  assert.ok(plan.keep.length <= 7 + 4 + 6, `GFS must bound retention, got ${plan.keep.length}`);
  assert.equal(plan.keep.length + plan.prune.length, entries.length, 'every entry is classified exactly once');
});

test('retention prunes the oldest backups and preserves spread', () => {
  const entries = dailyEntries(60);
  const plan = planRetention(entries, DEFAULT_POLICY, ANCHOR);
  const oldestFile = entries[entries.length - 1].file;
  assert.ok(plan.prune.some((e) => e.file === oldestFile), 'the oldest daily backup should be pruned');
  assert.equal(plan.prune[0].reason, 'outside-retention-window');
});

test('retention is deterministic across runs', () => {
  const entries = dailyEntries(45);
  const a = planRetention(entries, DEFAULT_POLICY, ANCHOR);
  const b = planRetention(entries, DEFAULT_POLICY, ANCHOR);
  assert.deepEqual(a.keep.map((e) => `${e.file}|${e.reason}`), b.keep.map((e) => `${e.file}|${e.reason}`));
});

test('retention tolerates empty and malformed input', () => {
  assert.equal(planRetention([], DEFAULT_POLICY, ANCHOR).keep.length, 0);
  assert.equal(planRetention(null, DEFAULT_POLICY, ANCHOR).keep.length, 0);
  const junk = planRetention([null, {}, { file: '' }, { file: 42 }], DEFAULT_POLICY, ANCHOR);
  assert.equal(junk.keep.length, 0);
});

test('normalizePolicy ignores unknown keys instead of disabling protections', () => {
  const p = normalizePolicy({ daily: 'not-a-number', typoKey: 1, minKeep: -5 });
  assert.equal(p.daily, DEFAULT_POLICY.daily);
  assert.equal(p.minKeep, 3, 'a negative floor must fall back to the safe default');
  assert.equal(p.typoKey, undefined);
});

// ───────────────────────────────────────────────────────────────────────────
// RPO evaluation — measured, not aspirational
// ───────────────────────────────────────────────────────────────────────────

test('RPO is OK when the newest backup is well inside target', () => {
  const r = evaluateRpo({ lastSuccessfulBackupAtMs: ANCHOR - 3600_000, nowMs: ANCHOR, policy: DEFAULT_POLICY });
  assert.equal(r.status, 'OK');
  assert.equal(r.measuredRpoSeconds, 3600);
  assert.equal(r.withinTarget, true);
});

test('RPO warns at the configured fraction of the budget', () => {
  const target = DEFAULT_POLICY.rpoTargetSeconds; // 21600
  const r = evaluateRpo({ lastSuccessfulBackupAtMs: ANCHOR - (target * 0.8) * 1000, nowMs: ANCHOR, policy: DEFAULT_POLICY });
  assert.equal(r.status, 'WARN');
});

test('RPO breaches once the window is exceeded', () => {
  const r = evaluateRpo({ lastSuccessfulBackupAtMs: ANCHOR - (DEFAULT_POLICY.rpoTargetSeconds + 60) * 1000, nowMs: ANCHOR, policy: DEFAULT_POLICY });
  assert.equal(r.status, 'BREACH');
  assert.equal(r.withinTarget, false);
});

test('RPO is UNKNOWN — never silently OK — when no backup has succeeded', () => {
  for (const bad of [null, undefined, 0, NaN, -1]) {
    const r = evaluateRpo({ lastSuccessfulBackupAtMs: bad, nowMs: ANCHOR });
    assert.equal(r.status, 'UNKNOWN');
    assert.equal(r.withinTarget, false, 'an unknown RPO must never report as within target');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Posture summary — alerting must fail closed
// ───────────────────────────────────────────────────────────────────────────

test('posture is CRITICAL on an RPO breach and enumerates every gap', () => {
  const s = summariseDrPosture({ rpoStatus: 'BREACH', offsiteConfigured: false, encryptionEnabled: false, nowMs: ANCHOR });
  assert.equal(s.status, 'CRITICAL');
  assert.ok(s.problems.includes('RPO_BREACH'));
  assert.ok(s.problems.includes('NO_OFFSITE_COPY'));
  assert.ok(s.problems.includes('BACKUP_UNENCRYPTED'));
  assert.ok(s.problems.includes('NO_RESTORE_DRILL'));
});

test('posture flags a configured-but-unverified offsite destination', () => {
  const s = summariseDrPosture({ rpoStatus: 'OK', offsiteConfigured: true, offsiteVerified: false, encryptionEnabled: true, lastRestoreDrillAtMs: ANCHOR - 86_400_000, nowMs: ANCHOR });
  assert.equal(s.status, 'DEGRADED');
  assert.ok(s.problems.includes('OFFSITE_NOT_VERIFIED'));
});

test('posture is CRITICAL when there are no recovery points at all', () => {
  const s = summariseDrPosture({
    rpoStatus: 'UNKNOWN',
    offsiteConfigured: true,
    offsiteVerified: true,
    encryptionEnabled: true,
    lastRestoreDrillAtMs: ANCHOR - DAY,
    recoveryPointCount: 0,
    nowMs: ANCHOR,
  });
  assert.equal(s.status, 'CRITICAL', 'zero recovery points must never be reported as merely degraded');
  assert.ok(s.problems.includes('NO_RECOVERY_POINTS'));
});

test('posture does not invent a recovery-point failure when the count is unmeasured', () => {
  const s = summariseDrPosture({
    rpoStatus: 'OK',
    offsiteConfigured: true,
    offsiteVerified: true,
    encryptionEnabled: true,
    lastRestoreDrillAtMs: ANCHOR - DAY,
    nowMs: ANCHOR,
  });
  assert.equal(s.status, 'OK');
  assert.ok(!s.problems.includes('NO_RECOVERY_POINTS'));
});

test('posture is OK only when every control is satisfied', () => {
  const s = summariseDrPosture({ rpoStatus: 'OK', offsiteConfigured: true, offsiteVerified: true, encryptionEnabled: true, lastRestoreDrillAtMs: ANCHOR - DAY, nowMs: ANCHOR });
  assert.equal(s.status, 'OK');
  assert.deepEqual(s.problems, []);
});

// ───────────────────────────────────────────────────────────────────────────
// Offsite transport — command construction must be injection-proof
// ───────────────────────────────────────────────────────────────────────────

test('offsite destination rejects shell metacharacters', () => {
  for (const bad of ['s3://bucket/path; rm -rf /', 'remote:$(whoami)', 'a|b', 'x>y', 'q"z', "q'z", 'a&&b']) {
    assert.throws(() => assertSafeDestination('rclone', bad), /unsafe characters|not a valid/, `must reject ${bad}`);
  }
});

test('offsite destination rejects unknown providers and empty values', () => {
  assert.throws(() => assertSafeDestination('scp', 'host:/x'), /Unsupported/);
  assert.throws(() => assertSafeDestination('rclone', '   '), /required/);
});

test('offsite destination accepts legitimate targets', () => {
  assert.equal(assertSafeDestination('rclone', 'b2-remote:resumepilot-backups'), 'b2-remote:resumepilot-backups');
  assert.equal(assertSafeDestination('aws', 's3://resumepilot-backups/db'), 's3://resumepilot-backups/db');
  assert.equal(assertSafeDestination('gsutil', 'gs://resumepilot-backups/db'), 'gs://resumepilot-backups/db');
});

test('rclone upload is built as argv with no shell and enables checksum verification', () => {
  const cmd = buildOffsiteUpload({
    provider: 'rclone',
    binary: '/usr/bin/rclone',
    filePath: '/backups/resumepilot-1787972070645.sql.gz.enc',
    destination: 'b2-remote:resumepilot-backups',
  });
  assert.equal(cmd.argv[0], 'copyto');
  assert.ok(cmd.argv.includes('--checksum'));
  assert.equal(cmd.argv[2], 'b2-remote:resumepilot-backups/resumepilot-1787972070645.sql.gz.enc');
  assert.ok(cmd.argv.every((a) => typeof a === 'string' && !/[;&|]/.test(a)));
});

test('aws upload requests server-side encryption by default', () => {
  const cmd = buildOffsiteUpload({ provider: 'aws', binary: '/usr/bin/aws', filePath: '/b/x.sql.enc', destination: 's3://rp-backups/db' });
  assert.deepEqual(cmd.argv.slice(0, 3), ['s3', 'cp', '/b/x.sql.enc']);
  assert.ok(cmd.argv.includes('AES256'), 'default SSE must be requested');
});

test('offsite upload refuses an empty file path', () => {
  assert.throws(() => buildOffsiteUpload({ provider: 'rclone', binary: '/usr/bin/rclone', filePath: '  ', destination: 'r:x' }), /required/);
});

test('provider detection is empirical and injectable', () => {
  const found = detectOffsiteProviders({
    existsSync: (p) => p.endsWith('/rclone') || p.endsWith('\\rclone.exe'),
    env: { PATH: '/usr/bin:/bin', BACKUP_OFFSITE_RCLONE_REMOTE: 'b2:rp' },
  });
  const rclone = found.find((e) => e.provider === 'rclone');
  assert.equal(rclone.installed, true);
  assert.equal(rclone.configured, true);

  const none = detectOffsiteProviders({ existsSync: () => false, env: { PATH: '/usr/bin' } });
  assert.ok(none.every((e) => e.installed === false));
  assert.equal(selectOffsiteProvider({ existsSync: () => false, env: { PATH: '/usr/bin' } }).provider, 'none');
});

test('selectOffsiteProvider rejects an unsupported explicit override', () => {
  assert.throws(() => selectOffsiteProvider({ existsSync: () => false, env: { PATH: '/bin', BACKUP_OFFSITE_PROVIDER: 'ftp' } }), /not one of/);
});

test('whichSync rejects names that could escape the PATH lookup', () => {
  assert.equal(whichSync('../evil', { pathValue: '/bin', existsSync: () => true }), null);
  assert.equal(whichSync('rclone; rm -rf /', { pathValue: '/bin', existsSync: () => true }), null);
});

// ───────────────────────────────────────────────────────────────────────────
// Production observability — latency statistics and architecture invariants
// ───────────────────────────────────────────────────────────────────────────

const { checkInvariants, percentile, summarise } = await import('../scripts/dr-observability.mjs');

test('percentile interpolates correctly and never exceeds observed bounds', () => {
  const samples = [10, 20, 30, 40, 50];
  assert.equal(percentile(samples, 50), 30);
  assert.equal(percentile(samples, 0), 10);
  assert.equal(percentile(samples, 100), 50);
  // p95 of 5 samples sits between the 4th and 5th value.
  const p95 = percentile(samples, 95);
  assert.ok(p95 > 40 && p95 < 50, `p95 should interpolate between 40 and 50, got ${p95}`);
});

test('percentile handles degenerate inputs', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile(null, 50), null);
  assert.equal(percentile([42], 99), 42);
});

test('latency summary counts failures and orders percentiles monotonically', () => {
  const s = summarise([
    { ok: true, latencyMs: 120 }, { ok: true, latencyMs: 20 }, { ok: true, latencyMs: 60 },
    { ok: false, latencyMs: 500 }, { ok: true, latencyMs: 40 },
  ]);
  assert.equal(s.attempts, 5);
  assert.equal(s.successes, 4);
  assert.equal(s.failures, 1);
  assert.equal(s.successRate, 0.8);
  const { min, p50, p95, p99, max } = s.latencyMs;
  assert.equal(min, 20);
  assert.equal(max, 120);
  assert.ok(min <= p50 && p50 <= p95 && p95 <= p99 && p99 <= max, 'percentiles must be monotonic');
});

test('latency summary survives a total outage without throwing', () => {
  const s = summarise([{ ok: false, latencyMs: 1 }, { ok: false, latencyMs: 2 }]);
  assert.equal(s.successes, 0);
  assert.equal(s.latencyMs, null, 'no successful sample means no latency statistics');
  assert.equal(s.successRate, 0);
});

// Fixtures shaped exactly like the live production responses observed on
// 2026-08-29T03:52Z from https://airesume.projectdemo.guru
function productionHealthz(overrides = {}) {
  return { last: { json: {
    status: 'ok', identityProviderConfigured: true, firebaseAdminConfigured: true,
    firestoreDataPlane: 'REMOVED', authoritativeDatabase: 'MARIADB',
    commitSha: 'f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b',
    databases: { mariadb: { status: 'UP', healthy: true } },
    ...overrides,
  } } };
}
function productionReadyz(overrides = {}) {
  return { last: { json: {
    status: 'ready', authoritativeDatabase: 'MARIADB',
    checks: {
      mysql: { status: 'READY', version: '11.8.8-MariaDB-log', host: '127.0.0.1', database: 'u727965524_airesume' },
      schema: 'INITIALIZED', identityProvider: 'CONFIGURED', firestoreDataPlane: 'REMOVED',
      enterprise: { dataProvider: 'mysql', queue: 'mysql-transactional-outbox', quotaStore: 'mariadb-atomic' },
      ...overrides,
    },
  } } };
}

test('all architecture invariants pass against the live production payload shape', () => {
  const r = checkInvariants({ healthz: productionHealthz(), readyz: productionReadyz() });
  assert.equal(r.status, 'PASS');
  assert.equal(r.failed, 0);
  assert.equal(r.checks.length, 7);
});

test('reintroducing the Firestore data plane is detected, not assumed absent', () => {
  const r = checkInvariants({
    healthz: productionHealthz({ firestoreDataPlane: 'ACTIVE' }),
    readyz: productionReadyz(),
  });
  assert.equal(r.status, 'FAIL');
  assert.ok(r.checks.find((c) => c.name.includes('Firestore')).pass === false);
});

test('silently swapping the authoritative datastore is detected', () => {
  const r = checkInvariants({
    healthz: productionHealthz({ authoritativeDatabase: 'POSTGRES' }),
    readyz: productionReadyz({ authoritativeDatabase: 'POSTGRES' }),
  });
  assert.equal(r.status, 'FAIL');
  assert.ok(r.checks.find((c) => c.name.includes('authoritative')).pass === false);
});

test('introducing Redis for queue or quota is detected', () => {
  const r = checkInvariants({
    healthz: productionHealthz(),
    readyz: productionReadyz({ enterprise: { queue: 'redis', quotaStore: 'redis' } }),
  });
  assert.equal(r.status, 'FAIL');
  assert.equal(r.failed, 2, 'both the queue and quota-store invariants must fail');
});

test('a database outage is detected', () => {
  const r = checkInvariants({
    healthz: productionHealthz({ databases: { mariadb: { status: 'DOWN', healthy: false } } }),
    readyz: productionReadyz({ mysql: { status: 'DOWN' }, schema: 'UNINITIALIZED' }),
  });
  assert.equal(r.status, 'FAIL');
  assert.ok(r.failed >= 2, 'database health and schema must both fail');
  assert.ok(r.checks.find((c) => c.name.includes('healthy')).pass === false);
  assert.ok(r.checks.find((c) => c.name.includes('Schema')).pass === false);
});

test('missing payloads fail closed rather than reporting healthy', () => {
  const r = checkInvariants({ healthz: { last: { json: null } }, readyz: { last: { json: null } } });
  assert.equal(r.status, 'FAIL');
  assert.equal(r.passed, 0);
});
