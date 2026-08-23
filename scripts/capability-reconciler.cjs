'use strict';

/**
 * Admin / Super Admin capability reconciliation.
 *
 * WHY THIS EXISTS
 * ---------------
 * A previous pass of this audit used a naive grep for `fetch('/api/...')`
 * inside page components and concluded that tenant decommission "exists in the
 * backend but has no UI". That was WRONG: the control is wired through
 * `src/services/platformApi.js`, one level of indirection away from the page.
 *
 * A reconciliation that cannot see through the service layer produces false
 * gaps (and, worse, would miss real ones). This module therefore resolves API
 * paths through the whole frontend module graph:
 *
 *   1. Collect every literal/template `/api/...` path in `src/**`, per file.
 *   2. Build the import graph of `src/**`.
 *   3. Propagate paths from service modules to the components that import them.
 *   4. Match the resulting reachable set against routes registered in
 *      `backend/**`, accounting for router mount prefixes.
 *
 * Output feeds both `scripts/generate-capability-matrix.mjs` and the executed
 * regression test `tests/admin-capability-reconciliation.test.mjs`.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = file => path.relative(REPO_ROOT, file).split(path.sep).join('/');

/* ────────────────────────────── backend routes ───────────────────────────── */

/**
 * Router mount prefixes, read from `app.use(...)` in backend/index.js so the
 * mapping cannot silently drift from the application wiring.
 */
