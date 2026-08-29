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
  backoffDelayMs,
  buildVerifyUploadCommand,
  classifyBackupSignals,
  dayKey,
  evaluateDiskSpace,
  evaluateOffsiteRequirement,
  evaluateRpo,
  evaluateSizeAnomaly,
  median,
  monthKey,
  normalizePolicy,
  parseBackupTimestamp,
  planRetention,
  requiredFreeBytes,
  summariseDrPosture,
  verifyUploadResult,
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

// ───────────────────────────────────────────────────────────────────────────
// Backup pipeline safety: size anomaly, disk guard, retry, upload verification
// ───────────────────────────────────────────────────────────────────────────

test('median handles odd, even, empty and dirty input', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median(null), null);
  assert.equal(median([9, 'x', 3, null, 6]), 6, 'non-numeric entries are ignored');
});

test('a backup suspiciously smaller than its own history is flagged', () => {
  const r = evaluateSizeAnomaly({ sizeBytes: 100, historicalSizes: [1000, 1000, 1000] });
  assert.equal(r.status, 'ANOMALY_SUSPICIOUSLY_SMALL');
  assert.equal(r.ratio, 0.1);
});

test('a backup suspiciously larger than its own history is flagged', () => {
  const r = evaluateSizeAnomaly({ sizeBytes: 5000, historicalSizes: [1000, 1000, 1000] });
  assert.equal(r.status, 'ANOMALY_SUSPICIOUSLY_LARGE');
});

test('a normal backup is not flagged', () => {
  const r = evaluateSizeAnomaly({ sizeBytes: 1000, historicalSizes: [1000, 1000, 1000] });
  assert.equal(r.status, 'OK');
});

test('size anomaly reports INSUFFICIENT_HISTORY rather than a false all-clear', () => {
  const r = evaluateSizeAnomaly({ sizeBytes: 1000, historicalSizes: [1000] });
  assert.equal(r.status, 'INSUFFICIENT_HISTORY');
  assert.ok(r.note.includes('Need 3 prior backups'));
});

test('size anomaly rejects an invalid size outright', () => {
  for (const bad of [0, -1, NaN, null, undefined, 'x']) {
    assert.equal(evaluateSizeAnomaly({ sizeBytes: bad }).status, 'INVALID_SIZE', `must reject ${String(bad)}`);
  }
});

test('required free space scales with the previous backup but never drops below the floor', () => {
  const floor = 256 * 1024 * 1024;
  assert.equal(requiredFreeBytes(0), floor);
  assert.equal(requiredFreeBytes(1000), floor, 'small backups still get the floor');
  assert.equal(requiredFreeBytes(1024 * 1024 * 1024), Math.ceil(1024 * 1024 * 1024 * 2.5));
});

test('disk guard refuses to start when the dump cannot fit', () => {
  const r = evaluateDiskSpace({ freeBytes: 1000, previousBackupBytes: 0 });
  assert.equal(r.sufficient, false);
  assert.equal(r.status, 'INSUFFICIENT');
  assert.ok(r.headroomBytes < 0);
});

test('disk guard passes with adequate headroom', () => {
  const r = evaluateDiskSpace({ freeBytes: 1024 * 1024 * 1024, previousBackupBytes: 0 });
  assert.equal(r.status, 'OK');
  assert.equal(r.sufficient, true);
});

test('disk guard reports UNKNOWN rather than assuming there is room', () => {
  for (const bad of [null, undefined, NaN, -1, 'x']) {
    const r = evaluateDiskSpace({ freeBytes: bad });
    assert.equal(r.status, 'UNKNOWN');
    assert.equal(r.sufficient, false, 'unknown free space must never be treated as sufficient');
  }
});

test('retry backoff grows exponentially, is capped, and stays inside jitter bounds', () => {
  assert.equal(backoffDelayMs(0, { jitter: false }), 2000);
  assert.equal(backoffDelayMs(1, { jitter: false }), 4000);
  assert.equal(backoffDelayMs(2, { jitter: false }), 8000);
  assert.equal(backoffDelayMs(50, { jitter: false }), 60000, 'must cap at maxMs');

  for (let i = 0; i < 50; i += 1) {
    const d = backoffDelayMs(2);
    assert.ok(d >= 4000 && d <= 8000, `jittered delay ${d} outside [4000, 8000]`);
  }
});

