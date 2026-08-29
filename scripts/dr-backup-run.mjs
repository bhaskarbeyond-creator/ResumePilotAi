#!/usr/bin/env node
/**
 * dr-backup-run.mjs — scheduled, verified, retained, replicated backup run.
 *
 * This is the automation that turns "we have a backup script" into a bounded
 * recovery point objective. It is designed to be invoked unattended (cron or a
 * systemd timer) and to be safe to re-run: every step is idempotent and a
 * failure leaves the previous recovery points untouched.
 *
 * Pipeline
 *   1. preflight   — refuse to run half-configured (encryption is mandatory in production)
 *   2. backup      — scripts/db-backup.mjs backup --gzip (AES-256-GCM when a key is set)
 *   3. verify      — SHA-256 sidecar + structural parse; an unverified backup is a failure
 *   4. index       — record the recovery point in recovery-points.json
 *   5. retain      — GFS pruning via scripts/lib/dr-policy.mjs (this is the only step that deletes)
 *   6. replicate   — offsite copy to provider-managed object storage, if configured
 *   7. monitor     — measure the ACTUAL RPO and emit an alert-worthy posture
 *
 * Usage
 *   node scripts/dr-backup-run.mjs [--out-dir <dir>] [--dry-run] [--no-offsite] [--retain-only]
 *
 * Environment
 *   DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME   (loaded from backend/.env if present)
 *   BACKUP_ENCRYPTION_KEY_BASE64                  (required when NODE_ENV=production)
 *   BACKUP_DIR                                     default <repo>/backups/scheduled
 *   BACKUP_OFFSITE_PROVIDER / BACKUP_OFFSITE_DESTINATION / BACKUP_OFFSITE_RCLONE_REMOTE
 *
 * Exit codes: 0 success (possibly with warnings), 1 backup failed, 2 blocked/misconfigured.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_POLICY,
  backoffDelayMs,
  buildVerifyUploadCommand,
  evaluateDiskSpace,
  evaluateOffsiteRequirement,
  evaluateRpo,
  evaluateSizeAnomaly,
  parseBackupTimestamp,
  planRetention,
  summariseDrPosture,
  verifyUploadResult,
} from './lib/dr-policy.mjs';
import { buildOffsiteUpload, selectOffsiteProvider } from './lib/dr-offsite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = path.join(ROOT, 'test-results');

// ── Arguments ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const DRY_RUN = flag('--dry-run');
const NO_OFFSITE = flag('--no-offsite');
const RETAIN_ONLY = flag('--retain-only');
const OUT_DIR = path.resolve(value('--out-dir', process.env.BACKUP_DIR || path.join(ROOT, 'backups', 'scheduled')));
const REPORT_PATH = path.resolve(value('--report', path.join(REPORT_DIR, 'dr-backup-run.json')));

const INDEX_PATH = path.join(OUT_DIR, 'recovery-points.json');

// ── Environment loading ────────────────────────────────────────────────────
/**
 * Load backend/.env without ever printing it. db-backup.mjs reads process.env,
 * so the runner is responsible for making the deployment's .env visible to it.
 */
function loadEnvironment() {
  const candidates = [
    process.env.BACKEND_ENV_FILE,
    path.join(ROOT, 'backend', '.env'),
    '/home/u727965524/backend/.env',
  ].filter(Boolean);

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue; // real env wins
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
    }
    return file;
  }
  return null;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readIndex() {
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    return Array.isArray(parsed.recoveryPoints) ? parsed.recoveryPoints : [];
  } catch (_) {
    return [];
  }
}

