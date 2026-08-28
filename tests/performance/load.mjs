/**
 * PERFORMANCE CERTIFICATION HARNESS (mission §4)
 *
 * Implements tests/performance/SPEC.md — thresholds were defined BEFORE this
 * run. Boots the real backend against the real MySQL database and drives
 * fixed-concurrency load per scenario, measuring p50/p95/p99, throughput,
 * error rate, backend RSS, and live MySQL connection counts.
 *
 * Evidence output: .arena/evidence/performance-report.json
 */
import { bootServer, certToken } from '../certification/helpers/bootServer.mjs';
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_DIR = path.join(ROOT, '.arena', 'evidence');

const PORT = 8313;
const DB = {
  host: process.env.PERF_MARIADB_HOST || '127.0.0.1',
  port: process.env.PERF_MARIADB_PORT || '3306',
  user: process.env.PERF_MARIADB_USER || 'resumepilot',
  password: process.env.PERF_MARIADB_PASSWORD || '',
  name: process.env.PERF_MARIADB_DATABASE || 'ai_resume_builder',
};

// Thresholds — copied verbatim from tests/performance/SPEC.md (defined first).
const THRESHOLDS = {
  resumeRead:   { p50: 80,  p95: 150,  p99: 400,  errorRate: 0.001 },
  resumeSave:   { p50: 150, p95: 300,  p99: 800,  errorRate: 0.005 },
  mixedReads:   { p50: 100, p95: 200,  p99: 500,  errorRate: 0.001 },
  aiFallback:   { p50: 250, p95: 500,  p99: 1000, errorRate: 0.0 },
  aiFailure:    { maxMs: 6000, errorRate: 0.0 },
  docxExport:   { p50: 2500, p95: 5000, p99: 8000, errorRate: 0.0 },
  poolPressure: { p50: 300, p95: 1000, p99: 2000, errorRate: 0.01 },
  rssGrowthPct: 30,
};

const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;

function summarize(latencies, errors) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    count: latencies.length,
    errors,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

async function runScenario({ name, concurrency, total, durationMs, request }) {
  const latencies = [];
  let errors = 0;
  let expectedCodes = 0;
  const errorStatuses = {};
  const stopAt = durationMs ? Date.now() + durationMs : Infinity;
  let issued = 0;

  const worker = async () => {
    while (Date.now() < stopAt && (durationMs || issued < total)) {
      const myIndex = issued++;
      if (!durationMs && myIndex >= total) break;
      const start = process.hrtime.bigint();
      try {
        const { status, expected } = await request(myIndex);
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        latencies.push(ms);
        if (expected) expectedCodes += 1;
        else if (status >= 400) { errors += 1; errorStatuses[status] = (errorStatuses[status] || 0) + 1; }
      } catch (_e) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        latencies.push(ms);
        errors += 1;
        errorStatuses.network = (errorStatuses.network || 0) + 1;
      }
    }
  };

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wallSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
  const stats = summarize(latencies, errors);
  stats.scenario = name;
  stats.expectedCodes = expectedCodes;
  stats.throughputRps = Math.round((latencies.length / wallSec) * 10) / 10;
  stats.errorRate = latencies.length ? errors / latencies.length : 0;
  stats.errorStatuses = errorStatuses;
  stats.wallSec = Math.round(wallSec * 10) / 10;
  return stats;
}

const json = async (base, method, url, { token, body } = {}) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null; try { parsed = JSON.parse(text); } catch (_e) { /* binary */ }
  return { status: res.status, body: parsed, bytes: Buffer.byteLength(text) };
};

