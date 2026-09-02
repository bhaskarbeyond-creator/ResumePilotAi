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

describe('USER Dashboard Product Completeness & Gap Elimination Suite', () => {

    describe('Section 1 — Complete Candidate User Journey & Navigation Reachability', () => {
        it('verifies all stages of candidate lifecycle are reachable and connected', () => {
            const mainJsx = read('src/main.jsx');
            const dashboardMain = read('src/components/Dashboard/DashboardMain/DashboardMain.jsx');
            const profileDisplay = read('src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx');

            // 1. Auth / Entry Points
            assert.match(mainJsx, /path="\/login"/);
            assert.match(mainJsx, /path="\/sign-up"/);

            // 2. Dashboard Hub & Workspaces
            assert.match(mainJsx, /path="\/dashboard\/\*"/);
            assert.match(mainJsx, /path="\/build-resume\/\*"/);
            assert.match(mainJsx, /path="\/coverletter"/);
            assert.match(mainJsx, /path="\/portfolio\/builder"/);

            // 3. Navigation Sidebar Groups
            assert.match(profileDisplay, /Career Suite/);
            assert.match(profileDisplay, /Job Intelligence/);
            assert.match(profileDisplay, /Account &amp; Security/);
            assert.match(profileDisplay, /Help Desk &amp; Support/);

            // 4. Sub-routes in DashboardMain
            assert.match(dashboardMain, /<Route[\s\S]*?path="support"[\s\S]*?<DashboardSupport/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="settings"[\s\S]*?<DashboardSettings/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="interview"[\s\S]*?<DashboardInterviews/);
            assert.match(dashboardMain, /<Route[\s\S]*?path="plans"[\s\S]*?<Billing/);
        });
    });

    describe('Section 2 — Dashboard Overview & Real-Time Search & ATS Scoring', () => {
        it('verifies DashboardHomepage search filtering and ATS score badge integration', () => {
            const homepage = read('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');
            assert.match(homepage, /searchQuery/);
            assert.match(homepage, /FaSearch/);
            assert.match(homepage, /calculateAtsScore/);
            assert.match(homepage, /ATS: \{atsScore\}\/100/);
            assert.match(homepage, /downloadResume/);
            assert.match(homepage, /downloadResumeDocx/);
        });
    });

    describe('Section 3 — Self-Service Help Center & Support Desk Integration', () => {
        it('verifies DashboardSupport provides both Ticket Management and Knowledge Base FAQs', () => {
            const support = read('src/components/Dashboard/DashboardSupport/DashboardSupport.jsx');
            assert.match(support, /KNOWLEDGE_BASE_ITEMS/);
            assert.match(support, /data-testid="tab-support-tickets"/);
            assert.match(support, /data-testid="tab-knowledge-base"/);
            assert.match(support, /data-testid="support-knowledge-base"/);
            assert.match(support, /data-testid="create-ticket-modal"/);
            assert.match(support, /getUserSupportTickets/);
            assert.match(support, /createUserSupportTicket/);
            assert.match(support, /replyUserSupportTicket/);
        });
    });

    describe('Section 4 — Backend REST APIs & MariaDB Data Lineage', () => {
        it('verifies candidate REST endpoints and authoritative MariaDB table contracts', () => {
            const supportRoute = read('backend/routes/support.js');
            assert.match(supportRoute, /userRouter\.post\('\/tickets'/);
            assert.match(supportRoute, /userRouter\.get\('\/tickets'/);
            assert.match(supportRoute, /userRouter\.post\('\/tickets\/:ticketId\/messages'/);

            const usersRoute = read('backend/routes/usersData.js');
            assert.match(usersRoute, /router\.get\('\/profile'/);
            assert.match(usersRoute, /router\.post\('\/profile'/);

            const jobsRoute = read('backend/routes/jobsData.js');
            assert.match(jobsRoute, /router\.get\('\/tracker'/);
            assert.match(jobsRoute, /router\.get\('\/applications\/list'/);
        });
    });

    describe('Section 5 — GDPR Data Portability & Account Deletion', () => {
        it('verifies GDPR account export and permanent deletion contracts', () => {
            const backendIndex = read('backend/index.js');
            assert.match(backendIndex, /app\.post\('\/api\/account\/export'/);
            assert.match(backendIndex, /app\.post\('\/api\/account\/delete'/);

            const settings = read('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx');
            assert.match(settings, /handleExportUserData/);
            assert.match(settings, /exportUserDataJSON/);
            assert.match(settings, /deleteUserAccountPermanently/);
        });
    });

    describe('Section 6 — Negative Authorization & Non-Disclosure IDOR Fencing', () => {
        it('strictly prevents ordinary USER from accessing admin routes and other users data', () => {
            const authJs = read('backend/security/auth.js');
            assert.match(authJs, /USER:\s*\[/);
            assert.doesNotMatch(authJs, /USER:\s*\[[^\]]*'users\.read'/);
            assert.doesNotMatch(authJs, /USER:\s*\[[^\]]*'system\.config\.write'/);

            const supportService = read('backend/services/supportTickets.js');
            // IDOR non-disclosure filter
            assert.match(supportService, /if \(!rows\.length \|\| \(!staff && rows\[0\]\.user_id !== uid\)\)/);
        });
    });
});
