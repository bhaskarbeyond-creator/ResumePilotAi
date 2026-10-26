'use strict';

const { TENANT_LIFECYCLE_STATES } = require('./constants');

const TRANSITIONS = Object.freeze({
  PROVISIONING: new Set(['ACTIVE', 'SUSPENDED', 'DELETING']),
  ACTIVE: new Set(['SUSPENDED', 'DELETING']),
  SUSPENDED: new Set(['ACTIVE', 'DELETING']),
  DELETING: new Set(['DELETED']),
  DELETED: new Set(),
});

function normalizeLifecycleState(value) {
  const state = String(value || '').toUpperCase();
  if (!TENANT_LIFECYCLE_STATES.includes(state)) throw Object.assign(new Error('Tenant lifecycle state is invalid'), { code: 'INVALID_TENANT_LIFECYCLE', status: 400 });
  return state;
}

function assertTenantTransition(from, to) {
  const current = normalizeLifecycleState(from);
  const next = normalizeLifecycleState(to);
  if (!TRANSITIONS[current].has(next)) {
    throw Object.assign(new Error(`Tenant lifecycle transition ${current} → ${next} is not allowed`), { code: 'INVALID_TENANT_LIFECYCLE_TRANSITION', status: 409 });
  }
  return next;
}

module.exports = {
  TRANSITIONS,
  assertTenantTransition,
  normalizeLifecycleState,
};
