// Phase 7 — Platform Admin control plane guards.
//
// Priorities, in order:
//   1. The console must keep its authorization model exactly (RequireTabPerm,
//      the MFA gate, the role-view banner). A design layer must never become a
//      second, weaker authorization source.
//   2. Secrets must stay masked and must never be handled by the wrapper.
//   3. Navigation must match PATH_PERMS so no admin entry is dead or un-gated.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ADMIN = read('src/components/admin/Admin.jsx');
const SIDEBAR = read('src/components/admin/sidebar/sidebar.jsx');
const CUBA_ADMIN = read('src/components/admin/AdminPortalCuba.jsx');
const MAIN = read('src/main.jsx');

const { ADMIN_PORTAL_NAVIGATION, ADMIN_ALL_PATHS } = await import('../src/components/cuba/portalNavigation.js');

const ALL_ITEMS = ADMIN_PORTAL_NAVIGATION.flatMap((g) => g.items);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Reads the authoritative PATH_PERMS map out of the existing sidebar. */
function pathPerms() {
    const start = SIDEBAR.indexOf('const PATH_PERMS');
    const body = SIDEBAR.slice(start, SIDEBAR.indexOf('});', start));
    const map = new Map();
    for (const match of body.matchAll(/'(\/admin\/[a-z-]+)':\s*(\[[^\]]*\]|'[^']*')/g)) {
        map.set(match[1], match[2]);
    }
    return map;
}

/** Tabs the console actually mounts a route for. */
function mountedAdminTabs() {
    return new Set([...ADMIN.matchAll(/<Route path="([a-z-]+)"/g)].map((m) => `/admin/${m[1]}`));
}

describe('Admin navigation matches the authoritative permission map', () => {
    const perms = pathPerms();

    it('covers every path declared in PATH_PERMS', () => {
        for (const p of perms.keys()) {
            assert.ok(ADMIN_ALL_PATHS.includes(p), `Cuba admin nav is missing ${p}`);
        }
    });

    it('adds no admin path absent from PATH_PERMS', () => {
        for (const p of ADMIN_ALL_PATHS) {
            // settings detection is path-prefix based rather than route based.
            if (p === '/admin/settings') continue;
            assert.ok(perms.has(p), `Cuba admin nav adds ungated path ${p}`);
        }
    });

    it('resolves every target to a route the console actually mounts', () => {
        const mounted = mountedAdminTabs();
        assert.ok(mounted.size > 15, `expected a real admin route table, found ${mounted.size}`);
        for (const item of ALL_ITEMS) {
            assert.ok(mounted.has(item.to), `"${item.label}" points at ${item.to}, which is not mounted`);
        }
    });

    it('carries a permission tag on every admin item', () => {
        for (const item of ALL_ITEMS) {
            assert.ok(
                Object.prototype.hasOwnProperty.call(item, 'permission'),
                `${item.id} lost its permission tag`,
            );
        }
    });

    it('keeps the admin console free of other portals', () => {
        for (const item of ALL_ITEMS) {
            assert.ok(!item.to.startsWith('/dashboard'), `${item.id} leaks candidate navigation`);
            assert.ok(!item.to.startsWith('/employer'), `${item.id} leaks recruiter navigation`);
            assert.ok(!item.to.startsWith('/org'), `${item.id} leaks organization navigation`);
        }
    });

    it('never targets a legacy alias', () => {
        for (const item of ALL_ITEMS) {
            assert.ok(!item.to.startsWith('/adm/'), `${item.id} targets the /adm alias`);
            assert.ok(!item.to.startsWith('/platform'), `${item.id} targets the /platform alias`);
        }
    });
});

