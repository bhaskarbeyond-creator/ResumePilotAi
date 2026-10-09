#!/usr/bin/env node
'use strict';
/**
 * lead_watcher_session.cjs — PROJECT-AGNOSTIC autonomous Lead.
 *
 * Iterates EVERY project registered in ~/.ai-bridge/registry.json, tails each
 * project's queue + ledger by BYTE OFFSET (zero re-reads), and autonomously
 * reviews plans / audits evidence for the project the event actually came from.
 * No project path is hardcoded, so parallel IDE windows cannot interfere.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const GLOBAL_DIR = path.join(os.homedir(), '.ai-bridge');
const REGISTRY = path.join(GLOBAL_DIR, 'registry.json');
const QUEUE_PATH = path.join(GLOBAL_DIR, 'lead_wake_queue.jsonl');
const BRIDGE_CLI = path.join(GLOBAL_DIR, 'bridge.cjs');

const positions = new Map(); // projectKey -> { queue, ledger }

// Lightweight operational logging (shared with bridge.cjs via autowake.cjs).
let AWL = null;
function logOp(level, event, detail) {
  try {
    if (!AWL) AWL = require(path.join(__dirname, 'autowake.cjs'));
    AWL.logEvent(level, 'lead', event, detail || {});
  } catch { }
}

const SESSION_PID = path.join(GLOBAL_DIR, 'lead_watcher_session.pid');
/**
 * Singleton guard using an ATOMIC exclusive-create lock (O_EXCL). Prevents
 * duplicate autonomous Leads when the supervisor respawns during a race.
 * A stale lock (dead owner) is safely stolen.
 */
(function claimSingleton() {
  for (let i = 0; i < 8; i++) {
    try {
      const fd = fs.openSync(SESSION_PID, 'wx'); // atomic: fails if it exists
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') break;
      let raw = '';
      try { raw = fs.readFileSync(SESSION_PID, 'utf8').trim(); } catch { }
      const old = Number.parseInt(raw, 10);
      if (!Number.isFinite(old) || old <= 0) {
        // BUG FIX: the file exists but is EMPTY/PARTIAL — another process is
        // mid-claim (openSync succeeded, writeSync not yet). Stealing here is
        // what created duplicate autonomous Leads. Back off and retry instead.
        const until = Date.now() + 150 + Math.floor(Math.random() * 250);
        while (Date.now() < until) { /* let the claimer finish */ }
        continue;
      }
      if (old !== process.pid) {
        try { process.kill(old, 0); console.log('[AI Bridge Autonomous Lead] Another instance (PID ' + old + ') is alive; exiting.'); logOp('info', 'LEAD_STANDDOWN', { owner: old }); process.exit(0); } catch { }
      }
      // Owner is confirmed dead → safe to steal.
      try { fs.unlinkSync(SESSION_PID); } catch { }
      const until = Date.now() + 60 + Math.floor(Math.random() * 140);
      while (Date.now() < until) { /* brief jitter so the winner can write its PID */ }
    }
  }
  console.log('[AI Bridge Autonomous Lead] Could not acquire the singleton lock; exiting.');
  process.exit(0);
})();

/**
 * Belt-and-braces: re-assert ownership on every tick. Even if a race ever
 * produced a duplicate, the loser self-terminates within one tick.
 */
