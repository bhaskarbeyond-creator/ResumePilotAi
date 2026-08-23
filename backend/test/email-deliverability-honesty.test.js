/**
 * Deliverability reporting must be measured, never asserted.
 *
 * The Admin console previously rendered a fixed "100% EXCELLENT DELIVERABILITY"
 * badge above four permanently-green SPF / DKIM / DMARC / MX cards. None of it
 * was measured, so the panel reported a perfect mail posture even when the
 * records were missing, weak or unresolvable. Against the real production
 * domain the claim was already wrong: DMARC is published as p=none, which is
 * monitor-only, not the "ENFORCED" the card asserted.
 *
 * These tests pin the honest behaviour of the replacement endpoint.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

const CONFIG_FILE = path.join(__dirname, '..', 'email_config.json');

/** Runs a request against the email router with a given stored SMTP config. */
async function withSenderDomain(sender, run) {
  const had = fs.existsSync(CONFIG_FILE);
  const previous = had ? fs.readFileSync(CONFIG_FILE, 'utf8') : null;

  if (sender) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ smtp: { user: sender } }));
  } else if (had) {
    fs.unlinkSync(CONFIG_FILE);
  }

  try {
    // Load the router fresh so it re-reads the config file.
    delete require.cache[require.resolve('../routes/email.js')];
    const router = require('../routes/email.js');
    const app = express();
    app.use(express.json());
    app.set('db', null);
    app.use('/api/email', router);
    return await run(app);
  } finally {
    if (previous !== null) fs.writeFileSync(CONFIG_FILE, previous);
    else if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
    delete require.cache[require.resolve('../routes/email.js')];
  }
}

const VALID_STATES = new Set(['OPERATIONAL', 'DEGRADED', 'NOT_CONFIGURED', 'UNKNOWN']);

test('an unconfigured sender reports NOT_CONFIGURED, not a healthy default', async () => {
  const body = await withSenderDomain(null, async app => {
    const response = await request(app).get('/api/email/admin/deliverability');
    assert.equal(response.status, 200);
    return response.body;
  });

  assert.equal(body.success, true);
  assert.equal(body.domain, null);
  assert.equal(body.overall, 'NOT_CONFIGURED');
  assert.deepEqual(body.records, []);
  // The critical property: absence of configuration is never OPERATIONAL.
  assert.notEqual(body.overall, 'OPERATIONAL');
});

test('every record carries a real state drawn from the health vocabulary', async () => {
  const body = await withSenderDomain('noreply@projectdemo.guru', async app => {
    const response = await request(app).get('/api/email/admin/deliverability');
    assert.equal(response.status, 200);
    return response.body;
  });

  assert.equal(body.domain, 'projectdemo.guru');
  assert.ok(Array.isArray(body.records) && body.records.length === 4);

  for (const record of body.records) {
    assert.ok(VALID_STATES.has(record.state), `${record.label} has invalid state ${record.state}`);
    assert.ok(record.detail, `${record.label} must explain its state`);
    // Anything not healthy has to tell the operator what to do about it.
    if (record.state !== 'OPERATIONAL') {
      assert.ok(record.remediation, `${record.label} is ${record.state} and must carry remediation`);
    }
  }

  assert.deepEqual(
    body.records.map(entry => entry.label).sort(),
    ['DKIM', 'DMARC', 'MX', 'SPF'],
  );
});

test('the overall verdict is the worst record, so one bad record cannot be averaged away', async () => {
  const body = await withSenderDomain('noreply@projectdemo.guru', async app => {
    const response = await request(app).get('/api/email/admin/deliverability');
    return response.body;
  });

  const ranking = ['UNKNOWN', 'NOT_CONFIGURED', 'DEGRADED', 'OPERATIONAL'];
  const worst = body.records.reduce(
    (accumulator, record) =>
      (ranking.indexOf(record.state) < ranking.indexOf(accumulator) ? record.state : accumulator),
    'OPERATIONAL',
  );

  assert.equal(body.overall, worst);

  // Specifically: the endpoint must never claim OPERATIONAL overall while any
  // individual record is not operational.
  if (body.records.some(record => record.state !== 'OPERATIONAL')) {
    assert.notEqual(body.overall, 'OPERATIONAL');
  }
});

test('a p=none DMARC policy is reported as DEGRADED, not as enforced', async () => {
  const body = await withSenderDomain('noreply@projectdemo.guru', async app => {
    const response = await request(app).get('/api/email/admin/deliverability');
    return response.body;
  });

  const dmarc = body.records.find(record => record.label === 'DMARC');
  assert.ok(dmarc);

  // Only assert the policy reading when the record actually resolved; a
  // sandbox without DNS egress legitimately returns UNKNOWN.
  if (dmarc.state !== 'UNKNOWN' && /p=\s*none/i.test(dmarc.value || '')) {
    assert.equal(dmarc.state, 'DEGRADED');
    assert.match(dmarc.detail, /monitor only/i);
  }
});

test('the fabricated deliverability claims are gone from the Admin UI', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src/components/admin/settings/EmailSmtpSettings.jsx'),
    'utf8',
  );

  // These were the hardcoded assertions. None may return as literals.
  for (const banned of [
    '100% EXCELLENT DELIVERABILITY',
    'VERIFIED ACTIVE',
    '3 KEYS ALIGNED',
    'ENFORCED (sp=none)',
    'DUAL CLUSTER',
  ]) {
    assert.ok(!source.includes(banned), `EmailSmtpSettings still hardcodes "${banned}"`);
  }

  // And the panel must actually be driven by the endpoint.
  assert.ok(source.includes('/api/email/admin/deliverability'));
});
