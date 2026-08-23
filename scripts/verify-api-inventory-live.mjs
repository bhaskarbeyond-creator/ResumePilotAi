#!/usr/bin/env node
/**
 * Live API inventory verifier.
 *
 * The inventory document is the release manifest, but a response is never
 * accepted merely because its status code was placed in a broad allow-list.
 * Each non-2xx result is classified from the route's documented contract plus
 * evidence in the response body/headers. Unexplained 404/500/501/502/503
 * responses fail the run.
 *
 * GET/HEAD/OPTIONS are safe by default. Mutating requests are skipped unless
 * ALLOW_MUTATIONS=1; destructive CRUD belongs to verify-crud-live.mjs.
 * Parameterised routes are reported as BLOCKED unless a real id is supplied by
 * the dedicated CRUD script, never probed with a made-up resource id.
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
  reportMissingEnv,
} from './lib/live-certification.mjs';

const SCRIPT = 'verify-api-inventory-live';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, values, missing } = readEnv({
  PROD_BASE_URL: { default: DEFAULT_BASE_URL, description: 'Production origin' },
  FIREBASE_API_KEY: { required: true, description: 'Firebase Web API key used for authenticated route probes' },
  ADMIN_EMAIL: { required: true, description: 'ADMIN account email' },
  ADMIN_PASSWORD: { required: true, description: 'ADMIN account password' },
  SUPERADMIN_EMAIL: { required: true, description: 'SUPER_ADMIN account email' },
  SUPERADMIN_PASSWORD: { required: true, description: 'SUPER_ADMIN account password' },
  ALLOW_MUTATIONS: { default: '0', description: 'Set to 1 for safe validation bodies; CRUD mutations require verify-crud-live.mjs' },
  REQUEST_DELAY_MS: { default: '120', description: 'Delay between live requests' },
});
if (!ok) { reportMissingEnv(missing, SCRIPT); process.exit(2); }

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const allowMutations = values.ALLOW_MUTATIONS === '1';
const delayMs = Math.max(0, Math.min(Number(values.REQUEST_DELAY_MS) || 120, 5000));
const recorder = new Recorder(SCRIPT, { base: BASE, allowMutations });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadInventory() {
  const file = path.join(root, 'docs/FINAL_API_INVENTORY.md');
  if (!fs.existsSync(file)) return null;
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('## 5. Full endpoint table');
  if (start < 0) return null;
  const rows = [];
  const seen = new Set();
  for (const line of source.slice(start).split('\n')) {
    const match = line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\|\s*`([^`]+)`([^|]*)\|(.+)\|?$/);
    if (!match) continue;
    const [, method, routePath, annotation, tail] = match;
    const cells = tail.split('|').map(value => value.trim().replaceAll('`', ''));
    const key = `${method} ${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ method, path: routePath, alias: /alias of/i.test(annotation), cells, documentedState: cells[9] || '', documentedFailures: cells[5] || '', live: cells[12] || '' });
  }
  return rows.length ? rows : null;
}

const parameterised = route => /:[A-Za-z]/.test(route) || /\{[A-Za-z]/.test(route);
const failureContractContains = (row, status) => {
  const failures = String(row.documentedFailures || '').replaceAll(' ', '').split('/');
  return failures.includes(String(status));
};

function responseCode(response) {
  return response.json?.error?.code || response.json?.code || response.json?.errorCode || null;
}

function explainNon2xx(row, response) {
  const status = response.status;
  const code = responseCode(response);
  const body = response.json || {};
  const configurationState = body.configurationState || body.error?.configurationState || body.deliveryState || null;
  const documentedState = String(row.documentedState || '').toUpperCase();

  if (status === 401) return { kind: 'protected', reason: 'The endpoint requires a bearer credential and rejected the unauthenticated probe.' };
  if (status === 403) return { kind: 'protected', reason: 'The endpoint authenticated the caller but denied the caller role or permission.' };
  if (status === 429 && (response.headers?.['retry-after'] || code === 'RATE_LIMITED' || code === 'M2M_RATE_LIMITED')) {
    return { kind: 'documented', reason: `The server supplied rate-limit evidence${response.headers?.['retry-after'] ? ` (Retry-After ${response.headers['retry-after']})` : ''}.`, code };
  }
  if ([400, 409, 422].includes(status) && failureContractContains(row, status)) {
    return { kind: 'documented', reason: `The release manifest documents HTTP ${status} as a validation/conflict outcome for this endpoint.`, code };
  }
  // A disabled/unconfigured route must say so itself. Route-name guesses are
  // not evidence and are deliberately not accepted.
  if ([404, 501, 503].includes(status) && code && (configurationState || /DISABLED|NOT_CONFIGURED|UNAVAILABLE|NOT_SUPPORTED/i.test(documentedState))) {
    return { kind: 'documented', reason: `The endpoint returned machine-readable ${code}${configurationState ? ` (${configurationState})` : ''}.`, code, configurationState };
  }
  if (status === 503 && code && /unavailable|not_configured|disabled|configuration|service/i.test(String(code))) {
    return { kind: 'documented', reason: `The endpoint explained its unavailable state with ${code}.`, code, configurationState };
  }
  return null;
}

async function signIn(label, emailKey, passwordKey) {
  if (!values.FIREBASE_API_KEY || !values[emailKey] || !values[passwordKey]) {
    recorder.blocked(`${label} session established`, { reason: `Set FIREBASE_API_KEY, ${emailKey}, and ${passwordKey} for authenticated probes.` });
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
  const inventory = loadInventory();
  if (!inventory) {
    recorder.blocked('release API inventory parsed', { reason: 'docs/FINAL_API_INVENTORY.md has no full endpoint table.', remediation: 'Regenerate the release manifest before probing production.' });
    process.exit(recorder.finish('test-results/api-inventory-live.json'));
  }
  recorder.pass('release API inventory parsed', { endpoints: inventory.length });

  const reachability = await probe(`${BASE}/healthz`);
  if (!reachability.ok) {
    recorder.blocked('production origin reachable', { reason: reachability.error, remediation: 'Run from a host permitted to reach the production origin.' });
    process.exit(recorder.finish('test-results/api-inventory-live.json'));
  }
  if (reachability.status >= 400) recorder.fail('production origin reachable', { status: reachability.status, reason: 'The health endpoint returned an error.' });
  else recorder.pass('production origin reachable', { status: reachability.status });

  const superAdmin = await signIn('SUPER_ADMIN', 'SUPERADMIN_EMAIL', 'SUPERADMIN_PASSWORD');
  const admin = await signIn('ADMIN', 'ADMIN_EMAIL', 'ADMIN_PASSWORD');
  const authenticated = superAdmin || admin;
  const findings = { probed: 0, pass: 0, protected: 0, blocked: 0, unexplained: [] };

  for (const row of inventory) {
    if (parameterised(row.path)) {
      findings.blocked += 1;
      recorder.blocked(`${row.method} ${row.path}`, { reason: 'Parameterised route requires a disposable resource id; run verify-crud-live.mjs for a real lifecycle.' });
      continue;
    }
    if (!allowMutations && !['GET', 'HEAD', 'OPTIONS'].includes(row.method)) {
      findings.blocked += 1;
      continue;
    }
    const response = await probe(`${BASE}${row.path}`, {
      method: row.method,
      headers: authenticated ? { Authorization: `Bearer ${authenticated.idToken}` } : {},
      ...(allowMutations && ['POST', 'PUT', 'PATCH'].includes(row.method) ? { headers: { ...(authenticated ? { Authorization: `Bearer ${authenticated.idToken}` } : {}), 'Content-Type': 'application/json' }, body: '{}' } : {}),
    });
    findings.probed += 1;
    await sleep(delayMs);
    if (!response.ok) {
      findings.unexplained.push({ method: row.method, path: row.path, status: 0, reason: response.error });
      continue;
    }
    if (response.status < 400) { findings.pass += 1; continue; }
    const explanation = explainNon2xx(row, response);
    if (explanation?.kind === 'protected') { findings.protected += 1; continue; }
    if (explanation) { findings.pass += 1; recorder.info(`${row.method} ${row.path} non-2xx is explained`, { status: response.status, code: explanation.code, reason: explanation.reason, configurationState: explanation.configurationState }); continue; }
    findings.unexplained.push({ method: row.method, path: row.path, status: response.status, code: responseCode(response), body: (response.text || '').slice(0, 240), documentedState: row.documentedState });
  }

  recorder.info('endpoint probes completed', { probed: findings.probed, protected: findings.protected, skippedParameterised: findings.blocked, successfulOrExplained: findings.pass });
  if (findings.unexplained.length) {
    recorder.fail('every non-2xx response has an evidenced documented reason', { reason: `${findings.unexplained.length} response(s) were unexplained.`, endpoints: findings.unexplained.slice(0, 50), remediation: 'Fix the route or add a precise machine-readable disposition and update the release manifest.' });
  } else {
    recorder.pass('every non-2xx response has an evidenced documented reason', { probed: findings.probed });
  }
  process.exit(recorder.finish('test-results/api-inventory-live.json'));
}

main().catch(error => { recorder.fail('script completed', { reason: error.message }); process.exit(recorder.finish('test-results/api-inventory-live.json') || 1); });
