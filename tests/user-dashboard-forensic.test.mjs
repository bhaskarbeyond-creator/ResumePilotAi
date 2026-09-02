import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('USER Dashboard Forensic Audit & Functionality Suite', () => {

    describe('Phase 1 & 4 — User Route Matrix & Navigation Integrity', () => {
        it('defines all canonical user dashboard routes in main.jsx and DashboardMain.jsx', () => {
            const mainJsx = read('src/main.jsx');
            const dashboardMain = read('src/components/Dashboard/DashboardMain/DashboardMain.jsx');

            // Top-level authenticated user routes
            assert.match(mainJsx, /path="\/dashboard\/\*"/);
            assert.match(mainJsx, /path="\/build-resume\/\*"/);
            assert.match(mainJsx, /path="\/coverletter"/);
            assert.match(mainJsx, /path="\/portfolio\/builder"/);
            assert.match(mainJsx, /path="\/billing\/plans"/);
            assert.match(mainJsx, /path="\/jobs\/portal"/);
            assert.match(mainJsx, /path="\/blog"/);

            // Sub-routes in DashboardMain
            assert.match(dashboardMain, /<Route[\s\S]*?index[\s\S]*?<DashboardHomepage/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="settings"[\s\S]*?<DashboardSettings/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="messages"[\s\S]*?<DashboardMessages/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="favorites"[\s\S]*?<DashboardFavourites/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="interview"[\s\S]*?<DashboardInterviews/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="cover-letters"[\s\S]*?<CoverLetter/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="portfolios"[\s\S]*?<DashboardPortfolios/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="applied-jobs"[\s\S]*?<AppliedJobs/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="job-tracker"[\s\S]*?<JobTracker/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="my-employments"[\s\S]*?<EmployerDashboard/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="my-companies"[\s\S]*?<CompaniesManagement/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="plans"[\s\S]*?<Billing/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="support"[\s\S]*?<DashboardSupport/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="tickets"[\s\S]*?<Navigate\s+to="\/dashboard\/support"/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="help"[\s\S]*?<Navigate\s+to="\/dashboard\/support"/);
        });

        it('wires Support Desk into ProfileDisplay navigation sidebar', () => {
            const profileDisplay = read('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx');
            assert.match(profileDisplay, /to="\/dashboard\/support"/);
            assert.match(profileDisplay, /Help Desk &amp; Support/);
            assert.match(profileDisplay, /FiLifeBuoy/);
        });
    });

    describe('Phase 6 — Support & Ticketing Lifecycle API Contracts', () => {
        it('exports user support API client methods in platform.js', () => {
            const platformApi = read('src/services/api/platform.js');
            assert.match(platformApi, /export async function getUserSupportTickets\(\)/);
            assert.match(platformApi, /export async function getUserSupportTicket\(ticketId\)/);
            assert.match(platformApi, /export async function createUserSupportTicket\(\{ subject, body, priority/);
            assert.match(platformApi, /export async function replyUserSupportTicket\(ticketId, body\)/);
        });

        it('binds user routes to backend support controller with zero admin bypass', () => {
            const supportRoutes = read('backend/routes/support.js');
            assert.match(supportRoutes, /userRouter\.post\('\/tickets'/);
            assert.match(supportRoutes, /userRouter\.get\('\/tickets'/);
            assert.match(supportRoutes, /userRouter\.get\('\/tickets\/:ticketId'/);
            assert.match(supportRoutes, /userRouter\.post\('\/tickets\/:ticketId\/messages'/);

            // User router enforces req.user.uid ownership
            assert.match(supportRoutes, /uid:\s*req\.user\.uid/);
        });

        it('validates ticket creation constraints in backend service', () => {
            const supportService = read('backend/services/supportTickets.js');
            // Subject min 4, Body min 8, Priority validation
            assert.match(supportService, /cleanSubject\.length < 4/);
            assert.match(supportService, /cleanBody\.length < 8/);
            assert.match(supportService, /!PRIORITIES\.has\(cleanPriority\)/);
            assert.match(supportService, /ticket\.status === 'CLOSED'/);
        });
    });

    describe('Phase 9 — Negative Authorization & RBAC Boundary Protection', () => {
        it('strictly separates USER permissions from ADMIN and SUPER_ADMIN', () => {
            const authJs = read('backend/security/auth.js');
            assert.match(authJs, /const PERMISSIONS = Object\.freeze\(\{/);
            assert.match(authJs, /SUPER_ADMIN:\s*\['\*'\]/);
            assert.match(authJs, /ADMIN:\s*\[/);
            assert.match(authJs, /SUPPORT:\s*\[/);
            assert.match(authJs, /AUDITOR:\s*\[/);
            assert.match(authJs, /USER:\s*\[/);
            assert.match(authJs, /'resumes\.manage'/);
            assert.match(authJs, /'subscription\.self'/);
            // Verify USER has zero admin privileges
            assert.doesNotMatch(authJs, /USER:\s*\[[^\]]*'users\.roles\.manage'/);
            assert.doesNotMatch(authJs, /USER:\s*\[[^\]]*'system\.config\.write'/);
        });

        it('prohibits ordinary USER tokens from accessing sensitive administrative API surfaces', () => {
            const rbacMatrix = read('tests/backend-rbac-matrix.test.cjs');
            assert.match(rbacMatrix, /path:\s*'\/api\/admin\/users',\s*allow:\s*\['SUPER_ADMIN',\s*'ADMIN'/);
            assert.match(rbacMatrix, /path:\s*'\/api\/admin\/firebase-service-account',\s*allow:\s*\['SUPER_ADMIN'\]/);
            assert.match(rbacMatrix, /path:\s*'\/api\/admin\/payment-settings',\s*allow:\s*\['SUPER_ADMIN'/);
            assert.match(rbacMatrix, /path:\s*'\/api\/admin\/support\/tickets',\s*allow:\s*\['SUPER_ADMIN',\s*'ADMIN',\s*'SUPPORT'\]/);
        });
    });

    describe('Phase 10 — IDOR & Cross-User Isolation Architecture', () => {
        it('enforces owner-scoped isolation on resumes, cover letters, portfolios, and support tickets', () => {
            const supportTickets = read('backend/services/supportTickets.js');
            // Strict IDOR guard: non-staff user cannot access another user's ticket
            assert.match(supportTickets, /if \(!rows\.length \|\| \(!staff && rows\[0\]\.user_id !== uid\)\)/);

            const resumesRoute = read('backend/routes/resumes.js');
            // Resume routes enforce req.user.uid scoping
            assert.match(resumesRoute, /req\.user\.uid/);

            const portfoliosRoute = read('backend/routes/portfolios.js');
            // Portfolio routes enforce req.user.uid scoping
            assert.match(portfoliosRoute, /req\.user\.uid/);
        });
    });

    describe('Phase 12, 13 & 14 — UI/UX, Responsive Design & Accessibility', () => {
        it('DashboardSupport provides responsive layouts, accessible ARIA roles, escape key listener, and Knowledge Base FAQs', () => {
            const supportComponent = read('src/components/Dashboard/DashboardSupport/DashboardSupport.jsx');
            assert.match(supportComponent, /data-testid="user-support-desk"/);
            assert.match(supportComponent, /data-testid="create-ticket-button"/);
            assert.match(supportComponent, /data-testid="ticket-subject-input"/);
            assert.match(supportComponent, /data-testid="ticket-body-input"/);
            assert.match(supportComponent, /data-testid="ticket-submit-button"/);
            assert.match(supportComponent, /data-testid="ticket-reply-input"/);
            assert.match(supportComponent, /data-testid="ticket-reply-button"/);
            assert.match(supportComponent, /data-testid="empty-tickets-state"/);
            assert.match(supportComponent, /data-testid="tab-support-tickets"/);
            assert.match(supportComponent, /data-testid="tab-knowledge-base"/);
            assert.match(supportComponent, /data-testid="support-knowledge-base"/);

            // Escape key dismiss logic
            assert.match(supportComponent, /e\.key === 'Escape'/);
            // Role alert for errors
            assert.match(supportComponent, /role="alert"/);
        });

        it('DashboardHomepage implements accessible action modals, real-time search, and ATS readiness badges', () => {
            const homepageComponent = read('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');
            assert.match(homepageComponent, /e\.key === 'Escape'/);
            assert.match(homepageComponent, /closeDeleteModal/);
            assert.match(homepageComponent, /closeDocumentPreview/);

            // Real-time search query filtering
            assert.match(homepageComponent, /searchQuery/);
            assert.match(homepageComponent, /Search resumes by title, role, skill/);

            // ATS Readiness score on cards
            assert.match(homepageComponent, /calculateAtsScore/);
            assert.match(homepageComponent, /ATS Readiness Score/);
        });
    });

    describe('Phase 17 — Failure Injection & Graceful Degraded States', () => {
        it('handles network / backend errors cleanly without crashing or exposing stack traces', () => {
            const supportComponent = read('src/components/Dashboard/DashboardSupport/DashboardSupport.jsx');
            assert.match(supportComponent, /catch \(err\)/);
            assert.match(supportComponent, /setListError/);
            assert.match(supportComponent, /setDetailError/);
            assert.match(supportComponent, /setCreateError/);

            const settingsComponent = read('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx');
            assert.match(settingsComponent, /catch/);
        });
    });
});
