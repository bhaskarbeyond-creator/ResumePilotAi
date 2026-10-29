'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');
const { platformRouter } = require('../routes/platform');
const { enterpriseRouter } = require('../routes/enterprise');
const { enterpriseM2mRouter } = require('../routes/enterpriseM2m');

const PLATFORM_ROUTE_PAIRS = [
  ['GET', '/configuration'],
  ['GET', '/payment-settings'],
  ['GET', '/payment-webhooks'],
  ['POST', '/payment-webhooks/:eventId/replay'],
];

function routeRegistrations(router) {
  const registrations = new Map();
  for (const layer of router.stack || []) {
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    const methods = Object.entries(layer.route.methods || {})
      .filter(([, enabled]) => enabled)
      .map(([method]) => method.toUpperCase());
    for (const path of paths) {
      for (const method of methods) {
        const key = `${method} ${path}`;
        registrations.set(key, (registrations.get(key) || 0) + 1);
      }
    }
  }
  return registrations;
}

test('DISC-055: each platform configuration/payment route has one router registration', () => {
  const registrations = routeRegistrations(platformRouter);
  const duplicates = [...registrations].filter(([, count]) => count > 1);
  assert.deepEqual(duplicates, [], 'platform router must not register duplicate method/path pairs');

  for (const [method, path] of PLATFORM_ROUTE_PAIRS) {
    assert.equal(registrations.get(`${method} ${path}`), 1, `${method} ${path} must be registered exactly once`);
  }
});

test('control-plane routers are mounted once and platform audit middleware runs first', () => {
  const stack = app.router?.stack || app._router?.stack;
  assert.ok(Array.isArray(stack), 'Express application router stack must be inspectable');

  for (const [name, router] of [
    ['platform', platformRouter],
    ['enterprise', enterpriseRouter],
    ['enterprise M2M', enterpriseM2mRouter],
  ]) {
    const mounts = stack.reduce((count, layer) => count + Number(layer.handle === router), 0);
    assert.equal(mounts, 1, `${name} router must be mounted exactly once`);
  }

  const auditIndex = stack.findIndex(layer => layer.handle?.name === 'adminAuditMiddleware');
  const platformIndex = stack.findIndex(layer => layer.handle === platformRouter);
  assert.ok(auditIndex >= 0, 'administrative audit middleware must be registered');
  assert.ok(auditIndex < platformIndex, 'audit middleware must precede platform routes');
});