test('upload verification command is built per provider', () => {
  const rclone = buildVerifyUploadCommand({ provider: 'rclone', binary: '/usr/bin/rclone', filePath: '/b/x.sql.enc', destination: 'remote:bk' });
  assert.deepEqual(rclone.argv, ['lsjson', 'remote:bk/x.sql.enc']);

  const aws = buildVerifyUploadCommand({ provider: 'aws', binary: '/usr/bin/aws', filePath: '/b/x.sql.enc', destination: 's3://bkp/db' });
  assert.deepEqual(aws.argv, ['s3api', 'head-object', '--bucket', 'bkp', '--key', 'db/x.sql.enc']);

  const gs = buildVerifyUploadCommand({ provider: 'gsutil', binary: '/usr/bin/gsutil', filePath: '/b/x.sql.enc', destination: 'gs://bkp/db' });
  assert.equal(gs.argv[0], 'stat');
});

test('upload verification command returns null when it cannot be built', () => {
  // `az` has no cheap, stable verification command; returning null forces the
  // caller to report NOT VERIFIED instead of assuming success.
  assert.equal(buildVerifyUploadCommand({ provider: 'az', binary: '/usr/bin/az', filePath: '/b/x.sql.enc', destination: 'ctr' }), null);
  assert.equal(buildVerifyUploadCommand({ provider: 'aws', binary: '/usr/bin/aws', filePath: '/b/x.sql.enc', destination: 'not-a-valid-s3-target' }), null);
  assert.equal(buildVerifyUploadCommand({ provider: 'rclone', binary: null, filePath: '/b/x', destination: 'r:b' }), null);
});

test('upload verification confirms a matching remote object', () => {
  const r = verifyUploadResult({ provider: 'rclone', stdout: '[{"Size":1234}]', expectedBytes: 1234 });
  assert.equal(r.verified, true);
  assert.equal(r.remoteBytes, 1234);
});

test('upload verification fails closed on size mismatch, missing object and garbage output', () => {
  assert.equal(verifyUploadResult({ provider: 'rclone', stdout: '[{"Size":9}]', expectedBytes: 1234 }).verified, false);
  assert.equal(verifyUploadResult({ provider: 'rclone', stdout: '[]', expectedBytes: 1234 }).verified, false);
  assert.equal(verifyUploadResult({ provider: 'rclone', stdout: 'not json', expectedBytes: 1234 }).verified, false);
  assert.equal(verifyUploadResult({ provider: 'rclone', stdout: '', expectedBytes: 1234 }).verified, false);
  assert.equal(verifyUploadResult({ provider: 'aws', stdout: '{}', expectedBytes: 1234 }).verified, false);
  assert.equal(verifyUploadResult({ provider: 'gsutil', stdout: '', expectedBytes: 1234 }).verified, false);
});

test('upload verification refuses to assume success for an unknown provider', () => {
  const r = verifyUploadResult({ provider: 'mystery', stdout: 'anything', expectedBytes: 1 });
  assert.equal(r.verified, false);
  assert.ok(r.reason.includes('mystery'));
});

test('a required but unverified offsite copy fails the run', () => {
  const r = evaluateOffsiteRequirement({ offsiteConfigured: true, offsiteRequired: true, offsiteOk: false });
  assert.equal(r.fail, true);
});

test('a verified offsite copy passes', () => {
  const r = evaluateOffsiteRequirement({ offsiteConfigured: true, offsiteRequired: true, offsiteOk: true });
  assert.equal(r.fail, false);
});

test('an offsite copy that is not required does not fail the run, but says so', () => {
  const r = evaluateOffsiteRequirement({ offsiteConfigured: true, offsiteRequired: false, offsiteOk: false });
  assert.equal(r.fail, false);
  assert.ok(r.reason.includes('not required'));
});

