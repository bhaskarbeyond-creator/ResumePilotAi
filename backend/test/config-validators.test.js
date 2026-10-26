'use strict';

/**
 * Validator behaviour and the refusal paths of the configuration registry (REC-012).
 *
 * A validator is the only thing standing between a typo in the console and a value the
 * runtime cannot honour, so its *rejections* are as much a part of the contract as its
 * acceptances. This suite exercises both sides of every validator the registry uses,
 * and it does so through the entry objects rather than through the validator functions
 * directly — a validator that is correct in isolation but wired to the wrong entry would
 * still be a defect.
 *
 * Run: NODE_ENV=test node --test test/config-validators.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';

const registry = require('../config/registry');

/**
 * Assert that an entry rejects a value with a field-level message.
 * @param {import('../config/registry').RegistryEntry} entry
 * @param {unknown} value
 * @param {RegExp} [message]
 */
function rejects(entry, value, message) {
  assert.throws(
    () => entry.validate(value),
    error => {
      assert.strictEqual(error.code, 'CONFIG_INVALID', `${entry.key} must refuse with CONFIG_INVALID`);
      if (message) assert.match(error.message, message);
      return true;
    },
    `${entry.key} accepted ${JSON.stringify(value)}, which it must not`,
  );
}

test('every integer entry rejects fractions, text, out-of-range values and empty input', () => {
  for (const entry of registry.ENTRIES.filter(candidate => candidate.type === 'integer')) {
    rejects(entry, 1.5, /whole number/);
    rejects(entry, 'not a number');
    rejects(entry, '');
    rejects(entry, -1);
    rejects(entry, Number.MAX_SAFE_INTEGER);
  }
});

test('every boolean entry accepts the documented spellings and rejects anything else', () => {
  for (const entry of registry.ENTRIES.filter(candidate => candidate.type === 'boolean')) {
    for (const truthy of [true, 'true', '1', 'yes', 'on', ' TRUE ']) assert.strictEqual(entry.validate(truthy), true);
    for (const falsy of [false, 'false', '0', 'no', 'off']) assert.strictEqual(entry.validate(falsy), false);
    rejects(entry, 'maybe', /true or false/);
    rejects(entry, '');
  }
});

test('every string-array entry rejects a non-list, an oversized list and a malformed element', () => {
  for (const entry of registry.ENTRIES.filter(candidate => candidate.type === 'string[]')) {
    rejects(entry, 'not-a-list', /must be a list/);
    rejects(entry, Array.from({ length: 500 }, (_, index) => `x${index}`), /at most/);
    rejects(entry, ['valid entry', {}]);
  }
});

test('numeric entries round to their declared precision and reject non-finite input', () => {
  const entry = registry.findEntry('payments.tax.gstPercentage');
  assert.strictEqual(entry.validate('18.129'), 18.13, 'a percentage is stored to two places');
  assert.strictEqual(entry.validate(0), 0);
  rejects(entry, 100.01);
  rejects(entry, -0.5);
  rejects(entry, 'eighteen');
  rejects(entry, '');
});

test('the currency entry accepts any ISO-4217-shaped code and normalises case', () => {
  const entry = registry.findEntry('payments.currency');
  assert.strictEqual(entry.validate('usd'), 'USD');
  rejects(entry, 'US', /three-letter/);
  rejects(entry, 'DOLLARS', /three-letter/);
  rejects(entry, '');
});

test('the SMS sender entry enforces E.164 but tolerates being cleared', () => {
  const entry = registry.findEntry('communications.sms.fromNumber');
  assert.strictEqual(entry.validate('+14155550123'), '+14155550123');
  assert.strictEqual(entry.validate(''), '', 'an empty sender is how SMS is disabled, so it must be allowed');
  rejects(entry, '4155550123', /E\.164/);
  rejects(entry, '+0123456789', /E\.164/);
});

test('long free-text entries reject a value past their cap', () => {
  const entry = registry.findEntry('featureFlags.defaults');
  assert.strictEqual(entry.validate('a'.repeat(100)), 'a'.repeat(100));
  rejects(entry, 'a'.repeat(4001), /at most 4000/);
});

test('the plan quota table enforces its grammar, not just its shape', () => {
  const entry = registry.findEntry('ai.quota.plans');
  assert.strictEqual(entry.validate('Basic=10/2048,Enterprise=5000/8192'), 'Basic=10/2048,Enterprise=5000/8192');
  rejects(entry, '', /at least one plan/);
  rejects(entry, 'Basic', /must look like/);
  rejects(entry, 'Basic=0/2048', /daily requests/);
  rejects(entry, 'Basic=10/100', /maxTokens/);
  rejects(entry, Array.from({ length: 25 }, (_, index) => `P${index}=10/2048`).join(','), /at most 20/);
});

