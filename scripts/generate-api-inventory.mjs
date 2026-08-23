#!/usr/bin/env node
/** Generate the source-of-truth API release manifest from Express routing. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { collectRoutes } from '../backend/services/platformHealth.js';

const require = createRequire(import.meta.url);
const app = require('../backend/index.js');
const routes = collectRoutes(app);
const publicPaths = new Set(['/healthz', '/readyz', '/api/healthz', '/api/readyz', '/api/health', '/api/service-availability', '/api/platform/version', '/llms.txt', '/public/custom-pages.json', '/public/trusted-by.json']);
const superAdmin = new Set([
  'GET /api/admin/firebase-service-account', 'POST /api/admin/ai-settings', 'POST /api/admin/ai/test-provider', 'POST /api/admin/ai/fetch-models',
  'POST /api/admin/payment-settings', 'POST /api/admin/payment/test-provider', 'POST /api/admin/system-health-settings',
  'POST /api/admin/firebase-service-account', 'POST /api/admin/twilio-settings', 'POST /api/admin/delete-user', 'POST /api/auth/purge-orphaned-auth', 'POST /api/send-sms',
  'GET /api/platform/feature-flags', 'GET /api/platform/configuration',
]);
const platformSuper = /^(POST|PATCH|DELETE) \/api\/platform\/(maintenance|announcements|operators|queues\/retry|tenants\/.*(?:decommission)?|feature-flags|operational-status\/.*\/test)/;
const moduleFor = path => path.startsWith('/api/enterprise') ? 'enterprise' : path.startsWith('/api/platform') ? 'platform' : path.startsWith('/api/admin') || path.startsWith('/api/email/admin') ? 'admin' : path.startsWith('/api/email') || path.includes('/notify') ? 'notifications' : path.startsWith('/api/auth') ? 'auth' : path.startsWith('/api/health') || path === '/healthz' || path === '/readyz' ? 'health' : path.startsWith('/api/') ? 'consumer-api' : 'public';
const uiFor = path => path.startsWith('/api/platform') ? 'src/components/admin' : path.startsWith('/api/admin') || path.startsWith('/api/email/admin') ? 'src/components/admin' : path.startsWith('/api/enterprise') ? 'src/enterprise' : 'consumer/runtime';
const adminControlPaths = new Set(['/api/auth/purge-orphaned-auth', '/api/auth/github/test-credentials', '/api/auth/linkedin/test-credentials', '/api/send-sms', '/api/email/logs', '/api/email/resend', '/api/email/templates', '/api/logs', '/api/resend', '/api/templates', '/api/send-email']);
const isAdminControlPath = path => path.startsWith('/api/platform') || path.startsWith('/api/admin') || path.startsWith('/api/email/admin') || adminControlPaths.has(path);
const authFor = path => publicPaths.has(path) ? 'PUBLIC' : isAdminControlPath(path) ? 'BEARER_ADMIN' : path.startsWith('/api/enterprise/m2m') ? 'SERVICE_KEY' : 'BEARER_USER';
const roleFor = (method, path) => publicPaths.has(path) ? 'PUBLIC' : superAdmin.has(`${method} ${path}`) || platformSuper.test(`${method} ${path}`) ? 'SUPER_ADMIN' : isAdminControlPath(path) ? 'ADMIN+' : path.startsWith('/api/enterprise') ? 'TENANT_POLICY' : 'AUTHENTICATED';
const auditFor = (method, path) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || path.includes('/audit') || path.includes('/firebase-service-account') ? 'YES' : 'NO';
const okFor = method => method === 'POST' ? '200/201/202/204' : method === 'DELETE' ? '200/204' : '200';
const failFor = () => '400/401/403/404/409/429/500/501/502/503';
let sha = 'unknown';
try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) {}

const lines = [
  '# FINAL API INVENTORY',
  '',
  `**Generated:** ${new Date().toISOString()}`,
  `**Source commit:** \`${sha}\``,
  '**Authority:** Express runtime routing table collected by `backend/services/platformHealth.js`.',
  '',
  '> This is a source/release manifest, not live production evidence. `LIVE` remains `NOT VERIFIED` until the local/live runbook is executed against the deployed SHA.',
  '',
  '## 1. Reconciled source counts',
  '',
  `- Unique reachable ` + '`METHOD + path`' + ` entries: **${routes.length}**.`,
  '- The count includes dual-mounted email aliases and the `/api/enterprise/m2m` service-key namespace.',
  '- Parameterised routes are legitimate but require a disposable fixture id; they are not probed with guessed ids.',
  '- No source count is presented as a production count.',
  '',
  '## 2. Non-2xx disposition contract',
  '',
  '| Response | Legitimate reason | Evidence required by live verifier |',
  '| --- | --- | --- |',
  '| 400 | Validation or malformed request | Endpoint-specific error code/message and documented `FAIL` contract |',
  '| 401 | Missing/invalid bearer or service credential | Auth challenge from the server |',
  '| 403 | Authenticated principal lacks role/scope, tenant context, MFA, or recent auth | Machine-readable authorization code |',
  '| 404 | Resource not found, single-use token invalid, or Enterprise gate disabled | Route/resource code; never inferred from URL alone |',
  '| 409 | Revision, lifecycle, idempotency, or uniqueness conflict | Conflict code and retry/remediation |',
  '| 429 | Abuse/rate-limit budget exhausted | `Retry-After` or rate-limit code |',
  '| 500 | Unexpected server failure | **Not accepted** without a root-cause fix |',
  '| 501 | Deliberately unsupported integration (for example unconfigured Naukri) | Explicit `NOT_SUPPORTED`/`NOT_CONFIGURED` code |',
  '| 502/503 | Provider, datastore, worker, or configuration unavailable | Explicit code plus `configurationState`/dependency |',
  '',
  '## 3. Deployment/API rules',
  '',
  '- Admin and platform routes require a verified Firebase bearer token and server-side RBAC.',
  '- Super Admin mutations additionally require production MFA and recent Firebase `auth_time`.',
  '- Tenant routes resolve tenant/workspace context server-side; URL/header/body ids never grant authority.',
  '- Responses and audit projections must remain secret-free.',
  '',
  '## 4. Live execution',
  '',
  '```sh',
  'npm run certify:identity',
  'npm run certify:health',
  'npm run certify:api',
  'npm run certify:crud',
  'npm run certify:ui',
  '```',
  '',
  '## 5. Full endpoint table',
  '',
  '| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |',
  '| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |',
];
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  lines.push(`| ${route.method} | \`${route.path}\` | ${authFor(route.path)} | ${roleFor(route.method, route.path)} | ${route.path.startsWith('/api/enterprise') ? 'TENANT/PLATFORM' : route.path.startsWith('/api/admin') || route.path.startsWith('/api/platform') ? 'PLATFORM' : '-'} | ${roleFor(route.method, route.path) === 'SUPER_ADMIN' ? 'YES' : '-'} | ${okFor(route.method)} | ${failFor(route.method)} | ${route.path.startsWith('/api/') && !route.path.startsWith('/api/health') ? 'SEE HEALTH' : '-'} | NOT MEASURED | NOT MEASURED | NOT VERIFIED | ${uiFor(route.path)} | ${auditFor(route.method, route.path)} | NOT VERIFIED |`);
}
lines.push('', '## 6. Change log', '', '- Added source-generated `/api/platform/version` deployment identity.', '- Added authoritative Admin user, collection, payment-ledger, tenant-detail, and tenant-rename routes.', '- Added explicit machine-readable disabled/unavailable states for Enterprise and provider integrations.');
fs.writeFileSync('docs/FINAL_API_INVENTORY.md', `${lines.join('\n')}\n`);
console.log(`Wrote docs/FINAL_API_INVENTORY.md with ${routes.length} endpoints from ${sha}.`);
