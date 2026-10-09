#!/usr/bin/env node
'use strict';
/**
 * autowake-suite.cjs — full verification of the project-scoped mutual-wake plane.
 *
 * Covers: project isolation (two parallel projects never collide), token/HMAC
 * security + path containment, `turn` ownership, event-driven `await`, durable
 * acks, outbox drain, idempotency, and a LIVE authenticated IPC round-trip.
 *
 *   node autowake-suite.cjs            # run all tests
 *   node autowake-suite.cjs --ipc-stub # internal: authenticated stub IPC server
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const AW = require(path.join(os.homedir(), '.ai-bridge', 'autowake.cjs'));
const BRIDGE = path.join(os.homedir(), '.ai-bridge', 'bridge.cjs');
const TMP = path.join(os.tmpdir(), 'autowake-suite');
const RECEIVED = path.join(TMP, 'ipc-received.jsonl');
const PORT = 48477;

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`\x1b[32m✔\x1b[0m ${name}`); }
  else { fail++; console.log(`\x1b[31m✘ ${name}\x1b[0m${detail ? '  — ' + detail : ''}`); }
}
function mkProject(name) {
  const root = path.join(TMP, name);
  fs.mkdirSync(path.join(root, '.bridge', 'directives'), { recursive: true });
  fs.writeFileSync(path.join(root, '.bridge', 'ledger.jsonl'), '', 'utf8');
  return root;
}

// ── Stub mode: authenticated extension IPC (separate process, no deadlock) ──
if (process.argv.includes('--ipc-stub')) {
  const root = process.argv[process.argv.indexOf('--ipc-stub') + 1];
  const port = Number(process.argv[process.argv.indexOf('--ipc-stub') + 2] || PORT);
  try { fs.writeFileSync(RECEIVED, '', 'utf8'); } catch { }
  const srv = http.createServer((req, res) => {
    if (req.url === '/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ source: 'stub', live: true, projectKey: AW.projectKey(root) })); return; }
    if (req.url === '/wake' && req.method === 'POST') {
      let b = ''; req.on('data', c => b += c);
      req.on('end', () => {
        let j = {};
        try { j = JSON.parse(b || '{}'); } catch { }
        const projOk = String(j.projectKey || '') === AW.projectKey(root);
        const pathOk = !j.promptFile || AW.isContained(j.promptFile, AW.pPaths(root).prompts);
        const hmacOk = AW.verifyPayload(root, j);
        const ok = projOk && pathOk && hmacOk;
        try { fs.appendFileSync(RECEIVED, JSON.stringify({ ok, projOk, pathOk, hmacOk, id: j.id, role: j.role, projectKey: j.projectKey }) + '\n', 'utf8'); } catch { }
        res.writeHead(ok ? 200 : 403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: ok, projOk, pathOk, hmacOk }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  srv.on('error', () => process.exit(0));
  srv.listen(port, '127.0.0.1', () => console.log('[stub] :' + port + ' for ' + AW.projectKey(root)));
  setInterval(() => { }, 1 << 30);
  return;
}

console.log('\n' + '='.repeat(72));
console.log('  AUTOWAKE SUITE — project-scoped, serverless-first, event-driven');
console.log('='.repeat(72) + '\n');
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }
fs.mkdirSync(TMP, { recursive: true });

const A = mkProject('ProjAlpha');
const B = mkProject('ProjBeta');
// Wake artifacts are keyed by absolute path and PERSIST across runs by design;
// reset them so each suite run starts from a clean slate.
try { fs.rmSync(AW.pPaths(A).dir, { recursive: true, force: true }); } catch { }
try { fs.rmSync(AW.pPaths(B).dir, { recursive: true, force: true }); } catch { }

/* ── 1. PROJECT ISOLATION (the collision fix) ─────────────────────────────── */
const pa = AW.ensureScaffold(A);
const pb = AW.ensureScaffold(B);
check('two projects derive DIFFERENT project keys', pa.key !== pb.key, `${pa.key} vs ${pb.key}`);
check('two projects use DIFFERENT wake dirs', pa.dir !== pb.dir);
check('two projects get DIFFERENT tokens', AW.getToken(A) !== AW.getToken(B));
check('token is 64-hex (256-bit)', /^[0-9a-f]{64}$/.test(AW.getToken(A)));
check('wake dir is namespaced under projects/', pa.dir.includes(path.join('.ai-bridge', 'projects')));

