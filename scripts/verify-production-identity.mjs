#!/usr/bin/env node
/**
 * Verifies that production is running the EXACT commit you tested.
 *
 * Run this immediately after a deploy, before any other certification step.
 * Everything downstream is meaningless if the deployed SHA is not the tested
 * SHA, so this script is deliberately strict: a mismatch is a hard failure, and
 * an unknown SHA is BLOCKED rather than assumed fine.
 *
 * Checks
 *   1. Backend reports a COMMIT_SHA and it matches EXPECTED_SHA.
 *   2. The frontend bundle carries the same build SHA.
 *   3. Health endpoints answer and are self-consistent.
 *   4. TLS terminates and Cloudflare cache headers are visible.
 *   5. The deployed API surface size matches the authoritative census.
 *
 * Environment
 *   EXPECTED_SHA    required. The full git SHA you tested and deployed.
 *   PROD_BASE_URL   optional. Defaults to the production origin.
 *   EXPECTED_API_COUNT optional. If supplied, it must match the deployed matrix; otherwise the script records the live count without inventing a baseline.
 *
 * Exit codes: 0 verified, 1 mismatch/failure, 2 could not be verified.
 */

import {
  DEFAULT_BASE_URL,
  Recorder,
  probe,
  reportMissingEnv,
  readEnv,
} from './lib/live-certification.mjs';
import { execSync } from 'node:child_process';

const SCRIPT = 'verify-production-identity';

let defaultSha;
try {
  defaultSha = execSync('git rev-parse HEAD').toString().trim();
} catch (_) {}

const { ok, values, missing } = readEnv({
  EXPECTED_SHA: {
    required: !defaultSha,
    default: defaultSha,
    description: 'Full git SHA that was tested and deployed, e.g. export EXPECTED_SHA=$(git rev-parse HEAD)',
  },
  PROD_BASE_URL: { default: DEFAULT_BASE_URL, description: 'Production origin' },
  EXPECTED_API_COUNT: { description: 'Optional expected endpoint count from the tested release manifest' },
});

if (!ok) {
  reportMissingEnv(missing, SCRIPT);
  process.exit(2);
}

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const EXPECTED_SHA = values.EXPECTED_SHA.trim().toLowerCase();
if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) {
  console.error('verify-production-identity: EXPECTED_SHA must be a full 40-character hexadecimal commit SHA.');
  process.exit(2);
}
const EXPECTED_API_COUNT = values.EXPECTED_API_COUNT === undefined ? null : Number(values.EXPECTED_API_COUNT);

const recorder = new Recorder(SCRIPT, { base: BASE, expectedSha: EXPECTED_SHA });

const shortSha = sha => (typeof sha === 'string' ? sha.slice(0, 12) : String(sha));

