'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enterpriseConsoleUrl,
  isPlaceholderHost,
  publicAppUrl,
  resolvePublicAppOrigin,
  sanitizeAbsoluteHttpUrl,
} = require('../services/publicAppUrl');

test('development uses PROTOCOL + WEBSITE_NAME without a hardcoded production host', () => {
  const origin = resolvePublicAppOrigin({
    NODE_ENV: 'development',
    PROTOCOL: 'http',
    WEBSITE_NAME: 'localhost:5173',
  });
  assert.equal(origin, 'http://localhost:5173');
});

test('staging/production-like env uses https + WEBSITE_NAME', () => {
  const origin = resolvePublicAppOrigin({
    NODE_ENV: 'production',
    PROTOCOL: 'https',
    WEBSITE_NAME: 'app.resumepilot.internal-preview.com',
  });
  assert.equal(origin, 'https://app.resumepilot.internal-preview.com');
});

test('PUBLIC_APP_URL wins over WEBSITE_NAME', () => {
  const origin = resolvePublicAppOrigin({
    NODE_ENV: 'production',
    PROTOCOL: 'https',
    WEBSITE_NAME: 'ignored.example.org',
    PUBLIC_APP_URL: 'https://console.resumepilot.app',
  });
  assert.equal(origin, 'https://console.resumepilot.app');
});

test('production rejects placeholder and loopback hosts', () => {
  assert.throws(() => resolvePublicAppOrigin({
    NODE_ENV: 'production',
    PROTOCOL: 'https',
    WEBSITE_NAME: 'resumepilot.example',
  }), /real public hostname/);
  assert.throws(() => resolvePublicAppOrigin({
    NODE_ENV: 'production',
    PROTOCOL: 'https',
    WEBSITE_NAME: 'localhost',
  }), /real public hostname/);
  assert.throws(() => resolvePublicAppOrigin({
    NODE_ENV: 'production',
    PROTOCOL: 'http',
    WEBSITE_NAME: 'app.resumepilot.app',
  }), /https/);
});

test('enterprise console URLs encode tenant and tab without localhost', () => {
  const href = enterpriseConsoleUrl({
    tab: 'overview',
    tenantId: '11111111-2222-4333-8333-444444444444',
    workspaceId: '55555555-6666-4777-8777-888888888888',
  }, {
    NODE_ENV: 'production',
    PROTOCOL: 'https',
    WEBSITE_NAME: 'app.resumepilot.app',
  });
  assert.equal(href, 'https://app.resumepilot.app/enterprise?tab=overview&tenant=11111111-2222-4333-8333-444444444444&workspace=55555555-6666-4777-8777-888888888888');
  assert.doesNotMatch(href, /localhost|127\.0\.0\.1|airesume\.projectdemo\.guru|resumepilot\.example/);
});

test('publicAppUrl never invents a production domain', () => {
  const href = publicAppUrl('/dashboard', null, {
    NODE_ENV: 'development',
    PROTOCOL: 'http',
    WEBSITE_NAME: 'dev.localtest.me:5173',
  });
  assert.equal(href, 'http://dev.localtest.me:5173/dashboard');
  assert.equal(isPlaceholderHost('resumepilot.example'), true);
  assert.equal(sanitizeAbsoluteHttpUrl('javascript:alert(1)'), '');
});
