#!/usr/bin/env node
/**
 * Live Platform Health verification.
 *
 * Reconciles what the Platform Health console reports against the authoritative
 * API census, and enforces the health semantics the brief fixes:
 *
 *   DISABLED       is not BROKEN
 *   NOT_CONFIGURED is not BROKEN
 *   DEGRADED       is not OPERATIONAL
 *   UNKNOWN        is not HEALTHY
 *
 * It also hunts the specific dishonesty patterns that make a dashboard
 * worthless: a missing metric rendered as 0, a 100% figure with no data behind
 * it, and a service claiming health while its dependency is down.
 *
 * Environment
 *   PROD_BASE_URL        optional, defaults to the production origin
 *   FIREBASE_API_KEY     required
 *   SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD  required
 *   ADMIN_EMAIL / ADMIN_PASSWORD            optional, checks role projection
 *   EXPECTED_API_COUNT   optional; when omitted, the live matrix is reconciled only with its own enumerated list
 *
 * Exit codes: 0 consistent, 1 an inconsistency found, 2 could not be verified.
 */

import {
  DEFAULT_BASE_URL,
  Recorder,
  firebaseSignIn,
  probe,
  readEnv,
  reportMissingEnv,
} from './lib/live-certification.mjs';

const SCRIPT = 'verify-platform-health-live';

const { ok, values, missing } = readEnv({
  PROD_BASE_URL: { default: DEFAULT_BASE_URL, description: 'Production origin' },
  FIREBASE_API_KEY: { required: true, description: 'Firebase Web API key' },
  SUPERADMIN_EMAIL: { required: true, description: 'A SUPER_ADMIN account' },
  SUPERADMIN_PASSWORD: { required: true, description: 'Password for SUPERADMIN_EMAIL' },
  ADMIN_EMAIL: { description: 'Optional ADMIN account, to verify role-scoped projection' },
  ADMIN_PASSWORD: { description: 'Password for ADMIN_EMAIL' },
  EXPECTED_API_COUNT: { description: 'Optional expected endpoint count from a release manifest; omit to use the live matrix as its own enumerated source.' },
});

if (!ok) {
  reportMissingEnv(missing, SCRIPT);
  process.exit(2);
}

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const EXPECTED_API_COUNT = values.EXPECTED_API_COUNT === undefined ? null : Number(values.EXPECTED_API_COUNT);
const recorder = new Recorder(SCRIPT, { base: BASE, expectedApiCount: EXPECTED_API_COUNT });

