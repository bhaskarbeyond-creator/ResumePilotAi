#!/usr/bin/env node
/**
 * Post-deploy smoke check against a running deployment (REC-017, tier "smoke").
 *
 * Runs in under two minutes, needs no database credentials, and is the gate a deploy waits
 * on before it receives traffic. It is deliberately separate from
 * `backend/test/smoke.test.js`: that one boots the app in-process to prove the *build* is
 * sound; this one proves the *deployment* is — real DNS, real TLS, real proxy, real
 * replica set.
 *
 * ## What it checks
 *
 *  1. liveness and readiness answer 200 over the public ingress;
 *  2. every anonymous-guarded critical path answers 401/403, never 5xx;
 *  3. the built SPA is served (index.html contains the module entry point);
 *  4. the critical-path latency budget holds (p95 of 20 sequential probes < 500ms);
 *  5. the version marker is present, so a smoke pass is attributable to a build.
 *
 * ## Usage
 *
 *   node scripts/smoke.mjs                        # http://127.0.0.1:4000
 *   node scripts/smoke.mjs --base https://app.example.com
 *   node scripts/smoke.mjs --json                 # machine-readable
 *
 * Exit code 0 only when every check passes. A single failure means "do not route traffic".
 */

const argv = process.argv.slice(2);
const baseIndex = argv.indexOf('--base');
const BASE = (baseIndex >= 0 ? argv[baseIndex + 1] : process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
const AS_JSON = argv.includes('--json');
const TIMEOUT_MS = 5_000;

/** @type {Array<{name: string, ok: boolean, detail: string, ms?: number}>} */
const results = [];

/**
 * @param {string} path
 * @param {{accept?: string, method?: string}} [options]
 */
async function probe(path, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: options.method || 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: options.accept || 'application/json', 'user-agent': 'resumepilot-smoke/1' },
    });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, text: '', headers: new Headers(), ms: Date.now() - started, error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function record(name, ok, detail, ms) {
  results.push({ name, ok, detail, ms });
}

/* 1. liveness and readiness ------------------------------------------------ */

for (const path of ['/healthz', '/api/healthz']) {
  /* eslint-disable no-await-in-loop */
  const response = await probe(path);
  record(`${path} answers 200`, response.status === 200, `status=${response.status} ${response.error || ''}`.trim(), response.ms);
}

/* 2. anonymous guards ------------------------------------------------------ */

const GUARDED = [
  '/api/me/capabilities',
  '/api/admin/config',
  '/api/admin/rbac/roles',
  '/api/admin/audit-logs',
  '/api/config/runtime',
];

for (const path of GUARDED) {
  const response = await probe(path);
  // 401/403 are both correct. A 3xx is not: it means the ingress redirected an API
  // caller to a login page, which breaks every client that expects JSON.
  const ok = [401, 403].includes(response.status);
  record(`${path} refuses anonymous`, ok, `status=${response.status}`, response.ms);
}

/* 3. the SPA is served ----------------------------------------------------- */

{
  const response = await probe('/', { accept: 'text/html' });
  const hasShell = /<div id="root"|<script[^>]+type="module"/.test(response.text);
  record('the SPA shell is served', response.status === 200 && hasShell,
    `status=${response.status} shell=${hasShell} bytes=${response.text.length}`, response.ms);
}

/* 4. latency budget -------------------------------------------------------- */

{
  const samples = [];
  for (let index = 0; index < 20; index += 1) {
    const response = await probe('/healthz');
    if (response.status === 200) samples.push(response.ms);
  }
  samples.sort((left, right) => left - right);
  const p95 = samples.length ? samples[Math.floor(samples.length * 0.95)] : Infinity;
  // The budget is deliberately generous — smoke runs over a public network. What it
  // catches is a deployment that is answering but pathologically slow (a cold pool, a
  // misconfigured proxy), not normal jitter.
  record('critical-path p95 under 500ms', p95 <= 500, `p95=${p95}ms over ${samples.length} probes`);
}

/* 5. version marker -------------------------------------------------------- */

{
  const response = await probe('/healthz');
  let version = null;
  try {
    const body = JSON.parse(response.text);
    version = body.commitSha || body.version || body.build || null;
  } catch {
    version = null;
  }
  // Presence matters, exact value does not: this is what makes a smoke pass attributable
  // to a specific build when a later incident asks "what was running at 14:02".
  record('the liveness payload identifies the build', Boolean(version), `version=${version ?? 'absent'}`, response.ms);
}

/* report ------------------------------------------------------------------ */

const failures = results.filter((entry) => !entry.ok);
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  checks: results,
  passed: results.length - failures.length,
  failed: failures.length,
  durationMs: results.reduce((sum, entry) => sum + (entry.ms || 0), 0),
};

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Smoke against ${BASE}`);
  for (const entry of results) {
    console.log(`  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.ms ? ` (${entry.ms}ms)` : ''}${entry.ok ? '' : ` — ${entry.detail}`}`);
  }
  console.log(failures.length === 0 ? `PASS (${results.length} checks, ${report.durationMs}ms)` : `FAIL (${failures.length}/${results.length})`);
}

process.exit(failures.length === 0 ? 0 : 1);
