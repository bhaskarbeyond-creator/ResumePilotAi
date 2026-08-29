'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { maybeQueueReadyzAlert, resetReadyzAlertStateForTests } = require('../services/readyzAlerts');

describe('readyz consecutive-failure admin alerts', () => {
  beforeEach(() => {
    resetReadyzAlertStateForTests();
  });

  it('does not enqueue on the first failure', () => {
    const queued = [];
    const result = maybeQueueReadyzAlert({
      healthy: false,
      pool: {},
      env: { ADMIN_EMAIL: 'ops@example.com' },
      queue: async (...args) => queued.push(args),
    });
    assert.equal(result.queued, false);
    assert.equal(result.consecutiveFailures, 1);
    assert.equal(queued.length, 0);
  });

  it('enqueues an hourly-deduped admin_system_alert after two consecutive failures', () => {
    const queued = [];
    maybeQueueReadyzAlert({
      healthy: false,
      pool: { marker: true },
      now: 3_600_000 * 42,
      env: { ADMIN_EMAIL: 'ops@example.com' },
      queue: async (...args) => queued.push(args),
    });
    const result = maybeQueueReadyzAlert({
      healthy: false,
      pool: { marker: true },
      now: 3_600_000 * 42,
      env: { ADMIN_EMAIL: 'ops@example.com' },
      queue: async (...args) => queued.push(args),
    });
    assert.equal(result.queued, true);
    assert.equal(queued.length, 1);
    assert.equal(queued[0][0].marker, true);
    assert.equal(queued[0][1].eventId, 'admin_system_alert:readyz:42');
    assert.equal(queued[0][1].templateType, 'admin_system_alert');
    assert.equal(queued[0][1].recipient, 'ops@example.com');
    assert.equal(queued[0][1].vars.alert_title.includes('Readiness'), true);
  });

  it('skips invalid ADMIN_EMAIL and never throws into the readiness handler', () => {
    const queued = [];
    maybeQueueReadyzAlert({ healthy: false, pool: {}, env: { ADMIN_EMAIL: 'not-an-email' }, queue: async (...args) => queued.push(args) });
    const result = maybeQueueReadyzAlert({
      healthy: false,
      pool: {},
      env: { ADMIN_EMAIL: 'not-an-email' },
      queue: async (...args) => queued.push(args),
    });
    assert.equal(result.queued, false);
    assert.equal(result.skipped, 'ADMIN_EMAIL');
    assert.equal(queued.length, 0);
  });

  it('resets the consecutive counter after a healthy probe', () => {
    maybeQueueReadyzAlert({ healthy: false, pool: {}, env: { ADMIN_EMAIL: 'ops@example.com' }, queue: async () => {} });
    const healthy = maybeQueueReadyzAlert({ healthy: true, pool: {}, env: { ADMIN_EMAIL: 'ops@example.com' }, queue: async () => {} });
    assert.equal(healthy.consecutiveFailures, 0);
    const next = maybeQueueReadyzAlert({ healthy: false, pool: {}, env: { ADMIN_EMAIL: 'ops@example.com' }, queue: async () => {} });
    assert.equal(next.queued, false);
    assert.equal(next.consecutiveFailures, 1);
  });
});