const dA = AW.deliver({ projectDir: A, toRole: 'dev', directiveId: 'DIR-001', mode: 'act', promptText: 'alpha prompt', noUri: true });
const dB = AW.deliver({ projectDir: B, toRole: 'dev', directiveId: 'DIR-777', mode: 'plan', promptText: 'beta prompt', noUri: true });
check('delivery returns the correct project key (A)', dA.projectKey === pa.key, dA.projectKey);
check('delivery returns the correct project key (B)', dB.projectKey === pb.key, dB.projectKey);
const inA = JSON.parse(fs.readFileSync(pa.devInbox, 'utf8'));
const inB = JSON.parse(fs.readFileSync(pb.devInbox, 'utf8'));
check('project A inbox holds A payload only', inA.directiveId === 'DIR-001' && inA.prompt.includes('alpha'));
check('project B inbox holds B payload only', inB.directiveId === 'DIR-777' && inB.prompt.includes('beta'));
check('A inbox was NOT clobbered by B', inA.id === dA.wakeId && inB.id === dB.wakeId);
check('outboxes are separate files', pa.devOutbox !== pb.devOutbox && fs.existsSync(pa.devOutbox) && fs.existsSync(pb.devOutbox));
check('clipboard never used', dA.clipboardUsed === false && dB.clipboardUsed === false);

/* ── 2. SECURITY: token + HMAC + path containment ─────────────────────────── */
const payloadA = { projectKey: pa.key, role: 'dev', id: 'X1', mode: 'act', directiveId: 'DIR-001', promptFile: path.join(pa.prompts, 'x.txt'), text: 'hello' };
payloadA.hmac = AW.signPayload(A, payloadA);
check('valid HMAC verifies', AW.verifyPayload(A, payloadA) === true);
check('tampered text is REJECTED', AW.verifyPayload(A, { ...payloadA, text: 'malicious' }) === false);
check('missing HMAC is REJECTED', AW.verifyPayload(A, { ...payloadA, hmac: '' }) === false);
check("another project's token is REJECTED", AW.verifyPayload(A, { ...payloadA, hmac: AW.signPayload(B, payloadA) }) === false);
check('path containment accepts wake_prompts file', AW.isContained(path.join(pa.prompts, 'p.txt'), pa.prompts) === true);
check('path traversal is REJECTED', AW.isContained(path.join(pa.dir, '..', '..', 'secrets.token'), pa.prompts) === false);
check('absolute escape is REJECTED', AW.isContained('C:\\Windows\\win.ini', pa.prompts) === false);

/* ── 3. TURN: ownership derived from directive state ──────────────────────── */
function setDirective(root, id, status) {
  fs.writeFileSync(path.join(root, '.bridge', 'directives', `${id}.json`), JSON.stringify({ id, title: 't', spec: 's', status, priority: 'P0', updatedAt: new Date().toISOString() }), 'utf8');
}
setDirective(A, 'DIR-001', 'PLAN_SUBMITTED');
check('turn: PLAN_SUBMITTED → lead', AW.turn({ projectDir: A }).owner === 'lead');
setDirective(A, 'DIR-001', 'IN_PROGRESS');
check('turn: IN_PROGRESS → dev', AW.turn({ projectDir: A }).owner === 'dev');
setDirective(A, 'DIR-001', 'EVIDENCE_SUBMITTED');
check('turn: EVIDENCE_SUBMITTED → lead', AW.turn({ projectDir: A }).owner === 'lead');
setDirective(A, 'DIR-001', 'APPROVED_FROZEN');
check('turn: frozen → none', AW.turn({ projectDir: A }).owner === 'none');

