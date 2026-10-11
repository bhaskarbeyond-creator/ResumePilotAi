import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseUserIdentity, roleBadgeFor } from '../src/components/cuba/userIdentity.js';

/**
 * DIR-075 — Decouple Master Profile Data from the Account & Security switcher.
 *
 * Pins the switcher removal, the URL-driven surfaces, the sanitized profile
 * header identity, and the updated DIR-017 E2E contract. Mirrors the
 * read-the-source convention of the sibling dir0xx suites.
 */

const SETTINGS = 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx';
const DIR017 = 'tests/e2e/dir017-candidate-settings.spec.js';
const read = (p) => fs.readFile(p, 'utf8');

test('S1: the redundant Master Profile / Account switcher is removed', async () => {
    const src = await read(SETTINGS);
    // The switcher's own handlers and container are gone.
    assert.doesNotMatch(src, /setSelectedSettings\('Profile'\); navigate\('?tab=Profile'/);
    assert.doesNotMatch(src, /bg-slate-100 p-1 rounded-xl flex items-center gap-1 flex-1 md:flex-initial/);
    // The two icons used ONLY by the switcher are no longer imported/used.
    assert.doesNotMatch(src, /\bFaUser\b/);
    assert.doesNotMatch(src, /\bFaCog\b/);
    // The Expand View / Show Guidance copilot toggle survives.
    assert.match(src, /setShowProfileGuidanceRail/);
    assert.match(src, /Show Guidance/);
});

test('S2: the surfaces are URL-driven (Account & Security vs Master Profile)', async () => {
    const src = await read(SETTINGS);
    assert.match(src, /lower\.includes\('account'\) \|\| lower\.includes\('security'\) \|\| lower === '2fa'/);
    assert.match(src, /lower\.includes\('profile'\)/);
    assert.match(src, /selectedSettings === 'Profile' \? \(/);
});

test('S3: the profile header identity is sanitized (no raw parentheses)', async () => {
    const src = await read(SETTINGS);
    assert.match(src, /import \{ parseUserIdentity, roleBadgeFor \} from '\.\.\/\.\.\/cuba\/userIdentity'/);
    assert.match(src, /const headerIdentity = parseUserIdentity\(/);
    assert.match(src, /const candidateFullName = headerIdentity\.name/);
    assert.match(src, /data-testid="profile-role-badge"/);
    assert.match(src, /headerIdentity\.roleLabel/);

    // Functional proof: the parenthetical role is split out of the name.
    const id = parseUserIdentity({ name: 'Bhaskar Beyond (Super Admin)' });
    assert.equal(id.name, 'Bhaskar Beyond');
    assert.equal(id.roleLabel, 'Super Admin');
    assert.equal(roleBadgeFor(id.role).tone, 'superAdmin');
    assert.doesNotMatch(id.name, /[()]/);
});

test('S5: the dir017 E2E now asserts the URL contract and the switcher absence', async () => {
    const spec = await read(DIR017);
    assert.match(spec, /the URL drives the surface and the in-page Account switcher is gone/);
    assert.match(spec, /getByRole\('button', \{ name: 'Master Profile', exact: true \}\)\)\.toHaveCount\(0\)/);
    assert.match(spec, /getByRole\('button', \{ name: 'Account & Security', exact: true \}\)\)\.toHaveCount\(0\)/);
    // The removed switcher must no longer be clicked.
    assert.doesNotMatch(spec, /getByRole\('button', \{ name: 'Master Profile' \}\)\.click\(\)/);
    assert.doesNotMatch(spec, /getByRole\('button', \{ name: 'Account & Security' \}\)\.click\(\)/);
});
