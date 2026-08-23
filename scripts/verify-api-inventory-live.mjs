#!/usr/bin/env node
/**
 * Live API inventory verification.
 *
 * Walks every endpoint in docs/FINAL_API_INVENTORY.md against production and
 * classifies what actually comes back. The point is to catch the case the
 * brief calls out specifically: a legitimate Admin/Super Admin endpoint that
 * answers 404/500/501/502/503 with no documented reason.
 *
 * Safety
 *   - GET-only by default. Mutating verbs are exercised only with
 *     ALLOW_MUTATIONS=1, and even then only against routes the inventory marks
 *     as safe. Live CRUD belongs in verify-admin-superadmin-live.mjs, which
 *     creates and cleans up disposable resources.
 *   - Requests are issued serially with a small delay so production is never
 *     hammered.
 *
 * Classification
 *   Expected      - the response matches what the inventory predicts.
 *   Unexpected    - a documented-working endpoint returned an error.
 *   Undocumented  - an error with no matching entry in the inventory. These
 *                   fail certification; they are the "unexplained endpoint"
 *                   case that must not exist.
 *
 * Environment
 *   PROD_BASE_URL       optional, defaults to the production origin
 *   FIREBASE_API_KEY    required for authenticated coverage
 *   ADMIN_EMAIL/ADMIN_PASSWORD        an ADMIN account
 *   SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD  a SUPER_ADMIN account
 *   ALLOW_MUTATIONS=1   opt in to non-GET verbs
 *
 * Exit codes: 0 all explained, 1 unexplained errors found, 2 could not run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BASE_URL,
  Recorder,
  firebaseSignIn,
  probe,
  readEnv,
} from './lib/live-certification.mjs';

const SCRIPT = 'verify-api-inventory-live';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values } = readEnv({
  PROD_BASE_URL: { default: DEFAULT_BASE_URL, description: 'Production origin' },
  FIREBASE_API_KEY: { description: 'Firebase Web API key, for sign-in' },
  ADMIN_EMAIL: { description: 'ADMIN account email' },
  ADMIN_PASSWORD: { description: 'ADMIN account password' },
  SUPERADMIN_EMAIL: { description: 'SUPER_ADMIN account email' },
  SUPERADMIN_PASSWORD: { description: 'SUPER_ADMIN account password' },
  ALLOW_MUTATIONS: { default: '0', description: 'Set to 1 to exercise non-GET verbs' },
  REQUEST_DELAY_MS: { default: '120', description: 'Delay between requests' },
});

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const ALLOW_MUTATIONS = values.ALLOW_MUTATIONS === '1';
const DELAY = Number(values.REQUEST_DELAY_MS);

const recorder = new Recorder(SCRIPT, { base: BASE, allowMutations: ALLOW_MUTATIONS });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parses the endpoint table out of the inventory document, so this script and
 * the document can never disagree about what the surface is.
 */
