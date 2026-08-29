#!/usr/bin/env node
/**
 * Reproducible, dependency-free HTTP load harness.
 *
 * Intentionally uses only Node's built-in fetch so it runs in any sandbox or
 * CI without extra packages. It does NOT invent capacity numbers: it reports
 * thresholds and raw latency distribution, and it refuses to claim any
 * "supported throughput" unless a documented baseline exists.
 *
 * Usage (set your own values; never pass secrets):
 *   npm run test:load -- --base https://airesume.projectdemo.guru --endpoint /api/healthz --concurrency 10 --duration 5
 *   npm run test:load -- --endpoint /api/readyz --concurrency 20 --duration 10
 *
 * It supports GET by default; use --method POST and --body '{"...":...}' when
 * the endpoint is safe and non-mutating (e.g. a test-only status endpoint).
 */

import process from 'node:process';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

const base = (arg('base', 'http://127.0.0.1:8080')).replace(/\/+$/, '');
const endpoint = arg('endpoint', '/api/healthz');
const method = (arg('method', 'GET')).toUpperCase();
const body = arg('body', '');
const concurrency = Math.max(1, Number(arg('concurrency', 10)) || 10);
const durationSeconds = Math.max(1, Number(arg('duration', 5)) || 5);
const timeoutMs = Math.max(500, Number(arg('timeout', 5000)) || 5000);
const headers = { accept: 'application/json' };
if (body) headers['content-type'] = 'application/json';

if (process.env.LOAD_TEST_AUTHORIZATION) {
  headers.authorization = `Bearer ${process.env.LOAD_TEST_AUTHORIZATION}`;
}

const url = `${base}${endpoint}`;
const startedAt = Date.now();
let finished = 0;
let failed = 0;
let errors = 0;
const latencies = [];

async function worker() {
  while (Date.now() - startedAt < durationSeconds * 1000) {
    const requestStart = process.hrtime.bigint();
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'GET' ? undefined : (body || undefined),
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.arrayBuffer();
      const ms = Number(process.hrtime.bigint() - requestStart) / 1e6;
      latencies.push(ms);
      finished += 1;
      if (response.status >= 400) failed += 1;
    } catch (error) {
      errors += 1;
    }
  }
}

const workers = Array.from({ length: concurrency }, () => worker());
await Promise.all(workers);

const sorted = [...latencies].sort((a, b) => a - b);
const percentile = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
const total = finished + failed + errors;

const summary = {
  target: url,
  method,
  concurrency,
  durationSeconds,
  requests: total,
  success: finished,
  httpNon2xx: failed,
  transportErrors: errors,
  successRate: total ? Number(((finished / total) * 100).toFixed(2)) : 0,
  latencyMs: {
    min: sorted.length ? Number(sorted[0].toFixed(2)) : 0,
    p50: Number(percentile(50).toFixed(2)),
    p95: Number(percentile(95).toFixed(2)),
    max: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : 0,
  },
  note: 'Observed measurements only. No capacity/SLA claim is derived from this harness without a documented baseline and production authorization.',
};

console.log(JSON.stringify(summary, null, 2));
if (total && summary.successRate < 100) process.exitCode = 1;
