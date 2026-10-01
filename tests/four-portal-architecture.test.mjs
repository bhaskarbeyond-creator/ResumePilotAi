// IME365 four-portal architecture guard.
// Canonical routing, no duplicate implementations, one-way redirects, and
// recruiter/candidate navigation separation.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const S = {
    main: read('src/main.jsx'),
    adminSidebar: read('src/components/admin/sidebar/sidebar.jsx'),
    admin: read('src/components/admin/Admin.jsx'),
    profile: read('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx'),
    dashboardMain: read('src/components/Dashboard/DashboardMain/DashboardMain.jsx'),
    seo: read('src/components/RouteSeo.jsx'),
    portal: read('src/components/EmployerPortal/EmployerPortal.jsx'),
    empSidebar: read('src/components/EmployerPortal/EmployerSidebar.jsx'),
    onboarding: read('src/components/EmployerPortal/EmployerOnboarding.jsx'),
    states: read('src/components/EmployerPortal/EmployerStates.jsx'),
    switcher: read('src/components/common/ContextSwitcher.jsx'),
    enterprise: read('src/enterprise/EnterpriseConsole.jsx'),
};

const ADMIN_PATHS = [
    '/admin/dashboard', '/admin/tenants', '/admin/audit-logs', '/admin/security',
    '/admin/queues', '/admin/operations', '/admin/attention', '/admin/health',
    '/admin/users', '/admin/operators', '/admin/employer-applications',
    '/admin/jobs-manager', '/admin/company-management', '/admin/blog-management',
    '/admin/landing-pages', '/admin/reviews', '/admin/trustedby',
    '/admin/messages', '/admin/help-desk', '/admin/phrases',
];

const CANDIDATE_PATHS = [
    '/dashboard', '/build-resume', '/dashboard/cover-letters', '/dashboard/portfolios',
    '/dashboard/jobs', '/dashboard/job-tracker', '/dashboard/applied-jobs',
    '/dashboard/interview', '/dashboard/messages', '/dashboard/support',
    '/dashboard/settings', '/dashboard/plans',
];

const EMPLOYER_NAV = [
    ['Recruiter Overview', '/employer'],
    ['Job Postings', '/employer/jobs'],
    ['Applicant ATS Pipeline', '/employer/applicants'],
    ['Candidate Messages', '/employer/messages'],
    ['Company Profile', '/employer/company'],
    ['Hiring Preferences', '/employer/settings'],
];


