// DIR-105 — Platform Settings reachability + authorization guards.
//
// Context: Cuba is the default shell and the legacy sidebar (which owned the 31
// settings surfaces) only renders when the Cuba flag is OFF. `portalNavigation.js`
// exposes a single `/admin/settings` link with no `?tab=`, so operators landed on
// `modulesSettings` with no way to reach the other panels.
//
// What must stay true:
//   1. Every declared setting reaches a panel that is actually mounted (no dead entry).
//   2. Authorization is unchanged and decided in exactly one place — the hub may
//      never widen access. `superAdminOnly` stays super-admin-only.
//   3. The navigator handles no secrets and uses Cuba tokens only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { canAccessSetting, SETTINGS_GROUP_ORDER, presentGroups, ALL_SETTINGS } from '../src/components/admin/settings/settingsAccess.js';
import { buildSettingsCommands, matchSettingsCommands } from '../src/components/cuba/portalCommands.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SETTINGS = read('src/components/admin/settings/Settings.jsx');
const NAVIGATOR = read('src/components/admin/settings/SettingsNavigator.jsx');

/** Panels the content component actually renders. */
function mountedPanels() {
    const body = SETTINGS.slice(SETTINGS.indexOf('class SettingsContent'));
    const keys = new Set();
    for (const m of body.matchAll(/step === '([A-Za-z]+)'/g)) keys.add(m[1]);
    return keys;
}

