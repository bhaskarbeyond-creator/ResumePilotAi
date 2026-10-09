#!/usr/bin/env node
'use strict';
/**
 * freeze-lock-selftest.cjs — proves the change-control gate actually blocks.
 *
 * Verifies: lock captures hashes · intact passes · drift is DETECTED · mutating
 * commands are REFUSED while drifted · an approved window unblocks · re-lock
 * closes the window · every step is audited in the operational log.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BRIDGE = 'C:\\Users\\mbhas\\.ai-bridge\\bridge.cjs';
const GLOBAL = 'C:\\Users\\mbhas\\.ai-bridge';
const AW = require(path.join(GLOBAL, 'autowake.cjs'));
const TARGET = path.join(GLOBAL, 'BRIDGE-PROTOCOL.md');   // frozen, non-executable
const ROOT = path.join(os.tmpdir(), 'freeze-e2e-' + Date.now());

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`\x1b[32m✔\x1b[0m ${name}`); }
  else { fail++; console.log(`\x1b[31m✘ ${name}\x1b[0m${detail ? '  — ' + detail : ''}`); }
}
function run(args, extraEnv) {
  const r = spawnSync(process.execPath, [BRIDGE, ...args], {
    encoding: 'utf8', timeout: 60000, windowsHide: true,
    env: { ...process.env, BRIDGE_NO_URI: '1', ...(extraEnv || {}) }
  });
  let json = null; try { json = JSON.parse((r.stdout || '').trim()); } catch { }
  return { json, out: (r.stdout || '') + (r.stderr || ''), code: r.status };
}

console.log('\n' + '='.repeat(74));
console.log('  FREEZE / LOCK — change-control gate');
console.log('='.repeat(74) + '\n');

const original = fs.readFileSync(TARGET, 'utf8');
// Preserve the pre-existing manifest so a run can never lock in someone else's drift.
const freezeBackup = (() => { try { return fs.readFileSync(AW.FREEZE_FILE, 'utf8'); } catch { return null; } })();
let tampered = false;
try {
  // ── 1. Lock ───────────────────────────────────────────────────────────────
  const lock = run(['freeze']);
  check('1a freeze captures a manifest', !!lock.json && lock.json.lock && lock.json.lock.locked === true, lock.out.slice(0, 140));
  const st1 = run(['lock-status']).json;
  check('1b lock-status reports intact', !!st1 && st1.locked === true && st1.intact === true && st1.drift.length === 0, JSON.stringify(st1 && st1.drift));
  check('1c manifest covers all frozen files', !!st1 && st1.fileCount >= 6, 'fileCount=' + (st1 && st1.fileCount));

  // ── 2. Intact => mutating commands work (no false positives) ──────────────
  fs.mkdirSync(ROOT, { recursive: true });
  run(['init', '--name', 'FZ', '--projectDir', ROOT]);
  run(['directive', 'create', '--title', 't', '--spec', 's', '--projectDir', ROOT]);
  const ok1 = run(['dev', 'plan', '--directive', 'DIR-001', '--summary', 'p', '--steps', 'a', '--projectDir', ROOT]);
  check('2a mutating command allowed while intact', !!ok1.json && ok1.json.status === 'PLAN_SUBMITTED', ok1.out.slice(0, 140));

  // ── 3. Tamper a frozen file ───────────────────────────────────────────────
  fs.appendFileSync(TARGET, '\n<!-- unauthorised change -->\n', 'utf8');
  tampered = true;
  const st2 = run(['lock-status']).json;
  check('3a drift is DETECTED', !!st2 && st2.intact === false && st2.drift.some(d => d.file === 'BRIDGE-PROTOCOL.md' && d.change === 'MODIFIED'), JSON.stringify(st2 && st2.drift));
  check('3b status is marked blocked', !!st2 && st2.blocked === true);

  // ── 4. Mutating commands are REFUSED ─────────────────────────────────────
  const blocked = run(['dev', 'plan', '--directive', 'DIR-001', '--summary', 'x', '--steps', 'a', '--projectDir', ROOT]);
  check('4a mutating command REFUSED while drifted', blocked.code !== 0 && /BRIDGE LOCKED/.test(blocked.out), blocked.out.slice(0, 160));
  check('4b refusal tells you how to approve', /bridge unlock --reason/.test(blocked.out));

  // ── 5. Read-only commands still work (warn only) ──────────────────────────
  const ro = run(['turn', '--projectDir', ROOT]);
  check('5a read-only command still works (warn only)', !!ro.json && ro.json.success === true, ro.out.slice(0, 120));

  // ── 6. Approve a change window ────────────────────────────────────────────
  const noReason = run(['unlock']);
  check('6a unlock without --reason is rejected', noReason.code !== 0 && /reason/i.test(noReason.out), noReason.out.slice(0, 120));
  const unlock = run(['unlock', '--reason', 'selftest: approved drift', '--minutes', '5']);
  check('6b unlock with reason opens a window', !!unlock.json && unlock.json.success === true && !!unlock.json.unlockedUntil, unlock.out.slice(0, 160));
  const after = run(['dev', 'plan', '--directive', 'DIR-001', '--summary', 'y', '--steps', 'a', '--projectDir', ROOT]);
  check('6c mutating command ALLOWED inside the window', !!after.json && after.json.status === 'PLAN_SUBMITTED', after.out.slice(0, 140));

  // ── 7. Re-lock closes the window and restores enforcement ────────────────
  fs.writeFileSync(TARGET, original, 'utf8'); tampered = false;
  const relock = run(['freeze']);
  check('7a re-freeze after restoring the file', !!relock.json && relock.json.lock.locked === true, relock.out.slice(0, 140));
  const st3 = run(['lock-status']).json;
  check('7b back to intact', !!st3 && st3.intact === true);
  const final = run(['dev', 'plan', '--directive', 'DIR-001', '--summary', 'z', '--steps', 'a', '--projectDir', ROOT]);
  check('7c mutating command works again', !!final.json && final.json.status === 'PLAN_SUBMITTED', final.out.slice(0, 140));

  // ── 8. Audit trail ───────────────────────────────────────────────────────
  const logs = AW.readLogs({ level: 'debug', tail: 1e9 }).entries.filter(e => e.component === 'freeze');
  check('8a lock/unlock/refusal all audited', logs.some(e => e.event === 'LOCK') && logs.some(e => e.event === 'UNLOCK') && logs.some(e => e.event === 'INTEGRITY_VIOLATION'));
  check('8b approval rationale recorded', logs.some(e => e.event === 'UNLOCK' && /approved drift/.test(JSON.stringify(e.detail))));
  check('8c refusal logged as an error', logs.some(e => e.event === 'INTEGRITY_VIOLATION' && e.level === 'error'));
} finally {
  if (tampered) { try { fs.writeFileSync(TARGET, original, 'utf8'); } catch { } }
  // Restore the ORIGINAL manifest (never lock in pre-existing drift).
  try { if (freezeBackup) fs.writeFileSync(AW.FREEZE_FILE, freezeBackup, 'utf8'); else run(['freeze']); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
}

console.log('\n' + '-'.repeat(74));
console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
console.log('-'.repeat(74) + '\n');
process.exit(fail ? 1 : 0);

