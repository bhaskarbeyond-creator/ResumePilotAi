#!/usr/bin/env node
/**
 * DIR-008 — milestone commit ledger (R-42).
 *
 * Reads the real git history, keeps commits whose message names a milestone
 * `(M1)` … `(M9)`, and verifies each one is contained in the remote tracking
 * branch after a fresh fetch. Nothing is inferred: an unverified commit is
 * reported as UNVERIFIED, never as pushed.
 *
 * Outputs:
 *   docs/release/DIR-008-commit-ledger.md
 *   docs/release/DIR-008-commit-ledger.json
 *
 * Usage: node scripts/dir008-commit-ledger.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BRANCH = 'arena/8a774228-resumepilotai';
const OUT_DIR = path.join(ROOT, 'docs', 'release');

function git(...args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() };
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
if (branch !== BRANCH) {
  console.error(`Refusing to write a ledger for branch "${branch}" (expected ${BRANCH}).`);
  process.exit(1);
}

const fetch = git('fetch', 'origin', BRANCH);
const remoteRef = `origin/${BRANCH}`;
const remoteSha = git('rev-parse', remoteRef).out;

const log = git('log', '--reverse', '--format=%H%x09%ad%x09%s', '--date=iso-strict', 'origin/main..HEAD');
if (log.status !== 0) {
  console.error(log.err);
  process.exit(1);
}

// M0 (verified baseline) and M1 (audit) predate the `(M#)` subject convention,
// so they are identified by SHA with the reason recorded instead of guessed.
const SHA_OVERRIDES = [
  { milestone: 'M0', sha: 'bef5428538a0c508898d191c989b155e0f0e8512', note: 'baseline commit of main; subject carries no milestone tag' },
  { milestone: 'M1', sha: 'b8ca506a8d2656bd598522b49702c30b186f3a0f', note: 'audit + acceptance matrix; subject carries no milestone tag' },
];

const rows = [];
for (const line of log.out.split('\n').filter(Boolean)) {
  const [sha, date, subject] = line.split('\t');
  const match = subject.match(/\((M\d+)\)\s*$/);
  if (match) rows.push({ milestone: match[1], sha, date, subject, source: 'subject-tag' });
}

for (const override of SHA_OVERRIDES) {
  const meta = git('show', '-s', '--format=%H%x09%ad%x09%s', '--date=iso-strict', override.sha);
  if (meta.status !== 0) {
    rows.push({ ...override, date: null, subject: 'UNKNOWN COMMIT', source: 'sha-override' });
    continue;
  }
  const [sha, date, subject] = meta.out.split('\t');
  rows.push({ milestone: override.milestone, sha, date, subject, source: `sha-override: ${override.note}` });
}

const seen = new Set();
const milestones = rows
  .filter((row) => {
    if (seen.has(row.milestone)) return false;
    seen.add(row.milestone);
    return true;
  })
  .sort((a, b) => Number(a.milestone.slice(1)) - Number(b.milestone.slice(1)))
  .map((row) => {
    const contains = git('merge-base', '--is-ancestor', row.sha, remoteRef);
    return {
      ...row,
      shortSha: row.sha.slice(0, 7),
      pushedToRemote: contains.status === 0,
      remoteRef,
    };
  });

const head = git('rev-parse', 'HEAD').out;
const ahead = git('rev-list', '--count', `${remoteRef}..HEAD`).out;

const report = {
  directive: 'DIR-008',
  requirement: 'R-42',
  generatedAt: new Date().toISOString(),
  branch,
  head,
  remoteRef,
  remoteSha,
  remoteShaAtVerification: remoteSha,
  headAtGeneration: head,
  commitsAheadOfRemoteAtGeneration: Number(ahead),
  fetchStatus: fetch.status === 0 ? 'ok' : 'failed',
  milestones,
  note: 'Each milestone row is read from git history and checked with `git merge-base --is-ancestor <sha> origin/<branch>` after a fresh fetch. A row that is not contained in the remote is reported as UNVERIFIED.',
};

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'DIR-008-commit-ledger.json'), `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push('# DIR-008 — milestone commit ledger (R-42)');
md.push('');
md.push(`Generated: ${report.generatedAt}`);
md.push(`Branch: \`${branch}\``);
md.push(`HEAD: \`${head}\``);
md.push(`Remote: \`${remoteRef}\` @ \`${remoteSha}\``);
md.push(`Verification run: ${report.generatedAt} against remote \`${remoteSha}\` (${report.fetchStatus}).`);
md.push(`HEAD at generation: \`${head}\`${Number(ahead) > 0 ? ` (${ahead} commit(s) not yet pushed)` : ''}.`);
md.push('');
md.push('| Milestone | Commit | Date | Subject | Remote |');
md.push('| --- | --- | --- | --- | --- |');
for (const row of milestones) {
  md.push(`| ${row.milestone} | \`${row.shortSha}\` | ${row.date} | ${row.subject.replace(/\|/g, '\\|')} | ${row.pushedToRemote ? 'contained' : 'UNVERIFIED'} |`);
}
md.push('');
md.push(report.note);
md.push('');
md.push('Full SHAs:');
md.push('');
for (const row of milestones) md.push(`* ${row.milestone} — \`${row.sha}\``);
md.push('');
await fs.writeFile(path.join(OUT_DIR, 'DIR-008-commit-ledger.md'), md.join('\n'));

console.log(`milestones: ${milestones.map((row) => row.milestone).join(', ')}`);
console.log(`remote ${remoteSha}; ${milestones.filter((row) => row.pushedToRemote).length}/${milestones.length} milestones contained in remote`);