/* ── 4. AWAIT: event-driven, instant, no busy loop ────────────────────────── */
const ledA = path.join(A, '.bridge', 'ledger.jsonl');
fs.appendFileSync(ledA, JSON.stringify({ id: 'evt_q1', type: 'QUESTION_ASKED', status: 'OPEN', recipient: 'LEAD_SUPERVISOR', sender: 'STAFF_DEVELOPER', readBy: ['STAFF_DEVELOPER'], payload: { directiveId: 'DIR-001' } }) + '\n', 'utf8');
let t0 = Date.now();
const aw1 = AW.awaitEvent({ projectDir: A, role: 'lead', timeout: 5 });
check('await returns the pending message immediately (<400ms)', !aw1.timedOut && Date.now() - t0 < 400, `waited ${Date.now() - t0}ms`);
check('await returned the correct event', aw1.event && aw1.event.id === 'evt_q1');
check('await auto-acked (message not returned twice)', AW.awaitEvent({ projectDir: A, role: 'lead', timeout: 0 }).event === null);
check('await isolates roles (dev has no message)', AW.awaitEvent({ projectDir: A, role: 'dev', timeout: 0 }).timedOut === true);
check('await respects timeout for empty inbox', (() => { const s = Date.now(); const r = AW.awaitEvent({ projectDir: B, role: 'lead', timeout: 1 }); return r.timedOut && Date.now() - s >= 900; })());

/* ── 5. ACK + DRAIN: at-least-once retirement ─────────────────────────────── */
AW.ack(A, 'dev', dA.wakeId, { source: 'test' });
check('ack records the wake id', AW.isAcked(A, 'dev', dA.wakeId) === true);
check('ack is project-scoped (B unaffected)', AW.isAcked(B, 'dev', dA.wakeId) === false);
const drain = AW.drainAllProjects();
check('drain runs across all projects without error', drain.success === true, JSON.stringify(drain));
const entryA = AW.readOutboxFile(pa.devOutbox).find(e => e.id === dA.wakeId);
check('drain retired the acked wake', !!entryA && entryA.delivered === true, entryA ? entryA.deliveredBy : 'missing');

/* ── 6. LIVE authenticated IPC round-trip (capability routing) ────────────── */
const stub = spawn(process.execPath, [__filename, '--ipc-stub', A, String(PORT)], { detached: true, stdio: 'ignore', windowsHide: true });
stub.unref();
sleepSync(1400);
// Advertise a live dev lease pointing at the stub → deliver must route over IPC.
AW.writeLease(A, 'dev', { transports: ['file', 'http'], httpPort: PORT });
const dLive = AW.deliver({ projectDir: A, toRole: 'dev', directiveId: 'DIR-001', mode: 'act', promptText: 'live ipc prompt', noUri: true });
check('deliver capability-routed over IPC (lease live)', dLive.channels.via === 'ipc', JSON.stringify(dLive.channels));
check('IPC accepted the authenticated wake (200)', !!(dLive.channels.ipc && dLive.channels.ipc.ok), JSON.stringify(dLive.channels.ipc));
check('lease was detected as live', !!(dLive.lease && dLive.lease.live), JSON.stringify(dLive.lease));

let recv = [];
try { recv = fs.readFileSync(RECEIVED, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)); } catch { }
const last = recv[recv.length - 1] || {};
check('stub verified project key', last.projOk === true, JSON.stringify(last));
check('stub verified prompt path containment', last.pathOk === true);
check('stub verified the HMAC', last.hmacOk === true);

// A tampered (unsigned) wake must be rejected with 403.
const bad = { projectKey: pa.key, role: 'dev', id: 'EVIL', mode: 'act', directiveId: 'DIR-001', promptFile: '', text: 'inject', hmac: 'deadbeef' };
const badRes = AW.httpPostJsonSync(PORT, '/wake', bad, 1500);
check('unsigned/tampered IPC wake is REJECTED (403)', badRes.status === 403, 'status=' + badRes.status);

