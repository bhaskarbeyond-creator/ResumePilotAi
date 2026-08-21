'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderEmailTemplate, formatCustomEmailBody } = require('../routes/email')._test;

const TENANT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function withEnv(env, fn) {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
}

test('enterprise invitation HTML uses the configured public origin, not a hardcoded host', () => {
  withEnv({
    NODE_ENV: 'production',
    PROTOCOL: 'https',
    WEBSITE_NAME: 'app.resumepilot.app',
  }, () => {
    const actionUrl = `https://app.resumepilot.app/enterprise?tab=overview&tenant=${TENANT}`;
    const { html, subject } = renderEmailTemplate('enterprise-invitation', {
      candidate_name: 'Alex Morgan',
      organization_name: 'Northwind Careers',
      inviter_name: 'Jordan Lee',
      role_title: 'Enterprise Team Member',
      action_url: actionUrl,
      site_url: 'https://app.resumepilot.app',
      expires_in: '7 days',
    });
    assert.match(subject, /Northwind Careers/);
    assert.match(html, /href="https:\/\/app\.resumepilot\.app\/enterprise\?tab=overview&amp;tenant=/);
    assert.match(html, /If the button does not work/);
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1|resumepilot\.example|undefined/);
    assert.doesNotMatch(html, /airesume\.projectdemo\.guru/);
  });
});

test('development invitation links stay on the development origin', () => {
  withEnv({
    NODE_ENV: 'development',
    PROTOCOL: 'http',
    WEBSITE_NAME: 'localhost:5173',
  }, () => {
    const actionUrl = `http://localhost:5173/enterprise?tab=overview&tenant=${TENANT}`;
    const { html } = renderEmailTemplate('enterprise-invitation', {
      action_url: actionUrl,
      site_url: 'http://localhost:5173',
      organization_name: 'Dev Org',
    });
    assert.match(html, /http:\/\/localhost:5173\/enterprise\?tab=overview/);
    assert.doesNotMatch(html, /airesume\.projectdemo\.guru/);
  });
});

test('custom invitation body turns the raw URL into a working CTA plus fallback text URL', () => {
  withEnv({
    NODE_ENV: 'production',
    PROTOCOL: 'https',
    WEBSITE_NAME: 'app.resumepilot.app',
  }, () => {
    const actionUrl = `https://app.resumepilot.app/enterprise?tab=overview&tenant=${TENANT}`;
    const html = formatCustomEmailBody(
      `Hi Alex,\n\nJordan has invited you to join **Northwind**.\n\n${actionUrl}\n\n*Note: expires in 7 days.*`,
      { action_url: actionUrl },
      'ResumePilot AI',
      'https://app.resumepilot.app',
      'support@app.resumepilot.app',
    );
    assert.match(html, /Accept Your Invitation/);
    assert.match(html, /href="https:\/\/app\.resumepilot\.app\/enterprise\?tab=overview&amp;tenant=/);
    assert.match(html, /If the button does not work/);
    assert.doesNotMatch(html, /href="#"/);
  });
});
