#!/usr/bin/env node
/**
 * Candidate-dashboard frontend ↔ backend endpoint contract.
 *
 * Statically extracts every HTTP call made by candidate-scope frontend files
 * (api-client helpers get/post/put/patch/del, apiClient.*, raw fetch('/api…')),
 * applies the api-client baseURL ('/api'), and matches each call against the
 * backend's real Express routing table (collectRoutes from platformHealth).
 *
 *   node scripts/audit/candidate-endpoint-contract.mjs [--json out.json]
 *
 * Exit code 1 when any call has no matching backend route.
 * Requires backend dependencies. Loading backend/index.js does not open the DB
 * listener path used by tests here; set NODE_ENV=development.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const FRONTEND_SRC = path.join(repoRoot, 'frontend', 'src');

const SCOPE = [
  'pages/dashboard',
  'pages/portfolio',
  'pages/auth',
  'hooks/use-api-hooks.ts',
  'components/layout/cuba-app-shell.tsx',
  'components/Dashboard',
  'components/resume',
  'providers',
  'lib',
];

// Hooks/endpoints in use-api-hooks.ts that serve other portals (not candidate scope).
const NON_CANDIDATE = /^\/api\/(admin|employer|job-applications|jobs\/:param\/applications)\b/;

function listFiles(target) {
  const absolute = path.join(FRONTEND_SRC, target);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) return listFiles(path.relative(FRONTEND_SRC, child));
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [child] : [];
  });
}

// Type arguments are skipped as balanced <...> up to three levels deep, e.g.
// get<{ resumes?: Array<Record<string, unknown>> }>('/resumes'). (One level was
// supported before, so calls with deeper type arguments were silently missed.)
const CALL = /\b(get|post|put|patch|del|apiClient\.(?:get|post|put|patch|delete))\s*(?:<(?:[^<>()]|<(?:[^<>()]|<[^<>()]*>)*>)*>)?\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
const FETCH = /\bfetch\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;

function normalise(literal) {
  let value = literal.slice(1, -1);
  value = value.replace(/\$\{[^}]+\}/g, ':param').split('?')[0];
  return value;
}

function methodOf(name) {
  const bare = name.replace('apiClient.', '');
  return { del: 'DELETE', delete: 'DELETE' }[bare] || bare.toUpperCase();
}

const calls = [];
for (const file of SCOPE.flatMap(listFiles)) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(repoRoot, file);
  const importsApiClient = /from '@\/lib\/api-client'/.test(source) || relative.endsWith('lib/api-client.ts');
  for (const match of source.matchAll(CALL)) {
    const raw = normalise(match[2]);
    if (!raw.startsWith('/')) continue; // searchParams.get('tab') etc.
    if (!importsApiClient && !match[1].startsWith('apiClient')) continue;
    const line = source.slice(0, match.index).split('\n').length;
    calls.push({ file: relative, line, method: methodOf(match[1]), raw, resolved: `/api${raw}`, via: 'api-client' });
  }
  for (const match of source.matchAll(FETCH)) {
    const raw = normalise(match[1]);
    if (!raw.startsWith('/')) continue;
    const line = source.slice(0, match.index).split('\n').length;
    const window = source.slice(match.index, match.index + 300);
    const method = (/method:\s*['"](\w+)['"]/.exec(window)?.[1] || 'GET').toUpperCase();
    calls.push({ file: relative, line, method, raw, resolved: raw, via: 'fetch' });
  }
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const app = require(path.join(repoRoot, 'backend', 'index.js'));
const { collectRoutes } = require(path.join(repoRoot, 'backend', 'services', 'platformHealth.js'));

// collectRoutes() only sees routes registered directly on the app. Mounted
// routers (app.use('/api/resumes', resumesRouter)) are resolved from source:
// router variable -> routes/<file>.js -> mount prefix -> router.METHOD('path').
function mountedRouterRoutes() {
  const backendDir = path.join(repoRoot, 'backend');
  const indexSource = fs.readFileSync(path.join(backendDir, 'index.js'), 'utf8');
  const variableToFile = new Map();
  for (const match of indexSource.matchAll(/const\s+\{\s*([^}]+)\}\s*=\s*require\(\s*['"]\.\/routes\/([\w-]+)['"]\s*\)/g)) {
    for (const name of match[1].split(',').map(part => part.split(':').pop().trim()).filter(Boolean)) variableToFile.set(name, match[2]);
  }
  for (const match of indexSource.matchAll(/const\s+(\w+)\s*=\s*require\(\s*['"]\.\/routes\/([\w-]+)['"]\s*\)/g)) variableToFile.set(match[1], match[2]);
  const found = [];
  for (const match of indexSource.matchAll(/app\.use\(\s*['"](\/api[^'"]*)['"]\s*,([^;]*?)\)\s*;/g)) {
    const identifiers = match[2].split(',').map(part => part.trim()).filter(part => /^\w+$/.test(part));
    const routerVariable = identifiers.reverse().find(identifier => variableToFile.has(identifier));
    if (!routerVariable) continue;
    const file = path.join(backendDir, 'routes', `${variableToFile.get(routerVariable)}.js`);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const routerNames = new Set([...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:express\.)?Router\(/g)].map(m => m[1]));
    if (!routerNames.size) routerNames.add('router');
    for (const route of source.matchAll(/\b(\w+)\.(get|post|put|patch|delete|all)\(\s*['"](\/[^'"]*)['"]/g)) {
      if (!routerNames.has(route[1])) continue;
      const mount = match[1].replace(/\/$/, '');
      found.push({ method: route[2].toUpperCase(), path: `${mount}${route[3] === '/' ? '' : route[3]}` || '/', source: path.relative(repoRoot, file) });
    }
  }
  return found;
}

const toPattern = routePath => new RegExp(`^${String(routePath).replace(/[.+*?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z0-9_]+\\\?/g, '[^/]*').replace(/:[A-Za-z0-9_]+/g, '[^/]+')}/?$`);
const routes = [
  ...collectRoutes(app).map(route => ({ method: String(route.method).toUpperCase(), path: route.path, source: 'backend/index.js' })),
  ...mountedRouterRoutes(),
].map(route => ({ ...route, pattern: toPattern(route.path) }));

function matchRoute(call) {
  const concrete = call.resolved.replace(/:param/g, 'x1');
  return routes.find(route => (route.method === call.method || route.method === 'ALL') && route.pattern.test(concrete));
}

const results = calls.map(call => ({ ...call, candidateScope: !NON_CANDIDATE.test(call.resolved), route: matchRoute(call)?.path || null }));
const candidate = results.filter(result => result.candidateScope);
const missing = candidate.filter(result => !result.route);

const unique = new Map();
for (const result of candidate) unique.set(`${result.method} ${result.resolved}`, result);
console.log(`Candidate-scope calls: ${candidate.length} (${unique.size} unique method+path), backend routes: ${routes.length}`);
console.log(`Unmatched: ${missing.length}`);
for (const result of missing) console.log(`  ✗ ${result.method.padEnd(6)} ${result.resolved.padEnd(48)} ${result.file}:${result.line}`);

const jsonIndex = process.argv.indexOf('--json');
if (jsonIndex > 0) fs.writeFileSync(process.argv[jsonIndex + 1], `${JSON.stringify({ generatedAt: new Date().toISOString(), routes: routes.length, calls: candidate }, null, 2)}\n`);

// Loading backend/index.js may start timers/pools; exit explicitly.
process.exit(missing.length ? 1 : 0);
