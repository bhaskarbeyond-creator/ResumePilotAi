import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { isAuthoritativeSettings, isFallbackSettings } from '../src/utils/moduleFlags.js';

/**
 * DIR-057 — Authoritative settings-hydration hardening.
 *
 * IMPORTANT SCOPE NOTE (honesty): the directive's stated root cause — that
 * `isAuthoritative` is "permanently false" because the backend emits `mariadb`
 * while the panels compare against `remote` — was DISPROVEN against the live
 * stack: the client adapters relabel a successful read to `remote`
 * (services/api/platform.js getSystemSettings/getWebsiteData/getSubscriptionStatus)
 * and the authenticated admin read returns 200. This suite therefore pins the
 * HARDENING, not a bug fix: one shared predicate that tolerates both provenance
 * vocabularies so the panels can never drift from the adapters again.
 */

const PANELS = [
  'src/components/admin/settings/ModulesSettings.jsx',
  'src/components/Billing/Plans/Plans.jsx',
  'src/components/admin/settings/websiteSettings.jsx',
  'src/components/admin/settings/socialSettings.jsx',
  'src/components/admin/settings/anlyticsSettings.jsx',
];

/** Strip comments so assertions test CODE, not prose that names the vocabulary. */
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* ── Unit: the predicate itself ────────────────────────────────────────────── */

test('DIR-057: accepts BOTH authoritative vocabularies (raw mariadb* and adapter remote)', () => {
  for (const source of ['mariadb', 'mariadb-inmemory', 'remote']) {
    assert.equal(
      isAuthoritativeSettings({ _settingsSource: source, _settingsStale: false }),
      true,
      `"${source}" is an authoritative provenance and must be accepted`,
    );
  }
});

test('DIR-057: fails CLOSED on the fallback vocabulary and on missing provenance', () => {
  for (const source of ['fallback', 'safe-defaults', 'stale-cache', 'cache', 'unavailable']) {
    assert.equal(
      isAuthoritativeSettings({ _settingsSource: source }),
      false,
      `"${source}" must never be treated as authoritative`,
    );
  }
  for (const payload of [undefined, null, {}, [], '', 'MARIA', 42, { _settingsSource: 'mysql' }]) {
    assert.equal(isAuthoritativeSettings(payload), false, `unsupported payload must fail closed: ${JSON.stringify(payload)}`);
  }
});

test('DIR-057: an explicitly stale payload is never authoritative, whatever its source', () => {
  for (const source of ['mariadb', 'remote']) {
    assert.equal(isAuthoritativeSettings({ _settingsSource: source, _settingsStale: true }), false);
  }
});

test('DIR-057: the predicate agrees with isFallbackSettings on the fallback vocabulary', () => {
  for (const source of ['fallback', 'safe-defaults', 'stale-cache', 'cache', 'unavailable']) {
    const payload = { _settingsSource: source };
    assert.equal(isFallbackSettings(payload), true);
    assert.equal(isAuthoritativeSettings(payload), false, `the two predicates must not contradict on "${source}"`);
  }
  assert.equal(isFallbackSettings({ _settingsSource: 'remote', _settingsStale: false }), false);
  assert.equal(isAuthoritativeSettings({ _settingsSource: 'remote', _settingsStale: false }), true);
});

/* ── Static: every panel uses the ONE predicate and no inline literal ──────── */

test('DIR-057: all five panels import and use isAuthoritativeSettings', async () => {
  for (const file of PANELS) {
    const code = stripComments(await fs.readFile(file, 'utf8'));
    assert.match(code, /import \{[^}]*isAuthoritativeSettings[^}]*\} from '[^']*utils\/moduleFlags'/, `${file} must import the shared predicate`);
    assert.match(code, /isAuthoritativeSettings\(/, `${file} must call the shared predicate`);
  }
});

test('DIR-057: no panel still hand-rolls the provenance comparison', async () => {
  for (const file of PANELS) {
    const code = stripComments(await fs.readFile(file, 'utf8'));
    assert.doesNotMatch(code, /_settingsSource === 'remote'/, `${file} must not re-introduce the inline literal`);
    assert.doesNotMatch(code, /_settingsSource !== 'remote'/, `${file} must not re-introduce the inline literal`);
  }
});
