#!/usr/bin/env node
/**
 * dr-monitor.mjs — backup and disaster-recovery health monitor.
 *
 * Deliberately separate from the backup runner so that a broken backup job
 * cannot also break the thing that tells you it is broken. Run this from cron
 * (or a systemd timer) more often than backups are taken.
 *
 * It answers, with evidence rather than assumption:
 *   • How old is the newest VERIFIED recovery point, and does that breach RPO?
 *   • Is there an independent offsite copy that has actually succeeded?
 *   • Are backups encrypted at rest?
 *   • How many distinct recovery points exist (is retention working)?
 *   • Has a restore ever been drilled, and how long ago?
 *
 * Any signal that cannot be observed is reported as UNKNOWN and treated as a
 * problem. This monitor never reports healthy on missing evidence.
 *
 * Usage
 *   node scripts/dr-monitor.mjs [--dir <backupDir>] [--json] [--quiet]
 *
 * Environment
 *   BACKUP_DIR                     default <repo>/backups/scheduled
 *   DR_LAST_RESTORE_DRILL_AT_MS    epoch-ms of the last successful restore drill
 *   BACKUP_ALERT_WEBHOOK_URL       optional; receives a JSON POST on any non-OK status
 *
 * Exit codes: 0 healthy, 1 warning, 2 critical/unknown, 3 could not evaluate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_POLICY, evaluateRpo, summariseDrPosture, classifyBackupSignals } from './lib/dr-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const AS_JSON = argv.includes('--json');
const QUIET = argv.includes('--quiet');
const DIR = path.resolve(value('--dir', process.env.BACKUP_DIR || path.join(ROOT, 'backups', 'scheduled')));

function readIndex(dir) {
  const indexFile = path.join(dir, 'recovery-points.json');
  if (fs.existsSync(indexFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      if (Array.isArray(parsed.recoveryPoints)) return parsed.recoveryPoints;
    } catch (_) { /* fall through to directory scan */ }
  }
  // No index: derive what we can from the directory itself. These entries are
  // unverified, which the monitor is required to surface rather than hide.
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.sql(\.gz)?(\.enc)?$/.test(f))
    .map((f) => {
      const full = path.join(dir, f);
      return { file: full, basename: f, sizeBytes: fs.statSync(full).size, verified: false, timestampMs: null };
    });
}

async function sendAlert(payload) {
  const url = process.env.BACKUP_ALERT_WEBHOOK_URL;
  if (!url) return { sent: false, reason: 'BACKUP_ALERT_WEBHOOK_URL is not configured' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { sent: response.ok, status: response.status };
  } catch (error) {
    // An alerting failure must never mask the condition being alerted on.
    return { sent: false, error: String(error.message || error).slice(0, 200) };
  }
}

