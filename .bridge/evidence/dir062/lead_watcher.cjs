#!/usr/bin/env node
'use strict';

/**
 * lead_watcher.cjs — Universal AI Bridge Bidirectional Instant Wake Daemon
 *
 * Project-agnostic daemon that monitors:
 * 1. Global event queue (~/.ai-bridge/lead_wake_queue.jsonl) across all projects
 * 2. UDP datagrams on port 48222 with project metadata
 * 3. Registered project bridges (~/.ai-bridge/registry.json)
 *
 * When an event arrives from STAFF_DEVELOPER (Cline / Roo):
 * - PLAN_SUBMITTED
 * - QUESTION_ASKED
 * - EVIDENCE_SUBMITTED
 * - HEARTBEAT
 *
 * It immediately emits a structured, high-priority wakeup signal
 * to stdout, displaying the exact project name and recommended Lead action.
 * Because this process runs as a daemon task in Antigravity IDE,
 * the IDE runtime wakes the Lead Supervisor instantly.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const { spawn } = require('child_process');

const UDP_PORT = 48222;
const GLOBAL_DIR = path.join(os.homedir(), '.ai-bridge');
const REGISTRY_PATH = path.join(GLOBAL_DIR, 'registry.json');
const QUEUE_PATH = path.join(GLOBAL_DIR, 'lead_wake_queue.jsonl');
const PID_PATH = path.join(GLOBAL_DIR, 'lead_watcher.pid');

// Lightweight operational logging (shared with bridge.cjs via autowake.cjs).
let AWL = null;
function logOp(level, event, detail) {
  try {
    if (!AWL) AWL = require(path.join(__dirname, 'autowake.cjs'));
    AWL.logEvent(level, 'daemon', event, detail || {});
  } catch { }
}
// Persisted queue read cursor (all project-scoped wake artifacts live in autowake.cjs)
const QUEUE_CURSOR_PATH = path.join(GLOBAL_DIR, 'lead_wake_cursor.json');

try {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  if (fs.existsSync(PID_PATH)) {
    const oldPid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 'SIGTERM');
      } catch {}
    }
  }
  fs.writeFileSync(PID_PATH, String(process.pid), 'utf8');
} catch {}

function cleanupPid() {
  try {
    if (fs.existsSync(PID_PATH)) {
      const p = fs.readFileSync(PID_PATH, 'utf8').trim();
      if (p === String(process.pid)) fs.unlinkSync(PID_PATH);
    }
  } catch {}
}

process.on('exit', cleanupPid);
process.on('SIGINT', () => { cleanupPid(); process.exit(0); });
process.on('SIGTERM', () => { cleanupPid(); process.exit(0); });

// Crash-proof resilience handlers: prevent unexpected exceptions or unhandled rejections from terminating daemon
process.on('uncaughtException', (err) => {
  try {
    const errLog = path.join(GLOBAL_DIR, 'lead_watcher_error.log');
    fs.appendFileSync(errLog, `[${new Date().toISOString()}] UNCAUGHT_EXCEPTION: ${err?.stack || err}\n`);
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  try {
    const errLog = path.join(GLOBAL_DIR, 'lead_watcher_error.log');
    fs.appendFileSync(errLog, `[${new Date().toISOString()}] UNHANDLED_REJECTION: ${reason?.stack || reason}\n`);
  } catch {}
});

function getRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return { activeProject: null, projects: [] };
  try {
    const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (!Array.isArray(data.projects)) data.projects = [];
    return data;
  } catch {
    return { activeProject: null, projects: [] };
  }
}

function getActionGuidance(event, projectDir) {
  const dId = event.payload?.directiveId || '';
  const dirFlag = projectDir ? ` --projectDir "${projectDir}"` : '';
  switch (event.type) {
    case 'PLAN_SUBMITTED':
      return `Developer submitted plan for ${dId}.\nReview the plan and execute:\n  bridge lead approve-plan --directive ${dId}${dirFlag} --feedback "Authorized"\nor request changes:\n  bridge lead request-changes --directive ${dId}${dirFlag} --feedback "<changes>"`;
    case 'QUESTION_ASKED':
      return `Developer is blocked and asked a question (${event.id}).\nExecute:\n  bridge lead reply --message-id ${event.id}${dirFlag} --message "<answer>"`;
    case 'DIRECT_MESSAGE':
      return `Developer sent a direct communication message.\nRead message and reply via:\n  bridge lead send --message "<response>"${dId ? ` --directive ${dId}` : ''}${dirFlag}`;
    case 'EVIDENCE_SUBMITTED':
      return `Developer submitted verification evidence for ${dId}.\nReview the evidence manifest and verify:\n  bridge gatekeeper certify --directive ${dId}${dirFlag} --freeze-hash "<git-hash>"`;
    case 'HEARTBEAT':
      return `Developer progress heartbeat: ${event.payload?.percent ?? ''}% - ${event.payload?.status || ''}`;
    case 'WAKE_LEAD_REQUESTED':
      return `Developer is waiting and explicitly waking Lead Supervisor!\nReason   : ${event.payload?.reason || event.body || 'Waiting for review/approval'}\nDirective: ${dId || 'N/A'}\nAction   :\n  Inspect project: bridge status${dirFlag}\n  Or review inbox: bridge inbox --role lead${dirFlag}`;
    case 'PING':
      return `Automated test ping verified! The bidirectional link between Developer and Lead Supervisor is 100% operational.`;
    default:
      return `New message received from developer. Inspect with: bridge inbox --role lead${dirFlag}`;
  }
}

function markActiveProject(projectRoot, projectName) {
  if (!projectRoot) return;
  try {
    const reg = getRegistry();
    const cleanRoot = path.resolve(projectRoot);
    if (reg.activeProject !== cleanRoot) {
      reg.activeProject = cleanRoot;
      const found = (reg.projects || []).find(p => path.resolve(p.projectRoot || '').toLowerCase() === cleanRoot.toLowerCase());
      if (found) {
        found.lastActive = new Date().toISOString();
      } else {
        reg.projects = reg.projects || [];
        reg.projects.push({
          name: projectName || path.basename(cleanRoot),
          projectRoot: cleanRoot,
          bridgeDir: path.join(cleanRoot, '.bridge'),
          registeredAt: new Date().toISOString(),
          lastActive: new Date().toISOString()
        });
      }
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
    }
  } catch {}
}

function emitLeadWake(event, meta = {}) {
  const projName = meta.projectName || (meta.projectRoot ? path.basename(meta.projectRoot) : 'Universal Bridge');
  const projRoot = meta.projectRoot || meta.bridgeDir || '';
  if (projRoot) markActiveProject(projRoot, projName);
  console.log('\n' + '='.repeat(78));
  console.log(`🔔 [AI BRIDGE INSTANT WAKE SIGNAL: LEAD_SUPERVISOR]`);
  console.log(`Project    : ${projName}${projRoot ? ` (${projRoot})` : ''}`);
  console.log(`Event Type : ${event.type}`);
  console.log(`Directive  : ${event.payload?.directiveId || 'N/A'}`);
  console.log(`Title      : ${event.title}`);
  console.log(`Sender     : ${event.sender}`);
  console.log(`Timestamp  : ${event.timestamp}`);
  console.log('-'.repeat(78));
  console.log(`Summary:\n${event.body || '(no body)'}`);
  console.log('-'.repeat(78));
  console.log(`Recommended Lead Action:\n${getActionGuidance(event, projRoot)}`);
  console.log('='.repeat(78) + '\n');
}

// Track the queue read position as a BYTE OFFSET (persisted) so a restart never
// re-wakes history, never drops events that arrived while down, and never
// re-reads the whole (ever-growing) append-only queue file.
let queueByteOffset = null;

function readQueueCursor() {
  try { const j = JSON.parse(fs.readFileSync(QUEUE_CURSOR_PATH, 'utf8')); return Number.isFinite(j.bytes) ? j.bytes : null; } catch { return null; }
}
function writeQueueCursor(bytes) {
  try { fs.writeFileSync(QUEUE_CURSOR_PATH, JSON.stringify({ bytes, updatedAt: new Date().toISOString() }), 'utf8'); } catch { }
}

function checkQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return;
  try {
    const st = fs.statSync(QUEUE_PATH);
    if (queueByteOffset === null) {
      // First ever run: baseline to EOF (never replay deep history).
      // Restart: resume at the persisted byte offset.
      const persisted = readQueueCursor();
      queueByteOffset = (persisted != null && persisted <= st.size) ? persisted : st.size;
      writeQueueCursor(queueByteOffset);
      console.log(`[Lead Watcher] Queue byte-cursor initialized at ${queueByteOffset}/${st.size} (${QUEUE_PATH})`);
      return;
    }
    if (st.size < queueByteOffset) queueByteOffset = 0;   // rotated/truncated
    if (st.size === queueByteOffset) return;              // nothing new: zero work
    const len = st.size - queueByteOffset;
    const fd = fs.openSync(QUEUE_PATH, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, queueByteOffset);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    if (queueByteOffset > 0) { const nl = text.indexOf('\n'); if (nl >= 0) text = text.slice(nl + 1); }
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      try {
        const item = JSON.parse(line);
        // ── DEAD-PROJECT GUARD (DIR-062) ──────────────────────────────────────
        // The queue is a durable append-only log, so it holds entries for projects
        // that have since been deleted — and this function REPLAYS from offset 0
        // whenever the file shrinks (`if (st.size < queueByteOffset) queueByteOffset = 0`).
        // Without this guard those entries emitted real wake prompts for
        // non-existent projects ("ghost wakes", e.g. DIR-001 for proj-Oxqdsz /
        // proj-NkRU3S / proj-O77Qdh), and emitLeadWake -> autowake ensureScaffold()
        // then RE-REGISTERED the deleted project in registry.json and recreated its
        // record dir. Four remediation rounds only removed the data; this removes
        // the mechanism.
        if (item && item.projectRoot && !fs.existsSync(item.projectRoot)) continue;
        if (item && item.event) {
          const ev = item.event;
          if (ev.sender === 'STAFF_DEVELOPER' || ev.recipient === 'LEAD_SUPERVISOR') emitLeadWake(ev, item);
        }
      } catch { }
    }
    queueByteOffset = st.size;
    writeQueueCursor(queueByteOffset);
  } catch { }
}

// Track per-project ledger seq numbers as secondary redundancy
const lastSeenSeqByBridge = new Map();

// Read only the TAIL of an append-only file so cost stays flat as it grows.
function tailLines(file, maxBytes = 262144) {
  try {
    const st = fs.statSync(file);
    const start = Math.max(0, st.size - maxBytes);
    const len = st.size - start;
    if (len <= 0) return [];
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    if (start > 0) { const nl = text.indexOf('\n'); if (nl >= 0) text = text.slice(nl + 1); }
    return text.split(/\r?\n/).filter(Boolean);
  } catch { return []; }
}

function checkBridgeLedger(bDir, projectRoot, projectName) {
  const ledgerPath = path.join(bDir, 'ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) return;
  try {
    const lines = tailLines(ledgerPath, 262144); // never load the whole ledger
    const lastSeq = lastSeenSeqByBridge.get(bDir);

    if (lastSeq === undefined) {
      let maxSeq = 0;
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (ev.seq && ev.seq > maxSeq) maxSeq = ev.seq;
        } catch {}
      }
      lastSeenSeqByBridge.set(bDir, maxSeq);
      return;
    }

    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.seq && ev.seq > lastSeq) {
          lastSeenSeqByBridge.set(bDir, ev.seq);
          if (ev.sender === 'STAFF_DEVELOPER' || ev.recipient === 'LEAD_SUPERVISOR') {
            emitLeadWake(ev, { bridgeDir: bDir, projectRoot, projectName });
          }
        }
      } catch {}
    }
  } catch {}
}

function checkAllProjects() {
  checkQueue();
  const reg = getRegistry();
  for (const p of reg.projects) {
    if (p.bridgeDir && fs.existsSync(p.bridgeDir)) {
      checkBridgeLedger(p.bridgeDir, p.projectRoot, p.name);
    }
  }
}

// 1. File watcher on GLOBAL_DIR (watches lead_wake_queue.jsonl & registry.json)
try {
  fs.watch(GLOBAL_DIR, (eventType, filename) => {
    if (filename === 'lead_wake_queue.jsonl' || filename === 'registry.json') {
      checkQueue();
    }
  });
} catch (e) {
  console.warn(`[Lead Watcher] File watcher fallback: ${e.message}`);
}

// 2. UDP instant notification listener with Dynamic Port Hunting (48222 - 48225)
const PORTS_TO_TRY = [48222, 48223, 48224, 48225];
let activeUdpPort = 48222;

function tryBindUdp(portIndex = 0) {
  if (portIndex >= PORTS_TO_TRY.length) {
    console.warn('[Lead Watcher] All UDP ports busy. Running in pure queue-polling mode.');
    return;
  }
  const port = PORTS_TO_TRY[portIndex];
  try {
    const server = dgram.createSocket('udp4');
    server.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString('utf8'));
        checkQueue();
        if (data.bridgeDir) {
          checkBridgeLedger(data.bridgeDir, data.projectRoot, data.projectName);
        }
      } catch {
        checkQueue();
      }
    });
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.close();
        tryBindUdp(portIndex + 1);
      }
    });
    server.bind(port, '127.0.0.1', () => {
      activeUdpPort = port;
      try {
        const telemetryPath = path.join(GLOBAL_DIR, 'telemetry.json');
        fs.writeFileSync(telemetryPath, JSON.stringify({
          udpPort: activeUdpPort,
          pid: process.pid,
          updatedAt: new Date().toISOString()
        }, null, 2), 'utf8');
      } catch {}
      console.log(`[Lead Watcher] UDP telemetry listener bound on port :${activeUdpPort}`);
    });
  } catch {
    tryBindUdp(portIndex + 1);
  }
}
tryBindUdp(0);

// Periodic Heartbeat update every 10s
setInterval(() => {
  try {
    const telemetryPath = path.join(GLOBAL_DIR, 'telemetry.json');
    fs.writeFileSync(telemetryPath, JSON.stringify({
      udpPort: activeUdpPort,
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      alive: true
    }, null, 2), 'utf8');
  } catch {}
}, 10000);

// 2b. Extension Auto-Update Immunity File Watcher (Instant Auto-Healing < 50ms)
const EXT_DIR = path.join(os.homedir(), '.antigravity-ide', 'extensions');
let healDebounceTimer = null;
function triggerAutoHeal() {
  if (healDebounceTimer) clearTimeout(healDebounceTimer);
  healDebounceTimer = setTimeout(() => {
    try {
      const bridgeCli = path.join(__dirname, 'bridge.cjs');
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, [bridgeCli, 'heal-wake'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, AI_BRIDGE_ROLE: 'lead' }
      });
      child.unref();
      console.log('[Lead Watcher] Extension update detected: wake patches verified & healed.');
    } catch {}
  }, 250);
}

if (fs.existsSync(EXT_DIR)) {
  try {
    fs.watch(EXT_DIR, { recursive: true }, (eventType, filename) => {
      if (filename && filename.toLowerCase().includes('extension.js')) {
        triggerAutoHeal();
      }
    });
  } catch {}
}


// 2c. Real-Time Cline LLM Socket Abort Sentinel (Instant ECONNRESET Recovery < 1.5s)
let activeClineLogPath = null;
let lastClineLogOffset = 0;
let lastSocketErrorAlertTime = 0;

function findActiveClineLog() {
  try {
    const base = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity IDE', 'logs');
    if (!fs.existsSync(base)) return null;
    const sessions = fs.readdirSync(base).sort().reverse();
    for (const s of sessions) {
      const winDir = path.join(base, s, 'window1', 'exthost');
      if (fs.existsSync(winDir)) {
        const sub = fs.readdirSync(winDir);
        for (const d of sub) {
          if (d.startsWith('output_logging_')) {
            const cand = path.join(winDir, d, '1-Cline.log');
            if (fs.existsSync(cand)) return cand;
          }
        }
      }
    }
  } catch {}
  return null;
}

function checkClineLogErrors() {
  if (!activeClineLogPath || !fs.existsSync(activeClineLogPath)) {
    activeClineLogPath = findActiveClineLog();
    if (activeClineLogPath && fs.existsSync(activeClineLogPath)) {
      lastClineLogOffset = fs.statSync(activeClineLogPath).size;
    }
    return;
  }

  try {
    const stat = fs.statSync(activeClineLogPath);
    if (stat.size < lastClineLogOffset) {
      lastClineLogOffset = 0; // log rotated
    }
    if (stat.size === lastClineLogOffset) return;

    const fd = fs.openSync(activeClineLogPath, 'r');
    const readLen = stat.size - lastClineLogOffset;
    const buffer = Buffer.alloc(readLen);
    fs.readSync(fd, buffer, 0, readLen, lastClineLogOffset);
    fs.closeSync(fd);
    lastClineLogOffset = stat.size;

    const chunk = buffer.toString('utf8');
    const hasSocketAbort = chunk.includes('ECONNRESET') ||
      chunk.includes('wsarecv: An established connection was aborted') ||
      chunk.includes('terminated: read ECONNRESET') ||
      chunk.includes('WSAECONNABORTED') ||
      chunk.includes('Agent run failed') ||
      chunk.includes('SocketError') ||
      chunk.includes('UND_ERR_SOCKET');

    if (hasSocketAbort && (Date.now() - lastSocketErrorAlertTime > 15000)) {
      lastSocketErrorAlertTime = Date.now();
      const reg = getRegistry();
      for (const proj of reg.projects) {
        const bDir = proj.bridgeDir;
        if (!bDir || !fs.existsSync(bDir)) continue;
        const directivesDir = path.join(bDir, 'directives');
        if (!fs.existsSync(directivesDir)) continue;
        const files = fs.readdirSync(directivesDir).filter(x => /^DIR-\d{3,}\.json$/.test(x));
        for (const f of files) {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(directivesDir, f), 'utf8'));
            if (d && d.status === 'IN_PROGRESS') {
              console.log('\n' + '!'.repeat(78));
              console.log('🚨 [AUTONOMOUS SENTINEL: LLM SOCKET TERMINATION (ECONNRESET) DETECTED]');
              console.log(`Project   : ${proj.name || path.basename(proj.projectRoot)} (${proj.projectRoot})`);
              console.log(`Directive : ${d.id} (${d.title})`);
              console.log('Trigger   : Network connection was terminated/aborted by host machine (ECONNRESET)');
              console.log('Action    : Autonomously waking developer in ACT mode to resume immediately...');
              console.log('!'.repeat(78) + '\n');

              // Log to ledger
              try {
                const ledgerPath = path.join(bDir, 'ledger.jsonl');
                if (fs.existsSync(ledgerPath)) {
                  const ev = {
                    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    timestamp: new Date().toISOString(),
                    sender: 'LEAD_SUPERVISOR',
                    recipient: 'STAFF_DEVELOPER',
                    type: 'SUPERVISOR_AUTO_RETRY',
                    title: `[Auto-Retry Dispatched] ${d.id}`,
                    body: '[SUPERVISOR NOTICE — AUTO RETRY TRIGGERED]\nTrigger: Network socket aborted (ECONNRESET / WSAECONNABORTED). Resuming execution.',
                    readBy: ['LEAD_SUPERVISOR', 'STAFF_DEVELOPER'],
                    payload: { directiveId: d.id, reason: 'Network socket aborted (ECONNRESET)' }
                  };
                  fs.appendFileSync(ledgerPath, JSON.stringify(ev) + '\n', 'utf8');
                }
              } catch {}

              autoWakeDev(d.id, 'act', proj.projectRoot, '[AUTONOMOUS SUPERVISOR RESUMPTION] Network connection was reset (ECONNRESET/WSAECONNABORTED). Resume implementation immediately.');
              break;
            }
          } catch {}
        }
      }
    }
  } catch {}
}

// ── Durable dev-wake outbox replay is now handled by autowake.cjs ───────────
// (project-scoped, authenticated, capability-routed; see drainWakePlane below).

// 3. Project-scoped drain (ONE global worker, exponential backoff, low CPU)
//    + failsafe poll. Replaces the legacy single-project drainDevWakeOutbox().
let awModule = null;
function drainWakePlane() {
  try {
    if (!awModule) awModule = require(path.join(__dirname, 'autowake.cjs'));
    awModule.drainAllProjects();
  } catch {}
}
// Keep the project-agnostic autonomous Lead (session watcher) alive. Throttled
// so the always-on watcher can self-heal it without any external invocation.
const SESSION_SCRIPT = path.join(GLOBAL_DIR, 'lead_watcher_session.cjs');
const SESSION_PID_PATH = path.join(GLOBAL_DIR, 'lead_watcher_session.pid');
let lastSessionCheck = 0;
function ensureSessionWatcher() {
  if (Date.now() - lastSessionCheck < 15000) return;
  lastSessionCheck = Date.now();
  try {
    if (!fs.existsSync(SESSION_SCRIPT)) return;
    let alive = false;
    if (fs.existsSync(SESSION_PID_PATH)) {
      const pid = Number.parseInt(fs.readFileSync(SESSION_PID_PATH, 'utf8').trim(), 10);
      if (pid) { try { process.kill(pid, 0); alive = true; } catch { } }
    }
    if (!alive) {
      // NOTE: we deliberately do NOT write the PID file — the child claims it
      // atomically on startup. Writing it here would defeat the singleton lock.
      const c = spawn(process.execPath, [SESSION_SCRIPT], { detached: true, stdio: 'ignore', windowsHide: true, cwd: GLOBAL_DIR });
      c.unref();
      logOp('warn', 'SESSION_RESPAWN', { pid: c.pid, reason: 'session watcher was down' });
      console.log('[Lead Watcher] Session watcher (autonomous Lead) was down — respawned.');
    }
  } catch { }
}

setInterval(() => {
  checkAllProjects();
  checkClineLogErrors();
  drainWakePlane();
  ensureSessionWatcher();
}, 2000);

// 4. Bidirectional Mutual Waiting & Stall Watchdog across ALL registered projects (checks every 30s)
const lastAlertByKey = new Map();
function canAlert(key, cooldownMs = 120000) {
  const last = lastAlertByKey.get(key) || 0;
  if (Date.now() - last > cooldownMs) {
    lastAlertByKey.set(key, Date.now());
    return true;
  }
  return false;
}

/* ── Autonomous wake guard: raised thresholds + DURABLE cross-process cooldown ─
 *
 * Defect 4 (raised thresholds): a legitimate developer turn routinely runs
 * 5-15 minutes (reading files, running suites, writing code). The original
 * "inactive >= 3 min" + "5 min cooldown" pair therefore re-woke a WORKING
 * developer roughly every 6 minutes — 109 WAKE_DISPATCHED events for DIR-055.
 *
 * Defect 3 (cross-process cooldown): `lastAutoWakeTime` is a module-level `let`,
 * so it only serialises ONE watcher process. lead_watcher_daemon.cjs respawns
 * lead_watcher.cjs on a liveness false-negative, and a restart overlap leaves
 * two processes with independent timers — observed as a double-fire 243 ms
 * apart (02:21:07.344Z / 02:21:07.483Z). The slot below is therefore claimed
 * atomically via an O_EXCL file so the cooldown is GLOBAL, not per-process.
 */