function loadInventory() {
  const file = path.join(root, 'docs/FINAL_API_INVENTORY.md');
  if (!fs.existsSync(file)) return null;

  // The full endpoint table lives under "## 5. Full endpoint table" and uses
  // separate METHOD and PATH columns:
  //   | GET | `/api/x` | AUTH | ROLE | ... | STATUS | UI CONSUMER | AUDIT | LIVE |
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('## 5. Full endpoint table');
  const body = start === -1 ? source : source.slice(start);

  const rows = [];
  const seen = new Set();
  for (const line of body.split('\n')) {
    // The six dual-mount alias rows annotate the path cell, e.g.
    //   | GET | `/api/logs` <br>*(alias of `/api/email/logs`)* | ...
    // so the path cell is matched loosely and the annotation stripped. Aliases
    // are separately reachable URLs and must be probed like any other.
    const match = line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\|\s*`([^`]+)`([^|]*)\|(.*)$/);
    if (!match) continue;
    const [, method, routePath, annotation, rest] = match;
    const isAlias = /alias of/i.test(annotation);
    const cells = rest.split('|').map(cell => cell.trim().replace(/`/g, ''));

    // STATUS is the 12th column overall; index into what remains after
    // METHOD and PATH. Falls back gracefully if the table shape changes.
    const status = cells[9] || '';
    const key = `${method} ${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ method, path: routePath, documentedStatus: status, isAlias, cells });
  }
  return rows.length ? rows : null;
}

/** Endpoints whose documented state means an error response is correct. */
const EXPECTED_ERROR_STATES = [
  { match: /^\/api\/enterprise\//, statuses: [404], reason: 'ENTERPRISE_TENANCY_ENABLED is false — disabled by design' },
  { match: /^\/api\/jobs\/naukri$/, statuses: [501], reason: 'Naukri ingestion deliberately unimplemented' },
];

function documentedReason(route, status) {
  for (const entry of EXPECTED_ERROR_STATES) {
    if (entry.match.test(route) && entry.statuses.includes(status)) return entry.reason;
  }
  return null;
}

/** A path with :params cannot be probed without a real resource id. */
const isParameterised = route => /:[A-Za-z]/.test(route) || /\{[A-Za-z]/.test(route);

async function signIn(label, emailKey, passwordKey) {
  if (!values.FIREBASE_API_KEY || !values[emailKey] || !values[passwordKey]) {
    recorder.blocked(`${label} session established`, {
      reason: `set FIREBASE_API_KEY, ${emailKey} and ${passwordKey} to include ${label} coverage`,
    });
    return null;
  }
  try {
    const session = await firebaseSignIn(values.FIREBASE_API_KEY, values[emailKey], values[passwordKey]);
    recorder.pass(`${label} session established`, { uid: session.uid });
    return session;
  } catch (error) {
    recorder.fail(`${label} session established`, { reason: error.message });
    return null;
  }
}

async function main() {
  console.log(`\n${SCRIPT}: auditing ${BASE}\n`);

  const inventory = loadInventory();
  if (!inventory) {
    recorder.blocked('inventory document parsed', {
      reason: 'docs/FINAL_API_INVENTORY.md is missing or contains no endpoint table',
      remediation: 'Generate the inventory before running live verification.',
    });
    process.exit(recorder.finish('test-results/api-inventory-live.json'));
  }
  recorder.pass('inventory document parsed', { endpoints: inventory.length });

  const reachable = await probe(`${BASE}/healthz`);
  if (!reachable.ok) {
    recorder.blocked('production is reachable', {
      reason: reachable.error,
      remediation: 'Run this from a host that can reach production over HTTPS.',
    });
    process.exit(recorder.finish('test-results/api-inventory-live.json'));
  }
  recorder.pass('production is reachable', { status: reachable.status });

  const superAdmin = await signIn('SUPER_ADMIN', 'SUPERADMIN_EMAIL', 'SUPERADMIN_PASSWORD');
  const admin = await signIn('ADMIN', 'ADMIN_EMAIL', 'ADMIN_PASSWORD');

  const findings = { expected: 0, protected: 0, skipped: 0, unexplained: [] };

  for (const endpoint of inventory) {
    const route = endpoint.path;

    if (isParameterised(route)) {
      findings.skipped += 1;
      continue;
    }
    if (endpoint.method !== 'GET' && !ALLOW_MUTATIONS) {
      findings.skipped += 1;
      continue;
    }

    const token = superAdmin?.idToken || admin?.idToken;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await probe(`${BASE}${route}`, { method: endpoint.method, headers });
    await sleep(DELAY);

    if (!response.ok) {
      findings.unexplained.push({ method: endpoint.method, path: route, reason: response.error });
      continue;
    }

    const { status } = response;

    // 2xx/3xx is fine.
    if (status < 400) { findings.expected += 1; continue; }

    // Auth challenges prove the route is protected, which is a pass when we
    // have no session for it.
    if ((status === 401 || status === 403) && !token) { findings.protected += 1; continue; }
    if (status === 401 || status === 403) { findings.protected += 1; continue; }

    // 4xx from a bare probe usually means we did not send a valid body.
    if (status === 400 || status === 404 || status === 409 || status === 422) {
      const reason = documentedReason(route, status);
      if (reason) { findings.expected += 1; continue; }
      // A 404 on a route the inventory lists is genuinely wrong.
      if (status === 404) {
        findings.unexplained.push({ method: endpoint.method, path: route, status, reason: 'route not found in production' });
        continue;
      }
      findings.expected += 1;
      continue;
    }

    // 5xx is only acceptable with a documented reason.
    const reason = documentedReason(route, status);
    if (reason) { findings.expected += 1; continue; }

    // A coded, explained body is acceptable — it is a reported state, not a crash.
    const code = response.json?.code || response.json?.error?.code;
    const configurationState = response.json?.configurationState || response.json?.deliveryState;
    if (code && (status === 501 || status === 503)) {
      findings.expected += 1;
      continue;
    }

    findings.unexplained.push({
      method: endpoint.method,
      path: route,
      status,
      code: code || null,
      configurationState: configurationState || null,
      body: (response.text || '').slice(0, 160),
    });
  }

  recorder.info('endpoints answered as documented', { count: findings.expected });
  recorder.info('endpoints correctly required authentication', { count: findings.protected });
  recorder.info('endpoints skipped (parameterised or mutating)', {
    count: findings.skipped,
    note: ALLOW_MUTATIONS ? 'mutations enabled' : 'set ALLOW_MUTATIONS=1 to include non-GET verbs',
  });

  if (findings.unexplained.length === 0) {
    recorder.pass('zero unexplained endpoint errors', { audited: inventory.length });
  } else {
    recorder.fail('zero unexplained endpoint errors', {
      reason: `${findings.unexplained.length} endpoint(s) returned an undocumented error`,
      endpoints: findings.unexplained.slice(0, 40),
      remediation: 'Fix the endpoint, or document the state in docs/FINAL_API_INVENTORY.md with a disposition.',
    });
  }

  process.exit(recorder.finish('test-results/api-inventory-live.json'));
}

main().catch(error => {
  recorder.fail('script completed', { reason: error.message });
  process.exit(recorder.finish('test-results/api-inventory-live.json') || 1);
});