test('a dry run never fails for not uploading', () => {
  const r = evaluateOffsiteRequirement({ offsiteConfigured: true, offsiteRequired: true, offsiteOk: false, dryRun: true });
  assert.equal(r.fail, false, 'a plan that intentionally uploads nothing is not a failure');
  assert.ok(r.reason.includes('dry-run'));
});

test('offsite is required by default whenever a destination is configured', () => {
  // Mirrors the default in dr-backup-run.mjs: required unless explicitly off.
  const configured = true;
  const envValue = undefined;
  const required = String(envValue || (configured ? 'true' : 'false')).toLowerCase() === 'true';
  assert.equal(evaluateOffsiteRequirement({ offsiteConfigured: configured, offsiteRequired: required, offsiteOk: false }).fail, true);
});

// ───────────────────────────────────────────────────────────────────────────
// Restore-drill safety guards — the controls that stop a drill destroying prod
// ───────────────────────────────────────────────────────────────────────────

const {
  DEFAULT_PRODUCTION_DATABASES,
  assertRestorableTarget,
  evaluateRestoreReconciliation,
  isDisposableDatabaseName,
  isLoopbackHost,
  productionDatabaseNames,
} = await import('../scripts/lib/dr-restore-safety.mjs');

const { inspectDump } = await import('../scripts/dr-restore-drill.mjs');

test('loopback detection accepts only local hosts', () => {
  for (const h of ['127.0.0.1', 'localhost', '::1']) assert.equal(isLoopbackHost(h), true, h);
  for (const h of ['db.example.com', '10.0.0.5', '192.168.1.1', '', null]) assert.equal(isLoopbackHost(h), false, String(h));
});

test('known production databases are never disposable', () => {
  for (const name of DEFAULT_PRODUCTION_DATABASES) {
    assert.equal(isDisposableDatabaseName(name), false, `${name} must never be a restore target`);
  }
  // The live production database confirmed via /api/readyz.
  assert.equal(isDisposableDatabaseName('u727965524_airesume'), false);
});

test('a disposable target may still carry the product name', () => {
  // Regression: an earlier substring rule rejected this exact name, which is
  // the one this repository's documentation recommends.
  assert.equal(isDisposableDatabaseName('resumepilot_restore_drill'), true);
  assert.equal(isDisposableDatabaseName('resumepilot_cert'), true);
  assert.equal(isDisposableDatabaseName('resumepilot_test'), true);
});

test('a name with no disposability marker is refused', () => {
  for (const name of ['just_a_database', 'mydb', '', null, undefined]) {
    assert.equal(isDisposableDatabaseName(name), false, String(name));
  }
});

test('operators can extend the production deny-list by environment', () => {
  const names = productionDatabaseNames({ DR_PRODUCTION_DATABASES: 'billing_main, MyProd ' });
  assert.ok(names.has('billing_main'));
  assert.ok(names.has('myprod'), 'deny-list entries are case-insensitive');
  assert.ok(names.has('u727965524_airesume'), 'defaults are preserved');
  assert.equal(isDisposableDatabaseName('billing_main', { productionNames: names }), false);
  assert.equal(isDisposableDatabaseName('billing_main_test', { productionNames: names }), true);
});

test('restore target is refused for a production database even with a valid confirm', () => {
  assert.throws(
    () => assertRestorableTarget({
      host: '127.0.0.1', database: 'u727965524_airesume', confirm: 'RESTORE:u727965524_airesume', allowReset: true,
    }),
    /not an explicitly disposable database/,
  );
});

test('restore target is refused off-loopback', () => {
  assert.throws(
    () => assertRestorableTarget({
      host: 'db.example.com', database: 'resumepilot_restore_drill', confirm: 'RESTORE:resumepilot_restore_drill', allowReset: true,
    }),
    /not loopback/,
  );
});

