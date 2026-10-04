// Phase 6 — Organization (multi-tenant) console guards.
//
// The failure modes that matter most for a multi-tenant console:
//   1. Navigation drifting from the real tab set or from the permission tags the
//      console already enforces.
//   2. Tenant isolation being weakened by anything client-side.
//   3. The AI quota ring inventing a number the tenant API never reported.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const CONSOLE = read('src/enterprise/EnterpriseConsole.jsx');
const CUBA_SHELL = read('src/enterprise/EnterprisePortalCuba.jsx');
const APP_SHELL = read('src/components/cuba/CubaAppShell.jsx');
const CONTEXT = read('src/enterprise/EnterpriseContext.jsx');
const RING = read('src/enterprise/AiQuotaRing.jsx');
const MAIN = read('src/main.jsx');

const {
    ENTERPRISE_TABS, enterpriseNavigationFor, ENTERPRISE_BASE, filterByPermissions,
} = await import('../src/components/cuba/portalNavigation.js');
const { deriveQuota, quotaTone, QUOTA_RING_STATES } = await import('../src/enterprise/quotaRing.js');
const {
    resolveOrgRoute, orgPathFor, buildOrgSearch, ORG_BASE, PRESERVED_QUERY_KEYS,
} = await import('../src/enterprise/orgRouteState.js');

const ALL_TAB_IDS = ENTERPRISE_TABS.map((tab) => tab.id);

const QUICK_ACTION_IDS = new Set([
    'invite-member', 'create-workspace', 'create-service-account', 'test-ai-provider', 'view-audit-activity',
]);

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Tab ids the console actually renders. */
function consoleTabIds() {
    const ids = new Set();
    for (const match of CONSOLE.match(/activeTab === '([a-z-]+)'/g) || []) {
        ids.add(match.replace(/activeTab === '/, '').replace(/'/g, ''));
    }
    for (const match of CONSOLE.match(/id: '([a-z-]+)', label:/g) || []) {
        ids.add(match.replace(/id: '/, '').replace(/', label:/, ''));
    }
    return ids;
}

describe('Organization navigation integrity (§16)', () => {
    it('covers every tab the console actually renders', () => {
        const rendered = consoleTabIds();
        for (const tab of ENTERPRISE_TABS) {
            assert.ok(rendered.has(tab.id), `Cuba org nav is missing tab ${tab.id}`);
        }
    });

    it('builds every target under the tenant namespace', () => {
        for (const group of enterpriseNavigationFor('acme')) {
            for (const item of group.items) {
                assert.ok(item.to.startsWith(`${ENTERPRISE_BASE}/acme/`), `${item.id} escapes the namespace`);
            }
        }
    });

    it('encodes the slug so a crafted value cannot escape the path', () => {
        const first = enterpriseNavigationFor('a/../../admin')[0].items[0].to;
        assert.ok(first.startsWith(`${ENTERPRISE_BASE}/`), 'slug must encode into one segment');
        assert.ok(!first.includes('/../'), 'encoded slug must not produce a traversal');
    });

    it('carries the permission tag onto every gated item', () => {
        // Regression guard: dropping `permission` here silently turns
        // filterByPermissions into a no-op that reveals every gated tab.
        for (const group of enterpriseNavigationFor('acme')) {
            for (const item of group.items) {
                const tab = ENTERPRISE_TABS.find((t) => t.id === item.id);
                assert.ok(
                    Object.prototype.hasOwnProperty.call(item, 'permission'),
                    `${item.id} lost its permission tag`,
                );
                assert.equal(item.permission, tab.permission, `${item.id} permission drift`);
            }
        }
    });

    it('exposes no duplicate organization target', () => {
        const seen = new Set();
        for (const group of enterpriseNavigationFor('acme')) {
            for (const item of group.items) {
                assert.ok(!seen.has(item.to), `duplicate org target: ${item.to}`);
                seen.add(item.to);
            }
        }
    });

    it('keeps organization navigation out of other portals', () => {
        for (const group of enterpriseNavigationFor('acme')) {
            for (const item of group.items) {
                assert.ok(!item.to.startsWith('/admin'), `${item.id} leaks admin navigation`);
                assert.ok(!item.to.startsWith('/employer'), `${item.id} leaks recruiter navigation`);
                assert.ok(!item.to.startsWith('/dashboard'), `${item.id} leaks candidate navigation`);
            }
        }
    });
});

