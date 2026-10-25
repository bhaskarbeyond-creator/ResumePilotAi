'use strict';

/**
 * PH4-ENGINE-021 Phase A.5 — CooldownManager scoped-keying drills
 * (schema-proposal §3.5). Manager-level contract: the PLATFORM scope keeps the
 * exact legacy behaviour and key shapes byte-identically; non-platform scopes
 * isolate tenant/byok benches; a scoped caller falls through to platform rows
 * (credential-physics honesty); and clears/releases NEVER cross scopes
 * (F-14 guard). Hermetic: memory-backed persistence + fake clock, no MariaDB,
 * no network, no timers. Zero console.*, zero waitForTimeout.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CooldownManager } = require('../freellmapi/services/cooldown');
const { MetricsPersistence } = require('../freellmapi/services/persistence');

const T0 = 1_761_500_000_000;

function makeClock(start = T0) {
  const state = { now: start };
  return { now: () => state.now, advance(ms) { state.now += ms; }, state };
}

function makeManager({ withPersistence = true } = {}) {
  const clock = makeClock();
  const persistence = withPersistence
    ? new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } })
    : null;
  const manager = new CooldownManager({ persistence, now: clock.now });
  if (persistence) manager.attachPersistence(persistence);
  return { manager, persistence, clock };
}

test('E1: platform behaviour and key shapes are byte-identical to the legacy contract', () => {
  const { manager, clock } = makeManager({ withPersistence: false });
  manager.setCooldown('groq', 'm1', 'HTTP 429 across all pooled keys');
  const specific = manager.isOnCooldown('groq', 'm1');
  assert.equal(specific.onCooldown, true);
  assert.equal(specific.remainingMs, 60_000);
  assert.equal(specific.reason, 'HTTP 429 across all pooled keys');
  assert.equal(manager.isOnCooldown('groq', 'other-model').onCooldown, false);
  manager.setCooldown('openrouter', '', 'Provider unavailable');
  assert.equal(manager.isOnCooldown('openrouter', 'anything').onCooldown, true, 'provider-wide bench legacy semantics');
  const status = manager.getStatus();
  const keys = status.map(entry => entry.key).sort();
  assert.deepEqual(keys, ['groq:m1', 'openrouter'], 'platform entries keep the legacy key shape — no scope prefix');
  // strike escalation (legacy):
  clock.advance(1000);
  const second = manager.setCooldown('groq', 'm1', 'HTTP 429 across all pooled keys');
  assert.equal(second.strikeCount, 2);
  assert.equal(second.durationMs, 120_000);
  // F-12 retry-after floor (legacy positional 4th arg):
  const third = manager.setCooldown('groq', 'm1', 'HTTP 429 across all pooled keys', 240_000);
  assert.equal(third.durationMs, 240_000);
  const clamped = manager.setCooldown('groq', 'm1', 'HTTP 429 across all pooled keys', 999_999_999);
  assert.equal(clamped.durationMs, 300_000, 'MAX_COOLDOWN_MS clamp preserved');
});

test('E2: scope isolation — a tenant bench is invisible to the platform, a platform bench applies to everyone', () => {
  const { manager } = makeManager({ withPersistence: false });
  manager.setCooldown('groq', 'm1', 'tenant byok 429', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  assert.equal(manager.isOnCooldown('groq', 'm1').onCooldown, false, 'the platform never sees a tenant bench');
  assert.equal(manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t2' }).onCooldown, false, 'nor does another tenant');
  const own = manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t1' });
  assert.equal(own.onCooldown, true);
  assert.equal(own.scopeKey, 'tenant:t1');
  assert.equal(own.credentialKind, 'byok');
  // Physics honesty: a PLATFORM-credential bench is visible to scoped callers.
  manager.setCooldown('openrouter', 'm2', 'HTTP 429 across all pooled keys');
  const scopedView = manager.isOnCooldown('openrouter', 'm2', { scopeKey: 'tenant:t1' });
  assert.equal(scopedView.onCooldown, true, 'a shared-credential bench is a fact about the provider for everyone');
  assert.equal(scopedView.scopeKey, 'platform');
  // Order: the scoped row wins over the platform row for the same destination.
  manager.setCooldown('openrouter', 'm2', 'tenant-penalty', null, { scopeKey: 'tenant:t1', credentialKind: 'tenant-penalty' });
  const scopedFirst = manager.isOnCooldown('openrouter', 'm2', { scopeKey: 'tenant:t1' });
  assert.equal(scopedFirst.reason, 'tenant-penalty', 'scoped rows are probed before platform rows');
});

test('E3: F-14 scope guard — clears and releases never cross scopes', () => {
  const { manager } = makeManager({ withPersistence: false });
  manager.setCooldown('groq', 'm1', 'platform bench');
  manager.setCooldown('groq', 'm1', 'tenant bench', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  manager.clearCooldown('groq', 'm1', { scopeKey: 'tenant:t1' });
  // The tenant row is gone; the scoped caller still sees the PLATFORM row via
  // the physics fall-through — the reason proves WHICH row survived.
  const afterTenantClear = manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t1' });
  assert.equal(afterTenantClear.reason, 'platform bench', "a tenant's release lifted only the tenant bench");
  assert.equal(manager.isOnCooldown('groq', 'm1').onCooldown, true, "a tenant's release never lifts the platform bench");
  manager.clearCooldown('groq', 'm1');
  assert.equal(manager.isOnCooldown('groq', 'm1').onCooldown, false);
  assert.equal(manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t1' }).onCooldown, false);
  // and the reverse direction:
  manager.setCooldown('groq', 'm1', 'tenant bench again', null, { scopeKey: 'tenant:t2', credentialKind: 'byok' });
  manager.clearCooldown('groq', 'm1'); // platform clear
  const survivor = manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t2' });
  assert.equal(survivor.onCooldown, true, 'a platform clear never lifts a tenant bench');
  assert.equal(survivor.reason, 'tenant bench again');
});

test('E4: hydration preserves every scope across a restart (memory-backed durable store)', () => {
  const persistence = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
  const clockA = makeClock();
  const first = new CooldownManager({ persistence, now: clockA.now });
  first.setCooldown('groq', 'm1', 'platform bench');
  first.setCooldown('groq', 'm2', 'tenant bench', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  first.setCooldown('openrouter', '', 'tenant penalty', null, { scopeKey: 'tenant:t2', credentialKind: 'tenant-penalty' });
  // Simulated restart: a fresh manager hydrates from the same store.
  const second = new CooldownManager({ persistence, now: clockA.now });
  const { hydrated } = second.attachPersistence(persistence);
  assert.equal(hydrated, 3, 'every scope hydrates');
  assert.equal(second.isOnCooldown('groq', 'm1').onCooldown, true);
  assert.equal(second.isOnCooldown('groq', 'm2').onCooldown, false, 'the tenant bench did not leak into the platform scope');
  assert.equal(second.isOnCooldown('groq', 'm2', { scopeKey: 'tenant:t1' }).onCooldown, true);
  assert.equal(second.isOnCooldown('openrouter', 'anything', { scopeKey: 'tenant:t2' }).reason, 'tenant penalty');
});

test('E5: strike escalation is per scoped key — tenant strikes never inherit platform history', () => {
  const { manager, clock } = makeManager({ withPersistence: false });
  manager.setCooldown('groq', 'm1', 'platform bench');
  clock.advance(1000);
  manager.setCooldown('groq', 'm1', 'platform bench'); // strike 2 -> 120s
  const tenantFirst = manager.setCooldown('groq', 'm1', 'tenant bench', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  assert.equal(tenantFirst.strikeCount, 1, 'the tenant scope starts its own strike history');
  assert.equal(tenantFirst.durationMs, 60_000);
  clock.advance(1000);
  const tenantSecond = manager.setCooldown('groq', 'm1', 'tenant bench', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  assert.equal(tenantSecond.strikeCount, 2);
  assert.equal(tenantSecond.durationMs, 120_000);
});

test('E6: lazy expiry cleanup deletes in the ENTRY scope and persists the scoped clear', () => {
  const { manager, persistence, clock } = makeManager();
  manager.setCooldown('groq', 'm1', 'platform bench');
  manager.setCooldown('groq', 'm1', 'tenant bench', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  clock.advance(61_000); // the tenant 60s bench expires; refresh platform row so it stays
  manager.setCooldown('groq', 'm1', 'platform bench refreshed');
  const scopedCheck = manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t1' });
  assert.equal(scopedCheck.onCooldown, true, 'the refreshed PLATFORM row still applies to the scoped caller (physics fall-through)');
  assert.equal(scopedCheck.reason, 'platform bench refreshed');
  const platformRows = persistence.loadCooldowns({ now: clock.now(), scopeKey: 'platform' });
  assert.equal(platformRows.length, 1);
  const tenantRows = persistence.loadCooldowns({ now: clock.now(), scopeKey: 'tenant:t1' });
  assert.equal(tenantRows.length, 0, 'the expired tenant row was lazily cleaned from the durable store too');
});

test('E7: resetAll is scope-honest — platform reset keeps tenant benches, null reset clears everything', () => {
  const { manager, persistence, clock } = makeManager();
  manager.setCooldown('groq', 'm1', 'platform bench');
  manager.setCooldown('groq', 'm1', 'tenant bench', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  manager.resetAll({ scopeKey: 'platform' });
  assert.equal(manager.isOnCooldown('groq', 'm1').onCooldown, false);
  const scopedSurvivor = manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t1' });
  assert.equal(scopedSurvivor.onCooldown, true, 'C.4 seam: platform reset never wipes tenant scopes');
  assert.equal(scopedSurvivor.reason, 'tenant bench');
  assert.equal(persistence.loadCooldowns({ now: clock.now(), scopeKey: 'tenant:t1' }).length, 1);
  assert.equal(persistence.loadCooldowns({ now: clock.now(), scopeKey: 'platform' }).length, 0);
  manager.resetAll();
  assert.equal(manager.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:t1' }).onCooldown, false);
  assert.equal(persistence.loadCooldowns({ now: clock.now() }).length, 0, 'null scope keeps the legacy full-wipe behaviour');
});

test('E8: getStatus carries the scope fields additively; hasAvailableProvider accepts a scope', () => {
  const { manager } = makeManager({ withPersistence: false });
  manager.setCooldown('groq', 'm1', 'tenant bench', null, { scopeKey: 'tenant:t1', credentialKind: 'byok' });
  const status = manager.getStatus();
  assert.equal(status.length, 1);
  assert.equal(status[0].scopeKey, 'tenant:t1');
  assert.equal(status[0].credentialKind, 'byok');
  assert.equal(status[0].key, 'tenant:t1\u0000groq:m1', 'scoped keys are separator-prefixed');
  // hasAvailableProvider probes the PROVIDER-WIDE keys (legacy semantics):
  // a model-specific bench does not bench the provider — in any scope.
  assert.equal(manager.hasAvailableProvider(['groq']), true);
  assert.equal(manager.hasAvailableProvider(['groq'], { scopeKey: 'tenant:t1' }), true, 'model-specific tenant bench does not bench the provider (legacy semantics preserved)');
  manager.setCooldown('groq', '', 'tenant provider bench', null, { scopeKey: 'tenant:t1', credentialKind: 'tenant-penalty' });
  assert.equal(manager.hasAvailableProvider(['groq'], { scopeKey: 'tenant:t1' }), false, 'a provider-wide tenant penalty benches the provider for that tenant only');
  assert.equal(manager.hasAvailableProvider(['groq']), true, 'the platform view is untouched by the tenant penalty');
});