// Path-traversal promptFile must be rejected too.
const trav = { projectKey: pa.key, role: 'dev', id: 'EVIL2', mode: 'act', directiveId: 'DIR-001', promptFile: 'C:\\Windows\\win.ini', text: 'x' };
trav.hmac = AW.signPayload(A, trav);
const travRes = AW.httpPostJsonSync(PORT, '/wake', trav, 1500);
check('path-traversal IPC wake is REJECTED (403)', travRes.status === 403, 'status=' + travRes.status);

try { process.kill(stub.pid); } catch { }

/* ── 7. Idempotency + resource sanity ─────────────────────────────────────── */
AW.ack(A, 'dev', 'dup-1', { source: 'test' });
AW.ack(A, 'dev', 'dup-1', { source: 'test' });
const ackFile = JSON.parse(fs.readFileSync(pa.devAck, 'utf8'));
check('repeated acks do not duplicate ids', ackFile.ids.filter(i => i === 'dup-1').length === 1);
const tDrain = Date.now();
AW.drainAllProjects();
check('idle drain is cheap (<250ms)', Date.now() - tDrain < 250, `${Date.now() - tDrain}ms`);
check('listProjectWakes finds both projects', AW.listProjectWakes().length >= 2, 'count=' + AW.listProjectWakes().length);

/* ── 8. Outstanding-wake guard: ONE live wake per (directive, role, mode) ──── */
// Regression guard for the DIR-055 wake storm: the stall watchdog re-woke a
// WORKING developer 109 times because dedup keyed only on the (always-fresh)
// wake id, so nothing could ever collapse a duplicate.
// Unique root per run: the wake dir is keyed off the absolute project path, and
// the suite's TMP dir persists between runs — so a fixed name would inherit the
// previous run's wake_prompts/ and make an absolute-count assertion flaky.
const D = mkProject('dedup-' + Date.now().toString(36));
const pD = AW.pPaths(D);
const promptCount = () => { try { return fs.readdirSync(pD.prompts).filter(f => f.endsWith('.txt')).length; } catch { return 0; } };
const d1 = AW.deliver({ projectDir: D, toRole: 'dev', directiveId: 'DIR-900', mode: 'act', promptText: 'wake #1', noUri: true });
const artifactsAfterFirst = promptCount();
const d2 = AW.deliver({ projectDir: D, toRole: 'dev', directiveId: 'DIR-900', mode: 'act', promptText: 'wake #2', noUri: true });
check('re-wake for the same (directive, mode) ADOPTS the live wake id', d2.wakeId === d1.wakeId, `${d1.wakeId} vs ${d2.wakeId}`);
check('re-wake is reported as deduped', d2.deduped === true, JSON.stringify({ deduped: d2.deduped, superseded: d2.superseded }));
const liveD = AW.readOutboxFile(pD.devOutbox).filter(e => !e.delivered && !e.expired);
check('outbox holds exactly ONE live wake after a re-wake', liveD.length === 1, 'live=' + liveD.length);
check('the adopted entry records its refresh', !!(liveD[0] && liveD[0].refreshes === 1), 'refreshes=' + (liveD[0] && liveD[0].refreshes));
check('re-wake did NOT create another prompt artifact', artifactsAfterFirst === 1 && promptCount() === 1, `afterFirst=${artifactsAfterFirst} now=${promptCount()}`);
// A DIFFERENT mode is a genuinely different wake → must NOT be collapsed.
const d3 = AW.deliver({ projectDir: D, toRole: 'dev', directiveId: 'DIR-900', mode: 'plan', promptText: 'plan wake', noUri: true });
check('a different mode still mints a NEW wake', d3.wakeId !== d1.wakeId && d3.deduped === false);
// A different directive must also not be collapsed.
const d4 = AW.deliver({ projectDir: D, toRole: 'dev', directiveId: 'DIR-901', mode: 'act', promptText: 'other directive', noUri: true });
check('a different directive still mints a NEW wake', d4.wakeId !== d1.wakeId && d4.deduped === false);
// Acking must RELEASE the guard so a later wake is genuinely new (no wedge).
AW.ack(D, 'dev', d1.wakeId, { source: 'test' });
const d5 = AW.deliver({ projectDir: D, toRole: 'dev', directiveId: 'DIR-900', mode: 'act', promptText: 'wake after ack', noUri: true });
check('an ACKED wake releases the guard (new id, no wedge)', d5.wakeId !== d1.wakeId && d5.deduped === false, `${d1.wakeId} vs ${d5.wakeId}`);
check('supersede:false opts out of the guard', AW.deliver({ projectDir: D, toRole: 'dev', directiveId: 'DIR-900', mode: 'act', promptText: 'forced', noUri: true, supersede: false }).deduped === false);

