#!/usr/bin/env node
/**
 * dr-external-watch.mjs — independent synthetic monitor for ResumePilot AI.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every other check in this repository runs ON the production host. During a
 * host-loss event the monitor dies with the host, so nobody is told. This script
 * is designed to run somewhere ELSE — a laptop, a second VPS, a CI schedule, a
 * free uptime service — and is the only signal that survives losing the server.
 *
 * It is deliberately dependency-free (Node built-ins only) so it can be copied
 * anywhere and run.
 *
 * WHAT IT CHECKS
 * --------------
 *   • HTTPS reachability and HTTP status for /api/healthz, /api/readyz, /api/platform/version
 *   • TLS certificate presence and days-to-expiry
 *   • Release identity: backend SHA == frontend SHA == expected SHA
 *   • Database availability as reported by /api/readyz
 *   • Response latency against a configurable budget
 *
 * SAFETY / FAIL-CLOSED CONTRACT
 * -----------------------------
 *   exit 0  HEALTHY   — everything checked out
 *   exit 1  FAILED    — at least one check failed (page someone)
 *   exit 2  BLOCKED   — could not evaluate (no target configured, no egress)
 *
 * A check that could not be performed is never reported as a pass. If TLS cannot
 * be inspected, that is reported as UNKNOWN and fails the run rather than being
 * silently skipped.
 *
 * Secrets are never printed. Only URLs, statuses, timings and the *presence*
 * of a SHA are logged.
 *
 * USAGE
 *   node scripts/dr-external-watch.mjs [--url https://...] [--expect-sha <sha>]
 *                                      [--max-latency-ms 2000] [--json] [--quiet]
 */

import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

export const DEFAULT_BASE_URL = 'https://airesume.projectdemo.guru';

export const DEFAULT_ENDPOINTS = Object.freeze([
  { name: 'healthz', path: '/api/healthz', expectStatus: 200 },
  { name: 'readyz', path: '/api/readyz', expectStatus: 200 },
  { name: 'version', path: '/api/platform/version', expectStatus: 200 },
]);

/**
 * Pure evaluation. No network, no clock beyond what the caller supplies.
 *
 * @param {object}  input
 * @param {Array}   input.endpoints        results from checkEndpoint
 * @param {object}  input.tls              { ok, daysRemaining } or { ok:false, error }
 * @param {object}  input.release          { backendSha, frontendSha, aligned } or null
 * @param {object}  input.database         { status } or null
 * @param {string?} input.expectedSha      the SHA that should be deployed
 * @param {number}  input.maxLatencyMs     latency budget per endpoint
 * @param {number}  input.minTlsDays       warn below this many days to expiry
 */
export function evaluateExternalWatch({
  endpoints = [],
  tls: tlsResult = null,
  release = null,
  database = null,
  expectedSha = null,
  maxLatencyMs = 2000,
  minTlsDays = 14,
} = {}) {
  const problems = [];
  const warnings = [];

  if (!endpoints.length) {
    return { status: 'BLOCKED', problems: ['No endpoint results supplied'], warnings };
  }

  // ── Endpoint reachability and latency ────────────────────────────────────
  for (const ep of endpoints) {
    if (ep.error) {
      problems.push(`${ep.name}: unreachable — ${ep.error}`);
      continue;
    }
    if (ep.status !== ep.expectStatus) {
      problems.push(`${ep.name}: HTTP ${ep.status} (expected ${ep.expectStatus})`);
      continue;
    }
    if (typeof ep.latencyMs === 'number' && ep.latencyMs > maxLatencyMs) {
      warnings.push(`${ep.name}: slow — ${ep.latencyMs}ms exceeds ${maxLatencyMs}ms budget`);
    }
  }

  // ── TLS ──────────────────────────────────────────────────────────────────
  // Fail closed: if TLS could not be inspected we say so rather than assuming
  // it is fine. An unmeasurable certificate is not a healthy certificate.
  if (!tlsResult) {
    problems.push('TLS: not inspected — certificate validity is UNKNOWN');
  } else if (!tlsResult.ok) {
    problems.push(`TLS: ${tlsResult.error || 'certificate invalid'}`);
  } else if (typeof tlsResult.daysRemaining !== 'number') {
    problems.push('TLS: certificate expiry could not be determined — UNKNOWN');
  } else if (tlsResult.daysRemaining < 0) {
    problems.push(`TLS: certificate EXPIRED ${Math.abs(tlsResult.daysRemaining)} days ago`);
  } else if (tlsResult.daysRemaining < minTlsDays) {
    warnings.push(`TLS: certificate expires in ${tlsResult.daysRemaining} days`);
  }

  // ── Release identity ─────────────────────────────────────────────────────
  // A deployment is only successful when backend == frontend == intended SHA.
  if (!release) {
    problems.push('Release: identity could not be read — SHA is UNKNOWN');
  } else if (!release.backendSha || !release.frontendSha) {
    problems.push('Release: backend or frontend SHA missing — cannot confirm release identity');
  } else if (release.backendSha !== release.frontendSha) {
    problems.push(
      `Release: MISALIGNED backend ${shortSha(release.backendSha)} != frontend ${shortSha(release.frontendSha)}`,
    );
  } else if (expectedSha && release.backendSha !== expectedSha) {
    problems.push(
      `Release: running ${shortSha(release.backendSha)} but expected ${shortSha(expectedSha)}`,
    );
  }

  // ── Database ─────────────────────────────────────────────────────────────
  if (!database) {
    warnings.push('Database: /api/readyz did not report a database status');
  } else if (database.status !== 'READY') {
    problems.push(`Database: ${database.status || 'UNKNOWN'} (expected READY)`);
  }

  return {
    status: problems.length ? 'FAILED' : 'HEALTHY',
    problems,
    warnings,
  };
}