const VALID_STATES = ['OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'DISABLED', 'NOT_CONFIGURED', 'NOT_SUPPORTED', 'UNKNOWN'];
const VALID_CONFIG = ['CONFIGURED', 'PARTIALLY_CONFIGURED', 'NOT_CONFIGURED', 'DISABLED_BY_CONFIGURATION', 'NOT_APPLICABLE', 'UNKNOWN'];

const get = (session, route) => probe(`${BASE}${route}`, {
  headers: session ? { Authorization: `Bearer ${session.idToken}` } : {},
});

async function main() {
  console.log(`\n${SCRIPT}: reconciling Platform Health on ${BASE}\n`);

  const reachable = await probe(`${BASE}/healthz`);
  if (!reachable.ok) {
    recorder.blocked('production is reachable', { reason: reachable.error });
    process.exit(recorder.finish('test-results/platform-health-live.json'));
  }
  recorder.pass('production is reachable', { status: reachable.status });

  let superAdmin;
  try {
    superAdmin = await firebaseSignIn(values.FIREBASE_API_KEY, values.SUPERADMIN_EMAIL, values.SUPERADMIN_PASSWORD);
    recorder.pass('SUPER_ADMIN signed in', { uid: superAdmin.uid });
  } catch (error) {
    recorder.blocked('SUPER_ADMIN signed in', { reason: error.message });
    process.exit(recorder.finish('test-results/platform-health-live.json'));
  }

  // ---- Snapshot ------------------------------------------------------------
  const snapshotResponse = await get(superAdmin, '/api/platform/operational-status');
  if (!snapshotResponse.ok || snapshotResponse.status !== 200) {
    recorder.fail('platform health snapshot retrieved', {
      reason: snapshotResponse.error || `HTTP ${snapshotResponse.status}`,
    });
    process.exit(recorder.finish('test-results/platform-health-live.json'));
  }
  const snapshot = snapshotResponse.json || {};
  const services = snapshot.services || [];
  recorder.pass('platform health snapshot retrieved', { services: services.length });

  // ---- Vocabulary ----------------------------------------------------------
  const badState = services.filter(s => !VALID_STATES.includes(s.state));
  const badConfig = services.filter(s => s.configuration && !VALID_CONFIG.includes(s.configuration));
  if (badState.length || badConfig.length) {
    recorder.fail('states and configuration values use the documented vocabulary', {
      reason: `${badState.length} bad state(s), ${badConfig.length} bad configuration value(s)`,
      examples: [...badState, ...badConfig].slice(0, 5).map(s => ({ id: s.id, state: s.state, configuration: s.configuration })),
    });
  } else {
    recorder.pass('states and configuration values use the documented vocabulary');
  }

  // ---- Required fields -----------------------------------------------------
  // The brief requires every dependency to expose these. A dashboard that shows
  // a red dot without a reason or a remediation is not actionable.
  const REQUIRED = ['state', 'configuration', 'checkedAt', 'reason'];
  const incomplete = services.filter(service => {
    if (service.state === 'OPERATIONAL') return false;
    return REQUIRED.some(field => service[field] === undefined || service[field] === null || service[field] === '');
  });
  if (incomplete.length) {
    recorder.fail('every non-operational dependency exposes its full diagnostic contract', {
      reason: `${incomplete.length} service(s) are missing required fields`,
      examples: incomplete.slice(0, 5).map(s => ({
        id: s.id,
        missing: REQUIRED.filter(f => !s[f]),
      })),
    });
  } else {
    recorder.pass('every non-operational dependency exposes its full diagnostic contract');
  }

  const withoutRemediation = services.filter(
    s => ['UNAVAILABLE', 'DEGRADED', 'NOT_CONFIGURED'].includes(s.state) && !s.remediation,
  );
  if (withoutRemediation.length) {
    recorder.fail('actionable states carry remediation guidance', {
      reason: `${withoutRemediation.length} service(s) need remediation text`,
      examples: withoutRemediation.slice(0, 5).map(s => s.id),
    });
  } else {
    recorder.pass('actionable states carry remediation guidance');
  }

  // ---- Honesty -------------------------------------------------------------
  // A disabled or unconfigured service must never be summarised as healthy.
  const misreported = services.filter(service => {
    const healthyLooking = service.healthy === true || service.ok === true;
    return healthyLooking && service.state !== 'OPERATIONAL';
  });
  if (misreported.length) {
    recorder.fail('no non-operational service is reported as healthy', {
      reason: `${misreported.length} service(s) claim health while not OPERATIONAL`,
      examples: misreported.slice(0, 5).map(s => ({ id: s.id, state: s.state })),
    });
  } else {
    recorder.pass('no non-operational service is reported as healthy');
  }

  // A metric that could not be collected must be absent or null, never 0.
  const fakeZeros = [];
  for (const service of services) {
    if (service.state === 'OPERATIONAL') continue;
    for (const [key, value] of Object.entries(service.metrics || {})) {
      if (value === 0 && /count|total|rate|percent|latency|queue|pending/i.test(key)) {
        fakeZeros.push({ id: service.id, metric: key, state: service.state });
      }
    }
  }
  if (fakeZeros.length) {
    recorder.fail('no uncollected metric is rendered as zero', {
      reason: 'An UNKNOWN/UNAVAILABLE service exposed a zero-looking count instead of null or an explicit measured value.',
      examples: fakeZeros.slice(0, 8),
      remediation: 'Return null with source=UNAVAILABLE when the collector could not read the metric.',
    });
  } else {
    recorder.pass('no uncollected metric is rendered as zero');
  }

  // ---- Reconciliation with the census -------------------------------------
  const matrixResponse = await get(superAdmin, '/api/platform/operational-status/api-matrix');
  if (!matrixResponse.ok || matrixResponse.status !== 200) {
    recorder.blocked('API matrix reconciles with the authoritative census', {
      reason: matrixResponse.error || `HTTP ${matrixResponse.status}`,
    });
  } else {
    const total = matrixResponse.json?.total;
    const endpoints = matrixResponse.json?.endpoints || [];
    const enumeratedTotal = endpoints.length;
    if (typeof total === 'number' && total === enumeratedTotal && (EXPECTED_API_COUNT === null || total === EXPECTED_API_COUNT)) {
      recorder.pass('API matrix reconciles with its enumerated endpoint list', { total, enumeratedTotal, expectedApiCount: EXPECTED_API_COUNT });
    } else {
      recorder.fail('API matrix reconciles with its enumerated endpoint list', {
        reason: `matrix total=${total}, enumerated=${enumeratedTotal}, optional expected=${EXPECTED_API_COUNT ?? 'not supplied'}`,
        remediation: 'Regenerate the release manifest and reconcile the deployed routing table.',
      });
    }

    const distribution = {};
    for (const endpoint of endpoints) distribution[endpoint.state] = (distribution[endpoint.state] || 0) + 1;
    recorder.info('live API state distribution', distribution);

    // An endpoint in an error state with no explanation is the exact defect the
    // brief forbids.
    const unexplained = endpoints.filter(e => e.state !== 'OPERATIONAL' && !e.reason && !e.dependency);
    if (unexplained.length) {
      recorder.fail('zero unexplained endpoints in the live matrix', {
        reason: `${unexplained.length} endpoint(s) have neither a reason nor a named dependency`,
        examples: unexplained.slice(0, 8).map(e => `${e.method} ${e.path}`),
      });
    } else {
      recorder.pass('zero unexplained endpoints in the live matrix', { endpoints: endpoints.length });
    }
  }

  // ---- Indicator -----------------------------------------------------------
  const indicatorResponse = await get(superAdmin, '/api/platform/health-indicator');
  if (!indicatorResponse.ok || indicatorResponse.status !== 200) {
    recorder.blocked('health indicator endpoint answers', { reason: indicatorResponse.error || `HTTP ${indicatorResponse.status}` });
  } else {
    const indicator = indicatorResponse.json?.indicator || indicatorResponse.json?.summary?.indicator;
    if (['GREEN', 'AMBER', 'RED', 'GREY'].includes(String(indicator).toUpperCase())) {
      recorder.pass('health indicator returns a documented colour', { indicator });
    } else {
      recorder.fail('health indicator returns a documented colour', { reason: `got ${indicator}` });
    }

    // The indicator must agree with the snapshot it summarises.
    const worst = snapshot.summary?.indicator;
    if (worst && indicator && String(worst).toUpperCase() !== String(indicator).toUpperCase()) {
      recorder.fail('indicator agrees with the snapshot summary', {
        reason: `indicator endpoint says ${indicator}, snapshot says ${worst}`,
      });
    } else if (worst) {
      recorder.pass('indicator agrees with the snapshot summary', { indicator });
    }
  }

  // ---- Role projection -----------------------------------------------------
  if (values.ADMIN_EMAIL && values.ADMIN_PASSWORD) {
    try {
      const admin = await firebaseSignIn(values.FIREBASE_API_KEY, values.ADMIN_EMAIL, values.ADMIN_PASSWORD);
      const adminView = await get(admin, '/api/platform/operational-status');
      if (adminView.status !== 200) {
        recorder.fail('ADMIN can read platform health', { reason: `HTTP ${adminView.status}` });
      } else {
        recorder.pass('ADMIN can read platform health');
        const payload = JSON.stringify(adminView.json || {});
        const hostLeaks = ['"pid"', '"loadAverage1m"', '"host"', '"rssMb"'].filter(field => payload.includes(field));
        if (hostLeaks.length) {
          recorder.fail('host diagnostics are withheld from ADMIN', { reason: `exposed ${hostLeaks.join(', ')}` });
        } else {
          recorder.pass('host diagnostics are withheld from ADMIN');
        }
      }

      const testRoute = await probe(`${BASE}/api/platform/operational-status/firestore/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.idToken}`, 'Content-Type': 'application/json' },
      });
      if (testRoute.status === 403) {
        recorder.pass('ADMIN is refused the SUPER_ADMIN-only provider test', { status: 403 });
      } else {
        recorder.fail('ADMIN is refused the SUPER_ADMIN-only provider test', {
          reason: `expected 403, got ${testRoute.status}`,
        });
      }
    } catch (error) {
      recorder.blocked('ADMIN role projection verified', { reason: error.message });
    }
  } else {
    recorder.blocked('ADMIN role projection verified', { reason: 'set ADMIN_EMAIL and ADMIN_PASSWORD to include this check' });
  }

  // ---- Anonymous access ----------------------------------------------------
  const anonymous = await probe(`${BASE}/api/platform/operational-status`);
  if (anonymous.status === 401 || anonymous.status === 403) {
    recorder.pass('platform health rejects anonymous callers', { status: anonymous.status });
  } else {
    recorder.fail('platform health rejects anonymous callers', { reason: `expected 401/403, got ${anonymous.status}` });
  }

  process.exit(recorder.finish('test-results/platform-health-live.json'));
}

main().catch(error => {
  recorder.fail('script completed', { reason: error.message });
  process.exit(recorder.finish('test-results/platform-health-live.json') || 1);
});
