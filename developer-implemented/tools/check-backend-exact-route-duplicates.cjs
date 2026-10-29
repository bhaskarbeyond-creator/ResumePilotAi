'use strict';

/**
 * Runtime Express route inventory and exact method+literal-path duplicate check.
 *
 * Loads backend/index.js with Express router/app methods instrumented before any
 * application routes register. Router mount paths are expanded as path prefixes;
 * regex/non-literal mount or route patterns are retained as explicit unresolved
 * entries rather than silently treated as complete coverage.
 *
 * This checks routes reachable from the exported backend app. It does not make
 * claims about concrete URL parameter values, HTTP proxy rewrites, or routes
 * registered by a separate deployment process.
 */

const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const backendRoot = path.join(repoRoot, 'backend');
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const developerImplementedRoot = path.join(repoRoot, 'developer-implemented');
const gitValue = (...args) => {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.chdir(backendRoot);

const express = backendRequire('express');
const HTTP_METHODS = require('node:http').METHODS.map(method => method.toLowerCase());
const routeSources = new WeakMap();
const routeMethodRegistrations = new WeakMap();
const instrumentedRouteInstances = new WeakSet();
const mountSources = new WeakMap();
const instrumentedRouters = new WeakSet();

function sourceFrame() {
  const stack = new Error().stack || '';
  for (const rawFrame of stack.split('\n').slice(2)) {
    const match = rawFrame.match(/\(?([^()\s]+\.js):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const filename = path.resolve(match[1]);
    if (!filename.startsWith(`${repoRoot}${path.sep}`)) continue;
    if (filename.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (filename === __filename) continue;
    return `${path.relative(repoRoot, filename)}:${match[2]}:${match[3]}`;
  }
  return 'source-unavailable';
}

function isPathValue(value) {
  return typeof value === 'string' || value instanceof RegExp;
}

function pathValues(value) {
  if (isPathValue(value)) return [value];
  if (Array.isArray(value) && value.length && value.every(isPathValue)) return value;
  return null;
}

function mountArguments(args) {
  const values = [...args];
  const pathCandidates = pathValues(values[0]);
  const prefixes = pathCandidates
    ? pathCandidates.map(value => typeof value === 'string'
      ? { literal: value, raw: value }
      : { literal: null, raw: String(value) })
    : [{ literal: '', raw: '' }];
  const handlers = pathCandidates ? values.slice(1) : values;
  return { prefixes, handlers };
}

function isRouter(value) {
  return typeof value === 'function'
    && Array.isArray(value.stack)
    && typeof value.handle === 'function';
}

function collectRouters(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRouters(item, result);
  } else if (isRouter(value)) {
    result.push(value);
  }
  return result;
}

function recordMount(parent, args, source) {
  if (!parent || !Array.isArray(parent.stack)) return;
  const { prefixes, handlers } = mountArguments(args);
  const children = handlers.flatMap(handler => collectRouters(handler));
  if (!children.length) return;
  const entries = mountSources.get(parent) || [];
  for (const child of children) {
    for (const prefix of prefixes) {
      entries.push({ child, ...prefix, source });
    }
  }
  mountSources.set(parent, entries);
}

function instrumentRouteInstance(route) {
  if (!route || typeof route !== 'object' || instrumentedRouteInstances.has(route)) return route;
  instrumentedRouteInstances.add(route);
  const methods = new Set();
  routeMethodRegistrations.set(route, methods);
  for (const method of [...HTTP_METHODS, 'all']) {
    const originalMethod = route[method];
    if (typeof originalMethod !== 'function') continue;
    route[method] = function instrumentedRouteMethod(...args) {
      methods.add(method === 'all' ? 'ALL' : method.toUpperCase());
      return originalMethod.apply(this, args);
    };
  }
  return route;
}

function instrumentRouter(router) {
  if (!router || instrumentedRouters.has(router)) return router;
  instrumentedRouters.add(router);

  const originalRoute = router.route;
  if (typeof originalRoute === 'function') {
    router.route = function instrumentedRoute(...args) {
      const registeredAt = sourceFrame();
      const route = instrumentRouteInstance(originalRoute.apply(this, args));
      if (route && typeof route === 'object') routeSources.set(route, registeredAt);
      return route;
    };
  }

  const originalUse = router.use;
  if (typeof originalUse === 'function') {
    router.use = function instrumentedUse(...args) {
      recordMount(this, args, sourceFrame());
      return originalUse.apply(this, args);
    };
  }
  return router;
}

const originalRouterFactory = express.Router;
function instrumentedRouterFactory(...args) {
  return instrumentRouter(originalRouterFactory.apply(this, args));
}
Object.setPrototypeOf(instrumentedRouterFactory, originalRouterFactory);
for (const key of Reflect.ownKeys(originalRouterFactory)) {
  if (key === 'length' || key === 'name' || key === 'prototype') continue;
  if (Object.prototype.hasOwnProperty.call(instrumentedRouterFactory, key)) continue;
  try {
    Object.defineProperty(instrumentedRouterFactory, key, Object.getOwnPropertyDescriptor(originalRouterFactory, key));
  } catch {}
}
express.Router = instrumentedRouterFactory;

const application = express.application;
const originalAppRoute = application.route;
application.route = function instrumentedAppRoute(...args) {
  const registeredAt = sourceFrame();
  const route = instrumentRouteInstance(originalAppRoute.apply(this, args));
  if (route && typeof route === 'object') routeSources.set(route, registeredAt);
  return route;
};

const originalAppAll = application.all;
application.all = function instrumentedAppAll(...args) {
  const rootRouter = this.router;
  const beforeLength = rootRouter.stack.length;
  const result = originalAppAll.apply(this, args);
  for (const layer of rootRouter.stack.slice(beforeLength)) {
    if (!layer?.route) continue;
    const methods = routeMethodRegistrations.get(layer.route) || new Set();
    methods.clear();
    methods.add('ALL');
    routeMethodRegistrations.set(layer.route, methods);
  }
  return result;
};

const originalAppUse = application.use;
application.use = function instrumentedAppUse(...args) {
  const rootRouter = this.router;
  recordMount(rootRouter, args, sourceFrame());
  return originalAppUse.apply(this, args);
};

const app = backendRequire('./index.js');
const rootRouter = app.router;

function routePathValues(value) {
  if (typeof value === 'string') return [{ literal: value, raw: value }];
  if (Array.isArray(value) && value.length) {
    return value.map(item => typeof item === 'string'
      ? { literal: item, raw: item }
      : { literal: null, raw: String(item) });
  }
  return [{ literal: null, raw: String(value) }];
}

function normalizeAbsolute(value) {
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function joinRoutePath(prefix, routePath) {
  if (prefix === null || routePath === null) return null;
  const left = prefix.replace(/\/+$/, '');
  const right = routePath.startsWith('/') ? routePath : `/${routePath}`;
  if (!left) return normalizeAbsolute(routePath);
  return `${normalizeAbsolute(left)}${right}`;
}

function joinMountPrefix(prefix, mountPrefix) {
  if (prefix === null || mountPrefix === null) return null;
  if (mountPrefix === '' || mountPrefix === '/') return prefix || '';
  return joinRoutePath(prefix, mountPrefix);
}

const routeRegistrations = [];
const unresolvedRoutes = [];
const unresolvedMounts = [];
const activeRouterTrail = new Set();

function visitRouter(router, prefix, mountTrail) {
  if (!router || !Array.isArray(router.stack)) return;
  if (activeRouterTrail.has(router)) {
    unresolvedMounts.push({
      path: prefix,
      reason: 'router mount cycle',
      source: mountTrail[mountTrail.length - 1]?.source || 'source-unavailable',
    });
    return;
  }
  // Repeated mount paths are intentionally visited repeatedly so that mounting
  // the same router twice at the same literal prefix appears as a duplicate.
  activeRouterTrail.add(router);
  for (const layer of router.stack) {
    if (layer?.route) {
      const route = layer.route;
      const registeredMethods = routeMethodRegistrations.get(route);
      const methods = registeredMethods?.size
        ? [...registeredMethods]
        : Object.keys(route.methods || {}).filter(method => route.methods[method]).map(method => method.toUpperCase());
      const routePaths = routePathValues(route.path);
      for (const method of methods) {
        for (const routePath of routePaths) {
          const fullPath = joinRoutePath(prefix, routePath.literal);
          const entry = {
            method: method.toUpperCase(),
            path: fullPath,
            routePath: routePath.raw,
            source: routeSources.get(route) || 'source-unavailable',
            mountTrail: mountTrail.map(item => ({ path: item.raw, source: item.source })),
          };
          if (fullPath === null) unresolvedRoutes.push({ ...entry, reason: 'non-literal route or mount path' });
          else routeRegistrations.push(entry);
        }
      }
      if (!methods.length || !routePaths.length) {
        unresolvedRoutes.push({
          method: 'UNKNOWN',
          path: null,
          routePath: String(route.path),
          source: routeSources.get(route) || 'source-unavailable',
          reason: 'route method or path could not be expanded',
        });
      }
      continue;
    }

    if (isRouter(layer?.handle)) {
      const knownMounts = (mountSources.get(router) || []).filter(item => item.child === layer.handle);
      if (!knownMounts.length) {
        unresolvedMounts.push({
          path: prefix,
          reason: 'reachable child router mount was not observed by instrumentation',
          source: 'source-unavailable',
        });
      }
    }
  }

  for (const mount of mountSources.get(router) || []) {
    const expandedPrefix = mount.literal === null
      ? null
      : joinMountPrefix(prefix, mount.literal);
    if (mount.literal === null) {
      unresolvedMounts.push({ path: mount.raw, reason: 'non-literal mount prefix', source: mount.source });
    }
    visitRouter(
      mount.child,
      expandedPrefix,
      [...mountTrail, { raw: mount.raw, source: mount.source }],
    );
  }
  activeRouterTrail.delete(router);
}

visitRouter(rootRouter, '', []);

const groups = new Map();
for (const registration of routeRegistrations) {
  const key = `${registration.method} ${registration.path}`;
  const group = groups.get(key) || [];
  group.push(registration);
  groups.set(key, group);
}
const duplicates = [...groups.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([key, entries]) => ({ key, registrations: entries }));

const report = {
  generatedAt: new Date().toISOString(),
  branch: gitValue('branch', '--show-current'),
  baseSha: gitValue('rev-parse', 'HEAD'),
  backendEntry: path.relative(repoRoot, path.join(backendRoot, 'index.js')),
  methodAndLiteralPathRegistrations: routeRegistrations.length,
  distinctMethodAndLiteralPathKeys: groups.size,
  duplicateMethodAndLiteralPathKeys: duplicates.length,
  unresolvedRoutePatterns: unresolvedRoutes.length,
  unresolvedMountPatterns: unresolvedMounts.length,
  completeness: unresolvedRoutes.length || unresolvedMounts.length ? 'PARTIAL' : 'COMPLETE_FOR_LITERAL_EXPRESS_ROUTES',
  duplicates,
  unresolvedRoutes,
  unresolvedMounts,
  registrations: routeRegistrations,
};

const output = process.env.ROUTE_DUPLICATE_REPORT_JSON;
if (output) {
  const outputPath = path.isAbsolute(output) ? path.resolve(output) : path.resolve(repoRoot, output);
  const relativeOutput = path.relative(developerImplementedRoot, outputPath);
  if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new Error(`Refusing to write route evidence outside ${path.relative(repoRoot, developerImplementedRoot)}: ${outputPath}`);
  }
  require('node:fs').mkdirSync(path.dirname(outputPath), { recursive: true });
  require('node:fs').writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`Backend exact method+literal-path inventory`);
console.log(`Entry point: ${report.backendEntry}`);
console.log(`Registrations: ${report.methodAndLiteralPathRegistrations}`);
console.log(`Distinct keys: ${report.distinctMethodAndLiteralPathKeys}`);
console.log(`Duplicate keys: ${report.duplicateMethodAndLiteralPathKeys}`);
console.log(`Unresolved route patterns: ${report.unresolvedRoutePatterns}`);
console.log(`Unresolved mount patterns: ${report.unresolvedMountPatterns}`);
console.log(`Completeness: ${report.completeness}`);
if (output) console.log(`JSON report: ${path.relative(repoRoot, path.resolve(output))}`);
for (const duplicate of duplicates) {
  console.log(`\nDUPLICATE ${duplicate.key}`);
  for (const registration of duplicate.registrations) {
    console.log(`  route: ${registration.source}; mount trail: ${registration.mountTrail.map(item => `${item.path} (${item.source})`).join(' -> ') || '<root>'}`);
  }
}
for (const unresolved of [...unresolvedRoutes, ...unresolvedMounts]) {
  console.log(`\nUNRESOLVED ${unresolved.method || 'MOUNT'} ${unresolved.path ?? unresolved.routePath ?? ''}: ${unresolved.reason} (${unresolved.source})`);
}
if (duplicates.length || unresolvedRoutes.length || unresolvedMounts.length) process.exitCode = 1;
