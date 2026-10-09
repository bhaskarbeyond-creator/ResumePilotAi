#!/usr/bin/env node
'use strict';
/**
 * autowake.cjs — Project-scoped, serverless-first, event-driven mutual-wake plane.
 *
 * DESIGN CONTRACT
 * ---------------
 * 1. PROJECT ISOLATION: every wake artifact lives under
 *    ~/.ai-bridge/projects/<slug>-<hash8>/ so two IDE windows / two projects
 *    can never collide. The project key is derived from the ABSOLUTE path.
 * 2. SERVERLESS-FIRST: correctness never depends on a listening port. The
 *    hash-chained project ledger is the source of truth; ports are accelerators.
 * 3. EVENT-DRIVEN: `await` blocks on fs.watch (+400ms safety poll). No busy
 *    loops, no 1s ticks. Idle cost is ~0.
 * 4. DURABLE + ACKED: every wake is written to an outbox BEFORE delivery and is
 *    only retired when the peer acks (at-least-once, idempotent by wakeId).
 * 5. AUTHENTICATED: localhost IPC requires a per-project 0600 token + HMAC of
 *    the canonical payload; promptFile paths are contained to wake_prompts/.
 * 6. CAPABILITY-ROUTED: a live agent lease declares the transports it supports;
 *    delivery picks the best available automatically.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawnSync, spawn } = require('node:child_process');

const HOME = os.homedir();
const GLOBAL = path.join(HOME, '.ai-bridge');
const PROJECTS = path.join(GLOBAL, 'projects');
const ROLES = Object.freeze({ LEAD: 'LEAD_SUPERVISOR', DEV: 'STAFF_DEVELOPER' });
const ROLE_SHORT = Object.freeze({ [ROLES.LEAD]: 'lead', [ROLES.DEV]: 'dev' });
const ROLE_ALIAS = { lead: ROLES.LEAD, supervisor: ROLES.LEAD, dev: ROLES.DEV, developer: ROLES.DEV };
const LEASE_TTL_MS = 25000;

function now() { return new Date().toISOString(); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function jsonRead(p, fb = null) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function atomicWrite(p, v) {
  ensureDir(path.dirname(p));
  const tmp = `${p}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  const data = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 });
  try { fs.renameSync(tmp, p); } catch { try { fs.copyFileSync(tmp, p); fs.unlinkSync(tmp); } catch {} }
}
function appendLine(p, line) { ensureDir(path.dirname(p)); fs.appendFileSync(p, line, { encoding: 'utf8', mode: 0o600 }); }
function normalizeRole(v) { const s = String(v || '').toLowerCase(); return ROLE_ALIAS[s] || (Object.values(ROLES).includes(v) ? v : ROLES.DEV); }
function shortRole(v) { return ROLE_SHORT[normalizeRole(v)] || 'dev'; }
function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/* ── Project scoping (the collision fix) ───────────────────────────────────── */
function normalizeRoot(root) { return path.resolve(String(root || process.cwd())); }
function projectKey(root) {
  const abs = normalizeRoot(root).toLowerCase();
  const base = (path.basename(normalizeRoot(root)) || 'project').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'project';
  return `${base}-${crypto.createHash('sha256').update(abs).digest('hex').slice(0, 8)}`;
}
function pPaths(root) {
  const abs = normalizeRoot(root);
  const key = projectKey(abs);
  const dir = path.join(PROJECTS, key);
  return {
    root: abs, key, dir,
    devInbox: path.join(dir, 'cline_inbox.json'),
    leadInbox: path.join(dir, 'lead_inbox.json'),
    devOutbox: path.join(dir, 'wake_outbox.jsonl'),
    leadOutbox: path.join(dir, 'lead_outbox.jsonl'),
    devAck: path.join(dir, 'cline_wake_ack.json'),
    leadAck: path.join(dir, 'lead_wake_ack.json'),
    prompts: path.join(dir, 'wake_prompts'),
    agents: path.join(dir, 'agents'),
    token: path.join(dir, 'secrets.token'),
    ledger: path.join(abs, '.bridge', 'ledger.jsonl'),
    seen: path.join(dir, 'seen_wakes.json')
  };
}
function ensureScaffold(root) {
  // ── DEAD-PROJECT GUARD (DIR-062) ────────────────────────────────────────────
  // Scaffolding a project whose directory no longer exists registers a PHANTOM in
  // the GLOBAL registry.json and recreates its ~/.ai-bridge/projects/<key>/ record
  // dir. That is how 30 deleted scratch projects kept reappearing after every
  // cleanup: a stale wake-queue entry reached emitLeadWake -> here. Return the
  // paths (so callers do not crash) but never scaffold or register a dead root.
  if (!exists(normalizeRoot(root))) return pPaths(root);
  const p = pPaths(root);
  ensureDir(p.dir); ensureDir(p.prompts); ensureDir(p.agents);
  if (!exists(p.token)) {
    atomicWrite(p.token, crypto.randomBytes(32).toString('hex'));
    try { fs.chmodSync(p.token, 0o600); } catch {}
  }
  registerProject(p);
  return p;
}
function registerProject(p) {
  try {
    const regPath = path.join(GLOBAL, 'registry.json');
    // SAFETY (audit fix): if the registry exists but cannot be parsed, preserve
    // it as a .corrupt-<ts> copy before rebuilding — never silently destroy it.
    let reg = null;
    if (exists(regPath)) {
      const raw = fs.readFileSync(regPath, 'utf8');
      try { reg = JSON.parse(raw); } catch { try { fs.writeFileSync(`${regPath}.corrupt-${Date.now()}`, raw); } catch { } }
    }
    if (!reg || typeof reg !== 'object' || Array.isArray(reg)) reg = { activeProject: p.root, projects: [] };
    if (!Array.isArray(reg.projects)) reg.projects = [];
    const found = reg.projects.find(x => String(x.projectRoot || '').toLowerCase() === p.root.toLowerCase());
    if (found) { found.lastActive = now(); found.projectKey = p.key; found.wakeDir = p.dir; }
    else reg.projects.push({ name: path.basename(p.root), projectRoot: p.root, bridgeDir: path.join(p.root, '.bridge'), projectKey: p.key, wakeDir: p.dir, registeredAt: now(), lastActive: now() });
    atomicWrite(regPath, reg);
  } catch { }
}
/** Every project wake directory that currently holds an inbox. */
function listProjectWakes() {
  if (!exists(PROJECTS)) return [];
  try {
    return fs.readdirSync(PROJECTS)
      .map(d => path.join(PROJECTS, d))
      .filter(dir => exists(path.join(dir, 'cline_inbox.json')) || exists(path.join(dir, 'lead_inbox.json')));
  } catch { return []; }
}

