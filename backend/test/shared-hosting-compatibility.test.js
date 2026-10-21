'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const backendRoot = path.resolve(__dirname, '..');

test('Shared Hosting: .htaccess rewrite rules route /api and /v1 to api/index.php', () => {
  const rootHtaccess = fs.readFileSync(path.join(root, '.htaccess'), 'utf8');
  const publicHtaccess = fs.readFileSync(path.join(root, 'public/.htaccess'), 'utf8');

  // Both must route /api/* and /v1/* to api/index.php
  assert.match(rootHtaccess, /RewriteCond\s+%{REQUEST_URI}\s+\^\/\(api\|v1\)/i);
  assert.match(rootHtaccess, /RewriteRule\s+\^\(api\|v1\)\(\.\*\)\$\s+api\/index\.php/i);

  assert.match(publicHtaccess, /RewriteCond\s+%{REQUEST_URI}\s+\^\/\(api\|v1\)/i);
  assert.match(publicHtaccess, /RewriteRule\s+\^\(api\|v1\)\(\.\*\)\$\s+api\/index\.php/i);

  // Must not use [P] flag in user-level .htaccess which breaks on restricted shared hosting
  assert.doesNotMatch(publicHtaccess, /RewriteRule[^\n]+\[P/i);
});

test('Shared Hosting: api/index.php includes dynamic port, socket, and SSE streaming bypass', () => {
  const proxyCode = fs.readFileSync(path.join(root, 'api/index.php'), 'utf8');

  assert.match(proxyCode, /BACKEND_PORT/);
  assert.match(proxyCode, /PASSENGER_SOCKET/);
  assert.match(proxyCode, /X-Accel-Buffering/);
  assert.match(proxyCode, /CURLOPT_WRITEFUNCTION/);
  assert.match(proxyCode, /CURLOPT_HEADERFUNCTION/);
  assert.match(proxyCode, /text\/event-stream/);
});

test('Shared Hosting: backend deployment scripts package backend/freellmapi', () => {
  const deployDirect = fs.readFileSync(path.join(root, 'scripts/deploy-production-direct.mjs'), 'utf8');
  const deployLive = fs.readFileSync(path.join(root, 'scripts/deploy-backend-live.cjs'), 'utf8');

  assert.match(deployDirect, /'freellmapi'/);
  assert.match(deployLive, /'freellmapi'/);
});

test('Shared Hosting: backend index.js supports Passenger Unix domain socket and TCP numeric port', () => {
  const indexJs = fs.readFileSync(path.join(backendRoot, 'index.js'), 'utf8');

  assert.match(indexJs, /const isSocket = typeof port === 'string' && Number\.isNaN\(Number\(port\)\);/);
  assert.match(indexJs, /httpServer\.listen\(port,/);
  assert.match(indexJs, /httpServer\.listen\(Number\(port\),\s*'0\.0\.0\.0',/);
});

test('Shared Hosting: backend dependencies are 100% pure JS or prebuilt binaries', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8'));

  // Disallowed native-compilation packages that fail on shared hosting npm ci --ignore-scripts
  const disallowed = ['node-gyp', 'better-sqlite3', 'canvas', 'bcrypt'];
  const deps = Object.keys(pkg.dependencies || {});

  for (const item of disallowed) {
    assert.strictEqual(deps.includes(item), false, `Dependency ${item} requires C++ compiler which breaks on shared hosting`);
  }
});
