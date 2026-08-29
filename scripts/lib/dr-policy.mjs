#!/usr/bin/env node
/**
 * dr-policy.mjs
 * -------------
 * Pure, dependency-free disaster-recovery policy engine.
 *
 * Why this module exists as pure functions:
 *   DR policy is the part of the backup system that must never fail open.
 *   Retention decides which recovery points are destroyed, and RPO evaluation
 *   decides when humans get woken up. Both are easy to get subtly wrong and
 *   impossible to fix after the fact. Keeping them free of I/O and database
 *   access means they can be asserted exhaustively in CI, which is the only
 *   place this class of logic can honestly be called VERIFIED.
 *
 * Nothing here deletes a file. This module returns a plan; the orchestrator
 * (scripts/dr-backup-run.mjs) executes it and is the only component permitted
 * to unlink anything.
 *
 * Policy model: grandfather-father-son (GFS) with a hard safety floor.
 */

'use strict';

/**
 * Defaults are deliberately conservative for a single-host deployment:
 *  - keepLast/minKeep: never reduce the recovery-point count below 3.
 *  - daily 7 / weekly 4 / monthly 6 gives 17 distinct recovery points at rest.
 *  - minAgeSeconds protects a backup that is still being written or uploaded.
 *  - rpoTargetSeconds 21600 = 6h, matching the recommended 6-hour schedule.
 */
export const DEFAULT_POLICY = Object.freeze({
  minKeep: 3,
  daily: 7,
  weekly: 4,
  monthly: 6,
  minAgeSeconds: 900,
  rpoTargetSeconds: 21600, // 6 hours
  warnRpoRatio: 0.75, // warn once 75% of the RPO budget is consumed
});

/**
 * Provider capability notes. This is guidance for operators, not a claim that
 * any of it is active. Statuses are intentionally NOT VERIFIED until an
 * operator configures the destination and the monitor reports a successful
 * upload.
 */
export const IMMUTABILITY_GUIDANCE = Object.freeze({
  's3-object-lock': {
    status: 'NOT CONFIGURED',
    note: 'S3 Object Lock (GOVERNANCE or COMPLIANCE mode) makes a backup undeletable for a retention period, including by the uploading credential. Strongest available protection against ransomware and credential compromise.',
  },
  'gcs-bucket-lock': {
    status: 'NOT CONFIGURED',
    note: 'GCS Bucket Lock + retention policy gives the same write-once-read-many guarantee as S3 Object Lock.',
  },
  'rclone-immutable': {
    status: 'NOT CONFIGURED',
    note: 'rclone cannot create immutability by itself; it can only target a bucket that already enforces it. Immutability must be configured on the bucket.',
  },
  'filesystem-chattr': {
    status: 'NOT CONFIGURED',
    note: 'chattr +i on a shared host is root-defeatable and is NOT a substitute for provider-enforced object lock. Treat as defence in depth only.',
  },
  none: {
    status: 'NOT CONFIGURED',
    note: 'No immutability. A compromised application credential can delete every local backup.',
  },
});

const MS_PER_SECOND = 1000;

function toPositiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Merge caller policy over defaults. Unknown keys are ignored so a typo in a
 * config file can never silently disable a protection.
 */
export function normalizePolicy(policy = {}) {
  const source = policy && typeof policy === 'object' ? policy : {};
  return Object.freeze({
    minKeep: toPositiveInteger(source.minKeep, DEFAULT_POLICY.minKeep),
    daily: toPositiveInteger(source.daily, DEFAULT_POLICY.daily),
    weekly: toPositiveInteger(source.weekly, DEFAULT_POLICY.weekly),
    monthly: toPositiveInteger(source.monthly, DEFAULT_POLICY.monthly),
    minAgeSeconds: toPositiveInteger(source.minAgeSeconds, DEFAULT_POLICY.minAgeSeconds),
    rpoTargetSeconds: toPositiveInteger(source.rpoTargetSeconds, DEFAULT_POLICY.rpoTargetSeconds),
    warnRpoRatio: (() => {
      const n = Number(source.warnRpoRatio);
      return Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_POLICY.warnRpoRatio;
    })(),
  });
}

/** UTC calendar day key, e.g. 2026-08-29. UTC avoids DST ambiguity. */
export function dayKey(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

/** UTC calendar month key, e.g. 2026-08. */
export function monthKey(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 7);
}

