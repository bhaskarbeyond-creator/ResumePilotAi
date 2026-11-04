'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');

function createSuperAdminBearer() {
  const jwt = require('jsonwebtoken');
  const secret = process.env.ACCESS_TOKEN_SECRET || 'test-access-token-secret-for-jwt-signing-minimum-32-chars';
  return 'Bearer ' + jwt.sign(
    { uid: 'sa-audit-verifier', role: 'SUPER_ADMIN', email: 'sa@ime365.local' },
    secret,
    { expiresIn: '1h' }
  );
}

test('Route Integrity: /api/jobs/naukri returns 501 SCRAPER_NOT_CONFIGURED and is not shadowed by /:id', async () => {
  const res = await request(app)
    .post('/api/jobs/naukri')
    .set('Authorization', createSuperAdminBearer())
    .send({});
  assert.equal(res.status, 501, 'Naukri ingestion must return 501 Not Implemented');
  assert.equal(res.body.code, 'SCRAPER_NOT_CONFIGURED');
  assert.match(res.body.error, /Naukri ingestion is not configured/);
});

test('Route Integrity: /api/jobs/tracker is not shadowed by parameterized /api/jobs/:id', async () => {
  const res = await request(app)
    .get('/api/jobs/tracker')
    .set('Authorization', createSuperAdminBearer());
  // Should hit requireCandidate / tracker handler (status 200, 401, or 403), never 404/503 from job lookup
  assert.notEqual(res.status, 404, '/tracker must not be treated as a missing job :id');
  assert.ok([200, 401, 403].includes(res.status), `Expected candidate/tracker status, got ${res.status}`);
});

test('Route Integrity: /api/jobs-data/applications/list is not shadowed by /applications/:id', async () => {
  const res = await request(app)
    .get('/api/jobs-data/applications/list')
    .set('Authorization', createSuperAdminBearer());
  assert.notEqual(res.status, 404, '/applications/list must not be captured as an application ID "list"');
});

test('Route Integrity: Static endpoints precede conflicting parameterized routes in all route stacks', () => {
  // Inspect Express route stack in app.router.stack (Express 5) or app._router.stack
  const routerStack = (app.router || app._router)?.stack || [];
  assert.ok(routerStack.length > 0, 'Express application must have an initialized route stack');

  // Verify that for all mounted routers, no route path after a parameterized route shadows a static path
  for (const layer of routerStack) {
    if (layer.name === 'router' && layer.handle?.stack) {
      const subStack = layer.handle.stack;
      let seenParameterized = false;
      const staticAfterParam = [];

      for (const subLayer of subStack) {
        if (!subLayer.route) continue;
        const path = subLayer.route.path;
        const isParam = typeof path === 'string' && path.includes(':');

        if (isParam && path === '/:id') {
          seenParameterized = true;
        } else if (seenParameterized && typeof path === 'string' && !path.includes(':') && path.startsWith('/') && path !== '/') {
          // If a static route like '/naukri' was registered AFTER '/:id' for the same HTTP method, it would be shadowed
          const methods = Object.keys(subLayer.route.methods);
          staticAfterParam.push({ path, methods });
        }
      }

      // Assert zero shadowed static routes
      assert.deepEqual(
        staticAfterParam,
        [],
        `Found static routes registered after /:id in router: ${JSON.stringify(staticAfterParam)}`
      );
    }
  }
});
