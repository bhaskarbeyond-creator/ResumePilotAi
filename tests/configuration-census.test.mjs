import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = new URL('..', import.meta.url).pathname;
const censusPath = path.join(repoRoot, 'docs/CONFIGURATION_CENSUS.md');

/**
 * REGRESSION COVERAGE — configuration census completeness.
 *
 * The first census pass reported "126 keys, COMPLETE". It was not complete: it
 * matched only `process.env.NAME` and therefore missed every key read through
 * an injected environment object (`env.NAME`), including
 *   - FIREBASE_TOTP_MFA_ENABLED  (the platform's own MFA capability declaration)
 *   - ENTERPRISE_ENCRYPTION_KEY / _KEYS / _ACTIVE_KEY / _KEY_VERSION / _PROVIDER
 *   - APP_PUBLIC_URL, PUBLIC_APP_URL, CANONICAL_PUBLIC_URL
 *
 * A census that silently omits secret material is worse than no census, because
 * it is trusted. This test regenerates the census and fails if it is stale or
 * if any configuration key in the source tree is absent from it.
 */

function censusKeys() {
  const source = fs.readFileSync(censusPath, 'utf8');
  return new Set([...source.matchAll(/^\| `([A-Z0-9_]+)`/gm)].map(match => match[1]));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Independent extractor: deliberately NOT the generator's own implementation. */
function keysReferencedInSource() {
  const roots = ['backend', 'src'].map(dir => path.join(repoRoot, dir));
  const found = new Set();
  for (const root of roots) {
    for (const file of walk(root)) {
      if (!/\.(m?js|jsx|cjs)$/.test(file)) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/process\.env\.([A-Z0-9_]{3,})/g)) found.add(match[1]);
      for (const match of source.matchAll(/process\.env\[['"]([A-Z0-9_]{3,})['"]\]/g)) found.add(match[1]);
      for (const match of source.matchAll(/import\.meta\.env\.([A-Z0-9_]{3,})/g)) found.add(match[1]);
      for (const match of source.matchAll(/\benv(?:ironment)?\.([A-Z][A-Z0-9_]{3,})\b/g)) found.add(match[1]);
      for (const match of source.matchAll(/\benv(?:ironment)?\[['"]([A-Z][A-Z0-9_]{3,})['"]\]/g)) found.add(match[1]);
    }
  }
  return found;
}

test('the committed census is current (regenerating it produces no change)', () => {
  const before = fs.readFileSync(censusPath, 'utf8');
  execFileSync('node', ['scripts/generate-config-census.mjs'], { cwd: repoRoot, stdio: 'pipe' });
  const after = fs.readFileSync(censusPath, 'utf8');
  assert.equal(after, before, 'docs/CONFIGURATION_CENSUS.md is stale — run `npm run inventory:config` and commit the result');
});

test('every configuration key referenced in source appears in the census', () => {
  const census = censusKeys();
  const missing = [...keysReferencedInSource()].filter(key => !census.has(key)).sort();
  assert.deepEqual(
    missing,
    [],
    `The census omits configuration that the code actually reads:\n${missing.join('\n')}`
  );
});

test('the census covers the keys the first pass missed', () => {
  const census = censusKeys();
  // Explicit anchors for the specific omissions this audit found.
  for (const key of [
    'FIREBASE_TOTP_MFA_ENABLED',
    'SUPER_ADMIN_MFA_REQUIRED',
    'ENTERPRISE_ENCRYPTION_KEY',
    'ENTERPRISE_ENCRYPTION_KEYS',
    'ENTERPRISE_ENCRYPTION_ACTIVE_KEY',
    'ENTERPRISE_ENCRYPTION_KEY_VERSION',
    'ENTERPRISE_ENCRYPTION_PROVIDER',
    'ENTERPRISE_DATA_PROVIDER',
  ]) {
    assert.ok(census.has(key), `${key} must appear in the configuration census`);
  }
});

test('the census does not invent phantom keys from the generator itself', () => {
  const census = censusKeys();
  // The generator's own source contains the regexes it searches for; scanning
  // itself previously produced a bogus `NAME` entry.
  assert.ok(!census.has('NAME'), 'the census must exclude the generator from its own scan');
});

test('every SECRET-classified key is recorded as not operator-editable in the UI', () => {
  const source = fs.readFileSync(censusPath, 'utf8');
  const rows = [...source.matchAll(/^\| `([A-Z0-9_]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)];
  assert.ok(rows.length > 100, 'the census must contain the full inventory table');
  for (const [, key, , classification, exposedInUi] of rows) {
    if (!classification.includes('SECRET')) continue;
    assert.equal(
      exposedInUi.trim(),
      'no',
      `${key} is a SECRET but the census reports it as exposed in the Admin UI — verify no secret is rendered`
    );
  }
});

test('the MFA capability declaration is operator-visible through the platform configuration API', () => {
  const source = fs.readFileSync(censusPath, 'utf8');
  const row = source.split('\n').find(line => line.startsWith('| `FIREBASE_TOTP_MFA_ENABLED`'));
  assert.ok(row, 'FIREBASE_TOTP_MFA_ENABLED must be inventoried');
  // Column 5 is "Exposed via platform configuration API".
  const columns = row.split('|').map(item => item.trim());
  assert.equal(columns[5], 'yes', 'Super Admins must be able to read the declared TOTP provider capability');
});