describe('IME365 four-portal architecture', () => {
    it('mounts every portal at its canonical namespace', () => {
        assert.match(S.main, /<Route path="\/dashboard\/\*" element=\{<RequireAuthenticated user=\{user\}><Dashboard/);
        assert.match(S.main, /<Route path="\/employer\/\*" element=\{<RequireAuthenticated user=\{user\}><EmployerPortal/);
        assert.match(S.main, /<Route path="\/org\/:slug\/\*"/);
        assert.match(S.main, /<Route path="\/org\/\*"/);
        assert.match(S.main, /<Route path="\/admin\/\*" element=\{<RequireAuthenticated user=\{user\}><Admin/);
    });

    it('defines exactly one canonical implementation per namespace', () => {
        const count = (re) => (S.main.match(re) || []).length;
        assert.equal(count(/<Route path="\/admin\/\*"/g), 1, 'one /admin/* route');
        assert.equal(count(/<Route path="\/adm\/\*"/g), 1, 'one /adm/* alias');
        assert.equal(count(/<Route path="\/platform\/\*"/g), 1, 'one /platform/* alias');
        assert.equal(count(/<Route path="\/employer\/\*"/g), 1, 'one /employer/* route');
        assert.equal(count(/<Route path="\/dashboard\/\*"/g), 1, 'one /dashboard/* route');
        assert.equal(count(/<Route path="\/enterprise/g), 1, 'one /enterprise alias');
    });

    it('never mounts a portal component at a legacy alias', () => {
        assert.match(S.main, /<Route path="\/adm\/\*" element=\{<RequireAuthenticated user=\{user\}><AdmAliasRedirect \/>/);
        assert.match(S.main, /<Route path="\/platform\/\*" element=\{<RequireAuthenticated user=\{user\}><PlatformAliasRedirect \/>/);
        assert.doesNotMatch(S.main, /<Route path="\/adm\/\*" element=\{<RequireAuthenticated user=\{user\}><Admin/);
        assert.doesNotMatch(S.main, /<Route path="\/platform\/\*" element=\{<RequireAuthenticated user=\{user\}><Admin/);
    });

    it('keeps every legacy alias behind the session guard', () => {
        // An unauthenticated visitor must reach login, never a redirect that
        // reveals whether a private console or workspace path exists.
        for (const alias of ['/adm/*', '/platform/*', '/dashboard2/*', '/enterprise/*']) {
            const escaped = alias.replace(/[/*]/g, (m) => `\\${m}`);
            assert.match(S.main, new RegExp(`${escaped}[^\\n]+RequireAuthenticated`),
                `${alias} must stay session-guarded`);
        }
    });

    it('redirects every legacy prefix to its canonical namespace', () => {
        assert.match(S.main, /function AdmAliasRedirect[\s\S]*?replace\(\/\^\\\/adm\/, ''\)[\s\S]*?`\/admin\$\{suffix\}/);
        assert.match(S.main, /function PlatformAliasRedirect[\s\S]*?replace\(\/\^\\\/platform\/, ''\)[\s\S]*?`\/admin\$\{suffix\}/);
        assert.match(S.main, /function EnterpriseLegacyRedirect[\s\S]*?replace\(\/\^\\\/enterprise\/, ''\)[\s\S]*?`\/org\$\{suffix\}/);
        assert.match(S.main, /function Dashboard2Redirect[\s\S]*?replace\(\/\^\\\/dashboard2\/, ''\)[\s\S]*?`\/dashboard\$\{suffix\}/);
    });

    it('preserves query strings and hash fragments on every redirect', () => {
        const redirects = S.main.match(/<Navigate to=\{`[^`]*\$\{location\.search\}\$\{location\.hash\}`\} replace \/>/g) || [];
        assert.ok(redirects.length >= 4, `expected >=4 query/hash-preserving redirects, found ${redirects.length}`);
    });

    it('never redirects a canonical namespace back to its legacy alias', () => {
        assert.doesNotMatch(S.main, /function AdmAliasRedirect[\s\S]{0,400}?`\/adm\$\{suffix\}/);
        assert.doesNotMatch(S.main, /function PlatformAliasRedirect[\s\S]{0,400}?`\/platform\$\{suffix\}/);
        assert.doesNotMatch(S.main, /function EnterpriseLegacyRedirect[\s\S]{0,400}?`\/enterprise\$\{suffix\}/);
        assert.doesNotMatch(S.main, /function Dashboard2Redirect[\s\S]{0,400}?`\/dashboard2\$\{suffix\}/);
        assert.doesNotMatch(S.main, /<Navigate to=["`]\/adm/);
        assert.doesNotMatch(S.main, /<Navigate to=["`]\/dashboard2/);
        assert.doesNotMatch(S.main, /<Navigate to=["`]\/enterprise/);
    });

    it('redirects legacy candidate recruiter URLs to the employer portal', () => {
        assert.match(S.dashboardMain, /path="my-employments"[\s\S]{0,300}?<Navigate\s+to="\/employer\/jobs"\s+replace/);
        assert.match(S.dashboardMain, /path="my-companies"[\s\S]{0,300}?<Navigate\s+to="\/employer\/company"\s+replace/);
        assert.doesNotMatch(S.dashboardMain, /path="my-employments"[\s\S]{0,300}?<EmployerDashboard/);
        assert.doesNotMatch(S.dashboardMain, /path="my-companies"[\s\S]{0,300}?<CompaniesManagement/);
    });


    it('keys admin sidebar permission gating on /admin paths', () => {
        for (const p of ADMIN_PATHS) {
            assert.ok(S.adminSidebar.includes(`'${p}'`), `PATH_PERMS must key on ${p}`);
        }
        assert.doesNotMatch(S.adminSidebar, /'\/adm\//, 'no legacy /adm/ keys in PATH_PERMS');
    });

    it('redirects denied admin tabs to the canonical first-accessible tab', () => {
        assert.match(S.admin, /<Navigate to=\{`\/admin\/\$\{FIRST_ACCESSIBLE_TAB\}`\} replace \/>/);
        assert.doesNotMatch(S.admin, /`\/adm\/\$\{FIRST_ACCESSIBLE_TAB\}`/);
    });

    it('preserves the existing admin RBAC permission model', () => {
        for (const perm of ['users.read', 'tenants.read', 'audit.read', 'security.read', 'tickets.manage', 'system.config.write']) {
            assert.ok(S.admin.includes(perm), `RequireTabPerm must keep ${perm}`);
        }
    });

    it('removes recruiter links from the candidate sidebar', () => {
        assert.doesNotMatch(S.profile, /to="\/dashboard\/my-employments"/);
        assert.doesNotMatch(S.profile, /to="\/dashboard\/my-companies"/);
        assert.doesNotMatch(S.profile, /My Posted Jobs/);
        assert.doesNotMatch(S.profile, /My Companies/);
    });

    it('keeps the canonical candidate navigation taxonomy', () => {
        for (const p of CANDIDATE_PATHS) {
            assert.ok(S.profile.includes(`to="${p}"`), `candidate sidebar must link ${p}`);
        }
    });

    it('routes the resume entry to the builder with no duplicate Overview', () => {
        assert.ok(S.profile.includes('to="/build-resume"'), 'Resumes & Master CV must target the builder');
        const desktopOverview = S.profile.match(/<Link to="\/dashboard" onClick=\{closeMobileSidebar\}>/g) || [];
        assert.equal(desktopOverview.length, 1, 'exactly one desktop Overview entry');
    });


    it('defines the full recruiter taxonomy in the employer sidebar', () => {
        for (const [label, p] of EMPLOYER_NAV) {
            assert.ok(S.empSidebar.includes(label), `missing label "${label}"`);
            assert.ok(S.empSidebar.includes(`path: '${p}'`), `missing path ${p}`);
        }
        for (const g of ['HIRING COMMAND', 'REQUISITIONS & APPLICANTS', 'BRAND & SETTINGS']) {
            assert.ok(S.empSidebar.includes(g), `missing group ${g}`);
        }
    });

    it('mounts a route for every employer navigation target', () => {
        for (const p of ['jobs', 'applicants', 'company', 'messages', 'settings']) {
            assert.ok(S.portal.includes(`<Route path="${p}"`), `missing /employer/${p} route`);
        }
        assert.ok(S.portal.includes('<Route index element={<EmployerOverview'), 'missing /employer index route');
    });

    it('keeps candidate-only and admin entries out of the employer portal', () => {
        for (const forbidden of ['/build-resume', '/coverletter', '/portfolio/builder', '/admin/', '/adm/']) {
            assert.ok(!S.empSidebar.includes(forbidden), `employer sidebar must not link ${forbidden}`);
        }
    });

    it('provides a real showToast function to every employer child', () => {
        assert.ok(S.portal.includes('const showToast = useCallback('), 'showToast must be a useCallback');
        assert.match(S.portal, /isShowed: false,[\s\S]*?type: '',[\s\S]*?title: '',[\s\S]*?text: '',/);
        // Only route elements (self-closing <EmployerX ... />) are children that
        // receive showToast; <EmployerSidebar ... /> is chrome, not a child.
        const routes = S.portal.match(/<Employer(Overview|JobPostings|ApplicantPipeline|CompanyProfile|CandidateMessages|HiringPreferences)[^>]*\/>/g) || [];
        assert.equal(routes.length, 6, `expected 6 employer child routes, found ${routes.length}`);
        routes.forEach((r) => assert.ok(r.includes('showToast={showToast}'), `route missing showToast: ${r}`));
        assert.ok(S.portal.includes('<DashboardToast'), 'toast must render at the portal root');
    });

    it('renders the first-time recruiter onboarding experience', () => {
        assert.match(S.onboarding, /Welcome to IME365 Hiring/);
        assert.match(S.onboarding, /Register Company Profile/);
        assert.match(S.onboarding, /Register Company &amp; Post First Job/);
        assert.match(S.onboarding, /<AddCompanyModal/, 'onboarding must reuse the existing company modal');
    });

    it('exposes explicit loading, empty, and error states', () => {
        assert.ok(S.states.includes('EmployerLoading'), 'loading state required');
        assert.ok(S.states.includes('EmployerEmptyState'), 'empty state required');
        assert.ok(S.states.includes('EmployerErrorState'), 'error state required');
    });


    it('persists the active portal under the required key', () => {
        assert.match(S.switcher, /ACTIVE_PORTAL_STORAGE_KEY = 'ime365_active_portal'/);
        assert.match(S.switcher, /localStorage\.setItem\(ACTIVE_PORTAL_STORAGE_KEY, portal\)/);
    });

    it('never lets stored context override server authorization', () => {
        assert.match(S.switcher, /getIdTokenResult\(\)/);
        assert.match(S.switcher, /checkIfAdmin\(user\.uid\)/);
        assert.match(S.switcher, /\/api\/enterprise\/status/);
        assert.match(S.switcher, /isKnownPortal/, 'invalid stored portals must be rejected');
        assert.match(S.switcher, /allowed\.includes\(activePortal\)/, 'stored portal must be validated');
    });

    it('offers the admin portal only for real platform roles', () => {
        assert.match(S.switcher, /availability\.isAdmin\) portals\.push\(PORTALS\.ADMIN\)/);
        assert.match(S.switcher, /\['ADMIN', 'SUPER_ADMIN'\]\.includes\(role\)/);
    });

    it('embeds one shared context switcher in every portal', () => {
        for (const [name, src] of [
            ['ProfileDisplay', S.profile], ['EmployerSidebar', S.empSidebar],
            ['Admin', S.admin], ['EnterpriseConsole', S.enterprise],
        ]) {
            assert.ok(src.includes('ContextSwitcher'), `${name} must embed the shared ContextSwitcher`);
        }
        assert.doesNotMatch(S.enterprise, /SWITCH APPLICATION/, 'bespoke enterprise switcher must be replaced');
    });

    it('supports keyboard dismissal and focus restoration in the switcher', () => {
        assert.match(S.switcher, /event\.key === 'Escape'/);
        assert.match(S.switcher, /buttonRef\.current\?\.focus\(\)/);
    });

    it('classifies every portal namespace as private in RouteSeo', () => {
        for (const prefix of ['/dashboard', '/employer', '/org', '/admin', '/enterprise']) {
            assert.ok(S.seo.includes(`'${prefix}'`), `RouteSeo must classify ${prefix}`);
        }
    });

    it('removes obsolete dashboard2 SEO metadata', () => {
        assert.doesNotMatch(S.seo, /\/dashboard2/);
    });

    it('provides titles and descriptions for the new portals', () => {
        assert.match(S.seo, /Recruiter & Hiring Portal/);
        assert.match(S.seo, /Organization Workspace/);
        assert.match(S.seo, /Admin Console/);
    });

    it('exposes no duplicate navigation entry within a portal', () => {
        const emp = [...S.empSidebar.matchAll(/path: '(\/employer[^']*)'/g)].map((m) => m[1]);
        assert.equal(new Set(emp).size, emp.length, 'duplicate employer nav path');
        // Match nav item definitions specifically. Matching every '/admin/...'
        // string would also count PATH_PERMS keys and active-state comparisons,
        // which legitimately reference the same path more than once.
        const adm = [...S.adminSidebar.matchAll(/path: '(\/admin[^']*)'/g)].map((m) => m[1]);
        const uniqueAdm = new Set(adm);
        assert.equal(uniqueAdm.size, adm.length,
            `duplicate admin nav path: ${adm.filter((p, i) => adm.indexOf(p) !== i).join(', ')}`);
        assert.equal(uniqueAdm.size, ADMIN_PATHS.length,
            `admin nav must expose exactly the ${ADMIN_PATHS.length} canonical paths, found ${uniqueAdm.size}`);
    });

    it('points no navigation item at a removed or redirected route', () => {
        for (const src of [S.profile, S.empSidebar, S.adminSidebar, S.admin]) {
            assert.doesNotMatch(src, /to="\/dashboard2/, 'nav must not target /dashboard2');
            // Boundary-aware: /adm must not match the canonical /admin namespace.
            assert.doesNotMatch(src, /to="\/adm(?!in)/, 'nav must not target the /adm alias');
            assert.doesNotMatch(src, /to="\/platform\//, 'nav must not target the /platform alias');
            assert.doesNotMatch(src, /to="\/enterprise(?!-)/, 'nav must not target the /enterprise alias');
        }
    });
});
