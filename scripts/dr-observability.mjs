#!/usr/bin/env node
/**
 * dr-observability.mjs — production health, architecture-invariant and release
 * identity probe.
 *
 * Complements dr-monitor.mjs, which watches BACKUPS. This watches the RUNNING
 * SERVICE: is it up, how slow is it, and does it still obey the architecture
 * invariants (MariaDB authoritative, Firestore removed, Firebase identity-only)?
 *
 * Why latency is sampled rather than measured once: a single probe cannot
 * distinguish "fast" from "fast right now". Percentiles over N samples are the
 * smallest honest unit of performance evidence.
 *
 * Usage
 *   node scripts/dr-observability.mjs [--base <origin>] [--samples 5] [--json] [--quiet]
 *
 * Environment
 *   PRODUCTION_URL            default https://airesume.projectdemo.guru
 *   DR_OBSERVABILITY_SAMPLES  default 5
 *   BACKUP_ALERT_WEBHOOK_URL  optional; JSON POST on any non-OK status
 *   EXPECTED_SHA              optional; fails if production is not running it
 *
 * Exit codes: 0 healthy, 1 degraded, 2 critical, 3 could not evaluate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const AS_JSON = argv.includes('--json');
const QUIET = argv.includes('--quiet');
const BASE = (value('--base', process.env.PRODUCTION_URL || 'https://airesume.projectdemo.guru')).replace(/\/+$/, '');
const SAMPLES = Math.max(1, Math.min(Number(value('--samples', process.env.DR_OBSERVABILITY_SAMPLES || 5)) || 5, 50));
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim().toLowerCase() || null;
const TIMEOUT_MS = 15000;

/** Percentile via linear interpolation on a sorted copy (nearest-rank would under-report). */
export function percentile(sortedAsc, p) {
  if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedAsc[lower];
  return sortedAsc[lower] + (sortedAsc[upper] - sortedAsc[lower]) * (rank - lower);
}

export function summarise(samples) {
  const ok = samples.filter((s) => s.ok);
  const latencies = ok.map((s) => s.latencyMs).sort((a, b) => a - b);
  return {
    attempts: samples.length,
    successes: ok.length,
    failures: samples.length - ok.length,
    successRate: samples.length ? Number((ok.length / samples.length).toFixed(4)) : 0,
    latencyMs: latencies.length
      ? {
        min: latencies[0],
        p50: Number(percentile(latencies, 50).toFixed(2)),
        p95: Number(percentile(latencies, 95).toFixed(2)),
        p99: Number(percentile(latencies, 99).toFixed(2)),
        max: latencies[latencies.length - 1],
      }
      : null,
  };
}

async function probeUrl(url, { accept = 'application/json' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = process.hrtime.bigint();
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept }, cache: 'no-store' });
    const text = await response.text();
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* non-JSON is a finding, not a crash */ }
    return { ok: response.ok, status: response.status, latencyMs: Number(latencyMs.toFixed(2)), json, text };
  } catch (error) {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    return { ok: false, status: 0, latencyMs: Number(latencyMs.toFixed(2)), json: null, error: String(error.message || error).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

async function sample(path) {
  const runs = [];
  for (let i = 0; i < SAMPLES; i += 1) runs.push(await probeUrl(`${BASE}${path}`));
  return { path, summary: summarise(runs), last: runs[runs.length - 1] };
}

/**
 * Architecture invariants. Each is asserted against the LIVE payload, so a
 * future change that quietly reintroduces Firestore or swaps the authoritative
 * datastore is detected rather than assumed absent.
 */
export function checkInvariants({ healthz, readyz }) {
  const checks = [];
  const push = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), status: pass ? 'PASS' : 'FAIL', detail });

  const readyJson = readyz?.last?.json || null;
  const healthJson = healthz?.last?.json || null;

  // Fail-closed helper: collect every value the service reports for a
  // property, and require that NONE of them contradicts the invariant.
  // An earlier revision used OR, which meant one healthy source could mask a
  // violation reported by the other - exactly the failure this is meant to
  // catch. Unreported is also a failure: silence is not compliance.
  const reported = (...values) => values.filter((v) => v !== undefined && v !== null && v !== '');
  const everyIs = (expected) => (values) => values.length > 0 && values.every((v) => v === expected);

  const authority = reported(healthJson?.authoritativeDatabase, readyJson?.authoritativeDatabase);
  push('MariaDB is the authoritative datastore', everyIs('MARIADB')(authority), authority.join(', ') || 'not reported');

  const firestore = reported(healthJson?.firestoreDataPlane, readyJson?.checks?.firestoreDataPlane);
  push('Firestore data plane is removed', everyIs('REMOVED')(firestore), firestore.join(', ') || 'not reported');

  const identityConfigured = healthJson?.identityProviderConfigured === true
    || healthJson?.firebaseAdminConfigured === true
    || readyJson?.checks?.identityProvider === 'CONFIGURED';
  push(
    'Firebase is enabled for identity only',
    identityConfigured === true,
    `identityProviderConfigured=${healthJson?.identityProviderConfigured} identityProvider=${readyJson?.checks?.identityProvider}`,
  );

  const mariadbHealthy = reported(
    readyJson?.checks?.mysql?.status,
    healthJson?.databases?.mariadb?.healthy === true ? 'READY'
      : healthJson?.databases?.mariadb?.healthy === false ? 'DOWN' : null,
  );
  push('MariaDB reports healthy', everyIs('READY')(mariadbHealthy), mariadbHealthy.join(', ') || 'not reported');

  const schema = reported(readyJson?.checks?.schema);
  push('Schema is initialised', everyIs('INITIALIZED')(schema), schema.join(', ') || 'not reported');

  const queue = reported(readyJson?.checks?.enterprise?.queue);
  push('Queue is the MariaDB transactional outbox (no Redis)', everyIs('mysql-transactional-outbox')(queue), queue.join(', ') || 'not reported');

  const quota = reported(readyJson?.checks?.enterprise?.quotaStore);
  push('Quota store is MariaDB-owned (no Redis)', everyIs('mariadb-atomic')(quota), quota.join(', ') || 'not reported');

  const failed = checks.filter((c) => !c.pass);
  return { checks, passed: checks.length - failed.length, failed: failed.length, status: failed.length === 0 ? 'PASS' : 'FAIL' };
}