async function main() {
  console.log(`\n${SCRIPT}: verifying ${BASE} is running ${shortSha(EXPECTED_SHA)}\n`);

  // ---- 1. Reachability -----------------------------------------------------
  if (!BASE.startsWith('https://')) {
    recorder.fail('production base URL uses HTTPS', { reason: 'Production identity verification must target an HTTPS origin.' });
  }
  let health = await probe(`${BASE}/api/healthz`);
  if (!health.ok || !health.json) {
    health = await probe(`${BASE}/healthz`);
  }
  if (!health.ok || !health.json) {
    health = await probe(`${BASE}/api/health`);
  }
  if (!health.ok) {
    recorder.blocked('backend is reachable over HTTPS', {
      reason: health.error,
      remediation: 'Confirm DNS, TLS and that the origin accepts connections from this host.',
    });
    // Nothing else can be verified if the origin is unreachable.
    process.exit(recorder.finish('test-results/production-identity.json'));
  }
  if (health.status >= 400) {
    recorder.fail('backend health endpoint is successful', { status: health.status, reason: 'The health endpoint is reachable but reports an HTTP failure.' });
  } else {
    recorder.pass('backend is reachable over HTTPS', { status: health.status, durationMs: health.durationMs });
    const isFirebaseConfigured = health.json?.firebaseAdminConfigured === true || health.json?.identityProviderConfigured === true;
    if (!isFirebaseConfigured) {
      recorder.fail('production health confirms Firebase Admin is configured', { reason: 'The API is reachable but Firebase Admin is not reported as configured.' });
    } else {
      recorder.pass('production health confirms Firebase Admin is configured');
    }
  }

  // ---- 2. Backend COMMIT_SHA ----------------------------------------------
  // Try the documented sources in order rather than assuming one shape.
  const shaSources = [
    { path: '/api/platform/version', field: body => body?.commitSha || body?.sha },
    { path: '/healthz', field: body => body?.commitSha || body?.sha },
    { path: '/api/platform/operational-status', field: body => body?.commitSha || body?.sources?.commitSha },
  ];

  let backendSha = null;
  let backendShaSource = null;
  for (const source of shaSources) {
    const response = await probe(`${BASE}${source.path}`);
    if (!response.ok || response.status !== 200 || !response.json) continue;
    const found = source.field(response.json);
    if (found) {
      backendSha = String(found).trim();
      backendShaSource = source.path;
      break;
    }
  }

  if (!backendSha) {
    recorder.blocked('backend reports its COMMIT_SHA', {
      reason: 'no endpoint exposed a commit SHA',
      remediation: 'Ensure backend/COMMIT_SHA is written at deploy time or COMMIT_SHA is set in the PM2 environment.',
    });
  } else if (/^[0-9a-f]{40}$/i.test(backendSha) && backendSha.toLowerCase() === EXPECTED_SHA) {
    recorder.pass('backend COMMIT_SHA matches the tested SHA', {
      backendSha: shortSha(backendSha),
      source: backendShaSource,
    });
  } else {
    recorder.fail('backend COMMIT_SHA matches the tested SHA', {
      reason: `production is running ${shortSha(backendSha)}, expected ${shortSha(EXPECTED_SHA)}`,
      backendSha,
      expectedSha: EXPECTED_SHA,
      remediation: 'Re-deploy the tested SHA. Do not certify a different build.',
    });
  }

  // ---- 3. Health identity consistency -------------------------------------
  const apiHealth = await probe(`${BASE}/api/healthz`);
  if (!apiHealth.ok) {
    recorder.blocked('API health endpoint is reachable', { reason: apiHealth.error });
  } else if (apiHealth.status !== 200 || apiHealth.json?.status !== 'ok') {
    recorder.fail('API health endpoint is successful', { status: apiHealth.status, reason: 'The API health endpoint did not return the expected ok state.' });
  } else if (backendSha && apiHealth.json?.commitSha && apiHealth.json.commitSha !== backendSha) {
    recorder.fail('health endpoint commit identities agree', { reason: 'The root and API health endpoints report different commit SHAs.' });
  } else {
    recorder.pass('API health endpoint is successful', { status: apiHealth.status });
    if (backendSha) recorder.pass('health endpoint commit identities agree', { commitSha: shortSha(backendSha) });
  }

  // ---- 4. Frontend build SHA ----------------------------------------------
  const index = await probe(`${BASE}/`);
  if (!index.ok || index.status >= 400) {
    recorder.blocked('frontend is served', { reason: index.error || `HTTP ${index.status}` });
  } else {
    recorder.pass('frontend is served', { status: index.status });

    const html = index.text || '';
    const marker = html.match(/(?:data-build-sha|BUILD_SHA)["'=:\s]+([0-9a-f]{40})/i);
    if (marker) {
      const frontendSha = marker[1].toLowerCase();
      if (frontendSha === EXPECTED_SHA) {
        recorder.pass('frontend build SHA matches the tested SHA', { frontendSha: shortSha(frontendSha) });
      } else {
        recorder.fail('frontend build SHA matches the tested SHA', {
          reason: `frontend built from ${shortSha(frontendSha)}, expected ${shortSha(EXPECTED_SHA)}`,
          remediation: 'Rebuild and redeploy the frontend from the tested SHA, then purge the CDN cache.',
        });
      }
    } else {
      recorder.blocked('frontend build SHA matches the tested SHA', {
        reason: 'no build SHA marker found in the served HTML',
        remediation: 'Emit the SHA into index.html at build time so deployments are self-identifying.',
      });
    }

    // A stale CDN copy is the classic reason a correct deploy looks wrong.
    const cacheStatus = index.headers?.['cf-cache-status'];
    if (cacheStatus) {
      recorder.info('Cloudflare cache status observed', { cacheStatus, age: index.headers?.age });
      if (['HIT', 'STALE', 'UPDATING'].includes(String(cacheStatus).toUpperCase())) {
        recorder.info('served from cache', {
          reason: `cf-cache-status=${cacheStatus}; purge the cache if the build SHA looks stale`,
        });
      }
    } else {
      recorder.info('Cloudflare cache status observed', { reason: 'no cf-cache-status header present' });
    }
  }

  // ---- 4. Health endpoints -------------------------------------------------
  const availability = await probe(`${BASE}/api/service-availability`);
  if (!availability.ok) {
    recorder.blocked('public service-availability endpoint answers', { reason: availability.error });
  } else if (availability.status !== 200 || availability.json?.success !== true) {
    recorder.fail('public service-availability endpoint answers', {
      reason: `HTTP ${availability.status}`,
      body: availability.text?.slice(0, 200),
    });
  } else {
    recorder.pass('public service-availability endpoint answers', { status: 200 });

    // This payload is public, so it must never carry configuration detail.
    const body = JSON.stringify(availability.json).toLowerCase();
    const leaked = ['secret', 'privatekey', 'apikey', 'password', 'token'].filter(word => body.includes(word));
    if (leaked.length) {
      recorder.fail('public availability payload is secret-free', { reason: `mentions ${leaked.join(', ')}` });
    } else {
      recorder.pass('public availability payload is secret-free');
    }
  }

  // ---- 5. API surface size -------------------------------------------------
  // Unauthenticated, so a 401 here is the correct answer and proves the route
  // is protected; only a reachable, authorised run can compare the count.
  const matrix = await probe(`${BASE}/api/platform/operational-status/api-matrix`);
  if (!matrix.ok) {
    recorder.blocked('API surface size matches the census', { reason: matrix.error });
  } else if (matrix.status === 401 || matrix.status === 403) {
    recorder.pass('API matrix requires authentication', { status: matrix.status });
    recorder.info('API surface size matches the census', {
      reason: 'endpoint is correctly protected; run verify-api-inventory-live.mjs with credentials to compare counts',
    });
  } else if (matrix.status === 200 && typeof matrix.json?.total === 'number') {
    if (EXPECTED_API_COUNT === null) {
      recorder.info('API surface size observed', { total: matrix.json.total, reason: 'EXPECTED_API_COUNT was not supplied; no baseline was invented.' });
    } else if (matrix.json.total === EXPECTED_API_COUNT) {
      recorder.pass('API surface size matches the supplied release manifest', { total: matrix.json.total });
    } else {
      recorder.fail('API surface size matches the supplied release manifest', {
        reason: `production exposes ${matrix.json.total} endpoints, supplied manifest says ${EXPECTED_API_COUNT}`,
        remediation: 'Reconcile docs/FINAL_API_INVENTORY.md against the deployed build.',
      });
    }
  } else {
    recorder.blocked('API surface size matches the census', { reason: `unexpected HTTP ${matrix.status}` });
  }

  process.exit(recorder.finish('test-results/production-identity.json'));
}

main().catch(error => {
  recorder.fail('script completed', { reason: error.message });
  process.exit(recorder.finish('test-results/production-identity.json') || 1);
});
