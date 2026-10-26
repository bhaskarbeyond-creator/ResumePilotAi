'use strict';

/**
 * The registry's own guards, exercised (OI-COV-1, continued).
 *
 * `config-registry.test.js` proves the 35 shipped entries are well formed. This file proves
 * the *validators and the integrity check itself* behave when handed bad input — the part of
 * the registry that only runs during a review or a deliberate mistake.
 *
 * Why it matters beyond coverage: `assertRegistryIntegrity` is the mechanism that stops a
 * read-only key shipping without a justification, an editable key shipping deployment-scoped,
 * or a default that its own validator rejects. Those rules are only real if they fire, and
 * they only fire if something feeds them a bad entry. Nothing in production ever will, so the
 * test is the only place they are executed.
 *
 * Run: NODE_ENV=test node --test test/config-registry-guards.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../config/registry');

const { ENTRIES, SCOPE, AUDIT, RESOLUTION, findEntry, describeEntry, validators } = registry;

/* ── validators ────────────────────────────────────────────────────────── */

test('validators: an empty string is not zero', () => {
  const integer = validators.intInRange(1, 10);
  for (const value of ['', '   ', null, undefined]) {
    assert.throws(() => integer(value), /whole number/, `${JSON.stringify(value)} must be refused`);
  }
  assert.equal(integer('5'), 5);
  assert.equal(integer(5), 5);
  assert.throws(() => integer('5.5'), /whole number/);
  assert.throws(() => integer(11), /between 1 and 10/);
});

test('validators: a decimal clears to nothing rather than to zero', () => {
  const decimal = validators.decimalInRange(0, 100, 2);
  for (const value of ['', '   ', null, undefined]) {
    assert.throws(() => decimal(value), /must be a number/, `${JSON.stringify(value)} must be refused`);
  }
  assert.equal(decimal('18.256'), 18.26, 'the value is rounded to the declared places');
  assert.equal(decimal(0), 0, 'a genuine zero is still a valid value');
  assert.throws(() => decimal('101'), /between 0 and 100/);
});

test('validators: a boolean accepts the spellings a form sends and refuses the rest', () => {
  const boolean = validators.booleanValue();
  for (const value of [true, 'true', '1', 'yes', 'on']) assert.equal(boolean(value), true, String(value));
  for (const value of [false, 'false', '0', 'no', 'off']) assert.equal(boolean(value), false, String(value));
  assert.throws(() => boolean('maybe'), /must be true or false/);
  assert.throws(() => boolean(''), /must be true or false/);
});

test('plan quota table validator: refuses each malformed shape with the offending entry named', () => {
  const entry = findEntry('ai.quota.plans');
  assert.ok(entry);
  assert.throws(() => entry.validate(''), /at least one plan/);
  assert.throws(() => entry.validate('BC'), /must look like Plan=dailyRequests\/maxTokens/);
  assert.throws(() => entry.validate('Basic=0\/2048'), /daily requests must be 1–100000/);
  assert.throws(() => entry.validate('Basic=10\/10'), /maxTokens must be 256–32768/);
  assert.equal(entry.validate(' Basic=10\/2048 , Premium=100\/4096 '), 'Basic=10/2048,Premium=100/4096');
});

test('path-list validator: an entry must start with a slash and stay short', () => {
  const entry = findEntry('security.audit.sensitiveReads');
  assert.ok(entry);
  assert.throws(() => entry.validate(['audit-logs']), /must start with/);
  assert.throws(() => entry.validate([`/${'x'.repeat(201)}`]), /may not exceed 200/);
  assert.throws(() => entry.validate('not-a-list'), /must be a list/);
});

test('provider order validator: names the position of a bad entry, which is what an operator needs', () => {
  const entry = findEntry('ai.providers.fallbackOrder');
  assert.ok(entry);
  assert.throws(() => entry.validate(['nvidia', 'BAD NAME']), /entry 2 is not a provider name/);
  assert.deepEqual(entry.validate(['NVIDIA ']), ['nvidia']);
});

/* ── integrity ─────────────────────────────────────────────────────────── */

/** A minimal valid entry the negative controls mutate. */
function validEntry(overrides = {}) {
  return {
    id: 'CFG-900',
    key: 'test.guard.key',
    label: 'Guard probe',
    description: 'used only by the integrity tests',
    scope: SCOPE.PLATFORM,
    type: 'number',
    defaultValue: 1,
    validate: value => Number(value),
    resolution: RESOLUTION.DATABASE,
    editable: true,
    restartRequired: false,
    audit: AUDIT.STANDARD,
    ...overrides,
  };
}