async function main() {
  if (!DB.password) throw new Error('PERF_MARIADB_PASSWORD is required for the disposable benchmark database');
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const db = await mysql.createConnection({ host: DB.host, port: Number(DB.port), user: DB.user, password: DB.password, database: DB.name });

  // Scenario environment: AI provider pointed at an unreachable endpoint so
  // both the fallback path AND the provider-failure path are exercised.
  const server = await bootServer({
    port: PORT,
    db: DB,
    extraEnv: {
      OPENAI_API_KEY: 'perf-test-key',
      OPENAI_BASE_URL: 'http://127.0.0.1:9/v1', // port 9 (discard) — immediate ECONNREFUSED
      OPENAI_MODEL: 'perf-mock',
      // Raise abuse limits so the load test measures the system, not the
      // per-account rate limiter. These are env-configurable production knobs.
      AI_BURST_LIMIT: '1000',
      AI_BURST_WINDOW_MS: '60000',
      AI_BASIC_DAILY_LIMIT: '10000',
      AI_PREMIUM_DAILY_LIMIT: '10000',
      EXPORT_HOURLY_LIMIT: '1000',
      GLOBAL_RATE_LIMIT_MAX: '2000000',
    },
    timeoutMs: 45000,
  });

  // Reap the perf backend even if the harness itself is killed externally.
  const reaper = () => { try { server.proc.kill('SIGKILL'); } catch (_e) { /* noop */ } };
  process.once('SIGTERM', reaper);
  process.once('SIGINT', reaper);

  const rssSamples = [];
  const connSamples = [];
  const sampler = setInterval(async () => {
    try {
      const status = fs.readFileSync(`/proc/${server.proc.pid}/status`, 'utf8');
      const m = status.match(/VmRSS:\s+(\d+) kB/);
      if (m) rssSamples.push({ t: Date.now(), rssMb: Math.round(Number(m[1]) / 1024) });
      const [rows] = await db.query("SELECT COUNT(*) c FROM information_schema.processlist WHERE db = 'ai_resume_builder' OR command != 'Sleep'");
      connSamples.push({ t: Date.now(), connections: rows[0].c });
    } catch (_e) { /* sampling must never break the run */ }
  }, 2000);

  // Clean perf fixtures from any previous run so results are reproducible.
  await db.query("DELETE FROM resumes WHERE id LIKE 'perf\\_%'");
  await db.query("DELETE FROM users WHERE id LIKE 'perf-%'");

  const report = { startedAt: new Date().toISOString(), scenarios: {}, thresholds: THRESHOLDS, failures: [] };
  const check = (name, stats, th) => {
    const fails = [];
    if (th.p50 !== undefined && stats.p50 > th.p50) fails.push(`p50 ${Math.round(stats.p50)}ms > ${th.p50}ms`);
    if (th.p95 !== undefined && stats.p95 > th.p95) fails.push(`p95 ${Math.round(stats.p95)}ms > ${th.p95}ms`);
    if (th.p99 !== undefined && stats.p99 > th.p99) fails.push(`p99 ${Math.round(stats.p99)}ms > ${th.p99}ms`);
    if (th.errorRate !== undefined && stats.errorRate > th.errorRate) fails.push(`error rate ${(stats.errorRate * 100).toFixed(2)}% > ${(th.errorRate * 100).toFixed(2)}%`);
    stats.pass = fails.length === 0;
    if (fails.length) report.failures.push({ scenario: name, fails });
    return stats;
  };

  // Seed: users first (resumes.user_id is FK-bound to users.id), then resumes.
  const userToken = certToken({ uid: 'perf-user', email: 'perf@certification.local', role: 'USER' });
  const paidToken = certToken({ uid: 'perf-paid', email: 'paid@certification.local', role: 'USER' });
  const userProfile = await json(server.base, 'POST', '/api/users-data/profile', {
    token: userToken,
    body: { email: 'perf@certification.local', firstname: 'Perf', lastname: 'User', membership: 'Basic' },
  });
  if (userProfile.status !== 200) throw new Error(`user profile seed failed: ${userProfile.status} ${JSON.stringify(userProfile.body)}`);
  const premiumProfile = await json(server.base, 'POST', '/api/users-data/profile', {
    token: paidToken,
    body: { email: 'paid@certification.local', firstname: 'Perf', lastname: 'Paid', membership: 'Premium', paymentStatus: 'ACTIVE' },
  });
  if (premiumProfile.status !== 200) throw new Error(`paid profile seed failed: ${premiumProfile.status} ${JSON.stringify(premiumProfile.body)}`);

  const seedCount = 12;
  for (let i = 0; i < seedCount; i += 1) {
    const seeded = await json(server.base, 'POST', `/api/resumes/perf_seed_${i}`, {
      token: userToken,
      body: { title: `Perf Seed ${i}`, firstname: 'Perf', lastname: 'User', summary: `Seed resume ${i}` },
    });
    if (seeded.status !== 200) throw new Error(`seed perf_seed_${i} failed: ${seeded.status} ${JSON.stringify(seeded.body)}`);
  }
  const sharedDocId = `perf_shared_${Date.now()}`;
  const sharedSeed = await json(server.base, 'POST', `/api/resumes/${sharedDocId}`, { token: userToken, body: { title: 'Shared Doc' } });
  if (sharedSeed.status !== 200) throw new Error(`seed ${sharedDocId} failed: ${sharedSeed.status} ${JSON.stringify(sharedSeed.body)}`);
  const exportSeed = await json(server.base, 'POST', '/api/resumes/perf_export', { token: paidToken, body: { title: 'Export Doc', firstname: 'Perf', lastname: 'Paid' } });
  if (exportSeed.status !== 200) throw new Error(`seed perf_export failed: ${exportSeed.status} ${JSON.stringify(exportSeed.body)}`);

  // Warmup (excluded from measurement)
  for (let i = 0; i < 100; i += 1) await json(server.base, 'GET', '/api/resumes', { token: userToken });
  await new Promise(r => setTimeout(r, 4200)); // let the sampler capture a post-warmup baseline

  const rssBaseline = rssSamples.length ? rssSamples[rssSamples.length - 1].rssMb : 0;
  // Baseline MySQL connection count BEFORE load — coexisting clients (e.g. the
  // preview backend sharing this database) are excluded from the peak assertion.
  const [baselineConnRows] = await db.query("SELECT COUNT(*) c FROM information_schema.processlist WHERE db = 'ai_resume_builder' OR command != 'Sleep'");
  const connBaseline = baselineConnRows[0].c;

  // 1. Resume list reads
  report.scenarios.resumeRead = check('resumeRead', await runScenario({
    name: 'resumeRead', concurrency: 20, total: 200,
    request: async () => { const r = await json(server.base, 'GET', '/api/resumes', { token: userToken }); return { status: r.status, expected: r.status === 200 }; },
  }), THRESHOLDS.resumeRead);

  // 2. Resume saves (distinct documents)
  report.scenarios.resumeSave = check('resumeSave', await runScenario({
    name: 'resumeSave', concurrency: 10, total: 60,
    request: async (i) => {
      const id = `perf_w_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
      const r = await json(server.base, 'POST', `/api/resumes/${id}`, { token: userToken, body: { title: `W ${i}`, summary: 'load' } });
      return { status: r.status, expected: r.status === 200 };
    },
  }), THRESHOLDS.resumeSave);

  // 3. Same-document concurrent update (consistency, not latency)
  {
    const rounds = 5; const writers = 5;
    let conflicts = 0; let applied = 0; let inconsistent = 0;
    for (let round = 0; round < rounds; round += 1) {
      const before = await json(server.base, 'GET', `/api/resumes/${sharedDocId}`, { token: userToken });
      const rev = Number(before.body.resume.revision || 1);
      const results = await Promise.all(Array.from({ length: writers }, (_, w) =>
        json(server.base, 'POST', `/api/resumes/${sharedDocId}`, {
          token: userToken,
          body: { title: `writer-${round}-${w}`, expectedRevision: rev },
        })));
      const ok = results.filter(r => r.status === 200);
      const conflict = results.filter(r => r.status === 409);
      applied += ok.length;
      conflicts += conflict.length;
      if (ok.length !== 1) inconsistent += 1; // exactly one writer must win per revision round
    }
    const after = await json(server.base, 'GET', `/api/resumes/${sharedDocId}`, { token: userToken });
    const finalRev = Number(after.body.resume.revision || 0);
    report.scenarios.sameDocUpdate = {
      rounds, writers, appliedWins: applied, conflicts, inconsistentRounds: inconsistent,
      finalRevision: finalRev, expectedFinalRevision: 1 + rounds,
      pass: inconsistent === 0 && applied === rounds && conflicts === rounds * (writers - 1) && finalRev === 1 + rounds,
    };
    if (!report.scenarios.sameDocUpdate.pass) report.failures.push({ scenario: 'sameDocUpdate', fails: ['revision-guard consistency violated'] });
  }

  // 4. Authenticated mixed reads
  report.scenarios.mixedReads = check('mixedReads', await runScenario({
    name: 'mixedReads', concurrency: 30, total: 300,
    request: async (i) => {
      const pick = i % 3;
      const r = pick === 0
        ? await json(server.base, 'GET', '/api/users-data/profile', { token: userToken })
        : pick === 1
          ? await json(server.base, 'GET', '/api/resumes', { token: userToken })
          : await json(server.base, 'GET', '/api/platform/public-config', { token: userToken });
      return { status: r.status, expected: r.status === 200 };
    },
  }), THRESHOLDS.mixedReads);

  // 5. AI fallback path (provider unreachable -> deterministic fallback for
  //    operations that define one; controlled 502 for those that don't).
  report.scenarios.aiFallback = check('aiFallback', await runScenario({
    name: 'aiFallback', concurrency: 5, total: 25,
    request: async () => {
      const r = await json(server.base, 'POST', '/api/generate-content', {
        token: userToken,
        body: { operation: 'generate-skills', payload: { jobTitle: 'Software Engineer' } },
      });
      return { status: r.status, expected: r.status === 200 && Array.isArray(r.body?.skills) && r.body.skills.length > 0 };
    },
  }), THRESHOLDS.aiFallback);
  {
    // generate-summary has no content-route fallback by design: the failure
    // must be a CONTROLLED 502 with an error body, quickly — never a hang.
    const startedAt = Date.now();
    const r = await json(server.base, 'POST', '/api/generate-content', {
      token: userToken,
      body: { operation: 'generate-summary', payload: { jobTitle: 'Software Engineer' } },
    });
    const wallMs = Date.now() - startedAt;
    report.scenarios.aiNoFallbackControlled = {
      status: r.status, wallMs,
      hasErrorCode: Boolean(r.body?.error?.code),
      pass: r.status === 502 && Boolean(r.body?.error?.code) && wallMs < 6000,
    };
    if (!report.scenarios.aiNoFallbackControlled.pass) report.failures.push({ scenario: 'aiNoFallbackControlled', fails: ['uncontrolled failure for fallback-less operation'] });
  }

  // 6. AI provider failure — controlled behavior, never hangs
  {
    const startedAt = Date.now();
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      json(server.base, 'POST', '/api/generate-content', {
        token: userToken,
        body: { operation: 'generate-skills', payload: { jobTitle: 'DevOps Engineer' } },
      })));
    const wallMs = Date.now() - startedAt;
    const allControlled = results.every(r => (r.status === 200 && r.body?.skills) || (r.status === 502 && r.body?.error));
    report.scenarios.aiFailure = {
      wallMs, maxAllowedMs: THRESHOLDS.aiFailure.maxMs,
      statuses: results.map(r => r.status),
      pass: allControlled && wallMs < THRESHOLDS.aiFailure.maxMs,
    };
    if (!report.scenarios.aiFailure.pass) report.failures.push({ scenario: 'aiFailure', fails: ['uncontrolled AI failure behavior'] });
  }

  // 7. DOCX export
  report.scenarios.docxExport = check('docxExport', await runScenario({
    name: 'docxExport', concurrency: 3, total: 9,
    request: async () => {
      const res = await fetch(`${server.base}/api/export-docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${paidToken}` },
        body: JSON.stringify({ resumeId: 'perf_export', template: 'Cv1' }),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const expected = res.status === 200 && buf.subarray(0, 2).toString() === 'PK';
      return { status: res.status, expected };
    },
  }), THRESHOLDS.docxExport);

  // 8. Pool pressure — 50 concurrent distinct users for 30 s (per-account
  //    limiters key on uid; one user flooding measures the limiter, not the
  //    database pool — so the pressure is spread across 50 identities).
  const pressureTokens = Array.from({ length: 50 }, (_, i) => certToken({ uid: `perf-pressure-${i}`, email: `p${i}@certification.local`, role: 'USER' }));
  report.scenarios.poolPressure = check('poolPressure', await runScenario({
    name: 'poolPressure', concurrency: 50, durationMs: 30000,
    request: async (i) => { const r = await json(server.base, 'GET', '/api/resumes', { token: pressureTokens[i % pressureTokens.length] }); return { status: r.status, expected: r.status === 200 }; },
  }), THRESHOLDS.poolPressure);

  // Resource gates: RSS is judged on the SETTLED value after load ends
  // (V8 legitimately expands heap under load; a leak is growth that persists).
  await new Promise(r => setTimeout(r, 20000)); // settle: heap GC + pool drain
  clearInterval(sampler);
  const [postRows] = await db.query("SELECT COUNT(*) c FROM information_schema.processlist WHERE command != 'Sleep' OR db = 'ai_resume_builder'");
  const peakConns = connSamples.length ? Math.max(...connSamples.map(s => s.connections)) : 0;
  const peakConnsDelta = Math.max(0, peakConns - connBaseline);
  const rssPeak = rssSamples.length ? Math.max(...rssSamples.map(s => s.rssMb)) : 0;
  const tailSamples = rssSamples.slice(-3);
  const rssSettled = tailSamples.length ? Math.round(tailSamples.reduce((a, s) => a + s.rssMb, 0) / tailSamples.length) : rssPeak;
  const rssGrowthPct = rssBaseline ? Math.round(((rssSettled - rssBaseline) / rssBaseline) * 100) : 0;
  report.resources = {
    rssBaselineMb: rssBaseline, rssPeakMb: rssPeak, rssSettledMb: rssSettled, rssGrowthPct,
    peakDbConnections: peakConns, peakDbConnectionsDelta: peakConnsDelta, connBaseline, poolLimit: 15,
    connectionsAfterSettle: postRows[0].c,
    rssSamples: rssSamples.length, connSamples: connSamples.length,
  };
  if (rssGrowthPct > THRESHOLDS.rssGrowthPct) report.failures.push({ scenario: 'resources', fails: [`settled RSS growth ${rssGrowthPct}% > ${THRESHOLDS.rssGrowthPct}%`] });
  if (peakConnsDelta > 17) report.failures.push({ scenario: 'resources', fails: [`peak DB connection delta ${peakConnsDelta} (baseline ${connBaseline}, peak ${peakConns}) > pool limit + 2`] });

  report.completedAt = new Date().toISOString();
  report.overallPass = report.failures.length === 0;
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'performance-report.json'), JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    overallPass: report.overallPass,
    scenarios: Object.fromEntries(Object.entries(report.scenarios).map(([k, v]) => [k, { pass: v.pass, p50: v.p50, p95: v.p95, p99: v.p99, errorRate: v.errorRate !== undefined ? +(v.errorRate * 100).toFixed(2) + '%' : undefined, rps: v.throughputRps, extra: v.wallMs !== undefined || v.appliedWins !== undefined ? v : undefined }])),
    resources: report.resources,
    failures: report.failures,
  }, null, 2));

  await db.end();
  await server.stop();
  process.exit(report.overallPass ? 0 : 1);
}

main().catch(err => { console.error('PERF HARNESS ERROR:', err); process.exit(2); });
