import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { measureSettings, scoreSettings, readSettings, LEGACY_COLOUR } from '../.bridge/evidence/dir089-settings-score.mjs';

/**
 * DIR-089 — Settings & 2FA hub mastery.
 *
 * The tokenisation is MEASURED (baseline 3.7, 1340 legacy colours) rather than asserted, and
 * the security invariants are pinned because this page owns the TOTP enrolment, the backup
 * codes and the password lifecycle.
 */

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SETTINGS = 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx';

test('DIR-089 AC1: the legacy colour debt is eradicated, and the residual is stated', () => {
    const row = measureSettings();
    const summary = scoreSettings(row);

    // Measured baseline before this directive: 1340 legacy utilities, 2 cuba classes, 3.7/10.
    assert.ok(row.legacyColours < 100, `legacy colours must fall well below the 1340 baseline, saw ${row.legacyColours}`);
    assert.ok(row.cubaClasses > 1000, `token usage must rise above 1000, saw ${row.cubaClasses}`);
    assert.ok(summary.tokenAdoption > 0.9, `token adoption must exceed 0.9, saw ${summary.tokenAdoption}`);

    // The residual must be ONLY the deliberately deferred compositional gradient stops and the
    // one shadow-colour case - never a silently dropped structural colour.
    const residual = [...new Set(readSettings().match(LEGACY_COLOUR) || [])];
    const unexpected = residual.filter((key) => !/^(from|via|to)-/.test(key) && key !== 'shadow-indigo-600');
    assert.deepEqual(unexpected, [], `only gradient stops and the shadow colour may remain: ${unexpected.join(', ')}`);
});

test('DIR-089 AC2: the measured score meets the 9.0 target', () => {
    const summary = scoreSettings();
    assert.ok(summary.score >= 9.0, `the directive target is 9.0, measured ${summary.score}`);
});

test('DIR-089 AC3: the 2FA secret lifecycle is untouched and leaks nothing', async () => {
    const src = await read(SETTINGS);
    // The TOTP surface must still exist end to end.
    for (const symbol of ['totpStatus', 'totpSetupStep', 'totpEnrollmentSecret', 'totpQrCodeDataUrl', 'totpVerificationCode', 'totpDisablePassword', 'backupCode']) {
        assert.ok(src.includes(symbol), `the TOTP lifecycle must keep ${symbol}`);
    }
    // No secret may be logged, and no secret may be embedded in an attribute.
    assert.doesNotMatch(src, /console\.(log|info|warn)\([^)]*secret/i, 'secrets must never be logged');
    assert.doesNotMatch(src, /data-secret=|aria-label=\{?totpSetupSecret/, 'the raw secret must not be exposed as an attribute');
});

test('DIR-089 AC4: the hub renders an honest failure surface', async () => {
    const src = await read(SETTINGS);
    // Previously a failed account load only hit the console, leaving the page silently empty.
    assert.match(src, /role="alert"/);
    assert.match(src, /data-testid="settings-load-error"/);
    assert.match(src, /setAccountLoadError\(/);
    // It must be cleared on a clean load rather than sticking.
    assert.match(src, /setAccountLoadError\(null\)/);
});

test('DIR-089 AC5: invariants hold — frozen templates, no new dependency', async () => {
    const dir = path.join(ROOT, 'src/cv-templates');
    const modules = fs.readdirSync(dir).filter((n) => /^(cv\d+|cover\d+)$/.test(n));
    assert.equal(modules.length, 55, 'the frozen baseline must remain 55 template modules');

    const pkg = JSON.parse(await read('package.json'));
    assert.ok(pkg.scripts['test:dir089'], 'test:dir089 must be registered');
    assert.equal(pkg.dependencies['tailwind-scrollbar'], undefined);
});