test('validators: text, currency and string arrays enforce their declared shape', () => {
  assert.equal(validators.currencyCode()('inr'), 'INR');
  assert.throws(() => validators.currencyCode()('rupee'), /three-letter/);
  assert.throws(() => validators.text(5)('too long'), /at most 5/);
  assert.throws(() => validators.text(10, /^[a-z]+$/, 'lowercase only')('ABC'), /lowercase only/);
  assert.equal(validators.text(10, /^[a-z]+$/, 'lowercase only')(''), '', 'an empty value skips the pattern');
  assert.throws(() => validators.stringArray(2)(['a', 'b', 'c']), /at most 2/);
  assert.deepEqual(validators.stringArray(2)(['a']), ['a']);
});

test('integrity: a well-formed entry passes and the shipped registry is therefore self-consistent', () => {
  assert.doesNotThrow(() => registry.assertRegistryIntegrity([validEntry()]));
  // The real registry already ran this check at require time; asserting it again makes the
  // relationship explicit rather than incidental.
  assert.doesNotThrow(() => registry.assertRegistryIntegrity(ENTRIES));
});

test('integrity: every rule in the check rejects the entry it exists to catch', () => {
  const cases = [
    [{ id: 'bad-id' }, /invalid id/],
    [{ key: 'Bad.Key' }, /invalid key/],
    [{ scope: 'nowhere' }, /unknown scope/],
    [{ validate: 'not-a-function' }, /has no validator/],
    [{ editable: false, readOnlyReason: undefined }, /read-only without a reason/],
    [{ scope: SCOPE.DEPLOYMENT, editable: true }, /editable but deployment-scoped/],
    [{ resolution: RESOLUTION.ENV, envVar: undefined }, /resolves from env without envVar/],
    [{ defaultValue: 'not-a-number-validator-can-reject', validate: value => { if (value === 'not-a-number-validator-can-reject') throw new Error('nope'); return value; } }, /default is invalid/],
  ];
  for (const [overrides, expected] of cases) {
    assert.throws(() => registry.assertRegistryIntegrity([validEntry(overrides)]), expected,
      `expected ${JSON.stringify(overrides)} to be rejected`);
  }
});

test('integrity: duplicate ids and duplicate keys are both refused', () => {
  assert.throws(
    () => registry.assertRegistryIntegrity([validEntry(), validEntry({ key: 'test.guard.other' })]),
    /duplicate id/,
  );
  assert.throws(
    () => registry.assertRegistryIntegrity([validEntry(), validEntry({ id: 'CFG-901' })]),
    /duplicate key/,
  );
});

/* ── lookup and description ───────────────────────────────────────────── */

test('findEntry: resolves by key, by id (case-insensitive) and refuses an empty probe', () => {
  const byKey = findEntry('security.rateLimit.global');
  assert.ok(byKey);
  assert.equal(byKey.key, 'security.rateLimit.global');
  assert.equal(findEntry(byKey.id)?.key, byKey.key);
  assert.equal(findEntry(byKey.id.toLowerCase())?.key, byKey.key);
  assert.equal(findEntry(''), null);
  assert.equal(findEntry(undefined), null);
  assert.equal(findEntry('no.such.key'), null);
});

test('describeEntry: an unresolved entry reports its own default and origin, and no revision', () => {
  const entry = findEntry('payments.currency');
  const described = describeEntry(entry);
  assert.equal(described.value, entry.defaultValue);
  assert.equal(described.revision, null, 'no stored row yet, which is what a create must say');
  assert.equal(described.source, entry.resolution === RESOLUTION.DATABASE ? 'default' : entry.resolution);
  // A validator must never cross the wire: functions do not survive JSON and would 500 the census.
  assert.equal(described.validate, undefined);
});

test('describeEntry: a resolved entry reports the stored value, its origin and its revision', () => {
  const entry = findEntry('payments.currency');
  const described = describeEntry(entry, { value: 'USD', source: 'database', revision: 4 });
  assert.equal(described.value, 'USD');
  assert.equal(described.source, 'database');
  assert.equal(described.revision, 4);
});

test('every entry declares whether it is editable, and every read-only one says why', () => {
  const offenders = ENTRIES.filter(entry => entry.editable === false && !String(entry.readOnlyReason || '').trim());
  assert.deepEqual(offenders.map(entry => entry.key), []);
  const bootOnly = ENTRIES.filter(entry => entry.restartRequired === true);
  assert.ok(bootOnly.length >= 1, 'at least one boot-only key exists, so the read-only path is reachable');
});
