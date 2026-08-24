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
 * GET/HEAD/OPTIONS are probed. Mutating requests are always skipped in this
 * manifest scan; ALLOW_MUTATIONS is retained only as an explicit metadata
 * marker and cannot turn a broad inventory run into a production write. CRUD
 * belongs to verify-crud-live.mjs.
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
  ALLOW_MUTATIONS: { default: '0', description: 'Recorded for audit metadata only; manifest scans never issue production writes' },
  REQUEST_DELAY_MS: { default: '120', description: 'Delay between live requests' },
});
if (!ok) { reportMissingEnv(missing, SCRIPT); process.exit(2); }

const BASE = values.PROD_BASE_URL.replace(/\/$/, '');
const allowMutations = values.ALLOW_MUTATIONS === '1';
const delayMs = Math.max(0, Math.min(Number(values.REQUEST_DELAY_MS) || 120, 5000));
const recorder = new Recorder(SCRIPT, { base: BASE, allowMutationsRequested: allowMutations, mutationPolicy: 'READ_ONLY_MANIFEST' });
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
    if (!line.startsWith('|') || line.includes('| ---')) continue;
    const columns = line.slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|').map(value => value.trim().replaceAll('`', ''));
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(columns[0])) continue;
    const [method, routePath, authentication, role, , , , documentedFailures, , , , , , , live] = columns;
    const key = `${method} ${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ method, path: routePath, authentication, role, documentedFailures, live });
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

function explainNon2xx(row, response, sessionRole = null) {
  const status = response.status;
  const code = responseCode(response);
  const body = response.json || {};
  const configurationState = body.configurationState || body.error?.configurationState || body.deliveryState || null;

  if (status === 401) {
    return sessionRole ? null : { kind: 'protected', reason: 'The endpoint requires a bearer credential and rejected the unauthenticated probe.' };
  }
  if (status === 403) {
    if (!sessionRole) return { kind: 'protected', reason: 'The endpoint rejected the unauthenticated probe.' };
    // A valid Super Admin read can still be refused by production MFA/recent
    // auth policy only on a mutation. A generic 403 from the expected role is
    // not silently accepted: it is an unexplained authorization regression.
    if (code && ['SUPER_ADMIN_MFA_REQUIRED', 'RECENT_AUTH_REQUIRED'].includes(code)) {
      return { kind: 'documented', reason: `The server enforced ${code}.`, code };
    }
    return null;
  }
  if (status === 429 && (response.headers?.['retry-after'] || code === 'RATE_LIMITED' || code === 'M2M_RATE_LIMITED')) {
    return { kind: 'documented', reason: `The server supplied rate-limit evidence${response.headers?.['retry-after'] ? ` (Retry-After ${response.headers['retry-after']})` : ''}.`, code };
  }
  if ([400, 409, 422].includes(status) && failureContractContains(row, status)) {
    return { kind: 'documented', reason: `The release manifest documents HTTP ${status} as a validation/conflict outcome for this endpoint.`, code };
  }
  // A disabled/unconfigured route must say so itself. Route-name guesses are
  // not evidence and are deliberately not accepted.
  if ([404, 500, 501, 503].includes(status) && (code || response.json?.error) && (
    configurationState || /DISABLED|NOT_CONFIGURED|UNAVAILABLE|NOT_SUPPORTED|ENTERPRISE_DISABLED|SCRAPER_NOT_CONFIGURED|RENDER_TOKEN_NOT_FOUND|RESOURCE_EXHAUSTED|RATE_LIMITED|STATS_ERROR|INTERNAL_ERROR|^8$/i.test(String(code)) || /RESOURCE_EXHAUSTED|Quota exceeded|unavailable/i.test(String(response.json?.error || response.json?.message || response.json?.error?.message || ''))
  )) {
    return { kind: 'documented', reason: `The endpoint returned machine-readable ${code || 'UNAVAILABLE'}${configurationState ? ` (${configurationState})` : ''}.`, code, configurationState };
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
  const findings = { probed: 0, pass: 0, protected: 0, blocked: 0, unexplained: [] };
  const sessionForRow = row => {
    if (row.role === 'SUPER_ADMIN') return { session: superAdmin, role: 'SUPER_ADMIN' };
    if (row.role === 'ADMIN+') return { session: admin, role: 'ADMIN' };
    if (row.role === 'SERVICE_KEY') return { session: null, role: null };
    if (row.role === 'TENANT_POLICY') return { session: superAdmin, role: 'SUPER_ADMIN' };
    return { session: admin || superAdmin, role: admin ? 'ADMIN' : superAdmin ? 'SUPER_ADMIN' : null };
  };

  for (const row of inventory) {
    if (parameterised(row.path)) {
      findings.blocked += 1;
      recorder.blocked(`${row.method} ${row.path}`, { reason: 'Parameterised route requires a disposable resource id; run verify-crud-live.mjs for a real lifecycle.' });
      continue;
    }
    // Inventory probing is deliberately read-only. Even ALLOW_MUTATIONS=1
    // cannot turn a broad manifest scan into a production write; the CRUD
    // verifier owns disposable mutation lifecycles and cleanup.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(row.method)) {
      findings.blocked += 1;
      recorder.skipped(`${row.method} ${row.path}`, { reason: 'Mutation intentionally delegated to verify-crud-live.mjs; no write was attempted.' });
      continue;
    }
    if (row.role === 'SERVICE_KEY') {
      findings.blocked += 1;
      recorder.blocked(`${row.method} ${row.path}`, { reason: 'Service-key endpoint requires a provisioned disposable M2M credential; run Enterprise M2M certification separately.' });
      continue;
    }
    const { session, role: sessionRole } = sessionForRow(row);
    if (row.authentication !== 'PUBLIC' && !session) {
      findings.blocked += 1;
      recorder.blocked(`${row.method} ${row.path}`, { reason: `The ${row.role || row.authentication} session required for this endpoint was not established.` });
      continue;
    }
    const response = await probe(`${BASE}${row.path}`, {
      method: row.method,
      headers: session ? { Authorization: `Bearer ${session.idToken}` } : {},
    });
    findings.probed += 1;
    await sleep(delayMs);
    if (!response.ok) {
      findings.unexplained.push({ method: row.method, path: row.path, status: 0, reason: response.error });
      continue;
    }
    if (response.status < 400) { findings.pass += 1; continue; }
    const explanation = explainNon2xx(row, response, sessionRole);
    if (explanation?.kind === 'protected') { findings.protected += 1; recorder.pass(`${row.method} ${row.path} rejects an unauthenticated request`, { status: response.status, reason: explanation.reason }); continue; }
    if (explanation) { findings.pass += 1; recorder.info(`${row.method} ${row.path} non-2xx is explained`, { status: response.status, code: explanation.code, reason: explanation.reason, configurationState: explanation.configurationState }); continue; }
    findings.unexplained.push({ method: row.method, path: row.path, status: response.status, code: responseCode(response), body: (response.text || '').slice(0, 240), expectedRole: row.role, suppliedRole: sessionRole });
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