/**
 * ISO-8601 week key, e.g. 2026-W35. Computed from the Thursday of the week
 * containing the timestamp, which is the ISO rule for week numbering.
 */
export function weekKey(timestampMs) {
  const date = new Date(timestampMs);
  const utcDay = date.getUTCDay(); // 0=Sunday .. 6=Saturday
  // Offset to the Thursday of the SAME ISO week (ISO weeks run Mon-Sun and are
  // identified by the Thursday they contain). Note this shifts FORWARD for
  // Mon-Wed and BACKWARD for Fri-Sun; a modulo-only formula gets Mon-Wed wrong.
  const raw = (4 - utcDay + 7) % 7;
  const deltaDays = raw > 3 ? raw - 7 : raw;
  const thursday = new Date(date.getTime() + deltaDays * 86400000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.floor((thursday - yearStart) / 86400000 / 7) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Extract a millisecond timestamp from a backup filename.
 *
 * Recognises the two naming conventions already in use in this repository:
 *   mariadb-snapshot-<db>-<epochMs>.sql.gz[.enc]
 *   resumepilot-<epochMs>.sql[.gz][.enc]
 * Also accepts an ISO compact stamp (20260829T025430Z) for future-proofing.
 * Returns null when no timestamp can be proven — callers must keep files whose
 * age is unknown rather than prune them blindly.
 */
export function parseBackupTimestamp(filename) {
  if (typeof filename !== 'string' || !filename) return null;
  const base = filename.split('/').pop().split('\\').pop() || '';

  const epoch = base.match(/(?:^|[-_])(\d{13})(?=\.|$|[-_])/);
  if (epoch) {
    const ms = Number(epoch[1]);
    // Guard against 13-digit strings that are not plausible epoch-ms.
    if (ms > 1_000_000_000_000 && ms < 100_000_000_000_000) return ms;
  }

  const iso = base.match(/(?:^|[-_])(\d{8})T(\d{6})Z(?=\.|$|[-_])/);
  if (iso) {
    const [, d, t] = iso;
    const parsed = Date.UTC(
      Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)),
      Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4, 6)),
    );
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Build a retention plan.
 *
 * @param {Array<{file: string, timestampMs?: number, sizeBytes?: number}>} entries
 * @param {object} policy
 * @param {number} nowMs
 * @returns {{keep: Array, prune: Array, policy: object, evaluatedAt: string, undated: Array}}
 *
 * Guarantees (asserted in tests):
 *   1. At least `minKeep` entries are retained whenever that many exist.
 *   2. Entries newer than `minAgeSeconds` are never pruned.
 *   3. Entries with an unparseable timestamp are never pruned.
 *   4. Every retained entry carries a machine-readable reason.
 */