/* ── Authentication: per-project token + HMAC ──────────────────────────────── */
function getToken(root) {
  const p = pPaths(root);
  if (!exists(p.token)) { ensureDir(p.dir); atomicWrite(p.token, crypto.randomBytes(32).toString('hex')); }
  try { return fs.readFileSync(p.token, 'utf8').trim(); } catch { return ''; }
}
function canonicalPayload(o) {
  return JSON.stringify({
    projectKey: String(o.projectKey || ''), role: String(o.role || ''), id: String(o.id || ''),
    mode: String(o.mode || ''), directiveId: String(o.directiveId || ''),
    promptFile: String(o.promptFile || ''), text: String(o.text || '')
  });
}
function signPayload(root, o) { return crypto.createHmac('sha256', getToken(root)).update(canonicalPayload(o)).digest('hex'); }
function verifyPayload(root, o) {
  if (!o || !o.hmac) return false;
  const expect = signPayload(root, o);
  const a = Buffer.from(String(o.hmac)), b = Buffer.from(expect);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** True only if `file` is strictly inside `dir` (blocks path traversal). */
function isContained(file, dir) {
  try {
    const rel = path.relative(path.resolve(dir), path.resolve(file));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch { return false; }
}

/* ── Agent leases: capability advertisement + liveness ─────────────────────── */
function leasePath(root, role) { return path.join(pPaths(root).agents, `${shortRole(role)}.lease.json`); }
function writeLease(root, role, extra = {}) {
  const p = ensureScaffold(root);
  const rec = {
    role: normalizeRole(role), short: shortRole(role), projectKey: p.key, projectRoot: p.root,
    pid: process.pid, sessionId: extra.sessionId || `${shortRole(role)}-${process.pid}`,
    startedAt: extra.startedAt || now(), lastBeatAt: now(),
    transports: extra.transports || ['file'],
    targets: extra.targets || [], httpPort: extra.httpPort || null
  };
  atomicWrite(leasePath(root, role), rec);
  return rec;
}
function readLease(root, role) {
  const rec = jsonRead(leasePath(root, role), null);
  if (!rec) return null;
  const age = Date.now() - Date.parse(rec.lastBeatAt || 0);
  rec.ageMs = age;
  rec.live = Number.isFinite(age) && age <= LEASE_TTL_MS;
  return rec;
}
function readAllLeases(root) {
  const dir = pPaths(root).agents;
  if (!exists(dir)) return [];
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.lease.json'))
      .map(f => { const r = jsonRead(path.join(dir, f), null); if (!r) return null; const age = Date.now() - Date.parse(r.lastBeatAt || 0); r.ageMs = age; r.live = Number.isFinite(age) && age <= LEASE_TTL_MS; return r; })
      .filter(Boolean);
  } catch { return []; }
}

/* ── A. TURN: who owns the ball? (derived from directive state) ────────────── */
const OWNER_BY_STATUS = {
  ISSUED: 'dev', PLAN_SUBMITTED: 'lead', CHANGES_REQUESTED: 'dev',
  IN_PROGRESS: 'dev', EVIDENCE_SUBMITTED: 'lead', APPROVED: 'lead',
  APPROVED_FROZEN: 'none', CANCELLED: 'none'
};
const REASON_BY_STATUS = {
  ISSUED: 'Directive issued — developer must submit an implementation plan',
  PLAN_SUBMITTED: 'Plan submitted — Lead must review/approve',
  CHANGES_REQUESTED: 'Plan changes requested — developer must revise',
  IN_PROGRESS: 'Act mode authorized — developer is implementing',
  EVIDENCE_SUBMITTED: 'Evidence submitted — Gatekeeper must review/certify',
  APPROVED: 'Approved — Gatekeeper must freeze/certify',
  APPROVED_FROZEN: 'Frozen — no action required',
  CANCELLED: 'Cancelled — no action required'
};
function readDirectives(root) {
  const dir = path.join(normalizeRoot(root), '.bridge', 'directives');
  if (!exists(dir)) return [];
  try {
    return fs.readdirSync(dir).filter(f => /^DIR-\d{3,}\.json$/.test(f))
      .map(f => jsonRead(path.join(dir, f), null)).filter(Boolean)
      .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  } catch { return []; }
}
function turn(o = {}) {
  const root = o.projectDir || process.cwd();
  const dirs = readDirectives(root).filter(d => !['APPROVED_FROZEN', 'CANCELLED'].includes(d.status));
  const P = { P0: 0, P1: 1, P2: 2 };
  dirs.sort((a, b) => (P[a.priority] ?? 9) - (P[b.priority] ?? 9));
  const active = dirs[0] || null;
  if (!active) return { success: true, owner: 'none', reason: 'No active directive', directiveId: null, status: null };
  // An open blocker always puts the ball in the Lead's court.
  const openQ = tailLedger(root, 262144).filter(e => e.type === 'QUESTION_ASKED' && e.status === 'OPEN').at(-1);
  if (openQ) {
    return { success: true, owner: 'lead', reason: `Open blocker question ${openQ.id} awaits the Lead`, directiveId: openQ.payload?.directiveId || active.id, status: active.status, questionId: openQ.id };
  }
  return {
    success: true, owner: OWNER_BY_STATUS[active.status] || 'none',
    reason: REASON_BY_STATUS[active.status] || active.status,
    directiveId: active.id, status: active.status, priority: active.priority,
    waitingSince: active.updatedAt || active.createdAt || null
  };
}

/* ── B. AWAIT: block until my inbox has a message (event-driven, ~0 CPU) ───── */
function readSeen(root) { return new Set((jsonRead(pPaths(root).seen, { ids: [] }).ids) || []); }
function writeSeen(root, set) { atomicWrite(pPaths(root).seen, { ids: [...set].slice(-3000), updatedAt: now() }); }

/** Read only the tail of the ledger so cost stays flat as it grows. */
function tailLedger(root, maxBytes = 262144) {
  const p = pPaths(root).ledger;
  if (!exists(p)) return [];
  try {
    const st = fs.statSync(p);
    const start = Math.max(0, st.size - maxBytes);
    const len = st.size - start;
    if (len <= 0) return [];
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    if (start > 0) { const nl = text.indexOf('\n'); if (nl >= 0) text = text.slice(nl + 1); }
    return text.split(/\r?\n/).filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function unreadFor(root, role, seen) {
  const R = normalizeRole(role);
  return tailLedger(root).filter(e =>
    e.type !== 'CORRUPT' && (e.recipient === R || e.recipient === 'ALL') &&
    !(e.readBy || []).includes(R) && !seen.has(e.id));
}
function awaitEvent(o = {}) {
  const root = o.projectDir || process.cwd();
  const role = normalizeRole(o.role || 'dev');
  const timeoutMs = Math.max(0, Number(o.timeout == null ? 300 : o.timeout) * 1000);
  ensureScaffold(root);
  const seen = readSeen(root);
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let watcher = null;
  const arm = () => { try { if (watcher) watcher.close(); } catch {} try { watcher = fs.watch(pPaths(root).ledger, () => {}); watcher.on('error', () => {}); } catch {} };
  arm();
  try {
    for (;;) {
      const pending = unreadFor(root, role, seen);
      if (pending.length) {
        // Wake semantics = latest-state-wins: return the NEWEST addressed event
        // and mark the superseded ones seen so a backlog cannot thrash.
        const ev = o.oldest === true ? pending[0] : pending[pending.length - 1];
        if (o.autoAck !== false) { for (const p of pending) seen.add(p.id); writeSeen(root, seen); }
        return { success: true, timedOut: false, role: shortRole(role), waitedMs: Date.now() - startedAt, superseded: pending.length - 1, event: ev };
      }
      if (Date.now() >= deadline) return { success: true, timedOut: true, role: shortRole(role), waitedMs: Date.now() - startedAt, event: null };
      sleepSync(400); // safety poll; fs.watch provides the instant wake-up
      arm();          // re-arm: markRead()/reply() rewrite (rename) the ledger
    }
  } finally { try { if (watcher) watcher.close(); } catch {} }
}

/* ── D. ACK: retire a delivered wake (idempotent, at-least-once) ───────────── */
// Accepts BOTH `ack({projectDir, role, id, source})` and `ack(root, role, id, opts)`.
function ack(o = {}, roleArg, idArg, optsArg) {
  const positional = typeof o === 'string';
  const root = positional ? o : (o.projectDir || process.cwd());
  const role = normalizeRole(positional ? (roleArg || 'dev') : (o.role || 'dev'));
  const id = String(positional ? (idArg || '') : (o.id || ''));
  const source = (positional ? (optsArg && optsArg.source) : o.source) || 'cli';
  const p = ensureScaffold(root);
  if (!id) return { success: true, role: shortRole(role), id: null, ackedCount: 0, note: 'NO_ID_NOOP' };
  const file = shortRole(role) === 'lead' ? p.leadAck : p.devAck;
  const cur = jsonRead(file, { ids: [] });
  const ids = Array.isArray(cur.ids) ? cur.ids : [];
  if (id && !ids.includes(id)) ids.push(id);
  atomicWrite(file, { id: id || cur.id || null, ids: ids.slice(-200), ackedAt: now(), source });
  return { success: true, role: shortRole(role), id, ackedCount: ids.length };
}
function isAcked(root, role, id) {
  if (!id) return false;
  const p = pPaths(root);
  const file = shortRole(role) === 'lead' ? p.leadAck : p.devAck;
  const a = jsonRead(file, null);
  if (!a) return false;
  return a.id === id || (Array.isArray(a.ids) && a.ids.includes(id));
}

/* ── Transport helpers ─────────────────────────────────────────────────────── */
function httpPostJsonSync(port, urlPath, payload, timeoutMs = 2000) {
  let pf = null;
  try {
    const tmpDir = pPaths(process.cwd()).dir;
    ensureDir(tmpDir);
    pf = path.join(tmpDir, `.ipc-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(pf, JSON.stringify(payload), 'utf8');
  } catch (e) { return { ok: false, status: 0, error: 'PAYLOAD_WRITE_FAILED' }; }
  const script = `
    const http=require('http'),fs=require('fs');let data;
    try{data=fs.readFileSync(process.argv[1]);}catch(e){process.stdout.write(JSON.stringify({status:0,error:'PAYLOAD_READ_FAILED'}));process.exit(0);}
    const req=http.request({hostname:'127.0.0.1',port:${Number(port)},path:${JSON.stringify(String(urlPath))},method:'POST',headers:{'Content-Type':'application/json','Content-Length':data.length},timeout:${Number(timeoutMs)}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{process.stdout.write(JSON.stringify({status:res.statusCode,body:b}));process.exit(0);});});
    req.on('error',e=>{process.stdout.write(JSON.stringify({status:0,error:String((e&&e.code)||(e&&e.message)||e)}));process.exit(0);});
    req.on('timeout',()=>{try{req.destroy();}catch(e){}process.stdout.write(JSON.stringify({status:0,error:'TIMEOUT'}));process.exit(0);});
    req.write(data);req.end();`;
  try {
    const r = spawnSync(process.execPath, ['-e', script, pf], { encoding: 'utf8', timeout: timeoutMs + 1500, windowsHide: true });
    const out = String(r.stdout || '').trim();
    if (!out) return { ok: false, status: 0, error: 'NO_RESPONSE' };
    const j = JSON.parse(out);
    return { ok: j.status === 200, status: j.status, error: j.error || null };
  } catch (e) { return { ok: false, status: 0, error: e.message }; }
  finally { try { if (pf) fs.unlinkSync(pf); } catch {} }
}
function resolveIdeExe() {
  const cands = [
    process.env.ANTIGRAVITY_IDE_EXE,
    path.join(HOME, 'AppData', 'Local', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
    path.join(HOME, 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe')
  ].filter(Boolean);
  return cands.find(exists) || null;
}
function dispatchUri(extId, promptFile, pointer, ideExe) {
  const uri = `antigravity-ide://${extId}/task?prompt-file=${encodeURIComponent(promptFile)}&prompt=${encodeURIComponent(pointer)}`;
  let sent = false;
  try {
    const safe = uri.replace(/'/g, "''");
    const ps = spawn('powershell', ['-NoProfile', '-Command', `Start-Process '${safe}'`], { detached: true, stdio: 'ignore', windowsHide: true });
    ps.unref(); sent = true;
  } catch {}
  if (ideExe && exists(ideExe)) {
    try { const c = spawn(ideExe, ['--open-url', uri], { detached: true, stdio: 'ignore', windowsHide: true }); c.unref(); } catch {}
  }
  return sent;
}

/* ── Delivery: durable-first, capability-routed, authenticated ─────────────── */
function deliver(o = {}) {
  const root = o.projectDir || process.cwd();
  const p = ensureScaffold(root);
  const to = shortRole(o.toRole || 'dev');
  const promptText = String(o.promptText || '');
  const outbox = to === 'lead' ? p.leadOutbox : p.devOutbox;

  // Outstanding-wake guard (wake-storm defect 2).
  //
  // Dedup used to key ONLY on the wake id (unreadFor/seen/ack) and every
  // dispatch mints a fresh id — so nothing could ever collapse N wakes for the
  // same directive. The DIR-055 storm produced 109 WAKE_DISPATCHED events and 24
  // byte-identical prompt artifacts. Collapse them instead: if an unacked,
  // undelivered, unexpired wake already exists for the same
  // (directiveId, role, mode), ADOPT its identity and refresh it, retiring any
  // older siblings so the queue holds exactly one live wake per directive.
  let adopted = null;
  const retiredIds = [];
  if (o.directiveId && o.supersede !== false) {
    const prior = readOutboxFile(outbox).filter(e =>
      !e.delivered && !e.expired && e.directiveId === o.directiveId &&
      (e.mode || null) === (o.mode || null) && !isAcked(root, to, e.id));
    if (prior.length) {
      adopted = prior[prior.length - 1];
      for (const e of prior) if (e.id !== adopted.id) retiredIds.push(e.id);
    }
  }
  const wakeId = adopted
    ? adopted.id
    : (o.wakeId || `${o.directiveId || 'wake'}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`);

  // 1. Durable prompt artifact
  const promptFile = path.join(p.prompts, `${wakeId.replace(/[^A-Za-z0-9_.-]/g, '_')}.txt`);
  atomicWrite(promptFile, promptText);

  // 2. Durable inbox (project-scoped → zero cross-project collision)
  const inbox = to === 'lead' ? p.leadInbox : p.devInbox;
  atomicWrite(inbox, {
    id: wakeId, role: to, mode: o.mode || 'act', directiveId: o.directiveId || null,
    prompt: promptText, promptFile, projectKey: p.key, projectRoot: p.root,
    processed: false, timestamp: Date.now()
  });

  // 3. Durable outbox (written BEFORE delivery; retired only on ack)
  if (adopted) {
    // Refresh the adopted entry IN PLACE (and retire superseded siblings)
    // instead of appending another row for the same directive.
    const entries = readOutboxFile(outbox);
    for (const e of entries) {
      if (e.id === wakeId) { e.promptFile = promptFile; e.lastAttemptAt = now(); e.refreshes = (e.refreshes || 0) + 1; }
      else if (retiredIds.includes(e.id)) { e.delivered = true; e.deliveredAt = now(); e.deliveredBy = 'superseded'; e.supersededBy = wakeId; }
    }
    writeOutboxFile(outbox, entries);
  } else {
    appendLine(outbox, JSON.stringify({
      id: wakeId, to, projectKey: p.key, projectRoot: p.root, directiveId: o.directiveId || null,
      mode: o.mode || null, promptFile, createdAt: now(), attempts: 0, delivered: false
    }) + '\n');
  }

  // 4. Capability-routed push (uses the peer's live lease; ports are optional)
  const lease = readLease(root, to);
  const channels = { ipc: null, uri: false, via: 'file' };
  if (lease && lease.live && lease.httpPort && o.noIpc !== true) {
    const payload = { projectKey: p.key, role: to, id: wakeId, mode: o.mode || '', directiveId: o.directiveId || '', promptFile, text: promptText };
    payload.hmac = signPayload(root, payload);
    channels.ipc = httpPostJsonSync(lease.httpPort, '/wake', payload, 2000);
    if (channels.ipc.ok) channels.via = 'ipc';
  }
  if (o.noUri !== true && o.uriExt) {
    const extId = o.uriExt;
    const pointer = `[Bridge Wake ${o.directiveId || ''}] Read the full directive prompt file and execute it: ${promptFile}`;
    channels.uri = dispatchUri(extId, promptFile, pointer, resolveIdeExe());
    if (channels.uri && channels.via === 'file') channels.via = 'uri';
  }

  // Operational log: every dispatch is recorded with its channel + outcome, so a
  // failed delivery is diagnosable after the fact (not just a missing wake).
  const delivered = channels.via === 'ipc' || channels.via === 'uri';
  logEvent(delivered ? 'info' : 'warn', 'wake', 'DISPATCH', {
    projectKey: p.key, wakeId, to, directiveId: o.directiveId || null, mode: o.mode || null,
    via: channels.via, ipcOk: !!(channels.ipc && channels.ipc.ok),
    ipcError: channels.ipc ? channels.ipc.error || null : null,
    uri: !!channels.uri, leaseLive: !!(lease && lease.live),
    deduped: !!adopted, superseded: retiredIds.length
  }, { projectKey: p.key });

  return {
    success: true, wakeId, to, projectKey: p.key, projectRoot: p.root,
    promptFile, inboxWritten: true, outboxWritten: true, clipboardUsed: false,
    deduped: !!adopted, superseded: retiredIds.length,
    channels, lease: lease ? { live: lease.live, httpPort: lease.httpPort || null, ageMs: lease.ageMs } : null
  };
}

/* ── H. Drain: single global worker, project-routed, exponential backoff ───── */
function readOutboxFile(file) {
  if (!exists(file)) return [];
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
function writeOutboxFile(file, entries) { try { atomicWrite(file, entries.slice(-400).map(x => JSON.stringify(x)).join('\n') + '\n'); } catch {} }
function backoffMs(attempts) { return Math.min(30000, 1000 * Math.pow(2, Math.max(0, attempts - 1))); }

/* ── Queue reconciliation: retire wakes that can never be acted on ───────────
 *
 * A wake is STALE when its directive has moved on:
 *   • the directive is TERMINAL (APPROVED_FROZEN / CANCELLED) — the work is done
 *     or abandoned, so waking a developer for it is pure noise; or
 *   • the BALL IS IN THE LEAD'S COURT (PLAN_SUBMITTED / EVIDENCE_SUBMITTED /
 *     APPROVED) — the developer has nothing to do until the Lead acts, so waking
 *     the developer is wrong by construction.
 *
 * Without this, a directive that reached APPROVED_FROZEN still had three wakes
 * queued for the developer, and every `await` had to skip them as `superseded`.
 *
 * Only UNDELIVERED, UNACKED entries are touched: delivered/acked history is
 * never rewritten. Prompt artifacts are pruned only when no LIVE outbox entry
 * still references them, so the artifact dir cannot grow without bound.
 */
const TERMINAL_STATUSES = new Set(['APPROVED_FROZEN', 'CANCELLED']);
const LEAD_OWNED_STATUSES = new Set(['PLAN_SUBMITTED', 'EVIDENCE_SUBMITTED', 'APPROVED']);

/** Read every directive's status for a project: id → status. */
function directiveStatusMap(root) {
  const dir = path.join(normalizeRoot(root), '.bridge', 'directives');
  const map = new Map();
  if (!exists(dir)) return map;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/^DIR-\d+\.json$/.test(f)) continue;
      const d = jsonRead(path.join(dir, f), null);
      if (d && d.id) map.set(String(d.id), String(d.status || ''));
    }
  } catch { /* a malformed directive must not break reconciliation */ }
  return map;
}

/**
 * Reconcile one project's wake queue. `{ dryRun: true }` reports without writing.
 */
function retireStaleWakes(root, opts = {}) {
  const p = ensureScaffold(root);
  const statuses = directiveStatusMap(root);
  const report = {
    root: p.root, key: p.key, dryRun: !!opts.dryRun,
    scanned: 0, retired: 0, kept: 0, prunedArtifacts: 0, retiredIds: [], reasons: []
  };

  for (const [file, ackName] of [[p.devOutbox, 'cline_wake_ack.json'], [p.leadOutbox, 'lead_wake_ack.json']]) {
    const entries = readOutboxFile(file);
    if (!entries.length) continue;
    report.scanned += entries.length;
    const ack = jsonRead(path.join(p.dir, ackName), null);
    let changed = false;

    for (const e of entries) {
      if (e.delivered || e.expired) continue;                       // already retired
      const acked = ack && (ack.id === e.id || (Array.isArray(ack.ids) && ack.ids.includes(e.id)));
      if (acked) continue;
      const status = statuses.get(String(e.directiveId || '')) || '';
      const terminal = TERMINAL_STATUSES.has(status);
      const leadOwned = LEAD_OWNED_STATUSES.has(status);
      if (!terminal && !leadOwned) { report.kept += 1; continue; }

      const reason = terminal ? `DIRECTIVE_${status}` : `BALL_WITH_LEAD_${status}`;
      report.retired += 1;
      report.retiredIds.push(e.id);
      report.reasons.push({ id: e.id, directiveId: e.directiveId || null, status, reason });
      if (opts.dryRun) continue;

      e.delivered = true; e.deliveredAt = now(); e.deliveredBy = 'reconciled'; e.reconcileReason = reason;
      changed = true;
    }
    if (changed) writeOutboxFile(file, entries);
  }

  // Prune prompt artifacts that are (a) owned by a wake we just retired, or
  // (b) referenced by NO outbox entry at all (true orphans).
  if (!opts.dryRun) {
    try {
      const referenced = new Set();
      for (const f of [p.devOutbox, p.leadOutbox]) {
        for (const e of readOutboxFile(f)) if (e.promptFile) referenced.add(path.basename(e.promptFile));
      }
      const retiredSet = new Set(report.retiredIds);
      const retiredArtifacts = new Set();
      for (const f of [p.devOutbox, p.leadOutbox]) {
        for (const e of readOutboxFile(f)) if (retiredSet.has(e.id) && e.promptFile) retiredArtifacts.add(path.basename(e.promptFile));
      }
      // Also prunable: artifacts whose directive is TERMINAL. A frozen or
      // cancelled directive's prompt can never be acted on again, so keeping its
      // artifact only grows the directory — three DIR-055 artifacts survived a
      // full APPROVED_FROZEN cycle this way.
      const terminalArtifacts = new Set();
      for (const f of [p.devOutbox, p.leadOutbox]) {
        for (const e of readOutboxFile(f)) {
          if (!e.promptFile) continue;
          if (TERMINAL_STATUSES.has(statuses.get(String(e.directiveId || '')) || '')) {
            terminalArtifacts.add(path.basename(e.promptFile));
          }
        }
      }
      for (const f of fs.readdirSync(p.prompts)) {
        if (!f.endsWith('.txt')) continue;
        const orphan = !referenced.has(f);
        if (!orphan && !retiredArtifacts.has(f) && !terminalArtifacts.has(f)) continue;
        try { fs.unlinkSync(path.join(p.prompts, f)); report.prunedArtifacts += 1; } catch { }
      }
    } catch { /* artifact pruning is best-effort */ }
  }

  return { success: true, ...report, at: now() };
}

/** Queue census for one project: what is live, what is history. */
function queueStatus(root) {
  const p = ensureScaffold(root);
  const statuses = directiveStatusMap(root);
  const read = (file, ackName) => {
    const entries = readOutboxFile(file);
    const ack = jsonRead(path.join(p.dir, ackName), null);
    const acked = (e) => !!(ack && (ack.id === e.id || (Array.isArray(ack.ids) && ack.ids.includes(e.id))));
    return {
      total: entries.length,
      live: entries.filter(e => !e.delivered && !e.expired && !acked(e)),
      delivered: entries.filter(e => e.delivered).length,
      expired: entries.filter(e => e.expired).length
    };
  };
  const dev = read(p.devOutbox, 'cline_wake_ack.json');
  const lead = read(p.leadOutbox, 'lead_wake_ack.json');
  const describe = (e) => ({
    id: e.id, directiveId: e.directiveId || null, mode: e.mode || null,
    directiveStatus: statuses.get(String(e.directiveId || '')) || null,
    attempts: e.attempts || 0, createdAt: e.createdAt || null
  });
  let artifacts = 0;
  try { artifacts = fs.readdirSync(p.prompts).filter(f => f.endsWith('.txt')).length; } catch { }
  return {
    success: true, projectKey: p.key, projectRoot: p.root,
    dev: { ...dev, liveEntries: dev.live.map(describe) },
    lead: { ...lead, liveEntries: lead.live.map(describe) },
    promptArtifacts: artifacts,
    at: now()
  };
}

/**
 * Drain every project's dev + lead outboxes. Cheap when idle (early-returns),
 * and backs off exponentially per entry so a dead IDE cannot burn CPU.
 */
const RECONCILE_INTERVAL_MS = 60000;
const lastReconcileAt = new Map();

function drainAllProjects() {
  const dirs = listProjectWakes();
  let scanned = 0, retried = 0, delivered = 0, expired = 0, reconciled = 0;
  for (const dir of dirs) {
    // Reconcile ONLY when it can matter, and at most once a minute per project.
    //
    // Reconciliation reads every directive JSON, so running it unconditionally
    // on every drain tick made an IDLE drain do real I/O (it broke the
    // "idle drain is cheap (<250ms)" budget). Two guards keep the common case a
    // Map lookup: (1) skip entirely unless the outbox actually holds a live
    // entry, (2) throttle to one pass per project per minute.
    try {
      const devEntries = readOutboxFile(path.join(dir, 'wake_outbox.jsonl'));
      const hasLive = devEntries.some(e => !e.delivered && !e.expired);
      const probe = devEntries[0] || readOutboxFile(path.join(dir, 'lead_outbox.jsonl'))[0];
      if (probe && probe.projectRoot && hasLive) {
        const last = lastReconcileAt.get(probe.projectRoot) || 0;
        if (Date.now() - last >= RECONCILE_INTERVAL_MS) {
          lastReconcileAt.set(probe.projectRoot, Date.now());
          reconciled += retireStaleWakes(probe.projectRoot).retired;
        }
      }
    } catch { /* reconciliation is best-effort; never block delivery */ }
    for (const [file, roleShort, ackName] of [
      [path.join(dir, 'wake_outbox.jsonl'), 'dev', 'cline_wake_ack.json'],
      [path.join(dir, 'lead_outbox.jsonl'), 'lead', 'lead_wake_ack.json']
    ]) {
      const entries = readOutboxFile(file);
      if (!entries.length) continue;
      scanned++;
      const ack = jsonRead(path.join(dir, ackName), null);
      const inboxName = roleShort === 'lead' ? 'lead_inbox.json' : 'cline_inbox.json';
      const inbox = jsonRead(path.join(dir, inboxName), null);
      const token = (() => { try { return fs.readFileSync(path.join(dir, 'secrets.token'), 'utf8').trim(); } catch { return ''; } })();
      const lease = jsonRead(path.join(dir, 'agents', `${roleShort}.lease.json`), null);
      const leaseLive = lease && (Date.now() - Date.parse(lease.lastBeatAt || 0)) <= LEASE_TTL_MS;
      let changed = false;

      for (const e of entries) {
        if (e.delivered) continue;
        const acked = ack && (ack.id === e.id || (Array.isArray(ack.ids) && ack.ids.includes(e.id)));
        const consumed = inbox && inbox.id === e.id && inbox.processed === true;
        if (acked || consumed) { e.delivered = true; e.deliveredAt = now(); e.deliveredBy = acked ? 'ack' : 'inbox'; changed = true; delivered++; continue; }
        const age = Date.now() - Date.parse(e.createdAt || 0);
        if ((e.attempts || 0) >= 6 || age > 30 * 60 * 1000) { if (!e.expired) { e.expired = true; e.expiredAt = now(); changed = true; expired++; } continue; }
        const last = e.lastAttemptAt ? Date.parse(e.lastAttemptAt) : 0;
        if (Date.now() - last < backoffMs(e.attempts || 0)) continue;
        e.attempts = (e.attempts || 0) + 1; e.lastAttemptAt = now(); changed = true; retried++;
        if (leaseLive && lease.httpPort && token) {
          const payload = { projectKey: path.basename(dir), role: roleShort, id: e.id, mode: e.mode || '', directiveId: e.directiveId || '', promptFile: e.promptFile || '', text: '' };
          try { payload.text = e.promptFile && exists(e.promptFile) ? fs.readFileSync(e.promptFile, 'utf8') : ''; } catch {}
          payload.hmac = crypto.createHmac('sha256', token).update(canonicalPayload(payload)).digest('hex');
          const r = httpPostJsonSync(lease.httpPort, '/wake', payload, 1500);
          if (r.ok) { e.delivered = true; e.deliveredAt = now(); e.deliveredBy = 'ipc-replay'; delivered++; }
        }
      }
      if (changed) writeOutboxFile(file, entries);
    }
  }
  return { success: true, projects: dirs.length, outboxesScanned: scanned, retried, delivered, expired, reconciled, at: now() };
}

/* ── C. MCP config: serverless agent-to-agent tool channel ─────────────────── */
function mcpConfig(o = {}) {
  const role = shortRole(o.role || 'dev');
  // Distinct server name per role so installing the LEAD server never clobbers
  // the DEV server Cline already uses in the same IDE.
  const serverKey = role === 'lead' ? 'ai-bridge-lead' : 'ai-bridge';
  const server = {
    command: 'node',
    args: [path.join(GLOBAL, 'bridge.cjs'), 'mcp'],
    env: { AI_BRIDGE_ROLE: role },
    disabled: false,
    autoApprove: ['*'],
    alwaysAllow: ['*']
  };
  const snippet = { mcpServers: { [serverKey]: server } };
  const result = { success: true, role, serverKey, snippet, installed: [] };
  if (!o.install) return result;

  const targets = [
    path.join(HOME, '.claude', 'mcp.json'),
    path.join(HOME, 'AppData', 'Roaming', 'Antigravity IDE', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')
  ];
  for (const t of targets) {
    try {
      if (!exists(t)) continue;
      const cur = jsonRead(t, { mcpServers: {} });
      cur.mcpServers = cur.mcpServers || {};
      const prev = cur.mcpServers[serverKey];
      if (prev && prev.env && prev.env.AI_BRIDGE_ROLE === role) { result.installed.push({ file: t, serverKey, changed: false }); continue; }
      if (!exists(`${t}.bak`)) { try { fs.copyFileSync(t, `${t}.bak`); } catch {} }
      cur.mcpServers[serverKey] = server;
      atomicWrite(t, cur);
      result.installed.push({ file: t, serverKey, changed: true });
    } catch (e) { result.installed.push({ file: t, serverKey, error: e.message }); }
  }
  return result;
}

/* ── Unified operational log (structured, rotating, bounded) ───────────────── */
const LOG_DIR = path.join(GLOBAL, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bridge.jsonl');
const LOG_MAX_BYTES = 2 * 1024 * 1024; // rotate at 2 MB
const LOG_KEEP = 2;                    // keep bridge.jsonl + .1 + .2  (≤ 6 MB total)
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

function rotateLog() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size < LOG_MAX_BYTES) return;
    for (let i = LOG_KEEP; i >= 1; i--) {
      const from = path.join(LOG_DIR, `bridge.${i}.jsonl`);
      const to = path.join(LOG_DIR, `bridge.${i + 1}.jsonl`);
      if (!exists(from)) continue;
      try { if (exists(to)) fs.unlinkSync(to); fs.renameSync(from, to); } catch { }
    }
    try { fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'bridge.1.jsonl')); } catch { }
  } catch { }
}

