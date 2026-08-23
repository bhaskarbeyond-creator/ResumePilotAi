'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * REGRESSION COVERAGE — Platform Health honesty.
 *
 * Defect: `super-admin-platform` reported OPERATIONAL whenever Firestore and
 * Firebase Auth answered their probes, regardless of whether an operator could
 * actually satisfy the enforced second-factor requirement. With the Firebase
 * TOTP provider disabled, every destructive Super Admin operation is denied and
 * no in-product action can unblock it — reporting that as healthy is precisely
 * the "code says supported / capability unavailable" pattern under audit.
 *
 * Invariants asserted:
 *   UNKNOWN != HEALTHY, NOT_CONFIGURED != HEALTHY, UNAVAILABLE != HEALTHY.
 */

const { getHealthSnapshot, resetHealthCache, STATE } = require('../services/platformHealth');

function superAdminService(snapshot) {
  return snapshot.services.find(item => item.id === 'super-admin-platform');
}

async function snapshotWith(env) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetHealthCache();
  try {
    return await getHealthSnapshot({ force: true });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetHealthCache();
  }
}

test('an enforced-but-disabled TOTP provider is never reported as healthy', async () => {
  const snapshot = await snapshotWith({ SUPER_ADMIN_MFA_REQUIRED: 'true', FIREBASE_TOTP_MFA_ENABLED: 'false' });
  const service = superAdminService(snapshot);
  assert.ok(service, 'the Super Admin control plane must appear in the health snapshot');
  assert.notEqual(service.state, STATE.OPERATIONAL, 'a structurally unsatisfiable MFA requirement is not operational');
  assert.equal(service.state, STATE.UNAVAILABLE);
  assert.equal(service.metrics.totpProviderCapability, 'DISABLED');
  // The reason must say WHAT, WHY, IMPACT and the RECOMMENDED ACTION.
  assert.match(service.reason, /auth\/operation-not-allowed/);
  assert.match(service.reason, /blocked/i);
  assert.match(service.reason, /Firebase project owner/i);
});

test('an enforced-but-undeclared TOTP provider is reported UNKNOWN, not healthy', async () => {
  const snapshot = await snapshotWith({ SUPER_ADMIN_MFA_REQUIRED: 'true', FIREBASE_TOTP_MFA_ENABLED: undefined });
  const service = superAdminService(snapshot);
  assert.notEqual(service.state, STATE.OPERATIONAL, 'unknown must never be rounded up to healthy');
  // In an environment where the live dependency probes also fail, the more
  // severe state wins — but the MFA finding must still be reported, not hidden.
  assert.ok([STATE.UNKNOWN, STATE.UNAVAILABLE, STATE.DEGRADED].includes(service.state), service.state);
  assert.equal(service.metrics.totpProviderCapability, 'UNKNOWN');
  assert.match(service.reason, /undeclared|cannot be determined/i);
  assert.match(service.reason, /Firebase console/i);
});

test('an enforced and enabled TOTP provider can report operational', async () => {
  const snapshot = await snapshotWith({ SUPER_ADMIN_MFA_REQUIRED: 'true', FIREBASE_TOTP_MFA_ENABLED: 'true' });
  const service = superAdminService(snapshot);
  assert.equal(service.metrics.totpProviderCapability, 'ENABLED');
  assert.equal(service.metrics.mfaEnforced, true);
  // State still depends on the live dependency probes; it must simply no longer
  // be blocked by the capability declaration.
  assert.ok([STATE.OPERATIONAL, STATE.DEGRADED, STATE.UNAVAILABLE].includes(service.state));
  if (service.state === STATE.OPERATIONAL) assert.match(service.reason, /require a second factor/);
});

test('when MFA is not enforced the provider declaration does not degrade the service', async () => {
  const snapshot = await snapshotWith({ SUPER_ADMIN_MFA_REQUIRED: 'false', FIREBASE_TOTP_MFA_ENABLED: undefined });
  const service = superAdminService(snapshot);
  assert.equal(service.metrics.mfaEnforced, false);
  assert.notEqual(service.state, STATE.UNKNOWN);
});

test('no service in the snapshot converts a non-operational condition into healthy', async () => {
  const snapshot = await snapshotWith({});
  for (const service of snapshot.services) {
    if (service.state !== STATE.OPERATIONAL) continue;
    assert.notEqual(service.configuration, 'NOT_CONFIGURED', `${service.id} claims operational while not configured`);
    assert.notEqual(service.configuration, 'UNKNOWN', `${service.id} claims operational with unknown configuration`);
    assert.ok(service.reason && service.reason.length > 0, `${service.id} must justify an operational claim`);
  }
});

test('every reported service explains what, why and what to do', async () => {
  const snapshot = await snapshotWith({});
  for (const service of snapshot.services) {
    assert.ok(service.reason, `${service.id} must carry a reason`);
    assert.ok(Array.isArray(service.affectedFeatures), `${service.id} must declare impact`);
    assert.ok(service.state, `${service.id} must declare a state`);
  }
});