/** Comments explain policy; they are not executable surface. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const NAV_CODE = stripComments(NAVIGATOR);

const INVENTORY = ALL_SETTINGS;
const MOUNTED = mountedPanels();
const SUPER_ADMIN_ONLY_KEYS = INVENTORY.filter((s) => s.superAdminOnly).map((s) => s.key);

describe('DIR-105 settings inventory is complete and reachable', () => {
    it('declares a non-trivial inventory (26+ operations)', () => {
        assert.ok(INVENTORY.length >= 26, `expected 26+ settings, found ${INVENTORY.length}`);
    });

    it('parses every entry with a key, label and group', () => {
        for (const s of INVENTORY) {
            assert.ok(s.key && s.label && s.group, `incomplete entry: ${JSON.stringify(s)}`);
        }
    });

    it('mounts a panel for every declared setting (no dead navigation target)', () => {
        for (const s of INVENTORY) {
            assert.ok(MOUNTED.has(s.key), `"${s.label}" (${s.key}) has no mounted panel`);
        }
    });

    it('gives every setting either a permission or an explicit superAdminOnly flag', () => {
        for (const s of INVENTORY) {
            assert.ok(
                s.superAdminOnly || s.permission,
                `"${s.key}" is neither permission-gated nor superAdminOnly`,
            );
        }
    });

    it('assigns every group to the canonical order (no orphan group)', () => {
        const declared = new Set(INVENTORY.map((s) => s.group));
        for (const g of declared) {
            assert.ok(SETTINGS_GROUP_ORDER.includes(g), `group "${g}" is not in SETTINGS_GROUP_ORDER`);
        }
        assert.deepEqual(presentGroups(INVENTORY).sort(), [...declared].sort());
    });
});

describe('DIR-105 the navigator cannot widen authorization', () => {
    it('denies superAdminOnly entries to a non-super-admin with every permission', () => {
        const gated = INVENTORY.filter((s) => s.superAdminOnly);
        assert.ok(gated.length > 0, 'expected some superAdminOnly entries to guard');
        for (const s of gated) {
            assert.equal(
                canAccessSetting(s, { isSuperAdmin: false, permissions: ['*'] }),
                false,
                `${s.key} leaked to a non-super-admin holding '*'`,
            );
        }
    });

    it('grants superAdminOnly entries to a super admin', () => {
        for (const s of INVENTORY.filter((x) => x.superAdminOnly)) {
            assert.equal(canAccessSetting(s, { isSuperAdmin: true, permissions: [] }), true);
        }
    });

    it('requires the exact permission for permission-gated entries', () => {
        for (const s of INVENTORY.filter((x) => !x.superAdminOnly)) {
            assert.equal(canAccessSetting(s, { isSuperAdmin: false, permissions: [] }), false);
            assert.equal(canAccessSetting(s, { isSuperAdmin: false, permissions: [s.permission] }), true);
        }
    });

    it('honours a wildcard grant for permission entries but not for superAdminOnly', () => {
        const plain = INVENTORY.find((s) => !s.superAdminOnly && s.permission);
        assert.equal(canAccessSetting(plain, { isSuperAdmin: false, permissions: ['*'] }), true);
    });

    it('treats array-form permissions as an OR', () => {
        const entry = { key: 'x', permission: ['a.read', 'b.read'] };
        assert.equal(canAccessSetting(entry, { isSuperAdmin: false, permissions: ['b.read'] }), true);
        assert.equal(canAccessSetting(entry, { isSuperAdmin: false, permissions: ['c.read'] }), false);
    });

    it('is total — a missing setting never grants access', () => {
        assert.equal(canAccessSetting(undefined, { isSuperAdmin: true }), false);
        assert.equal(canAccessSetting(null, { isSuperAdmin: false, permissions: ['*'] }), false);
    });
});


describe('DIR-105 the wrapper and hub share one predicate', () => {
    it('routes the denial gate through canAccessSetting', () => {
        assert.match(SETTINGS, /!canAccessSetting\(targetSetting, \{ isSuperAdmin, permissions \}\)/);
    });

    it('no longer carries a second, inline permission helper', () => {
        assert.doesNotMatch(SETTINGS, /const hasPerm\s*=/);
    });

    it('mounts the navigator on both the allowed and the denied branch', () => {
        const wrapper = SETTINGS.slice(SETTINGS.indexOf('function SettingsWrapper'));
        assert.equal(
            [...wrapper.matchAll(/\{navigator\}/g)].length,
            2,
            'the hub must render whether or not the tab is denied',
        );
    });

    it('filters the hub through the same predicate', () => {
        assert.match(NAVIGATOR, /settings\.filter\(\(s\) => canAccessSetting\(s, accessContext\)\)/);
    });
});

describe('DIR-105 preserves the ?tab= contract and Cuba design tokens', () => {
    it('drives selection through the URL rather than private state', () => {
        assert.match(NAVIGATOR, /useSearchParams\(\)/);
        assert.match(NAVIGATOR, /setSearchParams\(\{ tab: key \}\)/);
        assert.match(SETTINGS, /searchParams\.get\('tab'\)/);
    });

    it('labels its landmark and marks the active tab', () => {
        assert.match(NAVIGATOR, /aria-label="Platform settings navigation"/);
        assert.match(NAVIGATOR, /aria-current=\{isActive \? 'page' : undefined\}/);
    });

    it('exposes no raw colour values (Cuba tokens only)', () => {
        assert.doesNotMatch(NAVIGATOR, /#[0-9a-fA-F]{3,8}\b/);
        assert.doesNotMatch(NAVIGATOR, /\b(?:bg|text|border)-(?:slate|gray|zinc|rose|blue)-\d{2,3}\b/);
    });

    it('never handles a credential', () => {
        for (const bad of [/api[_-]?key/i, /secret/i, /password/i, /bearer/i, /private[_-]?key/i]) {
            assert.doesNotMatch(NAV_CODE, bad, `navigator must not reference ${bad}`);
        }
    });

    it('stays responsive and non-overflowing', () => {
        assert.match(NAVIGATOR, /grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3/);
        assert.match(NAVIGATOR, /flex-wrap/);
    });
});


describe('DIR-105 command palette indexes every entitled settings panel', () => {
    const superAdmin = { isSuperAdmin: true, permissions: ['*'] };

    it('indexes the full inventory for a super admin', () => {
        const commands = buildSettingsCommands(INVENTORY, superAdmin);
        assert.equal(commands.length, INVENTORY.length);
    });

    it('deep-links every command to its own ?tab= target', () => {
        for (const command of buildSettingsCommands(INVENTORY, superAdmin)) {
            const key = command.id.replace('settings-', '');
            assert.equal(command.to, `/admin/settings?tab=${encodeURIComponent(key)}`);
        }
    });

    it('never indexes a panel the denial gate would refuse', () => {
        const commands = buildSettingsCommands(INVENTORY, { isSuperAdmin: false, permissions: ['*'] });
        for (const key of SUPER_ADMIN_ONLY_KEYS) {
            assert.equal(
                commands.some((c) => c.to.includes(`tab=${key}`)),
                false,
                `palette leaked ${key} to a non-super-admin`,
            );
        }
    });

    it('marks the currently open panel as active', () => {
        const target = INVENTORY[2].key;
        const commands = buildSettingsCommands(INVENTORY, superAdmin, target);
        assert.equal(commands.filter((c) => c.isActive).length, 1);
        assert.equal(commands.find((c) => c.isActive).id, `settings-${target}`);
    });

    it('makes every panel keyword-searchable by label, key and group', () => {
        for (const command of buildSettingsCommands(INVENTORY, superAdmin)) {
            const key = command.id.replace('settings-', '');
            const entry = INVENTORY.find((s) => s.key === key);
            assert.ok(command.keywords.includes(entry.label));
            assert.ok(command.keywords.includes(key));
            assert.ok(command.keywords.includes(entry.group));
        }
    });

    it('is empty (not throwing) for an absent inventory', () => {
        assert.deepEqual(buildSettingsCommands(undefined, superAdmin), []);
        assert.deepEqual(buildSettingsCommands([], superAdmin), []);
    });
});


describe('DIR-105 Ctrl+K palette indexes ALL settings tabs', () => {
    // The Lead's CHANGES_REQUESTED verdict was explicit: "evidence does not confirm
    // the Ctrl+K Command Palette indexes all settings tabs as required." These tests
    // are that confirmation.

    it('reaches EVERY settings panel by its own label', () => {
        for (const setting of INVENTORY) {
            const hits = matchSettingsCommands(INVENTORY, setting.label);
            assert.ok(
                hits.some((h) => h.to === `/admin/settings?tab=${setting.key}`),
                `palette cannot reach "${setting.label}" (${setting.key})`,
            );
        }
    });

    it('reaches every panel by its raw key too', () => {
        for (const setting of INVENTORY) {
            const hits = matchSettingsCommands(INVENTORY, setting.key);
            assert.ok(
                hits.some((h) => h.to.includes(`tab=${setting.key}`)),
                `palette cannot reach ${setting.key} by key`,
            );
        }
    });

    it('indexes every panel — no gaps across the full inventory', () => {
        const reached = new Set();
        for (const setting of INVENTORY) {
            for (const hit of matchSettingsCommands(INVENTORY, setting.label)) {
                const key = hit.to.replace('/admin/settings?tab=', '');
                reached.add(key);
            }
        }
        assert.equal(reached.size, INVENTORY.length, `indexed ${reached.size} of ${INVENTORY.length}`);
        assert.ok(reached.size >= 26);
    });

    it('is case-insensitive and trims the query', () => {
        const lower = matchSettingsCommands(INVENTORY, 'firebase');
        const upper = matchSettingsCommands(INVENTORY, '  FIREBASE  ');
        assert.deepEqual(lower.map((h) => h.to), upper.map((h) => h.to));
        assert.ok(lower.length > 0);
    });

    it('finds panels by group name', () => {
        const hits = matchSettingsCommands(INVENTORY, 'Security & Health');
        assert.ok(hits.length >= 5, `expected the Security & Health group, got ${hits.length}`);
    });

    it('returns nothing for an empty query rather than the whole inventory', () => {
        assert.deepEqual(matchSettingsCommands(INVENTORY, ''), []);
        assert.deepEqual(matchSettingsCommands(INVENTORY, '   '), []);
        assert.deepEqual(matchSettingsCommands(INVENTORY, undefined), []);
    });

    it('every palette hit carries a deep link the gate can adjudicate', () => {
        for (const hit of matchSettingsCommands(INVENTORY, 'settings')) {
            assert.match(hit.to, /^\/admin\/settings\?tab=[A-Za-z]+$/);
        }
    });

    it('is wired into the admin console palette provider', () => {
        const SEARCH = read('src/components/admin/command/adminEntitySearch.js');
        assert.match(SEARCH, /matchSettingsCommands/, 'adminEntitySearch must index settings');
        assert.match(SEARCH, /settingsCommandHits/);
        // The provider must merge settings with the live platform records.
        assert.match(SEARCH, /\[\.\.\.settings, \.\.\.records\]/);
    });

    it('keeps the admin wrapper free of permission logic (guard stays true)', () => {
        const WRAPPER = stripComments(read('src/components/admin/AdminPortalCuba.jsx'));
        assert.doesNotMatch(WRAPPER, /permissionsFor|isSuperAdmin|role\s*===|RequireTabPerm/);
        assert.doesNotMatch(WRAPPER, /fetch\(|axios|\/api\//);
    });
});