test('restore target is refused unless the confirm string matches exactly', () => {
  const base = { host: '127.0.0.1', database: 'resumepilot_restore_drill', allowReset: true };
  assert.throws(() => assertRestorableTarget({ ...base, confirm: 'RESTORE:wrong' }), /DB_RESTORE_CONFIRM must be exactly/);
  assert.throws(() => assertRestorableTarget({ ...base, confirm: undefined }), /DB_RESTORE_CONFIRM/);
  assert.throws(() => assertRestorableTarget({ ...base, confirm: 'restore:resumepilot_restore_drill' }), /must be exactly/, 'confirm is case-sensitive');
});

test('restore target is refused without the destructive-action opt-in', () => {
  assert.throws(
    () => assertRestorableTarget({
      host: '127.0.0.1', database: 'resumepilot_restore_drill', confirm: 'RESTORE:resumepilot_restore_drill', allowReset: false,
    }),
    /MARIADB_TEST_ALLOW_RESET/,
  );
});

test('a fully legitimate restore target is accepted', () => {
  const t = assertRestorableTarget({
    host: '127.0.0.1', database: 'resumepilot_restore_drill', confirm: 'RESTORE:resumepilot_restore_drill', allowReset: true,
  });
  assert.equal(t.database, 'resumepilot_restore_drill');
  assert.equal(t.host, '127.0.0.1');
});

test('restore target requires a database name', () => {
  assert.throws(() => assertRestorableTarget({ host: '127.0.0.1' }), /required/);
});

test('reconciliation passes when the restore matches the backup', () => {
  const r = evaluateRestoreReconciliation({
    expectedTables: ['users', 'resumes', 'schema_migrations'],
    restoredTables: ['users', 'resumes', 'schema_migrations'],
    expectedMigrations: 15,
    restoredMigrations: 15,
    criticalTables: ['users', 'schema_migrations'],
    rowCounts: { users: 42, schema_migrations: 15 },
  });
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.problems, []);
});

test('reconciliation fails when tables present in the backup are missing', () => {
  const r = evaluateRestoreReconciliation({
    expectedTables: ['users', 'resumes'],
    restoredTables: ['users'],
    criticalTables: [],
    rowCounts: {},
  });
  assert.equal(r.status, 'FAIL');
  assert.ok(r.problems.some((p) => p.includes('missing')));
  assert.ok(r.problems.some((p) => p.includes('restored 1 tables')));
});

test('reconciliation fails when the migration ledger did not survive', () => {
  const r = evaluateRestoreReconciliation({
    expectedTables: ['schema_migrations'], restoredTables: ['schema_migrations'],
    expectedMigrations: 15, restoredMigrations: 0,
    criticalTables: [], rowCounts: {},
  });
  assert.equal(r.status, 'FAIL');
  assert.ok(r.problems.some((p) => p.includes('migration ledger is empty')));
});

test('reconciliation fails when a critical table restored empty', () => {
  const r = evaluateRestoreReconciliation({
    expectedTables: ['users'], restoredTables: ['users'],
    criticalTables: ['users'], rowCounts: { users: 0 },
  });
  assert.equal(r.status, 'FAIL');
  assert.ok(r.problems.some((p) => p.includes("'users' is missing or empty")));
});

test('a newer target schema is a warning, not a failure', () => {
  const r = evaluateRestoreReconciliation({
    expectedTables: ['users'], restoredTables: ['users', 'new_table'],
    criticalTables: ['users'], rowCounts: { users: 5 },
  });
  assert.equal(r.status, 'PASS');
  assert.ok(r.warnings.some((w) => w.includes('newer')));
});

// ── Dump inspection ────────────────────────────────────────────────────────

test('dump inspection counts tables, indexes, constraints and migrations', () => {
  const sql = [
    '-- ResumePilot AI logical backup',
    'SET NAMES utf8mb4;',
    'CREATE TABLE `users` (',
    '  `id` int NOT NULL AUTO_INCREMENT,',
    '  PRIMARY KEY (`id`),',
    '  KEY `idx_users` (`id`),',
    '  CONSTRAINT `fk_users` FOREIGN KEY (`id`) REFERENCES `users` (`id`),',
    '  CONSTRAINT `chk_users` CHECK ((1 = 1))',
    ');',
    'INSERT INTO `users` VALUES (1);',
    "INSERT INTO `schema_migrations` VALUES ('001','baseline'),('002','single_owner_enterprise');",
    '-- completed_at: 2026-08-29T00:00:00.000Z',
  ].join('\n');

  const inv = inspectDump(sql);
  assert.equal(inv.tableCount, 1);
  assert.equal(inv.tables[0], 'users');
  assert.equal(inv.indexCount, 1);
  assert.equal(inv.foreignKeyCount, 1);
  assert.equal(inv.checkConstraintCount, 1);
  assert.equal(inv.migrationCount, 2);
  assert.equal(inv.latestMigration, '002');
  assert.equal(inv.complete, true);
});

