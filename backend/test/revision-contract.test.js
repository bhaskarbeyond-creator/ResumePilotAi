'use strict';

/**
 * Regression coverage for the optimistic-concurrency (revision) contract.
 *
 * DEFECT REPRODUCED AND FIXED
 * ---------------------------
 * `001_baseline.sql` declares `revision INT NOT NULL DEFAULT 1`, but backend
 * guards coerced a missing revision with `Number(x.revision || 0)` while
 * frontend clients coerced it with `revision || 1`. A row whose revision was
 * NULL/absent was projected to the browser as 0, echoed back as 1, compared
 * against a server-side 0, and rejected with a permanent spurious 409
 * (CAS_CONFLICT / APPLICATION_CHANGED) that refreshing could never clear.
 *
 * These tests pin the single authoritative normalization and assert that the
 * compare-and-set guard is repaired WITHOUT being weakened: a genuinely stale
 * revision must still conflict.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  REVISION_FLOOR,
  REVISION_CEILING,
  normalizeRevision,
  nextRevision,
  isSameRevision,
} = require('../services/revision');
const { projectEditableProfile } = require('../services/profileSanitizer');

test('revision floor matches the declared schema default', () => {
  const baseline = fs.readFileSync(
    path.join(__dirname, '..', 'database', 'migrations', '001_baseline.sql'),
    'utf8'
  );
  assert.match(baseline, /revision INT NOT NULL DEFAULT 1/i);
  assert.equal(REVISION_FLOOR, 1, 'floor must be 1, never 0');
  assert.ok(REVISION_CEILING > REVISION_FLOOR);
});

test('normalizeRevision collapses absent and sub-floor values to the floor', () => {
  for (const absent of [undefined, null, '', NaN, 'not-a-number', 0, -5, '0']) {
    assert.equal(normalizeRevision(absent), REVISION_FLOOR, `input ${String(absent)}`);
  }
});

test('normalizeRevision preserves valid stored revisions and coerces numeric strings', () => {
  assert.equal(normalizeRevision(1), 1);
  assert.equal(normalizeRevision(7), 7);
  assert.equal(normalizeRevision('7'), 7);
  assert.equal(normalizeRevision(42.9), 42, 'fractional revisions truncate');
  assert.equal(normalizeRevision(REVISION_CEILING + 500), REVISION_CEILING, 'clamped to ceiling');
});

test('REGRESSION: a NULL stored revision no longer conflicts with a client floor of 1', () => {
  // This is the exact production failure: server saw NULL/0, browser sent 1.
  for (const stored of [undefined, null, 0]) {
    const clientEcho = stored || 1; // the historical frontend coercion
    assert.equal(
      isSameRevision(stored, clientEcho),
      true,
      `stored=${String(stored)} must match the client echo, not raise a spurious 409`
    );
  }
});

test('the compare-and-set guard is NOT weakened: genuinely stale revisions still conflict', () => {
  assert.equal(isSameRevision(5, 5), true);
  assert.equal(isSameRevision(5, 4), false, 'stale write must be rejected');
  assert.equal(isSameRevision(5, 6), false, 'ahead-of-store write must be rejected');
  assert.equal(isSameRevision(9, '8'), false);
  assert.equal(isSameRevision(9, '9'), true, 'string revisions from JSON bodies compare correctly');
});

test('nextRevision advances from the authoritative floor, never from 0', () => {
  assert.equal(nextRevision(undefined), 2, 'first write after an absent revision');
  assert.equal(nextRevision(0), 2);
  assert.equal(nextRevision(1), 2);
  assert.equal(nextRevision(9), 10);
  assert.equal(nextRevision(REVISION_CEILING), REVISION_CEILING, 'ceiling is stable');
});

test('the client-visible profile projection never emits a sub-floor revision', () => {
  const projectedNull = projectEditableProfile({ uid: 'u1', email: 'a@b.co', revision: null, preferences: { theme: 'dark' } });
  const projectedMissing = projectEditableProfile({ uid: 'u2', email: 'a@b.co' });
  const projectedZero = projectEditableProfile({ uid: 'u3', email: 'a@b.co', revision: 0 });
  const projectedValid = projectEditableProfile({ uid: 'u4', email: 'a@b.co', revision: 12 });

  assert.equal(projectedNull.revision, REVISION_FLOOR);
  assert.equal(projectedMissing.revision, REVISION_FLOOR);
  assert.equal(projectedZero.revision, REVISION_FLOOR);
  assert.equal(projectedValid.revision, 12);
  assert.equal(projectedNull.preferences.revision, REVISION_FLOOR, 'nested projection agrees');
});

test('no CAS guard or client projection still coerces a revision to 0', () => {
  const guarded = [
    path.join(__dirname, '..', 'services', 'resilientMutations.js'),
    path.join(__dirname, '..', 'services', 'profileSanitizer.js'),
  ];
  for (const file of guarded) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /Number\([^()]*\.revision \|\| 0\)/,
      `${path.basename(file)} must not re-introduce the divergent || 0 coercion`
    );
    assert.match(source, /require\('\.\/revision'\)/, `${path.basename(file)} must use the shared contract`);
  }
});

test('the interview session guard shares the authoritative bounds instead of duplicating them', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'liveInterviewSession.js'), 'utf8');
  assert.match(source, /REVISION_FLOOR, REVISION_CEILING } = require\('\.\/revision'\)/);
  assert.doesNotMatch(source, /revision < 1 \|\| revision > 1_000_000/, 'magic bounds must stay deduplicated');
});