function writeIndex(entries) {
  const payload = {
    schema: 'resumepilot.recovery-points.v1',
    updatedAt: new Date().toISOString(),
    retentionPolicy: { ...DEFAULT_POLICY },
    recoveryPoints: entries,
  };
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function runDbBackup(args) {
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-backup.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  return JSON.parse(String(stdout).trim().split('\n').filter(Boolean).pop());
}

/**
 * Offsite replication. Returns a structured result — a transport failure is a
 * warning for the run (the local copy still exists) but is recorded so the
 * monitor can report that no independent copy has ever been proven.
 */
/**
 * Offsite replication with retry and post-upload verification.
 *
 * Three things this refuses to do:
 *   1. Give up after one transient failure   - retries with backoff + jitter.
 *   2. Trust exit code 0                     - confirms the object exists
 *      remotely and that its size matches the local file.
 *   3. Claim verification for a provider with no verification strategy - returns
 *      verified:false with a reason instead.
 *
 * A run where the offsite copy is required (BACKUP_OFFSITE_REQUIRED, default
 * true whenever a destination is configured) fails when replication fails, so
 * "backup succeeded" continues to mean "an independent copy exists".
 */
function replicate(file, report) {
  if (DRY_RUN) return { provider: 'none', ok: false, skipped: true, reason: 'dry-run' };

  let provider;
  try {
    provider = selectOffsiteProvider();
  } catch (error) {
    return { provider: 'none', ok: false, error: error.message };
  }

  if (!provider.installed) {
    return {
      provider: provider.provider,
      ok: false,
      reason: 'No offsite transport installed (rclone/aws/gsutil/az). Install one to obtain an independent copy.',
    };
  }

  const destination = process.env.BACKUP_OFFSITE_DESTINATION
    || (provider.provider === 'rclone' && process.env.BACKUP_OFFSITE_RCLONE_REMOTE
      ? `${process.env.BACKUP_OFFSITE_RCLONE_REMOTE}:${process.env.BACKUP_OFFSITE_RCLONE_PATH || 'resumepilot-backups'}`
      : null);

  if (!destination) {
    return {
      provider: provider.provider,
      ok: false,
      reason: 'Offsite transport is installed but no destination is configured (BACKUP_OFFSITE_DESTINATION).',
    };
  }

  const maxAttempts = Math.max(1, Math.min(Number(process.env.BACKUP_OFFSITE_MAX_ATTEMPTS || 3) || 3, 10));
  let command = null;
  const attempts = [];
  let uploaded = false;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts && !uploaded; attempt += 1) {
    if (attempt > 0) {
      const delayMs = backoffDelayMs(attempt - 1);
      attempts.push({ attempt: attempt + 1, action: 'wait', delayMs });
      // Synchronous sleep: this runs in an unattended cron job, and a busy-wait
      // is acceptable for a bounded, seconds-scale backoff.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
    try {
      command = buildOffsiteUpload({ provider: provider.provider, binary: provider.binary, filePath: file, destination });
      const startedAt = Date.now();
      execFileSync(command.binary, command.argv, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30 * 60 * 1000,
      });
      attempts.push({ attempt: attempt + 1, action: 'upload', ok: true, durationMs: Date.now() - startedAt });
      uploaded = true;
    } catch (error) {
      lastError = String(error.message || error).slice(0, 400);
      attempts.push({ attempt: attempt + 1, action: 'upload', ok: false, error: lastError });
    }
  }

  if (!uploaded) {
    const result = { provider: provider.provider, destination, ok: false, attempts, error: lastError, verified: false };
    report.steps.replicate.push(result);
    return result;
  }

  // ── Prove the object is actually there ───────────────────────────────────
  const verifyCommand = buildVerifyUploadCommand({
    provider: provider.provider, binary: provider.binary, filePath: file, destination,
  });
  let verification = { verified: false, reason: `no verification strategy for provider '${provider.provider}'` };
  if (verifyCommand) {
    try {
      const stdout = execFileSync(verifyCommand.binary, verifyCommand.argv, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
      });
      verification = verifyUploadResult({
        provider: provider.provider,
        strategy: verifyCommand.strategy,
        stdout,
        expectedBytes: fs.statSync(file).size,
      });
    } catch (error) {
      verification = { verified: false, reason: String(error.message || error).slice(0, 300) };
    }
  }

  const result = {
    provider: provider.provider,
    binary: provider.binary,
    destination: command ? command.destination : destination,
    ok: verification.verified === true,
    uploaded: true,
    verified: verification.verified === true,
    verificationStrategy: verifyCommand ? verifyCommand.strategy : null,
    verification,
    attempts,
    note: command ? command.note : null,
  };
  if (!result.ok) result.error = `upload completed but remote verification failed: ${verification.reason}`;
  report.steps.replicate.push(result);
  return result;
}