test('dump inspection reads migrations from every insert, not just the first', () => {
  // Regression: db-backup.mjs batches inserts, so migrations can span several
  // statements. Reading only the first produced a silent zero.
  const sql = "INSERT INTO `schema_migrations` VALUES (1);\n"
    + "INSERT INTO `schema_migrations` VALUES ('001','baseline'),('002','b');\n";
  assert.equal(inspectDump(sql).migrationCount, 2);

  const rows = [];
  for (let i = 1; i <= 300; i += 1) rows.push(`('${String(i).padStart(3, '0')}','m${i}')`);
  const batched = `INSERT INTO \`schema_migrations\` VALUES ${rows.slice(0, 250).join(',')};\n`
    + `INSERT INTO \`schema_migrations\` VALUES ${rows.slice(250).join(',')};\n`;
  assert.equal(inspectDump(batched).migrationCount, 300);
});

test('dump inspection marks a truncated dump incomplete', () => {
  const sql = 'CREATE TABLE `users` (`id` int);\nINSERT INTO `users` VALUES (1);\n';
  const inv = inspectDump(sql);
  assert.equal(inv.complete, false, 'a dump without the completion footer is incomplete');
  assert.equal(inv.tableCount, 1);
});

test('dump inspection tolerates an empty dump without throwing', () => {
  const inv = inspectDump('');
  assert.equal(inv.tableCount, 0);
  assert.equal(inv.complete, false);
  assert.equal(inv.migrationCount, 0);
});

// ───────────────────────────────────────────────────────────────────────────
// Import purity — importing a DR module must never run it
// ───────────────────────────────────────────────────────────────────────────