describe('Admin authorization model is preserved (§7)', () => {
    it('keeps RequireTabPerm on the console routes', () => {
        const perms = (ADMIN.match(/<RequireTabPerm/g) || []).length;
        assert.ok(perms >= 15, `expected RequireTabPerm on the console routes, found ${perms}`);
        assert.match(ADMIN, /required="system\.config\.write"/);
        assert.match(ADMIN, /required="users\.read"/);
    });

    it('keeps the role-view banner and the MFA destructive gate', () => {
        assert.match(ADMIN, /Super Admin Role View Mode/);
        assert.match(ADMIN, /MFA/i);
    });

    it('adds no permission or role decision to the Cuba wrapper', () => {
        const code = strip(CUBA_ADMIN);
        // Explicitly conservative: the wrapper must not become a second gate.
        assert.doesNotMatch(code, /permissionsFor|isSuperAdmin|role\s*===|checkIfAdmin|enforceApiPolicy|RequireTabPerm/);
        assert.doesNotMatch(code, /filterByPermissions/);
    });

    it('issues no request from the Cuba wrapper', () => {
        assert.doesNotMatch(strip(CUBA_ADMIN), /fetch\(|axios|apiJson|\/api\//);
    });

    it('keeps the canonical admin route and its aliases untouched', () => {
        assert.match(MAIN, /path="\/admin\/\*" element=\{<RequireAuthenticated user=\{user\}><Admin/);
        assert.match(MAIN, /<Route path="\/adm\/\*" element=\{<RequireAuthenticated user=\{user\}><AdmAliasRedirect \/>/);
        assert.match(MAIN, /<Route path="\/platform\/\*" element=\{<RequireAuthenticated user=\{user\}><PlatformAliasRedirect \/>/);
    });

    it('mounts the existing console unchanged behind the flag', () => {
        assert.match(ADMIN, /const AdminConsoleInner = \(\{ isCubaChrome = false \}\) => \{/);
        assert.match(ADMIN, /<AdminConsoleInner \/>/);
        assert.match(ADMIN, /<AdminPortalCuba>\s*<AdminConsoleInner isCubaChrome \/>\s*<\/AdminPortalCuba>/);
    });
});

/**
 * DIR-011 — chrome de-duplication on the platform admin console.
 *
 * The universal M3 header mounts its own banner, breadcrumbs, navigation rail,
 * command palette and account menu. The legacy console additionally rendered an
 * AdminHeader <header>, a Sidebar rail and a second Ctrl+K palette binding, which
 * produced two banner landmarks and competing owners for the same controls.
 *
 * These assertions pin the contract: the flag reaches the inner console as a prop
 * (single source of truth, so the mounted branch and the rendered chrome cannot
 * disagree), and each duplicated legacy surface is gated rather than merely hidden.
 */
describe('Admin chrome de-duplication (DIR-011)', () => {
    it('receives the chrome flag as a prop instead of re-reading it', () => {
        // A second read of isCubaShellEnabled() inside the inner console would be a
        // second source of truth: the shell could be mounted while the console still
        // believed it was in legacy mode (or the reverse).
        assert.doesNotMatch(
            ADMIN,
            /embedded=\{isCubaShellEnabled\(\)\}/,
            'AdminHeader must be driven by the isCubaChrome prop, not a fresh flag read',
        );
        assert.match(ADMIN, /embedded=\{isCubaChrome\}/);
    });

    it('does not mount the legacy sidebar under Cuba chrome', () => {
        // display:none hides the duplicate but leaves it mounted: a second palette
        // trigger in the DOM and a duplicate 120s health poll still running.
        assert.match(ADMIN, /!isCubaChrome && \(\s*<div className="admin__left">/);
    });

    it('binds the legacy Ctrl+K palette shortcut only in legacy mode', () => {
        // Two palettes answering one keystroke would make the winner depend on
        // mount order; CubaAppShell owns the shortcut when Cuba chrome is active.
        assert.match(
            ADMIN,
            /useEffect\(\(\) => \{\s*if \(isCubaChrome\) return undefined;/,
            'the legacy Ctrl+K listener must be gated on !isCubaChrome',
        );
    });

    it('keeps the admin-only controls the shell has no equivalent for', () => {
        // The shell provides no backend health pill and no Super Admin role-view
        // switcher, so those must survive as a non-landmark group rather than be
        // deleted along with the duplicated chrome.
        assert.match(ADMIN, /role: 'group', 'aria-label': 'Platform admin session controls'/);
        assert.match(ADMIN, /role-switcher-button/);
    });

    it('leaves the legacy chrome fully intact when Cuba is off', () => {
        assert.match(ADMIN, /const Wrapper = embedded \? 'div' : 'header';/);
    });
});

describe('Admin secret protection (§34)', () => {
    it('renders no secret, token or credential in the wrapper', () => {
        const code = strip(CUBA_ADMIN);
        for (const forbidden of [
            /secretKey/i, /clientSecret/i, /privateKey/i, /apiKey/i,
            /serviceAccount/i, /Bearer\s/, /password/i,
        ]) {
            assert.doesNotMatch(code, forbidden, `admin wrapper must not handle ${forbidden}`);
        }
    });

    it('does not log to the console from the wrapper', () => {
        assert.doesNotMatch(strip(CUBA_ADMIN), /console\.(log|warn|error|debug)/);
    });

    it('does not bypass the existing settings masking', () => {
        // The settings components own masking; the design layer must not bypass it.
        assert.doesNotMatch(strip(CUBA_ADMIN), /type="password"/);
    });
});

describe('Admin rollout safety (§49)', () => {
    it('defaults to the existing console chrome', () => {
        assert.match(ADMIN, /React\.useState\(\(\) => isCubaShellEnabled\(\)\)/);
        assert.match(ADMIN, /isCubaShellEnabled\(\)/);
        assert.match(ADMIN, /React\.lazy\(\(\) => import\('\.\/AdminPortalCuba'\)\)/);
    });
});