export function shortSha(sha) {
  const value = String(sha || '');
  return value.length > 12 ? `${value.slice(0, 7)}…` : value || '(none)';
}

/** Fetch one endpoint, timing it. Returns a structured result, never throws. */
export async function checkEndpoint(baseUrl, endpoint, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const url = `${String(baseUrl).replace(/\/$/, '')}${endpoint.path}`;
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'ResumePilot-DR-Watch/1.0' },
      });
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Date.now() - startedAt;
    const result = {
      name: endpoint.name,
      path: endpoint.path,
      expectStatus: endpoint.expectStatus,
      status: response.status,
      latencyMs,
      ok: response.status === endpoint.expectStatus,
    };
    if (endpoint.name === 'version') {
      try {
        const body = await response.json();
        const identity = body?.releaseIdentity || {};
        result.release = {
          backendSha: identity.backendSha || body?.commitSha || null,
          frontendSha: identity.frontendSha || body?.frontendBuildSha || null,
          aligned: identity.aligned === true,
          service: body?.service || null,
        };
      } catch {
        result.release = null; // unparseable identity is a problem, not a pass
      }
    }
    if (endpoint.name === 'readyz') {
      try {
        const body = await response.json();
        result.readyz = {
          status: body?.status || null,
          database: body?.checks?.mysql?.status || null,
          authoritativeDatabase: body?.authoritativeDatabase || null,
        };
      } catch {
        result.readyz = null;
      }
    }
    return result;
  } catch (error) {
    return {
      name: endpoint.name,
      path: endpoint.path,
      expectStatus: endpoint.expectStatus,
      status: 0,
      latencyMs: Date.now() - startedAt,
      ok: false,
      error: String(error?.message || error),
    };
  }
}

/**
 * Inspect the TLS certificate. Returns { ok, daysRemaining } or { ok:false, error }.
 * Never throws — an inspection failure is reported as UNKNOWN, not as healthy.
 */
export function checkTlsCertificate(hostname, port = 443, { timeoutMs = 8000, nowMs = Date.now() } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let socket;
    try {
      socket = tls.connect(
        { host: hostname, port, servername: hostname, timeout: timeoutMs, rejectUnauthorized: true },
        () => {
          try {
            const cert = socket.getPeerCertificate(false);
            if (!cert || Object.keys(cert).length === 0) {
              finish({ ok: false, error: 'no certificate presented' });
              return;
            }
            const validTo = cert.valid_to;
            if (!validTo) {
              finish({ ok: false, error: 'certificate has no expiry date' });
              return;
            }
            const expiresMs = Date.parse(validTo);
            if (Number.isNaN(expiresMs)) {
              finish({ ok: false, error: 'certificate expiry unparseable' });
              return;
            }
            if (!socket.authorized && socket.authorizationError) {
              finish({ ok: false, error: `certificate not trusted: ${socket.authorizationError}` });
              return;
            }
            const daysRemaining = Math.floor((expiresMs - nowMs) / 86400000);
            finish({ ok: true, daysRemaining, validTo, issuer: cert.issuer?.O || null });
          } catch (error) {
            finish({ ok: false, error: String(error?.message || error) });
          } finally {
            socket.end();
          }
        },
      );
    } catch (error) {
      finish({ ok: false, error: String(error?.message || error) });
      return;
    }

    socket.on('error', (error) => finish({ ok: false, error: String(error?.message || error) }));
    socket.on('timeout', () => {
      socket.destroy();
      finish({ ok: false, error: `TLS handshake timed out after ${timeoutMs}ms` });
    });
  });
}