async function main() {
  const nowMs = Date.now();
  const all = readIndex(DIR);
  const verified = all.filter((e) => e.verified === true && Number(e.timestampMs) > 0);
  const newest = verified.sort((a, b) => b.timestampMs - a.timestampMs)[0] || null;

  const offsiteOk = all.filter((e) => e.offsite && e.offsite.ok === true);
  const encryptedCount = all.filter((e) => e.encrypted === true).length;

  const rpo = evaluateRpo({
    lastSuccessfulBackupAtMs: newest ? newest.timestampMs : null,
    nowMs,
    policy: DEFAULT_POLICY,
  });

  const posture = summariseDrPosture({
    rpoStatus: rpo.status,
    offsiteConfigured: Boolean(process.env.BACKUP_OFFSITE_DESTINATION || process.env.BACKUP_OFFSITE_RCLONE_REMOTE),
    offsiteVerified: offsiteOk.length > 0,
    lastRestoreDrillAtMs: process.env.DR_LAST_RESTORE_DRILL_AT_MS || null,
    encryptionEnabled: all.length > 0 && encryptedCount === all.length,
    recoveryPointCount: all.length,
    nowMs,
  });


// The backup pipeline records disk headroom and its own size-anomaly verdict in a
// run report. The recovery-point index does not carry them, so read it if present.
// Absence is a legitimate state (no run yet) and must not be read as "healthy".
function readLastRunReport() {
  const candidates = [
    process.env.DR_BACKUP_RUN_REPORT,
    path.join(ROOT, 'test-results', 'dr-backup-run.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch {
      // An unreadable or corrupt report is itself a signal; keep looking, then give up.
    }
  }
  return null;
}

const lastRun = readLastRunReport();

  // Classify the conditions the pipeline detects but does not itself escalate:
  // unusual backup size, exhausted disk headroom, and offsite uploads that were
  // attempted but never verified. Detection without escalation is silent failure.
  const sized = all
    .filter((e) => Number(e.sizeBytes) > 0)
    .sort((a, b) => Number(b.timestampMs || 0) - Number(a.timestampMs || 0));
  const newestSize = sized.length ? Number(sized[0].sizeBytes) : null;
  const historicalSizes = sized.slice(1).map((e) => Number(e.sizeBytes));

  const offsiteConfigured = Boolean(
    process.env.BACKUP_OFFSITE_DESTINATION || process.env.BACKUP_OFFSITE_RCLONE_REMOTE);
  const newestOffsite = newest && newest.offsite ? newest.offsite : null;
  const offsiteVerified = offsiteConfigured
    ? (newestOffsite ? newestOffsite.verified === true : null)
    : null;

  const signals = classifyBackupSignals({
    sizeBytes: newestSize,
    historicalSizes,
    diskStatus: lastRun?.steps?.disk?.status ?? null,
    offsiteConfigured,
    offsiteVerified,
    unverifiedRecoveryPoints: all.length - verified.length,
  });
  posture.problems.push(...signals.problems);

  const report = {
    script: 'dr-monitor',
    signals,
    evaluatedAt: new Date(nowMs).toISOString(),
    backupDir: DIR,
    counts: {
      recoveryPoints: all.length,
      verified: verified.length,
      unverified: all.length - verified.length,
      encrypted: encryptedCount,
      replicatedOffsite: offsiteOk.length,
    },
    newestVerified: newest
      ? { file: newest.basename, createdAt: new Date(newest.timestampMs).toISOString(), ageSeconds: Math.floor((nowMs - newest.timestampMs) / 1000), sha256: newest.sha256 }
      : null,
    rpo,
    posture,
    policy: { ...DEFAULT_POLICY },
  };

  let exitCode = 0;
  if (posture.status === 'CRITICAL') exitCode = 2;
  else if (posture.status === 'DEGRADED') exitCode = 1;
  if (report.counts.unverified > 0 && report.counts.verified > 0) exitCode = Math.max(exitCode, 1);
  if (all.length === 0) exitCode = 2; // no recovery points at all is critical, not quiet
  if (signals.problems.length > 0) exitCode = Math.max(exitCode, 2);

  report.exitCode = exitCode;
  report.alert = exitCode === 0 ? { sent: false, reason: 'status is healthy' } : await sendAlert(report);

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!QUIET) {
    const label = posture.status === 'OK' ? 'HEALTHY' : posture.status;
    console.log(`dr-monitor: ${DIR}`);
    console.log(`  recovery points : ${report.counts.recoveryPoints} (${report.counts.verified} verified, ${report.counts.encrypted} encrypted, ${report.counts.replicatedOffsite} offsite)`);
    console.log(`  newest verified : ${report.newestVerified ? `${report.newestVerified.createdAt} (${report.newestVerified.ageSeconds}s ago)` : 'NONE'}`);
    console.log(`  RPO             : ${rpo.status} — ${rpo.reason}`);
    console.log(`  posture         : ${label}${posture.problems.length ? ` [${posture.problems.join(', ')}]` : ''}`);
    if (signals.problems.length || signals.warnings.length) {
      console.log(`  signals         : problems=[${signals.problems.join(', ') || 'none'}] warnings=[${signals.warnings.join(', ') || 'none'}]`);
      if (!signals.complete) console.log('  signals         : INCOMPLETE — some signals could not be observed; status is UNCERTAIN, not healthy');
    }
    console.log(`  alert           : ${report.alert.sent ? `sent (HTTP ${report.alert.status})` : (report.alert.reason || report.alert.error || 'not sent')}`);
  }

  process.exit(exitCode);
}

// Only execute when invoked directly. Importing this module (from a test, or
// from another script that wants summariseDrPosture) must not run a scan, fire
// an alert, or call process.exit().
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ script: 'dr-monitor', status: 'EVALUATION_FAILED', error: String(error.message || error) }, null, 2));
    process.exit(3);
  });
}