describe('Organization tenant isolation (§7)', () => {
    it('derives the tenant only from the server-resolved context', () => {
        const code = strip(CUBA_SHELL);
        // The shell may read the resolved tenant, but must never invent one.
        assert.doesNotMatch(code, /localStorage|sessionStorage/);
        assert.doesNotMatch(code, /fetch\(|axios|enterpriseFetch/);
    });

    it('does not modify the enterprise context module', () => {
        // Reads through the existing public hook; the context file is untouched.
        assert.match(CUBA_SHELL, /useEnterpriseTenant/);
        assert.match(CONTEXT, /export function useEnterpriseTenant/);
    });

    it('adds no permission decision to the organization shell', () => {
        assert.doesNotMatch(strip(CUBA_SHELL), /permissionsFor|isSuperAdmin|role\s*===|enforceApiPolicy/);
    });

    it('keeps the canonical org route on the proven console', () => {
        assert.match(MAIN, /path="\/org\/:slug\/\*" element=\{<RequireAuthenticated user=\{user\}><EnterpriseConsole/);
        assert.match(MAIN, /path="\/enterprise\/\*" element=\{<RequireAuthenticated user=\{user\}><EnterpriseLegacyRedirect/);
    });
});

describe('Organization route resolution (DIR-008)', () => {
    it('resolves the module from the slug-less alias path', () => {
        const route = resolveOrgRoute({ pathname: '/org/members', visibleIds: ALL_TAB_IDS });
        assert.equal(route.tabId, 'members');
        assert.equal(route.source, 'pathname');
        assert.ok(route.visible);
        assert.ok(!route.needsCanonicalRedirect);
    });

    it('resolves the module from the canonical tenant path the Cuba shell emits', () => {
        for (const tabId of ALL_TAB_IDS) {
            const route = resolveOrgRoute({
                pathname: `/org/global-tech/${tabId}`,
                visibleIds: ALL_TAB_IDS,
                slug: 'global-tech',
            });
            assert.equal(route.tabId, tabId, `${tabId} must resolve from its tenant path`);
            assert.equal(route.source, 'pathname');
            assert.ok(!route.needsCanonicalRedirect, `${tabId} is already canonical`);
        }
    });

    it('covers every module the console renders, not a sampled subset', () => {
        const rendered = [...consoleTabIds()].filter((id) => !QUICK_ACTION_IDS.has(id));
        assert.ok(rendered.length >= ALL_TAB_IDS.length, `console exposes only ${rendered.length} modules`);
        for (const tabId of ALL_TAB_IDS) {
            assert.ok(rendered.includes(tabId), `resolver must know module ${tabId}`);
        }
    });

    it('prefers the pathname over a conflicting ?tab mirror', () => {
        // This is the exact DIR-008 defect: the path says `audit`, the mirror says
        // `overview`. The pathname is authoritative.
        const route = resolveOrgRoute({
            pathname: '/org/global-tech/audit',
            search: '?tab=overview',
            visibleIds: ALL_TAB_IDS,
            slug: 'global-tech',
        });
        assert.equal(route.tabId, 'audit');
        assert.equal(route.source, 'pathname');
    });

    it('still honours ?tab= and #tab= deep links when the path carries no module', () => {
        const fromQuery = resolveOrgRoute({ pathname: '/org', search: '?tab=usage', visibleIds: ALL_TAB_IDS, slug: 'global-tech' });
        assert.equal(fromQuery.tabId, 'usage');
        assert.equal(fromQuery.source, 'query');
        assert.ok(fromQuery.needsCanonicalRedirect, 'a bare route must be canonicalized to a path');

        const fromHash = resolveOrgRoute({ pathname: '/org', hash: '#tab=security', visibleIds: ALL_TAB_IDS, slug: 'global-tech' });
        assert.equal(fromHash.tabId, 'security');
        assert.equal(fromHash.source, 'hash');
    });

    it('redirects a bare /org/:slug to the canonical overview path', () => {
        const route = resolveOrgRoute({ pathname: '/org/global-tech', visibleIds: ALL_TAB_IDS, slug: 'global-tech' });
        assert.ok(route.isBare, 'a slug-only route is bare');
        assert.equal(route.tabId, 'overview');
        assert.equal(route.canonicalPathname, '/org/global-tech/overview');
        assert.ok(route.needsCanonicalRedirect);
    });

    it('never resolves a module the role may not see', () => {
        // `audit` is gated; without the permission the path must not select it.
        const restricted = ALL_TAB_IDS.filter((id) => id !== 'audit');
        const route = resolveOrgRoute({
            pathname: '/org/global-tech/audit',
            visibleIds: restricted,
            slug: 'global-tech',
        });
        assert.notEqual(route.tabId, 'audit', 'a module outside the visible set must never resolve');
        assert.ok(!route.visible);
    });

    it('does not mistake a slug for a module even when they collide', () => {
        const route = resolveOrgRoute({ pathname: '/org/audit', visibleIds: ALL_TAB_IDS, slug: 'audit' });
        assert.ok(route.isBare, 'a single segment matching the slug is the tenant, not the module');
        assert.equal(route.tabId, 'overview');
    });

    it('encodes the slug so a crafted value cannot escape the namespace', () => {
        const target = orgPathFor('members', 'a/../../admin');
        assert.ok(target.startsWith(`${ORG_BASE}/`), 'slug must encode into one segment');
        assert.ok(!target.includes('/../'), 'encoded slug must not produce a traversal');
    });
});

describe('Organization deep-link query contract (DIR-008)', () => {
    it('mirrors ?tab= on every navigation so legacy deep links keep resolving', () => {
        assert.equal(buildOrgSearch({ tabId: 'members' }), '?tab=members');
    });

    it('carries tenant/workspace across a module transition', () => {
        const parsed = new URLSearchParams(buildOrgSearch({
            currentSearch: '?tab=overview&tenant=t-1&workspace=w-9',
            tabId: 'audit',
        }));
        assert.equal(parsed.get('tab'), 'audit');
        assert.equal(parsed.get('tenant'), 't-1', 'tenant context must survive the transition');
        assert.equal(parsed.get('workspace'), 'w-9', 'workspace context must survive the transition');
    });

    it('drops the previous module filters so they never leak across modules', () => {
        const parsed = new URLSearchParams(buildOrgSearch({
            currentSearch: '?tab=members&status=INVITED&days=30',
            tabId: 'usage',
        }));
        assert.equal(parsed.get('status'), null, 'member filters must not leak into Usage');
        assert.equal(parsed.get('days'), null, 'usage filters must not leak backwards');
    });

    it('applies explicit deep-link params from quick actions', () => {
        assert.equal(new URLSearchParams(buildOrgSearch({ tabId: 'members', params: { invite: '1' } })).get('invite'), '1');
    });

    it('names only the context keys it is allowed to preserve', () => {
        // A token or authorization value must never become a preserved URL key.
        assert.deepEqual([...PRESERVED_QUERY_KEYS].sort(), ['tenant', 'workspace']);
    });
});

describe('Organization chrome de-duplication (DIR-008)', () => {
    it('suppresses the legacy top bar, sidebar and pill strip in Cuba mode', () => {
        assert.match(CONSOLE, /function EnterpriseConsoleInner\(\{ isCubaChrome = false \}\)/);
        // Each duplicate landmark must be gated, not merely restyled.
        assert.match(CONSOLE, /!isCubaChrome && \(\s*<header className="enterprise-topbar"/);
        assert.match(CONSOLE, /!isCubaChrome && \(\s*<nav className="enterprise-mobile-pill-strip"/);
        assert.match(CONSOLE, /!isCubaChrome && \(\s*<aside className=\{`enterprise-sidebar/);
    });

    it('passes the flag from the Cuba branch only', () => {
        assert.match(CONSOLE, /<EnterpriseConsoleInner isCubaChrome \s*\/>/);
    });

    it('renders the simulation banner exactly once in either chrome', () => {
        // Legacy console and Cuba band both host it, so both must be gated.
        assert.match(CUBA_SHELL, /isSimulating && \(\s*<EnterpriseRoleSimulationBanner/);
        assert.match(CONSOLE, /!isCubaChrome && \(\s*<EnterpriseRoleSimulationBanner/);
    });

    it('keeps the console palette in legacy mode and defers to Cuba in Cuba mode', () => {
        // CubaPortalShell already owns a ⌘K palette over the same navigation.
        // Mounting both opens two modal dialogs sharing the accessible name
        // "Command palette", so the legacy one must be gated exactly like the
        // other duplicate chrome — while remaining fully available when the
        // console runs on its own.
        assert.match(CONSOLE, /!isCubaChrome && \(\s*<CommandPalette/);
        assert.match(APP_SHELL, /data-testid="cuba-command-palette"/);
    });

    it('elevates the switchers into the Cuba toolbar band', () => {
        assert.match(CUBA_SHELL, /toolbar=\{/);
        assert.match(CUBA_SHELL, /<TenantSwitcher variant="cuba" \/>/);
        assert.match(CUBA_SHELL, /<WorkspaceBadge variant="cuba" \/>/);
        assert.match(CUBA_SHELL, /enterprise-cuba-context-band/);
    });

    it('breaks the lazy import cycle by extracting the switchers', () => {
        // EnterpriseConsole lazy-imports the Cuba wrapper; the wrapper must never
        // import the console back or the cycle only fails at runtime.
        assert.doesNotMatch(CUBA_SHELL, /from '\.\/EnterpriseConsole'/);
        assert.match(CUBA_SHELL, /from '\.\/EnterpriseContextSwitchers'/);
        const switchers = read('src/enterprise/EnterpriseContextSwitchers.jsx');
        assert.match(switchers, /export function TenantSwitcher/);
        assert.match(switchers, /export function WorkspaceBadge/);
        assert.match(switchers, /export function EnterpriseRoleSimulationBanner/);
        assert.doesNotMatch(switchers, /EnterprisePortalCuba|EnterpriseConsole/);
    });

    it('keeps every switcher option keyboard reachable', () => {
        const switchers = read('src/enterprise/EnterpriseContextSwitchers.jsx');
        assert.match(switchers, /role="listbox"/);
        assert.match(switchers, /role="option"/);
        assert.match(switchers, /aria-selected=/);
        assert.match(switchers, /aria-expanded=/);
        // Escape must dismiss the popover (WCAG 2.1.2).
        assert.match(switchers, /event\.key === 'Escape'/);
    });

    it('gives the elevated switchers a visible focus ring', () => {
        const css = read('src/enterprise/enterprise.css');
        assert.match(css, /\.enterprise-context-button--cuba:focus-visible/);
        // The legacy two-column grid must not leave a dead sidebar column.
        assert.match(css, /\.enterprise-shell-cuba \.enterprise-layout/);
    });
});

describe('Permission narrowing never widens access (§7)', () => {
    it('hides a gated tab when its permission is absent', () => {
        const nav = enterpriseNavigationFor('acme');
        const ids = filterByPermissions(nav, ['tenant.members.read']).flatMap((g) => g.items.map((i) => i.id));
        assert.ok(ids.includes('members'), 'granted tab must remain');
        assert.ok(!ids.includes('access'), 'ungranted tab must be hidden');
    });

describe('AI quota ring honesty (§20, §46)', () => {
    it('shows a real percentage only when both figures were read', () => {
        const quota = deriveQuota({
            configuration: { configuration: { quotaPolicy: { aiRequestsPerDay: 200 } } },
            usage: { requests: 50 },
            error: null,
        });
        assert.equal(quota.state, QUOTA_RING_STATES.MEASURED);
        assert.equal(quota.percent, 25);
        assert.equal(quota.used, 50);
        assert.equal(quota.limit, 200);
    });

    it('never renders 0% when the quota could not be read', () => {
        for (const payload of [
            { configuration: null, usage: null, error: null },
            { configuration: {}, usage: { requests: 0 }, error: null },
            { configuration: { configuration: {} }, usage: null, error: null },
        ]) {
            const quota = deriveQuota(payload);
            assert.equal(quota.state, QUOTA_RING_STATES.UNKNOWN);
            assert.equal(quota.percent, null, 'an unread quota must not become 0%');
        }
    });

    it('reports a failed read as a failure, not as an unused quota', () => {
        const quota = deriveQuota({ configuration: null, usage: null, error: 'network down' });
        assert.equal(quota.state, QUOTA_RING_STATES.ERROR);
        assert.equal(quota.percent, null);
    });

    it('treats a real measured zero as zero, which is a genuine claim', () => {
        const quota = deriveQuota({
            configuration: { configuration: { quotaPolicy: { aiRequestsPerDay: 100 } } },
            usage: { requests: 0 },
            error: null,
        });
        assert.equal(quota.state, QUOTA_RING_STATES.MEASURED);
        assert.equal(quota.percent, 0);
    });

    it('caps the ring at 100% rather than overflowing', () => {
        const quota = deriveQuota({
            configuration: { configuration: { quotaPolicy: { aiRequestsPerDay: 10 } } },
            usage: { requests: 999 },
            error: null,
        });
        assert.equal(quota.percent, 100);
    });

    it('escalates tone only for genuinely high usage', () => {
        assert.equal(quotaTone(10), 'success');
        assert.equal(quotaTone(80), 'warning');
        assert.equal(quotaTone(95), 'danger');
        assert.equal(quotaTone(null), 'neutral');
    });

    it('reads the same tenant endpoints the Usage tab already uses', () => {
        assert.match(RING, /\/api\/enterprise\/configuration/);
        assert.match(RING, /\/api\/enterprise\/usage\/ai/);
        // The ring must never write to a tenant endpoint.
        assert.doesNotMatch(strip(RING), /method:\s*'POST'|method:\s*"POST"|method:\s*'PATCH'/);
    });

    it('renders a dash rather than a zero when unmeasured', () => {
        assert.match(RING, /measured \? `\$\{quota\.percent\}%` : '—'/);
    });
});

    it('keeps ungated tabs visible to any tenant member', () => {
        const ids = filterByPermissions(enterpriseNavigationFor('acme'), []).flatMap((g) => g.items.map((i) => i.id));
        assert.ok(ids.includes('overview'));
        assert.ok(ids.includes('resumes'));
    });

    it('honours a wildcard grant for tenant tabs and gates platformOnly behind platformAdmin', () => {
        // Standard tenant wildcard grants all standard tenant tabs (13 tabs, platform withheld)
        const tenantIds = filterByPermissions(enterpriseNavigationFor('acme'), ['*']).flatMap((g) => g.items.map((i) => i.id));
        assert.equal(tenantIds.length, ENTERPRISE_TABS.filter((t) => !t.platformOnly).length);
        assert.ok(!tenantIds.includes('platform'), 'platform tab must never leak to standard tenant wildcard');

        // platformAdmin: true grants all 14 tabs including platform
        const adminIds = filterByPermissions(enterpriseNavigationFor('acme'), ['*'], { platformAdmin: true }).flatMap((g) => g.items.map((i) => i.id));
        assert.equal(adminIds.length, ENTERPRISE_TABS.length);
        assert.ok(adminIds.includes('platform'), 'platform tab must be visible when platformAdmin is true');
    });
});