const WAKE_INACTIVE_MINUTES = 10;      // lease live  — patient (a long tool call is normal)
const WAKE_INACTIVE_MINUTES_GONE = 2;  // lease stale — the agent is provably gone
const WAKE_CONTINUE_MINUTES = 2;       // agent DECLARED approved work remains (see --continue)
const AUTO_WAKE_COOLDOWN_MS = 600000;  // was 300000 — see defect 4
const CONTINUE_COOLDOWN_MS = 120000;   // continuation wakes are cheap to honour
const AUTO_WAKE_GUARD_PATH = path.join(GLOBAL_DIR, 'auto_wake_guard.json');

/** Atomically claim the single global auto-wake slot. @returns {boolean} true when claimed. */
function claimAutoWakeSlot(cooldownMs = AUTO_WAKE_COOLDOWN_MS) {
  const stamp = JSON.stringify({ lastWakeAt: new Date().toISOString(), byPid: process.pid, cooldownMs });
  try {
    // O_EXCL is the atomic claim: exactly one process can create this file.
    const fd = fs.openSync(AUTO_WAKE_GUARD_PATH, 'wx');
    fs.writeSync(fd, stamp);
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') return false;
    let last = 0;
    try { last = Date.parse(JSON.parse(fs.readFileSync(AUTO_WAKE_GUARD_PATH, 'utf8')).lastWakeAt || 0); } catch { last = 0; }
    if (Number.isFinite(last) && (Date.now() - last) < cooldownMs) return false; // peer holds it
    try { fs.writeFileSync(AUTO_WAKE_GUARD_PATH, stamp, 'utf8'); return true; } catch { return false; } // stale → take over
  }
}