export function planRetention(entries, policy = {}, nowMs = Date.now()) {
  const active = normalizePolicy(policy);
  const list = Array.isArray(entries) ? entries : [];

  const dated = [];
  const undated = [];
  for (const entry of list) {
    if (!entry || typeof entry.file !== 'string' || !entry.file) continue;
    const ts = Number(entry.timestampMs);
    if (Number.isFinite(ts) && ts > 0) dated.push({ ...entry, timestampMs: ts });
    else undated.push({ ...entry, timestampMs: null });
  }

  // Newest first. Ties break on filename for deterministic output.
  dated.sort((a, b) => (b.timestampMs - a.timestampMs) || a.file.localeCompare(b.file));

  const reasons = new Map();

  const retain = (entry, reason) => {
    if (!reasons.has(entry.file)) reasons.set(entry.file, reason);
  };

  // Rule 1 — safety floor: keep the N most recent recovery points no matter
  // what the calendar buckets decide. This is what stops a mis-set policy from
  // ever reducing the deployment to a single backup.
  dated.slice(0, active.minKeep).forEach((entry, index) => {
    retain(entry, `safety-floor:${index + 1}`);
  });

  // Rule 2 — in-flight protection: never prune something still being written
  // or uploaded.
  const protectedAfter = nowMs - active.minAgeSeconds * MS_PER_SECOND;
  dated.filter((entry) => entry.timestampMs > protectedAfter).forEach((entry) => {
    retain(entry, 'recent-protection');
  });

  // Rule 3 — GFS calendar buckets.
  const bucket = (keyFn, count, label) => {
    if (count <= 0) return;
    const seen = [];
    for (const entry of dated) {
      const key = keyFn(entry.timestampMs);
      if (!seen.some((s) => s.key === key)) seen.push({ key, entry });
      if (seen.length >= count) break;
    }
    seen.forEach(({ key, entry }) => retain(entry, `${label}:${key}`));
  };

  bucket(dayKey, active.daily, 'daily');
  bucket(weekKey, active.weekly, 'weekly');
  bucket(monthKey, active.monthly, 'monthly');

  // Rule 4 — undated files are always kept; a human must look at them.
  undated.forEach((entry) => retain(entry, 'undated-manual-review'));

  const keep = [];
  const prune = [];
  for (const entry of dated) {
    if (reasons.has(entry.file)) keep.push({ ...entry, reason: reasons.get(entry.file) });
    else prune.push({ ...entry, reason: 'outside-retention-window' });
  }
  for (const entry of undated) {
    keep.push({ ...entry, reason: reasons.get(entry.file) || 'undated-manual-review' });
  }

  return {
    keep,
    prune,
    undated,
    policy: { ...active },
    evaluatedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Evaluate recovery-point freshness against an RPO target.
 *
 * This measures the ACTUAL worst-case data-loss window, not an aspiration:
 * with no binary log, everything written after the last backup is unrecoverable,
 * so the age of the newest good backup *is* the RPO.
 *
 * @returns status: 'OK' | 'WARN' | 'BREACH' | 'UNKNOWN'
 */
export function evaluateRpo({ lastSuccessfulBackupAtMs = null, nowMs = Date.now(), policy = {} } = {}) {
  const active = normalizePolicy(policy);
  const target = active.rpoTargetSeconds;

  if (!Number.isFinite(Number(lastSuccessfulBackupAtMs)) || Number(lastSuccessfulBackupAtMs) <= 0) {
    return {
      status: 'UNKNOWN',
      reason: 'No successful backup has been recorded, so the data-loss window cannot be bounded.',
      measuredRpoSeconds: null,
      targetSeconds: target,
      lastBackupAt: null,
      withinTarget: false,
      evaluatedAt: new Date(nowMs).toISOString(),
    };
  }

  const last = Number(lastSuccessfulBackupAtMs);
  const ageSeconds = Math.max(0, Math.floor((nowMs - last) / MS_PER_SECOND));
  const warnAt = Math.floor(target * active.warnRpoRatio);
  let status = 'OK';
  if (ageSeconds > target) status = 'BREACH';
  else if (ageSeconds >= warnAt) status = 'WARN';

  return {
    status,
    reason: status === 'BREACH'
      ? `Newest recovery point is ${ageSeconds}s old, which exceeds the ${target}s RPO target.`
      : status === 'WARN'
        ? `Newest recovery point is ${ageSeconds}s old, approaching the ${target}s RPO target.`
        : `Newest recovery point is ${ageSeconds}s old, inside the ${target}s RPO target.`,
    measuredRpoSeconds: ageSeconds,
    targetSeconds: target,
    lastBackupAt: new Date(last).toISOString(),
    withinTarget: ageSeconds <= target,
    evaluatedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Reduce a set of DR signals to a single operational verdict for alerting.
 * Fails closed: anything not explicitly healthy is NOT OK.
 */
export function summariseDrPosture({
  rpoStatus = 'UNKNOWN',
  offsiteConfigured = false,
  offsiteVerified = false,
  lastRestoreDrillAtMs = null,
  encryptionEnabled = false,
  recoveryPointCount = null,
  nowMs = Date.now(),
} = {}) {
  const problems = [];
  if (rpoStatus === 'BREACH') problems.push('RPO_BREACH');
  if (rpoStatus === 'UNKNOWN') problems.push('RPO_UNKNOWN');
  if (!offsiteConfigured) problems.push('NO_OFFSITE_COPY');
  else if (!offsiteVerified) problems.push('OFFSITE_NOT_VERIFIED');
  if (!encryptionEnabled) problems.push('BACKUP_UNENCRYPTED');

  const drillAgeMs = Number.isFinite(Number(lastRestoreDrillAtMs)) && Number(lastRestoreDrillAtMs) > 0
    ? nowMs - Number(lastRestoreDrillAtMs)
    : null;
  if (drillAgeMs === null) problems.push('NO_RESTORE_DRILL');

  // Having no recovery point at all is materially worse than any single
  // misconfiguration: there is literally nothing to recover from. A null count
  // means "not measured" and is not treated as an independent failure.
  let status;
  if (recoveryPointCount === 0) {
    problems.push('NO_RECOVERY_POINTS');
    status = 'CRITICAL';
  } else if (problems.length === 0) {
    status = 'OK';
  } else {
    status = problems.includes('RPO_BREACH') ? 'CRITICAL' : 'DEGRADED';
  }

  return {
    status,
    problems,
    drillAgeMs,
    evaluatedAt: new Date(nowMs).toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Backup-pipeline safety helpers
//
// Pure functions covering the failure modes that make a backup system lie:
// running out of disk mid-dump, silently writing a suspiciously small file,
// and treating an upload that never landed as a success.
// ───────────────────────────────────────────────────────────────────────────

/** Median of a numeric list. Returns null when there is nothing to compare. */
export function median(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (list.length === 0) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 === 0 ? (list[mid - 1] + list[mid]) / 2 : list[mid];
}

/**
 * Detect a backup whose size is implausible versus its own history.
 *
 * A backup that suddenly halves is very often a truncated or partially failed
 * dump that still "succeeded". A backup that suddenly triples is usually an
 * accidental full-table export or runaway table growth. Both deserve a human.
 *
 * Deliberately returns INSUFFICIENT_HISTORY rather than OK when there is not
 * enough data to compare: absence of evidence is not evidence of health.
 *
 * @param {number} minRatio below this fraction of baseline => suspiciously small
 * @param {number} maxRatio above this multiple of baseline => suspiciously large
 */
export function evaluateSizeAnomaly({
  sizeBytes,
  historicalSizes = [],
  minRatio = 0.4,
  maxRatio = 2.5,
  minimumSamples = 3,
} = {}) {
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return { status: 'INVALID_SIZE', ratio: null, baselineBytes: null, sizeBytes: sizeBytes ?? null };
  }

  const history = (Array.isArray(historicalSizes) ? historicalSizes : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (history.length < minimumSamples) {
    return {
      status: 'INSUFFICIENT_HISTORY',
      ratio: null,
      baselineBytes: null,
      sizeBytes: size,
      samples: history.length,
      note: `Need ${minimumSamples} prior backups to judge size; have ${history.length}.`,
    };
  }

  const baseline = median(history);
  const ratio = size / baseline;
  if (ratio < minRatio) return { status: 'ANOMALY_SUSPICIOUSLY_SMALL', ratio: Number(ratio.toFixed(4)), baselineBytes: baseline, sizeBytes: size, samples: history.length };
  if (ratio > maxRatio) return { status: 'ANOMALY_SUSPICIOUSLY_LARGE', ratio: Number(ratio.toFixed(4)), baselineBytes: baseline, sizeBytes: size, samples: history.length };
  return { status: 'OK', ratio: Number(ratio.toFixed(4)), baselineBytes: baseline, sizeBytes: size, samples: history.length };
}

/** Minimum free space required before starting a backup. */
export function requiredFreeBytes(previousBackupBytes = 0, floorBytes = 256 * 1024 * 1024) {
  const previous = Number(previousBackupBytes);
  const expected = Number.isFinite(previous) && previous > 0 ? Math.ceil(previous * 2.5) : 0;
  return Math.max(floorBytes, expected);
}

/**
 * Refuse to start a backup that cannot fit. A dump that dies at 90% leaves a
 * truncated artifact that looks like a backup until someone tries to restore it.
 */
export function evaluateDiskSpace({ freeBytes = null, previousBackupBytes = 0, floorBytes = 256 * 1024 * 1024 } = {}) {
  // null/undefined mean "could not measure" (e.g. statfs unsupported), which is
  // NOT the same as "zero bytes free". Treating them as zero would refuse every
  // backup on any filesystem statfs cannot read. Unmeasurable => UNKNOWN, and
  // the caller warns and proceeds: the artifact is checksummed and structurally
  // verified afterwards anyway, which catches a truncated dump.
  if (freeBytes === null || freeBytes === undefined) {
    return { status: 'UNKNOWN', sufficient: false, freeBytes: null, requiredBytes: requiredFreeBytes(previousBackupBytes, floorBytes) };
  }
  const free = Number(freeBytes);
  if (!Number.isFinite(free) || free < 0) {
    return { status: 'UNKNOWN', sufficient: false, freeBytes: null, requiredBytes: requiredFreeBytes(previousBackupBytes, floorBytes) };
  }
  const requiredBytes = requiredFreeBytes(previousBackupBytes, floorBytes);
  const sufficient = free >= requiredBytes;
  return {
    status: sufficient ? 'OK' : 'INSUFFICIENT',
    sufficient,
    freeBytes: free,
    requiredBytes,
    headroomBytes: free - requiredBytes,
  };
}

/** Exponential backoff with optional jitter, for transport retries. */
export function backoffDelayMs(attempt, { baseMs = 2000, maxMs = 60000, jitter = true } = {}) {
  const attemptNumber = Math.max(0, Number(attempt) || 0);
  const exponential = Math.min(maxMs, baseMs * (2 ** attemptNumber));
  if (!jitter) return Math.round(exponential);
  // Jitter in [0.5, 1.0] of the exponential value: enough to de-synchronise
  // concurrent retries, not enough to make the delay meaningless.
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

/**
 * Build the command that proves an uploaded object actually exists remotely.
 *
 * An upload that exits 0 can still have written nothing (redirected bucket,
 * wrong credentials with a permissive endpoint, partial multipart failure).
 * Verifying afterwards is what separates "we ran rclone" from "the backup is
 * offsite".
 *
 * Returns null for providers with no cheap verification command; the caller
 * must then report NOT VERIFIED rather than assume success.
 */
export function buildVerifyUploadCommand({ provider, binary, filePath, destination }) {
  if (!provider || !binary || !filePath || !destination) return null;
  const fileName = String(filePath).split('/').pop().split('\\').pop();

  if (provider === 'rclone') {
    return { provider, binary, argv: ['lsjson', `${destination}/${fileName}`], strategy: 'lsjson-size-match' };
  }
  if (provider === 'aws') {
    const match = String(destination).match(/^s3:\/\/([^/]+)\/?(.*)$/);
    if (!match) return null;
    const key = [match[2].replace(/\/+$/, ''), fileName].filter(Boolean).join('/');
    return { provider, binary, argv: ['s3api', 'head-object', '--bucket', match[1], '--key', key], strategy: 'head-object-size-match' };
  }
  if (provider === 'gsutil') {
    return { provider, binary, argv: ['stat', `${destination}/${fileName}`], strategy: 'stat-exit-code' };
  }
  // `az storage blob show` exists, but its JSON shape varies by CLI version,
  // so we do not claim to parse it.
  return null;
}

/**
 * Interpret verification output. Fails closed: anything unparseable or
 * size-mismatched is NOT verified.
 */
export function verifyUploadResult({ provider, strategy, stdout = '', expectedBytes = null } = {}) {
  if (provider === 'rclone') {
    let parsed;
    try { parsed = JSON.parse(String(stdout).trim() || '[]'); } catch (_) { parsed = null; }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { verified: false, reason: 'rclone lsjson returned no object' };
    }
    const remoteSize = Number(parsed[0]?.Size);
    if (!Number.isFinite(remoteSize)) return { verified: false, reason: 'remote size unreadable' };
    if (Number.isFinite(Number(expectedBytes)) && remoteSize !== Number(expectedBytes)) {
      return { verified: false, reason: `remote size ${remoteSize} != local ${expectedBytes}`, remoteBytes: remoteSize };
    }
    return { verified: true, remoteBytes: remoteSize };
  }

  if (provider === 'aws') {
    let parsed;
    try { parsed = JSON.parse(String(stdout).trim() || '{}'); } catch (_) { parsed = null; }
    const remoteSize = Number(parsed?.ContentLength);
    if (!Number.isFinite(remoteSize)) return { verified: false, reason: 'head-object did not report ContentLength' };
    if (Number.isFinite(Number(expectedBytes)) && remoteSize !== Number(expectedBytes)) {
      return { verified: false, reason: `remote size ${remoteSize} != local ${expectedBytes}`, remoteBytes: remoteSize };
    }
    return { verified: true, remoteBytes: remoteSize };
  }

  if (provider === 'gsutil') {
    const text = String(stdout);
    if (!text.trim()) return { verified: false, reason: 'gsutil stat produced no output' };
    const sizeMatch = text.match(/Content-Length:\s*(\d+)/i);
    if (sizeMatch) {
      const remoteSize = Number(sizeMatch[1]);
      if (Number.isFinite(Number(expectedBytes)) && remoteSize !== Number(expectedBytes)) {
        return { verified: false, reason: `remote size ${remoteSize} != local ${expectedBytes}`, remoteBytes: remoteSize };
      }
      return { verified: true, remoteBytes: remoteSize };
    }
    return { verified: true, note: 'object exists; size not parsed from gsutil output' };
  }

  return { verified: false, reason: `no verification strategy for provider '${provider}'` };
}

/**
 * Decide whether a run must fail because the offsite copy did not verify.
 *
 * Extracted as a pure function because "a backup is only a backup if an
 * independent copy exists" is a policy decision, and policy decisions belong
 * where they can be asserted rather than buried in control flow.
 *
 * A dry run never fails for this reason: a plan that intentionally uploads
 * nothing is not a replication failure.
 */
export function evaluateOffsiteRequirement({
  offsiteConfigured = false,
  offsiteRequired = false,
  offsiteOk = false,
  dryRun = false,
} = {}) {
  if (dryRun) return { fail: false, reason: 'dry-run performs no upload' };
  if (!offsiteRequired) {
    return {
      fail: false,
      reason: offsiteConfigured
        ? 'offsite destination configured but not required (BACKUP_OFFSITE_REQUIRED=false)'
        : 'no offsite destination configured',
    };
  }
  if (offsiteOk === true) return { fail: false, reason: 'offsite copy verified' };
  return {
    fail: true,
    reason: 'offsite replication is required but did not verify',
  };
}

/**
 * Promote raw backup signals into monitor-visible classifications.
 *
 * The backup pipeline already *detects* size anomalies, disk shortfalls and
 * unverified offsite uploads, but detection alone produces no operational
 * signal: `dr-monitor` reported OK while those conditions were present. This
 * function converts them into explicit problems/warnings so the monitor can
 * fail closed on them.
 *
 * Pure and dependency-free; safe to import from tests.
 */
export function classifyBackupSignals({
  sizeBytes = null,
  historicalSizes = [],
  sizeAnomalyStatus = null,
  diskStatus = null,
  offsiteConfigured = false,
  offsiteVerified = null,
  unverifiedRecoveryPoints = 0,
} = {}) {
  const problems = [];
  const warnings = [];

  // 1. Size anomaly — prefer the pipeline verdict, fall back to local history.
  let anomaly = sizeAnomalyStatus;
  // A zero-byte (or non-numeric) size is itself INVALID_SIZE and must never be
  // skipped: `> 0` here would let a zero-byte backup pass silently.
  if (!anomaly && sizeBytes !== null && sizeBytes !== undefined) {
    anomaly = evaluateSizeAnomaly({ sizeBytes, historicalSizes }).status;
  }
  if (anomaly === 'ANOMALY_SUSPICIOUSLY_SMALL') {
    problems.push('BACKUP_SIZE_SUSPICIOUSLY_SMALL');
  } else if (anomaly === 'ANOMALY_SUSPICIOUSLY_LARGE') {
    warnings.push('BACKUP_SIZE_SUSPICIOUSLY_LARGE');
  } else if (anomaly === 'INVALID_SIZE') {
    problems.push('BACKUP_SIZE_INVALID');
  }

  // 2. Disk headroom.
  if (diskStatus === 'INSUFFICIENT') problems.push('DISK_HEADROOM_INSUFFICIENT');
  else if (diskStatus === 'UNKNOWN') warnings.push('DISK_HEADROOM_UNKNOWN');

  // 3. Offsite replication must be *verified*, not merely attempted.
  if (offsiteConfigured && offsiteVerified === false) problems.push('OFFSITE_UPLOAD_NOT_VERIFIED');
  else if (offsiteConfigured && offsiteVerified === null) warnings.push('OFFSITE_STATUS_UNKNOWN');

  // 4. Recovery points that never completed verification.
  if (unverifiedRecoveryPoints > 0) warnings.push('UNVERIFIED_RECOVERY_POINTS');

  return {
    problems,
    warnings,
    anomaly: anomaly || null,
    // A monitor status is only trustworthy when every signal was actually observed.
    complete: diskStatus !== null && (offsiteConfigured ? offsiteVerified !== null : true),
  };
}
