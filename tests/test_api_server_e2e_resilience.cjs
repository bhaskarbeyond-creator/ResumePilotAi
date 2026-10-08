#!/usr/bin/env node
/**
 * DIR-053 S5 — End-to-End Resilience & Data Population Battery (live stack).
 *
 * Certifies the self-healing Backend API tier of the XAMPP stack against the
 * LIVE deployment (no mocks, no stubs):
 *
 *   T1  backend/index.js answers /healthz and /api/service-availability (200)
 *   T2  Apache serves /api/service-availability on http://localhost AND
 *       https://ime365.local (vhost ProxyPass -> 127.0.0.1:8080)
 *   T3  an authenticated candidate (uid OhZdiSIFL7ePA1TMkfu9bnR935D3) receives
 *       the real 15-resume dataset — an outage can never masquerade as an
 *       empty account (anonymous access is rejected with 401)
 *   T4  killing :8080 is auto-healed by lead_watcher_daemon.cjs in < 6000 ms
 *       (AC-4) — measured from SIGKILL to a NEW listener answering HTTP 200
 *   T5  after the self-heal the whole chain (Apache proxy -> API -> MariaDB)
 *       serves the 15 resumes again — zero user-visible loss, zero manual steps
 *
 * HARD PRECONDITIONS (fail loudly, never silently skip):
 *   - XAMPP Apache (80/443), MariaDB (3306) and the managed Backend API (:8080)
 *     must be running: `bridge xampp start all`.
 *   - lead_watcher_daemon.cjs --loop must be alive BEFORE T4 (it is the healer);
 *     T4 refuses to cut the backend when the watchdog is down.
 *   - Do not re-run within 15 s of a previous T4: the daemon's spawn-grace
 *     window intentionally defers re-spawns right after a spawn.
 *
 * POLICY: this file spawns NO server processes (DIR-051 XAMPP guard). It only
 * probes HTTP and terminates the one process it is explicitly certifying.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
const { issueLocalTestToken, testVerifierEnabled } = require('../backend/security/auth');

const BACKEND_HEALTH = 'http://127.0.0.1:8080/healthz';
const BACKEND_READY = 'http://127.0.0.1:8080/readyz';
const BACKEND_SERVICE_AVAILABILITY = 'http://127.0.0.1:8080/api/service-availability';
const LOCALHOST_SERVICE_AVAILABILITY = 'http://localhost/api/service-availability';
const TLS_SERVICE_AVAILABILITY = 'https://ime365.local/api/service-availability';
const BACKEND_RESUMES = 'http://127.0.0.1:8080/api/resumes';

const CANDIDATE = Object.freeze({
  uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3',
  email: 'bhaskar.beyond@gmail.com',
});
const EXPECTED_RESUME_COUNT = 15; // certified baseline for this candidate (DIR-053 spec)
const RECOVERY_BUDGET_MS = 6000;  // AC-4: < 6 s from kill to new listener answering 200

const BRIDGE_HOME = path.join(os.homedir(), '.ai-bridge');
const DAEMON_PID_FILE = path.join(BRIDGE_HOME, 'lead_watcher_daemon.pid');
const BACKEND_PID_FILE = path.join(BRIDGE_HOME, 'backend_api.pid');

const WIN_ONLY = process.platform !== 'win32'
  ? 'DIR-053 resilience battery targets the XAMPP host (win32 only)'
  : false;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function request(url, { method = 'GET', headers = {}, timeoutMs = 5000 } = {}) {
  return new Promise(resolve => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers,
      agent: false, // fresh socket per probe - never pool a socket across a kill
      // ime365.local is a loopback dev vhost with a locally-issued certificate.
      rejectUnauthorized: false,
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch { json = null; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', err => resolve({ status: 0, json: null, raw: '', error: err.message }));
    req.end();
  });
}

function powershell(script) {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
  return (r.stdout || '').trim();
}

function readPidFile(file) {
  try { return Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10); } catch { return null; }
}

function processAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  return powershell(`if (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { 'ALIVE' } else { 'DEAD' }`) === 'ALIVE';
}

function processName(pid) {
  return powershell(`$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { $p.ProcessName.ToLower() } else { '' }`);
}

function portListenerPid(port) {
  const out = powershell(`$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } else { '' }`);
  const pid = Number.parseInt(out, 10);
  return Number.isFinite(pid) ? pid : null;
}

function candidateToken() {
  return issueLocalTestToken({
    uid: CANDIDATE.uid,
    email: CANDIDATE.email,
    role: 'USER',
    email_verified: true,
    claims: { role: 'USER' },
  });
}

test('prerequisites: the managed stack tiers are up and the watchdog healer is armed', { skip: WIN_ONLY }, async () => {
  const daemonPid = readPidFile(DAEMON_PID_FILE);
  assert.ok(daemonPid, `lead_watcher_daemon.pid missing (${DAEMON_PID_FILE}) — the :8080 healer must be running`);
  assert.ok(processAlive(daemonPid), `lead_watcher_daemon.cjs (PID ${daemonPid}) is not alive — start the watchdogs before this battery`);

  const probe = await request(BACKEND_HEALTH, { timeoutMs: 2000 });
  assert.equal(
    probe.status, 200,
    `backend /healthz must answer 200 before the drill (got ${probe.status}${probe.error ? `: ${probe.error}` : ''}) — run "bridge xampp start all"`
  );
});

test('T1: backend API :8080 serves /healthz and /api/service-availability', { skip: WIN_ONLY }, async () => {
  const health = await request(BACKEND_HEALTH);
  assert.equal(health.status, 200, `/healthz expected 200, got ${health.status}${health.error ? `: ${health.error}` : ''}`);

  const availability = await request(BACKEND_SERVICE_AVAILABILITY);
  assert.equal(availability.status, 200, `/api/service-availability expected 200, got ${availability.status}`);
  assert.equal(availability.json?.success, true, 'service-availability must report success:true');
  assert.equal(
    availability.json?.ai?.available, true,
    'ai.available must be true — it is the honest source of the header "✦ AI Engine Ready" beacon'
  );
});

test('T2: Apache reverse-proxies /api to :8080 on localhost and ime365.local (TLS)', { skip: WIN_ONLY }, async () => {
  const plain = await request(LOCALHOST_SERVICE_AVAILABILITY);
  assert.equal(
    plain.status, 200,
    `http://localhost/api/service-availability expected 200, got ${plain.status}${plain.error ? `: ${plain.error}` : ''}`
  );
  assert.equal(plain.json?.success, true, 'localhost: service-availability must report success:true');

  const tls = await request(TLS_SERVICE_AVAILABILITY);
  assert.equal(
    tls.status, 200,
    `https://ime365.local/api/service-availability expected 200, got ${tls.status}${tls.error ? `: ${tls.error}` : ''}`
  );
  assert.equal(tls.json?.success, true, 'ime365.local TLS: service-availability must report success:true');
});

test('T3: authenticated candidate receives the real resume dataset (never a fake empty account)', { skip: WIN_ONLY }, async () => {
  assert.equal(testVerifierEnabled(), true, 'rptest verifier must be enabled (backend/.env TEST_AUTH_HMAC_SECRET, non-production)');

  const anonymous = await request(BACKEND_RESUMES);
  assert.equal(anonymous.status, 401, `anonymous /api/resumes must be rejected with 401, got ${anonymous.status}`);

  const authed = await request(BACKEND_RESUMES, { headers: { Authorization: `Bearer ${candidateToken()}` } });
  assert.equal(authed.status, 200, `authenticated /api/resumes expected 200, got ${authed.status}`);
  assert.equal(authed.json?.success, true, 'authenticated /api/resumes must report success:true');
  assert.ok(Array.isArray(authed.json?.resumes), 'resumes must be an array');
  assert.equal(
    authed.json.resumes.length,
    EXPECTED_RESUME_COUNT,
    `candidate ${CANDIDATE.uid} must receive the certified ${EXPECTED_RESUME_COUNT}-resume baseline, got ${authed.json.resumes.length}`
  );
  console.log(`[DIR-053] T3 verified ${authed.json.resumes.length} real resumes for ${CANDIDATE.email}`);
});

test('T4: killing :8080 triggers daemon auto-recovery in under 6000 ms (AC-4)', { skip: WIN_ONLY }, async () => {
  // Safety gate — never cut the data plane when the healer is down.
  const daemonPid = readPidFile(DAEMON_PID_FILE);
  assert.ok(processAlive(daemonPid), 'lead_watcher_daemon.cjs must be alive BEFORE the crash drill (it is the healer)');

  const doomedPid = portListenerPid(8080);
  assert.ok(doomedPid, 'a listener must own :8080 before the crash drill');
  assert.equal(processName(doomedPid), 'node', `:8080 must be owned by the managed node backend, found "${processName(doomedPid)}" (PID ${doomedPid})`);

  const t0 = Date.now();
  const kill = spawnSync('taskkill', ['/F', '/PID', String(doomedPid)], { encoding: 'utf8', windowsHide: true });
  assert.equal(kill.status, 0, `taskkill failed for PID ${doomedPid}: ${(kill.stdout || kill.stderr || '').trim()}`);

  // Phase 1: the outage must be observable (socket actually closed).
  let outageObserved = false;
  const outageDeadline = Date.now() + 3000;
  while (Date.now() < outageDeadline) {
    const probe = await request(BACKEND_HEALTH, { timeoutMs: 800 });
    if (probe.status !== 200) { outageObserved = true; break; }
    await sleep(50);
  }
  assert.ok(outageObserved, 'the kill must make :8080 unreachable (drill precondition)');

  // Phase 2: measure daemon auto-heal — a NEW listener answering HTTP 200.
  let recoveredMs = null;
  let lastProbe = null;
  while (Date.now() - t0 < RECOVERY_BUDGET_MS + 4000) {
    const probe = await request(BACKEND_HEALTH, { timeoutMs: 800 });
    lastProbe = probe;
    if (probe.status === 200) { recoveredMs = Date.now() - t0; break; }
    await sleep(100);
  }
  assert.ok(
    recoveredMs !== null,
    `backend never recovered (last probe: status=${lastProbe?.status}${lastProbe?.error ? ` error=${lastProbe.error}` : ''})`
  );

  const healedPid = portListenerPid(8080);
  assert.ok(healedPid, 'the healed listener must own :8080');
  assert.notEqual(healedPid, doomedPid, 'recovery must be a NEW process, never the killed one');

  console.log(`[DIR-053] T4 CRASH_RECOVERY_MS=${recoveredMs} (killed PID ${doomedPid} -> healed PID ${healedPid}, budget ${RECOVERY_BUDGET_MS}ms)`);
  assert.ok(recoveredMs < RECOVERY_BUDGET_MS, `auto-recovery took ${recoveredMs}ms (>${RECOVERY_BUDGET_MS}ms budget, AC-4 violated)`);
});

test('T5: after the self-heal the full chain serves the 15 resumes again (zero user-visible loss)', { skip: WIN_ONLY }, async () => {
  const ready = await request(BACKEND_READY);
  assert.equal(ready.status, 200, `/readyz must answer 200 after auto-heal, got ${ready.status}`);
  assert.equal(ready.json?.status, 'ready', `expected readiness status "ready", got ${JSON.stringify(ready.json?.status)}`);

  const livePid = portListenerPid(8080);
  const managedPid = readPidFile(BACKEND_PID_FILE);
  assert.equal(
    managedPid, livePid,
    `backend_api.pid (${managedPid}) must track the live listener (${livePid}) — managed lifecycle (AC-1)`
  );

  const throughProxy = await request('http://localhost/api/resumes', {
    headers: { Authorization: `Bearer ${candidateToken()}` },
  });
  assert.equal(
    throughProxy.status, 200,
    `Apache proxy -> API -> MariaDB must serve resumes after the heal, got ${throughProxy.status}`
  );
  assert.equal(
    throughProxy.json?.resumes?.length, EXPECTED_RESUME_COUNT,
    `expected ${EXPECTED_RESUME_COUNT} resumes through the proxy after the heal, got ${throughProxy.json?.resumes?.length}`
  );
  console.log(`[DIR-053] T5 proxy->API->MariaDB re-verified ${throughProxy.json.resumes.length} resumes after auto-heal (listener PID ${livePid})`);
});