/**
 * Can the IDE RECEIVE a wake right now? (defect 1 — corrected)
 *
 * IMPORTANT: this answers a DELIVERY question, NOT a progress question.
 * The lease is refreshed by the IDE EXTENSION HOST on a ~10 s timer for as long
 * as the window is open (extension.js `beat()`), so it stays live even when the
 * agent is completely stopped. It must therefore NEVER veto a stall verdict:
 * doing that made CASE 5 unreachable and a stopped developer was never re-woken.
 * It is used ONLY to pick a grace window — a reachable IDE can be woken again, so
 * we may be patient; an unreachable one means the agent is gone, so we escalate
 * fast. PROGRESS (newest STAFF_DEVELOPER ledger event) is the honest stall signal.
 */
function devIsAlive(projectRoot) {
  try {
    const AW = require(path.join(__dirname, 'autowake.cjs'));
    const lease = AW.readLease(projectRoot, 'dev');
    return !!(lease && lease.live);
  } catch { return false; }
}

let lastAutoWakeTime = 0;
function autoWakeDev(directiveId, mode, projectRoot, prompt, cooldownMs = AUTO_WAKE_COOLDOWN_MS) {
  if (Date.now() - lastAutoWakeTime < cooldownMs) {
    return; // in-process cooldown
  }
  if (!claimAutoWakeSlot(cooldownMs)) {
    return; // another watcher process already woke the developer
  }
  lastAutoWakeTime = Date.now();
  try {
    const bridgeCli = path.join(__dirname, 'bridge.cjs');
    const args = [bridgeCli, 'wake', '--directive', directiveId, '--mode', mode, '--projectDir', projectRoot];
    if (prompt) args.push('--prompt', prompt);
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, AI_BRIDGE_ROLE: 'lead' }
    });
    child.unref();
  } catch (e) {}
}

