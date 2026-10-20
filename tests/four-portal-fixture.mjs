// Shared API fixture for the IME365 four-portal browser suites.
//
// Serves the authoritative response shapes for the recruiter workspace
// (/api/employer/*), the organization workspace (/api/enterprise/*), and the
// identity reads the shells and the context switcher depend on. Real data only:
// the screens must render what the backend actually returns, never a fabricated
// success state.
import { createEnterpriseFixtureBackend } from './helpers/enterprise-fixture.mjs';

const json = (route, body, status = 200) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
});

/**
 * Route every real API call, and nothing else.
 *
 * A naive '**\/api\/**' glob also matches Vite's own module URLs such as
 * /src/services/api/platform.js, which makes the fixture 404 the app's own
 * source files so the shell never mounts. Only pathnames beginning with /api/
 * are API traffic; everything else must fall through to Vite.
 */
export function installApiFixture(page, state) {
    const enterprise = createEnterpriseFixtureBackend(state);
    const jobs = state.jobs || [];
    const companies = state.companies || [];
    const applications = state.applications || {};

    page.route('**/*', async (route) => {
        const { pathname } = new URL(route.request().url());

        if (!pathname.startsWith('/api/')) return route.fallback();

        // Recruiter workspace (owner-scoped on the server; the bearer token is
        // the only identity input, so the fixture sends no user id).
        if (pathname === '/api/employer/jobs') return json(route, { jobs });
        if (pathname === '/api/employer/companies') return json(route, { companies });

        // Organization workspace.
        if (pathname === '/api/enterprise/status') return json(route, { enabled: true });
        if (pathname === '/api/enterprise/context') {
            return json(route, {
                tenant: state.tenant ? { ...state.tenant, slug: state.tenant.slug || 'acme' } : null,
                workspace: state.workspaces?.[0] || null,
                context: null,
                platformAdmin: false,
            });
        }
        if (pathname === '/api/enterprise/tenants') {
            return json(route, { tenants: state.tenant ? [state.tenant] : [] });
        }
        if (pathname === '/api/enterprise/workspaces') {
            return json(route, { workspaces: state.workspaces || [] });
        }

        // Per-job applicant pipeline.
        const appMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/applications$/);
        if (appMatch) return json(route, { applications: applications[appMatch[1]] || [] });

        // Identity / profile reads.
        // `state.isAdmin` models a platform-operator session. checkIfAdmin reads
        // the Firebase ID token claims, so the claim must be minted accordingly
        // by installAuthenticatedSession (see the session options below).
        if (pathname.startsWith('/api/users-data/')) {
            return json(route, {
                id: 'browser-owner',
                firstname: 'Robin',
                lastname: 'Recruiter',
                membership: 'Pro',
                role: state.isAdmin ? 'SUPER_ADMIN' : 'USER',
                isEmployer: true,
                employerApproved: true,
                profile: {},
            });
        }
        if (pathname === '/api/check-if-admin' || pathname.endsWith('/check-admin')) {
            return json(route, { isAdmin: false, success: true });
        }

        // Candidate workspace reads. The enterprise contract does not model
        // these, so they are answered here to keep the candidate shell on its
        // normal data path instead of degrading through a wall of 404s.
        if (pathname === '/api/service-availability') {
            return json(route, { services: {}, generatedAt: new Date().toISOString() });
        }
        if (pathname === '/api/resumes' || pathname.startsWith('/api/resumes/')) {
            return json(route, { success: true, resumes: [], allResumes: [], pagination: { totalItems: 0, totalPages: 1, currentPage: 1, hasNextPage: false, hasPreviousPage: false } });
        }
        if (pathname === '/api/favourites' || pathname === '/api/job-favourites') {
            return json(route, { favourites: [], jobs: [] });
        }
        if (pathname === '/api/messages/conversations') {
            return json(route, { conversations: [] });
        }
        if (pathname === '/api/notifications-data' || pathname.startsWith('/api/notifications-data/')) {
            return json(route, { notifications: [], unreadCount: 0 });
        }
        if (pathname === '/api/system-settings' || pathname === '/api/public/system-settings') {
            return json(route, {
                success: true,
                _settingsSource: 'remote',
                modules: {
                    enableMessagesModule: true,
                    enableAtsScoreModule: true,
                    enablePortfolioModule: true,
                    ...(state.modules || {}),
                },
            });
        }

        if (pathname === '/api/platform/public-config') {
            return json(route, {
                _settingsSource: 'mariadb',
                systemHealth: { maintenanceMode: false },
                modules: {
                    enableMessagesModule: true,
                    enableAtsScoreModule: true,
                    enablePortfolioModule: true,
                    enableJobTrackerModule: true,
                    enableAppliedJobsModule: true,
                    enableCoverLetterModule: true,
                    ...(state.modules || {}),
                },
            });
        }

        return enterprise(route);
    });
}

/** Collects unexpected console errors and failed API responses. */
export function watchForDefects(page) {
    const pageErrors = [];
    const badResponses = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('response', (r) => {
        const { pathname } = new URL(r.url());
        if (pathname.startsWith('/api/') && r.status() >= 400) {
            badResponses.push(`${r.status()} ${pathname}`);
        }
    });
    return { pageErrors, badResponses };
}

export const isUnexpectedJsError = (errors) =>
    errors.filter((e) => /TypeError|ReferenceError|Unhandled/i.test(e));
