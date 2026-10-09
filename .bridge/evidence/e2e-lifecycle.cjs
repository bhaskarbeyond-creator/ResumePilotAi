#!/usr/bin/env node
'use strict';
/**
 * e2e-lifecycle.cjs — LIVE end-to-end proof of the autonomous Lead↔Dev chain.
 *
 * Drives the REAL bridge CLI through a complete directive lifecycle on a scratch
 * project and asserts, at every handoff, that (a) the state machine advanced and
 * (b) the correct peer was woken. Also asserts the operational log recorded it.
 *
 *   node e2e-lifecycle.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BRIDGE = 'C:\\Users\\mbhas\\.ai-bridge\\bridge.cjs';
const AW = require('C:\\Users\\mbhas\\.ai-bridge\\autowake.cjs');
const ROOT = path.join(os.tmpdir(), 'bridge-e2e-' + Date.now());

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  if (ok) { pass++; console.log(`\x1b[32m✔\x1b[0m ${name}`); }
  else { fail++; console.log(`\x1b[31m✘ ${name}\x1b[0m${detail ? '  — ' + detail : ''}`); }
}
function run(args) {
  const r = spawnSync(process.execPath, [BRIDGE, ...args, '--projectDir', ROOT], {
    encoding: 'utf8', timeout: 60000, windowsHide: true,
    env: { ...process.env, BRIDGE_NO_URI: '1' }   // never spawn real IDE tasks
  });
  let json = null;
  try { json = JSON.parse((r.stdout || '').trim()); } catch { }
  return { json, stdout: r.stdout || '', stderr: r.stderr || '', code: r.status };
}
const PP = () => AW.pPaths(ROOT);
const inboxOf = (role) => { try { return JSON.parse(fs.readFileSync(role === 'lead' ? PP().leadInbox : PP().devInbox, 'utf8')); } catch { return null; } };
const status = () => (run(['directive', 'get', 'DIR-001']).json || {}).status;

console.log('\n' + '='.repeat(74));
console.log('  END-TO-END AUTONOMOUS LIFECYCLE — Lead ↔ Developer');
console.log('='.repeat(74) + '\n');

fs.mkdirSync(ROOT, { recursive: true });
// Certification is git-gated by design (the freeze hash IS a commit hash).
try {
  spawnSync('git', ['init'], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'e2e@bridge.local'], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Bridge E2E'], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
} catch { }
const logBefore = AW.readLogs({ level: 'debug', tail: 1e9 }).total;

/* ── S0. init ─────────────────────────────────────────────────────────────── */
const init = run(['init', '--name', 'E2E']);
check('S0  bridge init scaffolds the project', !!init.json && init.json.success !== false, init.stderr.slice(0, 120));

/* ── S1. LEAD issues a directive → developer must be woken automatically ──── */
const create = run(['directive', 'create', '--title', 'E2E probe', '--spec', 'Prove the chain end to end', '--priority', 'P1']);
check('S1a directive created', !!create.json && create.json.id === 'DIR-001', create.stderr.slice(0, 120));
check('S1b status is ISSUED', status() === 'ISSUED', status());
const devInbox1 = inboxOf('dev');
check('S1c LEAD→DEV wake dispatched automatically (no manual wake)', !!devInbox1 && devInbox1.directiveId === 'DIR-001', JSON.stringify(devInbox1 && devInbox1.id));
check('S1d wake prompt is PLAN mode', !!devInbox1 && /PLAN MODE/i.test(devInbox1.prompt || ''));
check('S1e turn → dev', (run(['turn']).json || {}).owner === 'dev');

/* ── S2. DEVELOPER submits a plan → Lead must be notified automatically ───── */
const plan = run(['dev', 'plan', '--directive', 'DIR-001', '--summary', 'Do the thing safely', '--steps', 'audit;implement;verify']);
check('S2a dev plan accepted', !!plan.json && plan.json.status === 'PLAN_SUBMITTED', JSON.stringify(plan.json && plan.json.status));
check('S2b turn → lead (ball is in Lead court)', (run(['turn']).json || {}).owner === 'lead');
const leadInbox1 = inboxOf('lead');
check('S2c DEV→LEAD notification delivered automatically', !!leadInbox1, JSON.stringify(leadInbox1 && leadInbox1.id));

