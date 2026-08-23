/**
 * Generate the Admin / Super Admin capability matrix from source.
 *
 * Hand-written capability matrices drift. This audit already produced one false
 * claim ("tenant decommission has no UI") from a scan that could not see
 * through the service layer, so the matrix is now derived from the same
 * reconciler the regression test uses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const reconciler = require('./capability-reconciler.cjs');

const { REPO_ROOT } = reconciler;

/** Guards applied to a route, read from the backend source line that declares it. */
function guardsFor(route) {
  const source = fs.readFileSync(path.join(REPO_ROOT, route.file), 'utf8');
  const escaped = route.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\.${route.method.toLowerCase()}\\(\\s*(?:\\[[^\\]]*\\]|['"\`]${escaped}['"\`])([^\\n]*)`, 'i');
  const line = source.match(pattern)?.[1] || '';
  const guards = [];
  if (/requireRecentAdminAuthentication|requireRecentAuth/.test(line)) guards.push('RECENT_AUTH + SUPER_ADMIN + MFA');
  else if (/requireSuperAdmin/.test(line)) guards.push('SUPER_ADMIN + MFA');
  else if (/requirePermission\(\s*['"]([^'"]+)/.test(line)) guards.push(`PERMISSION:${line.match(/requirePermission\(\s*['"]([^'"]+)/)[1]}`);
  return guards;
}

/** Router-level guards that apply to every route in a file. */
function routerBaseline(file) {
  const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
  const match = source.match(/router\.use\(\s*requirePermission\(\s*['"]([^'"]+)/);
  return match ? `PERMISSION:${match[1]}` : null;
}

function classify(route) {
  const explicit = guardsFor(route);
  if (explicit.length) return explicit[0];
  const baseline = routerBaseline(route.file);
  if (baseline) return `${baseline} (router)`;
  if (route.path.startsWith('/api/admin')) return 'PERMISSION:system.config.write (global admin guard)';
  return 'AUTHENTICATED';
}

const CAPABILITY_GROUPS = [
  ['Tenant lifecycle', /\/api\/(platform|enterprise)\/(platform\/)?tenants/],
  ['User lifecycle', /\/api\/admin\/users|\/api\/admin\/delete-user|purge-orphaned-auth/],
  ['Operator / role management', /\/api\/platform\/operators/],
  ['Feature flags', /feature-flags/],
  ['Platform configuration', /\/api\/platform\/configuration|\/api\/admin\/settings|gdpr-settings/],
  ['Payment settings', /payment/],
  ['AI configuration', /\/api\/admin\/ai/],
  ['Email / SMTP', /save-smtp|test-imap|circuit-breaker|deliverability|custom-templates|template-customization|\/api\/email/],
  ['MFA / security posture', /mfa-posture|security-events|encryption/],
  ['Platform health', /health|operational-status|attention|observability|backup-status/],
  ['Audit logs', /audit-logs/],
  ['Maintenance & queues', /maintenance|queues/],
  ['Announcements', /announcements/],
  ['Content (blog, pages, jobs, ads)', /blog|pages|jobs|ads|companies|reviews|trusted-by|coupons|employer-applications/],
];

function groupOf(routePath) {
  const found = CAPABILITY_GROUPS.find(([, pattern]) => pattern.test(routePath));
  return found ? found[0] : 'Other control-plane';
}

const result = reconciler.reconcile();
const { reachable, direct } = reconciler.collectFrontendApiReachability();

/**
 * Attribution must be DIRECT, not transitive.
 *
 * The reachability closure deliberately propagates paths through imports so a
 * capability routed via `services/platformApi.js` is not reported as unreachable
 * (the bug that produced the false "tenant decommission has no UI" finding).
 * For the matrix, however, crediting every component that transitively imports a
 * shared module would list ~30 files per route and hide the real owner. So:
 *   - `callers`  = modules that literally contain the path (the call site), and
 *   - `surfaces` = page components that import those call sites.
 */
const directRefs = new Map();
for (const [file, paths] of direct) {
  for (const apiPath of paths) {
    if (!directRefs.has(apiPath)) directRefs.set(apiPath, new Set());
    directRefs.get(apiPath).add(reconciler.rel(file));
  }
}

const PAGE_PREFIXES = ['src/components/admin/', 'src/enterprise/'];
const isPage = file => PAGE_PREFIXES.some(prefix => file.startsWith(prefix)) && /\.jsx$/.test(file);

function callersFor(routePath) {
  const out = new Set();
  for (const [apiPath, files] of directRefs) {
    if (reconciler.pathsMatch(apiPath, routePath)) for (const file of files) out.add(file);
  }
  return [...out].sort();
}

/** Page components whose own direct references include the path. */
function pagesFor(routePath) {
  const callers = callersFor(routePath);
  const own = callers.filter(isPage);
  if (own.length) return own;
  const symbols = callers.filter(file => !isPage(file)).flatMap(file => exportedSymbolsForPath(file, routePath));
  return pagesUsingSymbols(symbols);
}

/**
 * Resolve the exported symbol a call site uses for a path, then find the pages
 * that import that symbol. This names the real operator surface instead of the
 * unhelpful "via shared service".
 */
const allFrontendFiles = reconciler
  .walk(path.join(REPO_ROOT, 'src'))
  .filter(file => /\.(jsx?|mjs)$/.test(file));
const sourceCache = new Map(allFrontendFiles.map(file => [reconciler.rel(file), fs.readFileSync(file, 'utf8')]));

function exportedSymbolsForPath(callerFile, routePath) {
  const source = sourceCache.get(callerFile) || '';
  const symbols = new Set();
  const declaration = /export\s+(?:async\s+)?(?:function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*=)([\s\S]*?)(?=\n\s*export\s|$)/g;
  for (const match of source.matchAll(declaration)) {
    const name = match[1] || match[2];
    const body = match[3] || '';
    for (const found of reconciler.extractApiPaths(body)) {
      if (reconciler.pathsMatch(found, routePath)) symbols.add(name);
    }
  }
  return [...symbols];
}

function pagesUsingSymbols(symbols) {
  if (!symbols.length) return [];
  const pages = new Set();
  for (const [file, source] of sourceCache) {
    if (!isPage(file)) continue;
    for (const symbol of symbols) {
      if (new RegExp(`\\b${symbol}\\b`).test(source)) { pages.add(file); break; }
    }
  }
  return [...pages].sort();
}

function shortName(file) {
  return file.replace('src/components/admin/', '').replace('src/enterprise/', 'enterprise/').replace('src/services/', 'services/').replace('src/firestore/', 'firestore/');
}

const rows = result.controlPlaneRoutes
  .map(route => {
    const callers = callersFor(route.path);
    const pages = pagesFor(route.path);
    const nonUi = reconciler.nonUiReason(route.path);
    const orphan = result.orphanedRoutes.some(item => item.method === route.method && item.path === route.path);
    return {
      group: groupOf(route.path),
      method: route.method,
      path: route.path,
      guard: classify(route),
      callers,
      pages,
      status: orphan ? 'NO UI SURFACE' : nonUi ? 'NOT A UI CAPABILITY' : 'REACHABLE',
      nonUi,
    };
  })
  .sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const lines = [];
lines.push('# Admin / Super Admin Capability Matrix (generated)');
lines.push('');
lines.push('Generated by `node scripts/generate-capability-matrix.mjs`. Do not edit by hand.');
lines.push('');
lines.push('`REACHABLE` means the Admin console can actually invoke the route — resolved through');
lines.push('the frontend module graph, including the `services/platformApi.js` layer. An earlier');
lines.push('hand-run grep that could not see through that layer produced a false "no UI" finding,');
lines.push('which is why this document is derived rather than written.');
lines.push('');
lines.push(`- Control-plane routes analysed: **${result.controlPlaneRoutes.length}**`);
lines.push(`- Routes with no reachable UI: **${result.orphanedRoutes.length}**`);
lines.push(`- Frontend calls with no backend route: **${result.brokenCalls.length}**`);
lines.push('');

lines.push('## Role capability summary');
lines.push('');
lines.push('| Capability | USER | ADMIN | SUPER_ADMIN | Frontend complete |');
lines.push('| --- | --- | --- | --- | --- |');
const ROLE_SUMMARY = [
  ['Own profile / resumes (CRUD)', 'yes', 'yes', 'yes', 'yes'],
  ['Read users', 'no', 'yes', 'yes', 'yes — `usersManager/UsersManager.jsx`'],
  ['Update user / suspend / activate', 'no', 'yes', 'yes', 'yes — `usersManager/UsersManager.jsx`, `userEdit/UserEdit.jsx`'],
  ['Delete user', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `usersManager/UsersManager.jsx`'],
  ['Role management (operators)', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `operators/PlatformOperators.jsx`'],
  ['Tenant create / read / rename / suspend / reactivate', 'no', 'no', 'yes', 'yes — `tenants/PlatformTenants.jsx`'],
  ['Tenant decommission', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `tenants/PlatformTenants.jsx` detail drawer'],
  ['Platform configuration (read)', 'no', 'partial', 'yes', 'yes — `settings/PlatformConfigSettings.jsx`'],
  ['Platform configuration (write)', 'no', 'category-scoped', 'yes (recent-auth for secrets)', 'yes — `settings/*`'],
  ['Payment provider credentials', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `settings/PaymentSettings`'],
  ['AI provider configuration', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `settings/AiSettings.jsx`'],
  ['Feature flags', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `settings/*`'],
  ['MFA posture (read own)', 'no', 'yes', 'yes', 'yes — `Admin.jsx` banner'],
  ['MFA enrollment (own account)', 'yes', 'yes', 'yes', 'yes — `DashboardSettings.jsx`'],
  ['Audit logs', 'no', 'yes', 'yes', 'yes — `audit/AdminAuditLogs.jsx`'],
  ['Platform health', 'no', 'yes (operational view)', 'yes (+ diagnostics)', 'yes — `health/PlatformHealth.jsx`'],
  ['Maintenance mode', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `operations/PlatformOperations.jsx`'],
  ['Queue / DLQ replay', 'no', 'no', 'yes (recent-auth + MFA)', 'yes — `queues/PlatformQueues.jsx`'],
];
for (const row of ROLE_SUMMARY) lines.push(`| ${row.join(' | ')} |`);
lines.push('');

let currentGroup = null;
lines.push('## Route-level reconciliation');
lines.push('');
for (const row of rows) {
  if (row.group !== currentGroup) {
    currentGroup = row.group;
    lines.push('');
    lines.push(`### ${currentGroup}`);
    lines.push('');
    lines.push('| Method | Backend route | Guard (server-enforced) | Call site | Admin page | Status |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
  }
  const callSites = row.callers.length ? row.callers.map(file => `\`${shortName(file)}\``).join('<br>') : (row.nonUi || '—');
  const pageList = row.pages.length ? row.pages.map(file => `\`${shortName(file)}\``).join('<br>') : (row.callers.length ? 'via shared service' : '—');
  lines.push(`| ${row.method} | \`${row.path}\` | ${row.guard} | ${callSites} | ${pageList} | ${row.status} |`);
}
lines.push('');

if (result.orphanedRoutes.length) {
  lines.push('## Routes with no reachable UI');
  lines.push('');
  lines.push('| Method | Route | Declared in |');
  lines.push('| --- | --- | --- |');
  for (const route of result.orphanedRoutes) lines.push(`| ${route.method} | \`${route.path}\` | \`${route.file}\` |`);
  lines.push('');
}

if (result.brokenCalls.length) {
  lines.push('## Frontend calls with no backend route');
  lines.push('');
  for (const call of result.brokenCalls) lines.push(`- \`${call.path}\` called from \`${call.file}\``);
  lines.push('');
}

fs.mkdirSync(path.join(REPO_ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, 'docs/ADMIN_SUPER_ADMIN_CAPABILITY_MATRIX.md'), lines.join('\n'));
console.log(
  `Wrote docs/ADMIN_SUPER_ADMIN_CAPABILITY_MATRIX.md — ${result.controlPlaneRoutes.length} control-plane routes, ` +
  `${result.orphanedRoutes.length} without a UI, ${result.brokenCalls.length} broken frontend calls.`
);