/* ── 9. Queue reconciliation: ownership-aware retirement + artifact pruning ── */
// Regression guard for a directive that reached APPROVED_FROZEN while THREE
// wakes for it were still queued, forcing every `await` to skip them.
const Q = mkProject('queue-' + Date.now().toString(36));
const pQ = AW.pPaths(Q);
const dDir = path.join(Q, '.bridge', 'directives');
fs.mkdirSync(dDir, { recursive: true });
const seedDirective = (id, status) => fs.writeFileSync(path.join(dDir, `${id}.json`), JSON.stringify({ id, status }), 'utf8');
seedDirective('DIR-900', 'APPROVED_FROZEN');     // terminal — the work is done
seedDirective('DIR-901', 'EVIDENCE_SUBMITTED');  // ball is with the LEAD
seedDirective('DIR-902', 'IN_PROGRESS');         // the dev still owns the ball

const qFrozen = AW.deliver({ projectDir: Q, toRole: 'dev', directiveId: 'DIR-900', mode: 'act', promptText: 'frozen', noUri: true });
const qLead = AW.deliver({ projectDir: Q, toRole: 'dev', directiveId: 'DIR-901', mode: 'act', promptText: 'lead-owned', noUri: true });
const qLive = AW.deliver({ projectDir: Q, toRole: 'dev', directiveId: 'DIR-902', mode: 'act', promptText: 'live', noUri: true });

const rec = AW.retireStaleWakes(Q);
check('reconcile retires the TERMINAL-directive wake', rec.reasons.some(r => r.id === qFrozen.wakeId && r.reason === 'DIRECTIVE_APPROVED_FROZEN'), JSON.stringify(rec.reasons));
check('reconcile retires the LEAD-OWNED wake', rec.reasons.some(r => r.id === qLead.wakeId && r.reason === 'BALL_WITH_LEAD_EVIDENCE_SUBMITTED'), JSON.stringify(rec.reasons));
check('reconcile KEEPS the wake the dev still owns', rec.kept === 1 && !rec.reasons.some(r => r.id === qLive.wakeId));
check('reconcile pruned the retired prompt artifacts', rec.prunedArtifacts >= 2, 'pruned=' + rec.prunedArtifacts);
check('the LIVE prompt artifact survived', fs.readdirSync(pQ.prompts).some(f => f.includes('DIR-902')), fs.readdirSync(pQ.prompts).join(','));

const qs = AW.queueStatus(Q);
check('queueStatus reports exactly one live wake', qs.dev.live.length === 1 && qs.dev.live[0].directiveId === 'DIR-902', JSON.stringify(qs.dev.live.map(e => e.directiveId)));
check('queueStatus exposes each live wake\'s directive status', qs.dev.liveEntries[0] && qs.dev.liveEntries[0].directiveStatus === 'IN_PROGRESS', JSON.stringify(qs.dev.liveEntries));

const rec2 = AW.retireStaleWakes(Q);
check('reconciliation is IDEMPOTENT', rec2.retired === 0 && rec2.prunedArtifacts === 0, JSON.stringify({ retired: rec2.retired, pruned: rec2.prunedArtifacts }));
check('dryRun reports without writing', (() => {
  const before = fs.readFileSync(pQ.devOutbox, 'utf8');
  const dry = AW.retireStaleWakes(Q, { dryRun: true });
  return dry.success === true && fs.readFileSync(pQ.devOutbox, 'utf8') === before;
})());

console.log('\n' + '-'.repeat(72));
console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
console.log('-'.repeat(72) + '\n');
process.exit(fail ? 1 : 0);


