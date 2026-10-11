import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
    parseUserIdentity,
    roleBadgeFor,
    roleLabelFor,
    roleToneFor,
    ACCOUNT_ROLE_LABELS,
    ACCOUNT_ROLE_TONES,
} from '../src/components/cuba/userIdentity.js';
import { accountLinksFor, ACCOUNT_PORTALS } from '../src/components/cuba/accountLinks.js';

/**
 * DIR-074 — Executive User Identity & M3 Account Dropdown Pipeline Overhaul.
 *
 * Pins the identity parser (no raw parentheses), the role-tailored badge, the
 * decoupled dropdown destinations and the 2FA deep-link scroll. Mirrors the
 * read-the-source convention of tests/copilot-command-surface.test.mjs.
 */

const MENU = 'src/components/cuba/M3UserMenu.jsx';
const SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const PORTAL_SHELL = 'src/components/cuba/CubaPortalShell.jsx';
const SETTINGS = 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx';
const CLEAN_SCRIPT = 'scripts/deep-clean-production.cjs';
const read = (p) => fs.readFile(p, 'utf8');

test('S1: parseUserIdentity splits a parenthetical role out of the display name', () => {
    const id = parseUserIdentity({ name: 'Bhaskar Beyond (Super Admin)', email: 'bhaskar.beyond@gmail.com' });
    assert.equal(id.name, 'Bhaskar Beyond');
    assert.equal(id.email, 'bhaskar.beyond@gmail.com');
    assert.equal(id.roleLabel, 'Super Admin');
    assert.equal(id.roleTone, 'superAdmin');
    assert.doesNotMatch(id.name, /[()]/, 'the raw parenthetical must never survive');
});

test('S1: a clean name with no parenthetical is returned unchanged (zero fabrication)', () => {
    assert.equal(parseUserIdentity({ name: 'Bhaskar Beyond', role: 'SUPER_ADMIN' }).name, 'Bhaskar Beyond');
    assert.equal(parseUserIdentity({ name: 'Bhaskar Beyond', role: 'SUPER_ADMIN' }).roleLabel, 'Super Admin');
    assert.equal(parseUserIdentity('').name, '');
    assert.equal(parseUserIdentity('Ada Lovelace').name, 'Ada Lovelace');
    assert.equal(parseUserIdentity('Ada Lovelace').roleLabel, '');
});

test('S1: role labels + tones cover every required role', () => {
    assert.equal(roleLabelFor('SUPER_ADMIN'), 'Super Admin');
    assert.equal(roleLabelFor('ADMIN'), 'Admin');
    assert.equal(roleLabelFor('RECRUITER'), 'Recruiter');
    assert.equal(roleLabelFor('ENTERPRISE'), 'Org Admin');
    assert.equal(roleLabelFor('CANDIDATE'), 'Candidate');
    assert.equal(roleLabelFor('USER'), 'Candidate');
    assert.equal(roleToneFor('SUPER_ADMIN'), 'superAdmin');
    assert.equal(roleToneFor('ENTERPRISE'), 'orgAdmin');
    assert.equal(roleToneFor('unmapped-role'), 'candidate');
    assert.equal(roleBadgeFor('ADMIN').tone, 'admin');
    assert.match(roleBadgeFor('ADMIN').className, /text-/);
    assert.ok(Object.keys(ACCOUNT_ROLE_LABELS).length >= 8);
    assert.ok(Object.keys(ACCOUNT_ROLE_TONES).length >= 5);
});

test('S2: M3UserMenu renders the clean name + role label, never a raw parenthetical', async () => {
    const src = await read(MENU);
    assert.match(src, /import \{ parseUserIdentity, roleBadgeFor \} from '\.\/userIdentity'/);
    assert.match(src, /const identity = parseUserIdentity\(user\)/);
    assert.match(src, /data-testid="cuba-user-trigger-name"/);
    assert.match(src, /data-testid="cuba-user-trigger-role"/);
    assert.match(src, /text-indigo-600 dark:text-indigo-400/);
    assert.match(src, /data-testid="cuba-user-menu-role"/);
    assert.match(src, /roleBadge\.className/);
    // The certified menu a11y contract is intact.
    assert.match(src, /role="menu"/);
    assert.match(src, /role="menuitem"/);
    assert.match(src, /cuba-user-menu-trigger/);
    assert.match(src, /cuba-user-menu-email/);
});

test('S2: the shells run the identity through parseUserIdentity', async () => {
    const [shell, portal] = await Promise.all([read(SHELL), read(PORTAL_SHELL)]);
    assert.match(shell, /parseUserIdentity/);
    assert.match(portal, /parseUserIdentity/);
});

test('S3: candidate profile and settings have distinct destinations', () => {
    const links = accountLinksFor(ACCOUNT_PORTALS.CANDIDATE);
    assert.equal(links.profile, '/dashboard/settings?tab=profile');
    assert.equal(links.settings, '/dashboard/settings?tab=account');
    assert.equal(links.security, '/dashboard/settings?tab=security');
    assert.notEqual(links.profile, links.settings);
    // The other portals keep their mounted targets.
    assert.equal(accountLinksFor(ACCOUNT_PORTALS.ADMIN).security, '/admin/security');
    assert.equal(accountLinksFor(ACCOUNT_PORTALS.RECRUITER).settings, '/employer/settings');
    assert.equal(accountLinksFor(ACCOUNT_PORTALS.ENTERPRISE, { slug: 'global-tech' }).security, '/org/global-tech/security');
});

test('S3: DashboardSettings scrolls to the 2FA card on ?tab=security or ?tab=2fa', async () => {
    const src = await read(SETTINGS);
    assert.match(src, /id="totp-security-hub"/);
    assert.match(src, /pendingScrollRef/);
    assert.match(src, /lower\.includes\('security'\) \|\| lower === '2fa'/);
    assert.match(src, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});

test('S2: the source data no longer bakes a parenthetical role into displayName', async () => {
    const src = await read(CLEAN_SCRIPT);
    assert.match(src, /displayName: 'Bhaskar Beyond'/);
    assert.doesNotMatch(src, /displayName: 'Bhaskar Beyond \(Super Admin\)'/);
    assert.match(src, /role: 'SUPER_ADMIN'/);
});
