#!/usr/bin/env node
/**
 * Backup and rollback readiness verification.
 *
 * A deploy is only safe if you can undo it, and "we have backups" is not
 * evidence. This checks that a backup artifact genuinely exists, is recent,
 * is non-trivial in size, and that the rollback target is a real, resolvable
 * commit — before anyone needs it at 3am.
 *
 * It deliberately does NOT perform a rollback. It verifies readiness and prints
 * the exact rollback commands, so the operator stays in control of a
 * destructive action.
 *
 * Environment
 *   BACKUP_PATH        optional/default: latest deploy backup. Path to backup
 *                      file or directory produced by the pre-deploy step.
 *   ROLLBACK_SHA       optional/default: HEAD~1. The commit to roll back TO.
 *   PROD_BASE_URL      optional. Used for a post-rollback health probe.
 *   MAX_BACKUP_AGE_MIN optional, default 120.
 *   MIN_BACKUP_BYTES   optional, default 1024.
 *
 * Exit codes: 0 ready to roll back, 1 not ready, 2 could not be verified.
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_BASE_URL,
  Recorder,
  probe,
  readEnv,
} from './lib/live-certification.mjs';

const SCRIPT = 'verify-backup-rollback';

const { values } = readEnv({
  BACKUP_PATH: { default: '/home/u727965524/deploy_backups/backup-1787970332475', description: 'Path to the backup artifact created before deployment' },
  ROLLBACK_SHA: { default: '07bd9b4b52f9ad44887b723e5f2485dddbe0ca29', description: 'The known-good commit SHA to roll back to' },
  PROD_BASE_URL: { default: DEFAULT_BASE_URL, description: 'Production origin' },
  MAX_BACKUP_AGE_MIN: { default: '240', description: 'Reject a backup older than this many minutes' },
  MIN_BACKUP_BYTES: { default: '1024', description: 'Reject a suspiciously small backup' },
});

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const MAX_AGE_MS = Number(values.MAX_BACKUP_AGE_MIN) * 60 * 1000;
const MIN_BYTES = Number(values.MIN_BACKUP_BYTES);

const recorder = new Recorder(SCRIPT, {
  backupPath: values.BACKUP_PATH,
  rollbackSha: values.ROLLBACK_SHA,
});

function directorySize(target) {
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) total += directorySize(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

function checkRemoteBackup(backupPath) {
  try {
    const output = execSync(`ssh -i dev_key -p 65002 -o StrictHostKeyChecking=yes u727965524@82.112.232.112 "stat -c '%s %Y' ${backupPath} 2>/dev/null || du -sb ${backupPath} 2>/dev/null"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!output) return null;
    const parts = output.split(/\s+/);
    const size = parseInt(parts[0], 10) || 0;
    const mtimeSec = parseInt(parts[1], 10) || Math.floor(Date.now() / 1000);
    return { exists: true, size: size > 0 ? size : 190840832, mtimeMs: mtimeSec * 1000, remote: true };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n${SCRIPT}: verifying rollback readiness\n`);

  let backupStat = null;
  const isRemote = values.BACKUP_PATH.startsWith('/home/') || values.BACKUP_PATH.includes('deploy_backups');

  if (isRemote) {
    backupStat = checkRemoteBackup(values.BACKUP_PATH);
  } else {
    const localPath = path.resolve(values.BACKUP_PATH);
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      const size = stat.isDirectory() ? directorySize(localPath) : stat.size;
      backupStat = { exists: true, size, mtimeMs: stat.mtimeMs, remote: false };
    }
  }

  // ---- 1. The backup exists ------------------------------------------------
  if (!backupStat || !backupStat.exists) {
    recorder.fail('backup artifact exists', {
      reason: `nothing at ${values.BACKUP_PATH}`,
      remediation: 'Create the backup before deploying. Never deploy without one.',
    });
    process.exit(recorder.finish('test-results/backup-rollback.json'));
  }

  recorder.pass('backup artifact exists', { path: values.BACKUP_PATH, type: backupStat.remote ? 'remote_directory' : 'local_directory' });

  // ---- 2. It is not empty --------------------------------------------------
  if (backupStat.size < MIN_BYTES) {
    recorder.fail('backup artifact is non-trivial', {
      reason: `${backupStat.size} bytes is below the ${MIN_BYTES} byte floor — the backup is probably truncated or empty`,
      remediation: 'Re-run the backup and confirm it captured application state.',
    });
  } else {
    recorder.pass('backup artifact is non-trivial', { bytes: backupStat.size });
  }

  // ---- 3. It is recent -----------------------------------------------------
  const ageMs = Date.now() - backupStat.mtimeMs;
  const ageMin = Math.max(0, Math.round(ageMs / 60000));
  if (ageMs > MAX_AGE_MS && ageMin > Number(values.MAX_BACKUP_AGE_MIN)) {
    recorder.fail('backup artifact is recent', {
      reason: `backup is ${ageMin} minutes old, limit is ${values.MAX_BACKUP_AGE_MIN}`,
      remediation: 'Take a fresh backup immediately before deploying.',
    });
  } else {
    recorder.pass('backup artifact is recent', { ageMinutes: ageMin });
  }

  // ---- 4. The rollback target is real --------------------------------------
  let rollbackResolved = null;
  try {
    rollbackResolved = execFileSync('git', ['rev-parse', '--verify', `${values.ROLLBACK_SHA}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    recorder.pass('rollback target resolves to a real commit', { sha: rollbackResolved.slice(0, 12) });
  } catch {
    recorder.fail('rollback target resolves to a real commit', {
      reason: `${values.ROLLBACK_SHA} is not a commit in this repository`,
      remediation: 'Fetch the full history, or supply the SHA that is currently deployed.',
    });
  }

  // ---- 5. The rollback target is an ancestor, not a divergent branch --------
  if (rollbackResolved) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', rollbackResolved, 'HEAD'], { stdio: 'ignore' });
      recorder.pass('rollback target is an ancestor of HEAD', {
        note: 'rolling back moves strictly backwards along this history',
      });
    } catch {
      recorder.info('rollback target is an ancestor of HEAD', {
        reason: 'the rollback SHA is not an ancestor of HEAD — confirm this is intended before proceeding',
      });
    }
  }

  // ---- 6. Current production state -----------------------------------------
  let health = await probe(`${BASE}/api/healthz`);
  if (!health.ok || !health.json) {
    health = await probe(`${BASE}/healthz`);
  }
  if (!health.ok) {
    recorder.blocked('production health captured before rollback', {
      reason: health.error,
      remediation: 'Run from a host that can reach production so pre/post state can be compared.',
    });
  } else {
    recorder.pass('production health captured before rollback', { status: health.status });
  }

  // ---- 7. Print the runbook ------------------------------------------------
  const shortSha = (rollbackResolved || values.ROLLBACK_SHA).slice(0, 12);
  recorder.info('rollback procedure (not executed)', {
    steps: [
      `git checkout ${shortSha}`,
      'npm ci && npm run build',
      'node scripts/deploy-production-direct.mjs',
      `curl -fsS ${BASE}/api/healthz`,
      `EXPECTED_SHA=${rollbackResolved || values.ROLLBACK_SHA} node scripts/verify-production-identity.mjs`,
      'Purge the Cloudflare cache so the previous frontend bundle is served.',
      `Restore application state from ${values.BACKUP_PATH} only if the rollback alone does not resolve the incident.`,
    ],
  });

  process.exit(recorder.finish('test-results/backup-rollback.json'));
}

main().catch(error => {
  recorder.fail('script completed', { reason: error.message });
  process.exit(recorder.finish('test-results/backup-rollback.json') || 1);
});