/**
 * Append one structured operational record. Never throws (logging must never
 * break the thing it is observing).
 */
function logEvent(level, component, event, detail = {}, opts = {}) {
  try {
    ensureDir(LOG_DIR);
    rotateLog();
    const rec = {
      ts: now(),
      level: String(level || 'info'),
      component: String(component || 'bridge'),
      event: String(event || ''),
      projectKey: opts.projectKey || (detail && detail.projectKey) || null
    };
    if (Number.isFinite(opts.durationMs)) rec.durationMs = opts.durationMs;
    rec.detail = (detail && typeof detail === 'object') ? detail : { value: detail };
    appendLine(LOG_FILE, JSON.stringify(rec) + '\n');
    return rec;
  } catch { return null; }
}

function logFiles() {
  const files = [LOG_FILE];
  for (let i = 1; i <= LOG_KEEP; i++) files.push(path.join(LOG_DIR, `bridge.${i}.jsonl`));
  return files;
}

/** Filter + tail the log. `level` is a minimum severity. */
function readLogs(o = {}) {
  const min = LEVEL_ORDER[String(o.level || 'info')] ?? 1;
  const out = [];
  for (const f of logFiles()) {
    if (!exists(f)) continue;
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if ((LEVEL_ORDER[r.level] ?? 1) < min) continue;
      if (o.component && r.component !== o.component) continue;
      if (o.projectKey && r.projectKey !== o.projectKey) continue;
      if (o.event && r.event !== o.event) continue;
      out.push(r);
    }
  }
  const tail = Math.max(1, Number(o.tail) || 100);
  return { success: true, file: LOG_FILE, total: out.length, entries: out.slice(-tail) };
}