function assertOwnership() {
  try {
    const owner = Number.parseInt(fs.readFileSync(SESSION_PID, 'utf8').trim(), 10);
    if (Number.isFinite(owner) && owner > 0 && owner !== process.pid) {
      console.log('[AI Bridge Autonomous Lead] Lock now owned by PID ' + owner + '; standing down.');
      logOp('info', 'LEAD_STANDDOWN', { owner, reason: 'periodic ownership check' });
      process.exit(0);
    }
  } catch { }
}
function cleanupPid() {
  try { if (fs.existsSync(SESSION_PID) && fs.readFileSync(SESSION_PID, 'utf8').trim() === String(process.pid)) fs.unlinkSync(SESSION_PID); } catch { }
}
process.on('exit', cleanupPid);
process.on('SIGINT', () => { cleanupPid(); process.exit(0); });
process.on('SIGTERM', () => { cleanupPid(); process.exit(0); });
process.on('uncaughtException', (e) => { try { fs.appendFileSync(path.join(GLOBAL_DIR, 'lead_watcher_session_error.log'), `[${new Date().toISOString()}] ${(e && e.stack) || e}\n`); } catch { } });
process.on('unhandledRejection', (r) => { try { fs.appendFileSync(path.join(GLOBAL_DIR, 'lead_watcher_session_error.log'), `[${new Date().toISOString()}] ${(r && r.stack) || r}\n`); } catch { } });

function registryProjects() {
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    return (reg.projects || []).filter(p => p && p.projectRoot && fs.existsSync(path.join(p.projectRoot, '.bridge')));
  } catch { return []; }
}
function keyOf(p) { return p.projectKey || p.projectRoot; }
function slot(key) { if (!positions.has(key)) positions.set(key, { queue: null, ledger: null }); return positions.get(key); }

function runCmd(args, projectRoot) {
  try {
    return execSync(`node "${BRIDGE_CLI}" ${args}`, {
      cwd: projectRoot, encoding: 'utf8', timeout: 30000,
      // Declare provenance explicitly. bridge.cjs gates privileged verbs
      // (approve-plan / review APPROVED / certify) on this, so this daemon can no
      // longer pass itself off as a human Lead.
      env: { ...process.env, AI_BRIDGE_ACTOR: 'automation' }
    });
  } catch (err) { return String((err.stdout || '') + (err.stderr || '') + (err.message || '')); }
}

/**
 * Register this process in the shared DAEMON PID REGISTRY so bridge.cjs can
 * attribute privileged calls to automation via process.ppid — independently of
 * any env var the caller might forget to set.
 */
const DAEMON_PIDS = path.join(GLOBAL_DIR, 'daemon_pids.json');
function registerDaemonPid() {
  try {
    let reg = {};
    try { reg = JSON.parse(fs.readFileSync(DAEMON_PIDS, 'utf8')) || {}; } catch { }
    for (const k of Object.keys(reg)) { try { process.kill(Number(k), 0); } catch { delete reg[k]; } }
    reg[String(process.pid)] = 'lead_watcher_session';
    fs.writeFileSync(DAEMON_PIDS, JSON.stringify(reg, null, 2));
  } catch { }
}
function unregisterDaemonPid() {
  try {
    const reg = JSON.parse(fs.readFileSync(DAEMON_PIDS, 'utf8')) || {};
    delete reg[String(process.pid)];
    fs.writeFileSync(DAEMON_PIDS, JSON.stringify(reg, null, 2));
  } catch { }
}
registerDaemonPid();
process.on('exit', unregisterDaemonPid);

/** Read only the bytes appended since `from` (never re-reads the whole file). */
function readNew(file, from) {
  try {
    const st = fs.statSync(file);
    if (from == null || st.size < from) return { text: '', next: st.size };
    if (st.size === from) return { text: '', next: from };
    const len = st.size - from;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, from);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    if (from > 0) { const nl = text.indexOf('\n'); if (nl >= 0) text = text.slice(nl + 1); }
    return { text, next: st.size };
  } catch { return { text: '', next: from }; }
}
function lines(text) { return text.split(/\r?\n/).filter(Boolean); }