async function main() {
  const startedAtMs = Date.now();
  const envFile = loadEnvironment();
  const report = {
    script: 'dr-backup-run',
    startedAt: new Date(startedAtMs).toISOString(),
    outDir: OUT_DIR,
    dryRun: DRY_RUN,
    envFile: envFile ? path.basename(envFile) : null,
    steps: { backup: null, verify: null, retain: null, replicate: [] },
    status: 'RUNNING',
    warnings: [],
  };

  fs.mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });

  // ── 1. Preflight ─────────────────────────────────────────────────────────
  // --retain-only prunes existing files; it never dumps, encrypts or connects.
  // Requiring database credentials for it meant you could not free disk space
  // on a host whose backup env is incomplete - exactly when pruning matters.
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY_BASE64 || '';

  if (!RETAIN_ONLY) {
    const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME'];
    const missing = required.filter((name) => !String(process.env[name] || '').trim());
    if (missing.length) {
      report.status = 'BLOCKED';
      report.error = `Missing database configuration: ${missing.join(', ')}`;
      console.error(JSON.stringify(report, null, 2));
      process.exit(2);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !encryptionKey) {
      report.status = 'BLOCKED';
      report.error = 'BACKUP_ENCRYPTION_KEY_BASE64 is required for production backups; refusing to write an unencrypted dump.';
      console.error(JSON.stringify(report, null, 2));
      process.exit(2);
    }
    if (!encryptionKey) {
      report.warnings.push('No BACKUP_ENCRYPTION_KEY_BASE64 set — the backup will be written unencrypted.');
    }
  }
  report.encrypted = Boolean(encryptionKey);

  // ── 1b. Disk-space protection ────────────────────────────────────────────
  // A dump that runs out of space at 90% leaves a truncated artifact that looks
  // like a backup right up until someone tries to restore it. Refuse to start
  // rather than discover that later.
  let freeBytes = null;
  try {
    const stats = fs.statfsSync(OUT_DIR);
    freeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch (_) {
    freeBytes = null;
  }
  const previousBackup = readIndex()
    .filter((e) => Number(e.sizeBytes) > 0)
    .sort((a, b) => b.timestampMs - a.timestampMs)[0] || null;
  const disk = evaluateDiskSpace({
    freeBytes,
    previousBackupBytes: previousBackup ? Number(previousBackup.sizeBytes) : 0,
  });
  report.steps.disk = disk;

  if (disk.status === 'INSUFFICIENT') {
    report.status = 'FAILED';
    report.error = `Insufficient disk space for a backup: ${disk.freeBytes} bytes free, ${disk.requiredBytes} required. Refusing to write a truncated dump.`;
    finish(report);
    process.exit(1);
  }
  if (disk.status === 'UNKNOWN') {
    report.warnings.push('Free disk space could not be determined; proceeding without the disk-space guard.');
  }

  // ── 2/3. Backup + verify ─────────────────────────────────────────────────
  let entry = null;
  if (!RETAIN_ONLY) {
    if (DRY_RUN) {
      report.steps.backup = { ok: false, skipped: true, reason: 'dry-run' };
    } else {
      const epoch = Date.now();
      const target = path.join(OUT_DIR, `resumepilot-${epoch}.sql`);
      try {
        const backupResult = runDbBackup(['backup', '--out', target, '--gzip']);
        report.steps.backup = { ok: true, ...backupResult };

        const verifyResult = runDbBackup(['verify', '--in', backupResult.file]);
        report.steps.verify = { ok: true, ...verifyResult };

        if (!verifyResult.ok) throw new Error('Backup failed structural verification');

        entry = {
          file: backupResult.file,
          basename: path.basename(backupResult.file),
          timestampMs: epoch,
          createdAt: new Date(epoch).toISOString(),
          sizeBytes: backupResult.bytes,
          logicalBytes: backupResult.logicalBytes,
          sha256: backupResult.sha256,
          encrypted: Boolean(backupResult.encrypted),
          compressed: Boolean(backupResult.compressed),
          tables: backupResult.tables,
          rows: backupResult.rows,
          verified: true,
        };
      } catch (error) {
        report.steps.backup = { ok: false, error: String(error.message || error).slice(0, 500) };
        report.status = 'FAILED';
        report.error = 'Backup or verification failed';
        finish(report);
        process.exit(1);
      }
    }
  }

  // ── 3b. Size anomaly ─────────────────────────────────────────────────────
  // A backup that suddenly halves is usually a truncated dump that still
  // "succeeded". Compare against this system's own history, not a fixed
  // threshold, because the database grows over time.
  if (entry) {
    const historicalSizes = readIndex()
      .filter((e) => Number(e.sizeBytes) > 0)
      .map((e) => Number(e.sizeBytes));
    const sizeAnomaly = evaluateSizeAnomaly({ sizeBytes: entry.sizeBytes, historicalSizes });
    report.steps.sizeAnomaly = sizeAnomaly;
    if (sizeAnomaly.status === 'ANOMALY_SUSPICIOUSLY_SMALL') {
      report.warnings.push(
        `Backup is ${sizeAnomaly.ratio}x the median of ${sizeAnomaly.samples} prior backups - confirm it is not truncated before relying on it.`,
      );
    } else if (sizeAnomaly.status === 'ANOMALY_SUSPICIOUSLY_LARGE') {
      report.warnings.push(
        `Backup is ${sizeAnomaly.ratio}x the median of ${sizeAnomaly.samples} prior backups - investigate unexpected growth.`,
      );
    }
  }

  // ── 4. Index ─────────────────────────────────────────────────────────────
  const index = readIndex();
  if (entry) {
    index.push(entry);
    index.sort((a, b) => b.timestampMs - a.timestampMs);
  }

  // Drop index rows whose file no longer exists, so the index never advertises
  // a recovery point that is not actually there.
  const existing = index.filter((e) => fs.existsSync(e.file));

  // ── 5. Retention ─────────────────────────────────────────────────────────
  const plan = planRetention(
    existing.map((e) => ({ file: e.file, timestampMs: e.timestampMs ?? parseBackupTimestamp(e.basename), sizeBytes: e.sizeBytes })),
    DEFAULT_POLICY,
    Date.now(),
  );
  report.steps.retain = {
    keep: plan.keep.length,
    prune: plan.prune.length,
    prunedFiles: [],
    dryRun: DRY_RUN,
  };

  if (!DRY_RUN) {
    for (const victim of plan.prune) {
      try {
        fs.rmSync(victim.file, { force: true });
        fs.rmSync(`${victim.file}.sha256`, { force: true });
        report.steps.retain.prunedFiles.push(victim.file);
      } catch (error) {
        report.warnings.push(`Could not prune ${victim.file}: ${error.message}`);
      }
    }
  }

  const kept = existing.filter((e) => plan.keep.some((k) => k.file === e.file));
  if (!DRY_RUN) writeIndex(kept);

  // ── 6. Offsite replication ───────────────────────────────────────────────
  let offsiteResult = { provider: 'none', ok: false, reason: 'skipped' };
  if (!NO_OFFSITE && !DRY_RUN) {
    const pending = kept.filter((e) => !e.offsite || e.offsite.ok !== true);
    offsiteResult = pending.length ? replicate(pending[0].file, report) : { provider: 'none', ok: true, reason: 'all retained recovery points already replicated' };
    if (offsiteResult.ok) {
      const target = kept.find((e) => pending[0] && e.file === pending[0].file);
      if (target) target.offsite = { ...offsiteResult, uploadedAt: new Date().toISOString() };
    }
  } else if (NO_OFFSITE) {
    offsiteResult = { provider: 'none', ok: false, reason: 'disabled by --no-offsite' };
  }

  // If an offsite destination is configured, an unverified upload is a FAILED
  // run rather than a warning. Otherwise "backup succeeded" would quietly stop
  // meaning "an independent copy exists", which is the entire point of 3-2-1.
  const offsiteConfigured = Boolean(
    process.env.BACKUP_OFFSITE_DESTINATION || process.env.BACKUP_OFFSITE_RCLONE_REMOTE,
  );
  const offsiteRequired = String(
    process.env.BACKUP_OFFSITE_REQUIRED || (offsiteConfigured ? 'true' : 'false'),
  ).toLowerCase() === 'true';
  report.offsiteRequired = offsiteRequired;

  const offsiteDecision = evaluateOffsiteRequirement({
    offsiteConfigured,
    offsiteRequired,
    offsiteOk: offsiteResult.ok === true,
    dryRun: DRY_RUN,
  });
  report.offsiteDecision = offsiteDecision;

  if (offsiteDecision.fail) {
    if (!DRY_RUN) writeIndex(kept);
    report.status = 'FAILED';
    report.error = `${offsiteDecision.reason}: ${offsiteResult.reason || offsiteResult.error || 'unknown'}`;
    finish(report);
    process.exit(1);
  }

  if (!DRY_RUN) writeIndex(kept);

  // ── 7. Monitor: measure the real RPO ─────────────────────────────────────
  const newestVerified = kept.filter((e) => e.verified).sort((a, b) => b.timestampMs - a.timestampMs)[0] || null;
  const rpo = evaluateRpo({
    lastSuccessfulBackupAtMs: newestVerified ? newestVerified.timestampMs : null,
    nowMs: Date.now(),
    policy: DEFAULT_POLICY,
  });
  const posture = summariseDrPosture({
    rpoStatus: rpo.status,
    offsiteConfigured: Boolean(process.env.BACKUP_OFFSITE_DESTINATION || process.env.BACKUP_OFFSITE_RCLONE_REMOTE),
    offsiteVerified: offsiteResult.verified === true || kept.some((e) => e.offsite && e.offsite.verified === true),
    lastRestoreDrillAtMs: process.env.DR_LAST_RESTORE_DRILL_AT_MS || null,
    encryptionEnabled: Boolean(encryptionKey),
    nowMs: Date.now(),
  });

  report.recoveryPoints = kept.length;
  report.rpo = rpo;
  report.posture = posture;
  report.offsite = offsiteResult;
  report.status = report.warnings.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS';
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAtMs;

  finish(report);
  // A posture problem is reported but does not fail the run: the backup itself
  // succeeded, and alerting is the monitor's job, not the backup's.
  process.exit(0);
}

function finish(report) {
  try {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  } catch (_) { /* reporting must never break the run */ }
  console.log(JSON.stringify(report, null, 2));
}

// Only auto-run when invoked as a script; importing this module for tests must
// not start a backup or call process.exit() mid-run.
const invokedDirectly = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ script: 'dr-backup-run', status: 'FAILED', error: String(error.message || error) }, null, 2));
    process.exit(1);
  });
}