test('audited read paths must look like paths', () => {
  const entry = registry.findEntry('security.audit.sensitiveReads');
  assert.deepStrictEqual(entry.validate(['/audit-logs']), ['/audit-logs']);
  rejects(entry, ['audit-logs'], /must start with/);
  rejects(entry, [`/${'a'.repeat(201)}`], /200 characters/);
});

test('template ids and module keys are constrained to what the consumers can render', () => {
  const templates = registry.findEntry('content.templates.disabled');
  assert.deepStrictEqual(templates.validate(['classic-1', 'pro_2']), ['classic-1', 'pro_2']);
  rejects(templates, ['has space'], /alphanumeric/);
  const modules = registry.findEntry('modules.enabled');
  assert.deepStrictEqual(modules.validate(['ats', 'interview_prep']), ['ats', 'interview_prep']);
  rejects(modules, ['1-leading-digit'], /alphanumeric/);
});

test('lookup by id and by key both resolve, and an unknown reference resolves to nothing', () => {
  assert.strictEqual(registry.findEntry('CFG-012').key, 'operations.queues.sampleSize');
  assert.strictEqual(registry.findEntry('operations.queues.sampleSize').id, 'CFG-012');
  assert.strictEqual(registry.findEntry('cfg-012').key, 'operations.queues.sampleSize', 'ids are case-insensitive');
  assert.strictEqual(registry.findEntry('nope'), null);
  assert.strictEqual(registry.findEntry(''), null);
  assert.strictEqual(registry.findEntry(undefined), null);
});

test('describeEntry reports the fallback origin when nothing is resolved', () => {
  const fromEnv = registry.describeEntry(registry.findEntry('security.rateLimit.global'));
  assert.strictEqual(fromEnv.source, 'env');
  assert.strictEqual(fromEnv.revision, null);
  assert.strictEqual(fromEnv.validate, undefined, 'validators must not be serialised into an API response');
  const fromDatabase = registry.describeEntry(registry.findEntry('operations.queues.sampleSize'));
  assert.strictEqual(fromDatabase.source, 'default', 'an unresolved database key reads as the declared default');
  const resolved = registry.describeEntry(registry.findEntry('operations.queues.sampleSize'), { value: 120, source: 'database', revision: 4 });
  assert.strictEqual(resolved.value, 120);
  assert.strictEqual(resolved.revision, 4);
});

test('registry integrity rejects a malformed entry in each of the ways it can be malformed', () => {
  const sample = registry.ENTRIES.find(entry => entry.key === 'operations.queues.sampleSize');
  const cases = [
    [{ ...sample, id: 'not-a-cfg-id' }, /invalid id/],
    [{ ...sample, key: 'Not A Key' }, /invalid key/],
    [{ ...sample, scope: 'GALAXY' }, /unknown scope/],
    [{ ...sample, validate: undefined }, /no validator/],
    [{ ...sample, editable: false, readOnlyReason: undefined }, /read-only without a reason/],
    [{ ...sample, editable: true, scope: 'DEPLOYMENT' }, /editable but deployment-scoped/],
    [{ ...sample, resolution: 'env', envVar: undefined }, /without envVar/],
    [{ ...sample, defaultValue: 100_000 }, /default is invalid/],
  ];
  for (const [candidate, message] of cases) {
    assert.throws(() => registry.assertRegistryIntegrity([candidate]), message);
  }
  assert.doesNotThrow(() => registry.assertRegistryIntegrity([sample]), 'the unmodified entry must pass');
});

test('every registry entry exposes the fields the census UI reads', () => {
  for (const entry of registry.ENTRIES) {
    for (const field of ['id', 'key', 'label', 'description', 'scope', 'type', 'editable', 'audit', 'resolution', 'restartRequired']) {
      assert.ok(entry[field] !== undefined && entry[field] !== '', `${entry.key} is missing ${field}`);
    }
    // `defaultValue` may legitimately be an empty string (`communications.sms.fromNumber`
    // is empty when SMS is off), so presence is what is asserted, not truthiness.
    assert.ok(Object.prototype.hasOwnProperty.call(entry, 'defaultValue'), `${entry.key} is missing defaultValue`);
    assert.ok(['PLATFORM', 'PLAN', 'TENANT', 'DEPLOYMENT'].includes(entry.scope));
    assert.ok(['standard', 'elevated'].includes(entry.audit));
    assert.ok(['database', 'env', 'code'].includes(entry.resolution));
    assert.ok(entry.description.length > 30, `${entry.key} needs a description an operator can act on`);
  }
});