function handlePlanSubmitted(directiveId, projectRoot, projectName) {
  console.log(`\n🤖 [AUTONOMOUS LEAD] Evaluating plan for ${directiveId} (${projectName})...`);
  const reviewOut = runCmd(`plan review --directive ${directiveId} --projectDir "${projectRoot}"`, projectRoot);
  console.log(reviewOut);
  const m = reviewOut.match(/Score:\s*(\d+)\/100/i);
  const score = m ? parseInt(m[1], 10) : 0;
  if (score >= 99) {
    console.log(`✅ [AUTONOMOUS LEAD] ${directiveId} scored ${score}/100 — auto-approving ACT mode.`);
    runCmd(`lead approve-plan --directive ${directiveId} --projectDir "${projectRoot}" --allow-automation --feedback "Auto-approved by the autonomous plan-scorer (score ${score}/100). NOT a human Lead review."`, projectRoot);
  } else {
    console.log(`⚠️ [AUTONOMOUS LEAD] ${directiveId} scored ${score}/100 (<99) — requesting revision.`);
    runCmd(`lead request-changes --directive ${directiveId} --projectDir "${projectRoot}" --feedback "Score ${score}/100 is below the 99 threshold. Revise plan."`, projectRoot);
  }
}

/**
 * ACTUALLY AUDIT THE EVIDENCE before approving it.
 *
 * This handler used to be:
 *     runCmd(`lead review --directive X --verdict APPROVED`)
 * — it logged the word "Auditing" and then asserted APPROVED as a literal. It
 * never opened the evidence, never checked a hash, never looked at test output.
 * That is how directives reached APPROVED_FROZEN with `certifiedBy:
 * LEAD_SUPERVISOR` and an EMPTY review, with no human ever involved.
 *
 * It now reads the directive record, requires a test artifact, scans it for
 * failure markers, and refuses to approve when anything is missing. A failing or
 * absent log produces CHANGES_REQUESTED, not a rubber stamp.
 */
const EVIDENCE_FAILURE_PATTERNS = [
  // Horizontal whitespace only ([ \t]) — \s crosses newlines, which made
  // "pass 756\nfail 0" look like a failure and rejected PASSING logs.
  /\b[1-9]\d*[ \t]+fail(?:ed|ing|ures?)?\b/i,
  /\bfail(?:ed|ures?)?[ \t]*[:=][ \t]*[1-9]\d*\b/i,
  /\bfail(?:ed|ures?)?[ \t]+[1-9]\d*\b/i,
  /\b[1-9]\d*[ \t]+errors?\b/i,
  /\berrors?[ \t]*[:=][ \t]*[1-9]\d*\b/i,
  /\bFAIL(?:ED)?\b/,
  /\bnot ok\b/i,
  /✗|✖|❌/
];
function auditEvidence(directiveId, projectRoot) {
  const file = path.join(projectRoot, '.bridge', 'directives', `${directiveId}.json`);
  let d = null;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { ok: false, reason: 'directive record unreadable' }; }
  const ev = d && d.evidence;
  if (!ev || !ev.manifestHash) return { ok: false, reason: 'no evidence manifest submitted' };
  if (!ev.tests) return { ok: false, reason: 'no test artifact attached (--tests was omitted)' };
  let text = '';
  try {
    if (ev.tests.stored && fs.existsSync(ev.tests.stored)) text = fs.readFileSync(ev.tests.stored, 'utf8');
    else if (ev.tests.source && fs.existsSync(ev.tests.source)) text = fs.readFileSync(ev.tests.source, 'utf8');
    else if (ev.tests.content) text = String(ev.tests.content);
  } catch (e) { return { ok: false, reason: 'test artifact unreadable: ' + String(e.message || e) }; }
  if (!text.trim()) return { ok: false, reason: 'test artifact is empty' };
  const sample = text.length > 4 * 1024 * 1024 ? text.slice(0, 4 * 1024 * 1024) : text;
  const hit = EVIDENCE_FAILURE_PATTERNS.find(re => re.test(sample));
  if (hit) {
    const line = sample.split(/\r?\n/).find(l => hit.test(l)) || '';
    return { ok: false, reason: 'test artifact contains a failure marker: ' + line.trim().slice(0, 120) };
  }
  if (!/\bpass(?:ed|ing)?\b|\bok\b|✓|PASS/i.test(sample)) return { ok: false, reason: 'no recognisable pass marker in the test artifact' };
  if (ev.git && ev.git.dirty) return { ok: false, reason: 'working tree was dirty when evidence was submitted' };
  return { ok: true, reason: 'test artifact scanned, no failure markers, clean tree' };
}

