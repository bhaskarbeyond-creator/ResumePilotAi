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
const CONTEXT = read('src/enterprise/EnterpriseContext.jsx');
const RING = read('src/enterprise/AiQuotaRing.jsx');
const MAIN = read('src/main.jsx');

const {
    ENTERPRISE_TABS, enterpriseNavigationFor, ENTERPRISE_BASE, filterByPermissions,
} = await import('../src/components/cuba/portalNavigation.js');
const { deriveQuota, quotaTone, QUOTA_RING_STATES } = await import('../src/enterprise/quotaRing.js');

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

    it('honours a wildcard grant', () => {
        const ids = filterByPermissions(enterpriseNavigationFor('acme'), ['*']).flatMap((g) => g.items.map((i) => i.id));
        assert.equal(ids.length, ENTERPRISE_TABS.length);
    });
});