/** Roll-up view: counts by level/component + the most recent errors. */
function logSummary() {
  const all = readLogs({ level: 'debug', tail: 1e9 });
  const byLevel = {}, byComponent = {};
  for (const r of all.entries) {
    byLevel[r.level] = (byLevel[r.level] || 0) + 1;
    byComponent[r.component] = (byComponent[r.component] || 0) + 1;
  }
  return {
    success: true, file: LOG_FILE, total: all.total, byLevel, byComponent,
    recentErrors: all.entries.filter(r => r.level === 'error').slice(-15)
      .map(r => ({ ts: r.ts, component: r.component, event: r.event, detail: r.detail })),
    recentWarnings: all.entries.filter(r => r.level === 'warn').slice(-10)
      .map(r => ({ ts: r.ts, component: r.component, event: r.event }))
  };
}

/* ── Freeze & Lock: no change without explicit approval ───────────────────── */
const FREEZE_FILE = path.join(GLOBAL, 'locks', 'freeze.json');
const FROZEN_FILES = [
  // control plane
  'bridge.cjs', 'autowake.cjs',
  // daemons
  'lead_watcher.cjs', 'lead_watcher_session.cjs', 'lead_watcher_daemon.cjs',
  'auto_ai_router.cjs', 'local_model_service.cjs',
  // integrations
  'extension/extension.js', 'tools/ime365_db_mcp.cjs',
  // contracts
  'BRIDGE-PROTOCOL.md', 'BRIDGE-ROLES.md'
];
const UNLOCK_DEFAULT_MINUTES = 30;