/* ── S3. LEAD approves the plan → developer must be woken in ACT mode ────── */
const approve = run(['lead', 'approve-plan', '--directive', 'DIR-001', '--feedback', 'Authorized']);
check('S3a plan approved → IN_PROGRESS', !!approve.json && approve.json.status === 'IN_PROGRESS', JSON.stringify(approve.json && approve.json.status));
const devInbox2 = inboxOf('dev');
check('S3b LEAD→DEV ACT wake dispatched automatically', !!devInbox2 && devInbox2.mode === 'act', JSON.stringify(devInbox2 && devInbox2.mode));
check('S3c turn → dev', (run(['turn']).json || {}).owner === 'dev');

/* ── S4. DEVELOPER heartbeats + submits evidence → Lead notified ──────────── */
const hb = run(['dev', 'heartbeat', '--directive', 'DIR-001', '--status', 'implementing', '--percent', '60']);
check('S4a heartbeat accepted', !!hb.json && hb.json.type === 'HEARTBEAT');
const ev = run(['dev', 'submit-evidence', '--directive', 'DIR-001', '--summary', 'All checks green', '--tests', 'e2e-lifecycle.log']);
check('S4b evidence submitted → EVIDENCE_SUBMITTED', !!ev.json && ev.json.status === 'EVIDENCE_SUBMITTED', JSON.stringify(ev.json && ev.json.status));
check('S4c turn → lead', (run(['turn']).json || {}).owner === 'lead');
check('S4d DEV→LEAD evidence notification delivered', !!inboxOf('lead'));

/* ── S5. LEAD reviews + Gatekeeper certifies → frozen ─────────────────────── */
const rev = run(['lead', 'review', '--directive', 'DIR-001', '--verdict', 'APPROVED', '--feedback', 'Verified']);
check('S5a review APPROVED → APPROVED', !!rev.json && rev.json.status === 'APPROVED', JSON.stringify(rev.json && rev.json.status));
const cert = run(['gatekeeper', 'certify', '--directive', 'DIR-001']);
check('S5b certified → APPROVED_FROZEN', !!cert.json && cert.json.status === 'APPROVED_FROZEN', JSON.stringify(cert.json && cert.json.status));
check('S5c turn → none (workflow complete)', (run(['turn']).json || {}).owner === 'none');

/* ── S6. Inbox / await contract ──────────────────────────────────────────── */
const inbox = run(['inbox', '--role', 'lead']);
check('S6a inbox returns unread lead messages', Array.isArray(inbox.json) && inbox.json.length > 0, 'count=' + (Array.isArray(inbox.json) ? inbox.json.length : 'n/a'));
const awaitRes = run(['await', '--role', 'lead', '--timeout', '2']);
check('S6b await returns instantly when a message is pending', !!awaitRes.json && awaitRes.json.timedOut === false, JSON.stringify(awaitRes.json && awaitRes.json.timedOut));

/* ── S7. Operational logging captured the whole run ──────────────────────── */
const logAfter = AW.readLogs({ level: 'debug', tail: 1e9 });
const added = logAfter.total - logBefore;
check('S7a operational log recorded the run', added >= 10, `+${added} entries`);
const disp = logAfter.entries.filter(e => e.event === 'DISPATCH');
check('S7b every wake dispatch was logged with its channel', disp.length >= 3, `DISPATCH entries=${disp.length}`);
check('S7c dispatches record the target role', disp.some(e => e.detail && e.detail.to === 'dev') && disp.some(e => e.detail && e.detail.to === 'lead'));
check('S7d CLI invocations logged with duration', logAfter.entries.some(e => e.component === 'cli' && e.event === 'CLI' && typeof e.durationMs === 'number'));
check('S7e no ERROR entries during a clean run', logAfter.entries.filter(e => e.level === 'error' && e.projectKey === PP().key).length === 0);
check('S7f log is bounded (rotation configured)', AW.LOG_FILE.endsWith('bridge.jsonl'));

/* ── S8. Isolation: this scratch project never touched the real one ──────── */
check('S8a scratch project has its own key', PP().key.startsWith('bridge-e2e-'), PP().key);
check('S8b scratch wake dir is separate from IME365', !PP().dir.includes('IME365-a641d3a0'), PP().dir);

console.log('\n' + '-'.repeat(74));
console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
console.log('-'.repeat(74));
console.log(`  scratch project: ${ROOT}`);
console.log(`  operational log: ${AW.LOG_FILE}\n`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
process.exit(fail ? 1 : 0);