function readMountPrefixes() {
  const indexPath = path.join(REPO_ROOT, 'backend/index.js');
  const source = fs.readFileSync(indexPath, 'utf8');
  const mounts = new Map();
  const requires = new Map();

  for (const match of source.matchAll(/const\s*\{?\s*([A-Za-z0-9_,\s]+?)\s*\}?\s*=\s*require\(['"]\.\/(routes\/[A-Za-z0-9_]+)['"]\)/g)) {
    const file = `backend/${match[2]}.js`;
    for (const name of match[1].split(',').map(item => item.trim()).filter(Boolean)) requires.set(name, file);
  }

  for (const match of source.matchAll(/app\.use\(\s*(\[[^\]]*\]|['"`][^'"`]+['"`])\s*,\s*([A-Za-z0-9_]+)/g)) {
    const raw = match[1];
    const handler = match[2];
    const file = requires.get(handler);
    if (!file) continue;
    const prefixes = raw.startsWith('[')
      ? [...raw.matchAll(/['"`]([^'"`]+)['"`]/g)].map(item => item[1])
      : [raw.slice(1, -1)];
    if (!mounts.has(file)) mounts.set(file, new Set());
    for (const prefix of prefixes) mounts.get(file).add(prefix);
  }
  return mounts;
}

function normalizePath(value) {
  return String(value)
    .replace(/\$\{[^}]*\}/g, ':param')
    .replace(/:[A-Za-z0-9_]+/g, ':param')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '') || '/';
}

/**
 * Segment-wise path match where `:param` is a wildcard on EITHER side.
 *
 * This matters because the frontend builds paths with template literals
 * (`/api/admin/users/${uid}`) that normalise to `:param`, while the backend may
 * declare a concrete path (`/api/auth/linkedin/test-credentials`). A plain
 * string comparison reports these as mismatches — which is exactly the class of
 * false positive that produced the incorrect "no UI" finding previously.
 */
function pathsMatch(a, b) {
  if (a === b) return true;
  const left = a.split('/');
  const right = b.split('/');
  if (left.length !== right.length) return false;
  return left.every((segment, index) => segment === right[index] || segment === ':param' || right[index] === ':param');
}

/** Every HTTP route the backend registers, with its fully qualified path. */
function collectBackendRoutes() {
  const mounts = readMountPrefixes();
  const files = walk(path.join(REPO_ROOT, 'backend'))
    .filter(file => file.endsWith('.js'))
    .filter(file => !/\/(test|enterprise-test)\//.test(rel(file)));

  const routes = [];
  for (const file of files) {
    const relative = rel(file);
    const source = fs.readFileSync(file, 'utf8');
    const prefixes = mounts.get(relative) ? [...mounts.get(relative)] : [''];
    for (const match of source.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete|all)\(\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/g)) {
      const method = match[1].toUpperCase();
      const raw = match[2];
      const declared = raw.startsWith('[')
        ? [...raw.matchAll(/['"`]([^'"`]+)['"`]/g)].map(item => item[1])
        : [raw.slice(1, -1)];
      for (const declaredPath of declared) {
        if (!declaredPath.startsWith('/')) continue; // not a route path
        const candidates = declaredPath.startsWith('/api/')
          ? [declaredPath]
          : prefixes.map(prefix => `${prefix}${declaredPath}`);
        for (const candidate of candidates) {
          if (!candidate.startsWith('/api')) continue;
          routes.push({ method, path: normalizePath(candidate), file: relative, raw: declaredPath });
        }
      }
    }
  }
  return routes;
}

/* ───────────────────────────── frontend reachability ─────────────────────── */

const FRONTEND_EXTENSIONS = ['.js', '.jsx', '.mjs'];

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...FRONTEND_EXTENSIONS.map(ext => base + ext),
    ...FRONTEND_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

/**
 * Map every frontend module to the set of `/api/...` paths it can ultimately
 * reach, following imports transitively (service layer included).
 */
/**
 * Extract every `/api/...` path a source file references.
 *
 * Paths are frequently built with template literals that embed expressions and
 * query strings, e.g.
 *   `/api/admin/users${params.toString() ? `?${params}` : ''}`
 * A quote-anchored regex mis-parses those. Instead: find each `/api/`
 * occurrence, consume `${...}` groups whole, and stop at the first character
 * that cannot appear in a path (quote, backtick, whitespace, `?`, `#`, `,`,
 * `)`), then normalise.
 */
function extractApiPaths(source) {
  const paths = new Set();
  const PATH_CHAR = /[A-Za-z0-9_\-/.:]/;
  for (let index = source.indexOf('/api/'); index !== -1; index = source.indexOf('/api/', index + 1)) {
    // Skip occurrences embedded in an absolute URL such as
    // `https://openrouter.ai/api/v1` — those are third-party endpoints, not
    // routes this application serves.
    const preceding = source.slice(Math.max(0, index - 64), index);
    if (/[A-Za-z0-9_-]\.[A-Za-z]{2,}$/.test(preceding) || /https?:\/\/[^'"`\s]*$/.test(preceding)) continue;
    let cursor = index;
    let value = '';
    while (cursor < source.length) {
      if (source.startsWith('${', cursor)) {
        let depth = 1;
        let scan = cursor + 2;
        while (scan < source.length && depth > 0) {
          if (source[scan] === '{') depth += 1;
          else if (source[scan] === '}') depth -= 1;
          scan += 1;
        }
        // An interpolation that contains a quote is a conditional suffix such as
        // a query string, not a path segment. Stop the path here.
        const expression = source.slice(cursor + 2, scan - 1);
        if (/['"`?]/.test(expression)) break;
        value += ':param';
        cursor = scan;
        continue;
      }
      if (!PATH_CHAR.test(source[cursor])) break;
      value += source[cursor];
      cursor += 1;
    }
    value = value.replace(/[./:]+$/, '');
    if (value.length > 5) paths.add(normalizePath(value));
  }
  return paths;
}

function collectFrontendApiReachability() {
  const files = walk(path.join(REPO_ROOT, 'src')).filter(file => FRONTEND_EXTENSIONS.includes(path.extname(file)));
  const direct = new Map();
  const imports = new Map();

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    direct.set(file, extractApiPaths(source));

    const edges = new Set();
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) edges.add(resolved);
    }
    imports.set(file, edges);
  }

  // Transitive closure (iterate to a fixed point; the graph is small).
  const reachable = new Map(files.map(file => [file, new Set(direct.get(file))]));
  let changed = true;
  let guard = 0;
  while (changed && guard < 50) {
    changed = false;
    guard += 1;
    for (const file of files) {
      const target = reachable.get(file);
      for (const dependency of imports.get(file) || []) {
        for (const apiPath of reachable.get(dependency) || []) {
          if (!target.has(apiPath)) { target.add(apiPath); changed = true; }
        }
      }
    }
  }
  return { direct, reachable };
}

/* ────────────────────────────── reconciliation ───────────────────────────── */

const ADMIN_SURFACE_PREFIXES = ['src/components/admin/', 'src/enterprise/'];

function isAdminSurface(file) {
  const relative = rel(file);
  return ADMIN_SURFACE_PREFIXES.some(prefix => relative.startsWith(prefix));
}

/**
 * Routes that are legitimately not called by the browser. Each entry states WHY,
 * so the allowlist itself is auditable rather than a silencing mechanism.
 */
const NON_UI_ROUTE_REASONS = [
  [/^\/api\/enterprise\/m2m\//, 'Machine-to-machine service credential surface; not a browser control.'],
  [/^\/api\/platform\/version$/, 'Unauthenticated deployment identity probe used by live certification scripts.'],
  [/^\/api\/health/, 'Infrastructure liveness probe.'],
  [/webhook/i, 'Inbound provider webhook; invoked by the payment/email provider, not the UI.'],
  [/^\/api\/auth\/(linkedin|github)\/(callback|start)/, 'OAuth redirect endpoints driven by the identity provider.'],
];

function nonUiReason(routePath) {
  const found = NON_UI_ROUTE_REASONS.find(([pattern]) => pattern.test(routePath));
  return found ? found[1] : null;
}

/**
 * Compare the backend's Admin/Super-Admin control-plane routes against what the
 * Admin console can actually reach.
 */
function reconcile() {
  const mounts = readMountPrefixes();
  const routes = collectBackendRoutes();
  const { reachable, direct } = collectFrontendApiReachability();
  const directOf = file => direct.get(file) || new Set();

  const adminReachable = new Set();
  const anyReachable = new Set();
  const reachedBy = new Map();
  for (const [file, paths] of reachable) {
    for (const apiPath of paths) {
      anyReachable.add(apiPath);
      if (isAdminSurface(file)) {
        adminReachable.add(apiPath);
        if (!reachedBy.has(apiPath)) reachedBy.set(apiPath, new Set());
        reachedBy.get(apiPath).add(rel(file));
      }
    }
  }

  const controlPlane = routes.filter(route =>
    route.path.startsWith('/api/platform') || route.path.startsWith('/api/admin')
  );

  const seen = new Set();
  const unique = controlPlane.filter(route => {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const allReachable = [...anyReachable];
  const isReachable = candidatePath => allReachable.some(candidate => pathsMatch(candidate, candidatePath));

  // A router mounted at several prefixes exposes the SAME handler at each. The
  // email router, for example, is mounted at both `/api` and `/api/email`, so
  // `/api/admin/save-smtp` and `/api/email/admin/save-smtp` are one capability.
  // Treating the unused alias as an orphan would be a false gap.
  const aliasesOf = route => {
    const prefixes = mounts.get(route.file);
    if (!prefixes || route.raw.startsWith('/api/')) return [route.path];
    return [...prefixes].map(prefix => normalizePath(`${prefix}${route.raw}`));
  };

  const orphanedRoutes = unique.filter(route =>
    !aliasesOf(route).some(isReachable) && !nonUiReason(route.path)
  );

  // Frontend calls that resolve to no backend route at all.
  const routePaths = [...new Set(routes.map(route => route.path))];
  const brokenCalls = [];
  for (const [file, paths] of reachable) {
    if (!isAdminSurface(file)) continue;
    // Only report paths this module references DIRECTLY; a transitively
    // reachable path belongs to the module that actually issues the call.
    for (const apiPath of directOf(file)) {
      if (routePaths.some(known => pathsMatch(known, apiPath))) continue;
      if (routePaths.some(known => apiPath.startsWith(`${known}/`))) continue;
      brokenCalls.push({ file: rel(file), path: apiPath });
    }
  }

  return {
    routes,
    controlPlaneRoutes: unique,
    adminReachable,
    reachedBy,
    orphanedRoutes,
    brokenCalls,
    nonUiReason,
  };
}

module.exports = {
  REPO_ROOT,
  walk,
  rel,
  normalizePath,
  pathsMatch,
  extractApiPaths,
  readMountPrefixes,
  collectBackendRoutes,
  collectFrontendApiReachability,
  reconcile,
  nonUiReason,
  NON_UI_ROUTE_REASONS,
};