let lastAutoAdvanceTime = 0;
function autoAdvancePipeline(projectRoot) {
  if (Date.now() - lastAutoAdvanceTime < 15000) return;
  lastAutoAdvanceTime = Date.now();
  try {
    const bridgeCli = path.join(__dirname, 'bridge.cjs');
    const child = spawn(process.execPath, [bridgeCli, 'pipeline', 'auto', '--projectDir', projectRoot], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, AI_BRIDGE_ROLE: 'lead' }
    });
    child.unref();
  } catch (e) {}
}
/**
 * Undeclared Lead-coding detector.
 *
 * The Lead must NOT author code on its own initiative. This cannot be *prevented*
 * from the bridge (an agent always has its own file tools), so it is DETECTED:
 * if source files changed while the ball is in the Lead's court and no take-over
 * has been declared, we shout loudly and audit it.
 *
 * Throttled: the git probe is skipped unless >= 120 s have passed, so a 30 s
 * watchdog cadence does not spawn a git process every tick.
 */
let lastLeadCodingScan = 0;
function detectUndeclaredLeadCoding() {
  if (Date.now() - lastLeadCodingScan < 120000) return;
  lastLeadCodingScan = Date.now();
  try {
    const reg = getRegistry();
    for (const proj of reg.projects) {
      const bDir = proj.bridgeDir;
      if (!bDir || !fs.existsSync(bDir)) continue;
      let active = false;
      try { const m = JSON.parse(fs.readFileSync(path.join(bDir, 'lead_takeover.json'), 'utf8')); active = !!(m && m.active); } catch { }
      if (active) continue;                       // lawfully declared → fine

      const dirsDir = path.join(bDir, 'directives');
      if (!fs.existsSync(dirsDir)) continue;
      let leadOwnsBall = false, dId = null;
      for (const f of fs.readdirSync(dirsDir).filter(x => /^DIR-\d+\.json$/.test(x))) {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(dirsDir, f), 'utf8'));
          if (['PLAN_SUBMITTED', 'EVIDENCE_SUBMITTED', 'APPROVED'].includes(d.status)) { leadOwnsBall = true; dId = d.id; }
        } catch { }
      }
      if (!leadOwnsBall) continue;                // ball is the dev's → dev edits are normal

      const st = require('child_process').spawnSync('git', ['status', '--porcelain'], { cwd: proj.projectRoot, encoding: 'utf8', timeout: 6000, windowsHide: true });
      const changed = String(st.stdout || '').split(/\r?\n/).filter(l => l.trim() && !l.includes('.bridge/'));
      if (!changed.length) continue;
      if (!canAlert(`${proj.projectRoot}:undeclared_lead_coding`, 300000)) continue;

      console.log('\n' + '!'.repeat(78));
      console.log('🚨 [POLICY VIOLATION: UNDECLARED LEAD CODING]');
      console.log(`Project   : ${proj.name || path.basename(proj.projectRoot)} (${proj.projectRoot})`);
      console.log(`Directive : ${dId || 'N/A'} — the ball is in the LEAD's court`);
      console.log(`Changed   : ${changed.length} source path(s) with NO declared take-over`);
      console.log(`Policy    : the Lead may author code ONLY for provider-failure (with`);
      console.log(`            ledger evidence) or on explicit user instruction.`);
      console.log(`Action    : bridge lead take-over --reason provider-failure`);
      console.log(`            bridge lead take-over --reason user-requested --note "<instruction>"`);
      console.log('!'.repeat(78) + '\n');
      logOp('error', 'LEAD_CODING_UNDECLARED', { projectRoot: proj.projectRoot, directiveId: dId, changed: changed.slice(0, 10) });
    }
  } catch { }
}

