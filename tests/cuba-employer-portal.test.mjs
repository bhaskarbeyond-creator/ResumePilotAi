// Phase 5 — Recruiter / employer console guards.
//
// The two risks this suite exists to prevent:
//   1. The Cuba recruiter chrome pointing at a route that does not exist, or
//      silently drifting from the sidebar that already passed its own tests.
//   2. The recruiter shell widening access, or leaking candidate/admin surface
//      into a portal that must stay role-isolated.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const EMPLOYER_PORTAL = read('src/components/EmployerPortal/EmployerPortal.jsx');
const EMPLOYER_SIDEBAR = read('src/components/EmployerPortal/EmployerSidebar.jsx');
const CUBA_EMPLOYER = read('src/components/EmployerPortal/EmployerPortalCuba.jsx');
const PORTAL_SHELL = read('src/components/cuba/CubaPortalShell.jsx');
const MAIN = read('src/main.jsx');

const { EMPLOYER_PORTAL_NAVIGATION } = await import('../src/components/cuba/portalNavigation.js');
const { buildPortalCommands } = await import('../src/components/cuba/portalCommands.js');

const ALL_ITEMS = EMPLOYER_PORTAL_NAVIGATION.flatMap((g) => g.items);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Routes the recruiter portal actually mounts, read from its real route table. */
function mountedEmployerRoutes() {
    const routes = new Set();
    for (const match of EMPLOYER_PORTAL.match(/<Route path="([^"]*)"/g) || []) {
        const raw = match.replace(/<Route path="/, '').replace(/"/g, '');
        routes.add(raw === '' ? '/employer' : `/employer/${raw}`);
    }
    return [...routes];
}

describe('Employer navigation integrity (§16, zero dead links)', () => {
    const routes = mountedEmployerRoutes();

    it('resolves every Cuba recruiter target to a mounted recruiter route', () => {
        for (const item of ALL_ITEMS) {
            const reachable = routes.some((r) => r === item.to || `${r}/` === item.to || `${r}/`.startsWith(`${item.to}/`));
            assert.ok(reachable, `"${item.label}" points at ${item.to}, which the portal does not mount`);
        }
    });

    it('mirrors the existing sidebar targets exactly (no drift)', () => {
        // The legacy sidebar is authoritative; the two shells must not disagree.
        const sidebarPaths = (EMPLOYER_SIDEBAR.match(/path: '(\/employer[^']*)'/g) || [])
            .map((m) => m.replace(/path: '/, '').replace(/'/g, ''));
        const cubaPaths = ALL_ITEMS.map((i) => i.to);
        for (const p of new Set(sidebarPaths)) {
            assert.ok(cubaPaths.includes(p), `Cuba recruiter nav is missing ${p}`);
        }
        for (const p of new Set(cubaPaths)) {
            assert.ok(sidebarPaths.includes(p), `Cuba recruiter nav adds unknown target ${p}`);
        }
    });

    it('keeps the recruiter console free of candidate and admin surface', () => {
        for (const item of ALL_ITEMS) {
            assert.ok(!item.to.startsWith('/dashboard'), `${item.id} leaks candidate navigation`);
            assert.ok(!item.to.startsWith('/admin'), `${item.id} leaks admin navigation`);
            assert.ok(!item.to.startsWith('/org'), `${item.id} leaks enterprise navigation`);
            assert.ok(!item.to.startsWith('/build-resume'), `${item.id} leaks the resume builder`);
        }
    });

    it('exposes no duplicate recruiter navigation target', () => {
        const seen = new Set();
        for (const item of ALL_ITEMS) {
            assert.ok(!seen.has(item.to), `duplicate recruiter target: ${item.to}`);
            seen.add(item.to);
        }
    });

    it('generates palette commands from the recruiter navigation itself', () => {
        const commands = buildPortalCommands(EMPLOYER_PORTAL_NAVIGATION, 'Job Postings');
        assert.equal(commands.length, ALL_ITEMS.length);
        assert.ok(commands.every((c) => ALL_ITEMS.some((i) => i.to === c.to)));
        assert.equal(commands.find((c) => c.label === 'Job Postings').isActive, true);
    });
});

describe('Recruiter shell preserves existing capability (§47)', () => {
    it('mounts every recruiter route the existing portal mounts', () => {
        for (const p of ['jobs', 'applicants', 'company', 'messages', 'settings']) {
            assert.match(CUBA_EMPLOYER, new RegExp(`path="${p}"`), `Cuba recruiter shell lost ${p}`);
        }
        assert.match(CUBA_EMPLOYER, /<Route index element=\{<EmployerOverview/);
        // Unknown sub-routes must still fall back to the overview.
        assert.match(CUBA_EMPLOYER, /path="\*" element=\{<Navigate to="\/employer" replace \/>/);
    });

    it('keeps the showToast contract for every child route', () => {
        const children = CUBA_EMPLOYER.match(/showToast=\{showToast\}/g) || [];
        assert.ok(children.length >= 6, `expected showToast on every child, found ${children.length}`);
        assert.match(CUBA_EMPLOYER, /const showToast = useCallback/);
        assert.match(CUBA_EMPLOYER, /isShowed: false/);
        assert.match(CUBA_EMPLOYER, /<DashboardToast/);
    });

    it('reuses the existing recruiter child components rather than reimplementing them', () => {
        for (const child of [
            'EmployerOverview', 'EmployerJobPostings', 'EmployerApplicantPipeline',
            'EmployerCompanyProfile', 'EmployerHiringPreferences', 'EmployerCandidateMessages',
        ]) {
            assert.match(CUBA_EMPLOYER, new RegExp(`import\\('\\./${child}'\\)`), `must reuse ${child}`);
        }
    });

    it('leaves the default employer route on the proven portal', () => {
        // main.jsx keeps mounting the proven shell; the flag selects at runtime.
        assert.match(MAIN, /path="\/employer\/\*" element=\{<RequireAuthenticated user=\{user\}><EmployerPortal/);
    });
});

describe('Recruiter role isolation and security (§7, §16)', () => {
    it('adds no authorization logic to the shell wrapper', () => {
        for (const source of [CUBA_EMPLOYER, PORTAL_SHELL]) {
            const code = stripComments(source);
            assert.doesNotMatch(code, /permissionsFor|isSuperAdmin|role\s*===|checkIfAdmin|enforceApiPolicy/);
        }
    });

    it('issues no recruiter data request from the shell wrapper', () => {
        // Data belongs to the children, which already use the platform API client.
        const code = stripComments(CUBA_EMPLOYER);
        assert.doesNotMatch(code, /axios\.|fetch\(['"]\/api\/employer/);
    });

    it('ships the recruiter shell as its own lazy chunk', () => {
        assert.match(CUBA_EMPLOYER, /lazy\(\(\) => import\('\.\/[A-Za-z]+'\)\)/);
        assert.match(CUBA_EMPLOYER, /<Suspense/);
    });
});