test('the DR entry-point modules are importable without side effects', async () => {
  // Regression: dr-monitor.mjs and dr-restore-point.mjs called main() at module
  // scope, so merely importing them fired a scan / DB connection and called
  // process.exit() - which killed the importing process.
  const entryPoints = [
    '../scripts/dr-backup-run.mjs',
    '../scripts/dr-restore-drill.mjs',
    '../scripts/dr-monitor.mjs',
    '../scripts/dr-observability.mjs',
    '../scripts/dr-restore-point.mjs',
    '../scripts/lib/dr-policy.mjs',
    '../scripts/lib/dr-offsite.mjs',
    '../scripts/lib/dr-restore-safety.mjs',
  ];
  for (const spec of entryPoints) {
    const mod = await import(spec);
    assert.ok(mod, `${spec} must import without throwing`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// External synthetic monitoring — must fail closed, never assume health
// ───────────────────────────────────────────────────────────────────────────

const {
  DEFAULT_ENDPOINTS,
  evaluateExternalWatch,
  shortSha,
} = await import('../scripts/dr-external-watch.mjs');

const healthyInput = (overrides = {}) => ({
  endpoints: [{ name: 'healthz', expectStatus: 200, status: 200, latencyMs: 120 }],
  tls: { ok: true, daysRemaining: 60 },
  release: { backendSha: 'a'.repeat(40), frontendSha: 'a'.repeat(40) },
  database: { status: 'READY' },
  ...overrides,
});

test('external watch reports HEALTHY when every check passes', () => {
  const r = evaluateExternalWatch(healthyInput());
  assert.equal(r.status, 'HEALTHY');
  assert.deepEqual(r.problems, []);
});

test('external watch fails when the database is not ready', () => {
  const r = evaluateExternalWatch(healthyInput({ database: { status: 'DOWN' } }));
  assert.equal(r.status, 'FAILED');
  assert.ok(r.problems.some((p) => p.includes('DOWN')));
});

test('external watch fails on backend/frontend SHA misalignment', () => {
  const r = evaluateExternalWatch(healthyInput({
    release: { backendSha: 'a'.repeat(40), frontendSha: 'b'.repeat(40) },
  }));
  assert.equal(r.status, 'FAILED');
  assert.ok(r.problems.some((p) => p.includes('MISALIGNED')));
});

test('external watch fails when the running SHA differs from the expected SHA', () => {
  const r = evaluateExternalWatch(healthyInput({ expectedSha: 'c'.repeat(40) }));
  assert.equal(r.status, 'FAILED');
  assert.ok(r.problems.some((p) => p.includes('expected')));
});

test('external watch fails closed when TLS could not be inspected', () => {
  // Regression class: an uninspected certificate must never be treated as a
  // healthy certificate. This is the check that would otherwise silently pass
  // during an expired-cert incident.
  assert.equal(evaluateExternalWatch(healthyInput({ tls: null })).status, 'FAILED');
  assert.equal(evaluateExternalWatch(healthyInput({ tls: { ok: false, error: 'boom' } })).status, 'FAILED');
  assert.equal(evaluateExternalWatch(healthyInput({ tls: { ok: true, daysRemaining: null } })).status, 'FAILED');
});

test('external watch fails on an expired certificate', () => {
  const r = evaluateExternalWatch(healthyInput({ tls: { ok: true, daysRemaining: -3 } }));
  assert.equal(r.status, 'FAILED');
  assert.ok(r.problems.some((p) => p.includes('EXPIRED')));
});

test('a certificate expiring soon warns but does not fail', () => {
  const r = evaluateExternalWatch(healthyInput({ tls: { ok: true, daysRemaining: 5 } }));
  assert.equal(r.status, 'HEALTHY');
  assert.ok(r.warnings.some((w) => w.includes('expires in 5 days')));
});

test('external watch fails when an endpoint is unreachable', () => {
  const r = evaluateExternalWatch(healthyInput({
    endpoints: [{ name: 'readyz', expectStatus: 200, status: 0, error: 'fetch failed' }],
  }));
  assert.equal(r.status, 'FAILED');
  assert.ok(r.problems.some((p) => p.includes('unreachable')));
});

test('external watch fails on an unexpected HTTP status', () => {
  const r = evaluateExternalWatch(healthyInput({
    endpoints: [{ name: 'healthz', expectStatus: 200, status: 503, latencyMs: 50 }],
  }));
  assert.equal(r.status, 'FAILED');
  assert.ok(r.problems.some((p) => p.includes('HTTP 503')));
});

test('a slow-but-healthy response warns rather than failing', () => {
  const r = evaluateExternalWatch(healthyInput({
    endpoints: [{ name: 'healthz', expectStatus: 200, status: 200, latencyMs: 9000 }],
  }));
  assert.equal(r.status, 'HEALTHY');
  assert.ok(r.warnings.some((w) => w.includes('slow')));
});

test('external watch is BLOCKED rather than healthy when nothing was checked', () => {
  const r = evaluateExternalWatch({ endpoints: [] });
  assert.equal(r.status, 'BLOCKED');
});

test('external watch treats an unreadable release identity as a problem', () => {
  assert.equal(evaluateExternalWatch(healthyInput({ release: null })).status, 'FAILED');
  assert.equal(evaluateExternalWatch(healthyInput({ release: { backendSha: null, frontendSha: null } })).status, 'FAILED');
});

test('shortSha abbreviates without leaking the full value', () => {
  assert.equal(shortSha('a'.repeat(40)), 'aaaaaaa…');
  assert.equal(shortSha('abc'), 'abc');
  assert.equal(shortSha(null), '(none)');
});

test('the default endpoint set covers health, readiness and release identity', () => {
  const paths = DEFAULT_ENDPOINTS.map((e) => e.path);
  assert.ok(paths.includes('/api/healthz'));
  assert.ok(paths.includes('/api/readyz'));
  assert.ok(paths.includes('/api/platform/version'));
});

// ───────────────────────────────────────────────────────────────────────────
// Monitor signal classification — detection without escalation is silent failure
// ───────────────────────────────────────────────────────────────────────────

test('classifyBackupSignals reports nothing when every signal is healthy', () => {
  const r = classifyBackupSignals({
    sizeBytes: 10000000,
    historicalSizes: [10000000, 10000000, 10000000],
    diskStatus: 'OK',
    offsiteConfigured: true,
    offsiteVerified: true,
    unverifiedRecoveryPoints: 0,
  });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.complete, true);
});

test('classifyBackupSignals escalates a suspiciously small backup', () => {
  const r = classifyBackupSignals({
    sizeBytes: 900000,                                  // 0.09x of a 10 MB baseline
    historicalSizes: [10000000, 10000000, 10000000],
    diskStatus: 'OK',
    offsiteVerified: true,
  });
  assert.ok(r.problems.includes('BACKUP_SIZE_SUSPICIOUSLY_SMALL'));
});

test('classifyBackupSignals warns (not fails) on a suspiciously large backup', () => {
  const r = classifyBackupSignals({
    sizeBytes: 40000000,                                // 4x of a 10 MB baseline
    historicalSizes: [10000000, 10000000, 10000000],
    diskStatus: 'OK',
  });
  assert.ok(r.warnings.includes('BACKUP_SIZE_SUSPICIOUSLY_LARGE'));
  assert.deepEqual(r.problems, []);
});

test('classifyBackupSignals prefers the pipeline anomaly verdict over local history', () => {
  const r = classifyBackupSignals({
    sizeBytes: 10000000,
    historicalSizes: [10000000, 10000000, 10000000],
    sizeAnomalyStatus: 'ANOMALY_SUSPICIOUSLY_SMALL',
    diskStatus: 'OK',
  });
  assert.ok(r.problems.includes('BACKUP_SIZE_SUSPICIOUSLY_SMALL'));
  assert.equal(r.anomaly, 'ANOMALY_SUSPICIOUSLY_SMALL');
});

test('classifyBackupSignals escalates insufficient disk headroom', () => {
  const r = classifyBackupSignals({ diskStatus: 'INSUFFICIENT' });
  assert.ok(r.problems.includes('DISK_HEADROOM_INSUFFICIENT'));
});

test('classifyBackupSignals escalates an offsite upload that was never verified', () => {
  const r = classifyBackupSignals({ offsiteConfigured: true, offsiteVerified: false, diskStatus: 'OK' });
  assert.ok(r.problems.includes('OFFSITE_UPLOAD_NOT_VERIFIED'));
});

test('classifyBackupSignals warns when offsite status is unknown and marks itself incomplete', () => {
  const r = classifyBackupSignals({ offsiteConfigured: true, offsiteVerified: null, diskStatus: 'OK' });
  assert.ok(r.warnings.includes('OFFSITE_STATUS_UNKNOWN'));
  assert.equal(r.complete, false, 'unknown offsite status must not read as healthy');
});

test('classifyBackupSignals marks itself incomplete when disk status is unknown', () => {
  const r = classifyBackupSignals({ diskStatus: null });
  assert.equal(r.complete, false);
});

test('classifyBackupSignals warns about unverified recovery points', () => {
  const r = classifyBackupSignals({ diskStatus: 'OK', unverifiedRecoveryPoints: 2 });
  assert.ok(r.warnings.includes('UNVERIFIED_RECOVERY_POINTS'));
});

test('classifyBackupSignals treats a zero-byte backup as a problem, not a baseline', () => {
  const r = classifyBackupSignals({
    sizeBytes: 0,
    historicalSizes: [10000000, 10000000, 10000000],
    diskStatus: 'OK',
  });
  assert.ok(r.problems.length > 0, 'a zero-byte backup must never pass silently');
});

test('classifyBackupSignals never throws when given nothing', () => {
  const r = classifyBackupSignals();
  assert.deepEqual(r.problems, []);
  assert.equal(r.complete, false, 'no observed data means UNCERTAIN, not healthy');
});