async function sendAlert(payload) {
  const url = process.env.BACKUP_ALERT_WEBHOOK_URL;
  if (!url) return { sent: false, reason: 'BACKUP_ALERT_WEBHOOK_URL is not configured' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal,
    });
    clearTimeout(timer);
    return { sent: response.ok, status: response.status };
  } catch (error) {
    return { sent: false, error: String(error.message || error).slice(0, 200) };
  }
}

async function main() {
  const startedAt = new Date().toISOString();

  if (!/^https?:\/\/[^\s]+$/.test(BASE)) {
    console.error(JSON.stringify({ script: 'dr-observability', status: 'BLOCKED', error: `Invalid base URL: ${BASE}` }, null, 2));
    process.exit(3);
  }

  const [healthz, readyz, version] = await Promise.all([
    sample('/api/healthz'),
    sample('/api/readyz'),
    sample('/api/platform/version'),
  ]);

  const problems = [];
  const last = version.last?.json || {};
  const backendSha = last.commitSha || healthz.last?.json?.commitSha || null;
  const frontendSha = last.frontendBuildSha || null;

  if (healthz.summary.successes === 0) problems.push('HEALTHZ_UNREACHABLE');
  else if (healthz.last.json?.status !== 'ok') problems.push('HEALTHZ_NOT_OK');
  if (readyz.summary.successes === 0) problems.push('READYZ_UNREACHABLE');
  else if (readyz.last.json?.status !== 'ready') problems.push('READYZ_NOT_READY');
  if (backendSha && EXPECTED_SHA && backendSha.toLowerCase() !== EXPECTED_SHA) problems.push('SHA_MISMATCH');

  const invariants = checkInvariants({ healthz, readyz });
  if (invariants.status === 'FAIL') problems.push('ARCHITECTURE_INVARIANT_VIOLATION');

  let status = 'OK';
  if (problems.includes('HEALTHZ_UNREACHABLE') || problems.includes('READYZ_UNREACHABLE')) status = 'CRITICAL';
  else if (problems.length > 0) status = 'DEGRADED';

  const report = {
    script: 'dr-observability',
    base: BASE,
    evaluatedAt: startedAt,
    samplesPerEndpoint: SAMPLES,
    endpoints: {
      healthz: healthz.summary,
      readyz: readyz.summary,
      version: version.summary,
    },
    releaseIdentity: {
      backendSha,
      frontendSha,
      aligned: Boolean(backendSha && frontendSha) && backendSha === frontendSha,
      expectedSha: EXPECTED_SHA,
      frontendShaReported: Boolean(frontendSha),
    },
    database: {
      version: readyz.last?.json?.checks?.mysql?.version || null,
      host: readyz.last?.json?.checks?.mysql?.host || null,
      name: readyz.last?.json?.checks?.mysql?.database || null,
      status: readyz.last?.json?.checks?.mysql?.status || null,
    },
    invariants,
    problems,
    status,
  };

  const exitCode = status === 'OK' ? 0 : status === 'CRITICAL' ? 2 : 1;
  report.exitCode = exitCode;
  report.alert = exitCode === 0 ? { sent: false, reason: 'status is healthy' } : await sendAlert(report);

  if (AS_JSON) console.log(JSON.stringify(report, null, 2));
  else if (!QUIET) {
    console.log(`dr-observability: ${BASE}`);
    console.log(`  healthz  : ${healthz.summary.successes}/${healthz.summary.attempts} ok, p50 ${healthz.summary.latencyMs?.p50 ?? 'n/a'}ms p95 ${healthz.summary.latencyMs?.p95 ?? 'n/a'}ms`);
    console.log(`  readyz   : ${readyz.summary.successes}/${readyz.summary.attempts} ok, p50 ${readyz.summary.latencyMs?.p50 ?? 'n/a'}ms p95 ${readyz.summary.latencyMs?.p95 ?? 'n/a'}ms`);
    console.log(`  version  : ${version.summary.successes}/${version.summary.attempts} ok`);
    console.log(`  backend  : ${backendSha || 'unreported'}`);
    console.log(`  frontend : ${frontendSha || 'NOT REPORTED (deploy the release-identity change to enable)'}`);
    console.log(`  errors   : ${invariants.passed}/${invariants.checks.length} invariants pass`);
    console.log(`  status   : ${status}${problems.length ? ` [${problems.join(', ')}]` : ''}`);
    if (process.env.DR_OBSERVABILITY_WRITE) {
      fs.writeFileSync(process.env.DR_OBSERVABILITY_WRITE, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    }
  }

  process.exit(exitCode);
}

// Only auto-run when invoked as a script. Without this guard, importing the
// module (as the unit tests do) would start probing the network and call
// process.exit() in the middle of someone else's test run.
const invokedDirectly = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ script: 'dr-observability', status: 'EVALUATION_FAILED', error: String(error.message || error) }, null, 2));
    process.exit(3);
  });
}