function checkStalls() {
  detectUndeclaredLeadCoding();
  try {
    const reg = getRegistry();
    for (const proj of reg.projects) {
      const bDir = proj.bridgeDir;
      if (!bDir || !fs.existsSync(bDir)) continue;
      const projName = proj.name || path.basename(proj.projectRoot);
      const directivesDir = path.join(bDir, 'directives');
      if (!fs.existsSync(directivesDir)) continue;
      const files = fs.readdirSync(directivesDir).filter(x => /^DIR-\d{3,}\.json$/.test(x));

      // Load and sort directives so only the SINGLE highest priority active directive is evaluated
      const allDirs = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(directivesDir, f), 'utf8')); } catch { return null; }
      }).filter(Boolean);

      const P_ORDER = { P0: 0, P1: 1, P2: 2 };
      const nonTerminal = allDirs
        .filter(d => !['APPROVED_FROZEN', 'CANCELLED'].includes(d.status))
        .sort((a, b) => (P_ORDER[a.priority] ?? 99) - (P_ORDER[b.priority] ?? 99) || (a.id || '').localeCompare(b.id || ''));

      // Target ONLY the single primary directive to prevent multi-wake spam
      const primaryDirs = nonTerminal.slice(0, 1);

      for (const d of primaryDirs) {
        try {
          const ledgerPath = path.join(bDir, 'ledger.jsonl');
          const elapsedMinSinceUpdate = Math.round((Date.now() - new Date(d.updatedAt || d.createdAt).getTime()) / 60000);

          // CASE 1: DEVELOPER IS WAITING FOR LEAD - Plan Review
          if (d.status === 'PLAN_SUBMITTED') {
            if (elapsedMinSinceUpdate >= 1 && canAlert(`${proj.projectRoot}:${d.id}:auto_advance_plan`, 60000)) {
              console.log('\n' + '!'.repeat(78));
              console.log(`🔔 [MUTUAL WAIT WATCHDOG: AUTONOMOUSLY REVIEWING & ADVANCING PLAN...]`);
              console.log(`Project   : ${projName} (${proj.projectRoot})`);
              console.log(`Directive : ${d.id} (${d.title})`);
              console.log(`Waiting   : Developer submitted plan ${elapsedMinSinceUpdate}m ago; auto-advancing to ACT mode`);
              console.log(`Action    : Auto-advancing via bridge pipeline auto...`);
              console.log('!'.repeat(78) + '\n');
              autoAdvancePipeline(proj.projectRoot);
            }
          }

          // CASE 2: DEVELOPER IS WAITING FOR LEAD - Gatekeeper Evidence Certification or Freeze
          if (d.status === 'EVIDENCE_SUBMITTED' || d.status === 'APPROVED') {
            if (elapsedMinSinceUpdate >= 1 && canAlert(`${proj.projectRoot}:${d.id}:auto_advance`, 60000)) {
              console.log('\n' + '!'.repeat(78));
              console.log(`🔔 [MUTUAL WAIT WATCHDOG: AUTONOMOUSLY ADVANCING PIPELINE...]`);
              console.log(`Project   : ${projName} (${proj.projectRoot})`);
              console.log(`Directive : ${d.id} (${d.title})`);
              console.log(`Status    : ${d.status} -> Auto-advancing via bridge pipeline auto`);
              console.log('!'.repeat(78) + '\n');
              autoAdvancePipeline(proj.projectRoot);
            }
          }

          // CASE 3: LEAD IS WAITING FOR DEVELOPER - Directive Issued, Needs Plan
          if (d.status === 'ISSUED') {
            if (elapsedMinSinceUpdate >= 5 && canAlert(`${proj.projectRoot}:${d.id}:wait_dev_plan`, 300000)) {
              console.log('\n' + '!'.repeat(78));
              console.log(`⚠️ [MUTUAL WAIT WATCHDOG: LEAD WAITING FOR DEVELOPER PLAN]`);
              console.log(`Project   : ${projName} (${proj.projectRoot})`);
              console.log(`Directive : ${d.id} (${d.title})`);
              console.log(`Waiting   : Directive issued ${elapsedMinSinceUpdate}m ago; developer has not submitted plan`);
              console.log(`Action    : Auto-waking developer in PLAN mode...`);
              console.log('!'.repeat(78) + '\n');
              autoWakeDev(d.id, 'plan', proj.projectRoot);
            }
          }

          // CASE 4: LEAD IS WAITING FOR DEVELOPER - Changes Requested.
          //
          // CHANGES_REQUESTED is AMBIGUOUS on its own — it can mean "revise the
          // PLAN" or "revise the EVIDENCE". Waking in PLAN mode for an evidence
          // rejection is exactly as wrong as waking in ACT mode for a plan
          // rejection, so the recorded revision target decides the mode.
          if (d.status === 'CHANGES_REQUESTED') {
            if (elapsedMinSinceUpdate >= 3 && canAlert(`${proj.projectRoot}:${d.id}:wait_dev_revision`, 180000)) {
              const needsEvidence = d.revisionTarget === 'evidence';
              const revisionMode = needsEvidence ? 'act' : 'plan';
              console.log('\n' + '!'.repeat(78));
              console.log(`⚠️ [MUTUAL WAIT WATCHDOG: LEAD WAITING FOR DEVELOPER ${needsEvidence ? 'EVIDENCE' : 'PLAN'} REVISION]`);
              console.log(`Project   : ${projName} (${proj.projectRoot})`);
              console.log(`Directive : ${d.id} (${d.title})`);
              console.log(`Waiting   : Changes requested ${elapsedMinSinceUpdate}m ago; developer has not revised the ${needsEvidence ? 'evidence' : 'plan'}`);
              console.log(`Action    : Auto-waking developer in ${revisionMode.toUpperCase()} mode...`);
              console.log('!'.repeat(78) + '\n');
              autoWakeDev(d.id, revisionMode, proj.projectRoot);
            }
          }

          // CASE 5: LEAD IS WAITING FOR DEVELOPER - Active Implementation Heartbeat / Evidence
          if (d.status === 'IN_PROGRESS') {
            // LIVENESS vs PROGRESS are DIFFERENT questions. The lease only says
            // whether the IDE can RECEIVE a wake (see devIsAlive) — it is live for
            // as long as the window is open, so it must never veto a stall. The
            // honest stall signal is PROGRESS: the newest ledger event authored by
            // STAFF_DEVELOPER for this directive. A reachable IDE just buys
            // patience (a long tool call is normal); an unreachable one escalates.
            const devAlive = devIsAlive(proj.projectRoot);
            // CONTINUATION (RCA fix): the developer explicitly declared that APPROVED
            // work remains (`bridge dev heartbeat --continue`). Waiting the full stall
            // threshold for a directive we KNOW is unfinished is pure dead time, so a
            // declared continuation gets its own short grace and its own cooldown.
            const wantsContinue = d.continuationPending === true;
            const graceMinutes = wantsContinue
              ? WAKE_CONTINUE_MINUTES
              : (devAlive ? WAKE_INACTIVE_MINUTES : WAKE_INACTIVE_MINUTES_GONE);
            let lastDevActivity = new Date(d.updatedAt || d.createdAt).getTime();
            if (fs.existsSync(ledgerPath)) {
              const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean);
              for (let i = lines.length - 1; i >= 0; i--) {
                try {
                  const ev = JSON.parse(lines[i]);
                  if (ev.sender === 'STAFF_DEVELOPER' && (ev.payload?.directiveId === d.id || !ev.payload?.directiveId)) {
                    lastDevActivity = new Date(ev.timestamp).getTime();
                    break;
                  }
                } catch {}
              }
            }
            const inactiveMin = Math.round((Date.now() - lastDevActivity) / 60000);
            if (inactiveMin >= graceMinutes && canAlert(`${proj.projectRoot}:${d.id}:wait_dev_act`, graceMinutes * 60000)) {
              console.log('\n' + '!'.repeat(78));
              console.log(`⚠️ [MUTUAL WAIT WATCHDOG: DEVELOPER INACTIVE FOR ${inactiveMin}m IN ACT MODE]`);
              console.log(`Project   : ${projName} (${proj.projectRoot})`);
              console.log(`Directive : ${d.id} (${d.title})`);
              console.log(`Waiting   : Developer has been inactive for ${inactiveMin} minutes (grace ${graceMinutes}m, IDE ${devAlive ? 'reachable' : 'unreachable'}${wantsContinue ? ', CONTINUATION declared' : ''})`);
              console.log(`Action    : Auto-waking developer in ACT mode...`);
              console.log('!'.repeat(78) + '\n');
              autoWakeDev(d.id, 'act', proj.projectRoot, undefined, wantsContinue ? CONTINUE_COOLDOWN_MS : AUTO_WAKE_COOLDOWN_MS);
            }
          }
        } catch {}
      }

      // CASE 6: DEVELOPER IS BLOCKED WAITING FOR LEAD - Unanswered Questions
      const ledgerPath = path.join(bDir, 'ledger.jsonl');
      if (fs.existsSync(ledgerPath)) {
        try {
          const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            try {
              const ev = JSON.parse(line);
              if (ev.type === 'QUESTION_ASKED' && ev.status === 'OPEN') {
                const askedMin = Math.round((Date.now() - new Date(ev.timestamp).getTime()) / 60000);
                if (askedMin >= 2 && canAlert(`${proj.projectRoot}:${ev.id}:wait_lead_answer`, 120000)) {
                  console.log('\n' + '!'.repeat(78));
                  console.log(`🔔 [MUTUAL WAIT WATCHDOG: DEVELOPER BLOCKED WAITING FOR LEAD ANSWER]`);
                  console.log(`Project   : ${projName} (${proj.projectRoot})`);
                  console.log(`Message ID: ${ev.id}`);
                  console.log(`Question  : ${ev.title}`);
                  console.log(`Waiting   : Developer has been blocked for ${askedMin} minutes`);
                  console.log(`Action    : Run 'bridge lead reply --message-id ${ev.id} --projectDir "${proj.projectRoot}" --message "<answer>"'`);
                  console.log('!'.repeat(78) + '\n');
                }
              }
            } catch {}
          }
        } catch {}
      }
    }
  } catch {}
}
setInterval(checkStalls, 30000);

// Initial check
checkAllProjects();
console.log(`[Lead Watcher] Universal daemon active. Bidirectional bridge listening on UDP :${UDP_PORT} & global event queue across all projects.`);
logOp('info', 'WATCHER_START', { pid: process.pid, udpPort: UDP_PORT, projects: getRegistry().projects.length });
// Change-control: report (but never block) integrity drift so it is always visible.
try {
  const st = AWL.freezeStatus();
  if (st.locked && !st.intact) logOp('error', 'INTEGRITY_VIOLATION', { source: 'daemon', drift: st.drift, blocked: st.blocked });
} catch { }