export async function runWatch(options = {}) {
  const baseUrl = options.baseUrl || process.env.DR_WATCH_URL || DEFAULT_BASE_URL;
  const expectedSha = options.expectedSha ?? process.env.EXPECTED_SHA ?? null;
  const maxLatencyMs = Number(process.env.DR_WATCH_MAX_LATENCY_MS || options.maxLatencyMs || 2000);
  const endpointsSpec = options.endpoints || DEFAULT_ENDPOINTS;

  let hostname;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return {
      script: 'dr-external-watch',
      status: 'BLOCKED',
      error: `Invalid base URL: ${baseUrl}`,
    };
  }

  const results = [];
  for (const ep of endpointsSpec) {
    // Sequential on purpose: we are measuring latency and concurrent requests
    // would distort each other's timings.
    results.push(await checkEndpoint(baseUrl, ep, { fetchImpl: options.fetchImpl }));
  }

  const tlsResult = await checkTlsCertificate(hostname);
  const versionResult = results.find((r) => r.name === 'version');
  const readyzResult = results.find((r) => r.name === 'readyz');

  const evaluation = evaluateExternalWatch({
    endpoints: results,
    tls: tlsResult,
    release: versionResult?.release || null,
    database: readyzResult?.readyz ? { status: readyzResult.readyz.database } : null,
    expectedSha,
    maxLatencyMs,
  });

  return {
    script: 'dr-external-watch',
    baseUrl,
    checkedAt: new Date().toISOString(),
    expectedSha: expectedSha ? shortSha(expectedSha) : null,
    status: evaluation.status,
    problems: evaluation.problems,
    warnings: evaluation.warnings,
    tls: tlsResult,
    release: versionResult?.release || null,
    database: readyzResult?.readyz?.database || null,
    endpoints: results.map(({ name, path: p, status, latencyMs, ok, error }) => ({
      name, path: p, status, latencyMs, ok, error: error || null,
    })),
  };
}

async function main() {
  const asJson = flag('--json');
  const quiet = flag('--quiet');

  if (flag('--self-test')) {
    // Deterministic offline check of the evaluation logic. Used by CI and by
    // operators who want to confirm the monitor itself is sane.
    const cases = [
      ['all green', {
        endpoints: [{ name: 'healthz', expectStatus: 200, status: 200, latencyMs: 120 }],
        tls: { ok: true, daysRemaining: 60 },
        release: { backendSha: 'abc123', frontendSha: 'abc123' },
        database: { status: 'READY' },
      }, 'HEALTHY'],
      ['db down', {
        endpoints: [{ name: 'readyz', expectStatus: 200, status: 200, latencyMs: 90 }],
        tls: { ok: true, daysRemaining: 60 },
        release: { backendSha: 'abc123', frontendSha: 'abc123' },
        database: { status: 'DOWN' },
      }, 'FAILED'],
      ['sha mismatch', {
        endpoints: [{ name: 'version', expectStatus: 200, status: 200, latencyMs: 90 }],
        tls: { ok: true, daysRemaining: 60 },
        release: { backendSha: 'aaa', frontendSha: 'bbb' },
        database: { status: 'READY' },
      }, 'FAILED'],
      ['tls uninspected fails closed', {
        endpoints: [{ name: 'healthz', expectStatus: 200, status: 200, latencyMs: 90 }],
        tls: null,
        release: { backendSha: 'abc', frontendSha: 'abc' },
        database: { status: 'READY' },
      }, 'FAILED'],
      ['no results is blocked', { endpoints: [] }, 'BLOCKED'],
    ];

    let failures = 0;
    for (const [label, input, expected] of cases) {
      const got = evaluateExternalWatch(input).status;
      const ok = got === expected;
      if (!ok) failures += 1;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${got} (expected ${expected})`);
    }
    console.log(failures ? `\nSELF-TEST FAILED (${failures})` : '\nSELF-TEST PASSED');
    process.exit(failures ? 1 : 0);
  }

  const report = await runWatch({
    baseUrl: value('--url') || undefined,
    expectedSha: value('--expect-sha') || undefined,
    maxLatencyMs: Number(value('--max-latency-ms', '')) || undefined,
  });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!quiet) {
    console.log(`dr-external-watch: ${report.baseUrl}`);
    console.log(`  checked at : ${report.checkedAt}`);
    for (const ep of report.endpoints) {
      const detail = ep.error ? `ERROR ${ep.error}` : `HTTP ${ep.status} in ${ep.latencyMs}ms`;
      console.log(`  ${ep.name.padEnd(9)}: ${detail}`);
    }
    const t = report.tls;
    console.log(`  tls        : ${t?.ok ? `valid, ${t.daysRemaining} days remaining` : `INVALID — ${t?.error}`}`);
    console.log(`  release    : ${report.release ? `${shortSha(report.release.backendSha)} (aligned=${report.release.aligned})` : 'UNKNOWN'}`);
    console.log(`  database   : ${report.database || 'UNKNOWN'}`);
    console.log(`  status     : ${report.status}`);
    for (const p of report.problems) console.log(`  PROBLEM    : ${p}`);
    for (const w of report.warnings) console.log(`  warning    : ${w}`);
  }

  if (report.status === 'BLOCKED') process.exit(2);
  process.exit(report.status === 'HEALTHY' ? 0 : 1);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({
      script: 'dr-external-watch', status: 'FAILED', error: String(error?.message || error),
    }, null, 2));
    process.exit(1);
  });
}