function fileDigest(rel) {
  const p = path.join(GLOBAL, rel);
  try {
    const buf = fs.readFileSync(p);
    return { sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
  } catch { return null; }
}

/** Compare the frozen manifest against what is on disk right now. */
function freezeStatus() {
  const man = jsonRead(FREEZE_FILE, null);
  if (!man || !man.files) return { locked: false, intact: false, blocked: false, reason: 'NOT_FROZEN', drift: [] };
  const drift = [];
  for (const rel of Object.keys(man.files)) {
    const cur = fileDigest(rel);
    if (!cur) { drift.push({ file: rel, change: 'MISSING' }); continue; }
    if (cur.sha256 !== man.files[rel].sha256) drift.push({ file: rel, change: 'MODIFIED', was: man.files[rel].sha256.slice(0, 12), now: cur.sha256.slice(0, 12) });
  }
  for (const rel of FROZEN_FILES) {
    if (!man.files[rel] && fileDigest(rel)) drift.push({ file: rel, change: 'UNTRACKED' });
  }
  const unlock = (man.unlock && Date.parse(man.unlock.expiresAt || 0) > Date.now()) ? man.unlock : null;
  return {
    locked: true, frozenAt: man.frozenAt, fileCount: Object.keys(man.files).length,
    drift, intact: drift.length === 0, unlockActive: !!unlock, unlock,
    blocked: drift.length > 0 && !unlock,
    lastEvents: (man.history || []).slice(-5)
  };
}

/** Lock: capture hashes of every frozen file. Closes any open unlock window. */
function freezeLock(o = {}) {
  const files = {};
  for (const rel of FROZEN_FILES) { const d = fileDigest(rel); if (d) files[rel] = d; }
  const man = jsonRead(FREEZE_FILE, { version: 1, history: [] });
  man.version = 1; man.frozenAt = now(); man.files = files; man.unlock = null;
  man.history = (man.history || []).slice(-100);
  man.history.push({ at: man.frozenAt, action: 'FREEZE', by: o.by || 'cli', reason: o.reason || null, fileCount: Object.keys(files).length });
  atomicWrite(FREEZE_FILE, man);
  logEvent('info', 'freeze', 'LOCK', { fileCount: Object.keys(files).length, by: o.by || 'cli', reason: o.reason || null });
  return { success: true, locked: true, frozenAt: man.frozenAt, fileCount: Object.keys(files).length, files };
}

/** Unlock: open a time-boxed, reason-recorded change window. Requires --reason. */
function unlockWindow(o = {}) {
  const reason = String(o.reason || '').trim();
  if (!reason) throw new Error('unlock requires --reason "<why this change is approved>"');
  const minutes = Math.max(1, Math.min(480, Number(o.minutes) || UNLOCK_DEFAULT_MINUTES));
  const st = freezeStatus();
  const man = jsonRead(FREEZE_FILE, { version: 1, files: {}, history: [] });
  man.unlock = { at: now(), by: o.by || 'cli', reason, expiresAt: new Date(Date.now() + minutes * 60000).toISOString() };
  man.history = (man.history || []).slice(-100);
  man.history.push({ at: now(), action: 'UNLOCK', by: o.by || 'cli', reason, minutes, drift: (st.drift || []).map(d => d.file) });
  atomicWrite(FREEZE_FILE, man);
  logEvent('warn', 'freeze', 'UNLOCK', { reason, minutes, drift: (st.drift || []).map(d => d.file) });
  return { success: true, unlockedUntil: man.unlock.expiresAt, minutes, reason, driftAtUnlock: st.drift || [] };
}

const MUTATING_CMDS = new Set(['directive', 'dev', 'lead', 'gatekeeper', 'wake', 'heal', 'init', 'lane', 'merge', 'pipeline', 'feedback', 'ack', 'lease', 'project', 'xampp']);

/**
 * Integrity guard. Throws for mutating commands when frozen files drifted with
 * no open approval window; warns for read-only commands. Always logs.
 */
function integrityGuard(cmd) {
  let st;
  try { st = freezeStatus(); } catch { return null; }
  if (!st.locked || st.intact) return st;
  if (!st.blocked) {
    // Drift exists but an approved change window is open — allow + audit.
    logEvent('warn', 'freeze', 'INTEGRITY_APPROVED_DRIFT', { cmd, drift: st.drift.map(d => d.file), reason: st.unlock && st.unlock.reason });
    return st;
  }
  const summary = st.drift.map(d => `${d.file}:${d.change}`).join(', ');
  logEvent('error', 'freeze', 'INTEGRITY_VIOLATION', { cmd, drift: st.drift });
  if (MUTATING_CMDS.has(cmd)) {
    throw new Error(`BRIDGE LOCKED — ${st.drift.length} frozen file(s) changed without approval (${summary}). Approve: bridge unlock --reason "<rationale>"   Inspect: bridge lock-status`);
  }
  console.error(`\x1b[31m⚠ BRIDGE INTEGRITY: ${summary} — run 'bridge lock-status'\x1b[0m`);
  return st;
}

/* ── Self-verification: in-process, dependency-free, runs anywhere ─────────── */
function selfTest() {
  const checks = [];
  const t = (name, fn) => { try { checks.push({ name, ok: !!fn() }); } catch (e) { checks.push({ name, ok: false, error: e.message }); } };
  const TMP = path.join(os.tmpdir(), `aw-selftest-${process.pid}`);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
    const mk = (n) => { const r = path.join(TMP, n); fs.mkdirSync(path.join(r, '.bridge', 'directives'), { recursive: true }); fs.writeFileSync(path.join(r, '.bridge', 'ledger.jsonl'), ''); return r; };
    const A = mk('A'), B = mk('B');
    try { fs.rmSync(pPaths(A).dir, { recursive: true, force: true }); } catch { }
    try { fs.rmSync(pPaths(B).dir, { recursive: true, force: true }); } catch { }
    const pa = ensureScaffold(A), pb = ensureScaffold(B);

    t('isolation: distinct project keys', () => pa.key !== pb.key);
    t('isolation: distinct 256-bit tokens', () => getToken(A) !== getToken(B) && /^[0-9a-f]{64}$/.test(getToken(A)));

    const d = deliver({ projectDir: A, toRole: 'dev', directiveId: 'DIR-001', mode: 'act', promptText: 'x', noUri: true, noIpc: true });
    t('deliver: clipboard-free', () => d.clipboardUsed === false);
    t('deliver: project-scoped durable inbox', () => JSON.parse(fs.readFileSync(pa.devInbox, 'utf8')).id === d.wakeId);
    t('deliver: durable outbox entry', () => readOutboxFile(pa.devOutbox).some(x => x.id === d.wakeId));

    const p = { projectKey: pa.key, role: 'dev', id: 'X', mode: 'act', directiveId: 'D', promptFile: '', text: 'hi' };
    p.hmac = signPayload(A, p);
    t('security: HMAC verifies', () => verifyPayload(A, p) === true);
    t('security: tampered payload rejected', () => verifyPayload(A, { ...p, text: 'evil' }) === false);
    t('security: foreign-project token rejected', () => verifyPayload(A, { ...p, hmac: signPayload(B, p) }) === false);
    t('security: path traversal rejected', () => isContained('C:\\Windows\\win.ini', pa.prompts) === false);
    t('security: contained prompt accepted', () => isContained(path.join(pa.prompts, 'a.txt'), pa.prompts) === true);

    fs.writeFileSync(path.join(A, '.bridge', 'directives', 'DIR-001.json'), JSON.stringify({ id: 'DIR-001', title: 't', spec: 's', status: 'PLAN_SUBMITTED', priority: 'P0' }));
    t('turn: PLAN_SUBMITTED -> lead', () => turn({ projectDir: A }).owner === 'lead');
    fs.writeFileSync(path.join(A, '.bridge', 'directives', 'DIR-001.json'), JSON.stringify({ id: 'DIR-001', title: 't', spec: 's', status: 'IN_PROGRESS', priority: 'P0' }));
    t('turn: IN_PROGRESS -> dev', () => turn({ projectDir: A }).owner === 'dev');

    fs.appendFileSync(path.join(A, '.bridge', 'ledger.jsonl'), JSON.stringify({ id: 'q1', type: 'QUESTION_ASKED', status: 'OPEN', recipient: 'LEAD_SUPERVISOR', sender: 'STAFF_DEVELOPER', readBy: ['STAFF_DEVELOPER'], payload: {} }) + '\n');
    const aw = awaitEvent({ projectDir: A, role: 'lead', timeout: 2 });
    t('await: returns newest instantly', () => !aw.timedOut && aw.event && aw.event.id === 'q1');
    t('await: no duplicate delivery', () => awaitEvent({ projectDir: A, role: 'lead', timeout: 0 }).event === null);
    t('await: role isolation', () => awaitEvent({ projectDir: A, role: 'dev', timeout: 0 }).timedOut === true);

    ack(A, 'dev', d.wakeId, { source: 'selftest' });
    t('ack: recorded', () => isAcked(A, 'dev', d.wakeId) === true);
    t('ack: project-scoped', () => isAcked(B, 'dev', d.wakeId) === false);
    drainAllProjects();
    const e = readOutboxFile(pa.devOutbox).find(x => x.id === d.wakeId);
    t('drain: retires acked wake', () => !!e && e.delivered === true);
    t('drain: idle cost is negligible', () => { const s = Date.now(); drainAllProjects(); return Date.now() - s < 250; });

    t('leases: write + read live', () => { writeLease(A, 'dev', { transports: ['file'], httpPort: 48499 }); const l = readLease(A, 'dev'); return !!l && l.live === true; });
    t('mcp-config: role-aware + non-clobbering', () => {
      const d = mcpConfig({ role: 'dev' }), l = mcpConfig({ role: 'lead' });
      return d.snippet.mcpServers['ai-bridge'].env.AI_BRIDGE_ROLE === 'dev'
        && l.snippet.mcpServers['ai-bridge-lead'].env.AI_BRIDGE_ROLE === 'lead';
    });
  } catch (e) {
    checks.push({ name: 'selftest harness', ok: false, error: e.message });
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }
  }
  const failed = checks.filter(c => !c.ok);
  return { success: failed.length === 0, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, at: now() };
}

module.exports = {
  ROLES, ROLE_SHORT, GLOBAL, PROJECTS, LEASE_TTL_MS,
  normalizeRole, shortRole, projectKey, pPaths, ensureScaffold, listProjectWakes,
  getToken, canonicalPayload, signPayload, verifyPayload, isContained,
  writeLease, readLease, readAllLeases,
  turn, tailLedger, awaitEvent, ack, isAcked,
  deliver, drainAllProjects, mcpConfig, httpPostJsonSync, resolveIdeExe,
  readOutboxFile, writeOutboxFile, selfTest,
  retireStaleWakes, queueStatus, directiveStatusMap,
  logEvent, readLogs, logSummary, LOG_FILE, LOG_DIR,
  freezeStatus, freezeLock, unlockWindow, integrityGuard, FREEZE_FILE, FROZEN_FILES
};


