#!/usr/bin/env node
/**
 * Non-destructive production release verifier for the Super Admin surface.
 *
 * This script deliberately fails if the SPA is unavailable even when health
 * APIs are healthy. It never invents an authenticated result. Set
 * PROD_BASE_URL to override the default. An optional LIVE_SUPER_ADMIN_BEARER_TOKEN
 * enables read-only authenticated platform probes; do not pass secrets in CI
 * logs or shell history.
 */
import https from 'node:https';

const base = new URL(process.env.PROD_BASE_URL || 'https://airesume.projectdemo.guru');
const bearer = process.env.LIVE_SUPER_ADMIN_BEARER_TOKEN || '';
const failures = [];

function request(path, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, base);
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: { 'User-Agent': 'ResumePilotSuperAdminVerifier/1.0', ...headers },
      timeout: 20_000,
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode || 0, headers: response.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function probe(label, path, expected, options = {}) {
  try {
    const response = await request(path, options);
    const ok = typeof expected === 'function' ? expected(response) : response.status === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: HTTP ${response.status}`);
    if (!ok) failures.push(`${label}: expected ${typeof expected === 'number' ? expected : 'custom expectation'}, got ${response.status}`);
    return response;
  } catch (error) {
    console.log(`FAIL ${label}: ${error.message}`);
    failures.push(`${label}: ${error.message}`);
    return null;
  }
}

console.log(`Verifying ${base.origin}`);
const health = await probe('API health', '/api/healthz', 200);
await probe('API readiness', '/api/readyz', response => response.status === 200 && /"status":"ready"/.test(response.body));
for (const path of ['/', '/adm', '/enterprise', '/index.html']) {
  await probe(`SPA ${path}`, path, response => response.status === 200 && /<div id="root"|<div id='root'/.test(response.body));
}
await probe('Unauthenticated platform tenant denial', '/api/platform/tenants', 401);
await probe('Unauthenticated platform queue denial', '/api/platform/queues', 401);

if (bearer) {
  const authHeaders = { Authorization: `Bearer ${bearer}` };
  const platformHealth = await probe('Authenticated platform health', '/api/platform/health', 200, { headers: authHeaders });
  await probe('Authenticated tenant registry', '/api/platform/tenants', 200, { headers: authHeaders });
  await probe('Authenticated queue monitor', '/api/platform/queues', 200, { headers: authHeaders });
  if (platformHealth?.body) {
    try {
      const parsed = JSON.parse(platformHealth.body);
      console.log(`INFO backend commit SHA: ${parsed.commitSha || 'UNAVAILABLE'}`);
    } catch { console.log('INFO backend commit SHA: UNPARSEABLE'); }
  }
} else {
  console.log('UNVERIFIED authenticated platform probes: LIVE_SUPER_ADMIN_BEARER_TOKEN was not supplied.');
}

if (health?.body) {
  try {
    const parsed = JSON.parse(health.body);
    console.log(`INFO Firebase Admin configured: ${parsed.firebaseAdminConfigured === true ? 'true' : 'false'}`);
  } catch { /* already reported as health status */ }
}

if (failures.length) {
  console.error(`\nNO-GO: ${failures.length} production release gate(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nStatic and unauthenticated production gates passed. Authenticated CRUD, audit, MFA, backup, rollback, and SHA equality still require their separate evidence.');
}