function handleEvidenceSubmitted(directiveId, projectRoot, projectName) {
  console.log(`\n🤖 [AUTONOMOUS GATEKEEPER] Auditing evidence for ${directiveId} (${projectName})...`);
  const audit = auditEvidence(directiveId, projectRoot);
  if (!audit.ok) {
    console.log(`⛔ [AUTONOMOUS GATEKEEPER] ${directiveId} NOT approved: ${audit.reason}`);
    const out = runCmd(`lead review --directive ${directiveId} --projectDir "${projectRoot}" --verdict CHANGES_REQUESTED --feedback "Automated evidence audit FAILED: ${audit.reason}. Re-submit with a passing test log."`, projectRoot);
    console.log(out);
    return;
  }
  console.log(`✅ [AUTONOMOUS GATEKEEPER] ${directiveId} audit passed: ${audit.reason}`);
  const out = runCmd(`lead review --directive ${directiveId} --projectDir "${projectRoot}" --verdict APPROVED --allow-automation --feedback "Automated evidence audit: ${audit.reason}. This is a machine check, NOT a human Lead review."`, projectRoot);
  console.log(out);
}

function checkProject(proj) {
  const root = proj.projectRoot;
  const name = proj.name || path.basename(root);
  const k = keyOf(proj);
  const s = slot(k);

  // 1. Global queue (project-routed by payload bridgeDir/projectRoot)
  if (fs.existsSync(QUEUE_PATH)) {
    const r = readNew(QUEUE_PATH, s.queue);
    s.queue = r.next;
    for (const line of lines(r.text)) {
      try {
        const item = JSON.parse(line);
        const ev = item.event || item;
        const evRoot = item.projectRoot || ev?.payload?.projectRoot;
        if (evRoot && path.resolve(evRoot).toLowerCase() !== path.resolve(root).toLowerCase()) continue;
        if (ev && (ev.sender === 'STAFF_DEVELOPER' || ev.recipient === 'LEAD_SUPERVISOR')) {
          console.log(`\n🔔 [BRIDGE EVENT] ${ev.type} | ${ev.payload?.directiveId || 'N/A'} | ${name}`);
        }
      } catch { }
    }
  }

  // 2. Per-project ledger (authoritative) — autonomous plan/evidence handling
  const ledger = path.join(root, '.bridge', 'ledger.jsonl');
  if (!fs.existsSync(ledger)) return;
  const r2 = readNew(ledger, s.ledger);
  s.ledger = r2.next;
  for (const line of lines(r2.text)) {
    try {
      const ev = JSON.parse(line);
      if (!ev || ev.sender !== 'STAFF_DEVELOPER') continue;
      const dId = ev.payload?.directiveId;
      if (!dId) continue;
      if (ev.type === 'PLAN_SUBMITTED') handlePlanSubmitted(dId, root, name);
      else if (ev.type === 'EVIDENCE_SUBMITTED') handleEvidenceSubmitted(dId, root, name);
    } catch { }
  }
}

function tick() {
  assertOwnership();
  const projects = registryProjects();
  for (const p of projects) { try { checkProject(p); } catch { } }
}

console.log('[AI Bridge Autonomous Lead] Project-agnostic. Governing ' + registryProjects().length + ' project(s).');
logOp('info', 'LEAD_START', { pid: process.pid, projects: registryProjects().map(p => p.name || p.projectRoot) });
try {
  const st = AWL.freezeStatus();
  if (st.locked && !st.intact) logOp('error', 'INTEGRITY_VIOLATION', { source: 'lead', drift: st.drift, blocked: st.blocked });
} catch { }
tick();                                  // baseline all cursors
setInterval(tick, 2000);                 // low-cost incremental tail

